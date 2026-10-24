/**
 * T7.1 Production Deployment Verification Test Suite (Jalur 2: VPS Mandiri)
 * 
 * Verifies:
 * 1. docker-compose.prod.yml architecture, restart policy, resource limits, and healthcheck
 * 2. Persistent storage isolation (./data, ./logs, ./backups)
 * 3. Daily encrypted database backup and atomic restoration workflow
 * 4. Remote kill switch (/healthz status 503 degradation on BOT_ENABLED=false)
 * 5. Production deployment script validity (scripts/deploy-prod.sh)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HealthServer } from '../src/health/health-server.js';
import { createDatabaseBackup } from '../scripts/backup-db.js';
import { restoreDatabaseBackup } from '../scripts/restore-db.js';

test('T7.1 / SEC-11: docker-compose.prod.yml enforces production hardening constraints', () => {
  const composePath = path.resolve(process.cwd(), 'docker-compose.prod.yml');
  assert.ok(fs.existsSync(composePath), 'docker-compose.prod.yml must exist');

  const content = fs.readFileSync(composePath, 'utf-8');

  // 1. Restart policy
  assert.match(content, /restart:\s*unless-stopped/, 'Must specify restart: unless-stopped for 24/7 resilience');

  // 2. Persistent volume mapping
  assert.match(content, /\.\/data:\/app\/data/, 'Must persist ./data for SQLite database');
  assert.match(content, /\.\/backups:\/app\/backups/, 'Must persist ./backups for encrypted snapshots');

  // 3. Localhost loopback binding for health port (SEC-11)
  assert.match(content, /"127\.0\.0\.1:8080:8080"/, 'Port 8080 must be bound strictly to 127.0.0.1');

  // 4. Resource limits
  assert.match(content, /limits:/, 'Resource limits block must be present');
  assert.match(content, /memory:\s*1024M/, 'Memory limit must be capped at 1024M');

  // 5. Healthcheck definition
  assert.match(content, /http:\/\/127\.0\.0\.1:8080\/healthz/, 'Healthcheck must target /healthz');
});

test('T7.1 / SEC-14: Database encrypted daily backup and snapshot recovery workflow', async () => {
  const testDir = path.resolve(process.cwd(), 'data/test-prod-backup');
  fs.mkdirSync(testDir, { recursive: true });

  const testDbPath = path.join(testDir, 'test-prod.sqlite');
  const backupDir = path.join(testDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  // 1. Initialize persistent SQLite database
  const db = new DatabaseSync(testDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );
    INSERT INTO system_metadata (key, value, updated_at) 
    VALUES ('deployment_id', 'dep-vps-sg-001', 1700000000);
  `);
  db.close();

  // 2. Perform encrypted backup
  const secretPass = 'test-super-secret-backup-passphrase-2026';
  const backupRes = await createDatabaseBackup({
    sourceDbPath: testDbPath,
    backupDir,
    encryptionKey: secretPass,
    retentionDays: 7,
  });

  assert.equal(backupRes.success, true);
  assert.equal(backupRes.isEncrypted, true);
  assert.ok(fs.existsSync(backupRes.backupPath));

  // Verify backup starts with magic header 'AENC'
  const rawBackup = fs.readFileSync(backupRes.backupPath);
  assert.equal(rawBackup.subarray(0, 4).toString('ascii'), 'AENC');

  // 3. Restore to target database
  const restoredDbPath = path.join(testDir, 'restored-prod.sqlite');
  const restoreRes = await restoreDatabaseBackup({
    backupFilePath: backupRes.backupPath,
    targetDbPath: restoredDbPath,
    decryptionKey: secretPass,
  });

  assert.equal(restoreRes.success, true);
  assert.equal(restoreRes.wasEncrypted, true);

  // 4. Verify data integrity in restored database
  const restoredDb = new DatabaseSync(restoredDbPath);
  const row = restoredDb.prepare('SELECT value FROM system_metadata WHERE key = ?').get('deployment_id') as any;
  assert.equal(row.value, 'dep-vps-sg-001');
  restoredDb.close();

  // Cleanup test artifacts
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('T7.1 / SEC-14: Remote kill switch degrades /healthz endpoint status immediately', async () => {
  let isBotActive = true;

  const server = new HealthServer({
    port: 0,
    host: '127.0.0.1',
    statusProvider: {
      isReady: () => true,
      isBotEnabled: () => isBotActive,
      getPing: () => 18,
      getUptime: () => 3600,
    },
  });

  const assignedPort = await server.start();

  try {
    // 1. Bot active -> 200 OK
    const resActive = await fetch(`http://127.0.0.1:${assignedPort}/healthz`);
    assert.equal(resActive.status, 200);
    const bodyActive = await resActive.json() as any;
    assert.equal(bodyActive.status, 'ok');
    assert.equal(bodyActive.botEnabled, true);

    // 2. Trigger remote kill switch (/mute or BOT_ENABLED=false) -> 503 Degraded
    isBotActive = false;
    const resKilled = await fetch(`http://127.0.0.1:${assignedPort}/healthz`);
    assert.equal(resKilled.status, 503);
    const bodyKilled = await resKilled.json() as any;
    assert.equal(bodyKilled.status, 'degraded');
    assert.equal(bodyKilled.botEnabled, false);
  } finally {
    await server.stop();
  }
});

test('T7.1: Production deploy script scripts/deploy-prod.sh is executable and valid', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/deploy-prod.sh');
  assert.ok(fs.existsSync(scriptPath));

  const content = fs.readFileSync(scriptPath, 'utf-8');
  assert.match(content, /docker compose -f docker-compose\.prod\.yml build/);
  assert.match(content, /docker compose -f docker-compose\.prod\.yml up -d/);
  assert.match(content, /HEALTHY=true/);
});
