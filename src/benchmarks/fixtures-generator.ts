/**
 * Audio Fixtures Generator for Latency Benchmark (T3.1)
 * Generates 10 standard WAV audio fixtures (16-bit PCM, 48kHz, mono)
 * covering short, conversational, long, gaming, and mixed-English utterances.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface AudioFixture {
  id: string;
  name: string;
  category: 'short' | 'question' | 'casual' | 'long' | 'gaming' | 'english_mix' | 'preference' | 'humor';
  transcript: string;
  durationSec: number;
  filePath: string;
}

export const STANDARD_FIXTURES: Omit<AudioFixture, 'filePath'>[] = [
  {
    id: 'utt-01',
    name: 'Short Greeting',
    category: 'short',
    transcript: 'Halo Lyra!',
    durationSec: 1.2,
  },
  {
    id: 'utt-02',
    name: 'Short Query',
    category: 'question',
    transcript: 'Jam berapa sekarang?',
    durationSec: 1.5,
  },
  {
    id: 'utt-03',
    name: 'Casual Chit-chat',
    category: 'casual',
    transcript: 'Hari ini cuacanya enak banget ya buat santai.',
    durationSec: 2.8,
  },
  {
    id: 'utt-04',
    name: 'Medium Explanation Query',
    category: 'long',
    transcript: 'Bisa jelasin nggak kenapa langit waktu siang warnanya biru tapi kalau sore berubah jadi oranye?',
    durationSec: 4.5,
  },
  {
    id: 'utt-05',
    name: 'Gaming Jargon',
    category: 'gaming',
    transcript: 'Bro tadi malam tim kita kalah karena di-rush pas lagi clutch!',
    durationSec: 3.4,
  },
  {
    id: 'utt-06',
    name: 'Mixed English Query',
    category: 'english_mix',
    transcript: 'Lyra, do you know what the best strategy for playing mid lane is?',
    durationSec: 3.8,
  },
  {
    id: 'utt-07',
    name: 'Preference & Hobby',
    category: 'preference',
    transcript: 'Kamu lebih suka dengerin musik jazz atau pop elektro?',
    durationSec: 3.0,
  },
  {
    id: 'utt-08',
    name: 'Multi-part Long Question',
    category: 'long',
    transcript: 'Lyra coba sebutkan tiga hal yang wajib dibawa kalau kita mau naik gunung sama teman-teman.',
    durationSec: 4.8,
  },
  {
    id: 'utt-09',
    name: 'Morning Greeting with Wake Word',
    category: 'short',
    transcript: 'Halo Lyra, selamat pagi, apa agenda seru kita hari ini?',
    durationSec: 3.2,
  },
  {
    id: 'utt-10',
    name: 'Humor Request',
    category: 'humor',
    transcript: 'Lyra, ceritain satu lelucon lucu dong biar nggak bosen.',
    durationSec: 2.9,
  },
];

/**
 * Creates a valid RIFF WAV buffer containing 16-bit PCM 48kHz mono audio.
 * Audio content is a harmonic speech-like modulation signal with envelope.
 */
export function createWavBuffer(durationSec: number, sampleRate = 48000, baseFreq = 220): Buffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataByteLength = numSamples * 2; // 16-bit = 2 bytes per sample
  const headerByteLength = 44;
  const buffer = Buffer.alloc(headerByteLength + dataByteLength);

  // 1. RIFF Chunk Descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4); // ChunkSize
  buffer.write('WAVE', 8);

  // 2. 'fmt ' Sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(2, 32);  // BlockAlign (NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(16, 34); // BitsPerSample (16 bits)

  // 3. 'data' Sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  // Generate acoustic synthetic speech pulse samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Amplitude envelope: fade in 50ms, fade out 100ms
    let env = 1.0;
    if (t < 0.05) env = t / 0.05;
    else if (t > durationSec - 0.1) env = (durationSec - t) / 0.1;

    // Harmonic multi-frequency voice-formant simulation (fundamental + formants)
    const s1 = Math.sin(2 * Math.PI * baseFreq * t);
    const s2 = 0.5 * Math.sin(2 * Math.PI * (baseFreq * 2.2) * t);
    const s3 = 0.25 * Math.sin(2 * Math.PI * (baseFreq * 3.4) * t);
    const val = (s1 + s2 + s3) / 1.75 * env;

    // Scale to 16-bit signed integer (-32768 to 32767) at comfortable ~-16dB level
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(val * 12000)));
    buffer.writeInt16LE(int16Sample, headerByteLength + i * 2);
  }

  return buffer;
}

/**
 * Ensures all 10 standard audio fixtures exist on disk in fixtures/audio/.
 */
export function ensureAudioFixtures(targetDir?: string): AudioFixture[] {
  const dir = targetDir || path.join(process.cwd(), 'fixtures', 'audio');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const result: AudioFixture[] = [];

  for (const item of STANDARD_FIXTURES) {
    const filePath = path.join(dir, `${item.id}.wav`);
    if (!fs.existsSync(filePath)) {
      const wavBuffer = createWavBuffer(item.durationSec);
      fs.writeFileSync(filePath, wavBuffer);
    }
    result.push({
      ...item,
      filePath,
    });
  }

  return result;
}
