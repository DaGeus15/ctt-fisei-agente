import { Bot, InlineKeyboard } from 'grammy';
import { WELCOME, RESET_DONE, openCourses, splitMessage } from './common.js';

const CHANNEL = 'telegram';
const MAX_LENGTH = 4000;

const userOf = (ctx) => ({
  channel: CHANNEL,
  externalId: ctx.from.id,
  name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username,
});

function coursesKeyboard() {
  const keyboard = new InlineKeyboard();
  for (const c of openCourses()) keyboard.text(c.name.slice(0, 60), `curso:${c.id}`).row();
  return keyboard;
}

async function answer(ctx, agent, text) {
  await ctx.replyWithChatAction('typing');
  const typing = setInterval(() => ctx.replyWithChatAction('typing').catch(() => {}), 4500);
  try {
    const reply = await agent.reply({ ...userOf(ctx), text });
    for (const part of splitMessage(reply, MAX_LENGTH)) {
      await ctx.reply(part, { link_preview_options: { is_disabled: true } });
    }
  } finally {
    clearInterval(typing);
  }
}

export function createTelegramBot({ token, agent }) {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    agent.resetConversation(userOf(ctx));
    await ctx.reply(WELCOME);
    await ctx.reply('Estos son los cursos con inscripciones abiertas:', { reply_markup: coursesKeyboard() });
  });

  bot.command('cursos', (ctx) =>
    ctx.reply('Cursos con inscripciones abiertas. Toca uno para ver su información:', {
      reply_markup: coursesKeyboard(),
    }),
  );

  bot.command('reiniciar', async (ctx) => {
    agent.resetConversation(userOf(ctx));
    await ctx.reply(RESET_DONE);
  });

  bot.command('ayuda', (ctx) =>
    ctx.reply(
      'Comandos:\n/cursos - ver cursos abiertos\n/reiniciar - empezar una conversación nueva\n\n' +
        'También puedes escribir tu pregunta directamente.',
    ),
  );

  bot.callbackQuery(/^curso:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const course = openCourses().find((c) => c.id === Number(ctx.match[1]));
    if (!course) return ctx.reply('Ese curso ya no está disponible. Usa /cursos para ver la oferta actual.');
    await answer(ctx, agent, `Quiero información del curso "${course.name}" (id ${course.id}).`);
  });

  bot.on('message:text', (ctx) => answer(ctx, agent, ctx.message.text));

  bot.on('message', (ctx) => ctx.reply('Por ahora solo puedo leer mensajes de texto. ¿Qué te gustaría saber de los cursos?'));

  bot.catch((err) => console.error(`[telegram] ${err.error?.message ?? err.message}`));

  return {
    async start() {
      await bot.api.setMyCommands([
        { command: 'cursos', description: 'Ver cursos abiertos' },
        { command: 'reiniciar', description: 'Empezar una conversación nueva' },
        { command: 'ayuda', description: 'Cómo usar el asistente' },
      ]);
      const me = await bot.api.getMe();
      bot.start({ drop_pending_updates: true }).catch((e) => console.error(`[telegram] ${e.message}`));
      console.log(`[telegram] Bot activo: https://t.me/${me.username}`);
      return me;
    },
    stop: () => bot.stop(),
  };
}
