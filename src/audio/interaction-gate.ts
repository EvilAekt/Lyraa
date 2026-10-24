/**
 * Interaction Mode and Wake Word Gating Manager.
 * Implements PRD FR-V5, FR-T2, and TC-07.
 * Supports:
 * - 'wake': Requires one of configured wake words in transcript to respond.
 * - 'ptt': Requires explicit push-to-talk activation.
 * - 'open': Responds to any spoken utterance passing VAD.
 */

export type InteractionMode = 'wake' | 'ptt' | 'open';

export interface InteractionGateOptions {
  mode?: InteractionMode;
  wakeWords?: string[];
  sessionGracePeriodMs?: number;
}

export interface GateEvaluationResult {
  allowed: boolean;
  reason: 'open_mode' | 'wake_word_matched' | 'wake_word_missing' | 'ptt_active' | 'ptt_inactive' | 'session_active';
  wakeWordMatched?: string;
  cleanedText: string;
  rawText: string;
}

export class InteractionGate {
  private mode: InteractionMode;
  private wakeWords: string[];
  private lastInteractionTimestamps: Map<string, number> = new Map();
  private sessionGracePeriodMs: number;

  constructor(options?: InteractionGateOptions) {
    this.mode = options?.mode || 'wake';
    this.wakeWords = (options?.wakeWords && options.wakeWords.length > 0)
      ? options.wakeWords.map((w) => w.trim().toLowerCase())
      : ['lyra', 'lira', 'airi', 'bot'];
    this.sessionGracePeriodMs = options?.sessionGracePeriodMs ?? 0; // 0 = strict wake word per turn by default
  }

  public getMode(): InteractionMode {
    return this.mode;
  }

  public setMode(mode: InteractionMode) {
    this.mode = mode;
  }

  public getWakeWords(): string[] {
    return [...this.wakeWords];
  }

  public setWakeWords(words: string[]) {
    this.wakeWords = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  }

  /**
   * Resets active session for a specific user or all users.
   */
  public resetSession(userId?: string) {
    if (userId) {
      this.lastInteractionTimestamps.delete(userId);
    } else {
      this.lastInteractionTimestamps.clear();
    }
  }

  /**
   * Evaluates if a transcribed utterance should trigger an AI response.
   */
  public evaluate(
    rawText: string,
    options?: { userId?: string; isPttTriggered?: boolean }
  ): GateEvaluationResult {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return {
        allowed: false,
        reason: 'wake_word_missing',
        cleanedText: '',
        rawText,
      };
    }

    // 1. Open Mode: always allows valid text
    if (this.mode === 'open') {
      return {
        allowed: true,
        reason: 'open_mode',
        cleanedText: trimmed,
        rawText,
      };
    }

    // 2. PTT Mode: requires explicit trigger flag
    if (this.mode === 'ptt') {
      if (options?.isPttTriggered) {
        return {
          allowed: true,
          reason: 'ptt_active',
          cleanedText: trimmed,
          rawText,
        };
      }
      return {
        allowed: false,
        reason: 'ptt_inactive',
        cleanedText: trimmed,
        rawText,
      };
    }

    // 3. Wake Mode: Check active session grace window if enabled
    const userId = options?.userId || 'default';
    const now = Date.now();
    const lastActive = this.lastInteractionTimestamps.get(userId) || 0;

    if (this.sessionGracePeriodMs > 0 && now - lastActive < this.sessionGracePeriodMs) {
      this.lastInteractionTimestamps.set(userId, now);
      return {
        allowed: true,
        reason: 'session_active',
        cleanedText: trimmed,
        rawText,
      };
    }

    // Match Wake Words
    const lower = trimmed.toLowerCase();
    let matchedWord: string | undefined;

    for (const word of this.wakeWords) {
      // Word boundary match (e.g. \blyra\b)
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|[.,!?:;]|$)`, 'i');
      if (regex.test(lower)) {
        matchedWord = word;
        break;
      }
    }

    if (!matchedWord) {
      return {
        allowed: false,
        reason: 'wake_word_missing',
        cleanedText: trimmed,
        rawText,
      };
    }

    // Mark user session active
    this.lastInteractionTimestamps.set(userId, now);

    // Strip leading wake word for natural prompt (e.g., "Lyra, apa kabar?" -> "apa kabar?")
    let cleaned = trimmed;
    const escapedMatched = matchedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripRegex = new RegExp(`^(?:halo|hey|hai)?\\s*${escapedMatched}[,\\s:!?-]*`, 'i');
    cleaned = cleaned.replace(stripRegex, '').trim();

    // If user said only the wake word ("Lyra" or "Halo Lyra"), respond with greeting
    if (!cleaned) {
      cleaned = trimmed;
    }

    return {
      allowed: true,
      reason: 'wake_word_matched',
      wakeWordMatched: matchedWord,
      cleanedText: cleaned,
      rawText,
    };
  }
}
