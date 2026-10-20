---
name: gemini-pipeline
description: >-
  Use this skill when configuring Google Gen AI SDK (@google/genai), streaming LLM generation, sentence chunking, multimodal image input, and TTS synthesis.
---

# Gemini AI Pipeline Integration

This skill outlines best practices for integrating Google Gemini models via `@google/genai` into the Bot-AI streaming voice & chat orchestrator.

## 1. SDK Initialization

Use the official Google Gen AI SDK:
```typescript
import { GoogleGenAI } from '@google/genai';

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

## 2. Streaming LLM with Sentence Chunking

To minimize voice latency, stream tokens and split sentences immediately:

```typescript
export async function* streamSentences(
  systemInstruction: string,
  userPrompt: string,
  abortSignal?: AbortSignal
): AsyncGenerator<string> {
  const responseStream = await ai.models.generateContentStream({
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      temperature: 0.85,
      maxOutputTokens: 150, // Keep answers concise for voice
    },
  });

  let buffer = '';
  const sentenceEndRegex = /([.?!]+[\s\n]+|[\n\r]+)/;

  for await (const chunk of responseStream) {
    if (abortSignal?.aborted) break;
    const text = chunk.text;
    if (!text) continue;
    buffer += text;

    let match;
    while ((match = sentenceEndRegex.exec(buffer)) !== null) {
      const splitIndex = match.index + match[0].length;
      const sentence = buffer.slice(0, splitIndex).trim();
      buffer = buffer.slice(splitIndex);
      if (sentence.length > 0) {
        yield sentence;
      }
    }
  }

  if (buffer.trim().length > 0 && !abortSignal?.aborted) {
    yield buffer.trim();
  }
}
```

## 3. Multimodal Image Input (≤ 5MB)

```typescript
export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  userCaption: string
): Promise<string> {
  const base64Data = imageBuffer.toString('base64');
  const response = await ai.models.generateContent({
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `<user_input>${userCaption || 'Apa yang terlihat di gambar ini?'}</user_input>` },
        ],
      },
    ],
  });

  return response.text || '';
}
```

## 4. TTS and Audio Synthesis

- Transform clean text (strip emoji, markdown, emotion tags `[happy]`, etc.)
- Apply pronunciation dictionary from `persona/lexicon.json`
- Request audio streaming, decode to PCM, resample from 24kHz to 48kHz, and wrap into Discord Opus packet stream.
