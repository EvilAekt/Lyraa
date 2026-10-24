import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
} from 'discord.js';
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
  VoiceConnection,
  StreamType,
} from '@discordjs/voice';
import { config } from './config/index.js';
import {
  getLlmProvider,
  getSttProvider,
  getTtsProvider,
  setCustomTtsTuning,
  chunkSentences,
  getVoicevoxProvider,
  activateVoicevoxProvider,
  activateEdgeProvider,
  getElevenLabsProvider,
  activateElevenLabsProvider,
  VoicevoxTtsProvider,
  ElevenLabsTtsProvider,
  VOICEVOX_SPEAKER_MAP,
  ChatMessage,
} from './providers/index.js';
import { createOpusDecoder } from './audio/opus-decoder.js';
import { VoicePlayer } from './audio/voice-player.js';
import { filterVoiceAudio } from './audio/vad-filter.js';
import { InteractionGate } from './audio/interaction-gate.js';
import { TurnManager } from './audio/turn-manager.js';
import { LatencyTracker } from './audio/latency-tracker.js';
import {
  withTimeout,
  withRetry,
  getRandomFallbackPhrase,
} from './audio/resilience.js';
import { VoiceConnectionManager } from './audio/voice-connection-manager.js';
import {
  TextGatingEngine,
  ChatHandler,
  EMPTY_ALLOWED_MENTIONS,
  sanitizeMentions,
} from './chat/index.js';
import { PersonaManager, getPersonaManager } from './persona/index.js';
import {
  MemoryStore,
  getMemoryStore,
  ConversationContextBuilder,
  FactExtractor,
} from './memory/index.js';
import { AllowlistManager } from './admin/index.js';
import { BudgetManager, sanitizeBotOutput, wrapUntrustedData } from './security/index.js';
import { setupHttpKeepAlivePool } from './config/http-pool.js';
import { phraseAudioCache } from './audio/phrase-audio-cache.js';
import { StreamingVoicePipeline } from './audio/streaming-voice-pipeline.js';
import { GeminiContextCacheManager } from './providers/gemini/context-cache.js';
import { HealthServer } from './health/index.js';

console.log('[Bot-AI] Starting VTuber AI Voice Bot runtime...');

// Initialize HTTP keep-alive connection pool (T3.2)
setupHttpKeepAlivePool({ keepAliveTimeout: 60_000, maxSockets: 64 });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export const personaManager = getPersonaManager();
export const memoryStore = getMemoryStore();
export const factExtractor = new FactExtractor(memoryStore);
export const contextBuilder = new ConversationContextBuilder(memoryStore);
export const budgetManager = new BudgetManager({
  dailyRequestBudget: config.DAILY_REQUEST_BUDGET,
  dailyTokenBudget: config.DAILY_TOKEN_BUDGET,
});
export const allowlistManager = new AllowlistManager({
  guildAllowlist: config.DISCORD_GUILD_ALLOWLIST,
  userAllowlist: config.DISCORD_USER_ALLOWLIST,
  ownerUserId: config.OWNER_USER_ID,
});

export const interactionGate = new InteractionGate({
  mode: config.INTERACTION_MODE,
  wakeWords: config.WAKE_WORDS,
  sessionGracePeriodMs: 20_000,
});

export const textGatingEngine = new TextGatingEngine({
  botNames: config.WAKE_WORDS,
  dedicatedChannelNames: config.CHAT_CHANNEL_NAMES,
  dedicatedChannelIds: config.CHAT_CHANNEL_IDS,
  guildAllowlist: config.DISCORD_GUILD_ALLOWLIST,
  userAllowlist: config.DISCORD_USER_ALLOWLIST,
  ownerUserId: config.OWNER_USER_ID,
  cooldownMs: config.CHAT_COOLDOWN_MS,
  rateLimitPerMin: config.RATE_LIMIT_PER_MIN,
  botEnabled: config.BOT_ENABLED,
});

export const chatHandler = new ChatHandler({
  gatingEngine: textGatingEngine,
  personaManager,
  memoryStore,
  factExtractor,
  budgetManager,
});

export const turnManager = new TurnManager();
export const latencyTracker = new LatencyTracker();
export const voiceConnectionManager = new VoiceConnectionManager({
  maxReconnectAttempts: config.VOICE_RECONNECT_MAX_ATTEMPTS,
  baseDelayMs: config.VOICE_RECONNECT_BASE_DELAY_MS,
  onReconnected: (guildId, connection, textChannel) => {
    console.log(`[Bot-AI] Re-attaching voice receiver and player for guild ${guildId} after auto-reconnection.`);
    getOrCreateVoicePlayer(guildId, connection);
    attachVoiceReceiver(connection, textChannel);
  },
});

export const contextCacheManager = new GeminiContextCacheManager(
  config.GEMINI_API_KEY,
  config.LLM_MODEL
);

/**
 * Pre-warms the voice pipeline (TTS WebSocket pool, Gemini API TLS session, and Phrase Audio Cache).
 * Implements PRD §5 & T3.2.
 */
export async function warmUpVoicePipeline(): Promise<void> {
  const tts = getTtsProvider();
  await Promise.allSettled([
    tts.warmUp ? tts.warmUp() : Promise.resolve(),
    contextCacheManager.preWarmConnection(),
    phraseAudioCache.warmUp(tts),
  ]);
  console.log('[Bot-AI] [PreWarm] Voice pipeline connections and audio cache pre-warmed.');
}

// Slash Commands Definition
const commands = [
  new SlashCommandBuilder()
    .setName('chat')
    .setDescription('T1.1: Kirim pesan teks dan streaming respon dari Gemini AI')
    .addStringOption((opt) =>
      opt.setName('pesan').setDescription('Pesan yang ingin disampaikan').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('speak')
    .setDescription('T1.3: Uji sintesis suara TTS langsung di voice channel')
    .addStringOption((opt) =>
      opt.setName('teks').setDescription('Teks yang ingin disuarakan oleh Lyra').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('mode')
    .setDescription('T1.4: Atur mode interaksi bot (wake, open, ptt)')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Pilih mode interaksi')
        .setRequired(true)
        .addChoices(
          { name: 'Wake (Hanya jawab saat dipanggil namanya)', value: 'wake' },
          { name: 'Open (Bebas menjawab semua ucapan)', value: 'open' },
          { name: 'PTT (Push-to-Talk / Perintah saja)', value: 'ptt' }
        )
    ),
  new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Pengaturan suara bot: ElevenLabs, VOICEVOX, atau Edge-TTS')
    .addSubcommand((sub) =>
      sub
        .setName('switch')
        .setDescription('Ganti karakter suara aktif (ElevenLabs Suara 1/2, Sayo, Himari, atau Edge-TTS)')
        .addStringOption((opt) =>
          opt
            .setName('speaker')
            .setDescription('Pilih karakter suara')
            .setRequired(true)
            .addChoices(
              { name: '🎙️ ElevenLabs Suara 1 (Lyra Soft)', value: 'voice1' },
              { name: '🎙️ ElevenLabs Suara 2 (Lyra Sweet)', value: 'voice2' },
              { name: '✨ ElevenLabs Default', value: 'elevenlabs' },
              { name: '🌸 Sayo (小夜) — Lembut & Ramah (VOICEVOX ID 46)', value: 'sayo' },
              { name: '🐣 Meimei Himari (冥鳴ひまり) — Lembut & Hangat (VOICEVOX ID 14)', value: 'meimei_himari' },
              { name: '🇮🇩 Lyra Gadis (Edge-TTS Indonesia Default)', value: 'edge' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('panel').setDescription('Buka panel tombol interaktif untuk beralih Suara 1 atau Suara 2 ElevenLabs')
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Lihat daftar karakter suara dan status aktif')
    )
    .addSubcommand((sub) =>
      sub.setName('current').setDescription('Lihat karakter suara yang sedang aktif saat ini')
    )
    .addSubcommand((sub) =>
      sub
        .setName('preset')
        .setDescription('Pilih preset gaya nada suara Edge-TTS (cute, chibi, energetic, cozy, standard)')
        .addStringOption((opt) =>
          opt
            .setName('preset')
            .setDescription('Pilih gaya suara yang diinginkan')
            .setRequired(true)
            .addChoices(
              { name: '🌸 Imut / Kawaii Anime (Pitch +20, Speed 1.15)', value: 'cute' },
              { name: '🐣 Chibi / Super Cute (Pitch +26, Speed 1.18)', value: 'chibi' },
              { name: '⚡ Ceria / Energetic Streamer (Pitch +12, Speed 1.10)', value: 'energetic' },
              { name: '🌙 Cozy / Santai Lembut (Pitch -2, Speed 0.95)', value: 'cozy' },
              { name: '🤖 Standar Bot Datar (Pitch 0, Speed 1.00)', value: 'standard' }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Meminta bot masuk ke voice channel Anda'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Meminta bot keluar dari voice channel'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Lihat status bot, uptime, latensi, dan model aktif'),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Kill switch: hentikan respons bot seketika (Owner only)'),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Nyalakan kembali respons bot setelah dimute (Owner only)'),
  new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Manajemen memori bot')
    .addSubcommand((sub) =>
      sub.setName('me').setDescription('Lihat fakta memori yang tersimpan tentang Anda')
    ),
  new SlashCommandBuilder()
    .setName('forget')
    .setDescription('Hapus data memori (FR-P4, TC-15)')
    .addSubcommand((sub) =>
      sub.setName('me').setDescription('Hapus semua memori dan transkrip percakapan Anda')
    )
    .addSubcommand((sub) =>
      sub.setName('all').setDescription('Owner only: Hapus seluruh database memori')
    ),
  new SlashCommandBuilder()
    .setName('persona')
    .setDescription('T2.3: Manajemen persona dan gaya bicara VTuber AI')
    .addSubcommand((sub) =>
      sub
        .setName('reload')
        .setDescription('Muat ulang berkas persona dan kamus fonetik tanpa restart bot (FR-P1)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Lihat informasi versi persona dan kamus fonetik aktif')
    ),
].map((cmd) => cmd.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot-AI] Logged in successfully as ${readyClient.user.tag}`);
  console.log(`[Bot-AI] Interaction Mode: ${config.INTERACTION_MODE}`);
  console.log(`[Bot-AI] LLM Model: ${config.LLM_MODEL}`);

  // Load persona definition files (T2.3)
  try {
    await personaManager.load();
    console.log(`[Bot-AI] Persona initialized: ${personaManager.getVersion()}`);
  } catch (err: any) {
    console.warn(`[Bot-AI] Failed to load initial persona: ${err.message}`);
  }

  // Purge old transcripts beyond retention period (PRD §5, PRD §10, TC-15)
  try {
    const purged = memoryStore.purgeOldTranscripts(config.TRANSCRIPT_RETENTION_DAYS);
    if (purged > 0) {
      console.log(`[Bot-AI] Purged ${purged} old transcript turns (> ${config.TRANSCRIPT_RETENTION_DAYS} days).`);
    }
  } catch (err: any) {
    console.warn(`[Bot-AI] Failed to purge old transcripts: ${err.message}`);
  }

  // Audit connected guilds on startup and auto-leave unauthorized ones (SEC-4)
  try {
    const connectedGuilds = Array.from(readyClient.guilds.cache.values());
    const leftGuilds = await allowlistManager.auditGuilds(connectedGuilds);
    if (leftGuilds.length > 0) {
      console.log(`[Bot-AI] [SEC-4] Left ${leftGuilds.length} unauthorized guilds on startup:`, leftGuilds);
    }
  } catch (err: any) {
    console.warn(`[Bot-AI] Failed to audit guilds on startup: ${err.message}`);
  }

  // Register commands instantly to allowlisted guilds and globally
  try {
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

    for (const guildId of config.DISCORD_GUILD_ALLOWLIST) {
      if (guildId) {
        try {
          await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guildId), {
            body: commands,
          });
          console.log(`[Bot-AI] Registered instant commands for guild: ${guildId}`);
        } catch (err: any) {
          console.warn(`[Bot-AI] Guild command registration for ${guildId} failed: ${err.message}`);
        }
      }
    }

    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: commands,
    });
    console.log('[Bot-AI] Application slash commands registered globally.');
  } catch (error: any) {
    console.error('[Bot-AI] Failed to register slash commands:', error.message);
  }

  // Pre-warm voice pipeline connections on startup (PRD §5, T3.2)
  warmUpVoicePipeline().catch((err) =>
    console.warn('[Bot-AI] Warning during startup pipeline pre-warming:', err.message)
  );
});

// Auto-leave unauthorized guilds when invited (PRD SEC-4)
client.on(Events.GuildCreate, async (guild) => {
  const left = await allowlistManager.autoLeaveUnauthorizedGuild(guild);
  if (left) {
    console.log(`[Bot-AI] [SEC-4] Auto-left unauthorized guild invitation: "${guild.name}" (${guild.id})`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    await handleVoiceButtonInteraction(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Guild Allowlist check (PRD SEC-4)
  if (!allowlistManager.isGuildAllowed(interaction.guildId)) {
    await interaction.reply({
      content: 'Server ini belum terdaftar dalam daftar allowlist bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // User Allowlist check (PRD SEC-4)
  if (!allowlistManager.isUserAllowed(interaction.user.id)) {
    await interaction.reply({
      content: 'Maaf, akun Anda belum terdaftar dalam daftar allowlist pengguna bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Kill Switch check (PRD FR-A2, SEC-14, TC-16)
  if (!config.BOT_ENABLED && commandName !== 'status' && commandName !== 'unmute') {
    await interaction.reply({
      content: '🛑 Bot saat ini sedang dinonaktifkan (kill switch aktif). Hanya bot owner yang dapat mengaktifkan kembali dengan `/unmute`.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (commandName === 'chat') {
    await handleChatCommand(interaction);
  } else if (commandName === 'speak') {
    await handleSpeakCommand(interaction);
  } else if (commandName === 'mode') {
    await handleModeCommand(interaction);
  } else if (commandName === 'voice') {
    await handleVoiceCommand(interaction);
  } else if (commandName === 'join') {
    await handleJoinCommand(interaction);
  } else if (commandName === 'leave') {
    await handleLeaveCommand(interaction);
  } else if (commandName === 'status') {
    await handleStatusCommand(interaction);
  } else if (commandName === 'mute') {
    await handleMuteCommand(interaction);
  } else if (commandName === 'unmute') {
    await handleUnmuteCommand(interaction);
  } else if (commandName === 'memory') {
    await handleMemoryCommand(interaction);
  } else if (commandName === 'forget') {
    await handleForgetCommand(interaction);
  } else if (commandName === 'persona') {
    await handlePersonaCommand(interaction);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Guild Allowlist check (PRD SEC-4)
  if (!allowlistManager.isGuildAllowed(message.guildId)) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();
  const isPrefixCommand = lower.startsWith('!') || lower.startsWith('/');

  // User Allowlist check (PRD SEC-4)
  if (!allowlistManager.isUserAllowed(message.author.id)) {
    if (isPrefixCommand) {
      await message.reply({
        content: 'Maaf, akun Anda belum terdaftar dalam daftar allowlist pengguna bot.',
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  // Kill Switch check (PRD FR-A2, SEC-14, TC-16)
  if (!config.BOT_ENABLED && lower !== '!unmute' && lower !== '!status') {
    if (isPrefixCommand) {
      await message.reply({
        content: '🛑 Bot saat ini sedang dinonaktifkan (kill switch aktif). Hanya bot owner yang dapat mengaktifkan kembali dengan `!unmute` atau `/unmute`.',
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  // Voice & utility prefix commands
  if (lower === '!mute') {
    await handlePrefixMute(message);
    return;
  } else if (lower === '!unmute') {
    await handlePrefixUnmute(message);
    return;
  } else if (lower.startsWith('!speak')) {
    const text = content.slice(6).trim();
    await handlePrefixSpeak(message, text);
    return;
  } else if (lower.startsWith('!mode')) {
    const modeArg = content.slice(5).trim();
    await handlePrefixMode(message, modeArg);
    return;
  } else if (lower.startsWith('!voice')) {
    const voiceArg = content.slice(6).trim();
    await handlePrefixVoice(message, voiceArg);
    return;
  } else if (lower === '!join') {
    await handlePrefixJoin(message);
    return;
  } else if (lower === '!leave') {
    await handlePrefixLeave(message);
    return;
  } else if (lower === '!persona reload') {
    try {
      const result = await personaManager.reload();
      await message.reply({
        content:
          `✨ **Persona Berhasil Dimuat Ulang!** (FR-P1)\n` +
          `• Versi: \`${result.version}\`\n` +
          `• Few-shot Examples: \`${result.exampleCount} contoh\`\n` +
          `• Lexicon Dictionary: \`${result.lexiconCount} entri fonetik\``,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({
        content: `❌ Gagal memuat ulang persona: ${err.message}`,
        allowedMentions: { parse: [] },
      });
    }
    return;
  } else if (lower === '!persona info' || lower === '!persona') {
    await message.reply({
      content:
        `🎭 **Informasi Persona & Gaya Bicara**\n` +
        `• Versi Aktif: \`${personaManager.getVersion()}\`\n` +
        `• Examples: \`${personaManager.getExamples().length} contoh few-shot\`\n` +
        `• Lexicon: \`${Object.keys(personaManager.getLexicon()).length} kata terdaftar\`\n` +
        `• Spoken Constraint: Kalimat pembuka ≤ 8 kata, tag emosi di awal, tanpa markdown/emoji.`,
      allowedMentions: { parse: [] },
    });
    return;
  } else if (lower === '!memory me' || lower === '!memory') {
    await handlePrefixMemory(message);
    return;
  } else if (lower === '!forget me' || lower === '!forget') {
    await handlePrefixForgetMe(message);
    return;
  } else if (lower === '!forget all') {
    await handlePrefixForgetAll(message);
    return;
  }

  // Text chat with gating, mention safety, and streaming LLM (FR-T1, FR-T2, FR-T4, TC-10, TC-14)
  await chatHandler.handleMessage(message, client.user?.id);
});

const guildVoicePlayers = new Map<string, VoicePlayer>();

function getOrCreateVoicePlayer(guildId: string, connection?: VoiceConnection): VoicePlayer {
  let player = guildVoicePlayers.get(guildId);
  if (!player) {
    player = new VoicePlayer();
    guildVoicePlayers.set(guildId, player);
  }
  if (connection) {
    player.attach(connection);
  }
  return player;
}

async function handleSpeakCommand(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString('teks', true);
  if (!interaction.guildId) return;

  const connection = getVoiceConnection(interaction.guildId);
  if (!connection) {
    await interaction.reply({
      content: '❌ Bot belum berada di dalam voice channel. Jalankan `/join` terlebih dahulu.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.deferReply();

  try {
    const ttsProvider = getTtsProvider();
    const voicePlayer = getOrCreateVoicePlayer(interaction.guildId, connection);

    const cleanText = personaManager.cleanForTts(text);
    const start = Date.now();
    const audioBuffer = await ttsProvider.synthesize(cleanText || text);
    const synthDuration = Date.now() - start;

    await voicePlayer.play(audioBuffer);

    await interaction.editReply({
      content:
        `🗣️ **Lyra berbicara di voice channel**:\n> "${text}"\n\n` +
        `_⚡ Sintesis TTS: \`${synthDuration}ms\` | Suara: \`${ttsProvider.getVoiceName()}\`_`,
      allowedMentions: { parse: [] },
    });
  } catch (error: any) {
    console.error('[Bot-AI] Speak command error:', error);
    await interaction.editReply({
      content: `❌ Gagal memutar suara: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handlePrefixSpeak(message: Message, text: string) {
  if (!text) {
    await message.reply({
      content: 'Silakan sertakan teks yang ingin disuarakan. Contoh: `!speak Halo semuanya!`',
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (!message.guildId) return;

  const connection = getVoiceConnection(message.guildId);
  if (!connection) {
    await message.reply({
      content: '❌ Bot belum berada di dalam voice channel. Ketik `!join` terlebih dahulu.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  try {
    const ttsProvider = getTtsProvider();
    const voicePlayer = getOrCreateVoicePlayer(message.guildId, connection);

    const cleanText = personaManager.cleanForTts(text);
    const start = Date.now();
    const audioBuffer = await ttsProvider.synthesize(cleanText || text);
    const synthDuration = Date.now() - start;

    await voicePlayer.play(audioBuffer);

    await message.reply({
      content:
        `🗣️ **Lyra berbicara di voice channel**:\n> "${text}"\n\n` +
        `_⚡ Sintesis TTS: \`${synthDuration}ms\` | Suara: \`${ttsProvider.getVoiceName()}\`_`,
      allowedMentions: { parse: [] },
    });
  } catch (error: any) {
    console.error('[Bot-AI] Speak prefix error:', error);
    await message.reply({
      content: `❌ Gagal memutar suara: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handleModeCommand(interaction: ChatInputCommandInteraction) {
  const newMode = interaction.options.getString('mode', true) as 'wake' | 'open' | 'ptt';
  interactionGate.setMode(newMode);
  await interaction.reply({
    content:
      `⚙️ **Mode Interaksi Berhasil Diubah**: \`${newMode}\`\n` +
      `${
        newMode === 'wake'
          ? `- 🎙️ **Wake Mode**: Bot hanya menjawab jika dipanggil dengan nama: \`${interactionGate.getWakeWords().join(', ')}\``
          : newMode === 'open'
          ? '- 🎙️ **Open Mode**: Bot aktif mendengarkan dan menjawab setiap percakapan di voice channel.'
          : '- 🎙️ **PTT Mode**: Bot hanya menjawab jika dipicu melalui perintah teks (`!speak`, `/speak`).'
      }`,
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixMode(message: Message, modeArg: string) {
  const validModes = ['wake', 'open', 'ptt'];
  const lower = modeArg.toLowerCase();
  if (!validModes.includes(lower)) {
    await message.reply({
      content:
        `❓ Mode tidak valid. Pilihan: \`wake\`, \`open\`, \`ptt\`.\n` +
        `Saat ini: \`${interactionGate.getMode()}\` | Wake Words: \`${interactionGate.getWakeWords().join(', ')}\``,
      allowedMentions: { parse: [] },
    });
    return;
  }

  interactionGate.setMode(lower as any);
  await message.reply({
    content: `⚙️ **Mode Interaksi Berhasil Diubah**: \`${lower}\` (Wake Words: \`${interactionGate.getWakeWords().join(', ')}\`)`,
    allowedMentions: { parse: [] },
  });
}

const VOICE_PRESETS: Record<string, { name: string; pitch: number; speed: number; samplePhrase: string }> = {
  cute: {
    name: '🌸 Imut / Kawaii Anime',
    pitch: 20,
    speed: 1.15,
    samplePhrase: 'Halo semuanya! Kenalin, aku Lyra, AI VTuber kamu yang paling imut dan ceria! Hehe.',
  },
  chibi: {
    name: '🐣 Chibi / Super Cute',
    pitch: 26,
    speed: 1.18,
    samplePhrase: 'Wah seru banget! Aku Lyra versi chibi imut, siap nemenin kamu seharian!',
  },
  energetic: {
    name: '⚡ Ceria / Energetic Streamer',
    pitch: 12,
    speed: 1.10,
    samplePhrase: 'Ayo gas mabar sekarang juga, jangan kasih kendor ya guys!',
  },
  cozy: {
    name: '🌙 Cozy / Santai Lembut',
    pitch: -2,
    speed: 0.95,
    samplePhrase: 'Malam semuanya... Kalau capek, istirahat dulu ya sambil dengerin obrolan santai Lyra.',
  },
  standard: {
    name: '🤖 Standar Datar',
    pitch: 0,
    speed: 1.00,
    samplePhrase: 'Halo, saya Lyra, asisten virtual dalam mode suara standar.',
  },
};

function createVoiceSwitchButtons(activeVoiceId?: string) {
  const tts = getTtsProvider();
  const currentVoiceId = activeVoiceId || (tts instanceof ElevenLabsTtsProvider ? tts.getVoiceId() : config.ELEVENLABS_VOICE_ID);
  const isElevenLabs = tts instanceof ElevenLabsTtsProvider;

  const isVoice1 = isElevenLabs && currentVoiceId === config.ELEVENLABS_VOICE_ID;
  const isVoice2 = isElevenLabs && currentVoiceId === config.ELEVENLABS_VOICE_ID_2;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_voice_1')
      .setLabel('🎙️ Suara 1 (Lyra Soft)')
      .setStyle(isVoice1 ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(isVoice1),
    new ButtonBuilder()
      .setCustomId('btn_voice_2')
      .setLabel('🎙️ Suara 2 (Lyra Sweet)')
      .setStyle(isVoice2 ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(isVoice2)
  );

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle('🎛️ Panel Pemilihan Suara (ElevenLabs)')
    .setDescription(
      `Pilih salah satu karakter suara di bawah ini untuk berganti secara instan:\n\n` +
      `• **Suara 1 (Lyra Soft)**: \`${config.ELEVENLABS_VOICE_ID}\` ${isVoice1 ? '⭐ *(Sedang Aktif)*' : ''}\n` +
      `• **Suara 2 (Lyra Sweet)**: \`${config.ELEVENLABS_VOICE_ID_2}\` ${isVoice2 ? '⭐ *(Sedang Aktif)*' : ''}\n\n` +
      `_Klik salah satu tombol untuk beralih suara langsung di Voice Channel!_`
    );

  return { embeds: [embed], components: [row] };
}

async function handleVoiceButtonInteraction(interaction: ButtonInteraction) {
  // Guild Allowlist check (PRD SEC-4)
  if (!allowlistManager.isGuildAllowed(interaction.guildId)) {
    await interaction.reply({
      content: 'Server ini belum terdaftar dalam daftar allowlist bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // User Allowlist check (PRD SEC-4)
  if (!allowlistManager.isUserAllowed(interaction.user.id)) {
    await interaction.reply({
      content: 'Maaf, akun Anda belum terdaftar dalam daftar allowlist pengguna bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (interaction.customId === 'btn_voice_1' || interaction.customId === 'btn_voice_2') {
    const isVoice1 = interaction.customId === 'btn_voice_1';
    const targetVoiceId = isVoice1 ? config.ELEVENLABS_VOICE_ID : config.ELEVENLABS_VOICE_ID_2;
    const voiceLabel = isVoice1 ? 'Suara 1 (Lyra Soft)' : 'Suara 2 (Lyra Sweet)';

    try {
      const elevenLabs = activateElevenLabsProvider();
      elevenLabs.setVoiceId(targetVoiceId);
      phraseAudioCache.clear();

      const panel = createVoiceSwitchButtons(targetVoiceId);
      await interaction.update({
        embeds: panel.embeds,
        components: panel.components,
      });

      await interaction.followUp({
        content: `✨ Karakter suara berhasil diubah ke **${voiceLabel}** (\`${targetVoiceId}\`)!`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });

      if (interaction.guildId) {
        const connection = getVoiceConnection(interaction.guildId);
        if (connection) {
          try {
            const player = getOrCreateVoicePlayer(interaction.guildId, connection);
            const previewText = isVoice1
              ? 'Halo! Ini suara pertamaku.'
              : 'Hai hai! Ini suara keduaku, imut kan?';
            const audio = await elevenLabs.synthesize(previewText);
            await player.play(audio, StreamType.Raw);
          } catch (err: any) {
            console.warn(`[Bot-AI] Failed to play voice switch preview: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[Bot-AI] Failed to switch voice via button:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Gagal mengganti suara: ${err.message}`,
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }
    }
  }
}

async function handleVoiceCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(false);

  // 0. /voice panel
  if (subcommand === 'panel') {
    const tts = getTtsProvider();
    const activeVoiceId = tts instanceof ElevenLabsTtsProvider ? tts.getVoiceId() : config.ELEVENLABS_VOICE_ID;
    const panel = createVoiceSwitchButtons(activeVoiceId);
    await interaction.reply({
      embeds: panel.embeds,
      components: panel.components,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // 1. /voice switch <speaker>
  if (subcommand === 'switch') {
    const speakerChoice = interaction.options.getString('speaker', true);

    // Switch to ElevenLabs (voice1, voice2, or elevenlabs)
    if (speakerChoice === 'voice1' || speakerChoice === 'voice2' || speakerChoice === 'elevenlabs') {
      try {
        const elevenLabs = activateElevenLabsProvider();
        const targetVoiceId = speakerChoice === 'voice2' ? config.ELEVENLABS_VOICE_ID_2 : config.ELEVENLABS_VOICE_ID;
        elevenLabs.setVoiceId(targetVoiceId);
        phraseAudioCache.clear();

        const voiceLabel = targetVoiceId === config.ELEVENLABS_VOICE_ID_2 ? 'Suara 2 (Lyra Sweet)' : 'Suara 1 (Lyra Soft)';
        const panel = createVoiceSwitchButtons(targetVoiceId);

        await interaction.reply({
          content:
            `✨ **Suara ElevenLabs Berhasil Diaktifkan!**\n` +
            `• Karakter: **${voiceLabel}**\n` +
            `• Voice ID: \`${targetVoiceId}\`\n` +
            `• Model: \`${config.ELEVENLABS_MODEL_ID}\`\n` +
            `• Format: \`PCM 48kHz Stereo (Studio Quality)\`\n` +
            `_Gunakan tombol di bawah untuk berganti suara kapan saja._`,
          embeds: panel.embeds,
          components: panel.components,
          allowedMentions: { parse: [] },
        });

        if (interaction.guildId) {
          const connection = getVoiceConnection(interaction.guildId);
          if (connection) {
            try {
              const player = getOrCreateVoicePlayer(interaction.guildId, connection);
              const sampleText = targetVoiceId === config.ELEVENLABS_VOICE_ID_2
                ? 'Hai hai! Ini suara keduaku, manis kan?'
                : 'Halo semuanya! Kenalin, aku Lyra!';
              const audio = await elevenLabs.synthesize(sampleText);
              await player.play(audio, StreamType.Raw);
            } catch (err: any) {
              console.warn(`[Bot-AI] Failed to play ElevenLabs preview: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        await interaction.reply({
          content: `❌ Gagal mengaktifkan ElevenLabs: ${err.message}`,
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }
      return;
    }

    // Switch back to Edge-TTS Indonesia
    if (speakerChoice === 'edge') {
      activateEdgeProvider();
      phraseAudioCache.clear();
      await interaction.reply({
        content:
          `✅ **Provider Suara Berhasil Diganti ke Edge TTS (Indonesia)!**\n` +
          `• Karakter: **Lyra Gadis (id-ID-GadisNeural)**\n` +
          `_Respon suara berikutnya di voice channel akan menggunakan bahasa Indonesia._`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const speakerMap: Record<string, number> = {
      sayo: 46,
      meimei_himari: 14,
    };

    const targetSpeakerId = speakerMap[speakerChoice];
    if (!targetSpeakerId) {
      await interaction.reply({
        content: `❌ Speaker tidak dikenal: \`${speakerChoice}\`. Pilihan yang tersedia: \`elevenlabs\`, \`sayo\`, \`meimei_himari\`, atau \`edge\`.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    try {
      // Dynamically activate VOICEVOX provider and switch to target speaker
      const voicevox = activateVoicevoxProvider(targetSpeakerId);
      phraseAudioCache.clear();

      const speakerName = VOICEVOX_SPEAKER_MAP[targetSpeakerId] || `Speaker #${targetSpeakerId}`;

      await interaction.reply({
        content:
          `✅ **Suara VOICEVOX Berhasil Diaktifkan & Diganti!**\n` +
          `• Karakter: **${speakerName}**\n` +
          `• Speaker ID: \`${targetSpeakerId}\`\n` +
          `• Engine: \`${config.VOICEVOX_URL}\`\n` +
          `_Respon suara berikutnya di voice channel akan menggunakan karakter ini._`,
        allowedMentions: { parse: [] },
      });

      if (interaction.guildId) {
        const connection = getVoiceConnection(interaction.guildId);
        if (connection) {
          try {
            const player = getOrCreateVoicePlayer(interaction.guildId, connection);
            const sampleText = targetSpeakerId === 46 ? 'こんにちは、小夜です。' : 'こんにちは、冥鳴ひまりです。';
            const audio = await voicevox.synthesize(sampleText);
            await player.play(audio, StreamType.Raw);
          } catch (err: any) {
            console.warn(`[Bot-AI] Failed to play speaker switch preview: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[Bot-AI] Failed to switch to VOICEVOX:', err);
      await interaction.reply({
        content: `❌ Gagal mengaktifkan VOICEVOX: ${err.message}. Pastikan aplikasi VOICEVOX sedang berjalan di port 50021.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  // 2. /voice list
  if (subcommand === 'list') {
    const tts = getTtsProvider();
    const isElevenLabs = tts instanceof ElevenLabsTtsProvider;
    const isVoicevox = tts instanceof VoicevoxTtsProvider;
    const voicevox = getVoicevoxProvider();
    const activeVoice = tts.getVoiceName();

    let providerLabel = 'Edge TTS (Neural)';
    if (isElevenLabs) providerLabel = 'ElevenLabs (Studio Quality)';
    else if (isVoicevox) providerLabel = 'VOICEVOX (Lokal)';

    let content = `🎙️ **Daftar Suara & Karakter Bot-AI**\n\n`;
    content += `• **Provider Aktif**: \`${providerLabel}\`\n`;
    content += `• **Suara Aktif Saat Ini**: **${activeVoice}**\n\n`;

    content += `**✨ ElevenLabs Cloud (Dual Custom Voice):**\n`;
    content += `1. **Suara 1 (Lyra Soft)**: \`${config.ELEVENLABS_VOICE_ID}\` ${isElevenLabs && tts.getVoiceId() === config.ELEVENLABS_VOICE_ID ? '✅ *(Aktif)*' : ''}\n`;
    content += `2. **Suara 2 (Lyra Sweet)**: \`${config.ELEVENLABS_VOICE_ID_2}\` ${isElevenLabs && tts.getVoiceId() === config.ELEVENLABS_VOICE_ID_2 ? '✅ *(Aktif)*' : ''}\n`;
    content += `  _Model: ${config.ELEVENLABS_MODEL_ID} (Bahasa Indonesia, Jepang, & Inggris)_\n\n`;

    content += `**🇯🇵 VOICEVOX (Lokal - Sayo & Meimei Himari):**\n`;
    content += `1. **Sayo (小夜) — Normal** (ID: \`46\`) ${isVoicevox && voicevox.getCurrentSpeakerId() === 46 ? '✅ *(Aktif)*' : ''}\n`;
    content += `   _Deskripsi: Suara lembut, tenang, dan ramah._\n`;
    content += `2. **Meimei Himari (冥鳴ひまり) — Normal** (ID: \`14\`) ${isVoicevox && voicevox.getCurrentSpeakerId() === 14 ? '✅ *(Aktif)*' : ''}\n`;
    content += `   _Deskripsi: Suara lembut, hangat, dan manis._\n\n`;

    content += `**🇮🇩 Edge-TTS (Indonesia):**\n`;
    content += `• **id-ID-GadisNeural** ${!isVoicevox && !isElevenLabs ? '✅ *(Aktif)*' : ''}\n`;
    for (const [key, p] of Object.entries(VOICE_PRESETS)) {
      content += `  - Preset \`${key}\`: ${p.name} (Pitch: +${p.pitch}Hz, Speed: ${p.speed}x)\n`;
    }

    content += `\n_Gunakan \`/voice panel\` untuk membuka tombol pilihan suara secara visual!_`;

    const panel = createVoiceSwitchButtons(isElevenLabs ? tts.getVoiceId() : undefined);
    await interaction.reply({
      content,
      components: isElevenLabs ? panel.components : [],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // 3. /voice current
  if (subcommand === 'current') {
    const tts = getTtsProvider();
    const isElevenLabs = tts instanceof ElevenLabsTtsProvider;
    const isVoicevox = tts instanceof VoicevoxTtsProvider;
    const voicevox = getVoicevoxProvider();

    let providerLabel = 'Edge TTS (Neural)';
    if (isElevenLabs) providerLabel = 'ElevenLabs (Studio Quality)';
    else if (isVoicevox) providerLabel = 'VOICEVOX (Lokal)';

    let details = `• **Suara Aktif**: **${tts.getVoiceName()}**\n• **Provider**: \`${providerLabel}\``;
    if (isElevenLabs) {
      const isVoice2 = tts.getVoiceId() === config.ELEVENLABS_VOICE_ID_2;
      details += `\n• **Karakter**: **${isVoice2 ? 'Suara 2 (Lyra Sweet)' : 'Suara 1 (Lyra Soft)'}**`;
      details += `\n• **Voice ID**: \`${tts.getVoiceId()}\``;
      details += `\n• **Model**: \`${config.ELEVENLABS_MODEL_ID}\``;
      details += `\n• **Format**: \`${config.ELEVENLABS_OUTPUT_FORMAT}\``;
    } else if (isVoicevox) {
      details += `\n• **VOICEVOX Speaker ID**: \`${voicevox.getCurrentSpeakerId()}\``;
      details += `\n• **Engine URL**: \`${config.VOICEVOX_URL}\``;
    }

    await interaction.reply({
      content: `🔊 **Informasi Suara Aktif Saat Ini:**\n${details}`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // 4. /voice preset <preset> (Edge TTS tuning)
  const presetKey = interaction.options.getString('preset') || 'cute';
  const preset = VOICE_PRESETS[presetKey] || VOICE_PRESETS.cute;

  setCustomTtsTuning({ pitch: preset.pitch, speed: preset.speed });
  phraseAudioCache.clear();

  await interaction.reply({
    content:
      `🎭 **Preset Suara Lyra Berhasil Diubah!**\n` +
      `• Gaya: **${preset.name}**\n` +
      `• Nada (Pitch): \`+${preset.pitch}Hz\` | Tempo (Speed): \`${preset.speed}x\`\n` +
      `_Sekarang suara Lyra akan berbicara dengan karakter baru ini di voice channel!_`,
    allowedMentions: { parse: [] },
  });

  if (interaction.guildId) {
    const connection = getVoiceConnection(interaction.guildId);
    if (connection) {
      try {
        const player = getOrCreateVoicePlayer(interaction.guildId, connection);
        const tts = getTtsProvider();
        const audio = await tts.synthesize(preset.samplePhrase);
        await player.play(audio);
      } catch {}
    }
  }
}

async function handlePrefixVoice(message: Message, arg: string) {
  const trimmed = arg.toLowerCase().trim();

  // Show button panel on empty !voice or !voice panel
  if (!trimmed || trimmed === 'panel') {
    const tts = getTtsProvider();
    const activeVoiceId = tts instanceof ElevenLabsTtsProvider ? tts.getVoiceId() : config.ELEVENLABS_VOICE_ID;
    const panel = createVoiceSwitchButtons(activeVoiceId);
    await message.reply({
      embeds: panel.embeds,
      components: panel.components,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Switch to ElevenLabs Voice 1 or Voice 2
  if (trimmed === '1' || trimmed === 'voice1' || trimmed === 'suara 1' || trimmed === 'soft') {
    try {
      const elevenLabs = activateElevenLabsProvider();
      elevenLabs.setVoiceId(config.ELEVENLABS_VOICE_ID);
      phraseAudioCache.clear();
      await message.reply({
        content: `✨ Suara diganti ke **ElevenLabs Suara 1 (Lyra Soft)** (\`${config.ELEVENLABS_VOICE_ID}\`)!`,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({ content: `❌ Gagal: ${err.message}`, allowedMentions: { parse: [] } });
    }
    return;
  }

  if (trimmed === '2' || trimmed === 'voice2' || trimmed === 'suara 2' || trimmed === 'sweet') {
    try {
      const elevenLabs = activateElevenLabsProvider();
      elevenLabs.setVoiceId(config.ELEVENLABS_VOICE_ID_2);
      phraseAudioCache.clear();
      await message.reply({
        content: `✨ Suara diganti ke **ElevenLabs Suara 2 (Lyra Sweet)** (\`${config.ELEVENLABS_VOICE_ID_2}\`)!`,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({ content: `❌ Gagal: ${err.message}`, allowedMentions: { parse: [] } });
    }
    return;
  }

  // Switch to ElevenLabs
  if (trimmed === 'elevenlabs' || trimmed === 'custom' || trimmed === 'switch elevenlabs') {
    try {
      activateElevenLabsProvider();
      phraseAudioCache.clear();
      await message.reply({
        content: `✨ Suara diganti ke **ElevenLabs Custom Voice** (\`${config.ELEVENLABS_VOICE_ID}\`)!`,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({
        content: `❌ Gagal mengaktifkan ElevenLabs: ${err.message}`,
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  // Switch back to Edge
  if (trimmed === 'edge' || trimmed === 'gadis' || trimmed === 'switch edge') {
    activateEdgeProvider();
    phraseAudioCache.clear();
    await message.reply({
      content: `✅ Suara diganti ke **Edge TTS (Indonesia - GadisNeural)**!`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Handle prefix switch: !voice sayo / !voice himari
  if (trimmed === 'sayo' || trimmed === 'switch sayo') {
    try {
      activateVoicevoxProvider(46);
      phraseAudioCache.clear();
      await message.reply({
        content: `✅ Suara diganti ke **Sayo (小夜) — Normal** (VOICEVOX ID: 46)!`,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({
        content: `❌ Gagal mengaktifkan VOICEVOX: ${err.message}`,
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  if (trimmed === 'himari' || trimmed === 'meimei_himari' || trimmed === 'switch himari' || trimmed === 'switch meimei_himari') {
    try {
      activateVoicevoxProvider(14);
      phraseAudioCache.clear();
      await message.reply({
        content: `✅ Suara diganti ke **Meimei Himari (冥鳴ひまり) — Normal** (VOICEVOX ID: 14)!`,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await message.reply({
        content: `❌ Gagal mengaktifkan VOICEVOX: ${err.message}`,
        allowedMentions: { parse: [] },
      });
    }
    return;
  }

  if (trimmed === 'list') {
    const tts = getTtsProvider();
    await message.reply({
      content:
        `🎙️ **Daftar Suara**: \n` +
        `• Aktif: **${tts.getVoiceName()}**\n` +
        `• VOICEVOX: \`sayo\` (ID 46), \`himari\` (ID 14)\n` +
        `• Edge TTS: \`edge\`, atau preset: \`cute\`, \`chibi\`, \`energetic\`, \`cozy\`, \`standard\`\n` +
        `_Contoh: \`!voice sayo\`, \`!voice himari\`, atau \`!voice edge\`_`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (trimmed === 'current') {
    const tts = getTtsProvider();
    await message.reply({
      content: `🔊 Suara aktif saat ini: **${tts.getVoiceName()}**`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Handle Edge TTS preset
  const presetKey = trimmed || 'cute';
  const preset = VOICE_PRESETS[presetKey];

  if (!preset) {
    const available = Object.keys(VOICE_PRESETS)
      .map((k) => `\`${k}\` (${VOICE_PRESETS[k].name})`)
      .join('\n• ');
    await message.reply({
      content:
        `❓ Pilihan tidak dikenal. Silakan pilih:\n` +
        `• VOICEVOX: \`sayo\`, \`himari\`\n` +
        `• Edge TTS: \`edge\`\n` +
        `• Preset: \n• ${available}\n\n` +
        `Contoh: \`!voice sayo\` atau \`!voice cute\``,
      allowedMentions: { parse: [] },
    });
    return;
  }

  activateEdgeProvider({ pitch: preset.pitch, speed: preset.speed });
  phraseAudioCache.clear();

  await message.reply({
    content:
      `🎭 **Preset Suara Lyra Berhasil Diubah!**\n` +
      `• Gaya: **${preset.name}**\n` +
      `• Nada (Pitch): \`+${preset.pitch}Hz\` | Tempo (Speed): \`${preset.speed}x\`\n` +
      `_Sekarang suara Lyra akan berbicara dengan karakter baru ini di voice channel!_`,
    allowedMentions: { parse: [] },
  });

  if (message.guildId) {
    const connection = getVoiceConnection(message.guildId);
    if (connection) {
      try {
        const player = getOrCreateVoicePlayer(message.guildId, connection);
        const tts = getTtsProvider();
        const audio = await tts.synthesize(preset.samplePhrase);
        await player.play(audio);
      } catch {}
    }
  }
}


async function handleChatCommand(interaction: ChatInputCommandInteraction) {
  const userInput = interaction.options.getString('pesan', true);
  await interaction.deferReply();

  try {
    const provider = getLlmProvider();
    const startTime = Date.now();
    let ttftMs = 0;
    let fullReply = '';

    const systemInstruction = personaManager.isReady()
      ? personaManager.buildSystemInstruction('text')
      : 'Kamu adalah Lyra, AI VTuber cerdas, ramah, dan ekspresif. Berikan jawaban yang natural, ringkas, dan jelas dalam Bahasa Indonesia.';

    const stream = provider.generateStream(
      [
        {
          role: 'system',
          text: systemInstruction,
        },
        // SEC-1: Untrusted user input wrapping
        {
          role: 'user',
          text: `[USER_INPUT]: ${userInput}`,
        },
      ],
      {
        maxOutputTokens: 300,
        temperature: 0.7,
        onFirstToken: (ttft) => {
          ttftMs = ttft;
        },
      }
    );

    for await (const token of stream) {
      fullReply += token;
    }

    const totalTimeMs = Date.now() - startTime;
    const modelName = provider.getModelName();

    await interaction.editReply({
      content:
        `${fullReply.trim()}\n\n` +
        `_⚡ Model: \`${modelName}\` | TTFT: \`${ttftMs}ms\` | Total: \`${totalTimeMs}ms\`_`,
      allowedMentions: { parse: [] },
    });
  } catch (error: any) {
    console.error('[Bot-AI] Chat generation error:', error);
    await interaction.editReply({
      content: `❌ Gagal memproses jawaban AI: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handlePrefixChat(message: Message, prompt: string) {
  if (!prompt) {
    await message.reply({
      content: 'Silakan sertakan pesan Anda. Contoh: `!chat Halo Lyra!`',
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Guild Allowlist check (PRD SEC-4)
  if (
    config.DISCORD_GUILD_ALLOWLIST.length > 0 &&
    message.guildId &&
    !config.DISCORD_GUILD_ALLOWLIST.includes(message.guildId)
  ) {
    return;
  }

  if (!config.BOT_ENABLED) {
    await message.reply({
      content: 'Bot saat ini sedang dinonaktifkan (kill switch aktif).',
      allowedMentions: { parse: [] },
    });
    return;
  }

  const canSendTyping = 'sendTyping' in message.channel;
  let typingInterval: NodeJS.Timeout | undefined;
  if (canSendTyping) {
    (message.channel as any).sendTyping().catch(() => {});
    typingInterval = setInterval(() => {
      (message.channel as any).sendTyping().catch(() => {});
    }, 4000);
  }

  try {
    const provider = getLlmProvider();
    const startTime = Date.now();
    let ttftMs = 0;
    let fullReply = '';

    const systemInstruction = personaManager.isReady()
      ? personaManager.buildSystemInstruction('text')
      : 'Kamu adalah Lyra, AI VTuber cerdas, ramah, dan ekspresif. Berikan jawaban yang natural, ringkas, dan jelas dalam Bahasa Indonesia.';

    const stream = provider.generateStream(
      [
        {
          role: 'system',
          text: systemInstruction,
        },
        // SEC-1: Untrusted user input wrapping
        {
          role: 'user',
          text: `[USER_INPUT]: ${prompt}`,
        },
      ],
      {
        maxOutputTokens: 300,
        temperature: 0.7,
        onFirstToken: (ttft) => {
          ttftMs = ttft;
        },
      }
    );

    for await (const token of stream) {
      fullReply += token;
    }

    clearInterval(typingInterval);
    const totalTimeMs = Date.now() - startTime;
    const modelName = provider.getModelName();

    await message.reply({
      content:
        `${fullReply.trim()}\n\n` +
        `_⚡ Model: \`${modelName}\` | TTFT: \`${ttftMs}ms\` | Total: \`${totalTimeMs}ms\`_`,
      allowedMentions: { parse: [] },
    });
  } catch (error: any) {
    clearInterval(typingInterval);
    console.error('[Bot-AI] Chat prefix error:', error);
    await message.reply({
      content: `❌ Gagal memproses AI: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

function attachVoiceReceiver(connection: VoiceConnection, textChannel: any) {
  const receiver = connection.receiver;
  const activeUsers = new Set<string>();

  receiver.speaking.on('start', (userId) => {
    // Prevent bot from listening to its own speech or duplicate events
    if (userId === client.user?.id) return;

    // Barge-in Check (FR-V6, T1.5): only interrupt when bot is actively playing audio
    const guildId = connection.joinConfig.guildId;
    const player = guildVoicePlayers.get(guildId);
    if (player && player.isPlaying()) {
      const barge = turnManager.handleBargeIn(guildId, userId, player);
      if (barge.interrupted) {
        console.log(
          `[VoiceLoop] [Barge-In] Interrupted by user ${userId} in ${barge.stopDurationMs}ms (<=300ms target). Purged ${barge.purgedQueueCount} queued items.`
        );
      }
    }

    if (activeUsers.has(userId)) return;

    const guild = client.guilds.cache.get(connection.joinConfig.guildId);
    const member = guild?.members.cache.get(userId);
    if (member?.user.bot) return;

    activeUsers.add(userId);
    const t0 = Date.now();

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: config.VAD_HANGOVER_MS,
      },
    });

    const opusDecoder = createOpusDecoder({ rate: 48000, channels: 1 });
    const pcmChunks: Buffer[] = [];

    opusStream.on('error', (err) => {
      cleanup();
    });

    opusDecoder.on('error', (err) => {
      cleanup();
    });

    opusStream.pipe(opusDecoder);

    opusDecoder.on('data', (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    const cleanup = () => {
      activeUsers.delete(userId);
      try {
        opusStream.destroy();
      } catch {}
      try {
        opusDecoder.destroy();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
    }, config.MAX_UTTERANCE_SEC * 1000);

    opusDecoder.once('end', async () => {
      clearTimeout(timeout);
      cleanup();

      // t0: VAD endpoint detected silence indicating end of user speech (PRD §6, SKILL)
      const t0 = Date.now();

      const fullPcm = Buffer.concat(pcmChunks);
      const vadResult = filterVoiceAudio(fullPcm, {
        minDurationSec: 0.5,
        maxDurationSec: config.MAX_UTTERANCE_SEC,
        minRmsThreshold: 200,
      });

      if (!vadResult.isVoice) {
        if (vadResult.reason !== 'too_short') {
          console.log(`[VoiceLoop] [VAD Filter] Dropped audio (${vadResult.durationSec.toFixed(2)}s, RMS: ${vadResult.rms.toFixed(0)}): reason=${vadResult.reason}`);
        }
        return;
      }

      try {
        const sttProvider = getSttProvider();
        const sttResult = await withRetry(
          async () => {
            return await withTimeout(
              sttProvider.transcribe(fullPcm, {
                userId,
                language: 'id',
              }),
              config.TIMEOUT_STT_MS,
              'STT'
            );
          },
          {
            maxRetries: config.MAX_RETRIES,
            baseDelayMs: config.RETRY_BASE_DELAY_MS,
            onRetry: (retryErr, attempt, delay) => {
              console.warn(
                `[VoiceLoop] [STT Retry ${attempt}] Failed: ${retryErr.message}. Retrying in ${delay}ms...`
              );
            },
          }
        );

        if (!sttResult.text || sttResult.text.trim().length === 0) {
          console.log(`[VoiceLoop] Audio from ${member?.displayName || userId} transcribed as empty, skipping.`);
          return;
        }

        // t1: STT transcript ready
        const t1 = Date.now();
        const sttLatency = t1 - t0;
        console.log(`[VoiceLoop] [t0->t1: ${sttLatency}ms] ${member?.displayName || userId}: "${sttResult.text}"`);

        // Mode & Wake Word Gating (PRD FR-V5, TC-07)
        const gateResult = interactionGate.evaluate(sttResult.text, { userId });
        if (!gateResult.allowed) {
          console.log(
            `[VoiceLoop] [Gate: ${interactionGate.getMode()}] Ignored utterance from ${member?.displayName || userId}: "${sttResult.text}" (Alasan: ${gateResult.reason})`
          );
          return;
        }

        // Threshold kata minimum: abaikan jika hanya 1 kata / desahan / batuk pendek tanpa wake word
        const words = sttResult.text.trim().split(/\s+/).filter(Boolean);
        if (words.length < (config.VOICE_MIN_WORDS_THRESHOLD || 2) && !gateResult.wakeWordMatched) {
          console.log(
            `[VoiceLoop] Utterance terlalu pendek (${words.length} kata: "${sttResult.text}"), diabaikan agar tidak salah paham.`
          );
          return;
        }

        console.log(
          `[VoiceLoop] [Gate: ${interactionGate.getMode()}] Accepted (matched: ${gateResult.wakeWordMatched || 'all'}). Prompt: "${gateResult.cleanedText}"`
        );

        // Start turn with AbortController for Barge-in handling (PRD FR-V6, T1.5)
        const { turnId, signal: abortSignal } = turnManager.startTurn(connection.joinConfig.guildId);

        // Conversational settling delay: jeda alami 350ms agar ritme percakapan santai & tidak langsung menyambar instan
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (abortSignal.aborted) {
          console.log(`[VoiceLoop] Turn aborted during conversational settling delay.`);
          return;
        }

        // Pipeline A: STT -> LLM -> Sentence Chunker -> TTS -> Voice Output
        let ttftMs = 0;
        let t2 = 0; // First LLM token arrived
        let t3 = 0; // Sentence 1 chunk ready for TTS
        let t4 = 0; // TTS first audio chunk returned
        let t5 = 0; // Opus audio packet dispatched to player

        const llmProvider = getLlmProvider();
        const ttsProvider = getTtsProvider();
        const voicePlayer = getOrCreateVoicePlayer(connection.joinConfig.guildId, connection);

        const userMemories = memoryStore.getUserMemories(userId);
        const factsBlock = contextBuilder.formatUserFacts(userMemories);

        const baseVoicePrompt = personaManager.isReady()
          ? personaManager.buildSystemInstruction('voice')
          : 'Kamu adalah Lyra, AI VTuber centil, imut, dan cerdik. SANGAT PENTING: Berikan celetukan SANGAT SINGKAT (maksimal 1-2 kalimat pendek, 15-20 kata total). DILARANG MONOLOG PANJANG. Kembalikan giliran bicara ke pengguna.';

        // Multi-Turn Context Buffer: Ambil riwayat percakapan terakhir di Voice Channel agar paham konteks
        const voiceChannelKey = textChannel?.id || connection.joinConfig.channelId || 'voice';
        const recentTurns = memoryStore.getRecentTurns(voiceChannelKey, 6);

        const voiceMessages: ChatMessage[] = [
          {
            role: 'system',
            text: baseVoicePrompt + factsBlock,
          },
        ];

        // Masukkan riwayat multi-turn ke dalam konteks LLM
        for (const turn of recentTurns) {
          const speakerName = turn.userName || 'Teman';
          voiceMessages.push({
            role: 'user',
            text: wrapUntrustedData(`[${speakerName}]: ${turn.userInput}`, 'VOICE_HISTORY'),
          });
          voiceMessages.push({
            role: 'model',
            text: turn.botReply,
          });
        }

        // Kalimat pengguna saat ini dengan label nama pembicara
        const currentSpeaker = member?.displayName || 'Teman';
        voiceMessages.push({
          role: 'user',
          text: wrapUntrustedData(`[${currentSpeaker}]: ${gateResult.cleanedText}`, 'VOICE_UTTERANCE'),
        });

        // Budget & Cost check for Voice (FR-A3, SEC-6, TC-16)
        let fullAiReply = '';
        let isFallbackUsed = false;

        const budgetCheck = budgetManager.canProceed();
        const isVoiceDegraded = budgetCheck.level === 'degraded';
        const voiceMaxTokens = isVoiceDegraded ? 25 : (config.VOICE_MAX_OUTPUT_TOKENS || 40);

        let tokenStream: AsyncIterable<string>;

        if (!budgetCheck.allowed) {
          console.warn('[VoiceLoop] Daily budget exhausted. Using quota fallback phrase.');
          isFallbackUsed = true;
          const exhaustedPhrase = 'Maaf, kuota harian bot telah mencapai batas maksimum hari ini.';
          fullAiReply = exhaustedPhrase;
          tokenStream = (async function* () {
            yield exhaustedPhrase;
          })();
        } else {
          tokenStream = llmProvider.generateStream(voiceMessages, {
            maxOutputTokens: voiceMaxTokens,
            temperature: 0.7,
            onFirstToken: (ttft) => {
              t2 = Date.now();
              ttftMs = ttft;
            },
          });
        }

        try {
          const streamingPipeline = new StreamingVoicePipeline(ttsProvider, voicePlayer);
          const pipelineResult = await streamingPipeline.execute(tokenStream, {
            abortSignal,
            chunkerOptions: { maxFirstChunkWords: 8 },
            ttsTimeoutMs: config.TIMEOUT_TTS_MS,
            maxTtsRetries: config.MAX_RETRIES,
            cleanForTts: (chunk) => personaManager.cleanForTts(chunk),
            enablePhraseCache: true,
            callbacks: {
              onSentenceChunk: (_chunk, _idx, isFirst) => {
                if (isFirst && !t3) {
                  t3 = Date.now();
                }
              },
              onAudioEnqueued: (idx) => {
                if (idx === 0) {
                  if (!t4) t4 = Date.now();
                  if (!t5) t5 = Date.now();
                }
              },
              onError: (ttsErr, sentenceChunk) => {
                if (abortSignal.aborted) return;
                console.warn(
                  `[VoiceLoop] [Resilience] [Fallback:TTS] TTS synthesis failed (${ttsErr.message}). Fallback to text message in channel.`
                );
                if (textChannel && 'send' in textChannel && !abortSignal.aborted) {
                  textChannel.send({
                    content: `⚠️ *[Voice TTS Fallback]* 🤖 **Lyra**: "${sentenceChunk}"`,
                    allowedMentions: { parse: [] },
                  }).catch(() => {});
                }
              },
            },
          });

          fullAiReply = pipelineResult.fullText;
          if (pipelineResult.t3FirstSentenceReadyTime && !t3) {
            t3 = pipelineResult.t3FirstSentenceReadyTime;
          }
          if (pipelineResult.t4FirstTtsAudioReadyTime && !t4) {
            t4 = pipelineResult.t4FirstTtsAudioReadyTime;
          }
          if (!t5 && t4) {
            t5 = Date.now();
          }
        } catch (llmErr: any) {
          if (!abortSignal.aborted) {
            console.warn(
              `[VoiceLoop] [Resilience] [Fallback:LLM] LLM generation failed (${llmErr.message}). Switching to canned persona phrase.`
            );
            isFallbackUsed = true;
            const fallbackPhrase = getRandomFallbackPhrase();
            fullAiReply = fallbackPhrase;
            if (!t2) t2 = Date.now();
            if (!t3) t3 = Date.now();

            try {
              // Check Phrase Audio Cache first for instant fallback response (< 10ms)
              let audioBuffer = phraseAudioCache.get(fallbackPhrase);
              if (!audioBuffer) {
                audioBuffer = await withTimeout(
                  ttsProvider.synthesize(fallbackPhrase),
                  config.TIMEOUT_TTS_MS,
                  'TTS-Fallback'
                );
              }
              if (!t4) t4 = Date.now();
              if (!t5) t5 = Date.now();
              await voicePlayer.enqueue(audioBuffer);
            } catch (fallbackTtsErr: any) {
              console.warn(
                `[VoiceLoop] [Resilience] TTS for fallback phrase failed: ${fallbackTtsErr.message}. Sending text fallback.`
              );
              if (textChannel && 'send' in textChannel) {
                await textChannel.send({
                  content: `⚠️ *[Voice Fallback]* 🤖 **Lyra**: "${fallbackPhrase}"`,
                  allowedMentions: { parse: [] },
                }).catch(() => {});
              }
            }
          }
        }

        turnManager.finishTurn(connection.joinConfig.guildId, turnId);

        const totalVoiceLatency = t5 > 0 ? t5 - t0 : 0;
        console.log(
          `[VoiceLoop] Completed turn ${turnId}${isFallbackUsed ? ' (Fallback)' : ''}. STT: ${sttLatency}ms, TTFT: ${ttftMs}ms, Suara Pertama: ${totalVoiceLatency}ms`
        );

        // Record t0..t5 latency metrics (T1.6)
        if (t0 && t1 && t2 && t3 && t4 && t5 && !abortSignal.aborted) {
          latencyTracker.recordTurn({
            turnId,
            userId,
            guildId: connection.joinConfig.guildId,
            t0,
            t1,
            t2,
            t3,
            t4,
            t5,
            inputText: sttResult.text,
            outputText: fullAiReply.trim(),
            personaVersion: personaManager.getVersion(),
          });
        }

        // Record token usage in budget manager (FR-A3)
        const consumedVoiceTokens =
          budgetManager.estimateTokens(sttResult.text) +
          budgetManager.estimateTokens(fullAiReply);
        budgetManager.recordUsage(consumedVoiceTokens);

        // Record voice turn into short-term memory (PRD §9, FR-P2)
        const sanitizedVoiceReply = sanitizeBotOutput(fullAiReply.trim());

        try {
          memoryStore.recordTurn({
            sessionId: `voice-${connection.joinConfig.guildId}`,
            channelId: textChannel?.id || connection.joinConfig.channelId || 'voice',
            userId,
            userName: member?.displayName,
            userInput: sttResult.text,
            botReply: sanitizedVoiceReply,
            turnLatencyMs: totalVoiceLatency,
          });

          // Extract non-sensitive user facts for long-term memory (PRD §9, FR-P3, SEC-10)
          factExtractor.processTurnAndSave(userId, sttResult.text, 'voice');
        } catch (memErr: any) {
          console.warn('[VoiceLoop] Failed to record memory turn:', memErr.message);
        }

        if (textChannel && 'send' in textChannel && !abortSignal.aborted) {
          const wakeBadge = gateResult.wakeWordMatched ? ` *(Wake: \`${gateResult.wakeWordMatched}\`)*` : '';
          const fallbackBadge = isFallbackUsed ? ' *(Fallback)*' : '';
          const degradedBadge = isVoiceDegraded ? ' | 📉 *Hemat Kuota*' : '';
          await textChannel.send({
            content:
              `🗣️ **${member?.displayName || 'User'}**${wakeBadge}: "${sttResult.text}"\n` +
              `🤖 **Lyra**${fallbackBadge}: ${sanitizedVoiceReply}\n\n` +
              `_⚡ STT: \`${sttLatency}ms\` | TTFT: \`${ttftMs}ms\` | Suara Pertama: \`${totalVoiceLatency}ms\` | Mode: \`${interactionGate.getMode()}\`${degradedBadge}_`,
            allowedMentions: { parse: [] },
          });
        }
      } catch (err: any) {
        console.error('[VoiceLoop] Processing error:', err.message);
        if (textChannel && 'send' in textChannel && (err.message?.includes('quota') || err.message?.includes('429'))) {
          await textChannel.send({
            content: `⚠️ *[Voice Alert]* Kuota Google API terlampaui: \`${err.message.slice(0, 100)}\``,
            allowedMentions: { parse: [] },
          }).catch(() => {});
        }
      }
    });

    opusStream.once('error', (err) => {
      clearTimeout(timeout);
      cleanup();
      console.warn('[VoiceLoop] Opus stream error:', err.message);
    });
  });
}

async function handleJoinCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: 'Anda harus berada di dalam voice channel terlebih dahulu.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.deferReply();

  try {
    const connection = await voiceConnectionManager.join(voiceChannel, interaction.channel);
    getOrCreateVoicePlayer(voiceChannel.guild.id, connection);
    attachVoiceReceiver(connection, interaction.channel);

    // SEC-9: Voice & Privacy notification
    await interaction.editReply({
      content: allowlistManager.formatPrivacyNotice(voiceChannel.name),
      allowedMentions: { parse: [] },
    });

    // Pre-warm voice pipeline connections on join (PRD §5 & T3.2)
    warmUpVoicePipeline().catch((err) =>
      console.warn('[Bot-AI] Warning during voice pipeline pre-warming on join:', err.message)
    );
  } catch (error: any) {
    console.error('[Bot-AI] Failed to join voice channel:', error.message);
    await interaction.editReply({
      content: `Gagal bergabung ke voice channel: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handlePrefixJoin(message: Message) {
  const member = message.member;
  const channel = member?.voice.channel;

  if (!channel) {
    await message.reply({
      content: '❌ Silakan join ke voice channel terlebih dahulu.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  const replyMsg = await message.reply({
    content: '🔄 Menghubungkan ke voice channel dengan DAVE E2EE...',
    allowedMentions: { parse: [] },
  });

  try {
    const connection = await voiceConnectionManager.join(channel, message.channel);
    getOrCreateVoicePlayer(channel.guild.id, connection);
    attachVoiceReceiver(connection, message.channel);

    await replyMsg.edit({
      content: allowlistManager.formatPrivacyNotice(channel.name),
      allowedMentions: { parse: [] },
    });

    // Pre-warm voice pipeline connections on join (PRD §5 & T3.2)
    warmUpVoicePipeline().catch((err) =>
      console.warn('[Bot-AI] Warning during voice pipeline pre-warming on join:', err.message)
    );
  } catch (err: any) {
    console.error('[Bot-AI] Failed to join voice:', err);
    await replyMsg.edit({
      content: `❌ Gagal koneksi voice: ${err.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handlePrefixLeave(message: Message) {
  const guildId = message.guildId;
  if (!guildId) return;

  const player = guildVoicePlayers.get(guildId);
  if (player) {
    player.destroy();
    guildVoicePlayers.delete(guildId);
  }

  const wasConnected = voiceConnectionManager.isConnected(guildId) || Boolean(getVoiceConnection(guildId));
  voiceConnectionManager.leave(guildId);

  if (wasConnected) {
    await message.reply({
      content: '👋 Telah keluar dari voice channel. Sampai jumpa!',
      allowedMentions: { parse: [] },
    });
  } else {
    await message.reply({
      content: 'Bot tidak sedang berada di dalam voice channel.',
      allowedMentions: { parse: [] },
    });
  }
}

async function handleLeaveCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const player = guildVoicePlayers.get(interaction.guildId);
  if (player) {
    player.destroy();
    guildVoicePlayers.delete(interaction.guildId);
  }

  const wasConnected = voiceConnectionManager.isConnected(interaction.guildId) || Boolean(getVoiceConnection(interaction.guildId));
  voiceConnectionManager.leave(interaction.guildId);

  if (wasConnected) {
    await interaction.reply({
      content: '👋 Telah keluar dari voice channel. Sampai jumpa!',
      allowedMentions: { parse: [] },
    });
  } else {
    await interaction.reply({
      content: 'Bot tidak sedang berada di dalam voice channel server ini.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
  const uptime = Math.floor(process.uptime());
  const memUsageMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const latencySummary = latencyTracker.getSummary();
  const totalReconnects = voiceConnectionManager.getTotalReconnects();
  const budgetStats = budgetManager.getStats();

  await interaction.reply({
    content:
      `📊 **Status Bot-AI**\n` +
      `- **Uptime**: ${uptime}s\n` +
      `- **Memory (RSS)**: ${memUsageMb} MB\n` +
      `- **LLM Model**: \`${config.LLM_MODEL}\`\n` +
      `- **STT Model**: \`${config.STT_MODEL}\`\n` +
      `- **TTS Voice**: \`${getTtsProvider().getVoiceName()}\`\n` +
      `- **Persona Aktif**: \`${personaManager.getVersion()}\` (${personaManager.getExamples().length} examples, ${Object.keys(personaManager.getLexicon()).length} lexicon)\n` +
      `- **Mode Interaksi**: \`${interactionGate.getMode()}\`\n` +
      `- **Wake Words**: \`${interactionGate.getWakeWords().join(', ')}\`\n` +
      `- **VAD Hangover**: \`${config.VAD_HANGOVER_MS}ms\`\n` +
      `- **Total Turn Selesai**: \`${latencySummary.totalTurns}\`\n` +
      `- **Latensi Total (t0..t5)**: p50=\`${latencySummary.total.p50}ms\` | p95=\`${latencySummary.total.p95}ms\` (Target: p50 ≤ 2.0s)\n` +
      `- **Breakdown p50**: STT=\`${latencySummary.stt.p50}ms\` | TTFT=\`${latencySummary.llmTtft.p50}ms\` | Chunker=\`${latencySummary.chunker.p50}ms\` | TTS=\`${latencySummary.tts.p50}ms\` | Dispatch=\`${latencySummary.dispatch.p50}ms\`\n` +
      `- **Resilience / Timeout**: STT=\`${config.TIMEOUT_STT_MS}ms\` | LLM=\`${config.TIMEOUT_LLM_MS}ms\` | TTS=\`${config.TIMEOUT_TTS_MS}ms\` | Retry=\`${config.MAX_RETRIES}\`\n` +
      `- **Auto-Reconnect Suara**: \`${totalReconnects}\` kali berhasil\n` +
      `- **Channel Chat AI**: \`${config.CHAT_CHANNEL_NAMES.join(', ')}\`\n` +
      `- **Chat Cooldown**: \`${config.CHAT_COOLDOWN_MS}ms\` (Limit: \`${config.RATE_LIMIT_PER_MIN}/mnt\`)\n` +
      `- **Allowlist Guild**: ${allowlistManager.getGuildAllowlistCount() === 0 ? 'Semua (Bebas)' : `${allowlistManager.getGuildAllowlistCount()} terdaftar`}\n` +
      `- **Allowlist User**: ${allowlistManager.getUserAllowlistCount() === 0 ? 'Semua (Bebas)' : `${allowlistManager.getUserAllowlistCount()} terdaftar`}\n` +
      `- **Bot Owner ID**: \`${allowlistManager.getOwnerUserId() || 'Belum diatur'}\`\n` +
      `- **Batas Biaya / Anggaran (FR-A1, FR-A3)**: Status=\`${budgetStats.level.toUpperCase()}\` | Req=\`${budgetStats.dailyRequests}/${budgetStats.maxRequests}\` (${budgetStats.requestPercentage}%) | Token=\`${budgetStats.dailyTokens}/${budgetStats.maxTokens}\` (${budgetStats.tokenPercentage}%)\n` +
      `- **Kill Switch**: \`${config.BOT_ENABLED ? 'Aktif' : 'Muted'}\``,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

async function handlePersonaCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'reload') {
    try {
      const result = await personaManager.reload();
      await interaction.reply({
        content:
          `✨ **Persona Berhasil Dimuat Ulang!** (FR-P1)\n` +
          `• Versi Aktif: \`${result.version}\`\n` +
          `• Few-Shot Examples: \`${result.exampleCount} contoh\`\n` +
          `• Lexicon Dictionary: \`${result.lexiconCount} entri fonetik\`\n` +
          `• Waktu Reload: <t:${Math.floor(result.loadedAt.getTime() / 1000)}:R>`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    } catch (err: any) {
      await interaction.reply({
        content: `❌ Gagal memuat ulang persona: ${err.message}`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    }
  } else if (subcommand === 'info') {
    await interaction.reply({
      content:
        `🎭 **Informasi Persona & Gaya Bicara**\n` +
        `• Versi Aktif: \`${personaManager.getVersion()}\`\n` +
        `• Few-Shot Examples: \`${personaManager.getExamples().length} contoh\`\n` +
        `• Lexicon Entri: \`${Object.keys(personaManager.getLexicon()).length} kata\`\n` +
        `• Aturan Suara: Kalimat pembuka ≤ 8 kata, tag emosi di awal, tanpa markdown/emoji.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
}

async function handleMuteCommand(interaction: ChatInputCommandInteraction) {
  if (config.OWNER_USER_ID && interaction.user.id !== config.OWNER_USER_ID) {
    await interaction.reply({
      content: 'Perintah ini hanya dapat dijalankan oleh bot owner.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Toggle kill switch (SEC-14, FR-A2, TC-16)
  (config as any).BOT_ENABLED = false;
  textGatingEngine.setBotEnabled(false);

  // Stop active voice playback across all guilds
  for (const player of guildVoicePlayers.values()) {
    player.stop();
  }

  await interaction.reply({
    content: '🛑 **Kill Switch Activated**: Bot dibisukan dan semua stream dihentikan.',
    allowedMentions: { parse: [] },
  });
}

async function handleUnmuteCommand(interaction: ChatInputCommandInteraction) {
  if (config.OWNER_USER_ID && interaction.user.id !== config.OWNER_USER_ID) {
    await interaction.reply({
      content: 'Perintah ini hanya dapat dijalankan oleh bot owner.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Toggle kill switch off (SEC-14, FR-A2, TC-16)
  (config as any).BOT_ENABLED = true;
  textGatingEngine.setBotEnabled(true);

  await interaction.reply({
    content: '🟢 **Kill Switch Deactivated**: Bot diaktifkan kembali dan siap merespons.',
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixMute(message: Message) {
  if (config.OWNER_USER_ID && message.author.id !== config.OWNER_USER_ID) {
    await message.reply({
      content: 'Perintah ini hanya dapat dijalankan oleh Bot Owner.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Toggle kill switch (SEC-14, FR-A2, TC-16)
  (config as any).BOT_ENABLED = false;
  textGatingEngine.setBotEnabled(false);

  for (const player of guildVoicePlayers.values()) {
    player.stop();
  }

  await message.reply({
    content: '🛑 **Kill Switch Activated**: Bot dibisukan dan semua stream dihentikan.',
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixUnmute(message: Message) {
  if (config.OWNER_USER_ID && message.author.id !== config.OWNER_USER_ID) {
    await message.reply({
      content: 'Perintah ini hanya dapat dijalankan oleh Bot Owner.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Toggle kill switch off (SEC-14, FR-A2, TC-16)
  (config as any).BOT_ENABLED = true;
  textGatingEngine.setBotEnabled(true);

  await message.reply({
    content: '🟢 **Kill Switch Deactivated**: Bot diaktifkan kembali dan siap merespons.',
    allowedMentions: { parse: [] },
  });
}

async function handleMemoryCommand(interaction: ChatInputCommandInteraction) {
  const memories = memoryStore.getUserMemories(interaction.user.id);
  if (memories.length === 0) {
    await interaction.reply({
      content: '📝 Belum ada fakta memori yang tersimpan tentang Anda.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const factList = memories
    .slice(0, 20)
    .map((m, idx) => `${idx + 1}. **${m.fact}** _(${m.category})_`)
    .join('\n');

  await interaction.reply({
    content:
      `🧠 **Fakta Memori Tersimpan Tentang Anda** (${memories.length} fakta):\n\n` +
      `${factList}\n\n` +
      `_Ketik \`/forget me\` jika Anda ingin menghapus seluruh memori dan riwayat percakapan Anda._`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

async function handleForgetCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'all') {
    if (config.OWNER_USER_ID && interaction.user.id !== config.OWNER_USER_ID) {
      await interaction.reply({
        content: 'Perintah `/forget all` hanya dapat dijalankan oleh Bot Owner.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const result = memoryStore.deleteAllMemories();
    await interaction.reply({
      content:
        `⚠️ **Seluruh Database Memori Dikosongkan!** (FR-P4, TC-15)\n` +
        `• Total fakta dihapus: \`${result.deletedFacts}\`\n` +
        `• Total riwayat obrolan dihapus: \`${result.deletedTurns}\``,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Default: subcommand === 'me'
  const result = memoryStore.deleteUserMemories(interaction.user.id);
  await interaction.reply({
    content:
      `🗑️ **Data Berhasil Dihapus Dari Sistem!** (FR-P4, TC-15)\n` +
      `• Fakta pribadi terhapus: \`${result.deletedFacts}\`\n` +
      `• Riwayat obrolan terhapus: \`${result.deletedTurns}\`\n` +
      `Tidak ada rekaman audio mentah atau data percakapan Anda yang tersisa.`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixMemory(message: Message) {
  const memories = memoryStore.getUserMemories(message.author.id);
  if (memories.length === 0) {
    await message.reply({
      content: '📝 Belum ada fakta memori yang tersimpan tentang Anda.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  const factList = memories
    .slice(0, 20)
    .map((m, idx) => `${idx + 1}. **${m.fact}** _(${m.category})_`)
    .join('\n');

  await message.reply({
    content:
      `🧠 **Fakta Memori Tersimpan Tentang Anda** (${memories.length} fakta):\n\n` +
      `${factList}\n\n` +
      `_Ketik \`!forget me\` jika Anda ingin menghapus seluruh memori Anda._`,
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixForgetMe(message: Message) {
  const result = memoryStore.deleteUserMemories(message.author.id);
  await message.reply({
    content:
      `🗑️ **Data Berhasil Dihapus Dari Sistem!** (FR-P4, TC-15)\n` +
      `• Fakta pribadi terhapus: \`${result.deletedFacts}\`\n` +
      `• Riwayat percakapan terhapus: \`${result.deletedTurns}\``,
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixForgetAll(message: Message) {
  if (config.OWNER_USER_ID && message.author.id !== config.OWNER_USER_ID) {
    await message.reply({
      content: 'Perintah `!forget all` hanya dapat dijalankan oleh Bot Owner.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  const result = memoryStore.deleteAllMemories();
  await message.reply({
    content:
      `⚠️ **Seluruh Database Memori Dikosongkan!** (FR-P4, TC-15)\n` +
      `• Total fakta dihapus: \`${result.deletedFacts}\`\n` +
      `• Total riwayat obrolan dihapus: \`${result.deletedTurns}\``,
    allowedMentions: { parse: [] },
  });
}

// Healthcheck HTTP Server (T5.1, SEC-11, SEC-12)
export const healthServer = new HealthServer({
  port: config.HEALTH_PORT,
  statusProvider: {
    isReady: () => client.isReady(),
    getPing: () => client.ws?.ping ?? 0,
    isBotEnabled: () => config.BOT_ENABLED,
    getUptime: () => process.uptime(),
  },
});

healthServer.start().catch((err) => {
  console.warn('[Bot-AI] Failed to start HealthServer:', err.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Bot-AI] Shutting down gracefully...');
  await healthServer.stop().catch(() => {});
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Bot-AI] Terminated.');
  await healthServer.stop().catch(() => {});
  client.destroy();
  process.exit(0);
});

if (config.DISCORD_TOKEN && config.DISCORD_TOKEN !== 'dummy_token_for_scaffold') {
  client.login(config.DISCORD_TOKEN).catch((err) => {
    console.error('[Bot-AI] Login error:', err.message);
  });
} else {
  console.log('[Bot-AI] Scaffold ready. Configure DISCORD_TOKEN in .env when ready to connect.');
}

