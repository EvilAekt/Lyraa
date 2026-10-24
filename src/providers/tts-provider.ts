/**
 * TTS Provider Interface
 * Standardized abstraction for Text-to-Speech synthesis in Voice Pipeline.
 */

export interface TtsOptions {
  voice?: string;
  rate?: number | string;
  volume?: number | string;
  pitch?: number;
}

export interface TtsProvider {
  /**
   * Synthesizes text into an audio buffer (e.g. WebmOpus or MP3).
   */
  synthesize(text: string, options?: TtsOptions): Promise<Buffer>;

  /**
   * Synthesizes text and yields audio chunks progressively as they arrive.
   */
  synthesizeStream?(text: string, options?: TtsOptions): AsyncIterable<Buffer>;

  /**
   * Pre-warms the connection pool to eliminate TLS handshake latency on first turn.
   */
  warmUp?(): Promise<void>;

  /**
   * Returns the default voice identifier configured for this provider.
   */
  getVoiceName(): string;

  /**
   * Returns the audio stream type for @discordjs/voice createAudioResource.
   */
  getStreamType(): string;
}
