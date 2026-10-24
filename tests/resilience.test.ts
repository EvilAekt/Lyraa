import test from 'node:test';
import assert from 'node:assert/strict';
import {
  withTimeout,
  withRetry,
  TimeoutError,
  calculateBackoffDelay,
  FALLBACK_LLM_PHRASES,
  getRandomFallbackPhrase,
} from '../src/audio/resilience.js';
import { VoiceConnectionManager } from '../src/audio/voice-connection-manager.js';

test('Resilience: withTimeout resolves when operation finishes before deadline', async () => {
  const fastPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve('success'), 20);
  });

  const result = await withTimeout(fastPromise, 100, 'FastOperation');
  assert.equal(result, 'success');
});

test('Resilience (TC-09): withTimeout throws TimeoutError when deadline is exceeded', async () => {
  const slowPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve('slow'), 150);
  });

  await assert.rejects(
    async () => {
      await withTimeout(slowPromise, 30, 'SlowOperation');
    },
    (err: any) => {
      assert.ok(err instanceof TimeoutError);
      assert.equal(err.operation, 'SlowOperation');
      assert.equal(err.timeoutMs, 30);
      return true;
    }
  );
});

test('Resilience: calculateBackoffDelay incorporates exponential factor and random jitter', () => {
  const delay0 = calculateBackoffDelay(0, 100, 1000, 50);
  assert.ok(delay0 >= 100 && delay0 <= 150, `Delay 0 (${delay0}) must be within base + jitter`);

  const delay1 = calculateBackoffDelay(1, 100, 1000, 50);
  assert.ok(delay1 >= 150 && delay1 <= 200, `Delay 1 (${delay1}) must be >= 150ms`);

  const delayCapped = calculateBackoffDelay(10, 500, 2000, 50);
  assert.equal(delayCapped, 2000, 'Delay must be capped at maxDelayMs');
});

test('Resilience (TC-09): withRetry executes 1 retry with jitter before failing', async () => {
  let attempts = 0;
  const retryDelays: number[] = [];

  const operation = async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error('Simulated 429 Too Many Requests');
    }
    return 'recovered';
  };

  const result = await withRetry(operation, {
    maxRetries: 1,
    baseDelayMs: 20,
    jitterMs: 10,
    onRetry: (_err, _attempt, delay) => {
      retryDelays.push(delay);
    },
  });

  assert.equal(result, 'recovered');
  assert.equal(attempts, 2, 'Should succeed on attempt #2 (1 retry)');
  assert.equal(retryDelays.length, 1, 'Should record 1 retry delay');
  assert.ok(retryDelays[0] >= 20, 'Delay should be at least baseDelayMs');
});

test('Resilience (TC-09): withRetry exhausts retries and throws when persistent failure occurs', async () => {
  let attempts = 0;

  const failingOperation = async () => {
    attempts++;
    throw new Error('Persistent Network Failure');
  };

  await assert.rejects(
    async () => {
      await withRetry(failingOperation, {
        maxRetries: 1,
        baseDelayMs: 10,
        jitterMs: 5,
      });
    },
    {
      message: 'Persistent Network Failure',
    }
  );

  assert.equal(attempts, 2, 'Should attempt initial call + 1 retry');
});

test('Resilience (TC-09): getRandomFallbackPhrase returns persona canned Indonesian response', () => {
  const phrase = getRandomFallbackPhrase();
  assert.ok(typeof phrase === 'string' && phrase.length > 0);
  assert.ok(
    FALLBACK_LLM_PHRASES.includes(phrase),
    `Selected phrase "${phrase}" must belong to verified FALLBACK_LLM_PHRASES`
  );
});

test('Resilience (TC-09): simulated pipeline fallback for LLM error (429/timeout)', async () => {
  // Simulate an LLM call that times out or returns 429
  let llmFailed = false;
  let finalResponse = '';

  try {
    await withRetry(
      async () => {
        throw new Error('429 RESOURCE_EXHAUSTED: Quota exceeded');
      },
      { maxRetries: 1, baseDelayMs: 5, jitterMs: 5 }
    );
  } catch (err: any) {
    llmFailed = true;
    // Fallback: use canned persona phrase
    finalResponse = getRandomFallbackPhrase();
  }

  assert.equal(llmFailed, true, 'LLM error should be caught');
  assert.ok(finalResponse.length > 0, 'Fallback response should not be empty');
  assert.ok(
    FALLBACK_LLM_PHRASES.includes(finalResponse),
    'Fallback response must be from canned phrase list'
  );
});

test('Resilience (TC-09): simulated pipeline fallback for TTS failure to text channel', async () => {
  // Simulate TTS synthesis failure
  let textFallbackSent = false;
  let textMessageContent = '';

  const mockTextChannel = {
    send: async (msg: { content: string }) => {
      textFallbackSent = true;
      textMessageContent = msg.content;
    },
  };

  try {
    await withRetry(
      async () => {
        throw new Error('TTS Service Unavailable (503)');
      },
      { maxRetries: 1, baseDelayMs: 5, jitterMs: 5 }
    );
  } catch (err: any) {
    // Fallback: send text to channel
    const textReply = 'Jawaban teks dari Lyra saat suara bermasalah.';
    await mockTextChannel.send({
      content: `⚠️ *[Voice TTS Fallback]* ${textReply}`,
    });
  }

  assert.equal(textFallbackSent, true, 'Text fallback message must be sent to channel');
  assert.ok(textMessageContent.includes('Jawaban teks dari Lyra'));
});

test('Resilience (TC-08): VoiceConnectionManager circuit-breaker halts after max attempts', async () => {
  const manager = new VoiceConnectionManager({
    maxReconnectAttempts: 2,
    baseDelayMs: 10,
    maxDelayMs: 50,
  });

  // Inject a mock session that always fails connection
  const mockGuildId = 'guild-mock-fail';
  (manager as any).sessions.set(mockGuildId, {
    guildId: mockGuildId,
    channelId: 'ch-1',
    channelName: 'General Voice',
    adapterCreator: () => ({}),
    textChannel: undefined,
    reconnectAttempts: 0,
    totalReconnects: 0,
    isIntentionalDisconnect: false,
    isReconnecting: false,
  });

  const success = await manager.handleDisconnection(mockGuildId);
  assert.equal(success, false, 'Reconnection should fail after exhausting attempts');

  const session = manager.getSession(mockGuildId);
  assert.equal(session?.reconnectAttempts, 2, 'Should have reached max attempts');
  assert.equal(session?.isReconnecting, false, 'Should reset isReconnecting state');
  assert.equal(manager.getTotalReconnects(mockGuildId), 0, 'Total successful reconnects remains 0');
});

test('Resilience (TC-08): VoiceConnectionManager ignores intentional user leave', async () => {
  const manager = new VoiceConnectionManager();
  const mockGuildId = 'guild-mock-leave';

  (manager as any).sessions.set(mockGuildId, {
    guildId: mockGuildId,
    channelId: 'ch-1',
    channelName: 'General Voice',
    adapterCreator: () => ({}),
    textChannel: undefined,
    reconnectAttempts: 0,
    totalReconnects: 0,
    isIntentionalDisconnect: false,
    isReconnecting: false,
  });

  manager.leave(mockGuildId);
  assert.equal(manager.getSession(mockGuildId), undefined, 'Session should be cleaned up on leave');

  const handled = await manager.handleDisconnection(mockGuildId);
  assert.equal(handled, false, 'Handle disconnection must not run for removed/intentional leave');
});
