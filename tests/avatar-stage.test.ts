/**
 * Task T6.1 Tests: Local Avatar via AIRI Stage, Lip-Sync, and Emotion Mapping (FR-X1)
 * Verifies:
 * 1. Emotion mapping table (mapEmotionToVrm) maps natural persona tags to VRM blendshapes
 * 2. Visual expression change SLA: transition duration < 300 ms
 * 3. Lip-sync mouth opening analyzer SLA: response time < 150 ms from speech onset
 * 4. StageGateway standalone HTTP serving of transparent OBS overlay (/stage)
 * 5. StageGateway WebSocket live handshake & real-time event broadcasting
 * 6. Audit of assets/LICENSES.md ensuring 100% compliant VRM open licensing (PRD §15)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import {
  mapEmotionToVrm,
  EMOTION_TO_VRM_TABLE,
  LipSyncAnalyzer,
  StageGateway,
} from '../src/stage/index.js';

test('T6.1 / FR-X1: mapEmotionToVrm maps natural Indonesian/English tags to VRM expressions', () => {
  // Test joy/happy mappings
  assert.equal(mapEmotionToVrm('happy').vrmExpression, 'happy');
  assert.equal(mapEmotionToVrm('senang').vrmExpression, 'happy');
  assert.equal(mapEmotionToVrm('excited').vrmExpression, 'happy');
  assert.equal(mapEmotionToVrm('laugh').vrmExpression, 'happy');

  // Test sad mappings
  assert.equal(mapEmotionToVrm('sad').vrmExpression, 'sad');
  assert.equal(mapEmotionToVrm('sedih').vrmExpression, 'sad');
  assert.equal(mapEmotionToVrm('cry').vrmExpression, 'sad');

  // Test angry mappings
  assert.equal(mapEmotionToVrm('angry').vrmExpression, 'angry');
  assert.equal(mapEmotionToVrm('marah').vrmExpression, 'angry');
  assert.equal(mapEmotionToVrm('annoyed').vrmExpression, 'angry');

  // Test surprised mappings
  assert.equal(mapEmotionToVrm('surprised').vrmExpression, 'surprised');
  assert.equal(mapEmotionToVrm('kaget').vrmExpression, 'surprised');
  assert.equal(mapEmotionToVrm('bingung').vrmExpression, 'surprised');

  // Test relaxed/thinking mappings
  assert.equal(mapEmotionToVrm('relaxed').vrmExpression, 'relaxed');
  assert.equal(mapEmotionToVrm('santai').vrmExpression, 'relaxed');
  assert.equal(mapEmotionToVrm('thinking').vrmExpression, 'relaxed');

  // Test fallback/neutral
  assert.equal(mapEmotionToVrm('unknown_emotion_xyz').vrmExpression, 'neutral');
  assert.equal(mapEmotionToVrm(undefined).vrmExpression, 'neutral');
});

test('T6.1 / FR-X1 SLA: Expression change transition duration is <= 300 ms', () => {
  const result = mapEmotionToVrm('happy');
  assert.ok(
    result.transitionDurationMs <= 300,
    `Transition duration ${result.transitionDurationMs}ms must be <= 300ms`
  );
  assert.equal(result.transitionDurationMs, 200);
});

test('T6.1 / FR-X1 SLA: Lip-sync analyzer processes audio frame within < 150 ms', () => {
  const analyzer = new LipSyncAnalyzer({ frameDurationMs: 20, sampleRate: 48000 });

  // Generate 1 second of synthetic 16-bit PCM 48kHz audio (96000 bytes)
  const sampleRate = 48000;
  const numSamples = sampleRate * 1;
  const pcmBuf = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    // 440 Hz sine wave tone with speech-level amplitude
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
    pcmBuf.writeInt16LE(sample, i * 2);
  }

  const tStart = performance.now();
  const frames = analyzer.analyzePcm(pcmBuf);
  const processTimeMs = performance.now() - tStart;

  assert.ok(processTimeMs < 150, `Audio lip-sync processing ${processTimeMs.toFixed(2)}ms must be < 150ms`);
  assert.ok(frames.length > 40, '1 second of audio should produce ~50 frames at 20ms interval');

  // Verify non-zero mouth opening for tone audio
  const nonZero = frames.filter((f) => f.value > 0);
  assert.ok(nonZero.length > 0, 'Tone should produce active mouth opening');
  assert.ok(nonZero[0].value > 0.5, 'Volume should produce substantial opening value');
});

test('T6.1: Lip-sync synthetic generator models natural vowel motion for compressed streams', () => {
  const analyzer = new LipSyncAnalyzer({ frameDurationMs: 20 });
  const frames = analyzer.generateSyntheticFrames(2.0, 'Halo semuanya!');

  assert.equal(frames.length, 100, '2.0s duration at 20ms frame = 100 frames');
  assert.equal(frames[0].timestampMs, 0);
  assert.ok(frames[10].value > 0.2, 'Attack phase should open mouth');
});

test('T6.1 / FR-X1: StageGateway serves transparent OBS overlay and broadcasts real-time events', async () => {
  const gateway = new StageGateway({ port: 0 });
  const port = await gateway.startStandalone(0);

  try {
    // 1. Test HTTP GET /stage (OBS Browser Source)
    const res = await fetch(`http://127.0.0.1:${port}/stage`);
    assert.equal(res.status, 200, 'Stage HTML must return 200 OK');
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const html = await res.text();
    assert.ok(html.includes('id="lyra-rig"'), 'Must contain Lyra avatar SVG/WebGL rig');
    assert.ok(html.includes('background: transparent'), 'Must have transparent background for OBS');

    // 2. Test WebSocket connection from OBS overlay
    const client = new WebSocket(`ws://127.0.0.1:${port}/stage/ws`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', reject);
    });

    assert.equal(gateway.getClientCount(), 1, 'Client count should be 1');

    const receivedEvents: any[] = [];
    client.on('message', (data) => {
      receivedEvents.push(JSON.parse(data.toString()));
    });

    // 3. Broadcast speaking_start with initial emotion
    gateway.broadcastSpeakingStart('Halo! Senang bertemu kalian!', 'happy');

    // 4. Broadcast lip-sync frame
    gateway.broadcastLipSync('aa', 0.85);

    // 5. Broadcast emotion change
    gateway.broadcastEmotion('surprised');

    // 6. Broadcast speaking_end
    gateway.broadcastSpeakingEnd();

    // Wait 50ms for WS message delivery
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(receivedEvents.length, 4, 'Should receive 4 broadcast events');
    assert.equal(receivedEvents[0].type, 'speaking_start');
    assert.equal(receivedEvents[0].emotion, 'happy');
    assert.equal(receivedEvents[0].transitionDurationMs, 200);

    assert.equal(receivedEvents[1].type, 'lip_sync');
    assert.equal(receivedEvents[1].viseme, 'aa');
    assert.equal(receivedEvents[1].value, 0.85);

    assert.equal(receivedEvents[2].type, 'emotion_change');
    assert.equal(receivedEvents[2].emotion, 'surprised');

    assert.equal(receivedEvents[3].type, 'speaking_end');

    client.close();
  } finally {
    await gateway.close();
  }
});

test('T6.1 / PRD §15: assets/LICENSES.md exists and validates open VRM licensing', () => {
  const licensePath = path.join(process.cwd(), 'assets', 'LICENSES.md');
  assert.ok(fs.existsSync(licensePath), 'assets/LICENSES.md must exist on disk');

  const content = fs.readFileSync(licensePath, 'utf-8');

  assert.ok(content.includes('VRM'), 'Must specify VRM format');
  assert.ok(content.includes('CC-BY') || content.includes('MIT') || content.includes('VRoid'), 'Must document valid open licenses');
  assert.ok(content.includes('Lyra'), 'Must document Lyra character persona');
  assert.ok(!content.includes('pirated') && !content.includes('unauthorized'), 'Must forbid copyrighted/unauthorized assets');
});
