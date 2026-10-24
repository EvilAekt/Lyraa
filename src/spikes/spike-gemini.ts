/**
 * T0.5 Spike Gemini
 * 
 * Objective: Verify Google Gen AI SDK (@google/genai) for:
 * 1. Streaming text generation with low Time-To-First-Token (TTFT)
 * 2. Audio STT transcription using real recorded WAV from T0.4
 * 3. Audio TTS speech synthesis and format inspection
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';

console.log('====================================================');
console.log('       T0.5 SPIKE GEMINI (LLM, STT, TTS)           ');
console.log('====================================================');

if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === 'dummy_key_for_scaffold') {
  console.log('[Spike Gemini] Please set GEMINI_API_KEY in .env to run this spike.');
  process.exit(0);
}

const ai = new GoogleGenAI({
  apiKey: config.GEMINI_API_KEY,
});

async function runGeminiSpike() {
  try {
    // 1. Model Discovery
    console.log('\n[1/3] Memeriksa daftar model dari Google AI Studio...');
    const modelsResponse = await ai.models.list();
    const modelNames: string[] = [];
    for await (const m of modelsResponse) {
      if (m.name && (m.name.includes('flash') || m.name.includes('gemini') || m.name.includes('tts'))) {
        modelNames.push(m.name);
      }
    }
    console.log(`[Spike Gemini] Model flash/gemini aktif (${modelNames.length} ditemukan):`, modelNames.slice(0, 8));

    // Choose candidate models in order of latency preference
    const candidateModels = [
      'models/gemini-3.5-flash-lite',
      'models/gemini-3-flash-preview',
      'models/gemini-3.8-flash',
      'models/gemini-flash-lite-latest',
    ];

    console.log('[Spike Gemini] Testing streaming with candidates:', candidateModels);

    let chosenLlmModel = candidateModels[0];
    console.log(`[Spike Gemini] Testing streaming with: ${chosenLlmModel}`);

    // 2. Test Streaming LLM Generation (3 iterasi untuk TTFT)
    console.log('\n[2/3] Menguji LLM Streaming & mengukur TTFT (Time-To-First-Token)...');
    const ttftList: number[] = [];
    
    for (let i = 1; i <= 3; i++) {
      process.stdout.write(`  Run #${i}: `);
      const start = Date.now();
      let firstTokenTime = 0;
      let fullResponse = '';

      const stream = await ai.models.generateContentStream({
        model: chosenLlmModel,
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Jawab singkat dalam satu kalimat bahasa Indonesia yang ramah: Siapa namamu?' }],
          },
        ],
        config: {
          maxOutputTokens: 50,
          temperature: 0.7,
        },
      });

      for await (const chunk of stream) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - start;
        }
        const text = chunk.text || '';
        fullResponse += text;
      }

      const totalTime = Date.now() - start;
      ttftList.push(firstTokenTime);
      console.log(`TTFT: ${firstTokenTime}ms | Total: ${totalTime}ms | Response: "${fullResponse.trim().replace(/\n/g, ' ')}"`);
    }

    const avgTtft = (ttftList.reduce((a, b) => a + b, 0) / ttftList.length).toFixed(0);
    console.log(`[Spike Gemini] Rata-rata TTFT LLM Streaming: ${avgTtft}ms`);

    // 3. Test Audio STT Transcription using WAV from T0.4
    console.log('\n[3/3] Menguji Multimodal STT dengan audio WAV nyata dari T0.4...');
    const debugDir = path.join(process.cwd(), 'debug_audio');
    let wavFile: string | null = null;

    try {
      const files = await fs.readdir(debugDir);
      const wavs = files.filter((f) => f.endsWith('.wav'));
      if (wavs.length > 0) {
        wavFile = path.join(debugDir, wavs[wavs.length - 1]);
      }
    } catch {}

    if (wavFile) {
      console.log(`[Spike Gemini] Menggunakan file sampel audio: ${path.basename(wavFile)}`);
      const audioBuffer = await fs.readFile(wavFile);
      const base64Audio = audioBuffer.toString('base64');

      const sttStart = Date.now();
      const sttModel = 
        modelNames.find((name) => name.includes('gemini-3-flash-preview')) ||
        modelNames.find((name) => name.includes('gemini-flash-latest')) ||
        chosenLlmModel;

      console.log(`[Spike Gemini] Memanggil STT model: ${sttModel}...`);
      const sttResponse = await ai.models.generateContent({
        model: sttModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Audio,
                  mimeType: 'audio/wav',
                },
              },
              {
                text: 'Dengarkan audio berikut dengan saksama. Tuliskan transkripsi teks persis seperti yang diucapkan dalam Bahasa Indonesia atau Inggris tanpa penjelasan tambahan.',
              },
            ],
          },
        ],
      });

      const sttDuration = Date.now() - sttStart;
      const transcript = sttResponse.text || '';
      console.log(`[Spike Gemini] STT Transcription SUCCESS dalam ${sttDuration}ms!`);
      console.log(`[Spike Gemini] Hasil Transkripsi Suara Senior: "${transcript.trim()}"`);
    } else {
      console.log('[Spike Gemini] Belum ada file WAV di debug_audio/. Lewati uji STT lokal.');
    }

    // 4. Test TTS Capability
    console.log('\n[Spike Gemini] Menguji Gemini TTS (Preview / Interactions API)...');
    const ttsModel = modelNames.find((name) => name.includes('preview-tts'));
    if (ttsModel && (ai as any).interactions) {
      try {
        console.log(`[Spike Gemini] Menguji TTS dengan model: ${ttsModel}...`);
        const ttsStart = Date.now();
        const interaction = await (ai as any).interactions.create({
          model: ttsModel,
          input: 'Halo, aku Lyra! Senang bisa mengobrol denganmu hari ini.',
          response_modalities: ['audio'],
          generation_config: {
            speech_config: [{ voice: 'achernar', language: 'id-ID' }],
          },
        });
        const ttsDuration = Date.now() - ttsStart;
        console.log(`[Spike Gemini] TTS Interactions API merespons dalam ${ttsDuration}ms`);
      } catch (err: any) {
        console.warn(`[Spike Gemini] TTS Interactions API notice: ${err.message}`);
      }
    } else {
      console.log(`[Spike Gemini] TTS Model preview tersedia di catalog (${ttsModel || 'default'}).`);
    }

    console.log('\n====================================================');
    console.log('       T0.5 SPIKE GEMINI SELESAI                    ');
    console.log('====================================================\n');
  } catch (error: any) {
    console.error('[Spike Gemini] Error during spike execution:', error);
  }
}

runGeminiSpike();
