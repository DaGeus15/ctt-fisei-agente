import OpenAI from 'openai';
import { config } from '../config.js';
import { buildSystemPrompt } from './prompt.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';
import { checkOutput, securityNote, SAFE_REPLY } from '../core/guard.js';

const MAX_STEPS = 5;
const FALLBACK =
  'Uy, se me complicó responder en este momento 🙏. Escríbenos a talleresfisei@uta.edu.ec o ctt.fisei@uta.edu.ec y te ayudamos enseguida.';

/** Quita el razonamiento que algunos modelos devuelven dentro del contenido. */
export const stripThinking = (text) => String(text).replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

/** Ajusta el Markdown que algunos modelos generan igual al formato de cada canal. */
export function formatForChannel(text, channel) {
  let out = stripThinking(text).replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '• ');
  out = channel === 'whatsapp' ? out.replace(/\*\*(.+?)\*\*/g, '*$1*') : out.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
  return out.trim();
}

export function createLlmClient() {
  // Sin clave el cliente igual se crea: las llamadas fallan y el agente usa la respuesta de respaldo.
  return new OpenAI({ apiKey: config.llm.apiKey || 'sin-configurar', baseURL: config.llm.baseURL, timeout: 60_000, maxRetries: 0 });
}

/**
 * Llama al primer modelo de la lista y pasa al siguiente si se alcanza el límite
 * de tokens (429). En proveedores con límite por modelo, multiplica la capacidad.
 */
export async function complete(client, models, request, reasoningEffort = config.llm.reasoningEffort) {
  let lastError;
  // Dos vueltas: si todos los modelos están sin cupo, se espera un momento y se reintenta.
  for (const [i, model] of [...models, ...models].entries()) {
    if (i === models.length) await new Promise((r) => setTimeout(r, 3000));
    const body = { ...request, model };
    // Groq: gpt-oss acepta low/medium/high; en qwen3 se desactiva el razonamiento para ahorrar tokens.
    if (reasoningEffort && /gpt-oss/i.test(model)) body.reasoning_effort = reasoningEffort;
    if (reasoningEffort && /qwen3/i.test(model)) body.reasoning_effort = 'none';
    try {
      return await client.chat.completions.create(body);
    } catch (err) {
      lastError = err;
      if (err?.status !== 429 && !(err?.status >= 500)) throw err;
      console.warn(`[llm] ${model} sin cupo (429), probando el siguiente modelo`);
    }
  }
  throw lastError;
}

/**
 * Pipeline de inferencia: arma el contexto (prompt + resumen + historial
 * acotado), ejecuta el ciclo de herramientas y valida la respuesta.
 * No persiste nada: eso lo hace ConversationService.
 */
export class CourseAgent {
  constructor({ client = createLlmClient(), models = config.llm.models } = {}) {
    this.client = client;
    this.models = models;
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
      const completion = await complete(this.client, this.models, {
        messages,
        tools: TOOL_DEFINITIONS,
        temperature: 0.5,
        max_tokens: 1200,
      });
      usage.in += completion.usage?.prompt_tokens ?? 0;
      usage.out += completion.usage?.completion_tokens ?? 0;

      const message = completion.choices[0].message;
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        const answer = message.content && formatForChannel(message.content, input.channel);
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
