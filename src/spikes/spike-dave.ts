/**
 * T0.4 Spike DAVE (Go / No-Go Verification)
 * 
 * Objective: Verify that the bot connects to Discord voice gateway using DAVE E2EE protocol
 * without triggering close code 4017, and receives audio streams cleanly.
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} from '@discordjs/voice';
import prism from 'prism-media';
import { config } from '../config/index.js';

console.log('=== T0.4 Spike DAVE Initialization ===');

if (config.DISCORD_TOKEN === 'dummy_token_for_scaffold') {
  console.log('[Spike DAVE] Please configure DISCORD_TOKEN in .env to run this spike against live Discord servers.');
  process.exit(0);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[Spike DAVE] Logged in as ${readyClient.user.tag}`);
  console.log('[Spike DAVE] Waiting for voice join command or test event...');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Spike DAVE] Exiting...');
  client.destroy();
  process.exit(0);
});

client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error('[Spike DAVE] Login failed:', err.message);
  process.exit(1);
});
