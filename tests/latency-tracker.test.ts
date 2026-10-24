import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculatePercentiles,
  LatencyTracker,
  TurnTimestamps,
} from '../src/audio/latency-tracker.js';

test('calculatePercentiles: handles empty and known datasets', () => {
  const empty = calculatePercentiles([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.p50, 0);

  const sample = [100, 200, 300, 400, 500];
  const stats = calculatePercentiles(sample);
  assert.equal(stats.count, 5);
  assert.equal(stats.p50, 300);
  assert.equal(stats.min, 100);
  assert.equal(stats.max, 500);
  assert.equal(stats.avg, 300);
});

test('LatencyTracker: records t0..t5 timestamps and calculates segment latencies', () => {
  const tempLog = path.join(process.cwd(), 'logs', 'test-latency.jsonl');
  if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);

  const tracker = new LatencyTracker(tempLog);
  const now = 100000;

  const timestamps: TurnTimestamps = {
    turnId: 'turn-test-1',
    userId: 'user-1',
    guildId: 'guild-1',
    t0: now,
    t1: now + 400,  // STT: 400ms
    t2: now + 900,  // LLM TTFT: 500ms
    t3: now + 1050, // Chunker: 150ms
    t4: now + 1750, // TTS: 700ms
    t5: now + 1850, // Dispatch: 100ms (Total: 1850ms)
    inputText: 'Halo Lyra',
    outputText: 'Halo! Senang mengobrol denganmu.',
  };

  const metrics = tracker.recordTurn(timestamps);

  assert.equal(metrics.turnId, 'turn-test-1');
  assert.equal(metrics.sttMs, 400);
  assert.equal(metrics.llmTtftMs, 500);
  assert.equal(metrics.chunkerMs, 150);
  assert.equal(metrics.ttsMs, 700);
  assert.equal(metrics.dispatchMs, 100);
  assert.equal(metrics.totalMs, 1850);

  // Check file writing
  assert.ok(fs.existsSync(tempLog));
  const fileLines = fs.readFileSync(tempLog, 'utf-8').trim().split('\n');
  assert.equal(fileLines.length, 1);
  const parsed = JSON.parse(fileLines[0]);
  assert.equal(parsed.turnId, 'turn-test-1');
  assert.equal(parsed.totalMs, 1850);

  // Check Summary
  const summary = tracker.getSummary();
  assert.equal(summary.totalTurns, 1);
  assert.equal(summary.total.p50, 1850);
  assert.equal(summary.stt.p50, 400);
  assert.equal(summary.llmTtft.p50, 500);

  if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);
});

test('LatencyTracker: computes accurate p50 and p95 across 20 turns', () => {
  const tempLog = path.join(process.cwd(), 'logs', 'test-20-turns.jsonl');
  if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);

  const tracker = new LatencyTracker(tempLog);
  const base = Date.now();

  // Insert 20 turns with latencies ranging from 1200ms to 2400ms
  for (let i = 1; i <= 20; i++) {
    const total = 1200 + i * 50; // 1250, 1300, ..., 2200ms
    const t0 = base + i * 10000;
    tracker.recordTurn({
      turnId: `turn-${i}`,
      userId: `user-${i % 3}`,
      guildId: 'guild-test',
      t0,
      t1: t0 + 400,
      t2: t0 + 900,
      t3: t0 + 1050,
      t4: t0 + (total - 50),
      t5: t0 + total,
    });
  }

  const summary = tracker.getSummary();
  assert.equal(summary.totalTurns, 20);
  assert.ok(summary.total.p50 >= 1650 && summary.total.p50 <= 1800);
  assert.ok(summary.total.p95 >= 2100);
  assert.ok(summary.total.avg > 0);

  if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);
});
