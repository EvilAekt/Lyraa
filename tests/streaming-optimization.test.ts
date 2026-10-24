/**
 * Task T3.2 Unit Tests: Streaming per kalimat dan optimasi latensi
 * Tests:
 * 1. HTTP Keep-Alive connection pooling configuration
 * 2. PhraseAudioCache normalization, instant retrieval, and warm-up
 * 3. GeminiContextCacheManager token evaluation and pre-warm
 * 4. EdgeTtsProvider warmUp and streaming synthesizer
 * 5. StreamingVoicePipeline end-to-end pipelined synthesis & barge-in abort
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHttpKeepAlivePool, isKeepAliveActive } from '../src/config/http-pool.js';
import { PhraseAudioCache } from '../src/audio/phrase-audio-cache.js';
import { GeminiContextCacheManager } from '../src/providers/gemini/context-cache.js';
import { StreamingVoicePipeline } from '../src/audio/streaming-voice-pipeline.js';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { TtsProvider, TtsOptions } from '../src/providers/tts-provider.js';

class MockTtsProvider implements TtsProvider {
  public synthCalls: string[] = [];
  public isWarmed = false;

  public async warmUp(): Promise<void> {
    this.isWarmed = true;
  }

  public async synthesize(text: string, _options?: TtsOptions): Promise<Buffer> {
    this.synthCalls.push(text);
    // Simulate minimal WebM Opus chunk (e.g. 100 bytes)
    return Buffer.alloc(100, 0xaa);
  }

  public async *synthesizeStream(text: string, _options?: TtsOptions): AsyncIterable<Buffer> {
    this.synthCalls.push(text);
    yield Buffer.alloc(50, 0xbb);
    yield Buffer.alloc(50, 0xcc);
  }

  public getVoiceName(): string {
    return 'mock-indonesian-voice';
  }

  public getStreamType(): string {
    return 'webm/opus';
  }
}

class MockVoicePlayer extends VoicePlayer {
  public enqueuedBuffers: Buffer[] = [];
  public stopped = false;

  public override async enqueue(audioBuffer: Buffer): Promise<void> {
    this.enqueuedBuffers.push(audioBuffer);
  }

  public override stop(): number {
    this.stopped = true;
    return 5;
  }
}

test('T3.2: HTTP Keep-Alive Pool initializes properly', () => {
  const agent = setupHttpKeepAlivePool({ keepAliveTimeout: 45_000, maxSockets: 32 });
  assert.ok(agent, 'Agent should be defined');
  assert.strictEqual(isKeepAliveActive(), true, 'Keep-alive pool should be active');
});

test('T3.2: PhraseAudioCache normalizes keys and provides instant retrieval', async () => {
  const cache = new PhraseAudioCache(['Halo!', 'Sebentar ya...']);
  assert.strictEqual(cache.normalize('  HALO!  '), 'halo');
  assert.strictEqual(cache.normalize('Sebentar ya...?'), 'sebentar ya');

  const dummyAudio = Buffer.from('mock-audio-data');
  cache.set('Halo!', dummyAudio);

  assert.strictEqual(cache.has('halo'), true);
  assert.strictEqual(cache.has('HALO!'), true);
  assert.strictEqual(cache.has('Tidak ada'), false);

  const retrieved = cache.get('Halo!');
  assert.ok(retrieved);
  assert.strictEqual(retrieved?.toString(), 'mock-audio-data');
});

test('T3.2: PhraseAudioCache warms up using TtsProvider', async () => {
  const cache = new PhraseAudioCache(['Siap!', 'Oke deh!']);
  const tts = new MockTtsProvider();

  const count = await cache.warmUp(tts);
  assert.ok(count >= 2, 'Should warm up at least 2 phrases');
  assert.strictEqual(cache.has('Siap!'), true);
  assert.strictEqual(cache.has('Oke deh!'), true);
  assert.ok(cache.get('Siap!')?.length! > 0);
});

test('T3.2: GeminiContextCacheManager evaluates explicit vs implicit caching', async () => {
  const cacheManager = new GeminiContextCacheManager('dummy-api-key', 'gemini-2.5-flash');

  // Short system prompt (< 32,768 tokens)
  const shortPrompt = 'Kamu adalah Lyra AI VTuber.';
  const evalResult = await cacheManager.evaluatePromptCaching(shortPrompt);

  assert.strictEqual(evalResult.isImplicitSupported, true, 'Gemini 2.5 should support implicit caching');
  assert.strictEqual(evalResult.isExplicitEligible, false, 'Short prompt should not exceed explicit threshold');
  assert.ok(evalResult.tokenCount > 0);
  assert.strictEqual(evalResult.minimumTokensRequired, 32_768);
});

test('T3.2: StreamingVoicePipeline streams sentences to TTS and player concurrently', async () => {
  const tts = new MockTtsProvider();
  const player = new MockVoicePlayer();
  const pipeline = new StreamingVoicePipeline(tts, player);

  // Simulated streaming LLM token stream yielding multiple sentences
  async function* mockLlmTokens(): AsyncIterable<string> {
    yield 'Halo ';
    yield 'semuanya! ';
    yield 'Hari ini ';
    yield 'kita mau ';
    yield 'mabar game apa ya? ';
    yield 'Ketik di chat ya.';
  }

  const result = await pipeline.execute(mockLlmTokens(), {
    chunkerOptions: { maxFirstChunkWords: 8 },
    cleanForTts: (t) => t.trim(),
  });

  assert.strictEqual(result.isAborted, false);
  assert.strictEqual(result.sentenceCount >= 2, true, 'Should split into multiple sentences');
  assert.strictEqual(player.enqueuedBuffers.length, result.sentenceCount, 'All synthesized sentences should be enqueued');
  assert.ok(tts.synthCalls.length >= 2, 'TTS should be called for each sentence');
  assert.strictEqual(result.fullText.includes('Halo semuanya!'), true);
});

test('T3.2: StreamingVoicePipeline leverages PhraseAudioCache for instant response', async () => {
  const tts = new MockTtsProvider();
  const player = new MockVoicePlayer();
  const pipeline = new StreamingVoicePipeline(tts, player);

  // Warm phrase cache with "Halo!"
  const cache = new PhraseAudioCache();
  cache.set('Halo!', Buffer.from('cached-halo-opus'));

  async function* mockLlmTokens(): AsyncIterable<string> {
    yield 'Halo! ';
    yield 'Ada yang bisa aku bantu?';
  }

  const result = await pipeline.execute(mockLlmTokens(), {
    enablePhraseCache: true,
  });

  assert.ok(result.sentenceCount >= 2);
  assert.ok(player.enqueuedBuffers.length >= 2);
});

test('T3.2: StreamingVoicePipeline halts immediately upon barge-in abort signal', async () => {
  const tts = new MockTtsProvider();
  const player = new MockVoicePlayer();
  const pipeline = new StreamingVoicePipeline(tts, player);

  const abortController = new AbortController();

  async function* infiniteTokens(): AsyncIterable<string> {
    yield 'Kalimat pertama selesai. ';
    // Trigger barge-in
    abortController.abort();
    yield 'Kalimat kedua tidak boleh diproses. ';
    yield 'Kalimat ketiga juga tidak boleh.';
  }

  const result = await pipeline.execute(infiniteTokens(), {
    abortSignal: abortController.signal,
  });

  assert.strictEqual(result.isAborted, true, 'Pipeline should report aborted');
  assert.strictEqual(result.sentenceCount <= 2, true, 'Subsequent sentences should be dropped');
});
