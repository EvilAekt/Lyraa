/**
 * LLM Provider Interface
 * Standardized abstraction for streaming large language model generation.
 */

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
}

export interface GenerateOptions {
  maxOutputTokens?: number;
  temperature?: number;
  systemInstruction?: string;
  onFirstToken?: (ttftMs: number) => void;
}

export interface LlmProvider {
  /**
   * Generates a streaming token response from an array of chat messages.
   * Yields text tokens as they arrive from the upstream model.
   */
  generateStream(messages: ChatMessage[], options?: GenerateOptions): AsyncIterable<string>;

  /**
   * Returns the underlying model identifier configured for this provider.
   */
  getModelName(): string;
}
