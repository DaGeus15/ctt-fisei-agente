import { EventEmitter } from 'node:events';

/**
 * Bus de eventos en memoria entre el pipeline de conversación y el dashboard (SSE).
 * Eventos: `message` (mensaje nuevo), `conversation` (cambio de estado o modo), `status` (canales).
 */
export const bus = new EventEmitter();
bus.setMaxListeners(200);
