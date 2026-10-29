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
    analyzerModel: env.LLM_ANALYZER_MODEL || env.LLM_MODEL || 'grok-4-fast-non-reasoning',
  },
  stt: {
    apiKey: env.STT_API_KEY ?? '',
    baseURL: env.STT_BASE_URL || 'https://api.groq.com/openai/v1',
    model: env.STT_MODEL || 'whisper-large-v3-turbo',
  },
  handoverTimeoutMin: Number(env.HANDOVER_TIMEOUT_MIN ?? 15),
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN ?? '',
  },
  whatsapp: {
    enabled: env.WHATSAPP_ENABLED === 'true',
    chromePath: env.CHROME_PATH || undefined,
    dataPath: env.WWEBJS_DATA_PATH || '.wwebjs_auth',
  },
  dashboard: {
    port: Number(env.PORT || env.DASHBOARD_PORT || 3000),
    user: env.DASHBOARD_USER || 'admin',
    password: env.DASHBOARD_PASSWORD ?? '',
  },
  dbPath: env.DB_PATH || 'data/agente.db',
  coursesRefreshHours: Number(env.COURSES_REFRESH_HOURS || 6),
  coursesUrl: 'https://ctt-talleresfisei.uta.edu.ec/',
};
