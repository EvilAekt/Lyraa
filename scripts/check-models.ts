import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/index.js';

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

async function main() {
  const list = await ai.models.list();
  const found = [];
  for await (const m of list) {
    found.push({
      name: m.name,
      displayName: m.displayName,
      inputTokenLimit: m.inputTokenLimit,
    });
  }
  console.log(JSON.stringify(found, null, 2));
}

main().catch(console.error);
