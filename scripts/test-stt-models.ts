import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/index.js';

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

async function testModel(modelName: string) {
  const wavPath = path.join(process.cwd(), 'debug_audio', 'spike-dave-1792532723045.wav');
  const buffer = await fs.readFile(wavPath);
  const base64Audio = buffer.toString('base64');

  console.log(`\nTesting STT with model: ${modelName}...`);
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: base64Audio,
              },
            },
            {
              text: 'Transkripsikan audio ini secara persis ke dalam teks bahasa Indonesia. Berikan HANYA teks transkrip tanpa tambahan komentar apa pun.',
            },
          ],
        },
      ],
    });
    console.log(`[SUCCESS] ${modelName} in ${Date.now() - start}ms: "${response.text?.trim()}"`);
  } catch (err: any) {
    console.error(`[FAILED] ${modelName}:`, err.message);
  }
}

async function main() {
  const candidates = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
  ];
  for (const m of candidates) {
    await testModel(m);
  }
}

main().catch(console.error);
