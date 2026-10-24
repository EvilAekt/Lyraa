import { Buffer } from 'node:buffer';

export const DEFAULT_SAMPLE_RATE = 48000;
export const DEFAULT_CHANNELS = 1;
export const DEFAULT_BIT_DEPTH = 16;

/**
 * Creates a standard 44-byte RIFF/WAVE header for linear PCM data.
 */
export function createWavHeader(
  dataLength: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  channels: number = DEFAULT_CHANNELS,
  bitDepth: number = DEFAULT_BIT_DEPTH
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4); // File size - 8 bytes
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for linear PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Wraps raw PCM buffer into a playable WAV buffer.
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  channels: number = DEFAULT_CHANNELS,
  bitDepth: number = DEFAULT_BIT_DEPTH
): Buffer {
  const header = createWavHeader(pcmBuffer.length, sampleRate, channels, bitDepth);
  return Buffer.concat([header, pcmBuffer]);
}
