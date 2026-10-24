/**
 * Gemini Context Cache & Pre-Warming Manager
 * Implements PRD §5 & T3.2:
 * - Checks prompt token size against minimum Google explicit context cache threshold (typically 32,768 tokens)
 * - Identifies implicit prompt caching active natively on Gemini 2.5 and newer models
 * - Handles connection pre-warming ping on /join to keep TLS handshake socket warm
 */

import { GoogleGenAI } from '@google/genai';

export interface ContextCacheInfo {
  isImplicitSupported: boolean;
  isExplicitEligible: boolean;
  tokenCount: number;
  cachedContentName?: string;
  minimumTokensRequired: number;
}

export class GeminiContextCacheManager {
  private client: GoogleGenAI;
  private modelName: string;
  private cachedContentName: string | null = null;
  // Google Gemini explicit caching minimum threshold (default: 32,768 tokens)
  private readonly minTokensForExplicitCache = 32_768;

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  /**
   * Pre-warms the HTTP keep-alive connection to Gemini API by sending a lightweight
   * token count request, eliminating the 150-250ms TLS handshake lag on the first turn.
   */
  public async preWarmConnection(): Promise<{ warm: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Lightweight token count on a single word to establish TCP/TLS connection
      await this.client.models.countTokens({
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
      const latencyMs = Date.now() - start;
      console.log(`[GeminiPreWarm] TLS Keep-Alive connection pre-warmed in ${latencyMs}ms.`);
      return { warm: true, latencyMs };
    } catch (err: any) {
      console.warn(`[GeminiPreWarm] Connection pre-warm failed (${err.message}). Continuing.`);
      return { warm: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Evaluates if system instruction / persona prefix qualifies for explicit caching,
   * or leverages native implicit caching (Gemini 2.5+).
   */
  public async evaluatePromptCaching(systemInstruction: string): Promise<ContextCacheInfo> {
    let tokenCount = 0;
    try {
      const countResult = await this.client.models.countTokens({
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: systemInstruction }] }],
      });
      tokenCount = countResult.totalTokens ?? 0;
    } catch (err: any) {
      // Fallback estimate: ~4 chars per token
      tokenCount = Math.round(systemInstruction.length / 4);
    }

    const isExplicitEligible = tokenCount >= this.minTokensForExplicitCache;
    // Gemini 2.5 and newer implicitly caches repeated prompt prefixes natively
    const isImplicitSupported = this.modelName.includes('2.5') || this.modelName.includes('3.5');

    return {
      isImplicitSupported,
      isExplicitEligible,
      tokenCount,
      cachedContentName: this.cachedContentName ?? undefined,
      minimumTokensRequired: this.minTokensForExplicitCache,
    };
  }

  public getCachedContentName(): string | null {
    return this.cachedContentName;
  }
}
