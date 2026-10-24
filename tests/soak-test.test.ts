import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SoakMonitor } from '../src/benchmarks/soak-monitor.js';
import { SoakRunner } from '../src/benchmarks/soak-runner.js';
import { getPersonaManager } from '../src/persona/persona-manager.js';

test('T3.7: SoakMonitor captures valid point-in-time memory, CPU, and event-loop lag metrics', async () => {
  const monitor = new SoakMonitor();
  const snapshot = await monitor.takeSnapshot(1);

  assert.ok(snapshot.rssMb > 20, `RSS memory should be > 20 MB, got: ${snapshot.rssMb} MB`);
  assert.ok(snapshot.heapUsedMb > 5, `Heap used should be > 5 MB, got: ${snapshot.heapUsedMb} MB`);
  assert.ok(snapshot.heapTotalMb >= snapshot.heapUsedMb, 'Heap total must be >= Heap used');
  assert.ok(snapshot.eventLoopLagMs >= 0 && snapshot.eventLoopLagMs < 50, `Event loop lag must be healthy (< 50ms), got: ${snapshot.eventLoopLagMs} ms`);
  assert.equal(snapshot.minute, 1);
});

test('T3.7: SoakMonitor accurately computes TC-17 hourly growth rate and compliance', () => {
  const monitor = new SoakMonitor();

  // Simulate 4-hour (240 minutes) stable run
  // Minute 0: 80 MB
  // Minute 60: 82 MB (+2.5%)
  // Minute 120: 83 MB (+3.75%)
  // Minute 240: 85 MB (+6.25% total over 4 hours = +1.56% per hour)
  const syntheticMinutes = [
    { minute: 0, rssMb: 80.0, heapMb: 40.0, lag: 12 },
    { minute: 60, rssMb: 82.0, heapMb: 42.0, lag: 11 },
    { minute: 120, rssMb: 83.0, heapMb: 41.5, lag: 10 },
    { minute: 180, rssMb: 84.0, heapMb: 42.5, lag: 12 },
    { minute: 240, rssMb: 85.0, heapMb: 43.0, lag: 11 },
  ];

  for (const s of syntheticMinutes) {
    // Manually push snapshot
    monitor.getSnapshots().push({
      timestamp: new Date(),
      minute: s.minute,
      rssMb: s.rssMb,
      heapUsedMb: s.heapMb,
      heapTotalMb: s.heapMb + 20,
      externalMb: 5.0,
      cpuPercent: 2.5,
      eventLoopLagMs: s.lag,
      turnsCompleted: Math.floor(s.minute / 2),
      turnErrors: 0,
    });
  }

  const summary = monitor.generateSummary(240);

  assert.equal(summary.durationMinutes, 240);
  assert.equal(summary.initialRssMb, 80.0);
  assert.equal(summary.finalRssMb, 85.0);
  assert.equal(summary.peakRssMb, 85.0);
  assert.ok(summary.hourlyGrowthPercent < 5.0, `Hourly growth should be ~1.56%/hr, got: ${summary.hourlyGrowthPercent}%/hr`);
  assert.equal(summary.isTc17Compliant, true, 'Stable growth must be TC-17 compliant (< 10%/hr)');
});

test('T3.7: SoakMonitor flags non-compliance if process crashes or memory growth exceeds 10%/hr', () => {
  const monitor = new SoakMonitor();

  // Simulate severe leak: 50MB -> 150MB in 2 hours = 100% growth / 2hr = 50%/hour
  monitor.getSnapshots().push({
    timestamp: new Date(),
    minute: 0,
    rssMb: 50.0,
    heapUsedMb: 20.0,
    heapTotalMb: 30.0,
    externalMb: 5.0,
    cpuPercent: 2.0,
    eventLoopLagMs: 10,
    turnsCompleted: 0,
    turnErrors: 0,
  });

  monitor.getSnapshots().push({
    timestamp: new Date(),
    minute: 120,
    rssMb: 150.0,
    heapUsedMb: 90.0,
    heapTotalMb: 110.0,
    externalMb: 15.0,
    cpuPercent: 5.0,
    eventLoopLagMs: 25,
    turnsCompleted: 60,
    turnErrors: 0,
  });

  const summary = monitor.generateSummary(120);
  assert.ok(summary.hourlyGrowthPercent > 10.0, 'Hourly growth must reflect high growth');
  assert.equal(summary.isTc17Compliant, false, 'Growth > 10%/hr must fail TC-17');

  // Test crash condition
  monitor.recordCrash();
  const crashedSummary = monitor.generateSummary(120);
  assert.equal(crashedSummary.hasCrashed, true);
  assert.equal(crashedSummary.isTc17Compliant, false, 'Crashed run must fail TC-17');
});

test('T3.7: SoakRunner executes endurance pipeline cycles and generates docs/perf/soak-4h.md (TC-17)', async () => {
  const persona = getPersonaManager();
  await persona.load();

  const runner = new SoakRunner();
  // Run 10 rapid synthetic speech cycles to evaluate memory curve and GC
  const summary = await runner.runAcceleratedSoak(10);

  assert.ok(summary.totalTurns >= 10, `Total turns should be >= 10, got: ${summary.totalTurns}`);
  assert.equal(summary.failedTurns, 0, 'No turns should fail during endurance test');
  assert.equal(summary.hasCrashed, false, 'Process must not crash');
  assert.ok(summary.hourlyGrowthPercent < 10.0, `Hourly growth must be < 10%, got: ${summary.hourlyGrowthPercent}%`);
  assert.equal(summary.isTc17Compliant, true, 'Run must satisfy TC-17 criteria');

  // Save reports
  const mdPath = await runner.saveReport(summary);
  const jsonPath = path.resolve(process.cwd(), 'docs/perf/soak-4h.json');

  const [mdStat, jsonStat] = await Promise.all([
    fs.stat(mdPath),
    fs.stat(jsonPath),
  ]);

  assert.ok(mdStat.size > 0, 'docs/perf/soak-4h.md must exist and be non-empty');
  assert.ok(jsonStat.size > 0, 'docs/perf/soak-4h.json must exist and be non-empty');

  const mdContent = await fs.readFile(mdPath, 'utf-8');
  assert.ok(mdContent.includes('TC-17'), 'Report must mention TC-17');
  assert.ok(mdContent.includes('LULUS'), 'Report must reflect passing status');
});
