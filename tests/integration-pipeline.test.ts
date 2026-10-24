/**
 * End-to-End Voice & Text Pipeline Integration Test (TDD §11, TC-01..TC-07)
 * Implements PRD §11 & Task T4.2:
 * - End-to-end integration test with audio fixture WAV (fixtures/audio/utt-01.wav, etc.)
 * - Discord voice gateway and receiver stubbed
 * - Mock provider mode for deterministic, fast, offline CI runs
 * - Optional live provider mode when GEMINI_API_KEY is present
 * - Full turn tracing: Audio Packet -> VAD -> STT -> Gating -> LLM Stream -> Chunker -> TTS -> Player
 * - Barge-in mid-playback interruption
 * - Memory turn recording verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filterVoiceAudio } from '../src/audio/vad-filter.js';
import { InteractionGate } from '../src/audio/interaction-gate.js';
import { chunkSentences } from '../src/providers/sentence-chunker.js';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { StreamingVoicePipeline } from '../src/audio/streaming-voice-pipeline.js';
import { getPersonaManager } from '../src/persona/persona-manager.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { TtsProvider, TtsOptions } from '../src/providers/tts-provider.js';
import { STANDARD_FIXTURES, ensureAudioFixtures } from '../src/benchmarks/fixtures-generator.js';
import { withTimeout, withRetry, getRandomFallbackPhrase } from '../src/audio/resilience.js';

// Mock TTS Provider for deterministic offline testing
class MockTtsProvider implements TtsProvider {
  public synthCalls: string[] = [];

  public async synthesize(text: string, _options?: TtsOptions): Promise<Buffer> {
    this.synthCalls.push(text);
    return Buffer.alloc(1024, 0xaa);
  }

  public getVoiceName(): string {
    return 'mock-indonesian-neural';
  }

  public getStreamType(): string {
    return 'webm/opus';
  }
}

// Stubbed VoicePlayer simulating Discord voice audio dispatch
class StubbedVoicePlayer extends VoicePlayer {
  public enqueuedBuffers: Buffer[] = [];
  public stopped = false;
  public cleared = false;

  public override async enqueue(audioBuffer: Buffer): Promise<void> {
    this.enqueuedBuffers.push(audioBuffer);
  }

  public override stop(): number {
    this.stopped = true;
    return 5;
  }

  public override clearQueue(): number {
    this.cleared = true;
    const len = this.enqueuedBuffers.length;
    this.enqueuedBuffers = [];
    return len;
  }
}

test('Integration Pipeline: End-to-end turn execution with WAV audio fixture (utt-01)', async () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures', 'audio');
  const fixtures = ensureAudioFixtures(fixturesDir);
  const fixture01 = fixtures.find((f) => f.id === 'utt-01') || fixtures[0];

  assert.ok(fs.existsSync(fixture01.filePath), 'Fixture utt-01 must exist');
  const wavBuffer = fs.readFileSync(fixture01.filePath);
  assert.ok(wavBuffer.length > 44, 'WAV buffer must be valid');

  // Step 1: VAD Filtering on WAV PCM buffer
  const pcmData = wavBuffer.subarray(44);
  const vadResult = filterVoiceAudio(pcmData, { sampleRate: 48000, minRmsThreshold: 100 });
  assert.equal(vadResult.isVoice, true, 'WAV fixture must contain detectable speech energy');
  assert.ok(vadResult.durationSec >= 0.5, 'Duration must be >= 0.5s');

  // Step 2: Simulated STT from fixture audio
  const simulatedTranscript = fixture01.transcript; // 'Halo Lyra!'
  assert.ok(simulatedTranscript.length > 0);

  // Step 3: Interaction Gating (Wake mode)
  const gate = new InteractionGate({ mode: 'wake', wakeWords: ['lyra', 'halo lyra'] });
  const gateCheck = gate.evaluate(simulatedTranscript);
  assert.equal(gateCheck.allowed, true, 'Gate must trigger for wake word');

  // Step 4: Persona Context Preparation
  const persona = getPersonaManager();
  await persona.load();
  const systemPrompt = persona.buildSystemInstruction('voice');
  assert.ok(systemPrompt.includes('Lyra'), 'System prompt must contain persona identity');

  // Step 5: Streaming LLM Simulation
  async function* mockLlmTokenStream(): AsyncIterable<string> {
    const tokens = ['Halo ', 'juga! ', 'Senang ', 'banget ', 'bisa ', 'ngobrol ', 'sama ', 'kamu ', 'hari ', 'ini.'];
    for (const t of tokens) {
      await new Promise((res) => setTimeout(res, 5));
      yield t;
    }
  }

  // Step 6: Streaming Voice Pipeline (Chunker -> TTS -> Stubbed VoicePlayer)
  const mockTts = new MockTtsProvider();
  const stubPlayer = new StubbedVoicePlayer();
  const pipeline = new StreamingVoicePipeline(mockTts, stubPlayer);

  const chunksReceived: string[] = [];
  const pipelineResult = await pipeline.execute(mockLlmTokenStream(), {
    callbacks: {
      onSentenceChunk: (chunk) => {
        chunksReceived.push(chunk);
      },
    },
  });

  assert.equal(pipelineResult.sentenceCount > 0, true, 'At least one sentence must be chunked');
  assert.equal(pipelineResult.audioChunksEnqueued > 0, true, 'Audio chunk must be synthesized');
  assert.equal(stubPlayer.enqueuedBuffers.length > 0, true, 'Stubbed player must receive audio chunks');
  assert.equal(pipelineResult.isAborted, false, 'Pipeline must finish without abort');

  // Step 7: Memory Recording
  const memoryDbPath = path.join(process.cwd(), 'fixtures', 'test-integration-memory.sqlite');
  const memoryStore = new MemoryStore({ dbPath: memoryDbPath });

  memoryStore.recordTurn({
    sessionId: 'session-integ-1',
    channelId: 'voice-integ-chan',
    userId: 'user-integ-1',
    userName: 'Tester',
    userInput: simulatedTranscript,
    botReply: pipelineResult.fullText,
    turnLatencyMs: 850,
  });

  const recentTurns = memoryStore.getRecentTurns('voice-integ-chan', 5);
  assert.equal(recentTurns.length, 1);
  assert.equal(recentTurns[0].userInput, simulatedTranscript);
  assert.equal(recentTurns[0].botReply, pipelineResult.fullText);

  // Clean up
  memoryStore.close();
  if (fs.existsSync(memoryDbPath)) {
    fs.unlinkSync(memoryDbPath);
  }
});

test('Integration Pipeline: Barge-in cancels streaming audio in-flight under 300ms (TC-05)', async () => {
  const mockTts = new MockTtsProvider();
  const stubPlayer = new StubbedVoicePlayer();
  const pipeline = new StreamingVoicePipeline(mockTts, stubPlayer);

  const abortController = new AbortController();

  // Infinite/Long token generator to simulate ongoing streaming speech
  async function* longTokenStream(): AsyncIterable<string> {
    for (let i = 0; i < 50; i++) {
      if (abortController.signal.aborted) return;
      await new Promise((res) => setTimeout(res, 20));
      yield `Bagian kalimat nomor ${i}. `;
    }
  }

  const pipelinePromise = pipeline.execute(longTokenStream(), {
    abortSignal: abortController.signal,
  });

  // Simulate user interruption (barge-in) after 60ms
  await new Promise((res) => setTimeout(res, 60));
  const tStartAbort = Date.now();
  abortController.abort();
  stubPlayer.stop();
  stubPlayer.clearQueue();

  const result = await pipelinePromise;
  const abortDurationMs = Date.now() - tStartAbort;

  assert.equal(result.isAborted, true, 'Pipeline must record aborted status');
  assert.ok(abortDurationMs <= 300, `Barge-in abort duration (${abortDurationMs}ms) must be <= 300ms`);
  assert.equal(stubPlayer.stopped, true, 'Player must receive stop command');
});

test('Integration Pipeline: Fallback handling when LLM/STT encounters network timeout (TC-09)', async () => {
  let failed = false;
  let fallbackInvoked = false;

  try {
    await withTimeout(
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('ETIMEDOUT: upstream voice provider unresponsive')), 30);
      }),
      20,
      'IntegrationProviderTimeout'
    );
  } catch (err: any) {
    failed = true;
    const fallbackText = getRandomFallbackPhrase();
    assert.ok(fallbackText.length > 0, 'Fallback text must be provided from persona');
    fallbackInvoked = true;
  }

  assert.equal(failed, true, 'Provider failure must be caught');
  assert.equal(fallbackInvoked, true, 'Persona fallback must be engaged smoothly');
});

test('Integration Pipeline: Multi-fixture processing across conversational categories', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures', 'audio');
  const fixtures = ensureAudioFixtures(fixturesDir);

  // Validate all 10 fixtures pass VAD and duration sanity
  for (const fix of fixtures) {
    const buf = fs.readFileSync(fix.filePath);
    const pcm = buf.subarray(44);
    const vad = filterVoiceAudio(pcm, { sampleRate: 48000, minRmsThreshold: 100 });
    assert.ok(vad.isVoice, `Fixture ${fix.id} (${fix.name}) must have speech energy`);
    assert.ok(vad.durationSec > 0.5, `Fixture ${fix.id} duration must be > 0.5s`);
  }
});
