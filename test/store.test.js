import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/db/store.js';
import * as analytics from '../src/db/analytics.js';
import { classifyTopic } from '../src/db/topics.js';

test('classifyTopic agrupa preguntas frecuentes', () => {
  assert.equal(classifyTopic('¿Cuánto cuesta el curso de Python?'), 'precio');
  assert.equal(classifyTopic('Como me inscribo?'), 'inscripcion');
  assert.equal(classifyTopic('¿Cuándo inicia Linux?'), 'fechas');
  assert.equal(classifyTopic('Hola'), 'saludo');
  assert.equal(classifyTopic('xyz'), 'otro');
});

test('Store guarda historial por sesión y calcula métricas', () => {
  const store = new Store(':memory:');
  const t = (min) => new Date(Date.UTC(2026, 9, 29, 15, min)).toISOString();
  const tg = store.upsertUser({ channel: 'telegram', externalId: 1, name: 'Ana' }, t(0));
  const wa = store.upsertUser({ channel: 'whatsapp', externalId: '593@c.us' }, t(0));

  store.addMessage({ userId: tg, channel: 'telegram', role: 'user', content: '¿Precio de Python?', createdAt: t(1) });
  store.addMessage({ userId: tg, channel: 'telegram', role: 'assistant', content: '$40', courses: [18], latencyMs: 800, createdAt: t(2) });
  store.addMessage({ userId: wa, channel: 'whatsapp', role: 'user', content: 'Hola', createdAt: t(3) });
  store.addMessage({ userId: wa, channel: 'whatsapp', role: 'assistant', content: 'Hola!', latencyMs: 400, createdAt: t(4) });

  assert.deepEqual(store.getHistory(tg).map((m) => m.role), ['user', 'assistant']);
  store.resetSession(tg, t(5));
  assert.equal(store.getHistory(tg).length, 0);

  const s = analytics.summary(store.db);
  assert.equal(s.questions, 2);
  assert.equal(s.users, 2);
  assert.equal(s.conversations, 2);
  assert.equal(s.avgLatencyMs, 600);
  assert.equal(analytics.summary(store.db, { channel: 'whatsapp' }).questions, 1);
  assert.deepEqual({ ...analytics.topCourses(store.db)[0] }, { course_id: 18, mentions: 1, users: 1 });
  assert.equal(analytics.byTopic(store.db).find((r) => r.topic === 'precio').questions, 1);
  assert.equal(analytics.recentConversations(store.db).length, 2);
  assert.equal(analytics.conversation(store.db, tg)[1].courses[0], 18);
  store.close();
});
