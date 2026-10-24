/**
 * OpenAI-Compatible LLM Provider
 * Supports providers adhering to the OpenAI Chat Completions REST API with SSE streaming,
 * such as Groq, OpenRouter, Together AI, Mistral, and local Ollama.
 */

import { ChatMessage, GenerateOptions, LlmProvider } from './llm-provider.js';

export interface OpenAiCompatibleConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  private name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private extraHeaders: Record<string, string>;

  constructor(config: OpenAiCompatibleConfig) {
    if (!config.name) {
      throw new Error('[OpenAiCompatibleLlmProvider] Provider name is required.');
    }
    if (!config.baseUrl) {
      throw new Error(`[${config.name}] Base URL is required.`);
    }
    if (!config.model) {
      throw new Error(`[${config.name}] Model name is required.`);
    }

    this.name = config.name;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.extraHeaders = config.extraHeaders || {};
  }

  public getModelName(): string {
    return this.model;
  }

  public getProviderName(): string {
    return this.name;
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async *generateStream(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let firstTokenNotified = false;

    const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // Prepend system prompt if provided
    if (options?.systemInstruction) {
      formattedMessages.push({
        role: 'system',
        content: options.systemInstruction,
      });
    }

    // Map conversation turns
    for (const msg of messages) {
      if (msg.role === 'system') {
        formattedMessages.push({ role: 'system', content: msg.text });
      } else if (msg.role === 'user') {
        formattedMessages.push({ role: 'user', content: msg.text });
      } else if (msg.role === 'model') {
        formattedMessages.push({ role: 'assistant', content: msg.text });
      }
    }

    if (formattedMessages.length === 0) {
      return;
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      model: this.model,
      messages: formattedMessages,
      max_tokens: options?.maxOutputTokens ?? 300,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `[${this.name}] HTTP ${response.status} (${response.statusText}): ${errorText}`
        );
      }

      if (!response.body) {
        throw new Error(`[${this.name}] Response body is null.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) {
              continue;
            }

            if (trimmed === 'data: [DONE]') {
              return;
            }

            if (trimmed.startsWith('data: ')) {
              const dataPayload = trimmed.slice(6).trim();
              if (!dataPayload) continue;

              try {
                const parsed = JSON.parse(dataPayload);
                const deltaContent = parsed.choices?.[0]?.delta?.content;
                if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                  if (!firstTokenNotified) {
                    firstTokenNotified = true;
                    options?.onFirstToken?.(Date.now() - startTime);
                  }
                  yield deltaContent;
                }
              } catch {
                // Ignore partial JSON chunks in stream
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`[${this.name}] Request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
