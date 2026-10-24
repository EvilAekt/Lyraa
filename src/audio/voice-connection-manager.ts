import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { calculateBackoffDelay } from './resilience.js';

export interface VoiceSessionState {
  guildId: string;
  channelId: string;
  channelName: string;
  adapterCreator: any;
  textChannel?: any;
  connection?: VoiceConnection;
  reconnectAttempts: number;
  totalReconnects: number;
  isIntentionalDisconnect: boolean;
  isReconnecting: boolean;
}

export interface VoiceConnectionManagerOptions {
  maxReconnectAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onReconnected?: (guildId: string, connection: VoiceConnection, textChannel?: any) => void;
  onDisconnected?: (guildId: string, reason: string) => void;
}

export class VoiceConnectionManager {
  private sessions = new Map<string, VoiceSessionState>();
  private readonly maxReconnectAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private onReconnected?: (guildId: string, connection: VoiceConnection, textChannel?: any) => void;
  private onDisconnected?: (guildId: string, reason: string) => void;

  constructor(options: VoiceConnectionManagerOptions = {}) {
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 15000;
    this.onReconnected = options.onReconnected;
    this.onDisconnected = options.onDisconnected;
  }

  /**
   * Set callback to be invoked whenever a voice connection is established or reconnected.
   */
  public setOnReconnected(callback: (guildId: string, connection: VoiceConnection, textChannel?: any) => void): void {
    this.onReconnected = callback;
  }

  /**
   * Establish initial voice connection to a voice channel with DAVE E2EE handshake.
   */
  public async join(channel: any, textChannel?: any): Promise<VoiceConnection> {
    const guildId = channel.guild.id;
    const channelId = channel.id;
    const channelName = channel.name || 'Voice Channel';

    // Reset or initialize session state
    let session = this.sessions.get(guildId);
    if (!session) {
      session = {
        guildId,
        channelId,
        channelName,
        adapterCreator: channel.guild.voiceAdapterCreator,
        textChannel,
        reconnectAttempts: 0,
        totalReconnects: 0,
        isIntentionalDisconnect: false,
        isReconnecting: false,
      };
      this.sessions.set(guildId, session);
    } else {
      session.channelId = channelId;
      session.channelName = channelName;
      session.adapterCreator = channel.guild.voiceAdapterCreator;
      session.textChannel = textChannel;
      session.isIntentionalDisconnect = false;
      session.isReconnecting = false;
      session.reconnectAttempts = 0;
    }

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    session.connection = connection;
    this.attachStatusListeners(connection, guildId);

    return connection;
  }

  /**
   * Intentionally leave voice channel without triggering reconnect.
   */
  public leave(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (session) {
      session.isIntentionalDisconnect = true;
      session.isReconnecting = false;
    }

    const connection = session?.connection || getVoiceConnection(guildId);
    if (connection) {
      try {
        connection.destroy();
      } catch {}
    }

    this.sessions.delete(guildId);
  }

  /**
   * Attach lifecycle listeners to detect network drops and trigger auto-reconnection.
   */
  public attachStatusListeners(connection: VoiceConnection, guildId: string): void {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      const session = this.sessions.get(guildId);
      if (!session || session.isIntentionalDisconnect) {
        return;
      }

      console.warn(
        `[VoiceConnectionManager] Disconnected from voice in guild ${guildId} (${session.channelName}). Evaluating reconnection...`
      );

      if (this.onDisconnected) {
        this.onDisconnected(guildId, 'Disconnected event received');
      }

      // Check if Discord is internally transitioning states (e.g. server region change)
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        console.log(`[VoiceConnectionManager] Discord voice transitioned to Signalling/Connecting internally.`);
        return;
      } catch {
        // True disconnection detected -> trigger auto-reconnect backoff
        await this.handleDisconnection(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      const session = this.sessions.get(guildId);
      if (session && !session.isIntentionalDisconnect && !session.isReconnecting) {
        console.warn(`[VoiceConnectionManager] Voice connection destroyed unexpectedly in guild ${guildId}.`);
        this.handleDisconnection(guildId).catch((err) => {
          console.error('[VoiceConnectionManager] Reconnection loop failed:', err);
        });
      }
    });
  }

  /**
   * Execute exponential backoff reconnection loop with DAVE handshake re-negotiation.
   */
  public async handleDisconnection(guildId: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session || session.isIntentionalDisconnect || session.isReconnecting) {
      return false;
    }

    session.isReconnecting = true;
    console.log(
      `[VoiceConnectionManager] Initiating auto-reconnect sequence for guild ${guildId} (Max attempts: ${this.maxReconnectAttempts})...`
    );

    for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt++) {
      if (session.isIntentionalDisconnect) {
        session.isReconnecting = false;
        return false;
      }

      session.reconnectAttempts = attempt;
      const delayMs = calculateBackoffDelay(
        attempt - 1,
        this.baseDelayMs,
        this.maxDelayMs,
        300
      );

      console.warn(
        `[VoiceConnectionManager] Reconnecting attempt ${attempt}/${this.maxReconnectAttempts} in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      try {
        // Re-join voice channel (re-initiates DAVE E2EE handshake)
        const newConnection = joinVoiceChannel({
          channelId: session.channelId,
          guildId: session.guildId,
          adapterCreator: session.adapterCreator,
          selfDeaf: false,
          selfMute: false,
        });

        await entersState(newConnection, VoiceConnectionStatus.Ready, 20_000);

        session.connection = newConnection;
        session.reconnectAttempts = 0;
        session.totalReconnects += 1;
        session.isReconnecting = false;

        this.attachStatusListeners(newConnection, guildId);

        console.log(
          `[VoiceConnectionManager] ✅ Reconnected successfully to ${session.channelName} on attempt #${attempt} (Total reconnects: ${session.totalReconnects}).`
        );

        if (this.onReconnected) {
          this.onReconnected(guildId, newConnection, session.textChannel);
        }

        if (session.textChannel && 'send' in session.textChannel) {
          session.textChannel.send({
            content: `🔄 *[Voice Reconnect]* Berhasil terhubung kembali ke **${session.channelName}** setelah gangguan koneksi.`,
            allowedMentions: { parse: [] },
          }).catch(() => {});
        }

        return true;
      } catch (err: any) {
        console.error(
          `[VoiceConnectionManager] Reconnect attempt #${attempt} failed: ${err.message}`
        );
      }
    }

    // Max attempts exhausted - circuit breaker triggered
    session.isReconnecting = false;
    console.error(
      `[VoiceConnectionManager] ❌ Exhausted all ${this.maxReconnectAttempts} reconnect attempts for guild ${guildId}. Halting loop.`
    );

    if (session.textChannel && 'send' in session.textChannel) {
      session.textChannel.send({
        content: `❌ *[Voice Alert]* Koneksi voice channel terputus dan gagal tersambung kembali setelah ${this.maxReconnectAttempts} percobaan. Silakan ketik \`/join\` jika koneksi telah pulih.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }

    return false;
  }

  /**
   * Retrieve total successful reconnects across all guilds or for a specific guild.
   */
  public getTotalReconnects(guildId?: string): number {
    if (guildId) {
      return this.sessions.get(guildId)?.totalReconnects ?? 0;
    }
    let total = 0;
    for (const session of this.sessions.values()) {
      total += session.totalReconnects;
    }
    return total;
  }

  /**
   * Get active voice session state.
   */
  public getSession(guildId: string): VoiceSessionState | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Check if a voice connection is currently connected and active.
   */
  public isConnected(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    return session?.connection?.state.status === VoiceConnectionStatus.Ready;
  }
}
