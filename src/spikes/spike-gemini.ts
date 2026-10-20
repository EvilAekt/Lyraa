/**
 * T0.5 Spike Gemini
 * 
 * Objective: Verify Google Gen AI SDK (@google/genai) for:
 * 1. Streaming text generation with low Time-To-First-Token (TTFT)
 * 2. Multimodal vision parsing
 * 3. Audio / Speech capabilities
 */

import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';

console.log('=== T0.5 Spike Gemini Initialization ===');

if (config.GEMINI_API_KEY === 'dummy_key_for_scaffold') {
  console.log('[Spike Gemini] Please set GEMINI_API_KEY in .env to run this spike against Google AI Studio.');
  process.exit(0);
}

const ai = new GoogleGenAI({
  apiKey: config.GEMINI_API_KEY,
});

async function runGeminiSpike() {
  try {
    console.log(`[Spike Gemini] Testing streaming generation with model: ${config.LLM_MODEL}...`);
    const start = Date.now();
    let firstTokenTime = 0;
    let fullText = '';

    const stream = await ai.models.generateContentStream({
      model: config.LLM_MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Halo! Kenalkan dirimu dalam satu kalimat singkat untuk Discord voice.' }] }],
      config: {
        maxOutputTokens: 60,
      },
    });

    for await (const chunk of stream) {
      if (!firstTokenTime) {
        firstTokenTime = Date.now() - start;
      }
      const text = chunk.text || '';
      fullText += text;
      process.stdout.write(text);
    }

    const totalTime = Date.now() - start;
    console.log('\n----------------------------------------');
    console.log(`[Spike Gemini] Time to First Token (TTFT): ${firstTokenTime}ms`);
    console.log(`[Spike Gemini] Total Stream Duration: ${totalTime}ms`);
    console.log('----------------------------------------');
  } catch (error: any) {
    console.error('[Spike Gemini] Error during generation:', error.message);
  }
}

runGeminiSpike();
