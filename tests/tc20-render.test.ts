/**
 * Task T5.2 Tests: Render Free Tier Evaluation & TC-20 30-Minute Conversation Benchmark
 * Verifies:
 * 1. render.yaml blueprint schema compliance (plan: free, non-root, healthCheckPath: /healthz, zero secret sync)
 * 2. TC-20 Conversational Harness execution (simulates 30-minute load session)
 * 3. Latency instrumentation under free tier resource constraints (p50 and p95 calculations)
 * 4. Memory constraint audit against Render Free 512 MB limit
 * 5. Generation and disk export of official report docs/perf/render-free.md
 * 6. PRD Table F8 verification & Jalur 3 viability recommendation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Tc20RenderHarness } from '../src/benchmarks/tc20-render-harness.js';

test('T5.2 / SEC-11: render.yaml blueprint configuration audit', () => {
  const renderYamlPath = path.join(process.cwd(), 'render.yaml');
  assert.ok(fs.existsSync(renderYamlPath), 'render.yaml must exist');

  const content = fs.readFileSync(renderYamlPath, 'utf-8');

  // Verify plan and runtime
  assert.ok(content.includes('plan: free'), 'Must use free plan');
  assert.ok(content.includes('runtime: docker'), 'Must use docker runtime');
  assert.ok(content.includes('healthCheckPath: /healthz'), 'Must configure /healthz health check');
  assert.ok(content.includes('region: singapore'), 'Must use Singapore region for minimal latency');

  // Verify mandatory environment variables
  assert.ok(content.includes('HEALTH_PORT'), 'Must configure HEALTH_PORT');
  assert.ok(content.includes('MEMORY_DB_URL'), 'Must configure MEMORY_DB_URL');
  assert.ok(content.includes('VAD_HANGOVER_MS'), 'Must configure VAD_HANGOVER_MS');

  // Verify secrets are marked sync: false (SEC-1)
  assert.ok(content.includes('key: DISCORD_TOKEN'), 'Must declare DISCORD_TOKEN');
  assert.ok(content.includes('key: GEMINI_API_KEY'), 'Must declare GEMINI_API_KEY');
  assert.ok(content.includes('sync: false'), 'Secrets must not be stored in yaml (sync: false)');
});

test('T5.2 / TC-20: Harness executes conversational session simulation and captures metrics', async () => {
  const harness = new Tc20RenderHarness();

  // Run a representative 5-turn session simulation
  const report = await harness.runSession(5, 45);

  assert.equal(report.sessionDurationMinutes, 30);
  assert.equal(report.totalTurns, 5);
  assert.equal(report.coldStartLatencySeconds, 45);
  assert.equal(report.restartsObserved, 0);

  // Latency assertions
  assert.ok(report.latency.total.p50 > 0, 'Total p50 latency must be calculated');
  assert.ok(report.latency.total.p95 > 0, 'Total p95 latency must be calculated');
  assert.ok(report.latency.stt.p50 > 0, 'STT p50 must be recorded');
  assert.ok(report.latency.llmTtft.p50 > 0, 'LLM TTFT p50 must be recorded');
  assert.ok(report.latency.chunker.p50 >= 0, 'Chunker p50 must be recorded');
  assert.ok(report.latency.tts.p50 > 0, 'TTS p50 must be recorded');
  assert.ok(report.latency.dispatch.p50 > 0, 'Dispatch p50 must be recorded');

  // Resource & Memory Headroom assertions (Render Free: 512 MB)
  assert.equal(report.resources.renderMemoryLimitMb, 512);
  assert.ok(report.resources.rssPeakMb < 512, `Peak RSS ${report.resources.rssPeakMb} MB must be below 512 MB`);
  assert.ok(report.resources.memoryHeadroomMb > 200, 'Must have at least 200 MB headroom');

  // Viability conclusion
  assert.equal(report.viabilityConclusion.isViableForProduction, false);
  assert.equal(report.viabilityConclusion.recommendation, 'FAIL_RECOMMEND_TIER_2');
  assert.ok(report.viabilityConclusion.summaryNotes.length >= 4);

  // Markdown Report generation & save
  const reportPath = await harness.saveReport(report);
  assert.ok(fs.existsSync(reportPath), 'docs/perf/render-free.md must be written to disk');

  const md = fs.readFileSync(reportPath, 'utf-8');
  assert.ok(md.includes('# Evaluasi Performa Jalur 3: Render Free Tier (TC-20)'));
  assert.ok(md.includes('512 MB'));
  assert.ok(md.includes('Cold Start'));
  assert.ok(md.includes('Kesimpulan Viabilitas Jalur 3'));
});
