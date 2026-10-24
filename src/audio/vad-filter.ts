/**
 * Lightweight Energy-based VAD (Voice Activity Detection) and PCM Filter.
 * Analyzes audio energy (RMS) and utterance duration to filter out silence,
 * mic popping, and background noise before triggering expensive STT calls.
 */

export interface VadFilterOptions {
  minDurationSec?: number;
  maxDurationSec?: number;
  minRmsThreshold?: number;
  sampleRate?: number;
}

export interface VadFilterResult {
  isVoice: boolean;
  rms: number;
  durationSec: number;
  reason: 'too_short' | 'too_long' | 'below_energy_threshold' | 'valid_speech';
}

/**
 * Calculates the Root Mean Square (RMS) energy level of 16-bit mono PCM audio.
 * Value range: 0 (absolute silence) to 32767 (maximum amplitude).
 */
export function calculatePcmRms(pcmBuffer: Buffer): number {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * Validates whether a PCM audio buffer qualifies as human voice utterance
 * based on minimum energy threshold and duration bounds.
 */
export function filterVoiceAudio(
  pcmBuffer: Buffer,
  options?: VadFilterOptions
): VadFilterResult {
  const sampleRate = options?.sampleRate || 48000;
  const minDurationSec = options?.minDurationSec ?? 0.5;
  const maxDurationSec = options?.maxDurationSec ?? 30.0;
  const minRmsThreshold = options?.minRmsThreshold ?? 250;

  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const durationSec = sampleCount / sampleRate;

  if (durationSec < minDurationSec) {
    return {
      isVoice: false,
      rms: 0,
      durationSec,
      reason: 'too_short',
    };
  }

  if (durationSec > maxDurationSec) {
    return {
      isVoice: false,
      rms: 0,
      durationSec,
      reason: 'too_long',
    };
  }

  const rms = calculatePcmRms(pcmBuffer);

  if (rms < minRmsThreshold) {
    return {
      isVoice: false,
      rms,
      durationSec,
      reason: 'below_energy_threshold',
    };
  }

  return {
    isVoice: true,
    rms,
    durationSec,
    reason: 'valid_speech',
  };
}
