import test from 'node:test';
import assert from 'node:assert/strict';
import { getLlmProvider } from '../src/providers/index.js';
import { config } from '../src/config/index.js';

test('GeminiLlmProvider: initializes from config without hardcoded model', () => {
  const provider = getLlmProvider();
  assert.equal(provider.getModelName(), config.LLM_MODEL);
});

test('GeminiLlmProvider: streams tokens and triggers TTFT callback', async (t) => {
  if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === 'dummy_key_for_scaffold') {
    t.skip('Skipping live Gemini streaming test: GEMINI_API_KEY not configured.');
    return;
  }

  const provider = getLlmProvider();
  let firstTokenTimeMs = 0;
  let fullOutput = '';

  const stream = provider.generateStream(
    [
      { role: 'user', text: 'Katakan "Halo Dunia" dalam dua kata saja.' },
    ],
    {
      maxOutputTokens: 20,
      temperature: 0.2,
      onFirstToken: (ttft) => {
        firstTokenTimeMs = ttft;
      },
    }
  );

  for await (const token of stream) {
    fullOutput += token;
  }

  assert.ok(fullOutput.length > 0, 'Output must not be empty');
  assert.ok(firstTokenTimeMs > 0, 'TTFT callback must be triggered with positive time');
});
