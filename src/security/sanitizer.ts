/**
 * Security & Input/Output Sanitizer
 * Implements PRD SEC-1, SEC-2, SEC-5, SEC-7, and TC-13 & TC-14:
 * - Treats user input, voice transcripts, and OCR/image text as untrusted data
 * - Delimiter wrapping & prevents delimiter escape / prompt injection
 * - Sanitizes mentions (@everyone, @here, role pings)
 * - Sanitizes external links to prevent malicious phishing propagation
 * - Redacts sensitive tokens/credentials from output text
 */

export const DEFAULT_ALLOWED_DOMAINS = Object.freeze([
  'discord.com',
  'discord.gg',
  'discordapp.com',
  'tenor.com',
  'giphy.com',
  'youtube.com',
  'youtu.be',
  'twitch.tv',
]);

/**
 * Escapes characters that could be used to break out of delimiters.
 */
export function escapeDelimiterBreakouts(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[\/?(USER_INPUT|SYSTEM_INSTRUCTION|DATA_UNTRUSTED|INSTRUCTION)\]/gi, (match) => {
      return match.replace('[', '{').replace(']', '}');
    })
    .replace(/<<<|>>>/g, '---');
}

/**
 * Wraps untrusted user input within safe delimiter blocks (SEC-1, SEC-5).
 */
export function wrapUntrustedData(input: string, label = 'USER_INPUT'): string {
  const sanitized = escapeDelimiterBreakouts(input.trim());
  return `[${label}]: ${sanitized}`;
}

/**
 * Sanitize mentions from output text to prevent @everyone, @here, or role pings (SEC-7, FR-T4, TC-14).
 */
export function sanitizeMentions(text: string): string {
  if (!text) return '';
  return text
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&(\d+)>/g, '[@role-$1]');
}

/**
 * Sanitize URLs from bot output to prevent malicious link injection (SEC-5).
 * Only allowed domains pass through; other URLs are redacted.
 */
export function sanitizeLinks(
  text: string,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_DOMAINS
): string {
  if (!text) return '';

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return text.replace(urlRegex, (matchedUrl) => {
    try {
      const parsed = new URL(matchedUrl);
      const host = parsed.hostname.toLowerCase();
      const isAllowed = allowedDomains.some(
        (domain) => host === domain || host.endsWith('.' + domain)
      );
      if (isAllowed) {
        return matchedUrl;
      }
      return `[tautan eksternal dinetralkan: ${host}]`;
    } catch {
      return '[tautan tidak valid]';
    }
  });
}

/**
 * Redact sensitive credentials (Discord Bot tokens, Gemini API keys) from text (SEC-1, SEC-2).
 */
export function redactSensitiveCredentials(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // Discord Bot Token format (e.g., MTI... . ... . ...)
  const discordTokenRegex = /[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g;
  sanitized = sanitized.replace(discordTokenRegex, '[REDACTED_DISCORD_TOKEN]');

  // Google Gemini API Key format (e.g., AIzaSy...)
  const geminiApiKeyRegex = /AIzaSy[A-Za-z0-9_-]{30,40}/g;
  sanitized = sanitized.replace(geminiApiKeyRegex, '[REDACTED_GEMINI_KEY]');

  // GitHub Personal Access Token (e.g., ghp_...)
  const githubTokenRegex = /ghp_[A-Za-z0-9]{36}/g;
  sanitized = sanitized.replace(githubTokenRegex, '[REDACTED_GITHUB_TOKEN]');

  // Discord Webhook URLs
  const webhookRegex = /https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g;
  sanitized = sanitized.replace(webhookRegex, '[REDACTED_WEBHOOK_URL]');

  // HTTP Authorization Bearer Tokens
  const bearerRegex = /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi;
  sanitized = sanitized.replace(bearerRegex, 'Bearer [REDACTED_BEARER_TOKEN]');

  return sanitized;
}

/**
 * Comprehensive output sanitizer applying mentions, links, and credential redactions.
 */
export function sanitizeBotOutput(text: string): string {
  if (!text) return '';
  let out = sanitizeMentions(text);
  out = sanitizeLinks(out);
  out = redactSensitiveCredentials(out);
  return out;
}
