/**
 * Audio Normalizer, Smoother, and Inter-Sentence Controller
 * Implements PRD §7, PRD §15 (Task T3.5), and ROADMAP:
 * - Volume normalization and peak/RMS estimation (target ~ -16 LUFS / gain 0.85).
 * - Micro-crossfade ramp in/out (5–10 ms) to eliminate click and pop transients at chunk boundaries.
 * - Natural inter-sentence pause generation (150–300 ms) and buffer underrun detection (> 400 ms).
 * - Soft-knee clipping prevention on PCM buffers.
 */

export interface AudioQualityConfig {
  sampleRate?: number; // Default 48000 Hz
  channels?: number; // Default 1 (mono)
  rampMs?: number; // Default 7 ms (within PRD 5-10 ms)
  crossfadeMs?: number; // Default 10 ms (PRD 5-10 ms)
  interSentencePauseMs?: number; // Default 200 ms (PRD 150-300 ms)
  maxUnderrunThresholdMs?: number; // Default 400 ms (PRD buffer underrun limit)
  defaultVolumeMultiplier?: number; // Default 0.85 (targets ~ -16 LUFS)
}

export const DEFAULT_AUDIO_CONFIG: Required<AudioQualityConfig> = {
  sampleRate: 48000,
  channels: 1,
  rampMs: 7,
  crossfadeMs: 10,
  interSentencePauseMs: 200,
  maxUnderrunThresholdMs: 400,
  defaultVolumeMultiplier: 0.85,
};

export class AudioNormalizer {
  private config: Required<AudioQualityConfig>;

  constructor(config?: AudioQualityConfig) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  /**
   * Calculates peak amplitude of 16-bit signed PCM buffer in range [0.0, 1.0].
   */
  public static calculatePeak(pcm: Buffer): number {
    if (pcm.length < 2) return 0;
    let maxAbs = 0;
    const numSamples = Math.floor(pcm.length / 2);

    for (let i = 0; i < numSamples; i++) {
      const val = Math.abs(pcm.readInt16LE(i * 2));
      if (val > maxAbs) {
        maxAbs = val;
      }
    }

    return maxAbs / 32768.0;
  }

  /**
   * Calculates peak level in dBFS (-Infinity to 0.0 dBFS).
   */
  public static calculatePeakDb(pcm: Buffer): number {
    const peak = AudioNormalizer.calculatePeak(pcm);
    if (peak <= 0.00001) return -100;
    return 20 * Math.log10(peak);
  }

  /**
   * Calculates RMS (Root Mean Square) energy in range [0.0, 1.0].
   */
  public static calculateRms(pcm: Buffer): number {
    if (pcm.length < 2) return 0;
    let sumSquares = 0;
    const numSamples = Math.floor(pcm.length / 2);

    for (let i = 0; i < numSamples; i++) {
      const val = pcm.readInt16LE(i * 2) / 32768.0;
      sumSquares += val * val;
    }

    return Math.sqrt(sumSquares / numSamples);
  }

  /**
   * Approximates speech loudness in LUFS based on RMS energy (EBU R128 simplified approximation).
   */
  public static estimateLufs(pcm: Buffer): number {
    const rms = AudioNormalizer.calculateRms(pcm);
    if (rms <= 0.00001) return -100;
    // Approximated LUFS ~ -0.691 + 10 * log10(rms^2) = -0.691 + 20 * log10(rms)
    return -0.691 + 20 * Math.log10(rms);
  }

  /**
   * Applies linear gain multiplier to a 16-bit PCM buffer with clipping prevention.
   */
  public static applyGain(pcm: Buffer, gain: number): Buffer {
    if (pcm.length < 2) return Buffer.from(pcm);
    const output = Buffer.alloc(pcm.length);
    const numSamples = Math.floor(pcm.length / 2);

    for (let i = 0; i < numSamples; i++) {
      const sample = pcm.readInt16LE(i * 2);
      let scaled = Math.round(sample * gain);

      // Hard clamp to 16-bit signed int range [-32768, 32767]
      if (scaled > 32767) scaled = 32767;
      else if (scaled < -32768) scaled = -32768;

      output.writeInt16LE(scaled, i * 2);
    }

    return output;
  }

  /**
   * Soft-knee limiter / ceiling to prevent harsh digital clipping while preserving dynamics.
   * If sample magnitude exceeds threshold (default 0.95), smoothly compresses the peak.
   */
  public static preventClipping(pcm: Buffer, threshold = 0.95): Buffer {
    if (pcm.length < 2) return Buffer.from(pcm);
    const output = Buffer.alloc(pcm.length);
    const numSamples = Math.floor(pcm.length / 2);
    const threshInt = Math.floor(threshold * 32767);

    for (let i = 0; i < numSamples; i++) {
      const sample = pcm.readInt16LE(i * 2);
      const absSample = Math.abs(sample);

      if (absSample <= threshInt) {
        output.writeInt16LE(sample, i * 2);
      } else {
        // Soft compression beyond threshold
        const sign = sample < 0 ? -1 : 1;
        const over = (absSample - threshInt) / (32767 - threshInt);
        // Tanh-like soft compression curve
        const compressedOver = (1 - Math.exp(-over * 1.5)) * (32767 - threshInt);
        const limited = Math.round(sign * (threshInt + compressedOver));
        output.writeInt16LE(Math.max(-32768, Math.min(32767, limited)), i * 2);
      }
    }

    return output;
  }

  /**
   * Applies a smooth cosine fade-in ramp (5-10 ms) at the start of a 16-bit PCM buffer.
   * Eliminates DC offset and start transients (clicks/pops).
   */
  public applyRampIn(
    pcm: Buffer,
    rampMs = this.config.rampMs,
    sampleRate = this.config.sampleRate,
    channels = this.config.channels
  ): Buffer {
    if (pcm.length < 2) return Buffer.from(pcm);
    const output = Buffer.from(pcm);
    const totalSamples = Math.floor(pcm.length / (2 * channels));
    const rampSamples = Math.min(totalSamples, Math.floor((sampleRate * rampMs) / 1000));

    if (rampSamples <= 0) return output;

    for (let i = 0; i < rampSamples; i++) {
      // Half-cosine ramp: 0.5 * (1 - cos(pi * i / N))
      const multiplier = 0.5 * (1 - Math.cos((Math.PI * i) / rampSamples));

      for (let ch = 0; ch < channels; ch++) {
        const offset = (i * channels + ch) * 2;
        const sample = output.readInt16LE(offset);
        const smoothed = Math.round(sample * multiplier);
        output.writeInt16LE(smoothed, offset);
      }
    }

    return output;
  }

  /**
   * Applies a smooth cosine fade-out ramp (5-10 ms) at the end of a 16-bit PCM buffer.
   * Eliminates trailing truncation clicks.
   */
  public applyRampOut(
    pcm: Buffer,
    rampMs = this.config.rampMs,
    sampleRate = this.config.sampleRate,
    channels = this.config.channels
  ): Buffer {
    if (pcm.length < 2) return Buffer.from(pcm);
    const output = Buffer.from(pcm);
    const totalSamples = Math.floor(pcm.length / (2 * channels));
    const rampSamples = Math.min(totalSamples, Math.floor((sampleRate * rampMs) / 1000));

    if (rampSamples <= 0) return output;

    const startSample = totalSamples - rampSamples;

    for (let i = 0; i < rampSamples; i++) {
      // Half-cosine fade out: 0.5 * (1 + cos(pi * i / N))
      const multiplier = 0.5 * (1 + Math.cos((Math.PI * i) / rampSamples));
      const sampleIdx = startSample + i;

      for (let ch = 0; ch < channels; ch++) {
        const offset = (sampleIdx * channels + ch) * 2;
        const sample = output.readInt16LE(offset);
        const smoothed = Math.round(sample * multiplier);
        output.writeInt16LE(smoothed, offset);
      }
    }

    return output;
  }

  /**
   * Applies both ramp-in and ramp-out to completely smooth a chunk.
   */
  public smoothChunk(pcm: Buffer): Buffer {
    const rampedIn = this.applyRampIn(pcm);
    return this.applyRampOut(rampedIn);
  }

  /**
   * Crossfades the tail of bufferA with the head of bufferB over crossfadeMs (PRD 5-10 ms).
   * Returns a merged buffer with seamless acoustic transition without clicks or dips.
   */
  public crossfade(
    bufferA: Buffer,
    bufferB: Buffer,
    crossfadeMs = this.config.crossfadeMs,
    sampleRate = this.config.sampleRate,
    channels = this.config.channels
  ): Buffer {
    const samplesA = Math.floor(bufferA.length / (2 * channels));
    const samplesB = Math.floor(bufferB.length / (2 * channels));
    const fadeSamples = Math.min(
      Math.floor((sampleRate * crossfadeMs) / 1000),
      samplesA,
      samplesB
    );

    if (fadeSamples <= 0) {
      return Buffer.concat([bufferA, bufferB]);
    }

    const nonOverlapAEnd = (samplesA - fadeSamples) * channels * 2;
    const nonOverlapAPart = bufferA.subarray(0, nonOverlapAEnd);

    const nonOverlapBStart = fadeSamples * channels * 2;
    const nonOverlapBPart = bufferB.subarray(nonOverlapBStart);

    // Overlapping crossfade section
    const crossfadeBytes = fadeSamples * channels * 2;
    const overlapSection = Buffer.alloc(crossfadeBytes);

    for (let i = 0; i < fadeSamples; i++) {
      // Linear or equal-power crossfade weights
      const t = i / fadeSamples;
      const weightA = Math.cos((t * Math.PI) / 2); // Equal-power cos
      const weightB = Math.sin((t * Math.PI) / 2); // Equal-power sin

      for (let ch = 0; ch < channels; ch++) {
        const offsetA = (samplesA - fadeSamples + i) * channels * 2 + ch * 2;
        const offsetB = (i * channels + ch) * 2;
        const offsetOut = (i * channels + ch) * 2;

        const sampleA = bufferA.readInt16LE(offsetA);
        const sampleB = bufferB.readInt16LE(offsetB);

        const blended = Math.round(sampleA * weightA + sampleB * weightB);
        const clamped = Math.max(-32768, Math.min(32767, blended));

        overlapSection.writeInt16LE(clamped, offsetOut);
      }
    }

    return Buffer.concat([nonOverlapAPart, overlapSection, nonOverlapBPart]);
  }

  /**
   * Scans a PCM buffer for discontinuous step changes (clicks/pops).
   * A click is defined as an unnatural sample-to-sample delta exceeding threshold (e.g. 0.4 of max amplitude).
   */
  public static detectClicks(
    pcm: Buffer,
    deltaThreshold = 0.4
  ): { clickDetected: boolean; clickCount: number; maxDelta: number } {
    if (pcm.length < 4) return { clickDetected: false, clickCount: 0, maxDelta: 0 };
    const numSamples = Math.floor(pcm.length / 2);
    let clickCount = 0;
    let maxDelta = 0;
    const thresholdInt = Math.floor(deltaThreshold * 32767);

    for (let i = 1; i < numSamples; i++) {
      const prev = pcm.readInt16LE((i - 1) * 2);
      const curr = pcm.readInt16LE(i * 2);
      const delta = Math.abs(curr - prev);

      if (delta > maxDelta) {
        maxDelta = delta;
      }

      if (delta > thresholdInt) {
        clickCount++;
      }
    }

    return {
      clickDetected: clickCount > 0,
      clickCount,
      maxDelta: maxDelta / 32768.0,
    };
  }

  /**
   * Generates a zeroed 16-bit PCM silence buffer for a given duration in milliseconds.
   */
  public generateSilenceBuffer(
    durationMs = this.config.interSentencePauseMs,
    sampleRate = this.config.sampleRate,
    channels = this.config.channels
  ): Buffer {
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    return Buffer.alloc(numSamples * channels * 2);
  }

  /**
   * Evaluates if an inter-sentence gap is natural (150-300 ms) or causes buffer underrun (> 400 ms).
   */
  public evaluateInterSentenceGap(gapMs: number): {
    isNatural: boolean;
    isUnderrun: boolean;
    gapMs: number;
    message: string;
  } {
    const isUnderrun = gapMs > this.config.maxUnderrunThresholdMs;
    const isNatural = gapMs >= 150 && gapMs <= 300;

    let message = '';
    if (isUnderrun) {
      message = `[Underrun] Inter-sentence gap of ${gapMs}ms exceeds 400ms threshold!`;
    } else if (isNatural) {
      message = `[Natural] Inter-sentence gap of ${gapMs}ms is within natural speech window (150-300ms).`;
    } else if (gapMs < 150) {
      message = `[Fast] Inter-sentence gap of ${gapMs}ms is slightly brisk (< 150ms).`;
    } else {
      message = `[Acceptable] Inter-sentence gap of ${gapMs}ms is between 300ms and 400ms.`;
    }

    return {
      isNatural,
      isUnderrun,
      gapMs,
      message,
    };
  }
}

// Global Singleton Instance
let defaultNormalizer: AudioNormalizer | null = null;

export function getAudioNormalizer(): AudioNormalizer {
  if (!defaultNormalizer) {
    defaultNormalizer = new AudioNormalizer();
  }
  return defaultNormalizer;
}
