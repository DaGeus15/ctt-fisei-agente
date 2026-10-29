import { config } from '../config.js';
import { createLlmClient } from './agent.js';
import { STATES } from '../db/store.js';

const PROMPT = `Analizas chats entre un prospecto y el asistente de cursos del CTT-FISEI.
Devuelve SOLO un JSON con esta forma:
{"estado": "interesado|dudoso|frustrado|lead_caliente",
 "perfil": {"tipo": "estudiante_uta|graduado_uta|publico|desconocido", "curso_interes": "nombre o null", "meta": "texto corto o null"},
 "resumen": "máximo 2 frases para el operador humano: qué busca, objeciones y siguiente paso sugerido"}
Criterios del estado:
- lead_caliente: quiere inscribirse, pidió el enlace o confirma que se inscribirá.
- interesado: hace preguntas concretas sobre un curso con intención positiva.
- dudoso: duda por precio, tiempo, nivel o compara opciones.
- frustrado: molestia, quejas, repite preguntas sin obtener respuesta o pide un humano con enojo.`;

/** Clasifica el estado del prospecto (termómetro), su perfil y un resumen para el operador. */
export class ProspectAnalyzer {
  constructor({ client = createLlmClient(), model = config.llm.analyzerModel } = {}) {
    this.client = client;
    this.model = model;
  }

  async analyze({ history }) {
    if (!history.length) return null;
    const transcript = history
      .map((m) => `${m.role === 'user' ? 'Prospecto' : 'Asistente'}: ${m.content.slice(0, 600)}`)
      .join('\n');
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: transcript },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 250,
    });
    return parseAnalysis(completion.choices[0].message.content);
  }
}

export function parseAnalysis(raw) {
  const json = JSON.parse(String(raw).replace(/^```(json)?|```$/g, '').trim());
  const estado = STATES.includes(json.estado) ? json.estado : 'interesado';
  const perfil = Object.fromEntries(
    Object.entries(json.perfil ?? {}).filter(([, v]) => v != null && v !== 'null' && v !== 'desconocido'),
  );
  return { estado, perfil, resumen: typeof json.resumen === 'string' ? json.resumen.slice(0, 400) : null };
}
