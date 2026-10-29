import wwebjs from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { WELCOME, RESET_DONE, openCourses, splitMessage } from './common.js';

const { Client, LocalAuth } = wwebjs;
const CHANNEL = 'whatsapp';
const MAX_LENGTH = 3500;
const RESET_WORDS = /^(reiniciar|\/reiniciar|nueva conversaci[oó]n)$/i;
const MENU_WORDS = /^(menu|men[uú]|cursos|\/cursos|\/start|inicio)$/i;

/** Estado del canal que muestra el dashboard (incluye el QR mientras no se vincula). */
export const whatsappState = { status: 'deshabilitado', qrDataUrl: null, number: null, updatedAt: null };

const setState = (patch) => Object.assign(whatsappState, patch, { updatedAt: new Date().toISOString() });

function coursesMenu() {
  const lines = openCourses().map((c) => `• ${c.name} (${c.hours} h)`);
  return `*Cursos con inscripciones abiertas:*\n${lines.join('\n')}\n\nPregúntame por cualquiera de ellos.`;
}

export function createWhatsAppClient({ agent, chromePath }) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'ctt-fisei' }),
    puppeteer: {
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });
  const seen = new Set();

  client.on('qr', async (qr) => {
    console.log('[whatsapp] Escanea este código QR desde WhatsApp > Dispositivos vinculados:');
    qrcodeTerminal.generate(qr, { small: true });
    setState({ status: 'esperando QR', qrDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 280 }) });
  });

  client.on('authenticated', () => setState({ status: 'autenticado', qrDataUrl: null }));
  client.on('auth_failure', (msg) => setState({ status: `error de autenticación: ${msg}` }));
  client.on('ready', () => {
    setState({ status: 'conectado', qrDataUrl: null, number: client.info?.wid?.user ?? null });
    console.log(`[whatsapp] Conectado como ${whatsappState.number}`);
  });
  client.on('disconnected', (reason) => {
    setState({ status: `desconectado (${reason})` });
    console.warn(`[whatsapp] Desconectado: ${reason}`);
  });

  client.on('message', (msg) =>
    handleMessage(msg).catch((err) => console.error(`[whatsapp] ${err.message}`)),
  );

  async function handleMessage(msg) {
    // Solo chats privados de texto; se ignoran grupos, estados y mensajes repetidos.
    if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
    if (seen.has(msg.id._serialized)) return;
    seen.add(msg.id._serialized);
    if (seen.size > 5000) seen.clear();

    const contact = await msg.getContact().catch(() => null);
    const user = { channel: CHANNEL, externalId: msg.from, name: contact?.pushname || contact?.name || null };

    if (msg.type !== 'chat') {
      await msg.reply('Por ahora solo puedo leer mensajes de texto. ¿Qué te gustaría saber de los cursos?');
      return;
    }
    const text = msg.body.trim();
    if (!text) return;

    if (RESET_WORDS.test(text)) {
      agent.resetConversation(user);
      await client.sendMessage(msg.from, RESET_DONE);
      return;
    }
    if (MENU_WORDS.test(text)) {
      await client.sendMessage(msg.from, `${WELCOME}\n\n${coursesMenu()}`);
      return;
    }

    const chat = await msg.getChat();
    await chat.sendStateTyping().catch(() => {});
    const reply = await agent.reply({ ...user, text });
    await chat.clearState().catch(() => {});
    for (const part of splitMessage(reply, MAX_LENGTH)) await client.sendMessage(msg.from, part);
  }

  return {
    async start() {
      setState({ status: 'iniciando' });
      await client.initialize();
    },
    stop: () => client.destroy(),
  };
}
