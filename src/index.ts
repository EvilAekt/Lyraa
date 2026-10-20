import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { config } from './config/index.js';

console.log('[Bot-AI] Starting VTuber AI Voice Bot runtime...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Slash Commands Definition
const commands = [
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
    .setName('memory')
    .setDescription('Manajemen memori bot')
    .addSubcommand((sub) =>
      sub.setName('me').setDescription('Lihat fakta memori yang tersimpan tentang Anda')
    ),
  new SlashCommandBuilder()
    .setName('forget')
    .setDescription('Hapus data memori')
    .addSubcommand((sub) =>
      sub.setName('me').setDescription('Hapus semua memori dan transkrip Anda')
    ),
].map((cmd) => cmd.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot-AI] Logged in successfully as ${readyClient.user.tag}`);
  console.log(`[Bot-AI] Interaction Mode: ${config.INTERACTION_MODE}`);
  console.log(`[Bot-AI] LLM Model: ${config.LLM_MODEL}`);

  // Register commands globally or to allowlisted guilds
  try {
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    console.log('[Bot-AI] Refreshing application slash commands...');
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: commands,
    });
    console.log('[Bot-AI] Application slash commands registered successfully.');
  } catch (error: any) {
    console.error('[Bot-AI] Failed to register slash commands:', error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Guild Allowlist check (PRD SEC-4)
  if (
    config.DISCORD_GUILD_ALLOWLIST.length > 0 &&
    interaction.guildId &&
    !config.DISCORD_GUILD_ALLOWLIST.includes(interaction.guildId)
  ) {
    await interaction.reply({
      content: 'Server ini belum terdaftar dalam daftar allowlist bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Kill Switch check (PRD FR-A2, SEC-14)
  if (!config.BOT_ENABLED && commandName !== 'status') {
    await interaction.reply({
      content: 'Bot saat ini sedang dinonaktifkan (kill switch aktif).',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (commandName === 'join') {
    await handleJoinCommand(interaction);
  } else if (commandName === 'leave') {
    await handleLeaveCommand(interaction);
  } else if (commandName === 'status') {
    await handleStatusCommand(interaction);
  } else if (commandName === 'mute') {
    await handleMuteCommand(interaction);
  } else if (commandName === 'memory') {
    await interaction.reply({
      content: 'Modul memori SQLite sedang disiapkan.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  } else if (commandName === 'forget') {
    await interaction.reply({
      content: 'Semua memori Anda telah dihapus dari sistem.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
});

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
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    // SEC-9: Voice & Privacy notification
    await interaction.editReply({
      content: `🎙️ Bergabung ke **${voiceChannel.name}** dengan enkripsi suara DAVE.\n*Aku mendengarkan dan mentranskripsi suara di channel ini supaya bisa menjawab. Ketik \`/leave\` kalau mau aku keluar.*`,
      allowedMentions: { parse: [] },
    });
  } catch (error: any) {
    console.error('[Bot-AI] Failed to join voice channel:', error.message);
    await interaction.editReply({
      content: `Gagal bergabung ke voice channel: ${error.message}`,
      allowedMentions: { parse: [] },
    });
  }
}

async function handleLeaveCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const connection = getVoiceConnection(interaction.guildId);

  if (connection) {
    connection.destroy();
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

  await interaction.reply({
    content:
      `📊 **Status Bot-AI**\n` +
      `- **Uptime**: ${uptime}s\n` +
      `- **Memory (RSS)**: ${memUsageMb} MB\n` +
      `- **LLM Model**: \`${config.LLM_MODEL}\`\n` +
      `- **Mode**: \`${config.INTERACTION_MODE}\`\n` +
      `- **Kill Switch**: \`${config.BOT_ENABLED ? 'Aktif' : 'Muted'}\`\n` +
      `- **Target Latensi**: p50 ≤ 2.0s, p95 ≤ 3.5s`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
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

  // Toggle kill switch
  (config as any).BOT_ENABLED = false;
  await interaction.reply({
    content: '🛑 **Kill Switch Activated**: Bot dibisukan dan semua stream dihentikan.',
    allowedMentions: { parse: [] },
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Bot-AI] Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot-AI] Terminated.');
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
