import { bus } from './events.js';
import { inspectInput, RISK_REPLY } from './guard.js';

export const HANDOVER_REPLY =
  'Entiendo, te comunico con un asesor del CTT-FISEI 🙌. En unos momentos te escribirá por este mismo chat.';

const MAX_INPUT_CHARS = 1500;

/**
 * Orquesta cada conversación: persiste los mensajes, decide si responde la IA
 * o un operador humano (handover), ejecuta el análisis del prospecto y
 * publica los cambios en el bus de eventos para el dashboard.
 */
export class ConversationService {
  constructor({ store, agent, analyzer = null, handoverTimeoutMin = 15 }) {
    this.store = store;
    this.agent = agent;
    this.analyzer = analyzer;
    this.handoverTimeoutMs = handoverTimeoutMin * 60_000;
    this.senders = new Map();
  }

  /** Cada conector registra cómo enviar texto a un usuario de su canal. */
  registerChannel(channel, sendText) {
    this.senders.set(channel, sendText);
  }

  emitConversation(userId) {
    bus.emit('conversation', this.store.getConversation(userId));
  }

  record(message) {
    const saved = this.store.addMessage(message);
    bus.emit('message', saved);
    return saved;
  }

  /**
   * Procesa un mensaje entrante. Devuelve los textos que el canal debe enviar
   * (vacío cuando la conversación está a cargo de un operador).
   */
  async handleIncoming({ channel, externalId, name, text }) {
    const userId = this.store.upsertUser({ channel, externalId, name });
    const content = text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}…` : text;
    const flags = inspectInput(content);
    const history = this.store.getHistory(userId);
    this.record({ userId, channel, role: 'user', content, flags });
    if (flags.includes('inyeccion') || flags.includes('descuento_indebido')) {
      this.store.addEvent(userId, 'intento_manipulacion', flags.join(','));
    }

    if (flags.includes('riesgo')) {
      // Prioridad sobre cualquier modo: contención inmediata y aviso urgente al operador.
      this.store.addEvent(userId, 'riesgo', 'Posible riesgo para la persona');
      this.setMode(userId, 'human', 'URGENTE: posible riesgo para la persona', 'frustrado');
      this.record({ userId, channel, role: 'assistant', content: RISK_REPLY });
      return [RISK_REPLY];
    }

    let conversation = this.store.getConversation(userId);
    if (conversation.mode === 'human' && this.handoverExpired(userId)) {
      conversation = this.setMode(userId, 'ai', 'Sin respuesta del operador: la IA retoma la conversación');
    }
    if (conversation.mode === 'human') {
      this.emitConversation(userId);
      return [];
    }

    if (flags.includes('pide_humano') || flags.includes('frustracion')) {
      const reason = flags.includes('pide_humano') ? 'El usuario pidió hablar con una persona' : 'Frustración detectada';
      this.setMode(userId, 'human', reason, flags.includes('frustracion') ? 'frustrado' : undefined);
      this.record({ userId, channel, role: 'assistant', content: HANDOVER_REPLY });
      this.analyze(userId);
      return [HANDOVER_REPLY];
    }

    const started = Date.now();
    try {
      const result = await this.agent.respond({
        channel,
        history,
        text: content,
        flags,
        summary: conversation.summary,
        profile: conversation.profile,
      });
      this.record({
        userId,
        channel,
        role: 'assistant',
        content: result.answer,
        courses: result.courses,
        latencyMs: Date.now() - started,
        tokensIn: result.usage.in,
        tokensOut: result.usage.out,
        flags: result.blocked ? ['respuesta_bloqueada'] : [],
      });
      if (result.handover) {
        this.setMode(userId, 'human', `${result.handover.tipo === 'docente' ? 'Docente' : 'Asesor'}: ${result.handover.motivo}`);
      }
      this.analyze(userId);
      return [result.answer];
    } catch (err) {
      console.error(`[agent] ${err.message}`);
      const fallback = this.agent.fallback;
      this.record({ userId, channel, role: 'assistant', content: fallback, latencyMs: Date.now() - started, error: err.message });
      return [fallback];
    }
  }

  handoverExpired(userId) {
    if (!this.handoverTimeoutMs) return false;
    const last = this.store.db
      .prepare(
        `SELECT MAX(created_at) AS at FROM (
           SELECT created_at FROM messages WHERE user_id = ? AND role = 'operator'
           UNION ALL SELECT created_at FROM events WHERE user_id = ? AND type IN ('handover', 'operador_toma'))`,
      )
      .get(userId, userId).at;
    return !last || Date.now() - Date.parse(last) > this.handoverTimeoutMs;
  }

  /** Cambia entre IA y operador humano; `state` opcional actualiza el termómetro. */
  setMode(userId, mode, reason = null, state) {
    const before = this.store.getConversation(userId);
    const conversation = this.store.updateConversation(userId, {
      mode,
      state,
      handover_reason: mode === 'human' ? reason : null,
    });
    if (before.mode !== mode) {
      this.store.addEvent(userId, mode === 'human' ? 'handover' : 'ia_reanudada', reason);
      bus.emit('message', {
        id: `evt-${Date.now()}`,
        user_id: userId,
        role: 'system',
        content: mode === 'human' ? `IA en pausa · ${reason ?? 'intervención del operador'}` : `IA reanudada${reason ? ` · ${reason}` : ''}`,
        created_at: new Date().toISOString(),
      });
    }
    bus.emit('conversation', conversation);
    return conversation;
  }

  /** Mensaje del operador: se envía con la identidad del bot y pausa la IA. */
  async sendOperatorMessage(userId, text) {
    const conversation = this.store.getConversation(userId);
    if (!conversation) throw new Error('Conversación no encontrada');
    const send = this.senders.get(conversation.channel);
    if (!send) throw new Error(`El canal ${conversation.channel} no está conectado`);
    if (conversation.mode !== 'human') this.setMode(userId, 'human', 'Intervención del operador');
    await send(conversation.external_id, text);
    this.store.updateConversation(userId, { unread: 0 });
    return this.record({ userId, channel: conversation.channel, role: 'operator', content: text });
  }

  markRead(userId) {
    this.store.updateConversation(userId, { unread: 0 });
    this.emitConversation(userId);
  }

  reset({ channel, externalId, name }) {
    const userId = this.store.upsertUser({ channel, externalId, name });
    this.store.resetSession(userId);
    this.emitConversation(userId);
  }

  /** Termómetro, perfil y resumen del prospecto; corre en segundo plano para no sumar latencia. */
  analyze(userId) {
    if (!this.analyzer) return;
    const history = this.store.getHistory(userId, { limit: 12, maxChars: 5000 });
    const conversation = this.store.getConversation(userId);
    this.analyzer
      .analyze({ history, previous: conversation })
      .then((result) => {
        if (!result) return;
        const updated = this.store.updateConversation(userId, {
          state: result.estado,
          summary: result.resumen,
          profile: { ...conversation.profile, ...result.perfil },
        });
        if (result.estado === 'lead_caliente' && conversation.state !== 'lead_caliente') {
          this.store.addEvent(userId, 'lead_caliente', result.resumen);
        }
        if (result.estado === 'frustrado' && updated.mode === 'ai') {
          this.setMode(userId, 'human', 'Frustración detectada por el análisis semántico');
        } else {
          bus.emit('conversation', updated);
        }
      })
      .catch((err) => console.warn(`[analyzer] ${err.message}`));
  }
}
