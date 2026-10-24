/**
 * Waterfall LLM Provider
 * Implements a resilient cascading failover architecture across multiple LLM providers:
 * Primary (Gemini) -> Fallback 1 (Groq API) -> Fallback 2 (OpenRouter Free)
 *
 * Ensures uninterrupted voice conversations even during rate-limits (HTTP 429) or quota exhaustion.
 */

import { ChatMessage, GenerateOptions, LlmProvider } from './llm-provider.js';

export interface WaterfallCandidate {
  name: string;
  provider: LlmProvider;
  isConfigured?: () => boolean;
}

export class WaterfallLlmProvider implements LlmProvider {
  private candidates: WaterfallCandidate[];
  private lastSuccessfulProvider: string = 'none';

  constructor(candidates: WaterfallCandidate[]) {
    if (!candidates || candidates.length === 0) {
      throw new Error('[WaterfallLlmProvider] At least one candidate provider must be specified.');
    }
    this.candidates = candidates;
  }

  public getModelName(): string {
    const chain = this.candidates
      .filter((c) => (c.isConfigured ? c.isConfigured() : true))
      .map((c) => `${c.name}(${c.provider.getModelName()})`)
      .join(' -> ');
    return `Waterfall[${chain}]`;
  }

  public getCandidates(): WaterfallCandidate[] {
    return [...this.candidates];
  }

  public getLastSuccessfulProvider(): string {
    return this.lastSuccessfulProvider;
  }

  public async *generateStream(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    const availableCandidates = this.candidates.filter((c) =>
      c.isConfigured ? c.isConfigured() : true
    );

    if (availableCandidates.length === 0) {
      throw new Error(
        '[WaterfallLlmProvider] No configured LLM providers available in the waterfall chain.'
      );
    }

    let lastError: any = null;

    for (let i = 0; i < availableCandidates.length; i++) {
      const candidate = availableCandidates[i];
      let hasYielded = false;

      try {
        for await (const token of candidate.provider.generateStream(messages, options)) {
          hasYielded = true;
          yield token;
        }

        // Successfully generated complete stream
        this.lastSuccessfulProvider = candidate.name;
        return;
      } catch (error: any) {
        lastError = error;
        console.warn(
          `[WaterfallLLM] Provider "${candidate.name}" encountered an error: ${error?.message || error}`
        );

        if (hasYielded) {
          // Tokens were already pushed to downstream sentence chunker and TTS.
          // Switching mid-sentence would corrupt the voice reply stream.
          console.error(
            `[WaterfallLLM] Stream broke mid-generation on "${candidate.name}". Aborting failover.`
          );
          throw error;
        }

        // Provider failed before emitting any token (e.g. 429 Rate Limit, Quota Exceeded, Timeout)
        if (i < availableCandidates.length - 1) {
          const nextCandidate = availableCandidates[i + 1];
          console.warn(
            `[WaterfallLLM] Failover triggered: switching from "${candidate.name}" to fallback "${nextCandidate.name}"...`
          );
        }
      }
    }

    throw new Error(
      `[WaterfallLlmProvider] All ${availableCandidates.length} providers exhausted. Last failure: ${
        lastError?.message || lastError
      }`
    );
  }
}
