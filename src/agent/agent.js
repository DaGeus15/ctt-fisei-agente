import OpenAI from 'openai';
import { config } from '../config.js';
import { buildSystemPrompt } from './prompt.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';

const MAX_STEPS = 5;
const FALLBACK =
  'Lo siento, en este momento no puedo responder. Escríbenos a talleresfisei@uta.edu.ec o ctt.fisei@uta.edu.ec y te ayudaremos.';

export function createLlmClient() {
  return new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseURL, timeout: 60_000, maxRetries: 2 });
}

/**
 * Agente de atención: recibe un mensaje de un canal, consulta el historial,
 * ejecuta el ciclo de herramientas del LLM y registra todo en el store.
 */
export class CourseAgent {
  constructor({ store, client = createLlmClient(), model = config.llm.model }) {
    this.store = store;
    this.client = client;
    this.model = model;
  }

  async reply({ channel, externalId, name, text }) {
    const userId = this.store.upsertUser({ channel, externalId, name });
    const history = this.store.getHistory(userId);
    this.store.addMessage({ userId, channel, role: 'user', content: text });

    const started = Date.now();
    try {
      const { answer, courses, usage } = await this.run(channel, history, text);
      this.store.addMessage({
        userId,
        channel,
        role: 'assistant',
        content: answer,
        courses,
        latencyMs: Date.now() - started,
        tokensIn: usage.in,
        tokensOut: usage.out,
      });
      return answer;
    } catch (err) {
      console.error(`[agent] ${err.message}`);
      this.store.addMessage({
        userId,
        channel,
        role: 'assistant',
        content: FALLBACK,
        latencyMs: Date.now() - started,
        error: err.message,
      });
      return FALLBACK;
    }
  }

  resetConversation({ channel, externalId, name }) {
    const userId = this.store.upsertUser({ channel, externalId, name });
    this.store.resetSession(userId);
  }

  async run(channel, history, text) {
    const messages = [
      { role: 'system', content: buildSystemPrompt(channel) },
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];
    const courses = new Set();
    const usage = { in: 0, out: 0 };

    for (let step = 0; step < MAX_STEPS; step++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: TOOL_DEFINITIONS,
        temperature: 0.3,
      });
      usage.in += completion.usage?.prompt_tokens ?? 0;
      usage.out += completion.usage?.completion_tokens ?? 0;

      const message = completion.choices[0].message;
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        const answer = message.content?.trim();
        if (!answer) throw new Error('Respuesta vacía del modelo');
        return { answer, courses: [...courses], usage };
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const result = this.runTool(call, courses);
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
