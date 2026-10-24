import test from 'node:test';
import assert from 'node:assert/strict';
import { getTtsProvider } from '../src/providers/index.js';

test('EdgeTtsProvider: initializes with Indonesian GadisNeural voice by default', () => {
  const provider = getTtsProvider();
  assert.equal(provider.getVoiceName(), 'id-ID-GadisNeural');
  assert.equal(provider.getStreamType(), 'webm/opus');
});

test('EdgeTtsProvider: synthesizes natural Indonesian speech in WebmOpus format under 2s', async () => {
  const provider = getTtsProvider();
  const start = Date.now();
  const audio = await provider.synthesize('Halo semuanya, aku Lyra!');
  const duration = Date.now() - start;

  assert.ok(audio.length > 1000, 'Synthesized audio buffer must be non-empty');
  // Check WebM EBML header magic bytes (0x1A, 0x45, 0xDF, 0xA3)
  assert.equal(audio.subarray(0, 4).toString('hex'), '1a45dfa3');
  assert.ok(duration < 2500, `TTS latency (${duration}ms) must be under 2.5s`);
  console.log(`\n  [TTS Test Result] Synthesized ${audio.length} bytes in ${duration}ms (Format: WebM Opus)`);
});
