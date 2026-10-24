/**
 * Task T5.3 Tests: GCP e2-micro Evaluation and Cost/Latency Verification
 * Verifies:
 * 1. Factual GCP Always Free cost calculations (IPv4 public fee ~$3.65/mo and 1GB egress limit)
 * 2. Trans-Pacific latency penalty modeling (+195ms RTT between US Central and Discord AP-Southeast)
 * 3. SOP audit for $1.00 budget alert and zero-cost resource cleanup protocol (docs/gcp-deploy-guide.md)
 * 4. Verification of PRD Table F9 and official performance report (docs/perf/gcp-e2-micro.md)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GcpEvaluationModel } from '../src/benchmarks/gcp-latency-simulation.js';

test('T5.3 / F9: GCP Cost Model computes accurate IPv4 fee and 1GB egress limits', () => {
  // Scenario A: 60 hours monthly voice usage (Within 1GB free egress limit)
  const cost60h = GcpEvaluationModel.calculateGcpCosts(60);

  assert.equal(cost60h.ipv4HourlyRateUsd, 0.005);
  assert.equal(cost60h.ipv4MonthlyCostUsd, 3.65);
  assert.equal(cost60h.freeEgressGbMonthly, 1.0);
  assert.ok(cost60h.hourlyAudioDataMb > 13.0 && cost60h.hourlyAudioDataMb < 14.5);
  assert.equal(cost60h.maxFreeAudioHoursMonthly, 74);
  assert.equal(cost60h.egressOverageGb, 0);
  assert.equal(cost60h.egressOverageCostUsd, 0);
  assert.equal(cost60h.totalMonthlyCostUsd, 3.65);

  // Scenario B: 120 hours monthly voice usage (Exceeds 1GB free egress limit)
  const cost120h = GcpEvaluationModel.calculateGcpCosts(120);

  assert.equal(cost120h.ipv4MonthlyCostUsd, 3.65);
  assert.ok(cost120h.monthlyDataGb > 1.5, '120h should exceed 1.5 GB data');
  assert.ok(cost120h.egressOverageGb > 0.5, 'Egress overage should exceed 0.5 GB');
  assert.ok(cost120h.egressOverageCostUsd > 0.05, 'Egress overage cost should apply');
  assert.ok(cost120h.totalMonthlyCostUsd > 3.70, 'Total cost should exceed $3.70');
});

test('T5.3: Trans-Pacific Latency Comparison confirms network penalty for US deployment', () => {
  const comparison = GcpEvaluationModel.compareLatencies();

  // Singapore/Local latency assertions
  assert.ok(comparison.localSingapore.totalP50Ms <= 1700, 'Local p50 must be under 1.7s');
  assert.ok(comparison.localSingapore.totalP95Ms <= 2500, 'Local p95 must be under 2.5s');

  // GCP US deployment assertions
  assert.ok(comparison.gcpUsCentral.transPacificPenaltyMs >= 180, 'Trans-Pacific penalty must be >= 180ms');
  assert.ok(
    comparison.gcpUsCentral.totalP50Ms > comparison.localSingapore.totalP50Ms,
    'GCP US p50 must be higher than Local due to cable transit'
  );
  assert.ok(
    comparison.gcpUsCentral.totalP95Ms > comparison.localSingapore.totalP95Ms,
    'GCP US p95 must be higher than Local'
  );
});

test('T5.3 / SEC-11: docs/gcp-deploy-guide.md specifies budget alert and zero-cost cleanup', () => {
  const guidePath = path.join(process.cwd(), 'docs', 'gcp-deploy-guide.md');
  assert.ok(fs.existsSync(guidePath), 'docs/gcp-deploy-guide.md must exist');

  const content = fs.readFileSync(guidePath, 'utf-8');

  // Verify $1.00 budget alert SOP
  assert.ok(content.includes('$1.00'), 'Must specify $1.00 budget alert');
  assert.ok(content.includes('Billing'), 'Must direct to Billing console');

  // Verify non-root port 8080 rule
  assert.ok(content.includes('8080'), 'Must specify health port 8080');

  // Verify zero-cost cleanup commands
  assert.ok(content.includes('instances delete'), 'Must specify instance deletion command');
  assert.ok(content.includes('firewall-rules delete'), 'Must specify firewall rule deletion');
  assert.ok(content.includes('$0,00') || content.includes('$0.00'), 'Must target $0.00 spend');
});

test('T5.3 / F9: docs/perf/gcp-e2-micro.md validates PRD Table F9 and NO-GO conclusion', () => {
  const perfPath = path.join(process.cwd(), 'docs', 'perf', 'gcp-e2-micro.md');
  assert.ok(fs.existsSync(perfPath), 'docs/perf/gcp-e2-micro.md must exist');

  const content = fs.readFileSync(perfPath, 'utf-8');

  assert.ok(content.includes('F9'), 'Must reference PRD Table F9');
  assert.ok(content.includes('e2-micro'), 'Must evaluate e2-micro');
  assert.ok(content.includes('$3,65') || content.includes('$3.65'), 'Must document IPv4 fee');
  assert.ok(content.includes('1 GB'), 'Must document 1GB egress limit');
  assert.ok(content.includes('Trans-Pasifik') || content.includes('Trans-Pacific'), 'Must document latency penalty');
  assert.ok(content.includes('NO-GO') || content.includes('TIDAK DIREKOMENDASIKAN'), 'Must recommend against production GCP Always Free');
});
