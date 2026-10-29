import OpenAI, { toFile } from 'openai';

/** Transcribe notas de voz con un endpoint compatible con OpenAI (/audio/transcriptions). */
export class Transcriber {
  constructor({ apiKey, baseURL, model }) {
    this.client = new OpenAI({ apiKey, baseURL, timeout: 60_000 });
    this.model = model;
  }

  async transcribeUrl(url, filename = 'audio.ogg') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el audio (HTTP ${res.status})`);
    const file = await toFile(Buffer.from(await res.arrayBuffer()), filename.replace(/\.oga$/, '.ogg'));
    return this.transcribe(file);
  }

  async transcribe(file) {
    const result = await this.client.audio.transcriptions.create({ file, model: this.model, language: 'es' });
    return result.text?.trim() ?? '';
  }
}
