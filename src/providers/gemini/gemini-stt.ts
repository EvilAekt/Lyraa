/**
 * Gemini STT Provider Implementation
 * Leverages Google Gen AI Multimodal Audio understanding for accurate, low-latency transcription.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { pcmToWav } from '../../audio/wav-helper.js';
import { config } from '../../config/index.js';
import { SttOptions, SttProvider, SttResult } from '../stt-provider.js';

export interface GeminiSttConfig {
  apiKey: string;
  model: string;
}

export class GeminiSttProvider implements SttProvider {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(cfg: GeminiSttConfig) {
    if (!cfg.apiKey) {
      throw new Error('[GeminiSttProvider] API key is required.');
    }
    if (!cfg.model) {
      throw new Error('[GeminiSttProvider] Model name is required.');
    }

    this.client = new GoogleGenAI({ apiKey: cfg.apiKey });
    this.modelName = cfg.model;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public async transcribe(audioBuffer: Buffer, options: SttOptions): Promise<SttResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? config.TIMEOUT_STT_MS;

    // Convert raw PCM to standard WAV if not already in WAV format
    let wavBuffer: Buffer;
    if (audioBuffer.length >= 4 && audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF') {
      wavBuffer = audioBuffer;
    } else {
      wavBuffer = pcmToWav(
        audioBuffer,
        options.sampleRate ?? 48000,
        options.channels ?? 1,
        16
      );
    }

    // PRD SEC-10: Ephemeral Audio — Raw audio is NEVER stored to disk unless running explicitly in DEBUG_SAVE_AUDIO=true mode.
    if (config.DEBUG_SAVE_AUDIO) {
      try {
        const debugDir = path.join(process.cwd(), 'debug_audio');
        await fs.mkdir(debugDir, { recursive: true });
        const debugFile = path.join(debugDir, `stt-${options.userId}-${Date.now()}.wav`);
        await fs.writeFile(debugFile, wavBuffer);
        console.log(`[GeminiSttProvider] Saved debug audio to ${debugFile}`);
      } catch (err: any) {
        console.warn(`[GeminiSttProvider] Failed to save debug audio: ${err.message}`);
      }
    }

    const base64Audio = wavBuffer.toString('base64');

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[GeminiSttProvider] STT timeout exceeded (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    const transcribePromise = (async () => {
      const response = await this.client.models.generateContent({
        model: this.modelName,
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
                text:
                  'Transcribe the following speech exactly as spoken word-for-word in Indonesian or English. ' +
                  'Output ONLY the transcribed text without quotation marks, markdown, or extra explanations. ' +
                  'If the audio is silent or unintelligible noise, output an empty string.',
              },
            ],
          },
        ],
        config: {
          temperature: 0.1,
        },
      });

      const rawText = response.text || '';
      const cleanedText = rawText.trim().replace(/^["']|["']$/g, '');
      const durationMs = Date.now() - startTime;

      return {
        text: cleanedText,
        userId: options.userId,
        timestamp: Date.now(),
        durationMs,
        language: options.language ?? 'id',
      };
    })();

    return await Promise.race([transcribePromise, timeoutPromise]);
  }
}
