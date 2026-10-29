import { createLlmClient } from './agent.js';
import { config } from '../config.js';

const client = createLlmClient();
console.log(`Modelos disponibles en ${config.llm.baseURL}:`);
for await (const m of client.models.list()) console.log(`- ${m.id}`);
