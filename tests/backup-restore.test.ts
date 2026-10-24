/**
 * Task T4.4: Database Backup & Restore Automated Verification (SEC-14)
 * Tests:
 * 1. Creates consistent SQLite backup from active memory store
 * 2. Creates AES-256-GCM encrypted backup with passphrase
 * 3. Restores unencrypted backup and verifies exact turn & memory state
 * 4. Restores encrypted backup with valid key and verifies state
 * 5. Rejects restore with invalid key or corrupted header
 * 6. Generates pre-restore safety copy before overwriting active database
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryStore } from '../src/memory/memory-store.js';
import { createDatabaseBackup, encryptBuffer } from '../scripts/backup-db.js';
import { restoreDatabaseBackup, decryptBuffer, isValidSqliteHeader } from '../scripts/restore-db.js';

test('SEC-14: Database backup and restore lifecycle with encryption and integrity verification', async () => {
  const testDir = path.resolve(process.cwd(), 'fixtures', 'backup-test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const liveDbPath = path.join(testDir, 'live-memory.sqlite');
  const backupDir = path.join(testDir, 'backups');
  const restoredDbPath = path.join(testDir, 'restored-memory.sqlite');

  // Step 1: Create initial database with conversation turns and user memories
  const store = new MemoryStore({ dbPath: liveDbPath });
  const turnId1 = store.recordTurn({
    sessionId: 'sess-backup-1',
    channelId: 'chan-1',
    userId: 'user-backup-1',
    userName: 'TesterOne',
    userInput: 'Halo Lyra! Aku suka bermain game RPG.',
    botReply: 'Halo! Game RPG memang sangat seru untuk dimainkan!',
    turnLatencyMs: 720,
  });

  const factRes1 = store.addUserMemory({
    userId: 'user-backup-1',
    fact: 'Menyukai genre game RPG dan petualangan',
    category: 'preference',
  });

  assert.ok(turnId1 > 0);
  assert.equal(factRes1.added, true);
  store.close();

  // Step 2: Create unencrypted backup
  const backupRes1 = await createDatabaseBackup({
    sourceDbPath: liveDbPath,
    backupDir,
    retentionDays: 10,
  });

  assert.equal(backupRes1.success, true);
  assert.equal(backupRes1.isEncrypted, false);
  assert.ok(fs.existsSync(backupRes1.backupPath));

  // Step 3: Create encrypted backup with AES-256-GCM key
  const encryptionKey = 'super-secret-backup-passphrase-12345';
  const backupRes2 = await createDatabaseBackup({
    sourceDbPath: liveDbPath,
    backupDir,
    encryptionKey,
  });

  assert.equal(backupRes2.success, true);
  assert.equal(backupRes2.isEncrypted, true);
  assert.ok(fs.existsSync(backupRes2.backupPath));

  // Step 4: Restore unencrypted backup to a new database location
  const restoreRes1 = await restoreDatabaseBackup({
    backupFilePath: backupRes1.backupPath,
    targetDbPath: restoredDbPath,
    createPreRestoreBackup: false,
  });

  assert.equal(restoreRes1.success, true);
  assert.equal(restoreRes1.wasEncrypted, false);

  // Validate restored database contents
  const restoredStore1 = new MemoryStore({ dbPath: restoredDbPath });
  const recoveredTurns1 = restoredStore1.getRecentTurns('chan-1', 5);
  assert.equal(recoveredTurns1.length, 1);
  assert.equal(recoveredTurns1[0].userInput, 'Halo Lyra! Aku suka bermain game RPG.');
  assert.equal(recoveredTurns1[0].botReply, 'Halo! Game RPG memang sangat seru untuk dimainkan!');

  const recoveredMemories1 = restoredStore1.getUserMemories('user-backup-1');
  assert.equal(recoveredMemories1.length, 1);
  assert.equal(recoveredMemories1[0].fact, 'Menyukai genre game RPG dan petualangan');
  restoredStore1.close();

  // Step 5: Restore encrypted backup with correct key
  const restoreRes2 = await restoreDatabaseBackup({
    backupFilePath: backupRes2.backupPath,
    targetDbPath: restoredDbPath,
    decryptionKey: encryptionKey,
    createPreRestoreBackup: true,
  });

  assert.equal(restoreRes2.success, true);
  assert.equal(restoreRes2.wasEncrypted, true);
  assert.ok(restoreRes2.preRestoreBackupPath, 'Pre-restore backup copy must be generated');
  assert.ok(fs.existsSync(restoreRes2.preRestoreBackupPath!));

  // Validate encrypted restore contents
  const restoredStore2 = new MemoryStore({ dbPath: restoredDbPath });
  const recoveredMemories2 = restoredStore2.getUserMemories('user-backup-1');
  assert.equal(recoveredMemories2.length, 1);
  assert.equal(recoveredMemories2[0].fact, 'Menyukai genre game RPG dan petualangan');
  restoredStore2.close();

  // Step 6: Test rejection when wrong decryption key is provided
  await assert.rejects(
    async () => {
      await restoreDatabaseBackup({
        backupFilePath: backupRes2.backupPath,
        targetDbPath: restoredDbPath,
        decryptionKey: 'wrong-invalid-key-password',
      });
    },
    /unsupported state or unable to authenticate data|bad decrypt/i
  );

  // Step 7: Test header verification helper
  const rawSqliteHeader = fs.readFileSync(liveDbPath).subarray(0, 32);
  assert.equal(isValidSqliteHeader(rawSqliteHeader), true);
  assert.equal(isValidSqliteHeader(Buffer.from('not a sqlite database')), false);

  // Clean up test sandbox
  fs.rmSync(testDir, { recursive: true, force: true });
});
