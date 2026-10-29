import { getCourses } from '../scraper/courses.js';

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'curso', 'cursos', 'para', 'que', 'un', 'una', 'sobre']);

export function courseSummary(c) {
  return {
    id: c.id,
    nombre: c.name,
    estado: c.status,
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
      const name = normalize(c.name);
      const body = normalize([c.description, ...(c.objectives ?? []), ...(c.contents ?? [])].join(' '));
      const score = terms.reduce((s, t) => s + (name.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
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
  return {
    id: c.id,
    nombre: c.name,
    estado: c.status,
    horas: c.hours,
    descripcion: c.description,
    objetivos: c.objectives,
    lugar: c.location,
    instructores: c.instructors,
    detalles: c.details,
    notas: c.notes,
    materiales: c.materials,
    contenidos: c.contents,
    url: c.url,
    inscripcion: c.registrationUrl ?? (c.status === 'abierto' ? `${c.url}#inscripcion` : null),
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
];

export const TOOL_HANDLERS = {
  buscar_cursos: searchCourses,
  ver_curso: getCourse,
};
