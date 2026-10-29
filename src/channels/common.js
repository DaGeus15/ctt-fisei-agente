import { getCourses } from '../scraper/courses.js';
import { registrationStatus, isOfferable } from '../agent/tools.js';

export const WELCOME =
  '¡Hola! Soy el asistente virtual del CTT-FISEI de la Universidad Técnica de Ambato. ' +
  'Puedo ayudarte con información de nuestros cursos: precios, fechas, horarios, contenidos, requisitos e inscripción.\n\n' +
  'Escríbeme tu pregunta, por ejemplo: "¿Cuánto cuesta el curso de Python?" o "¿Qué cursos están abiertos?".';

export const RESET_DONE = 'Listo, empecemos una conversación nueva. ¿En qué te puedo ayudar?';

// Solo cursos cuya fecha de inscripción sigue vigente (la etiqueta "ABIERTO" de la web no basta).
export const openCourses = () => getCourses().filter((c) => isOfferable(registrationStatus(c)));

/** Divide un texto largo en partes que respeten el límite del canal. */
export function splitMessage(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}
