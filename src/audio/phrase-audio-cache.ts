/**
 * Common Phrase Audio Cache
 * Implements PRD §5 & T3.2:
 * Pre-synthesizes and caches common persona greetings, filler words, and acknowledgments
 * into native WebM Opus buffers in memory, achieving instant playback response (< 300ms, typically < 10ms).
 */

import { TtsProvider } from '../providers/tts-provider.js';

export interface PhraseCacheEntry {
  phrase: string;
  normalizedKey: string;
  audioBuffer: Buffer;
  synthesizedAt: number;
  hitCount: number;
}

export class PhraseAudioCache {
  private cache: Map<string, PhraseCacheEntry> = new Map();
  private defaultPhrases: string[] = [
    'Halo!',
    'Halo juga!',
    'Iya, ada apa?',
    'Sebentar ya...',
    'Tunggu sebentar ya...',
    'Siap!',
    'Oke deh!',
    'Sampai jumpa!',
    'Ada apa nih?',
    'Iya aku dengar!',
  ];
  private isWarmedUp = false;

  constructor(customPhrases?: string[]) {
    if (customPhrases && customPhrases.length > 0) {
      this.defaultPhrases = [...new Set([...this.defaultPhrases, ...customPhrases])];
    }
  }

  /**
   * Normalizes phrase string for fuzzy matching (case insensitive, trimmed punctuation).
   */
  public normalize(phrase: string): string {
    return phrase
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:]+$/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Returns true if the cache contains the given phrase.
   */
  public has(phrase: string): boolean {
    const key = this.normalize(phrase);
    return this.cache.has(key);
  }

  /**
   * Retrieves the cached audio buffer for a phrase, or undefined if not found.
   */
  public get(phrase: string): Buffer | undefined {
    const key = this.normalize(phrase);
    const entry = this.cache.get(key);
    if (entry) {
      entry.hitCount++;
      return entry.audioBuffer;
    }
    return undefined;
  }

  /**
   * Manually adds a synthesized audio buffer to the cache.
   */
  public set(phrase: string, audioBuffer: Buffer): void {
    const key = this.normalize(phrase);
    this.cache.set(key, {
      phrase,
      normalizedKey: key,
      audioBuffer,
      synthesizedAt: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Returns total count of cached phrases.
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Returns all cached phrases list.
   */
  public getCachedPhrases(): string[] {
    return Array.from(this.cache.values()).map((e) => e.phrase);
  }

  /**
   * Pre-synthesizes all common phrases and stores them in RAM cache.
   * Can be executed at startup or during /join pre-warming.
   */
  public async warmUp(ttsProvider: TtsProvider): Promise<number> {
    let loadedCount = 0;
    const errors: string[] = [];

    for (const phrase of this.defaultPhrases) {
      const key = this.normalize(phrase);
      if (this.cache.has(key)) {
        continue;
      }

      try {
        const buffer = await ttsProvider.synthesize(phrase);
        if (buffer && buffer.length > 0) {
          this.set(phrase, buffer);
          loadedCount++;
        }
      } catch (err: any) {
        errors.push(`${phrase}: ${err.message}`);
      }
    }

    this.isWarmedUp = true;
    console.log(
      `[PhraseAudioCache] Warmed up ${loadedCount} common phrases into RAM audio cache (${this.cache.size} total).`
    );

    if (errors.length > 0) {
      console.warn(`[PhraseAudioCache] Warnings during warm-up: ${errors.join(', ')}`);
    }

    return loadedCount;
  }

  /**
   * Clears the audio cache.
   */
  public clear(): void {
    this.cache.clear();
    this.isWarmedUp = false;
  }
}

// Global singleton instance for shared pipeline use
export const phraseAudioCache = new PhraseAudioCache();
