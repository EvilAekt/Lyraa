/**
 * STT Provider Interface
 * Standardized abstraction for Speech-to-Text transcription.
 */

export interface SttResult {
  text: string;
  userId: string;
  timestamp: number;
  durationMs: number;
  language?: string;
}

export interface SttOptions {
  userId: string;
  language?: string;
  sampleRate?: number;
  channels?: number;
  timeoutMs?: number;
}

export interface SttProvider {
  /**
   * Transcribes audio buffer (PCM or WAV) into structured text result.
   */
  transcribe(audioBuffer: Buffer, options: SttOptions): Promise<SttResult>;

  /**
   * Returns the underlying STT model identifier.
   */
  getModelName(): string;
}
