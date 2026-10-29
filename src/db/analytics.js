// Consultas agregadas para el dashboard. `since` es una fecha ISO (o null para todo).

const where = (since, channel, alias = 'm') => {
  const clauses = [];
  const params = [];
  if (since) {
    clauses.push(`${alias}.created_at >= ?`);
    params.push(since);
  }
  if (channel) {
    clauses.push(`${alias}.channel = ?`);
    params.push(channel);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
};

export function summary(db, { since, channel } = {}) {
  const w = where(since, channel);
  const row = db
    .prepare(
      `SELECT
         SUM(role = 'user') AS questions,
         SUM(role = 'assistant' AND error IS NULL) AS answers,
         SUM(error IS NOT NULL) AS errors,
         COUNT(DISTINCT user_id) AS users,
         ROUND(AVG(CASE WHEN role = 'assistant' AND error IS NULL THEN latency_ms END)) AS avg_latency_ms,
         SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) AS tokens
       FROM messages m ${w.sql}`,
    )
    .get(...w.params);
  const conversations = conversationsCount(db, { since, channel });
  return {
    questions: row.questions ?? 0,
    answers: row.answers ?? 0,
    errors: row.errors ?? 0,
    users: row.users ?? 0,
    conversations,
    avgLatencyMs: row.avg_latency_ms ?? null,
    tokens: row.tokens ?? 0,
  };
}

// Una conversación = mensajes de un usuario separados por menos de 30 minutos.
function conversationsCount(db, { since, channel }) {
  const w = where(since, channel);
  const rows = db
    .prepare(`SELECT user_id, created_at FROM messages m ${w.sql} ORDER BY user_id, created_at`)
    .all(...w.params);
  let count = 0;
  let lastUser = null;
  let lastTime = 0;
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (r.user_id !== lastUser || t - lastTime > 30 * 60_000) count++;
    lastUser = r.user_id;
    lastTime = t;
  }
  return count;
}

export function byChannel(db, { since } = {}) {
  const w = where(since, null);
  return db
    .prepare(
      `SELECT channel, SUM(role = 'user') AS questions, COUNT(DISTINCT user_id) AS users
       FROM messages m ${w.sql} GROUP BY channel ORDER BY questions DESC`,
    )
    .all(...w.params);
}

export function byDay(db, { since, channel } = {}) {
  const w = where(since, channel);
  return db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, channel, SUM(role = 'user') AS questions
       FROM messages m ${w.sql} GROUP BY day, channel ORDER BY day`,
    )
    .all(...w.params);
}

export function byHour(db, { since, channel } = {}) {
  const w = where(since, channel);
  const rows = db
    .prepare(
      `SELECT CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS questions
       FROM messages m ${w.sql ? `${w.sql} AND` : 'WHERE'} role = 'user' GROUP BY hour`,
    )
    .all(...w.params);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, questions: 0 }));
  for (const r of rows) hours[r.hour].questions = r.questions;
  return hours;
}

export function byTopic(db, { since, channel } = {}) {
  const w = where(since, channel);
  return db
    .prepare(
      `SELECT topic, COUNT(*) AS questions FROM messages m
       ${w.sql ? `${w.sql} AND` : 'WHERE'} role = 'user' GROUP BY topic ORDER BY questions DESC`,
    )
    .all(...w.params);
}

export function topCourses(db, { since, channel, limit = 10 } = {}) {
  const w = where(since, channel);
  return db
    .prepare(
      `SELECT CAST(j.value AS INTEGER) AS course_id, COUNT(*) AS mentions, COUNT(DISTINCT m.user_id) AS users
       FROM messages m, json_each(m.courses) j
       ${w.sql ? `${w.sql} AND` : 'WHERE'} m.role = 'assistant'
       GROUP BY course_id ORDER BY mentions DESC LIMIT ?`,
    )
    .all(...w.params, limit);
}

export function recentConversations(db, { since, channel, limit = 50 } = {}) {
  const w = where(since, channel);
  return db
    .prepare(
      `SELECT u.id AS user_id, u.channel, u.name, u.external_id,
              COUNT(*) AS messages, SUM(m.role = 'user') AS questions,
              MAX(m.created_at) AS last_at, MIN(m.created_at) AS first_at,
              (SELECT content FROM messages x WHERE x.user_id = u.id AND x.role = 'user'
                 ORDER BY x.id DESC LIMIT 1) AS last_question
       FROM messages m JOIN users u ON u.id = m.user_id ${w.sql}
       GROUP BY u.id ORDER BY last_at DESC LIMIT ?`,
    )
    .all(...w.params, limit);
}

export function conversation(db, userId, limit = 200) {
  return db
    .prepare(
      `SELECT id, role, content, topic, courses, latency_ms, error, created_at
       FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, limit)
    .reverse()
    .map((m) => ({ ...m, courses: JSON.parse(m.courses) }));
}
