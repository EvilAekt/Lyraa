/**
 * ElevenLabs TTS Provider Implementation
 * Ultra-natural, multilingual character voice synthesis using ElevenLabs Cloud API.
 * Features:
 * - Native 48,000 Hz raw PCM output format (pcm_48000)
 * - Low-latency streaming via eleven_turbo_v2_5 model
 * - Seamless Mono -> Stereo PCM 48kHz expansion for Discord StreamType.Raw
 * - Automatic retry with jitter and timeout handling
 * - Direct HTTP streaming chunk delivery
 */

import { TtsOptions, TtsProvider } from '../tts-provider.js';
import { withRetry, withTimeout } from '../../audio/resilience.js';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  timeoutMs?: number;
}

export class ElevenLabsTtsProvider implements TtsProvider {
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private outputFormat: string;
  private stability: number;
  private similarityBoost: number;
  private style: number;
  private speed: number;
  private timeoutMs: number;

  constructor(cfg: ElevenLabsConfig) {
    this.apiKey = cfg.apiKey;
    this.voiceId = cfg.voiceId || '0CzBBZVHSe1kKQOUHVzq';
    this.modelId = cfg.modelId || 'eleven_turbo_v2_5';
    this.outputFormat = cfg.outputFormat || 'opus_48000_64';
    this.stability = cfg.stability ?? 0.35;
    this.similarityBoost = cfg.similarityBoost ?? 0.75;
    this.style = cfg.style ?? 0.65;
    this.speed = cfg.speed ?? 1.15;
    this.timeoutMs = cfg.timeoutMs ?? 5000;
  }

  public getVoiceName(): string {
    return `ElevenLabs (${this.voiceId})`;
  }

  public getStreamType(): string {
    if (this.outputFormat.startsWith('opus_')) {
      return 'ogg/opus';
    }
    if (this.outputFormat.startsWith('pcm_')) {
      return 'raw';
    }
    return 'ogg/opus';
  }

  public getVoiceId(): string {
    return this.voiceId;
  }

  public setVoiceId(newVoiceId: string): void {
    if (!newVoiceId || newVoiceId.trim().length === 0) {
      throw new Error('[ElevenLabsTtsProvider] Invalid voice ID: cannot be empty');
    }
    const oldId = this.voiceId;
    this.voiceId = newVoiceId.trim();
    console.log(`[ElevenLabsTtsProvider] Switched voice ID from ${oldId} to ${this.voiceId}`);
  }

  public setVoiceSettings(settings: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speed?: number;
  }): void {
    if (settings.stability !== undefined) this.stability = settings.stability;
    if (settings.similarityBoost !== undefined) this.similarityBoost = settings.similarityBoost;
    if (settings.style !== undefined) this.style = settings.style;
    if (settings.speed !== undefined) this.speed = settings.speed;
    console.log(
      `[ElevenLabsTtsProvider] Updated voice settings: stability=${this.stability}, similarity=${this.similarityBoost}, style=${this.style}, speed=${this.speed}`
    );
  }

  public getVoiceSettings(): { stability: number; similarityBoost: number; style: number; speed: number } {
    return {
      stability: this.stability,
      similarityBoost: this.similarityBoost,
      style: this.style,
      speed: this.speed,
    };
  }

  /**
   * Expands 48kHz 16-bit Mono PCM buffer to 48kHz 16-bit Stereo PCM buffer
   * by duplicating samples to Left and Right channels for Discord StreamType.Raw.
   */
  public static monoToStereoPcm(monoPcm: Buffer): Buffer {
    if (monoPcm.length < 2) {
      return Buffer.alloc(0);
    }

    // Align to 2-byte 16-bit samples
    const usableLength = monoPcm.length - (monoPcm.length % 2);
    const numSamples = usableLength / 2;
    const stereoPcm = Buffer.alloc(numSamples * 4); // 2 channels * 2 bytes = 4 bytes per frame

    for (let i = 0; i < numSamples; i++) {
      const sample = monoPcm.readInt16LE(i * 2);
      const outOffset = i * 4;
      stereoPcm.writeInt16LE(sample, outOffset);     // Left
      stereoPcm.writeInt16LE(sample, outOffset + 2); // Right
    }

    return stereoPcm;
  }

  /**
   * Pre-warms the connection to ElevenLabs API to eliminate initial TLS handshake latency.
   */
  public async warmUp(): Promise<void> {
    if (!this.apiKey) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.elevenlabs.io/v1/models', {
        headers: { 'xi-api-key': this.apiKey },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        console.log('[ElevenLabsTtsProvider] Pre-warmed connection to ElevenLabs API successfully.');
      } else {
        console.warn(`[ElevenLabsTtsProvider] Pre-warm notice: status ${res.status}`);
      }
    } catch (err: any) {
      console.warn(`[ElevenLabsTtsProvider] Pre-warm notice: ${err.message}`);
    }
  }

  /**
   * Synthesizes text into a complete 48kHz stereo PCM buffer with retry and timeout.
   */
  public async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return Buffer.alloc(0);
    }

    const targetVoice = options?.voice || this.voiceId;

    return await withRetry(
      async () => {
        return await withTimeout(
          this.executeSynthesis(cleanText, targetVoice),
          this.timeoutMs,
          'ElevenLabs Synthesis'
        );
      },
      {
        maxRetries: 2,
        baseDelayMs: 300,
        jitterMs: 100,
        shouldRetry: (err) => {
          const msg = String(err?.message || '');
          // Do not retry client auth or payment errors (400, 401, 402)
          if (msg.includes('(400)') || msg.includes('(401)') || msg.includes('(402)')) {
            return false;
          }
          return true;
        },
        onRetry: (err, attempt, delay) => {
          console.warn(`[ElevenLabsTtsProvider] Retry #${attempt} after error (${err.message}). Waiting ${delay}ms...`);
        },
      }
    );
  }

  /**
   * Synthesizes text and yields stereo PCM chunks progressively as they stream from ElevenLabs.
   */
  public async *synthesizeStream(text: string, options?: TtsOptions): AsyncIterable<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const targetVoice = options?.voice || this.voiceId;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}/stream?output_format=${this.outputFormat}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: this.modelId,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
            style: this.style,
            use_speaker_boost: true,
            speed: this.speed,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`[ElevenLabsTtsProvider] Stream failed (${response.status}): ${JSON.stringify(errJson)}`);
      }

      if (!response.body) {
        return;
      }

      if (this.outputFormat.startsWith('opus_')) {
        for await (const rawChunk of response.body as any) {
          yield Buffer.from(rawChunk);
        }
      } else {
        let leftover: Buffer | null = null;
        // Read chunked web stream for PCM
        for await (const rawChunk of response.body as any) {
          let chunkBuffer = Buffer.from(rawChunk);

          if (leftover && leftover.length > 0) {
            chunkBuffer = Buffer.concat([leftover, chunkBuffer]);
            leftover = null;
          }

          // Must align to 16-bit (2-byte) samples
          if (chunkBuffer.length % 2 !== 0) {
            leftover = chunkBuffer.subarray(chunkBuffer.length - 1);
            chunkBuffer = chunkBuffer.subarray(0, chunkBuffer.length - 1);
          }

          if (chunkBuffer.length > 0) {
            const stereoChunk = ElevenLabsTtsProvider.monoToStereoPcm(chunkBuffer);
            yield stereoChunk;
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[ElevenLabsTtsProvider] synthesizeStream fallback: ${err.message}`);
      // Fallback to non-streaming synthesize if streaming fails
      const fallbackBuffer = await this.synthesize(cleanText, options);
      if (fallbackBuffer.length > 0) {
        yield fallbackBuffer;
      }
    }
  }

  private async executeSynthesis(text: string, voiceId: string): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${this.outputFormat}`;

    const controller = new AbortController();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId,
        voice_settings: {
          stability: this.stability,
          similarity_boost: this.similarityBoost,
          style: this.style,
          use_speaker_boost: true,
          speed: this.speed,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = JSON.stringify(errJson);
      } catch {
        errDetail = response.statusText;
      }
      throw new Error(`[ElevenLabsTtsProvider] Synthesis failed (${response.status}): ${errDetail}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    if (this.outputFormat.startsWith('opus_')) {
      return rawBuffer;
    }

    return ElevenLabsTtsProvider.monoToStereoPcm(rawBuffer);
  }
}
