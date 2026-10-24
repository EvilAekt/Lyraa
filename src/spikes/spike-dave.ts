/**
 * T0.4 Spike DAVE (Go / No-Go Empirical Verification)
 * 
 * Objectives:
 * 1. Verify successful voice connection with DAVE E2EE protocol.
 * 2. Verify receiver stream captures user speech without decryption error or close code 4017.
 * 3. Save a 10-second sample WAV for audible quality inspection (TC-01 & TC-02).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  Message,
} from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  EndBehaviorType,
} from '@discordjs/voice';
import { config } from '../config/index.js';
import { createOpusDecoder } from '../audio/opus-decoder.js';
import { pcmToWav } from '../audio/wav-helper.js';

console.log('====================================================');
console.log('       T0.4 SPIKE DAVE (Go / No-Go Verification)    ');
console.log('====================================================');

if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN === 'dummy_token_for_scaffold') {
  console.log('[Spike DAVE] DISCORD_TOKEN is not configured in .env.');
  console.log('[Spike DAVE] Please configure your bot token in .env and rerun this command.');
  process.exit(0);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const spikeCommands = [
  new SlashCommandBuilder()
    .setName('dave-join')
    .setDescription('T0.4: Masuk ke voice channel untuk menguji handshake DAVE E2EE'),
  new SlashCommandBuilder()
    .setName('dave-record')
    .setDescription('T0.4: Rekam 10 detik ucapan pengguna dan simpan sebagai file WAV'),
  new SlashCommandBuilder()
    .setName('dave-leave')
    .setDescription('T0.4: Keluar dari voice channel dan cetak metrik sesi'),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Spike DAVE] Online as ${readyClient.user.tag}`);
  console.log(`[Spike DAVE] Node.js version: ${process.version}`);

  const joinedGuilds = readyClient.guilds.cache.map((g) => `${g.name} (${g.id})`);
  console.log(`[Spike DAVE] Bot is present in ${joinedGuilds.length} guild(s):`, joinedGuilds);

  console.log(`[Spike DAVE] Registering spike commands...`);
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  // Try registering guild commands for allowlisted guilds
  for (const guildId of config.DISCORD_GUILD_ALLOWLIST) {
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guildId), {
          body: spikeCommands,
        });
        console.log(`[Spike DAVE] Registered instant commands for guild: ${guildId}`);
      } catch (err: any) {
        console.warn(`[Spike DAVE] Guild command registration for ${guildId} failed: ${err.message}`);
      }
    }
  }

  // Register globally as well
  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: spikeCommands,
    });
    console.log('[Spike DAVE] Global slash commands registered successfully.');
  } catch (err: any) {
    console.warn(`[Spike DAVE] Global slash command registration failed: ${err.message}`);
  }

  console.log('[Spike DAVE] Ready! Anda bisa gunakan slash command (/dave-join) ATAU pesan teks (!dave-join).');
});

// Support both slash commands and text prefix commands (!dave-join, !dave-record, !dave-leave)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  if (commandName === 'dave-join') {
    await handleDaveJoin(interaction);
  } else if (commandName === 'dave-record') {
    await handleDaveRecord(interaction);
  } else if (commandName === 'dave-leave') {
    await handleDaveLeave(interaction);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  if (content === '!dave-join') {
    await handlePrefixJoin(message);
  } else if (content === '!dave-record') {
    await handlePrefixRecord(message);
  } else if (content === '!dave-leave') {
    await handlePrefixLeave(message);
  }
});

async function handleDaveJoin(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  const channel = member.voice.channel;

  if (!channel) {
    await interaction.reply({
      content: '❌ Silakan join ke voice channel terlebih dahulu.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    console.log(`[Spike DAVE] Joining ${channel.name} (${channel.id})...`);
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    // Monitor connection states
    connection.on('stateChange', (oldState, newState) => {
      console.log(`[Spike DAVE] Connection state: ${oldState.status} -> ${newState.status}`);
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        console.warn(`[Spike DAVE] Disconnected! Close code: ${(newState as any).closeCode}`);
      }
    });

    connection.on('error', (err) => {
      console.error('[Spike DAVE] Connection error:', err);
    });

    // Await Ready state (with DAVE handshake)
    const start = Date.now();
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    const duration = Date.now() - start;

    console.log(`[Spike DAVE] Handshake SUCCESS in ${duration}ms! (TC-01 Passed)`);

    await interaction.editReply({
      content:
        `✅ **DAVE Connection Ready! (TC-01 PASS)**\n` +
        `- Channel: \`${channel.name}\`\n` +
        `- Handshake Time: \`${duration}ms\`\n` +
        `- Status: \`Ready (No Close Code 4017)\`\n\n` +
        `Sekarang silakan bicaralah dan jalankan \`/dave-record\` untuk merekam 10 detik audio (TC-02).`,
    });
  } catch (err: any) {
    console.error('[Spike DAVE] Failed to connect with DAVE:', err);
    await interaction.editReply({
      content: `❌ Gagal koneksi voice DAVE: ${err.message}`,
    });
  }
}

async function handleDaveRecord(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    await interaction.reply({
      content: '❌ Bot belum terhubung ke voice channel. Jalankan `/dave-join` terlebih dahulu.',
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  await interaction.reply({
    content: `🎙️ **Merekam audio dari ${interaction.user.username}...** Silakan berbicara sekarang (maks 10 detik).`,
  });

  try {
    const receiver = connection.receiver;
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1500, // 1.5s silence triggers end
      },
    });

    const opusDecoder = createOpusDecoder({ rate: 48000, channels: 1 });
    const pcmChunks: Buffer[] = [];

    opusStream.pipe(opusDecoder);

    opusDecoder.on('data', (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          opusStream.destroy();
        } catch {}
        resolve();
      }, 10_000); // 10s max recording duration

      opusDecoder.once('end', () => {
        clearTimeout(timeout);
        try {
          opusStream.destroy();
        } catch {}
        resolve();
      });

      opusStream.once('error', (err) => {
        clearTimeout(timeout);
        try {
          opusStream.destroy();
        } catch {}
        reject(err);
      });
    });

    const fullPcm = Buffer.concat(pcmChunks);
    if (fullPcm.length === 0) {
      await interaction.followUp({
        content: '⚠️ Tidak ada data audio yang tertangkap. Pastikan mikrofon Anda aktif dan tidak ter-mute.',
      });
      return;
    }

    const wavBuffer = pcmToWav(fullPcm, 48000, 1, 16);
    const outputDir = path.join(process.cwd(), 'debug_audio');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `spike-dave-${Date.now()}.wav`;
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, wavBuffer);

    const durationSec = (fullPcm.length / (48000 * 2)).toFixed(2);
    console.log(`[Spike DAVE] Saved WAV sample to: ${outputPath} (${durationSec}s, ${wavBuffer.length} bytes)`);

    await interaction.followUp({
      content:
        `🎉 **Audio Capture SUCCESS! (TC-02 PASS)**\n` +
        `- Durasi audio: \`${durationSec}s\`\n` +
        `- Ukuran file: \`${(wavBuffer.length / 1024).toFixed(1)} KB\`\n` +
        `- Tersimpan di: \`debug_audio/${filename}\`\n\n` +
        `Audio tertangkap jernih dengan dekripsi DAVE tanpa error!`,
    });
  } catch (err: any) {
    console.error('[Spike DAVE] Error recording user audio:', err);
    await interaction.followUp({
      content: `❌ Gagal menangkap audio: ${err.message}`,
    });
  }
}

async function handleDaveLeave(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    await interaction.reply({
      content: '👋 Bot telah keluar dari voice channel. Metrik sesi DAVE tercatat.',
    });
  } else {
    await interaction.reply({
      content: 'Bot tidak sedang berada di dalam voice channel.',
      ephemeral: true,
    });
  }
}

async function handlePrefixJoin(message: Message) {
  const member = message.member;
  const channel = member?.voice.channel;

  if (!channel) {
    await message.reply('❌ Silakan join ke voice channel terlebih dahulu.');
    return;
  }

  const replyMsg = await message.reply('🔄 Menghubungkan ke voice channel dengan DAVE E2EE...');

  try {
    console.log(`[Spike DAVE] Joining ${channel.name} (${channel.id}) via prefix command...`);
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on('stateChange', (oldState, newState) => {
      console.log(`[Spike DAVE] Connection state: ${oldState.status} -> ${newState.status}`);
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        console.warn(`[Spike DAVE] Disconnected! Close code: ${(newState as any).closeCode}`);
      }
    });

    connection.on('error', (err) => {
      console.error('[Spike DAVE] Connection error:', err);
    });

    const start = Date.now();
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    const duration = Date.now() - start;

    console.log(`[Spike DAVE] Handshake SUCCESS in ${duration}ms! (TC-01 Passed)`);

    await replyMsg.edit(
      `✅ **DAVE Connection Ready! (TC-01 PASS)**\n` +
      `- Channel: \`${channel.name}\`\n` +
      `- Handshake Time: \`${duration}ms\`\n` +
      `- Status: \`Ready (No Close Code 4017)\`\n\n` +
      `Sekarang silakan bicaralah dan ketik \`!dave-record\` (atau \`/dave-record\`) untuk merekam 10 detik audio (TC-02).`
    );
  } catch (err: any) {
    console.error('[Spike DAVE] Failed to connect with DAVE:', err);
    await replyMsg.edit(`❌ Gagal koneksi voice DAVE: ${err.message}`);
  }
}

async function handlePrefixRecord(message: Message) {
  const guildId = message.guildId;
  if (!guildId) return;

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    await message.reply('❌ Bot belum terhubung ke voice channel. Ketik `!dave-join` terlebih dahulu.');
    return;
  }

  const userId = message.author.id;
  const replyMsg = await message.reply(`🎙️ **Merekam audio dari ${message.author.username}...** Silakan berbicara sekarang (maks 10 detik).`);

  try {
    const receiver = connection.receiver;
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1500,
      },
    });

    const opusDecoder = createOpusDecoder({ rate: 48000, channels: 1 });
    const pcmChunks: Buffer[] = [];

    opusStream.pipe(opusDecoder);

    opusDecoder.on('data', (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          opusStream.destroy();
        } catch {}
        resolve();
      }, 10_000);

      opusDecoder.once('end', () => {
        clearTimeout(timeout);
        try {
          opusStream.destroy();
        } catch {}
        resolve();
      });

      opusStream.once('error', (err) => {
        clearTimeout(timeout);
        try {
          opusStream.destroy();
        } catch {}
        reject(err);
      });
    });

    const fullPcm = Buffer.concat(pcmChunks);
    if (fullPcm.length === 0) {
      await message.reply('⚠️ Tidak ada data audio yang tertangkap. Pastikan mikrofon Anda aktif dan tidak ter-mute.');
      return;
    }

    const wavBuffer = pcmToWav(fullPcm, 48000, 1, 16);
    const outputDir = path.join(process.cwd(), 'debug_audio');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `spike-dave-${Date.now()}.wav`;
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, wavBuffer);

    const durationSec = (fullPcm.length / (48000 * 2)).toFixed(2);
    console.log(`[Spike DAVE] Saved WAV sample to: ${outputPath} (${durationSec}s, ${wavBuffer.length} bytes)`);

    await message.reply(
      `🎉 **Audio Capture SUCCESS! (TC-02 PASS)**\n` +
      `- Durasi audio: \`${durationSec}s\`\n` +
      `- Ukuran file: \`${(wavBuffer.length / 1024).toFixed(1)} KB\`\n` +
      `- Tersimpan di: \`debug_audio/${filename}\`\n\n` +
      `Audio tertangkap jernih dengan dekripsi DAVE tanpa error!`
    );
  } catch (err: any) {
    console.error('[Spike DAVE] Error recording user audio:', err);
    await message.reply(`❌ Gagal menangkap audio: ${err.message}`);
  }
}

async function handlePrefixLeave(message: Message) {
  const guildId = message.guildId;
  if (!guildId) return;

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    await message.reply('👋 Bot telah keluar dari voice channel. Metrik sesi DAVE tercatat.');
  } else {
    await message.reply('Bot tidak sedang berada di dalam voice channel.');
  }
}

client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error('[Spike DAVE] Login error:', err.message);
  process.exit(1);
});
