/**
 * Gemini LLM Provider Implementation
 * Leverages the Google Gen AI SDK (@google/genai) for low-latency streaming generation.
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { ChatMessage, GenerateOptions, LlmProvider } from '../llm-provider.js';

export interface GeminiLlmConfig {
  apiKey: string;
  model: string;
}

export class GeminiLlmProvider implements LlmProvider {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(config: GeminiLlmConfig) {
    if (!config.apiKey) {
      throw new Error('[GeminiLlmProvider] API key is required.');
    }
    if (!config.model) {
      throw new Error('[GeminiLlmProvider] Model name is required.');
    }

    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.modelName = config.model;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public async *generateStream(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let firstTokenNotified = false;

    // Separate system prompt from conversational turns
    const systemPrompt =
      options?.systemInstruction ||
      messages.find((m) => m.role === 'system')?.text;

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

    if (contents.length === 0) {
      return;
    }

    try {
      const responseStream = await this.client.models.generateContentStream({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: options?.maxOutputTokens ?? 300,
          temperature: options?.temperature ?? 0.7,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          if (!firstTokenNotified) {
            firstTokenNotified = true;
            options?.onFirstToken?.(Date.now() - startTime);
          }
          yield text;
        }
      }
    } catch (error: any) {
      console.error('[GeminiLlmProvider] Stream generation error:', error.message);
      throw error;
    }
  }
}
