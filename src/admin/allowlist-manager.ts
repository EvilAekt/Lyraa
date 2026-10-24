/**
 * Allowlist Manager & Privacy Notice Service
 * Implements PRD §4, SEC-4, SEC-9, and Task T2.5:
 * - Enforces guild & user allowlists (SEC-4)
 * - Auto-leaves unauthorized Discord servers/guilds
 * - Delivers structured privacy & consent notice upon joining voice channels (SEC-9)
 * - Controls centralized kill switch and admin authorization
 */

export interface AllowlistOptions {
  guildAllowlist?: string[];
  userAllowlist?: string[];
  ownerUserId?: string;
}

export interface GuildLike {
  id: string;
  name: string;
  leave: () => Promise<any>;
}

export class AllowlistManager {
  private guildAllowlist: Set<string>;
  private userAllowlist: Set<string>;
  private ownerUserId: string;

  constructor(options: AllowlistOptions = {}) {
    this.guildAllowlist = new Set((options.guildAllowlist || []).filter(Boolean));
    this.userAllowlist = new Set((options.userAllowlist || []).filter(Boolean));
    this.ownerUserId = options.ownerUserId || '';
  }

  /**
   * Check if a Discord guild is authorized to use the bot.
   * If allowlist is empty, all guilds are accepted.
   */
  public isGuildAllowed(guildId?: string | null): boolean {
    if (!guildId) return false;
    if (this.guildAllowlist.size === 0) return true;
    return this.guildAllowlist.has(guildId);
  }

  /**
   * Check if a Discord user is authorized to trigger bot commands or interactions.
   * Bot owner is ALWAYS authorized.
   * If user allowlist is empty, all users in authorized guilds are accepted.
   */
  public isUserAllowed(userId?: string | null): boolean {
    if (!userId) return false;
    if (this.ownerUserId && userId === this.ownerUserId) return true;
    if (this.userAllowlist.size === 0) return true;
    return this.userAllowlist.has(userId);
  }

  /**
   * Check if user is the bot owner.
   */
  public isOwner(userId?: string | null): boolean {
    if (!userId || !this.ownerUserId) return false;
    return userId === this.ownerUserId;
  }

  /**
   * Auto-leave an unauthorized Discord guild (SEC-4).
   * Returns true if guild was unauthorized and left, false if authorized.
   */
  public async autoLeaveUnauthorizedGuild(guild: GuildLike): Promise<boolean> {
    if (!this.isGuildAllowed(guild.id)) {
      console.warn(
        `[AllowlistManager] [SEC-4] Auto-leaving unauthorized guild "${guild.name}" (${guild.id}). Not in allowlist.`
      );
      try {
        await guild.leave();
        return true;
      } catch (err: any) {
        console.error(
          `[AllowlistManager] Failed to auto-leave guild "${guild.name}" (${guild.id}):`,
          err.message
        );
        return false;
      }
    }
    return false;
  }

  /**
   * Audit all connected guilds on startup and auto-leave unauthorized ones.
   */
  public async auditGuilds(guilds: GuildLike[]): Promise<string[]> {
    const leftGuildIds: string[] = [];
    for (const guild of guilds) {
      const left = await this.autoLeaveUnauthorizedGuild(guild);
      if (left) {
        leftGuildIds.push(guild.id);
      }
    }
    return leftGuildIds;
  }

  /**
   * Generate formal privacy & consent notice text upon entering voice channel (SEC-9, PRD §8).
   */
  public formatPrivacyNotice(channelName: string, botName = 'Lyra'): string {
    return (
      `🎙️ **Pengumuman Privasi Suara & Persetujuan (SEC-9)**\n` +
      `Halo semuanya! **${botName}** telah bergabung ke **${channelName}** dengan enkripsi suara DAVE E2EE.\n\n` +
      `• **Mendengarkan & Transkripsi**: Aku mendengarkan dan mentranskripsi suara otomatis di channel ini agar dapat menjawab percakapan kalian secara natural.\n` +
      `• **Pemrosesan Data**: Suara diproses menggunakan model Google Gemini AI. Dilarang membicarakan atau membocorkan data rahasia pribadi (nomor rekening, password, PIN, NIK).\n` +
      `• **Retensi Audio & Teks**: Audio mentah tidak disimpan ke disk. Transkrip percakapan disimpan maksimal 7 hari dan dapat dihapus kapan saja dengan perintah \`/forget me\`.\n` +
      `• **Kontrol Penuh**: Ketik \`/leave\` untuk meminta bot keluar, atau \`/mute\` untuk membisukan respons AI.`
    );
  }

  public getGuildAllowlistCount(): number {
    return this.guildAllowlist.size;
  }

  public getUserAllowlistCount(): number {
    return this.userAllowlist.size;
  }

  public getOwnerUserId(): string {
    return this.ownerUserId;
  }
}
