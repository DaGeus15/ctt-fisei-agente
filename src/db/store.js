import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { classifyTopic } from './topics.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  session_started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  topic TEXT,
  courses TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`;

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  upsertUser({ channel, externalId, name }, now = new Date().toISOString()) {
    const id = `${channel}:${externalId}`;
    this.db
      .prepare(
        `INSERT INTO users (id, channel, external_id, name, first_seen, last_seen, session_started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
           name = COALESCE(excluded.name, users.name)`,
      )
      .run(id, channel, String(externalId), name ?? null, now, now, now);
    return id;
  }

  /** Inicia una conversación nueva: el historial previo deja de enviarse al LLM. */
  resetSession(userId, now = new Date().toISOString()) {
    this.db.prepare('UPDATE users SET session_started_at = ? WHERE id = ?').run(now, userId);
  }

  addMessage({ userId, channel, role, content, courses = [], latencyMs, tokensIn, tokensOut, error, createdAt }) {
    const topic = role === 'user' ? classifyTopic(content) : null;
    const result = this.db
      .prepare(
        `INSERT INTO messages (user_id, channel, role, content, topic, courses, latency_ms, tokens_in, tokens_out, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        channel,
        role,
        content,
        topic,
        JSON.stringify(courses),
        latencyMs ?? null,
        tokensIn ?? null,
        tokensOut ?? null,
        error ?? null,
        createdAt ?? new Date().toISOString(),
      );
    return Number(result.lastInsertRowid);
  }

  /** Últimos mensajes de la sesión actual, en orden cronológico. */
  getHistory(userId, limit = 12) {
    return this.db
      .prepare(
        `SELECT role, content FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.user_id = ? AND m.created_at >= u.session_started_at AND m.error IS NULL
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(userId, limit)
      .reverse();
  }

  close() {
    this.db.close();
  }
}
