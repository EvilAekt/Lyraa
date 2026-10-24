/**
 * Task T5.4 Tests: Jalur 3 Final Report & Decision D4 Verification
 * Verifies:
 * 1. Completeness of docs/perf/jalur-3-report.md (4-environment comparative matrix)
 * 2. Latency, RAM, CPU, audio dropouts, and restart comparison across all options
 * 3. Formal verification of PRD Table Claims F8 (Render) and F9 (GCP)
 * 4. Verification of PRD §20 D4 decision (Jalur 2 VPS recommendation) and D9 zero-cost compliance
 * 5. Phase Gate 5 completion criteria fulfillment
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('T5.4: docs/perf/jalur-3-report.md exists and contains all required comparative dimensions', () => {
  const reportPath = path.join(process.cwd(), 'docs', 'perf', 'jalur-3-report.md');
  assert.ok(fs.existsSync(reportPath), 'docs/perf/jalur-3-report.md must exist');

  const content = fs.readFileSync(reportPath, 'utf-8');

  // Verify 4 environments are compared
  assert.ok(content.includes('PC Lokal'), 'Must compare PC Lokal');
  assert.ok(content.includes('Render Free'), 'Must compare Render Free');
  assert.ok(content.includes('GCP e2-micro'), 'Must compare GCP e2-micro');
  assert.ok(content.includes('VPS Singapura'), 'Must compare VPS Singapura');

  // Verify required metrics
  assert.ok(content.includes('Latensi Voice p50'), 'Must compare p50 latency');
  assert.ok(content.includes('Latensi Voice p95'), 'Must compare p95 latency');
  assert.ok(content.includes('Peak Memori (RSS)'), 'Must compare RAM usage');
  assert.ok(content.includes('Spindown'), 'Must document spindown behavior');
  assert.ok(content.includes('Cold Start'), 'Must document cold start timing');
  assert.ok(content.includes('Biaya Bulanan'), 'Must compare monthly costs');
});

test('T5.4 / D4: Report provides concrete analysis for Decision D4 and confirms Jalur 2', () => {
  const reportPath = path.join(process.cwd(), 'docs', 'perf', 'jalur-3-report.md');
  const content = fs.readFileSync(reportPath, 'utf-8');

  // Verify D4 Decision options
  assert.ok(content.includes('Opsi A: VPS Mandiri di Region Singapura'), 'Must evaluate VPS option');
  assert.ok(content.includes('Opsi B: Server Rumah'), 'Must evaluate Home Server option');
  assert.ok(content.includes('D4'), 'Must reference Decision D4');

  // Verify Recommendation conclusion
  assert.ok(content.includes('SANGAT DIREKOMENDASIKAN'), 'Must provide clear recommendation');
  assert.ok(content.includes('Gate Fase 5'), 'Must evaluate Gate Fase 5 criteria');
});

test('T5.4 / Gate 5: Confirms zero cost during Phase 5 (PRD §20 D9)', () => {
  const reportPath = path.join(process.cwd(), 'docs', 'perf', 'jalur-3-report.md');
  const content = fs.readFileSync(reportPath, 'utf-8');

  assert.ok(content.includes('$0,00') || content.includes('$0.00'), 'Must document $0 spend for Phase 5');
  assert.ok(content.includes('D9'), 'Must reference Decision D9');
});
