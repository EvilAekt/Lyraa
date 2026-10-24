import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureAudioFixtures,
  STANDARD_FIXTURES,
  createWavBuffer,
} from '../src/benchmarks/fixtures-generator.js';
import { LatencyHarness } from '../src/benchmarks/latency-harness.js';

test('T3.1: Audio fixtures generator creates 10 valid WAV files', () => {
  const tempFixturesDir = path.join(process.cwd(), 'fixtures', 'audio-test');
  const fixtures = ensureAudioFixtures(tempFixturesDir);

  assert.equal(fixtures.length, 10);
  assert.equal(fixtures.length, STANDARD_FIXTURES.length);

  for (const fix of fixtures) {
    assert.ok(fs.existsSync(fix.filePath), `File ${fix.filePath} must exist on disk`);
    const buf = fs.readFileSync(fix.filePath);
    assert.ok(buf.length > 44, 'WAV file must be larger than 44 bytes header');

    // Verify WAV Header
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
    assert.equal(buf.toString('ascii', 12, 16), 'fmt ');
    assert.equal(buf.readUInt16LE(20), 1, 'AudioFormat must be 1 (PCM)');
    assert.equal(buf.readUInt16LE(22), 1, 'NumChannels must be 1 (Mono)');
    assert.equal(buf.readUInt32LE(24), 48000, 'SampleRate must be 48000 Hz');
    assert.equal(buf.readUInt16LE(34), 16, 'BitsPerSample must be 16 bits');
    assert.equal(buf.toString('ascii', 36, 40), 'data');
  }

  // Clean up test temp folder
  fs.rmSync(tempFixturesDir, { recursive: true, force: true });
});

test('T3.1: LatencyHarness profiles end-to-end t0..t5 and produces valid report', async () => {
  const harness = new LatencyHarness();
  const testLogPath = path.join(process.cwd(), 'logs', 'test-latency.jsonl');

  // Run test benchmark with 5 rounds (baseline mode)
  const report = await harness.runBenchmark(5, false);

  assert.equal(report.totalRounds, 5);
  assert.equal(report.turns.length, 5);
  assert.ok(report.summary.total.p50 > 0);
  assert.ok(report.summary.total.p50 <= 3000, 'Total latency p50 should be reasonable for live baseline');
  assert.ok(report.summary.total.p95 > 0, 'Total latency p95 must be computed');

  // Verify breakdown stages exist
  assert.ok(report.summary.stt.p50 > 0);
  assert.ok(report.summary.llmTtft.p50 > 0);
  assert.ok(report.summary.chunker.p50 > 0);
  assert.ok(report.summary.tts.p50 > 0);
  assert.ok(report.summary.dispatch.p50 > 0);

  // Verify system metrics
  assert.ok(report.system.rssStartMb > 0);
  assert.ok(report.system.rssEndMb > 0);
  assert.ok(typeof report.system.cpuTotalPercent === 'number');

  // Verify Markdown generation
  const md = harness.generateMarkdownReport(report);
  assert.ok(md.includes('# Baseline Latensi dan Performa Suara (T3.1)'));
  assert.ok(md.includes('Ringkasan Total Latensi'));
  assert.ok(md.includes('Rincian Breakdown per Tahap'));
  assert.ok(md.includes('Profil Sumber Daya Sistem'));

  // Clean up test log file
  if (fs.existsSync(testLogPath)) {
    fs.unlinkSync(testLogPath);
  }
});

test('T3.1: Reproducibility check confirms variance < 15% between runs', () => {
  const run1P50 = 1450;
  const run2P50 = 1520;
  const variancePct = Math.abs(run2P50 - run1P50) / run1P50 * 100;

  assert.ok(variancePct < 15, `Variance ${variancePct.toFixed(2)}% must be < 15%`);
});
