import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../src/db/store.js';
import { CourseAgent } from '../src/agent/agent.js';
import { setCoursesForTest } from '../src/scraper/courses.js';
import { parseCourse } from '../src/scraper/parse.js';
import { searchCourses, getCourse } from '../src/agent/tools.js';

const base = 'https://ctt-talleresfisei.uta.edu.ec/';
const detail = parseCourse(readFileSync(new URL('./fixtures/curso20.html', import.meta.url), 'utf8'), base);
setCoursesForTest([
  { id: 20, status: 'abierto', hours: 32, url: `${base}curso20.php`, ...detail, name: 'PREPARACIÓN ARDUINO CERTIFICATION PROGRAM' },
  { id: 1, status: 'cerrado', hours: 32, url: `${base}curso1.php`, name: 'FUNDAMENTOS DE PYTHON 1', description: 'Python' },
]);

test('searchCourses encuentra por tema ignorando tildes', () => {
  assert.equal(searchCourses({ consulta: 'electronica arduino' })[0].id, 20);
  assert.equal(searchCourses({ estado: 'cerrado' }).length, 1);
  assert.match(getCourse({ id: 20 }).inscripcion, /docs\.google\.com/);
  assert.ok(getCourse({ id: 99 }).error);
});

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (body) => {
          calls.push(structuredClone(body));
          return responses.shift();
        },
      },
    },
  };
}

test('CourseAgent ejecuta herramientas y registra la interacción', async () => {
  const store = new Store(':memory:');
  const toolCall = { id: 't1', type: 'function', function: { name: 'ver_curso', arguments: '{"id":20}' } };
  const client = fakeClient([
    { usage: { prompt_tokens: 100, completion_tokens: 10 }, choices: [{ message: { content: null, tool_calls: [toolCall] } }] },
    { usage: { prompt_tokens: 200, completion_tokens: 30 }, choices: [{ message: { content: 'Cuesta $40 para estudiantes UTA.' } }] },
  ]);
  const agent = new CourseAgent({ store, client, model: 'test' });

  const answer = await agent.reply({ channel: 'telegram', externalId: 7, name: 'Ana', text: '¿Precio de Arduino?' });
  assert.equal(answer, 'Cuesta $40 para estudiantes UTA.');
  const toolMessage = client.calls[1].messages.at(-1);
  assert.equal(toolMessage.role, 'tool');
  assert.match(toolMessage.content, /\$40,00/);

  const rows = store.db.prepare('SELECT role, courses, tokens_in, error FROM messages ORDER BY id').all();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].courses, '[20]');
  assert.equal(rows[1].tokens_in, 300);
  assert.equal(rows[1].error, null);
});

test('CourseAgent responde con mensaje de respaldo si el LLM falla', async () => {
  const store = new Store(':memory:');
  const client = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('401');
        },
      },
    },
  };
  const agent = new CourseAgent({ store, client, model: 'test' });
  const answer = await agent.reply({ channel: 'whatsapp', externalId: 'x', text: 'hola' });
  assert.match(answer, /talleresfisei@uta\.edu\.ec/);
  assert.equal(store.db.prepare('SELECT error FROM messages WHERE role = ?').get('assistant').error, '401');
});
