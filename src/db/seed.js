// Genera interacciones de ejemplo para probar el dashboard sin usuarios reales.
// Uso: npm run seed [-- --db data/demo.db]
import { readFileSync } from 'node:fs';
import { Store } from './store.js';
import { config } from '../config.js';

const dbArg = process.argv.indexOf('--db');
const store = new Store(dbArg > -1 ? process.argv[dbArg + 1] : config.dbPath);
const { courses } = JSON.parse(readFileSync('data/courses.json', 'utf8'));
const open = courses.filter((c) => c.status === 'abierto');

const QUESTIONS = [
  ['¿Cuánto cuesta el curso de {c}?', 'El curso {c} cuesta $40 para estudiantes UTA, $50 para graduados y $60 para público en general.'],
  ['¿Cuándo inicia {c}?', 'Las clases de {c} inician según el calendario publicado en la web del CTT.'],
  ['¿Cómo me inscribo en {c}?', 'Puedes inscribirte en {c} desde el formulario de inscripción de la página del curso.'],
  ['¿Qué temas ve {c}?', 'El curso {c} cubre los contenidos detallados por unidades en su página.'],
  ['¿Es presencial o virtual {c}?', '{c} es presencial en los talleres de la FISEI, Campus Huachi.'],
  ['¿Dan certificado en {c}?', 'Sí, se entrega certificado digital con validación QR emitido por FISEI-UTA.'],
  ['¿Qué necesito saber antes de {c}?', 'Para {c} se recomiendan conocimientos básicos de informática.'],
];
const GREETINGS = ['Hola', 'Buenas tardes', '¿Qué cursos tienen disponibles?'];
const NAMES = ['Andrea', 'Luis', 'María', 'Carlos', 'Daniela', 'Jorge', 'Paola', 'Diego', null];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const now = Date.now();

let total = 0;
for (let u = 0; u < 60; u++) {
  const channel = Math.random() < 0.55 ? 'whatsapp' : 'telegram';
  const externalId = channel === 'whatsapp' ? `5939${String(10000000 + rand(89999999))}@c.us` : 100000 + rand(899999);
  let t = now - rand(14) * 86400_000 - rand(10 * 3600_000);
  const userId = store.upsertUser({ channel, externalId, name: pick(NAMES) }, new Date(t).toISOString());
  const say = (role, content, extra = {}) => {
    store.addMessage({ userId, channel, role, content, createdAt: new Date(t).toISOString(), ...extra });
    t += 20_000 + rand(90_000);
    total++;
  };

  say('user', pick(GREETINGS));
  say('assistant', 'Hola, soy el asistente del CTT-FISEI. Estos son los cursos abiertos...', {
    courses: open.slice(0, 4).map((c) => c.id),
    latencyMs: 700 + rand(1500),
    tokensIn: 1800,
    tokensOut: 180,
  });
  for (let q = 0; q < 1 + rand(4); q++) {
    const course = pick(open);
    const [question, answer] = pick(QUESTIONS);
    say('user', question.replace('{c}', course.name));
    say('assistant', answer.replace('{c}', course.name), {
      courses: [course.id],
      latencyMs: 900 + rand(2500),
      tokensIn: 2500 + rand(1500),
      tokensOut: 120 + rand(200),
    });
  }
}
store.close();
console.log(`${total} mensajes de ejemplo creados`);
