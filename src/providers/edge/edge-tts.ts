/**
 * Edge TTS Provider Implementation
 * Ultra-low latency, natural voice synthesis using Microsoft Edge neural voices.
 * Outputs native WebM Opus without needing external FFmpeg.
 * Implements connection pooling, keep-alive, streaming chunks, and pre-warming (T3.2).
 */

import TextToSpeech from '@kirillasyamov/text-to-speech';
import { TtsOptions, TtsProvider } from '../tts-provider.js';
import { withRetry } from '../../audio/resilience.js';

export interface EdgeTtsConfig {
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export class EdgeTtsProvider implements TtsProvider {
  private defaultVoice: string;
  private speed: number;
  private pitch: number;
  private volume: number;
  private defaultInstance: TextToSpeech;

  constructor(cfg?: EdgeTtsConfig) {
    // id-ID-GadisNeural is a natural, warm Indonesian VTuber voice
    this.defaultVoice = cfg?.voice || 'id-ID-GadisNeural';
    this.speed = cfg?.speed || 1.12;
    this.pitch = cfg?.pitch ?? 18; // Default to playful/cute pitch (+18Hz)
    // -10% volume achieves target speech loudness of ~ -16 LUFS (-18 dBFS peak)
    this.volume = cfg?.volume ?? -10;

    // Persistent TTS instance leveraging internal EdgePool WebSocket keep-alive
    this.defaultInstance = new TextToSpeech({
      voice: this.defaultVoice,
      format: 'webm-24khz-16bit-mono-opus',
      speed: this.speed,
      pitch: this.pitch,
      volume: this.volume,
      warm: true,
    });
  }

  public getVoiceName(): string {
    return this.defaultVoice;
  }

  public getStreamType(): string {
    return 'webm/opus';
  }

  /**
   * Pre-warms the Edge WebSocket pool so the first audio turn avoids handshake latency.
   */
  public async warmUp(): Promise<void> {
    try {
      this.defaultInstance.preload();
      console.log(`[EdgeTtsProvider] Pre-warmed Edge TTS WebSocket connection pool.`);
    } catch (err: any) {
      console.warn(`[EdgeTtsProvider] Pre-warm notice: ${err.message}`);
    }
  }

  /**
   * Synthesizes text into a complete WebM Opus buffer with automatic retry.
   */
  public async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return Buffer.alloc(0);
    }

    const tts = this.getTtsInstance(options);

    return await withRetry(
      async () => {
        const audio = await tts.speak(cleanText);
        return Buffer.from(audio);
      },
      {
        maxRetries: 2,
        baseDelayMs: 400,
        jitterMs: 150,
        onRetry: (err, attempt, delay) => {
          console.warn(`[EdgeTtsProvider] Retry #${attempt} after error (${err.message}). Waiting ${delay}ms...`);
        },
      }
    );
  }

  /**
   * Synthesizes text and yields audio chunks progressively as they arrive from WebSocket stream.
   */
  public async *synthesizeStream(text: string, options?: TtsOptions): AsyncIterable<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const tts = this.getTtsInstance(options);
    const stream = tts.stream(cleanText);

    for await (const chunk of stream) {
      yield Buffer.from(chunk);
    }
  }

  private getTtsInstance(options?: TtsOptions): TextToSpeech {
    const customVoice = options?.voice;
    const customSpeed = typeof options?.rate === 'number' ? options.rate : undefined;
    const customVolume = typeof options?.volume === 'number' ? options.volume : undefined;
    const customPitch = typeof options?.pitch === 'number' ? options.pitch : undefined;

    if (
      (!customVoice || customVoice === this.defaultVoice) &&
      (customSpeed === undefined || customSpeed === this.speed) &&
      (customVolume === undefined || customVolume === this.volume) &&
      (customPitch === undefined || customPitch === this.pitch)
    ) {
      return this.defaultInstance;
    }

    return new TextToSpeech({
      voice: customVoice || this.defaultVoice,
      format: 'webm-24khz-16bit-mono-opus',
      speed: customSpeed ?? this.speed,
      pitch: customPitch ?? this.pitch,
      volume: customVolume ?? this.volume,
      warm: true,
    });
  }
}
