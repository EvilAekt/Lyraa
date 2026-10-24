/**
 * Automated Database Restore Script (SEC-14, Task T4.4)
 * Implements PRD §4 (SEC-14), TDD §10, and Task T4.4:
 * - Restores SQLite database from backup archive
 * - Supports automatic decryption for AES-256-GCM encrypted backups
 * - Verifies SQLite header magic bytes ('SQLite format 3') before applying
 * - Creates pre-restore safety copy of existing database before replacement
 * - Can be executed via CLI (`npx tsx scripts/restore-db.ts <path>`) or imported programmatically
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface RestoreOptions {
  backupFilePath?: string;
  targetDbPath?: string;
  decryptionKey?: string;
  createPreRestoreBackup?: boolean;
}

export interface RestoreResult {
  success: boolean;
  targetDbPath: string;
  bytesRestored: number;
  preRestoreBackupPath?: string;
  wasEncrypted: boolean;
  timestamp: string;
}

/**
 * Decrypts a buffer encrypted with encryptBuffer (AES-256-GCM).
 */
export function decryptBuffer(encryptedBuffer: Buffer, secretKey: string): Buffer {
  if (encryptedBuffer.length < 48) {
    throw new Error('Invalid encrypted backup payload: file too short.');
  }

  const magic = encryptedBuffer.subarray(0, 4).toString('ascii');
  if (magic !== 'AENC') {
    throw new Error('Invalid encryption format: missing AENC magic header.');
  }

  const salt = encryptedBuffer.subarray(4, 20);
  const iv = encryptedBuffer.subarray(20, 32);
  const tag = encryptedBuffer.subarray(32, 48);
  const ciphertext = encryptedBuffer.subarray(48);

  const key = crypto.scryptSync(secretKey, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Validates that a buffer starts with standard SQLite 3 database header.
 */
export function isValidSqliteHeader(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  const header = buffer.subarray(0, 15).toString('ascii');
  return header === 'SQLite format 3';
}

/**
 * Restores a database backup to the target database path.
 */
export async function restoreDatabaseBackup(options: RestoreOptions = {}): Promise<RestoreResult> {
  const backupPath = options.backupFilePath || process.argv[2];
  if (!backupPath) {
    throw new Error('Backup file path must be specified.');
  }

  const resolvedBackup = path.resolve(process.cwd(), backupPath);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file does not exist at: ${resolvedBackup}`);
  }

  const targetPath = options.targetDbPath || process.env.MEMORY_DB_URL || 'data/memory.sqlite';
  const resolvedTarget = path.resolve(process.cwd(), targetPath.replace(/^file:/, ''));
  const decryptionKey = options.decryptionKey || process.env.BACKUP_ENCRYPTION_KEY || '';
  const makePreRestore = options.createPreRestoreBackup ?? true;

  const rawBackupData = fs.readFileSync(resolvedBackup);
  let finalDatabaseBytes: Buffer;
  let wasEncrypted = false;

  // Check if encrypted
  if (rawBackupData.length >= 4 && rawBackupData.subarray(0, 4).toString('ascii') === 'AENC') {
    wasEncrypted = true;
    if (!decryptionKey) {
      throw new Error('Backup file is encrypted, but no decryption key was provided.');
    }
    finalDatabaseBytes = decryptBuffer(rawBackupData, decryptionKey);
  } else {
    finalDatabaseBytes = rawBackupData;
  }

  // Validate SQLite header
  if (!isValidSqliteHeader(finalDatabaseBytes)) {
    throw new Error('Restored data is corrupted or does not match a valid SQLite database header.');
  }

  // Create pre-restore safety copy if existing database exists
  let preRestorePath: string | undefined;
  if (makePreRestore && fs.existsSync(resolvedTarget)) {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    preRestorePath = `${resolvedTarget}.pre-restore-${timestampStr}`;
    fs.copyFileSync(resolvedTarget, preRestorePath);
    console.log(`[RestoreDb] Created pre-restore safety copy at: ${preRestorePath}`);
  }

  // Ensure target parent directory exists
  const targetDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Write restored database
  fs.writeFileSync(resolvedTarget, finalDatabaseBytes);
  console.log(`[RestoreDb] ✅ Restored database to: ${resolvedTarget} (${finalDatabaseBytes.length} bytes)`);

  return {
    success: true,
    targetDbPath: resolvedTarget,
    bytesRestored: finalDatabaseBytes.length,
    preRestoreBackupPath: preRestorePath,
    wasEncrypted,
    timestamp: new Date().toISOString(),
  };
}

// CLI Execution entrypoint
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: npx tsx scripts/restore-db.ts <backup-file> [--target <target-db>]');
    process.exit(1);
  }

  restoreDatabaseBackup({ backupFilePath: fileArg })
    .then((res) => {
      console.log(`Restore completed successfully to ${res.targetDbPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Restore failed: ${err.message}`);
      process.exit(1);
    });
}
