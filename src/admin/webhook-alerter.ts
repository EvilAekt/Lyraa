/**
 * Admin Webhook Alerter Module
 * Implements PRD §4 (FR-A4), TDD §12, and Task T4.4:
 * - Dispatches operational alerts to private admin channel via Discord Webhook
 * - Triggers on critical operational events:
 *   1. Bot restart after crash / unhandled failure
 *   2. Reconnect attempts exceeding 3 times per hour
 *   3. Provider errors exceeding 20% within 5-minute window
 *   4. Daily request/token budget consumption reaching 80% (warning threshold)
 * - Sanitizes all alert messages with redactSensitiveCredentials (SEC-2)
 * - Safe no-op when ADMIN_WEBHOOK_URL is not configured
 */

import { redactSensitiveCredentials } from '../security/sanitizer.js';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertPayload {
  title: string;
  description: string;
  severity: AlertSeverity;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: Date;
}

export interface WebhookAlerterOptions {
  webhookUrl?: string;
  botName?: string;
  enabled?: boolean;
}

export class AdminWebhookAlerter {
  private webhookUrl: string;
  private botName: string;
  private enabled: boolean;
  private recentAlertTimestamps: number[] = [];
  private lastAlerts: AlertPayload[] = [];

  // Metrics for anomaly detection
  private reconnectHistory: number[] = [];
  private providerCallHistory: Array<{ timestamp: number; success: boolean }> = [];

  constructor(options: WebhookAlerterOptions = {}) {
    this.webhookUrl = options.webhookUrl || process.env.ADMIN_WEBHOOK_URL || '';
    this.botName = options.botName || 'Lyra AI Ops Monitor';
    this.enabled = options.enabled ?? (Boolean(this.webhookUrl) && this.webhookUrl.startsWith('http'));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setWebhookUrl(url: string) {
    this.webhookUrl = url;
    this.enabled = Boolean(this.webhookUrl) && this.webhookUrl.startsWith('http');
  }

  /**
   * Dispatches a structured alert embed to the configured Discord webhook.
   */
  public async sendAlert(payload: AlertPayload): Promise<boolean> {
    const color = this.getColorForSeverity(payload.severity);
    const sanitizedTitle = redactSensitiveCredentials(payload.title);
    const sanitizedDescription = redactSensitiveCredentials(payload.description);
    const sanitizedFields = payload.fields?.map((f) => ({
      name: redactSensitiveCredentials(f.name),
      value: redactSensitiveCredentials(f.value),
      inline: f.inline ?? false,
    }));

    const sanitizedPayload: AlertPayload = {
      ...payload,
      title: sanitizedTitle,
      description: sanitizedDescription,
      fields: sanitizedFields,
    };

    this.lastAlerts.push(sanitizedPayload);
    if (this.lastAlerts.length > 50) {
      this.lastAlerts.shift();
    }

    if (!this.enabled || !this.webhookUrl) {
      return false;
    }

    // Rate limit outbound alerts to max 5 per minute to prevent Discord webhook spam
    const now = Date.now();
    this.recentAlertTimestamps = this.recentAlertTimestamps.filter((t) => now - t < 60_000);
    if (this.recentAlertTimestamps.length >= 5) {
      console.warn('[AdminWebhookAlerter] Throttling alert dispatch: rate limit reached (5/min).');
      return false;
    }
    this.recentAlertTimestamps.push(now);

    const embed = {
      title: `${this.getEmojiForSeverity(payload.severity)} ${sanitizedTitle}`,
      description: sanitizedDescription,
      color,
      timestamp: (payload.timestamp || new Date()).toISOString(),
      fields: sanitizedFields,
      footer: {
        text: this.botName,
      },
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.botName,
          embeds: [embed],
        }),
      });

      return response.ok;
    } catch (err: any) {
      console.error(`[AdminWebhookAlerter] Failed to send alert: ${err.message}`);
      return false;
    }
  }

  /**
   * Alert when bot restarts after a crash or fatal incident.
   */
  public async alertPostCrashRestart(reason: string, uptimeSeconds: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Bot Pulih dari Restart / Crash',
      description: `Bot baru saja diinisialisasi ulang setelah crash atau penghentian tak terduga.`,
      severity: 'warning',
      fields: [
        { name: 'Penyebab / Sinyal', value: reason || 'Unknown Crash Event', inline: true },
        { name: 'Uptime Sebelumnya', value: `${uptimeSeconds} detik`, inline: true },
        { name: 'Lingkungan', value: process.env.NODE_ENV || 'production', inline: true },
      ],
    });
  }

  /**
   * Track reconnect event and alert if exceeding 3 reconnects per hour.
   */
  public async recordReconnect(guildId: string, guildName: string): Promise<boolean> {
    const now = Date.now();
    this.reconnectHistory = this.reconnectHistory.filter((t) => now - t < 3600_000);
    this.reconnectHistory.push(now);

    if (this.reconnectHistory.length > 3) {
      return this.sendAlert({
        title: 'Peringatan: Reconnect Lebih dari 3x per Jam (TC-08)',
        description: `Koneksi voice channel mengalami ketidakstabilan berulang di server "${guildName}" (${guildId}).`,
        severity: 'error',
        fields: [
          { name: 'Jumlah Reconnect (1 Jam)', value: `${this.reconnectHistory.length} kali`, inline: true },
          { name: 'Status Tindakan', value: 'Mempertahankan auto-reconnect backoff', inline: true },
        ],
      });
    }

    return false;
  }

  /**
   * Track provider API calls and alert if failure rate exceeds 20% in 5 minutes.
   */
  public async recordProviderCall(provider: string, success: boolean, errorMessage?: string): Promise<boolean> {
    const now = Date.now();
    this.providerCallHistory = this.providerCallHistory.filter((c) => now - c.timestamp < 300_000);
    this.providerCallHistory.push({ timestamp: now, success });

    if (this.providerCallHistory.length >= 10) {
      const failures = this.providerCallHistory.filter((c) => !c.success).length;
      const errorRate = (failures / this.providerCallHistory.length) * 100;

      if (errorRate > 20) {
        return this.sendAlert({
          title: `Tingkat Error Provider Melebihi 20% (${provider})`,
          description: `Penyedia layanan ${provider} mengalami tingkat kegagalan tinggi dalam 5 menit terakhir.`,
          severity: 'critical',
          fields: [
            { name: 'Tingkat Error', value: `${errorRate.toFixed(1)}% (${failures}/${this.providerCallHistory.length})`, inline: true },
            { name: 'Error Terakhir', value: errorMessage ? errorMessage.slice(0, 100) : 'Timeout / 429 Error', inline: false },
            { name: 'Tindakan', value: 'Fallback phrase persona otomatis aktif', inline: true },
          ],
        });
      }
    }

    return false;
  }

  /**
   * Alert when daily budget reaches 80% degradation threshold.
   */
  public async alertBudgetThreshold(dailyTokens: number, maxTokens: number, percentage: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Peringatan Kuota Anggaran Harian (80% Reached)',
      description: 'Konsumsi token Gemini hari ini telah mencapai ambang degradasi (>= 80%). Bot beralih ke balasan singkat.',
      severity: 'warning',
      fields: [
        { name: 'Pemakaian Token', value: `${dailyTokens.toLocaleString()} / ${maxTokens.toLocaleString()}`, inline: true },
        { name: 'Persentase', value: `${percentage}%`, inline: true },
        { name: 'Status Mode', value: 'Degraded (Batas output dipangkas ke 70 token)', inline: true },
      ],
    });
  }

  public getHistory(): AlertPayload[] {
    return [...this.lastAlerts];
  }

  private getColorForSeverity(severity: AlertSeverity): number {
    switch (severity) {
      case 'info':
        return 0x3498db; // Blue
      case 'warning':
        return 0xf39c12; // Orange
      case 'error':
        return 0xe74c3c; // Red
      case 'critical':
        return 0x9b59b6; // Purple / High Alert
    }
  }

  private getEmojiForSeverity(severity: AlertSeverity): string {
    switch (severity) {
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'error':
        return '🚨';
      case 'critical':
        return '💥';
    }
  }
}
