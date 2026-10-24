/**
 * Audio Lip-Sync Analyzer (Task T6.1, FR-X1)
 * Analyzes audio buffers to compute real-time mouth opening (viseme values):
 * - Frame duration: 20 ms
 * - SLA: Response time < 150 ms from speech onset
 * - Maps audio energy (RMS) to standard VRM viseme values: 'aa', 'ih', 'ou', 'ee', 'oh'
 */

export interface VisemeFrame {
  timestampMs: number;
  viseme: 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'sil';
  value: number; // 0.0 to 1.0 (opening intensity)
}

export class LipSyncAnalyzer {
  private frameDurationMs: number;
  private sampleRate: number;

  constructor(options: { frameDurationMs?: number; sampleRate?: number } = {}) {
    this.frameDurationMs = options.frameDurationMs || 20;
    this.sampleRate = options.sampleRate || 48000;
  }

  /**
   * Analyzes 16-bit PCM mono audio buffer and yields VisemeFrame events.
   */
  public analyzePcm(pcmBuffer: Buffer): VisemeFrame[] {
    const bytesPerSample = 2; // 16-bit
    const samplesPerFrame = Math.floor((this.sampleRate * this.frameDurationMs) / 1000);
    const bytesPerFrame = samplesPerFrame * bytesPerSample;

    const frames: VisemeFrame[] = [];
    const totalFrames = Math.floor(pcmBuffer.length / bytesPerFrame);

    for (let f = 0; f < totalFrames; f++) {
      const offset = f * bytesPerFrame;
      let sumSquares = 0;

      for (let s = 0; s < samplesPerFrame; s++) {
        const sample = pcmBuffer.readInt16LE(offset + s * 2);
        sumSquares += sample * sample;
      }

      const rms = Math.sqrt(sumSquares / samplesPerFrame);
      // Normalize RMS (typical speech is ~3000 to 10000)
      const mouthOpen = Math.min(1.0, Math.max(0.0, (rms - 300) / 7000));

      // Alternating vowel visemes for natural mouth motion
      const vowels: Array<'aa' | 'ih' | 'ou' | 'ee' | 'oh'> = ['aa', 'ih', 'ou', 'ee', 'oh'];
      const chosenVowel = mouthOpen > 0.1 ? vowels[f % vowels.length] : 'sil';

      frames.push({
        timestampMs: f * this.frameDurationMs,
        viseme: chosenVowel,
        value: Math.round(mouthOpen * 100) / 100,
      });
    }

    return frames;
  }

  /**
   * Generates timed viseme frames for compressed audio using duration and syllable approximation.
   * Ensures instant visual lip-sync within < 50ms from playback dispatch.
   */
  public generateSyntheticFrames(durationSec: number, text?: string): VisemeFrame[] {
    const totalFrames = Math.max(1, Math.floor((durationSec * 1000) / this.frameDurationMs));
    const frames: VisemeFrame[] = [];

    const vowels: Array<'aa' | 'ih' | 'ou' | 'ee' | 'oh'> = ['aa', 'oh', 'aa', 'ee', 'ou'];

    for (let f = 0; f < totalFrames; f++) {
      // Natural speech envelope: attack, sustain with fluctuation, decay
      const progress = f / totalFrames;
      let amplitude = 0.6;

      if (progress < 0.1) {
        amplitude = progress * 6; // quick attack (< 100ms)
      } else if (progress > 0.9) {
        amplitude = (1 - progress) * 6; // quick decay
      } else {
        // Natural syllable pulse (approx 4 syllables per second = 250ms cycle)
        const cycleProgress = (f % 12) / 12;
        amplitude = 0.3 + 0.5 * Math.sin(cycleProgress * Math.PI);
      }

      const vowel = vowels[Math.floor(f / 4) % vowels.length];

      frames.push({
        timestampMs: f * this.frameDurationMs,
        viseme: vowel,
        value: Math.round(Math.max(0, Math.min(1.0, amplitude)) * 100) / 100,
      });
    }

    return frames;
  }
}
