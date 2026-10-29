import { getCourses } from '../scraper/courses.js';

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'curso', 'cursos', 'para', 'que', 'un', 'una', 'sobre']);

// Distancia de edición acotada para tolerar faltas ortográficas ("pyton", "arduno", "redez").
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const fuzzyIncludes = (words, term) =>
  words.some((w) => w.includes(term) || (term.length >= 4 && editDistance(w, term) <= (term.length >= 7 ? 2 : 1)));

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Última fecha de un texto como "Del 01 de octubre de 2026 al 15 de octubre de 2026" o "Del 19 de mayo al 04 de junio de 2025". */
export function parseEndDate(text) {
  if (!text) return null;
  const t = normalize(text).replace('setiembre', 'septiembre');
  const year = [...t.matchAll(/\b(20\d{2})\b/g)].at(-1)?.[1];
  const day = [...t.matchAll(/(\d{1,2}) de ([a-z]+)/g)].filter((m) => MONTHS.includes(m[2])).at(-1);
  if (!year || !day) return null;
  return new Date(Date.UTC(Number(year), MONTHS.indexOf(day[2]), Number(day[1]), 23, 59));
}

/** El estado "abierto" de la web no siempre coincide con las fechas: se calcula con la fecha real. */
export function registrationStatus(c, now = new Date()) {
  if (c.status !== 'abierto') return 'cerrada';
  const end = parseEndDate(c.details?.['Fechas de inscripciones']);
  if (!end) return 'abierta (confirmar fechas)';
  return end >= now ? 'abierta' : 'vencida';
}

export function courseSummary(c) {
  return {
    id: c.id,
    nombre: c.name,
    estado: c.status,
    inscripcion: registrationStatus(c),
    horas: c.hours,
    modalidad: c.details?.['Modalidad'] ?? null,
    inscripciones: c.details?.['Fechas de inscripciones'] ?? null,
    fecha_curso: c.details?.['Fecha del curso'] ?? null,
    url: c.url,
  };
}

export function searchCourses({ consulta = '', estado = 'todos' } = {}) {
  const terms = normalize(consulta)
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  let courses = getCourses();
  if (estado === 'abierto' || estado === 'cerrado') courses = courses.filter((c) => c.status === estado);
  if (!terms.length) return courses.map(courseSummary);

  return courses
    .map((c) => {
      const name = normalize(c.name).split(/[^a-z0-9+#]+/);
      const body = normalize([c.description, ...(c.objectives ?? []), ...(c.contents ?? [])].join(' ')).split(/[^a-z0-9+#]+/);
      const score = terms.reduce((s, t) => s + (fuzzyIncludes(name, t) ? 3 : 0) + (fuzzyIncludes(body, t) ? 1 : 0), 0);
      return { c, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.c.status === 'abierto' ? -1 : 1))
    .slice(0, 6)
    .map((r) => courseSummary(r.c));
}

export function getCourse({ id }) {
  const c = getCourses().find((course) => course.id === Number(id));
  if (!c) return { error: `No existe un curso con id ${id}` };
  const registration = registrationStatus(c);
  // Solo los títulos de unidades/módulos: el detalle anidado duplica texto y gasta tokens.
  const units = (c.contents ?? []).filter((x) => /^(unidad|m[oó]dulo)/i.test(x));
  return {
    id: c.id,
    nombre: c.name,
    estado: c.status,
    estado_inscripcion: registration,
    aviso:
      registration === 'vencida'
        ? 'La inscripción de esta edición YA CERRÓ: dilo, no compartas el enlace y recomienda el curso con inscripción abierta más afín. No transfieras a un asesor por esto.'
        : undefined,
    horas: c.hours,
    descripcion: c.description,
    objetivos: c.objectives,
    lugar: c.location,
    instructores: c.instructors,
    detalles: c.details,
    notas: c.notes,
    materiales: c.materials,
    contenidos: (units.length ? units : (c.contents ?? []).slice(0, 12)).map((x) => (x.length > 180 ? `${x.slice(0, 180)}…` : x)),
    url: c.url,
    inscripcion: registration === 'abierta' || registration.startsWith('abierta (') ? (c.registrationUrl ?? `${c.url}#inscripcion`) : null,
  };
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'buscar_cursos',
      description:
        'Busca cursos del CTT-FISEI por tema o nombre. Devuelve un resumen (id, nombre, estado, horas, fechas). Sin consulta devuelve todo el catálogo.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'Palabras clave, p. ej. "python", "redes", "arduino"' },
          estado: { type: 'string', enum: ['abierto', 'cerrado', 'todos'], description: 'Filtrar por estado' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_curso',
      description:
        'Devuelve toda la información de un curso: descripción, objetivos, precios, fechas, horario, cupos, modalidad, requisitos, materiales, contenidos, instructores y enlace de inscripción.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer', description: 'id del curso' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferir_a_asesor',
      description:
        'Pausa la IA y deriva la conversación a una persona del CTT. No la uses solo porque un curso esté cerrado o vencido. Úsala únicamente cuando el usuario pida hablar con alguien, pida descuentos, becas, convenios o formas de pago especiales, tenga un reclamo, una duda académica que no está en los datos (tipo "docente"), o esté listo para inscribirse y necesite ayuda con el pago.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo breve para el operador' },
          tipo: { type: 'string', enum: ['asesor', 'docente'], description: 'asesor comercial o docente del curso' },
        },
        required: ['motivo'],
        additionalProperties: false,
      },
    },
  },
];

export function transferToAdvisor({ motivo, tipo = 'asesor' }) {
  if (!motivo) return { error: 'Indica el motivo de la transferencia' };
  return { ok: true, handover: { motivo, tipo }, instruccion: 'Avísale al usuario que un asesor humano continuará por este mismo chat.' };
}

export const TOOL_HANDLERS = {
  buscar_cursos: searchCourses,
  ver_curso: getCourse,
  transferir_a_asesor: transferToAdvisor,
};
