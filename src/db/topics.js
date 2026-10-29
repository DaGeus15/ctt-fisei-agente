// Clasificación ligera por palabras clave para agrupar las preguntas en el dashboard.
const TOPICS = [
  ['inscripcion', /inscrib|inscripci|registr|matricul|formulario|cupo/],
  ['precio', /precio|costo|cuesta|valor|pago|pagar|\$|dolar|gratis|descuento/],
  ['fechas', /fecha|cu[aá]ndo|inicia|empieza|termina|horario|hora[s]? de clase|d[ií]as/],
  ['contenido', /contenido|temario|tema|unidad|aprend|ense[ñn]a|s[ií]labo|objetivo/],
  ['requisitos', /requisit|necesito|conocimiento|previo|material|equipo|computador|laptop/],
  ['modalidad', /modalidad|presencial|virtual|online|en l[ií]nea|lugar|d[oó]nde|ubicaci/],
  ['certificado', /certifica|t[ií]tulo|diploma|aval/],
  ['instructor', /instructor|profesor|docente|qui[eé]n dicta|imparte/],
  ['catalogo', /curso|oferta|disponible|abiert|qu[eé] tienen|lista/],
  ['saludo', /^(hola|buen[oa]s|hey|saludos|gracias|ok|vale|chao|adi[oó]s)\b/],
];

export function classifyTopic(text) {
  const normalized = text.toLowerCase().trim();
  for (const [topic, pattern] of TOPICS) {
    if (pattern.test(normalized)) return topic;
  }
  return 'otro';
}

export const TOPIC_LABELS = {
  inscripcion: 'Inscripción',
  precio: 'Precios',
  fechas: 'Fechas y horarios',
  contenido: 'Contenidos',
  requisitos: 'Requisitos y materiales',
  modalidad: 'Modalidad y lugar',
  certificado: 'Certificación',
  instructor: 'Instructores',
  catalogo: 'Oferta de cursos',
  saludo: 'Saludos',
  otro: 'Otros',
};
