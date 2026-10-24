/**
 * Persona Manager and Dynamic Hot-Reload
 * Implements PRD §7, FR-P1, FR-P5, SEC-7, and Task T2.3:
 * - Loads persona definition files from persona/
 * - Supports hot-reloading via /persona reload without restarting process
 * - Tracks persona version for latency & turn logging
 * - Pre-processes text for TTS (emotion extraction, markdown removal, lexicon pronunciation)
 * - Constructs optimized system prompts for voice and text chat
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface FewShotExample {
  input: string;
  output: string;
}

export interface PersonaState {
  character: string;
  voiceStyle: string;
  rules: string;
  examples: FewShotExample[];
  lexicon: Record<string, string>;
  version: string;
  lastLoadedAt: Date;
}

export interface PersonaReloadResult {
  success: boolean;
  version: string;
  exampleCount: number;
  lexiconCount: number;
  loadedAt: Date;
}

export class PersonaManager {
  private personaDir: string;
  private state: PersonaState;
  private isLoaded = false;

  constructor(personaDir = 'persona') {
    this.personaDir = path.resolve(process.cwd(), personaDir);
    this.state = {
      character: '',
      voiceStyle: '',
      rules: '',
      examples: [],
      lexicon: {},
      version: 'unknown',
      lastLoadedAt: new Date(0),
    };
  }

  /**
   * Load persona files from disk.
   */
  public async load(): Promise<void> {
    const characterPath = path.join(this.personaDir, 'character.md');
    const voiceStylePath = path.join(this.personaDir, 'voice-style.md');
    const rulesPath = path.join(this.personaDir, 'rules.md');
    const examplesPath = path.join(this.personaDir, 'examples.jsonl');
    const lexiconPath = path.join(this.personaDir, 'lexicon.json');

    const [characterRaw, voiceStyleRaw, rulesRaw, examplesRaw, lexiconRaw] = await Promise.all([
      fs.readFile(characterPath, 'utf-8'),
      fs.readFile(voiceStylePath, 'utf-8'),
      fs.readFile(rulesPath, 'utf-8'),
      fs.readFile(examplesPath, 'utf-8'),
      fs.readFile(lexiconPath, 'utf-8'),
    ]);

    // Parse version from header (e.g., # Version: 1.0.0-lyra) or generate fallback
    const versionMatch = characterRaw.match(/# Version:\s*([^\r\n]+)/i);
    const version = versionMatch ? versionMatch[1].trim() : `v1.0.0-${Date.now()}`;

    // Parse few-shot examples
    const examples: FewShotExample[] = examplesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'))
      .map((line) => JSON.parse(line));

    // Parse lexicon dictionary
    const lexicon: Record<string, string> = JSON.parse(lexiconRaw);

    this.state = {
      character: characterRaw.trim(),
      voiceStyle: voiceStyleRaw.trim(),
      rules: rulesRaw.trim(),
      examples,
      lexicon,
      version,
      lastLoadedAt: new Date(),
    };

    this.isLoaded = true;
    console.log(
      `[PersonaManager] Loaded persona '${version}' with ${examples.length} examples and ${Object.keys(lexicon).length} lexicon entries.`
    );
  }

  /**
   * Hot-reload persona files from disk without restarting the server (FR-P1).
   */
  public async reload(): Promise<PersonaReloadResult> {
    await this.load();
    return {
      success: true,
      version: this.state.version,
      exampleCount: this.state.examples.length,
      lexiconCount: Object.keys(this.state.lexicon).length,
      loadedAt: this.state.lastLoadedAt,
    };
  }

  /**
   * Get currently active persona version.
   */
  public getVersion(): string {
    return this.state.version;
  }

  public getCharacter(): string {
    return this.state.character;
  }

  public getVoiceStyle(): string {
    return this.state.voiceStyle;
  }

  public getRules(): string {
    return this.state.rules;
  }

  public getExamples(): FewShotExample[] {
    return this.state.examples;
  }

  public getLexicon(): Record<string, string> {
    return this.state.lexicon;
  }

  public isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Construct unified system instruction for Google Gemini LLM.
   * Tailored for 'voice' (strict speech constraints, emotion tags, max 8 words first sentence)
   * or 'text' (casual Discord chat, no word limits).
   */
  public buildSystemInstruction(mode: 'voice' | 'text' = 'voice'): string {
    const parts: string[] = [];

    // 1. Identity & Character Profile
    parts.push('=== PROFIL KARAKTER & IDENTITAS ===');
    parts.push(this.state.character);

    // 2. Operational Rules, AI Honesty (FR-P5), & Safety (SEC-7)
    parts.push('\n=== ATURAN OPERASIONAL & KESELAMATAN (WAJIB DIPATUHI) ===');
    parts.push(this.state.rules);

    // 3. Mode-specific Rules
    if (mode === 'voice') {
      parts.push('\n=== ATURAN KHUSUS PERCAKAPAN SUARA (VOICE MODE) ===');
      parts.push(this.state.voiceStyle);
      parts.push(
        '\nKRITIKAL UNTUK VOICE:\n' +
        '- Awali kalimat pertama dengan tag emosi (misal [happy], [thinking], [laugh], [teasing], [serious], [surprised]).\n' +
        '- Kalimat pertama WAJIB MAKSIMAL 8 KATA agar audio segera dikirim ke pengguna!\n' +
        '- Jawaban total maksimal 2 sampai 3 kalimat pendek.\n' +
        '- DILARANG menggunakan markdown (**bold**, *italic*), emoji, bullet points, atau simbol kode.'
      );
    } else {
      parts.push('\n=== ATURAN KHUSUS OBROLAN TEKS (TEXT CHAT MODE) ===');
      parts.push(
        '- Bersikap santai, ramah, dan bersahabat seperti di Discord chat.\n' +
        '- Boleh menggunakan formatting teks Discord secara wajar.\n' +
        '- Jangan bertele-tele; berikan jawaban yang padat, seru, dan relevan.'
      );
    }

    // 4. Few-shot Examples
    if (this.state.examples.length > 0) {
      parts.push('\n=== CONTOH GAYA BICARA & RESPON (FEW-SHOT EXAMPLES) ===');
      for (const ex of this.state.examples.slice(0, 8)) {
        parts.push(`User: "${ex.input}" -> Lyra: "${ex.output}"`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Apply phonetic pronunciation dictionary (lexicon.json) to input text.
   * Matches whole words or multi-word phrases case-insensitively.
   */
  public applyLexicon(text: string): string {
    if (!text || Object.keys(this.state.lexicon).length === 0) return text;

    // Build map with lowercased keys for fast case-insensitive lookup
    const lowerMap = new Map<string, string>();
    for (const [key, val] of Object.entries(this.state.lexicon)) {
      lowerMap.set(key.toLowerCase(), val);
    }

    // Sort keys by descending length so multi-word terms (e.g. "voice channel", "mid lane") match first
    const sortedKeys = Array.from(lowerMap.keys()).sort((a, b) => b.length - a.length);
    const escapedKeys = sortedKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const combinedRegex = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

    // Single-pass replacement: matched original text is replaced once and never recursively rescanned
    return text.replace(combinedRegex, (match) => {
      return lowerMap.get(match.toLowerCase()) ?? match;
    });
  }

  /**
   * Extract emotion tag from start of string (e.g., "[happy] Halo semuanya!").
   * Returns emotion identifier and clean text.
   */
  public extractEmotion(text: string): { emotion?: string; cleanText: string } {
    if (!text) return { cleanText: '' };
    const match = text.match(/^\s*\[([a-zA-Z0-9_\-]+)\]\s*(.*)$/s);
    if (match) {
      return {
        emotion: match[1].toLowerCase(),
        cleanText: match[2].trim(),
      };
    }
    return {
      cleanText: text.trim(),
    };
  }

  /**
   * Pre-process text before sending to Text-to-Speech (TTS) synthesis engine:
   * 1. Strips emotion tags like [happy], [thinking]
   * 2. Strips markdown asterisks, hashes, underscores, backticks
   * 3. Strips emojis and unsupported non-verbal symbols
   * 4. Applies lexicon pronunciation mappings
   * 5. Normalizes whitespace
   */
  public cleanForTts(text: string): string {
    if (!text) return '';

    // 1. Remove emotion tags like [happy], [laugh]
    let cleaned = text.replace(/\[[a-zA-Z0-9_\-]+\]/g, '');

    // 2. Remove markdown code blocks and inline code
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // 3. Remove bold, italic, strikethrough, underline, headers
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
    cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
    cleaned = cleaned.replace(/^#+\s+/gm, '');

    // 4. Remove URLs
    cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');

    // 5. Remove emojis
    cleaned = cleaned.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
      ''
    );

    // 6. Apply lexicon pronunciation mapping
    cleaned = this.applyLexicon(cleaned);

    // 7. Normalize redundant spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }
}

// Global Singleton Instance
let defaultManager: PersonaManager | null = null;

export function getPersonaManager(): PersonaManager {
  if (!defaultManager) {
    defaultManager = new PersonaManager();
  }
  return defaultManager;
}
