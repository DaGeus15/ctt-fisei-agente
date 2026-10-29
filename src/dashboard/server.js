import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as analytics from '../db/analytics.js';
import { TOPIC_LABELS } from '../db/topics.js';
import { getCourses, getCoursesUpdatedAt, refreshCourses } from '../scraper/courses.js';
import { whatsappState } from '../channels/whatsapp.js';

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Autenticación HTTP básica; se desactiva si no hay contraseña configurada. */
function basicAuth({ user, password }) {
  return (req, res, next) => {
    if (!password) return next();
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, ...p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (safeEqual(u, user) && safeEqual(p.join(':'), password)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Dashboard CTT-FISEI"').status(401).send('Autenticación requerida');
  };
}

const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

function filters(req) {
  const days = RANGES[req.query.range];
  const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null;
  const channel = ['telegram', 'whatsapp'].includes(req.query.channel) ? req.query.channel : null;
  return { since, channel };
}

export function createDashboard({ store, auth, telegramInfo }) {
  const app = express();
  const db = store.db;
  app.disable('x-powered-by');
  app.use(basicAuth(auth));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));

  app.get('/api/overview', (req, res) => {
    const f = filters(req);
    const names = new Map(getCourses().map((c) => [c.id, c.name]));
    res.json({
      summary: analytics.summary(db, f),
      byChannel: analytics.byChannel(db, f),
      byDay: analytics.byDay(db, f),
      byHour: analytics.byHour(db, f),
      byTopic: analytics.byTopic(db, f).map((t) => ({ ...t, label: TOPIC_LABELS[t.topic] ?? t.topic })),
      topCourses: analytics.topCourses(db, f).map((c) => ({ ...c, name: names.get(c.course_id) ?? `Curso ${c.course_id}` })),
    });
  });

  app.get('/api/conversations', (req, res) => {
    res.json(analytics.recentConversations(db, filters(req)));
  });

  app.get('/api/conversations/:userId', (req, res) => {
    res.json(analytics.conversation(db, req.params.userId));
  });

  app.get('/api/status', (_req, res) => {
    const courses = getCourses();
    res.json({
      telegram: telegramInfo(),
      whatsapp: whatsappState,
      courses: {
        total: courses.length,
        open: courses.filter((c) => c.status === 'abierto').length,
        updatedAt: getCoursesUpdatedAt(),
      },
    });
  });

  app.post('/api/courses/refresh', async (_req, res) => {
    try {
      const data = await refreshCourses();
      res.json({ total: data.courses.length, updatedAt: data.updatedAt });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return app;
}
