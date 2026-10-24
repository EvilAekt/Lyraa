/**
 * VOICEVOX TTS Provider Implementation
 * Synthesizes Japanese speech locally via VOICEVOX Engine REST API (localhost:50021).
 * Features:
 * - Two-step REST synthesis (audio_query + synthesis)
 * - Support for Sayo (ID 46) and Meimei Himari (ID 14)
 * - Dynamic runtime speaker switching without restarting
 * - Automatic retry with jitter and timeout handling
 * - Output format: WAV PCM 24kHz 16-bit mono
 */

import { TtsOptions, TtsProvider } from '../tts-provider.js';
import { withRetry, withTimeout } from '../../audio/resilience.js';

export interface VoicevoxConfig {
  baseUrl: string;
  speakerId: number;
  availableSpeakers: number[];
  speedScale?: number;
  volumeScale?: number;
  intonationScale?: number;
  pitchScale?: number;
  timeoutMs?: number;
}

export const VOICEVOX_SPEAKER_MAP: Record<number, string> = {
  46: 'Sayo (小夜) — Normal',
  14: 'Meimei Himari (冥鳴ひまり) — Normal',
};

export class VoicevoxTtsProvider implements TtsProvider {
  private baseUrl: string;
  private currentSpeakerId: number;
  private availableSpeakers: number[];
  private speedScale: number;
  private volumeScale: number;
  private intonationScale: number;
  private pitchScale: number;
  private timeoutMs: number;

  constructor(cfg: VoicevoxConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.availableSpeakers = cfg.availableSpeakers && cfg.availableSpeakers.length > 0
      ? cfg.availableSpeakers
      : [46, 14];
    this.currentSpeakerId = this.availableSpeakers.includes(cfg.speakerId)
      ? cfg.speakerId
      : (this.availableSpeakers[0] || 46);

    this.speedScale = cfg.speedScale ?? 1.0;
    this.volumeScale = cfg.volumeScale ?? 1.0;
    this.intonationScale = cfg.intonationScale ?? 1.0;
    this.pitchScale = cfg.pitchScale ?? 0.0;
    this.timeoutMs = cfg.timeoutMs ?? 5000;
  }

  public getVoiceName(): string {
    return VOICEVOX_SPEAKER_MAP[this.currentSpeakerId] || `VOICEVOX Speaker #${this.currentSpeakerId}`;
  }

  public getStreamType(): string {
    return 'raw';
  }

  public getCurrentSpeakerId(): number {
    return this.currentSpeakerId;
  }

  public getAvailableSpeakers(): { id: number; name: string }[] {
    return this.availableSpeakers.map((id) => ({
      id,
      name: VOICEVOX_SPEAKER_MAP[id] || `Speaker #${id}`,
    }));
  }

  /**
   * Switch the active speaker at runtime.
   */
  public switchSpeaker(speakerId: number): void {
    if (!this.availableSpeakers.includes(speakerId)) {
      throw new Error(
        `[VoicevoxTtsProvider] Invalid speaker ID ${speakerId}. Available: ${this.availableSpeakers.join(', ')}`
      );
    }
    const oldId = this.currentSpeakerId;
    this.currentSpeakerId = speakerId;
    console.log(
      `[VoicevoxTtsProvider] Switched speaker from ${oldId} (${VOICEVOX_SPEAKER_MAP[oldId] || oldId}) ` +
      `to ${speakerId} (${VOICEVOX_SPEAKER_MAP[speakerId] || speakerId})`
    );
  }

  /**
   * Pre-warms connectivity with VOICEVOX Engine.
   */
  public async warmUp(): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/version`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const ver = await res.json();
        console.log(`[VoicevoxTtsProvider] Pre-warmed connection. VOICEVOX Engine version: ${ver}`);
      } else {
        console.warn(`[VoicevoxTtsProvider] Engine returned status ${res.status} on warmUp`);
      }
    } catch (err: any) {
      console.warn(`[VoicevoxTtsProvider] Pre-warm notice: ${err.message}`);
    }
  }

  /**
   * Resamples 24kHz 16-bit mono PCM from VOICEVOX WAV into 48kHz 16-bit stereo PCM for Discord StreamType.Raw.
   */
  public static wavTo48kStereoPcm(wavBuffer: Buffer): Buffer {
    if (wavBuffer.length < 44) {
      return Buffer.alloc(0);
    }

    // Locate the 'data' subchunk header in the WAV buffer
    let dataOffset = 44;
    for (let i = 12; i < wavBuffer.length - 8; i++) {
      if (
        wavBuffer[i] === 0x64 && // 'd'
        wavBuffer[i + 1] === 0x61 && // 'a'
        wavBuffer[i + 2] === 0x74 && // 't'
        wavBuffer[i + 3] === 0x61    // 'a'
      ) {
        dataOffset = i + 8;
        break;
      }
    }

    const pcm24k = wavBuffer.subarray(dataOffset);
    const numSamples = Math.floor(pcm24k.length / 2);
    if (numSamples <= 0) return Buffer.alloc(0);

    // Resample 2x: 24kHz mono -> 48kHz stereo (each sample yields 2 stereo frames = 8 bytes)
    const pcm48k = Buffer.alloc(numSamples * 8);

    for (let i = 0; i < numSamples; i++) {
      const s0 = pcm24k.readInt16LE(i * 2);
      const s1 = i < numSamples - 1 ? pcm24k.readInt16LE((i + 1) * 2) : s0;
      const mid = Math.round((s0 + s1) / 2);

      const outOffset = i * 8;
      // Frame 0: s0 (Left and Right)
      pcm48k.writeInt16LE(s0, outOffset);
      pcm48k.writeInt16LE(s0, outOffset + 2);
      // Frame 1: mid (Left and Right)
      pcm48k.writeInt16LE(mid, outOffset + 4);
      pcm48k.writeInt16LE(mid, outOffset + 6);
    }

    return pcm48k;
  }

  /**
   * Synthesize text and return original WAV format buffer from VOICEVOX.
   */
  public async synthesizeWav(text: string, options?: TtsOptions): Promise<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return Buffer.alloc(0);
    }

    let targetSpeakerId = this.currentSpeakerId;
    if (options?.voice) {
      const parsed = parseInt(options.voice, 10);
      if (!isNaN(parsed) && this.availableSpeakers.includes(parsed)) {
        targetSpeakerId = parsed;
      }
    }

    return await withRetry(
      async () => {
        return await withTimeout(
          this.executeSynthesis(cleanText, targetSpeakerId, options),
          this.timeoutMs,
          'VOICEVOX Synthesis'
        );
      },
      {
        maxRetries: 2,
        baseDelayMs: 300,
        jitterMs: 100,
        onRetry: (err, attempt, delay) => {
          console.warn(`[VoicevoxTtsProvider] Retry #${attempt} after error (${err.message}). Waiting ${delay}ms...`);
        },
      }
    );
  }

  /**
   * Synthesize text into resampled 48kHz stereo PCM buffer (ready for Discord StreamType.Raw).
   */
  public async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const wavBuffer = await this.synthesizeWav(text, options);
    if (wavBuffer.length === 0) {
      return Buffer.alloc(0);
    }
    return VoicevoxTtsProvider.wavTo48kStereoPcm(wavBuffer);
  }

  /**
   * Synthesize text and yield audio chunk (VOICEVOX does not stream natively).
   */
  public async *synthesizeStream(text: string, options?: TtsOptions): AsyncIterable<Buffer> {
    const buffer = await this.synthesize(text, options);
    if (buffer.length > 0) {
      yield buffer;
    }
  }

  private async executeSynthesis(text: string, speakerId: number, options?: TtsOptions): Promise<Buffer> {
    const controller = new AbortController();
    const queryUrl = `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;

    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      signal: controller.signal,
    });

    if (!queryRes.ok) {
      const errText = await queryRes.text().catch(() => '');
      throw new Error(`[VoicevoxTtsProvider] audio_query failed (${queryRes.status}): ${errText}`);
    }

    const queryJson = (await queryRes.json()) as Record<string, any>;

    // Apply speed, volume, and pitch configurations / options
    const speed = typeof options?.rate === 'number' ? options.rate : this.speedScale;
    const volume = typeof options?.volume === 'number' ? options.volume : this.volumeScale;
    const pitch = typeof options?.pitch === 'number' ? options.pitch : this.pitchScale;

    queryJson.speedScale = speed;
    queryJson.volumeScale = volume;
    queryJson.pitchScale = pitch;
    queryJson.intonationScale = this.intonationScale;

    const synthUrl = `${this.baseUrl}/synthesis?speaker=${speakerId}`;
    const synthRes = await fetch(synthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryJson),
      signal: controller.signal,
    });

    if (!synthRes.ok) {
      const errText = await synthRes.text().catch(() => '');
      throw new Error(`[VoicevoxTtsProvider] synthesis failed (${synthRes.status}): ${errText}`);
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
