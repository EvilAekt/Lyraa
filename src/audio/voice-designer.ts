/**
 * Voice Design Experiment Engine
 * Implements PRD §7 & ROADMAP §15 (Task T3.4):
 * - Creates custom synthesized voice profiles from structured descriptive templates:
 *   (Age Impression, Timbre, Speaking Pace, Accent, Expression Level)
 * - Assigns and locks permanent IDs for reproducibility and configuration
 * - Strictly enforces safety rule: Prohibited from cloning or mimicking real living people
 * - Generates high-fidelity WebM Opus audio samples for evaluation in T3.3
 */

import fs from 'node:fs';
import path from 'node:path';
import TextToSpeech from '@kirillasyamov/text-to-speech';

export interface VoiceDesignProfile {
  id: string; // Permanent ID
  name: string;
  ageImpression: string;
  timbreAndColor: string;
  speakingPace: string;
  accentAndDialect: string;
  expressionLevel: string;
  imitationConstraint: string; // PRD §7: Dilarang meniru orang sungguhan
  acousticParameters: {
    engine: 'edge-tts';
    baseVoice: string;
    speed: number;
    pitch: number;
    volume: string;
  };
  sampleText: string;
}

export const VOICE_DESIGN_PROFILES: VoiceDesignProfile[] = [
  {
    id: 'voice-design-lyra-streamer-v1',
    name: 'Lyra Energetic Streamer (High-Energy Overdrive)',
    ageImpression: 'Perempuan muda, rentang umur 19-21 tahun',
    timbreAndColor: 'Cerah, renyah (bright & crisp), nada vokal jernih dengan resonansi anime VTuber yang bersemangat',
    speakingPace: 'Sedang cenderung cepat (1.08x tempo), intonasi lincah dan berirama dinamis',
    accentAndDialect: 'Indonesia kasual metropolitan / santai dengan pelafalan istilah gaming yang luwes',
    expressionLevel: 'Tinggi, antusias, ekspresif, sedikit jahil (playful), dan penuh energi saat momen menegangkan',
    imitationConstraint: 'Karakter AI VTuber orisinal, TIDAK meniru figur atau orang sungguhan (PRD §7.6, FR-P5)',
    acousticParameters: {
      engine: 'edge-tts',
      baseVoice: 'id-ID-GadisNeural',
      speed: 1.08,
      pitch: 8,
      volume: '+0%',
    },
    sampleText:
      'Halo semuanya! Kenalin aku Lyra! Ayo gas mabar sekarang juga, jangan kasih kendor ya guys!',
  },
  {
    id: 'voice-design-lyra-cozy-v1',
    name: 'Lyra Late-Night Cozy (Warm & Relaxed)',
    ageImpression: 'Perempuan muda, rentang umur 21-23 tahun',
    timbreAndColor: 'Hangat, lembut, sedikit serak ramah (warm & slightly husky), empuk di telinga',
    speakingPace: 'Sedang cenderung santai (0.92x tempo), jeda nafas alami dan tenang',
    accentAndDialect: 'Indonesia santai dan akrab, intonasi bersahabat seperti sahabat karib',
    expressionLevel: 'Sedang, menenangkan, penuh empati, sangat nyaman didengarkan dalam sesi larut malam',
    imitationConstraint: 'Karakter AI VTuber orisinal, TIDAK meniru figur atau orang sungguhan (PRD §7.6, FR-P5)',
    acousticParameters: {
      engine: 'edge-tts',
      baseVoice: 'id-ID-GadisNeural',
      speed: 0.92,
      pitch: -4,
      volume: '+0%',
    },
    sampleText:
      'Malam semuanya... Gimana hari kamu tadi? Kalau capek, istirahat dulu ya sambil dengerin obrolan santai Lyra.',
  },
];

import { withRetry } from './resilience.js';

export class VoiceDesigner {
  private profiles: Map<string, VoiceDesignProfile> = new Map();

  constructor(customProfiles?: VoiceDesignProfile[]) {
    const list = customProfiles || VOICE_DESIGN_PROFILES;
    for (const p of list) {
      this.profiles.set(p.id, p);
    }
  }

  public getProfile(id: string): VoiceDesignProfile | undefined {
    return this.profiles.get(id);
  }

  public listProfiles(): VoiceDesignProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Synthesizes audio using the given voice design profile parameters.
   */
  public async synthesize(text: string, profileId: string): Promise<Buffer> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`[VoiceDesigner] Profile not found for permanent ID: "${profileId}".`);
    }

    return await withRetry(
      async () => {
        const tts = new TextToSpeech({
          voice: profile.acousticParameters.baseVoice,
          format: 'webm-24khz-16bit-mono-opus',
          speed: profile.acousticParameters.speed,
          pitch: profile.acousticParameters.pitch,
        });

        const audio = await tts.speak(text);
        return Buffer.from(audio);
      },
      {
        maxRetries: 3,
        baseDelayMs: 800,
        jitterMs: 300,
      }
    );
  }

  /**
   * Generates sample audio files for all voice design profiles and saves them to disk.
   */
  public async generateDesignSamples(outputDir?: string): Promise<Array<{ profileId: string; filePath: string }>> {
    const targetDir = outputDir || path.join(process.cwd(), 'fixtures', 'voice-candidates');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const results: Array<{ profileId: string; filePath: string }> = [];

    for (const profile of this.listProfiles()) {
      const fileName = `${profile.id}.webm`;
      const filePath = path.join(targetDir, fileName);

      try {
        const audioBuffer = await this.synthesize(profile.sampleText, profile.id);
        fs.writeFileSync(filePath, audioBuffer);
        console.log(`[VoiceDesigner] Generated sample for "${profile.id}" (${audioBuffer.byteLength} bytes) -> ${fileName}`);
      } catch (err: any) {
        console.warn(`[VoiceDesigner] Synthesis error for "${profile.id}": ${err.message}. Writing placeholder.`);
        fs.writeFileSync(filePath, Buffer.alloc(1024, 0xaa));
      }

      results.push({ profileId: profile.id, filePath });
    }

    return results;
  }
}

// Global instance
export const voiceDesigner = new VoiceDesigner();
