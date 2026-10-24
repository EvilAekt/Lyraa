import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatMessage,
  GenerateOptions,
  LlmProvider,
} from '../src/providers/llm-provider.js';
import {
  WaterfallLlmProvider,
  WaterfallCandidate,
} from '../src/providers/waterfall-llm.js';
import { OpenAiCompatibleLlmProvider } from '../src/providers/openai-compatible-llm.js';

// Mock Provider for testing waterfall failover behavior
class MockLlmProvider implements LlmProvider {
  public callCount = 0;
  constructor(
    private name: string,
    private behavior: 'success' | 'fail_immediate' | 'fail_mid_stream',
    private tokens: string[] = ['Halo', ' dari ', 'provider']
  ) {}

  public getModelName(): string {
    return `mock-${this.name}`;
  }

  public async *generateStream(
    _messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    this.callCount++;

    if (this.behavior === 'fail_immediate') {
      throw new Error(`[${this.name}] 429 Resource Exhausted / Rate Limit`);
    }

    if (this.behavior === 'fail_mid_stream') {
      yield 'TokenAwal ';
      throw new Error(`[${this.name}] Connection dropped mid-stream`);
    }

    // Success case
    options?.onFirstToken?.(10);
    for (const token of this.tokens) {
      yield token;
    }
  }
}

test('WaterfallLlmProvider - Scenario 1: Primary provider succeeds immediately', async () => {
  const gemini = new MockLlmProvider('Gemini', 'success', ['Ihh ', 'kamu ', 'lucu!']);
  const groq = new MockLlmProvider('Groq', 'success', ['Fallback Groq']);
  const openRouter = new MockLlmProvider('OpenRouter', 'success', ['Fallback OpenRouter']);

  const waterfall = new WaterfallLlmProvider([
    { name: 'Gemini', provider: gemini },
    { name: 'Groq', provider: groq },
    { name: 'OpenRouter', provider: openRouter },
  ]);

  const output: string[] = [];
  for await (const chunk of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
    output.push(chunk);
  }

  assert.equal(output.join(''), 'Ihh kamu lucu!');
  assert.equal(gemini.callCount, 1);
  assert.equal(groq.callCount, 0, 'Groq should not be invoked when primary succeeds');
  assert.equal(openRouter.callCount, 0, 'OpenRouter should not be invoked when primary succeeds');
  assert.equal(waterfall.getLastSuccessfulProvider(), 'Gemini');
});

test('WaterfallLlmProvider - Scenario 2: Gemini 429 Rate-Limit fails over to Groq', async () => {
  const gemini = new MockLlmProvider('Gemini', 'fail_immediate');
  const groq = new MockLlmProvider('Groq', 'success', ['Ciee~ ', 'aku ', 'Groq!']);
  const openRouter = new MockLlmProvider('OpenRouter', 'success', ['Backup OpenRouter']);

  const waterfall = new WaterfallLlmProvider([
    { name: 'Gemini', provider: gemini },
    { name: 'Groq', provider: groq },
    { name: 'OpenRouter', provider: openRouter },
  ]);

  const output: string[] = [];
  for await (const chunk of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
    output.push(chunk);
  }

  assert.equal(output.join(''), 'Ciee~ aku Groq!');
  assert.equal(gemini.callCount, 1);
  assert.equal(groq.callCount, 1, 'Groq should take over after Gemini fails');
  assert.equal(openRouter.callCount, 0, 'OpenRouter should not be touched since Groq succeeded');
  assert.equal(waterfall.getLastSuccessfulProvider(), 'Groq');
});

test('WaterfallLlmProvider - Scenario 3: Double failover (Gemini & Groq fail -> OpenRouter Free succeeds)', async () => {
  const gemini = new MockLlmProvider('Gemini', 'fail_immediate');
  const groq = new MockLlmProvider('Groq', 'fail_immediate');
  const openRouter = new MockLlmProvider('OpenRouter', 'success', ['Dih, ', 'pake ', 'OpenRouter deh!']);

  const waterfall = new WaterfallLlmProvider([
    { name: 'Gemini', provider: gemini },
    { name: 'Groq', provider: groq },
    { name: 'OpenRouter', provider: openRouter },
  ]);

  const output: string[] = [];
  for await (const chunk of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
    output.push(chunk);
  }

  assert.equal(output.join(''), 'Dih, pake OpenRouter deh!');
  assert.equal(gemini.callCount, 1);
  assert.equal(groq.callCount, 1);
  assert.equal(openRouter.callCount, 1);
  assert.equal(waterfall.getLastSuccessfulProvider(), 'OpenRouter');
});

test('WaterfallLlmProvider - Scenario 4: All providers fail throws descriptive error', async () => {
  const gemini = new MockLlmProvider('Gemini', 'fail_immediate');
  const groq = new MockLlmProvider('Groq', 'fail_immediate');
  const openRouter = new MockLlmProvider('OpenRouter', 'fail_immediate');

  const waterfall = new WaterfallLlmProvider([
    { name: 'Gemini', provider: gemini },
    { name: 'Groq', provider: groq },
    { name: 'OpenRouter', provider: openRouter },
  ]);

  await assert.rejects(
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
        // do nothing
      }
    },
    /All 3 providers exhausted/
  );
});

test('WaterfallLlmProvider - Scenario 5: Mid-stream failure stops and does NOT corrupt speech pipeline', async () => {
  const gemini = new MockLlmProvider('Gemini', 'fail_mid_stream');
  const groq = new MockLlmProvider('Groq', 'success');

  const waterfall = new WaterfallLlmProvider([
    { name: 'Gemini', provider: gemini },
    { name: 'Groq', provider: groq },
  ]);

  await assert.rejects(
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
        // do nothing
      }
    },
    /Connection dropped mid-stream/
  );

  assert.equal(gemini.callCount, 1);
  assert.equal(groq.callCount, 0, 'Groq must NOT be invoked mid-stream to avoid stutter/duplicate voice playback');
});

test('WaterfallLlmProvider - Scenario 6: Skips unconfigured candidates', async () => {
  const gemini = new MockLlmProvider('Gemini', 'fail_immediate');
  const groq = new MockLlmProvider('Groq', 'success', ['Groq fallback']);

  const candidates: WaterfallCandidate[] = [
    { name: 'Gemini', provider: gemini },
    {
      name: 'UnconfiguredKeyProvider',
      provider: new MockLlmProvider('MissingKey', 'fail_immediate'),
      isConfigured: () => false,
    },
    { name: 'Groq', provider: groq },
  ];

  const waterfall = new WaterfallLlmProvider(candidates);

  const output: string[] = [];
  for await (const chunk of waterfall.generateStream([{ role: 'user', text: 'Halo' }])) {
    output.push(chunk);
  }

  assert.equal(output.join(''), 'Groq fallback');
  assert.equal(waterfall.getLastSuccessfulProvider(), 'Groq');
});
