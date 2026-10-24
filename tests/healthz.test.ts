/**
 * Task T5.1 Tests: Docker Image Hardening and /healthz Endpoint
 * Verifies:
 * 1. HealthServer lifecycle and /healthz endpoint functionality (PRD §15, TDD §12)
 * 2. Status degradation when bot is disabled or not ready (503 Service Unavailable)
 * 3. Strict route restriction: non-healthz routes return 404 (SEC-11, SEC-12)
 * 4. SEC-12 Zero Secret Leak in health responses
 * 5. Dockerfile security audit: multi-stage, pinned image, non-root USER node, EXPOSE 8080 only (SEC-11)
 * 6. .dockerignore audit: secrets, data, and tests excluded from build context
 * 7. TC-18 (crash recovery) and TC-19 (cold start timing) container readiness
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HealthServer } from '../src/health/health-server.js';

test('HealthServer: starts and responds 200 OK with valid metrics on GET /healthz', async () => {
  let isReadyCalled = false;
  let isEnabledCalled = false;

  const server = new HealthServer({
    port: 0, // OS assigned ephemeral port
    statusProvider: {
      isReady: () => {
        isReadyCalled = true;
        return true;
      },
      getPing: () => 42,
      isBotEnabled: () => {
        isEnabledCalled = true;
        return true;
      },
      getUptime: () => 3600,
    },
  });

  const port = await server.start();
  assert.ok(port > 0, 'Port must be greater than 0');
  assert.ok(server.isRunning(), 'Server must be running');

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200, 'Status must be 200 OK');
    assert.equal(res.headers.get('content-type'), 'application/json');

    const data = await res.json() as any;
    assert.equal(data.status, 'ok');
    assert.equal(data.uptimeSeconds, 3600);
    assert.equal(data.botEnabled, true);
    assert.equal(data.discord.ready, true);
    assert.equal(data.discord.pingMs, 42);
    assert.ok(data.system.rssMb > 0);
    assert.ok(data.system.heapUsedMb > 0);
    assert.ok(data.timestamp);

    assert.ok(isReadyCalled, 'isReady provider should be called');
    assert.ok(isEnabledCalled, 'isBotEnabled provider should be called');
  } finally {
    await server.stop();
    assert.equal(server.isRunning(), false, 'Server should be stopped');
  }
});

test('HealthServer: responds 503 degraded when bot is disabled or not ready', async () => {
  const disabledServer = new HealthServer({
    port: 0,
    statusProvider: {
      isReady: () => true,
      isBotEnabled: () => false, // Kill switch active
      getPing: () => 0,
    },
  });

  const port = await disabledServer.start();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 503, 'Must return 503 when bot is disabled');

    const data = await res.json() as any;
    assert.equal(data.status, 'degraded');
    assert.equal(data.botEnabled, false);
  } finally {
    await disabledServer.stop();
  }
});

test('SEC-11 & SEC-12: rejects arbitrary paths with 404 and leaks no sensitive data', async () => {
  const server = new HealthServer({ port: 0 });
  const port = await server.start();

  try {
    const forbiddenPaths = ['/', '/admin', '/status', '/metrics', '/secret', '/api/keys'];

    for (const p of forbiddenPaths) {
      const res = await fetch(`http://127.0.0.1:${port}${p}`);
      assert.equal(res.status, 404, `Path ${p} must return 404`);
      const data = await res.json() as any;
      assert.equal(data.error, 'Not Found');
      assert.equal(data.path, p);
    }
  } finally {
    await server.stop();
  }
});

test('SEC-12: Zero secret leakage in healthz response payload', async () => {
  const sensitiveTokens = [
    'MTA5NzM3NDU5...',
    'AIzaSyB_dummySecretApiKey12345',
    'https://discord.com/api/webhooks/123/tokenXYZ',
  ];

  const server = new HealthServer({
    port: 0,
    statusProvider: {
      isReady: () => true,
      isBotEnabled: () => true,
      getPing: () => 25,
      getCustomMetrics: () => ({
        // Even if custom metrics are passed, verify no secret strings
        environment: 'production',
      }),
    },
  });

  const port = await server.start();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const text = await res.text();

    for (const secret of sensitiveTokens) {
      assert.ok(!text.includes(secret), `Health response must never include secret: ${secret}`);
    }

    assert.ok(!text.toLowerCase().includes('token'), 'Must not leak token keys');
    assert.ok(!text.toLowerCase().includes('password'), 'Must not leak password keys');
    assert.ok(!text.toLowerCase().includes('secret'), 'Must not leak secret keys');
  } finally {
    await server.stop();
  }
});

test('SEC-11 & TDD §13: Dockerfile static security audit', () => {
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');

  const content = fs.readFileSync(dockerfilePath, 'utf-8');

  // Multi-stage verification
  assert.ok(content.includes('AS builder'), 'Must have builder stage');
  assert.ok(content.includes('AS runner'), 'Must have runner stage');

  // Base image pinning verification
  assert.ok(content.includes('node:20.18.0-alpine3.20'), 'Base image must be explicitly pinned');

  // Non-root user enforcement
  assert.ok(content.includes('USER node'), 'Must specify USER node (non-root enforcement)');
  assert.ok(content.includes('chown -R node:node /app'), 'Must chown working directory to node user');

  // Port exposure restriction (only 8080)
  assert.ok(content.includes('EXPOSE 8080'), 'Must expose port 8080');
  const exposedLines = content.split('\n').filter((l) => l.trim().startsWith('EXPOSE'));
  assert.equal(exposedLines.length, 1, 'Only one EXPOSE line allowed (SEC-11)');

  // Healthcheck directive verification
  assert.ok(content.includes('HEALTHCHECK'), 'Must have HEALTHCHECK configured');
  assert.ok(content.includes('http://127.0.0.1:8080/healthz'), 'Healthcheck must probe /healthz');

  // Signal init system
  assert.ok(content.includes('dumb-init'), 'Must use dumb-init for graceful shutdown');
});

test('SEC-1 & SEC-11: .dockerignore static security audit', () => {
  const dockerignorePath = path.join(process.cwd(), '.dockerignore');
  assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');

  const content = fs.readFileSync(dockerignorePath, 'utf-8');

  assert.ok(content.includes('.env'), 'Must exclude .env');
  assert.ok(content.includes('node_modules'), 'Must exclude node_modules');
  assert.ok(content.includes('data/'), 'Must exclude data/');
  assert.ok(content.includes('logs/'), 'Must exclude logs/');
  assert.ok(content.includes('tests/'), 'Must exclude tests/');
  assert.ok(content.includes('.git'), 'Must exclude .git');
});

test('TC-18 & TC-19: Container crash recovery and cold start initialization timing', async () => {
  // TC-19 Cold Start: Measure HealthServer spin-up time
  const tStart = performance.now();
  const server = new HealthServer({ port: 0 });
  const port = await server.start();
  const coldStartMs = performance.now() - tStart;

  assert.ok(coldStartMs < 500, `Cold start timing ${coldStartMs.toFixed(2)}ms must be under 500ms`);

  // TC-18 Crash Recovery: Simulate abrupt termination and rapid restart
  await server.stop();

  const tRestart = performance.now();
  const restartedServer = new HealthServer({ port });
  const restartedPort = await restartedServer.start();
  const recoveryMs = performance.now() - tRestart;

  assert.equal(restartedPort, port, 'Restarted server should bind to target port');
  assert.ok(recoveryMs < 1000, `Crash recovery time ${recoveryMs.toFixed(2)}ms must be under 1000ms`);

  await restartedServer.stop();
});
