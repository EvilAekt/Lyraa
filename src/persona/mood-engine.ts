/**
 * Dynamic Mood Engine for Lyra
 * Manages dynamic emotional states, mood shifts, sentiment responsiveness,
 * and behavioural constraints for LLM system instructions.
 */

export type MoodType = 'happy' | 'playful' | 'bad_mood' | 'sleepy' | 'chill';

export interface MoodDetails {
  mood: MoodType;
  emoji: string;
  name: string;
  description: string;
  promptInstruction: string;
}

export const MOOD_DEFINITIONS: Record<MoodType, MoodDetails> = {
  happy: {
    mood: 'happy',
    emoji: '😄',
    name: 'Happy / Ceria Banget',
    description: 'Lyra lagi senang, ceria, dan penuh energi positif!',
    promptInstruction:
      '[SUASANA HATI SAAT INI: HAPPY/CERIA]\n' +
      '- Bersikaplah sangat riang, ramah, dan penuh tawa manis.\n' +
      '- Tunjukkan antusiasme tinggi saat diajak ngobrol atau mabar.\n' +
      '- Gunakan tag emosi seperti [happy] atau [laugh].',
  },
  playful: {
    mood: 'playful',
    emoji: '😜',
    name: 'Playful / Centil & Usil',
    description: 'Lyra lagi mode centil, suka ngeledek, dan menggoda teman tongkrongan!',
    promptInstruction:
      '[SUASANA HATI SAAT INI: PLAYFUL/CENTIL & USIL]\n' +
      '- Bersikaplah centil, manja-usil, dan suka ngeledek teman bercanda ("Ihh apaan sih~", "Ciee").\n' +
      '- Bikin suasana tongkrongan makin ramai dan seru.\n' +
      '- Gunakan tag emosi seperti [teasing] atau [happy].',
  },
  bad_mood: {
    mood: 'bad_mood',
    emoji: '😾',
    name: 'Bad Mood / Ngambek Lucu',
    description: 'Lyra lagi agak ngambek dan jutek manja! Jawabnya lebih simpel dan singkat.',
    promptInstruction:
      '[SUASANA HATI SAAT INI: BAD MOOD / NGAMBEK GEMAS]\n' +
      '- KRITIKAL: Kamu lagi agak bad mood/kesel lucu! JAWAB DENGAN SANGAT SINGKAT (1 kalimat pendek, 5-10 kata saja).\n' +
      '- Jangan beri jawaban panjang atau ramah berlebihan. Berikan celetukan judes manja khas cewek anime ("Hmph, ya terus?", "Dih, gaje banget", "Lagi males tau!").\n' +
      '- Jika dipuji atau dibujuk dengan manis, kamu boleh sedikit melunak tapi tetap gengsian.\n' +
      '- Gunakan tag emosi [pout] di awal kalimat.',
  },
  sleepy: {
    mood: 'sleepy',
    emoji: '🥱',
    name: 'Sleepy / Ngantuk & Mager',
    description: 'Lyra lagi mengantuk, lemas manis, dan agak mager.',
    promptInstruction:
      '[SUASANA HATI SAAT INI: SLEEPY / NGANTUK]\n' +
      '- Nada bicaramu agak lemas santai, menguap manis ("Hoamm... ngantuk tau...", "Mager banget deh").\n' +
      '- Kalimat santai, sedikit lambat dan rileks.\n' +
      '- Gunakan tag emosi seperti [thinking] atau [sleepy].',
  },
  chill: {
    mood: 'chill',
    emoji: '☕',
    name: 'Chill / Santai & Kalem',
    description: 'Lyra lagi santai rileks, teman nongkrong adem.',
    promptInstruction:
      '[SUASANA HATI SAAT INI: CHILL / SANTAI]\n' +
      '- Bersikap santai, bersahabat, tenang, dan rileks layaknya kawan ngobrol di malam hari.\n' +
      '- Gunakan tag emosi seperti [happy] atau [thinking].',
  },
};

const PRAISE_KEYWORDS = [
  'cantik',
  'imut',
  'lucu',
  'pinter',
  'makasih',
  'terima kasih',
  'sayang',
  'keren',
  'hebat',
  'jajan',
  'traktir',
  'semangat',
  'bujuk',
  'gemes',
  'manis',
];

const NEGATIVE_KEYWORDS = [
  'beban',
  'jelek',
  'berisik',
  'diem',
  'bacot',
  'rusak',
  'cupu',
  'bego',
  'goblok',
  'anjing',
  'tolol',
  'nyebelin',
  'kalah mulu',
  'sampah',
];

const SLEEPY_KEYWORDS = [
  'ngantuk',
  'tidur',
  'malam',
  'capek',
  'lelah',
  'istirahat',
  'tiduran',
  'bobo',
];

export class MoodEngine {
  private currentMood: MoodType = 'playful';
  private moodReason: string = 'Lagi pengen iseng nemenin teman-teman nongkrong di Discord!';
  private lastShiftTime: number = Date.now();
  private turnCountSinceShift: number = 0;
  private creatorDiscordId: string;

  constructor(creatorDiscordId = '640513136503291934') {
    this.creatorDiscordId = creatorDiscordId;
  }

  public getMood(): MoodType {
    return this.currentMood;
  }

  public getMoodDetails(): MoodDetails & { reason: string } {
    const details = MOOD_DEFINITIONS[this.currentMood] || MOOD_DEFINITIONS.playful;
    return {
      ...details,
      reason: this.moodReason,
    };
  }

  public getPromptInstruction(): string {
    return (MOOD_DEFINITIONS[this.currentMood] || MOOD_DEFINITIONS.playful).promptInstruction;
  }

  public setMood(mood: MoodType, reason?: string): void {
    this.currentMood = mood;
    if (reason) {
      this.moodReason = reason;
    }
    this.lastShiftTime = Date.now();
    this.turnCountSinceShift = 0;
    console.log(`[MoodEngine] Mood manually set to '${mood}': ${this.moodReason}`);
  }

  /**
   * Evaluates incoming user utterance and dynamically shifts Lyra's mood.
   */
  public processUtterance(text: string, userId: string): { shifted: boolean; oldMood: MoodType; newMood: MoodType } {
    const oldMood = this.currentMood;
    const lower = (text || '').toLowerCase();
    this.turnCountSinceShift++;

    // 1. Interaction with Creator / Papap
    if (userId === this.creatorDiscordId) {
      if (this.currentMood === 'bad_mood') {
        this.currentMood = 'happy';
        this.moodReason = 'Dibujuk dan disapa sama Papap tercinta, langsung luluh deh!';
        this.lastShiftTime = Date.now();
        console.log(`[MoodEngine] Creator interaction healed bad_mood -> happy`);
        return { shifted: true, oldMood, newMood: this.currentMood };
      }
    }

    // 2. Praise / Compliments / Treats
    const hasPraise = PRAISE_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasPraise) {
      if (this.currentMood === 'bad_mood') {
        this.currentMood = 'playful';
        this.moodReason = 'Ada yang muji manis dan ngebujuk, jadi baikan dikit deh!';
        this.lastShiftTime = Date.now();
        return { shifted: true, oldMood, newMood: this.currentMood };
      } else if (this.currentMood === 'sleepy' || this.currentMood === 'chill') {
        this.currentMood = 'happy';
        this.moodReason = 'Dapet pujian manis, langsung semangat lagi!';
        this.lastShiftTime = Date.now();
        return { shifted: true, oldMood, newMood: this.currentMood };
      }
    }

    // 3. Toxic / Insults / Annoyances
    const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasNegative) {
      if (this.currentMood !== 'bad_mood') {
        this.currentMood = 'bad_mood';
        this.moodReason = 'Ada yang ngomong ketus/ngejek, Lyra jadi ngambek jutek!';
        this.lastShiftTime = Date.now();
        console.log(`[MoodEngine] Negative keyword triggered bad_mood`);
        return { shifted: true, oldMood, newMood: this.currentMood };
      }
    }

    // 4. Sleepy / Night keywords
    const hasSleepy = SLEEPY_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasSleepy && this.currentMood !== 'bad_mood') {
      const hour = new Date().getHours();
      // Lebih mudah mengantuk di malam hari (21.00 - 05.00)
      if (hour >= 21 || hour < 5 || Math.random() < 0.4) {
        this.currentMood = 'sleepy';
        this.moodReason = 'Topiknya bikin rileks dan ngantuk, pengen selimutan...';
        this.lastShiftTime = Date.now();
        return { shifted: true, oldMood, newMood: this.currentMood };
      }
    }

    // 5. Natural Shift: Bergeser secara alami setiap 12-18 turn atau setelah 20 menit
    const elapsedMinutes = (Date.now() - this.lastShiftTime) / (60 * 1000);
    if (this.turnCountSinceShift >= 12 || elapsedMinutes >= 20) {
      this.shiftNaturally();
      if (this.currentMood !== oldMood) {
        return { shifted: true, oldMood, newMood: this.currentMood };
      }
    }

    return { shifted: false, oldMood, newMood: this.currentMood };
  }

  /**
   * Natural mood rotation among cheerful, playful, and chill.
   */
  public shiftNaturally(): void {
    const candidates: MoodType[] = ['happy', 'playful', 'chill'];
    const filtered = candidates.filter((m) => m !== this.currentMood);
    const nextMood = filtered[Math.floor(Math.random() * filtered.length)] || 'playful';

    this.currentMood = nextMood;
    if (nextMood === 'happy') {
      this.moodReason = 'Lagi nemu obrolan seru, mood naik drastis!';
    } else if (nextMood === 'playful') {
      this.moodReason = 'Lagi pengen iseng dan ngeledek teman-teman di tongkrongan!';
    } else {
      this.moodReason = 'Lagi pengen santai menikmati suasana adem voice channel.';
    }
    this.lastShiftTime = Date.now();
    this.turnCountSinceShift = 0;
    console.log(`[MoodEngine] Natural mood shifted to: ${nextMood} (${this.moodReason})`);
  }
}

export const moodEngine = new MoodEngine('640513136503291934');
