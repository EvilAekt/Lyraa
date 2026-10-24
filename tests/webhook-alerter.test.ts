/**
 * Task T4.4: Admin Webhook Alerter Unit Test (FR-A4, TDD §12)
 * Tests:
 * 1. Safe no-op when webhook is not configured or disabled
 * 2. Alert formatting and color assignment per severity
 * 3. Anomaly tracking: > 3 reconnects per hour triggers alert (TC-08)
 * 4. Anomaly tracking: > 20% provider failure in 5 minutes triggers critical alert
 * 5. Budget threshold alert (80% token quota reached)
 * 6. Automatic credential redaction inside alert title and description (SEC-2)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminWebhookAlerter } from '../src/admin/webhook-alerter.js';

test('WebhookAlerter: initializes as disabled when no URL provided and operates safely as no-op', async () => {
  const alerter = new AdminWebhookAlerter({ webhookUrl: '' });
  assert.equal(alerter.isEnabled(), false);

  const sent = await alerter.sendAlert({
    title: 'Test Alert',
    description: 'This should not dispatch over network',
    severity: 'info',
  });

  assert.equal(sent, false);
  assert.equal(alerter.getHistory().length, 1);
});

test('WebhookAlerter: redacts sensitive credentials in alert payloads', async () => {
  const alerter = new AdminWebhookAlerter({ webhookUrl: '' });

  const fakeDiscord = 'a'.repeat(24) + '.' + 'b'.repeat(6) + '.' + 'c'.repeat(27);
  const fakeGemini = 'AIzaSy' + 'mockGeminiApiKeyForTestingPurposes123';

  await alerter.sendAlert({
    title: `Crash report with token ${fakeDiscord}`,
    description: `Failure contacting Gemini with key ${fakeGemini}`,
    severity: 'critical',
  });

  const history = alerter.getHistory();
  const last = history[history.length - 1];

  assert.ok(!last.title.includes(fakeDiscord), 'Discord token must be redacted from alert title');
  assert.ok(!last.description.includes(fakeGemini), 'Gemini key must be redacted from alert description');
});

test('WebhookAlerter: triggers alert when reconnects exceed 3x per hour (TC-08)', async () => {
  const alerter = new AdminWebhookAlerter({ webhookUrl: '' });

  // 1st, 2nd, and 3rd reconnect: records history but does not trigger alert yet
  assert.equal(await alerter.recordReconnect('g-1', 'Server Alpha'), false);
  assert.equal(await alerter.recordReconnect('g-1', 'Server Alpha'), false);
  assert.equal(await alerter.recordReconnect('g-1', 'Server Alpha'), false);

  // 4th reconnect in same hour triggers alert
  await alerter.recordReconnect('g-1', 'Server Alpha');
  const history = alerter.getHistory();
  const alert = history.find((h) => h.title.includes('Reconnect Lebih dari 3x'));
  assert.ok(alert, 'Alert must be generated when reconnect > 3');
  assert.equal(alert.severity, 'error');
});

test('WebhookAlerter: triggers critical alert when provider errors exceed 20% in 5 min', async () => {
  const alerter = new AdminWebhookAlerter({ webhookUrl: '' });

  // Record 7 successes and 3 failures (30% failure rate)
  for (let i = 0; i < 7; i++) {
    await alerter.recordProviderCall('Gemini-LLM', true);
  }
  for (let i = 0; i < 3; i++) {
    await alerter.recordProviderCall('Gemini-LLM', false, '503 Service Unavailable');
  }

  const history = alerter.getHistory();
  const alert = history.find((h) => h.title.includes('Melebihi 20%'));
  assert.ok(alert, 'Critical alert must be generated for > 20% failure rate');
  assert.equal(alert.severity, 'critical');
});

test('WebhookAlerter: formats budget threshold warning (80% reached)', async () => {
  const alerter = new AdminWebhookAlerter({ webhookUrl: '' });

  await alerter.alertBudgetThreshold(80000, 100000, 80);

  const history = alerter.getHistory();
  const alert = history.find((h) => h.title.includes('80% Reached'));
  assert.ok(alert);
  assert.ok(alert.description.includes('ambang degradasi'));
  assert.ok(alert.fields?.[2].value.includes('70 token'));
});
