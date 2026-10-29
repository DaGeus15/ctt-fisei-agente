import OpenAI from 'openai';
import { config } from '../config.js';
import { buildSystemPrompt } from './prompt.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';
import { checkOutput, securityNote, SAFE_REPLY } from '../core/guard.js';

const MAX_STEPS = 5;
const FALLBACK =
  'Uy, se me complicó responder en este momento 🙏. Escríbenos a talleresfisei@uta.edu.ec o ctt.fisei@uta.edu.ec y te ayudamos enseguida.';

export function createLlmClient() {
  // Sin clave el cliente igual se crea: las llamadas fallan y el agente usa la respuesta de respaldo.
  return new OpenAI({ apiKey: config.llm.apiKey || 'sin-configurar', baseURL: config.llm.baseURL, timeout: 60_000, maxRetries: 2 });
}

/**
 * Pipeline de inferencia: arma el contexto (prompt + resumen + historial
 * acotado), ejecuta el ciclo de herramientas y valida la respuesta.
 * No persiste nada: eso lo hace ConversationService.
 */
export class CourseAgent {
  constructor({ client = createLlmClient(), model = config.llm.model } = {}) {
    this.client = client;
    this.model = model;
    this.fallback = FALLBACK;
  }

  buildMessages({ channel, history, text, flags = [], summary, profile }) {
    const context = [];
    if (summary) context.push(`Resumen de lo conversado antes: ${summary}`);
    if (profile && Object.keys(profile).length) context.push(`Perfil conocido del prospecto: ${JSON.stringify(profile)}`);
    return [
      { role: 'system', content: buildSystemPrompt(channel) },
      ...(context.length ? [{ role: 'system', content: context.join('\n') }] : []),
      // Los mensajes del operador salen con la identidad del bot, así que el modelo los ve como propios.
      ...history.map(({ role, content }) => ({ role: role === 'user' ? 'user' : 'assistant', content })),
      { role: 'user', content: text + securityNote(flags) },
    ];
  }

  async respond(input) {
    const messages = this.buildMessages(input);
    const courses = new Set();
    const usage = { in: 0, out: 0 };
    let handover = null;

    for (let step = 0; step < MAX_STEPS; step++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: TOOL_DEFINITIONS,
        temperature: 0.5,
        max_tokens: 600,
      });
      usage.in += completion.usage?.prompt_tokens ?? 0;
      usage.out += completion.usage?.completion_tokens ?? 0;

      const message = completion.choices[0].message;
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        const answer = message.content?.trim();
        if (!answer) throw new Error('Respuesta vacía del modelo');
        if (!checkOutput(answer)) return { answer: SAFE_REPLY, courses: [...courses], usage, handover, blocked: true };
        return { answer, courses: [...courses], usage, handover };
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const result = this.runTool(call, courses);
        if (call.function.name === 'transferir_a_asesor' && result.ok) handover = result.handover;
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    throw new Error('Se superó el número máximo de pasos del agente');
  }

  runTool(call, courses) {
    const handler = TOOL_HANDLERS[call.function.name];
    if (!handler) return { error: `Herramienta desconocida: ${call.function.name}` };
    let args;
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      return { error: 'Argumentos inválidos' };
    }
    const result = handler(args);
    if (call.function.name === 'ver_curso' && !result.error) courses.add(result.id);
    if (call.function.name === 'buscar_cursos' && result.length <= 3) result.forEach((c) => courses.add(c.id));
    return result;
  }
}
