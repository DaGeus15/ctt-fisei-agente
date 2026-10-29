import { config } from './config.js';
import { initCourses } from './scraper/courses.js';
import { Store } from './db/store.js';
import { CourseAgent } from './agent/agent.js';
import { createTelegramBot } from './channels/telegram.js';
import { createWhatsAppClient } from './channels/whatsapp.js';
import { createDashboard } from './dashboard/server.js';

const courses = await initCourses();
console.log(`[cursos] ${courses.courses.length} cursos cargados (${courses.updatedAt})`);

const store = new Store(config.dbPath);
if (!config.llm.apiKey) console.warn('[agent] Falta LLM_API_KEY: el agente responderá con el mensaje de respaldo.');
const agent = new CourseAgent({ store });

let telegramInfo = null;
let telegram = null;
if (config.telegram.token) {
  telegram = createTelegramBot({ token: config.telegram.token, agent });
  try {
    telegramInfo = await telegram.start();
  } catch (err) {
    console.error(`[telegram] No se pudo iniciar: ${err.message}`);
  }
} else {
  console.warn('[telegram] TELEGRAM_BOT_TOKEN no configurado; canal deshabilitado.');
}

let whatsapp = null;
if (config.whatsapp.enabled) {
  whatsapp = createWhatsAppClient({ agent, chromePath: config.whatsapp.chromePath });
  whatsapp.start().catch((err) => console.error(`[whatsapp] No se pudo iniciar: ${err.message}`));
} else {
  console.warn('[whatsapp] WHATSAPP_ENABLED=false; canal deshabilitado.');
}

const app = createDashboard({
  store,
  auth: config.dashboard,
  telegramInfo: () => (telegramInfo ? { username: telegramInfo.username } : null),
});
const server = app.listen(config.dashboard.port, () => {
  console.log(`[dashboard] http://localhost:${config.dashboard.port}`);
  if (!config.dashboard.password) console.warn('[dashboard] Sin DASHBOARD_PASSWORD: el dashboard es público.');
});

async function shutdown() {
  console.log('Cerrando...');
  server.close();
  await Promise.allSettled([telegram?.stop(), whatsapp?.stop()]);
  store.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
