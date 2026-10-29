FROM node:24-slim

# Chromium para whatsapp-web.js (puppeteer usa el del sistema)
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    DB_PATH=/app/storage/agente.db \
    WWEBJS_DATA_PATH=/app/storage/wwebjs

WORKDIR /app
COPY package*.json .puppeteerrc.cjs ./
RUN npm ci --omit=dev
COPY src ./src
COPY data/courses.json ./data/courses.json

EXPOSE 3000
CMD ["node", "src/index.js"]
