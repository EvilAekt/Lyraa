/**
 * Text Chat Gating & Mention Safety Engine
 * Implements PRD FR-T1, FR-T2, FR-T4, SEC-4, SEC-6, and Test Cases TC-10 & TC-14.
 */

export interface TextGatingOptions {
  botNames?: string[];
  dedicatedChannelNames?: string[];
  dedicatedChannelIds?: string[];
  guildAllowlist?: string[];
  userAllowlist?: string[];
  ownerUserId?: string;
  cooldownMs?: number;
  rateLimitPerMin?: number;
  activeSessionTimeoutMs?: number;
  botEnabled?: boolean;
}

export interface TextGatingContext {
  authorId: string;
  authorIsBot: boolean;
  content: string;
  channelId: string;
  channelName?: string;
  guildId?: string | null;
  botUserId?: string;
  mentionedUsers?: string[];
  isReplyToBot?: boolean;
  hasAttachments?: boolean;
  now?: number;
}

export interface TextGatingResult {
  allowed: boolean;
  reason:
    | 'not_for_bot'
    | 'bot_sender'
    | 'bot_disabled'
    | 'guild_not_allowed'
    | 'user_not_allowed'
    | 'cooldown'
    | 'rate_limited'
    | 'empty_content'
    | 'matched_mention'
    | 'matched_reply'
    | 'matched_wake_name'
    | 'matched_direct_question'
    | 'matched_prefix';
  triggerType?: 'prefix' | 'mention' | 'reply' | 'name' | 'question';
  cleanedPrompt?: string;
  retryAfterMs?: number;
}

export const EMPTY_ALLOWED_MENTIONS = Object.freeze({
  parse: [] as [],
});

/**
 * Sanitize mentions from output text to prevent @everyone, @here, or role pings (FR-T4, TC-14).
 */
export function sanitizeMentions(text: string): string {
  if (!text) return '';
  return text
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&(\d+)>/g, '[@role-$1]');
}

export class TextGatingEngine {
  private botNames: string[];
  private dedicatedChannelNames: string[];
  private dedicatedChannelIds: Set<string>;
  private guildAllowlist: string[];
  private userAllowlist: string[];
  private ownerUserId: string;
  private cooldownMs: number;
  private rateLimitPerMin: number;
  private activeSessionTimeoutMs: number;
  private botEnabled: boolean;

  // Trackers for rate limits and cooldown
  private lastMessageTimestamps = new Map<string, number>();
  private userMessageWindows = new Map<string, number[]>();
  private activeUserSessions = new Map<string, number>();

  constructor(options: TextGatingOptions = {}) {
    this.botNames = options.botNames ?? ['Lyra', 'Lira', 'Airi', 'Bot'];
    this.dedicatedChannelNames = (
      options.dedicatedChannelNames ?? [
        'chat-ai',
        'bot-chat',
        'lyra-chat',
        'obrolan-ai',
        'general-ai',
      ]
    ).map((n) => n.toLowerCase());
    this.dedicatedChannelIds = new Set(options.dedicatedChannelIds ?? []);
    this.guildAllowlist = options.guildAllowlist ?? [];
    this.userAllowlist = options.userAllowlist ?? [];
    this.ownerUserId = options.ownerUserId ?? '';
    this.cooldownMs = options.cooldownMs ?? 3000;
    this.rateLimitPerMin = options.rateLimitPerMin ?? 6;
    this.activeSessionTimeoutMs = options.activeSessionTimeoutMs ?? 60000;
    this.botEnabled = options.botEnabled ?? true;
  }

  public setBotEnabled(enabled: boolean): void {
    this.botEnabled = enabled;
  }

  public isBotEnabled(): boolean {
    return this.botEnabled;
  }

  /**
   * Evaluate an incoming Discord message against gating rules (FR-T1, FR-T2, TC-10).
   */
  public evaluate(context: TextGatingContext): TextGatingResult {
    const now = context.now ?? Date.now();
    const rawContent = (context.content || '').trim();

    // 1. Drop messages from bots (FR-V2 / FR-T1)
    if (context.authorIsBot) {
      return { allowed: false, reason: 'bot_sender' };
    }

    // 2. Kill switch check (FR-A2, SEC-14)
    if (!this.botEnabled) {
      return { allowed: false, reason: 'bot_disabled' };
    }

    // 3. Guild allowlist check (SEC-4)
    if (
      this.guildAllowlist.length > 0 &&
      context.guildId &&
      !this.guildAllowlist.includes(context.guildId)
    ) {
      return { allowed: false, reason: 'guild_not_allowed' };
    }

    // 4. User allowlist check (if populated)
    if (
      this.userAllowlist.length > 0 &&
      !this.userAllowlist.includes(context.authorId) &&
      context.authorId !== this.ownerUserId
    ) {
      return { allowed: false, reason: 'user_not_allowed' };
    }

    // 5. Empty content check
    if (!rawContent && !context.hasAttachments) {
      return { allowed: false, reason: 'empty_content' };
    }

    let isTargeted = false;
    let triggerType: 'prefix' | 'mention' | 'reply' | 'name' | 'question' | undefined;
    let cleanedPrompt = rawContent;

    // A. Explicit Prefix (!chat <prompt>)
    if (rawContent.toLowerCase().startsWith('!chat')) {
      isTargeted = true;
      triggerType = 'prefix';
      cleanedPrompt = rawContent.slice(5).trim();
    }

    // B. Direct Mention of Bot (@Lyra <prompt>)
    if (!isTargeted && context.botUserId) {
      const mentionRegex = new RegExp(`<@!?${context.botUserId}>`, 'g');
      if (
        mentionRegex.test(rawContent) ||
        context.mentionedUsers?.includes(context.botUserId)
      ) {
        isTargeted = true;
        triggerType = 'mention';
        cleanedPrompt = rawContent.replace(mentionRegex, '').trim();
      }
    }

    // C. Reply directly to bot's message
    if (!isTargeted && context.isReplyToBot) {
      isTargeted = true;
      triggerType = 'reply';
    }

    // D. Dedicated channel gating evaluation (FR-T2)
    const isDedicatedChannel = this.isDedicatedChannel(
      context.channelId,
      context.channelName
    );

    if (isDedicatedChannel && !isTargeted) {
      // 1. Check for bot name / wake word in message
      const nameMatch = this.matchBotName(cleanedPrompt);
      if (nameMatch) {
        isTargeted = true;
        triggerType = 'name';
        cleanedPrompt = nameMatch.cleanedPrompt;
      } else {
        // 2. Check for direct question with active session context
        const lastActive = this.activeUserSessions.get(context.authorId) ?? 0;
        const hasRecentSession = now - lastActive < this.activeSessionTimeoutMs;

        if (this.isDirectQuestion(cleanedPrompt, hasRecentSession)) {
          isTargeted = true;
          triggerType = 'question';
        } else if (context.hasAttachments) {
          isTargeted = true;
          triggerType = 'question';
        }
      }
    }

    // If not targeted through any criteria, do not invoke LLM (FR-T2)
    if (!isTargeted) {
      return { allowed: false, reason: 'not_for_bot' };
    }

    if (!cleanedPrompt && context.hasAttachments) {
      cleanedPrompt = 'Tolong komentari apa yang terlihat di gambar ini secara santai dan seru ya!';
    } else if (!cleanedPrompt) {
      return { allowed: false, reason: 'empty_content' };
    }

    // 6. Cooldown & Rate Limiting (SEC-6)
    const isOwner = this.ownerUserId && context.authorId === this.ownerUserId;

    if (!isOwner) {
      // Cooldown check
      const lastTs = this.lastMessageTimestamps.get(context.authorId) ?? 0;
      const elapsed = now - lastTs;
      if (elapsed < this.cooldownMs) {
        return {
          allowed: false,
          reason: 'cooldown',
          retryAfterMs: this.cooldownMs - elapsed,
        };
      }

      // Rate limit check (sliding 60s window)
      const windowStart = now - 60000;
      let timestamps = this.userMessageWindows.get(context.authorId) ?? [];
      timestamps = timestamps.filter((t) => t > windowStart);

      if (timestamps.length >= this.rateLimitPerMin) {
        return { allowed: false, reason: 'rate_limited' };
      }

      // Record this message in rate limiter window
      timestamps.push(now);
      this.userMessageWindows.set(context.authorId, timestamps);
      this.lastMessageTimestamps.set(context.authorId, now);
    }

    // Update active user session timestamp
    this.activeUserSessions.set(context.authorId, now);

    return {
      allowed: true,
      reason:
        triggerType === 'prefix'
          ? 'matched_prefix'
          : triggerType === 'mention'
            ? 'matched_mention'
            : triggerType === 'reply'
              ? 'matched_reply'
              : triggerType === 'name'
                ? 'matched_wake_name'
                : 'matched_direct_question',
      triggerType,
      cleanedPrompt,
    };
  }

  /**
   * Check if channel is dedicated to bot interactions.
   */
  public isDedicatedChannel(channelId: string, channelName?: string): boolean {
    if (this.dedicatedChannelIds.has(channelId)) {
      return true;
    }
    if (channelName) {
      const lower = channelName.toLowerCase();
      return this.dedicatedChannelNames.some(
        (name) => lower === name || lower.includes(name)
      );
    }
    return false;
  }

  /**
   * Check if content contains any bot name/wake word.
   */
  private matchBotName(
    content: string
  ): { matchedName: string; cleanedPrompt: string } | null {
    for (const name of this.botNames) {
      const regex = new RegExp(`(^|[\\s,;!?])${name}([\\s,;!?]|$)`, 'i');
      if (regex.test(content)) {
        // Strip the name while preserving the rest of the prompt
        const cleaned = content
          .replace(new RegExp(`(^|[\\s,;!?])${name}([\\s,;!?]|$)`, 'gi'), ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { matchedName: name, cleanedPrompt: cleaned || content };
      }
    }
    return null;
  }

  /**
   * Determine if text is a direct question towards the bot.
   */
  private isDirectQuestion(text: string, hasRecentSession: boolean): boolean {
    const lower = text.toLowerCase();
    const hasQuestionMark = text.includes('?');

    const questionWords = [
      'apa',
      'siapa',
      'gimana',
      'bagaimana',
      'kenapa',
      'mengapa',
      'kapan',
      'dimana',
      'apakah',
      'bisa',
      'tolong',
      'coba',
      'menurutmu',
      'rekomendasi',
      'jelaskan',
      'tau gak',
      'tahu gak',
    ];

    const startsWithQuestionWord = questionWords.some((q) =>
      lower.startsWith(q)
    );

    // If within recent interactive conversation session, questions or commands are accepted
    if (hasRecentSession && (hasQuestionMark || startsWithQuestionWord)) {
      return true;
    }

    // Direct question starting with question word and ending with '?'
    return startsWithQuestionWord && hasQuestionMark;
  }
}
