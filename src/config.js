// Carga .env (si existe) y expone la configuración de la aplicación.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan solo las variables del entorno.
}

const env = process.env;

export const config = {
  llm: {
    apiKey: env.LLM_API_KEY ?? '',
    baseURL: env.LLM_BASE_URL || 'https://api.x.ai/v1',
    model: env.LLM_MODEL || 'grok-4-fast-non-reasoning',
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN ?? '',
  },
  whatsapp: {
    enabled: env.WHATSAPP_ENABLED === 'true',
    chromePath: env.CHROME_PATH || undefined,
  },
  dashboard: {
    port: Number(env.DASHBOARD_PORT || 3000),
    user: env.DASHBOARD_USER || 'admin',
    password: env.DASHBOARD_PASSWORD ?? '',
  },
  dbPath: env.DB_PATH || 'data/agente.db',
  coursesRefreshHours: Number(env.COURSES_REFRESH_HOURS || 6),
  coursesUrl: 'https://ctt-talleresfisei.uta.edu.ec/',
};
