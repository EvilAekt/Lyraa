import { Message } from 'discord.js';
import { TextGatingEngine, EMPTY_ALLOWED_MENTIONS } from './text-gating.js';
import { validateImageAttachment, ImageProcessor } from './image-handler.js';
import { getLlmProvider } from '../providers/index.js';
import { withTimeout, withRetry, getRandomFallbackPhrase } from '../audio/resilience.js';
import { config } from '../config/index.js';
import { PersonaManager, getPersonaManager, moodEngine } from '../persona/index.js';
import {
  MemoryStore,
  getMemoryStore,
  ConversationContextBuilder,
  FactExtractor,
} from '../memory/index.js';
import { BudgetManager, sanitizeBotOutput } from '../security/index.js';

export interface ChatHandlerOptions {
  gatingEngine: TextGatingEngine;
  imageProcessor?: ImageProcessor;
  personaManager?: PersonaManager;
  memoryStore?: MemoryStore;
  factExtractor?: FactExtractor;
  budgetManager?: BudgetManager;
  systemPrompt?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export class ChatHandler {
  private gating: TextGatingEngine;
  private imageProcessor: ImageProcessor;
  private personaManager: PersonaManager;
  private memoryStore: MemoryStore;
  private contextBuilder: ConversationContextBuilder;
  private factExtractor: FactExtractor;
  private budgetManager: BudgetManager;
  private systemPrompt: string;
  private maxOutputTokens: number;
  private temperature: number;

  constructor(options: ChatHandlerOptions) {
    this.gating = options.gatingEngine;
    this.imageProcessor =
      options.imageProcessor ??
      new ImageProcessor({
        apiKey: config.GEMINI_API_KEY,
        modelName: config.LLM_MODEL,
      });
    this.personaManager = options.personaManager ?? getPersonaManager();
    this.memoryStore = options.memoryStore ?? getMemoryStore();
    this.contextBuilder = new ConversationContextBuilder(this.memoryStore);
    this.factExtractor = options.factExtractor ?? new FactExtractor(this.memoryStore);
    this.budgetManager =
      options.budgetManager ??
      new BudgetManager({
        dailyRequestBudget: config.DAILY_REQUEST_BUDGET,
        dailyTokenBudget: config.DAILY_TOKEN_BUDGET,
      });
    this.systemPrompt =
      options.systemPrompt ??
      'Kamu adalah Lyra, AI VTuber cerdas, ramah, ekspresif, dan ceria. Berikan jawaban yang natural, santai, dan jelas dalam Bahasa Indonesia.';
    this.maxOutputTokens = options.maxOutputTokens ?? 300;
    this.temperature = options.temperature ?? 0.7;
  }

  public getBudgetManager(): BudgetManager {
    return this.budgetManager;
  }

  /**
   * Handle incoming message and generate AI response if gating passes.
   * Returns true if message was processed, false if dropped.
   */
  public async handleMessage(message: Message, botUserId?: string): Promise<boolean> {
    // Drop bot messages immediately
    if (message.author.bot) return false;

    // Check if message is a reply to the bot
    let isReplyToBot = false;
    if (message.reference && message.reference.messageId && botUserId) {
      try {
        const referenced = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = referenced.author.id === botUserId;
      } catch {
        // Message reference couldn't be fetched (deleted or unavailable)
      }
    }

    const channelName = 'name' in message.channel ? (message.channel as any).name : undefined;
    const mentionedUserIds = message.mentions.users.map((u) => u.id);
    const hasAttachments = message.attachments.size > 0;

    const gateResult = this.gating.evaluate({
      authorId: message.author.id,
      authorIsBot: message.author.bot,
      content: message.content,
      channelId: message.channel.id,
      channelName,
      guildId: message.guildId,
      botUserId,
      mentionedUsers: mentionedUserIds,
      isReplyToBot,
      hasAttachments,
    });

    if (!gateResult.allowed) {
      if (gateResult.reason === 'cooldown' && gateResult.retryAfterMs) {
        console.log(
          `[TextChat] [Cooldown] Ignored message from ${message.author.tag} in #${channelName || message.channel.id} (Retry in ${gateResult.retryAfterMs}ms)`
        );
      }
      return false;
    }

    console.log(
      `[TextChat] [Gate: Allowed] Trigger: ${gateResult.triggerType} | User: ${message.author.tag} | Prompt: "${gateResult.cleanedPrompt}" | Attachments: ${message.attachments.size}`
    );

    // Budget & Cost Limit check (PRD §4 FR-A3, SEC-6, TC-16)
    const budgetCheck = this.budgetManager.canProceed();
    if (!budgetCheck.allowed) {
      await message.reply({
        content:
          `⚠️ **Batas Anggaran Harian Tercapai (FR-A3)**\n` +
          `Maaf, kuota harian bot telah mencapai batas maksimum hari ini. Lyra sedang istirahat dan akan aktif kembali esok hari ya!`,
        allowedMentions: EMPTY_ALLOWED_MENTIONS,
      });
      return true;
    }

    // Keep typing indicator active during generation
    const canSendTyping = 'sendTyping' in message.channel;
    let typingInterval: NodeJS.Timeout | undefined;
    if (canSendTyping) {
      (message.channel as any).sendTyping().catch(() => {});
      typingInterval = setInterval(() => {
        (message.channel as any).sendTyping().catch(() => {});
      }, 4000);
    }

    // Branch A: Multimodal Image Understanding (FR-T3, TC-11, SEC-5)
    if (hasAttachments) {
      const attachment = message.attachments.first()!;
      const validation = await validateImageAttachment({
        url: attachment.url,
        size: attachment.size,
        contentType: attachment.contentType,
        name: attachment.name,
      });

      if (!validation.isValid) {
        if (typingInterval) clearInterval(typingInterval);
        await message.reply({
          content: validation.userMessage!,
          allowedMentions: EMPTY_ALLOWED_MENTIONS,
        });
        return true;
      }

      const startImg = Date.now();
      let analysisText = '';

      try {
        const visionPrompt = this.personaManager.isReady()
          ? this.personaManager.buildSystemInstruction('text')
          : this.systemPrompt;

        analysisText = await this.imageProcessor.analyzeImage(
          validation.buffer!,
          validation.mimeType!,
          gateResult.cleanedPrompt,
          visionPrompt
        );
      } catch (err: any) {
        console.error('[TextChat] Multimodal vision analysis failed:', err.message);
        analysisText = getRandomFallbackPhrase();
      } finally {
        if (typingInterval) clearInterval(typingInterval);
      }

      const elapsed = Date.now() - startImg;
      const sanitizedAnalysis = sanitizeBotOutput(analysisText);
      const consumedTokens =
        this.budgetManager.estimateTokens(gateResult.cleanedPrompt || '') +
        this.budgetManager.estimateTokens(sanitizedAnalysis);
      this.budgetManager.recordUsage(consumedTokens);

      await message.reply({
        content:
          `${sanitizedAnalysis}\n\n` +
          `_⚡ Multimodal Vision | Model: \`${this.imageProcessor.getModelName()}\` | Waktu: \`${elapsed}ms\`_`,
        allowedMentions: EMPTY_ALLOWED_MENTIONS,
      });

      console.log(
        `[TextChat] Analyzed image for ${message.author.tag} in #${channelName || message.channel.id} (${elapsed}ms)`
      );
      return true;
    }

    // Branch B: Standard Text Chat Streaming
    const startTime = Date.now();
    let ttftMs = 0;
    let fullReply = '';
    const llmProvider = getLlmProvider();
    const isDegraded = budgetCheck.level === 'degraded';
    const effectiveMaxTokens = this.budgetManager.getAllowedMaxOutputTokens(this.maxOutputTokens);

    try {
      const promptText = gateResult.cleanedPrompt || message.content || '';

      // Process and update dynamic mood based on incoming text
      moodEngine.processUtterance(promptText, message.author.id);

      const isCreator = message.author.id === (config.OWNER_USER_ID || '640513136503291934');
      const relationshipHint = isCreator
        ? `\n[ATURAN PANGGILAN MUTLAK - LAWAN BICARA ADALAH PAPAP / PENCIPTAMU]:\n` +
          `- Pengguna ini adalah PAPAP / AYAH KANDUNG yang menciptakan dan merawat Lyra (Discord ID: 640513136503291934).\n` +
          `- KAMU WAJIB SELALU MEMANGGIL DIA DENGAN SEBUTAN "Papap" ATAU "Ayah"! DILARANG KERAS memanggil nama akun Discord-nya (seperti "Renntt", "Aekt", atau display name-nya)!\n` +
          `- Sikapmu adalah anak perempuan manis yang manja, sayang, bangga, dan penurut tapi suka usil centil pada ayahnya!`
        : `\n[HUBUNGAN LAWAN BICARA]: Teman nongkrong di server Discord. Bersikaplah ramah, asik, seru, dan centil!`;

      const moodHint = `\n${moodEngine.getPromptInstruction()}`;
      const effectiveSystemPrompt = (this.personaManager.isReady()
        ? this.personaManager.buildSystemInstruction('text')
        : this.systemPrompt) + relationshipHint + moodHint;

      // Build safe multi-turn context and passive user facts (PRD §9, FR-P2, FR-P3, SEC-5)
      const promptMessages = this.contextBuilder.buildPromptPayload({
        channelId: message.channel.id,
        userId: message.author.id,
        userName: isCreator ? 'Papap' : (message.author.displayName || message.author.username),
        currentPrompt: promptText,
        systemInstruction: effectiveSystemPrompt,
        maxRecentTurns: 12,
      });

      // Execute LLM stream generation with resilience timeout & retry (T1.7 / T2.1)
      await withRetry(
        async () => {
          const stream = llmProvider.generateStream(
            promptMessages,
            {
              maxOutputTokens: effectiveMaxTokens,
              temperature: this.temperature,
              onFirstToken: (ttft) => {
                ttftMs = ttft;
              },
            }
          );

          fullReply = '';
          for await (const token of stream) {
            fullReply += token;
          }

          if (!fullReply.trim()) {
            throw new Error('LLM generated empty response');
          }
        },
        {
          maxRetries: config.MAX_RETRIES,
          baseDelayMs: config.RETRY_BASE_DELAY_MS,
          onRetry: (err, attempt, delay) => {
            console.warn(
              `[TextChat] [Retry ${attempt}] LLM generation failed: ${err.message}. Retrying in ${delay}ms...`
            );
          },
        }
      );
    } catch (llmErr: any) {
      console.error(`[TextChat] [Error] LLM streaming failed (${llmErr.message}). Using fallback phrase.`);
      fullReply = getRandomFallbackPhrase();
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }

    const totalTimeMs = Date.now() - startTime;
    const sanitizedReply = sanitizeBotOutput(fullReply.trim());
    const modelName = llmProvider.getModelName();
    const recordedInput = gateResult.cleanedPrompt || message.content || '';

    // Record token usage in budget manager (FR-A3)
    const consumedTokens =
      this.budgetManager.estimateTokens(recordedInput) +
      this.budgetManager.estimateTokens(sanitizedReply);
    this.budgetManager.recordUsage(consumedTokens);

    try {
      // SEC-7 & FR-T4: Send message with empty allowed_mentions
      const degradedNotice = isDegraded ? ' | 📉 *Mode Hemat Kuota (Degraded)*' : '';
      await message.reply({
        content:
          `${sanitizedReply}\n\n` +
          `_⚡ Model: \`${modelName}\` | TTFT: \`${ttftMs}ms\` | Total: \`${totalTimeMs}ms\`${degradedNotice}_`,
        allowedMentions: EMPTY_ALLOWED_MENTIONS,
      });

      // Record conversation turn to short-term memory (PRD §9, FR-P2)
      try {
        this.memoryStore.recordTurn({
          sessionId: `text-${message.channel.id}`,
          channelId: message.channel.id,
          userId: message.author.id,
          userName: message.author.displayName || message.author.username,
          userInput: recordedInput,
          botReply: sanitizedReply,
          turnLatencyMs: totalTimeMs,
        });

        // Extract non-sensitive user facts for long-term memory (PRD §9, FR-P3, SEC-10)
        this.factExtractor.processTurnAndSave(message.author.id, recordedInput, 'text_chat');
      } catch (memErr: any) {
        console.warn('[TextChat] Failed to record memory turn:', memErr.message);
      }

      console.log(
        `[TextChat] Replied to ${message.author.tag} in #${channelName || message.channel.id} (${totalTimeMs}ms)`
      );
      return true;
    } catch (sendErr: any) {
      console.error('[TextChat] Failed to send reply message:', sendErr.message);
      return false;
    }
  }
}
