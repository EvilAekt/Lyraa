/**
 * Tests for T6.2 Spike Pipeline B (Gemini Live Speech-to-Speech)
 * 
 * Verifies:
 * 1. Live session initialization, default configuration, and parameters
 * 2. Session resumption protocol (handle update, retention, and resumption)
 * 3. Real-time audio resampling (24kHz mono PCM -> 48kHz mono PCM)
 * 4. Hybrid VAD end-of-turn trigger and streaming audio output
 * 5. Barge-in interruption handling and event propagation
 * 6. Comparative benchmark harness across identical dialogue script (Pipeline A vs B)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PipelineBLiveSession } from '../src/spikes/pipeline-b-live.js';
import { runPipelineComparisonBenchmark, COMPARISON_SCRIPT } from '../src/benchmarks/pipeline-b-comparison.js';

test('T6.2 / Pipeline B: Session initializes with session resumption and context compression', async () => {
  const session = new PipelineBLiveSession({
    mockMode: true,
    model: 'gemini-2.0-flash-exp',
    voiceName: 'Aoede',
    enableResumption: true,
    enableCompression: true,
  });

  assert.equal(session.getState().status, 'idle');
  const connected = await session.connect();
  assert.equal(connected, true);
  assert.equal(session.getState().status, 'connected');
  assert.equal(session.getState().resumable, true);
  assert.ok(session.getResumptionHandle()?.startsWith('live-handle-mock-'));

  await session.disconnect();
  assert.equal(session.getState().status, 'closed');
});

test('T6.2 / Pipeline B: Session Resumption protocol maintains handle and reconnects cleanly', async () => {
  const initialHandle = 'live-handle-prev-test-12345';
  const session = new PipelineBLiveSession({
    mockMode: true,
    initialHandle,
  });

  assert.equal(session.getResumptionHandle(), initialHandle);
  assert.equal(session.getState().resumable, true);

  await session.connect();
  assert.equal(session.getState().status, 'connected');

  // Resume with new handle
  const resumedHandle = 'live-handle-resumed-999';
  const resumeSuccess = await session.resume(resumedHandle);
  assert.equal(resumeSuccess, true);
  assert.equal(session.getResumptionHandle(), resumedHandle);

  await session.disconnect();
});

test('T6.2 / Pipeline B: Audio resampling 24kHz to 48kHz correctly doubles sample buffer', () => {
  // Create 100 samples of 16-bit PCM at 24kHz (200 bytes)
  const sampleCount = 100;
  const pcm24k = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    pcm24k.writeInt16LE(1000 + i * 10, i * 2);
  }

  const pcm48k = PipelineBLiveSession.resample24kTo48k(pcm24k);

  // Buffer length must be exactly double (400 bytes for 200 samples)
  assert.equal(pcm48k.length, pcm24k.length * 2);

  // Check sample preservation and linear interpolation
  const firstSampleIn = pcm24k.readInt16LE(0);
  const firstSampleOut = pcm48k.readInt16LE(0);
  assert.equal(firstSampleOut, firstSampleIn);

  const secondSampleIn = pcm24k.readInt16LE(2);
  const interpolatedMid = pcm48k.readInt16LE(2);
  assert.equal(interpolatedMid, Math.round((firstSampleIn + secondSampleIn) / 2));
});

test('T6.2 / Pipeline B: Audio streaming, Hybrid VAD trigger, and output playback events', async () => {
  const session = new PipelineBLiveSession({ mockMode: true });
  await session.connect();

  let audioChunkReceived = false;
  let transcriptionReceived = false;
  let turnCompleteReceived = false;

  session.on('audio_output', (event) => {
    assert.ok(event.raw24k.length > 0);
    assert.ok(event.pcm48k.length > 0);
    assert.equal(event.pcm48k.length, event.raw24k.length * 2);
    audioChunkReceived = true;
  });

  session.on('transcription', (trans) => {
    assert.ok(trans.text.length > 0);
    assert.equal(trans.sender, 'model');
    transcriptionReceived = true;
  });

  session.on('turn_complete', (metrics) => {
    assert.ok(metrics.turnLatencyMs > 0);
    assert.ok(metrics.audioChunksReceived > 0);
    turnCompleteReceived = true;
  });

  // Send 100ms PCM chunk
  const dummyAudio = Buffer.alloc(3200);
  session.sendAudioChunk(dummyAudio);

  // Signal turn end
  session.sendEndOfTurn();

  // Wait for mock response
  await new Promise<void>((resolve) => {
    session.once('turn_complete', () => resolve());
  });

  assert.equal(audioChunkReceived, true);
  assert.equal(transcriptionReceived, true);
  assert.equal(turnCompleteReceived, true);

  await session.disconnect();
});

test('T6.2 / Pipeline B: Barge-in interruption immediately cancels streaming response', async () => {
  const session = new PipelineBLiveSession({ mockMode: true });
  await session.connect();

  let interruptedFired = false;
  session.on('interrupted', () => {
    interruptedFired = true;
  });

  session.sendAudioChunk(Buffer.alloc(1600));
  session.sendEndOfTurn();

  // Trigger barge-in before response finishes
  session.triggerBargeIn();
  assert.equal(interruptedFired, true);

  await session.disconnect();
});

test('T6.2 / PRD §15 AC: Comparative benchmark on identical script yields report metrics', async () => {
  assert.equal(COMPARISON_SCRIPT.length, 5);

  const report = await runPipelineComparisonBenchmark();

  assert.equal(report.totalTurns, 5);
  assert.ok(report.pipelineA.p50LatencyMs > 1000, 'Pipeline A p50 should reflect realistic cascaded latency');
  assert.ok(report.pipelineB.p50LatencyMs < report.pipelineA.p50LatencyMs, 'Pipeline B should achieve lower first-audio latency');
  assert.ok(report.pipelineB.resumptionRecoveryMs >= 0, 'Resumption recovery must be measured');
  assert.equal(report.recommendation, 'ADOPT_OPTIONAL_MODE');

  // Verify all turns contain valid comparison results
  for (const turn of report.turns) {
    assert.ok(turn.pipelineALatencyMs > 0);
    assert.ok(turn.pipelineBLatencyMs > 0);
    assert.ok(turn.percentageFaster > 0, 'Pipeline B is faster in speech-to-speech first audio');
  }
});
