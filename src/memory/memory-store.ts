/**
 * SQLite Memory Store Adapter
 * Implements PRD §9, FR-P2, FR-P3, FR-P4, SEC-10, and TC-15:
 * - SQLite storage engine using Node.js built-in node:sqlite (DatabaseSync)
 * - Short-term turn history (conversation_turns) with 7-day retention purge
 * - Long-term persistent user facts (user_memories) with 200-fact limit per user
 * - Deterministic sensitive fact filter (rejects passwords, financial, NIK/KTP, medical, address)
 * - User deletion (/forget me) and complete system purge (/forget all)
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface ConversationTurn {
  id: number;
  sessionId: string;
  channelId: string;
  userId: string;
  userName?: string;
  userInput: string;
  botReply: string;
  turnLatencyMs?: number;
  createdAt: string;
}

export interface UserMemory {
  id: number;
  userId: string;
  fact: string;
  category: string;
  source?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddMemoryResult {
  added: boolean;
  reason?: 'sensitive_content_rejected' | 'duplicate' | 'empty' | 'user_quota_exceeded';
  memoryId?: number;
}

export interface DeleteUserMemoriesResult {
  deletedFacts: number;
  deletedTurns: number;
}

export interface MemoryStoreOptions {
  dbPath?: string;
  maxFactsPerUser?: number;
}

export class MemoryStore {
  private db: DatabaseSync;
  private dbPath: string;
  private maxFactsPerUser: number;

  constructor(options: MemoryStoreOptions = {}) {
    let rawPath = options.dbPath || process.env.MEMORY_DB_URL || 'data/memory.sqlite';
    if (rawPath.startsWith('file:')) {
      rawPath = rawPath.replace(/^file:/, '');
    }

    this.dbPath = rawPath;
    this.maxFactsPerUser = options.maxFactsPerUser || 200;

    if (this.dbPath !== ':memory:') {
      const fullPath = path.resolve(process.cwd(), this.dbPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      this.db = new DatabaseSync(fullPath);
    } else {
      this.db = new DatabaseSync(':memory:');
    }

    this.initSchema();
  }

  private initSchema(): void {
    // Pragmas for performance and data safety
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Table 1: Short-term conversation turn records
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT,
        user_input TEXT NOT NULL,
        bot_reply TEXT NOT NULL,
        turn_latency_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_turns_channel ON conversation_turns(channel_id, id);
      CREATE INDEX IF NOT EXISTS idx_turns_user ON conversation_turns(user_id);
      CREATE INDEX IF NOT EXISTS idx_turns_created ON conversation_turns(created_at);
    `);

    // Table 2: Long-term user memories and facts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        source TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);
    `);
  }

  /**
   * Deterministic sensitive data detector (PRD §9, SEC-10, TC-15).
   * Rejects passwords, tokens, API keys, financial data, NIK/KTP, sensitive medical records, home addresses.
   */
  public isSensitiveFact(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const lower = text.toLowerCase();

    // 1. Credentials, Passwords, Tokens, API Keys, Secrets
    const credentialPatterns = [
      /\b(password|kata\s*sandi|pin\s*atm|pin\s*rekening|token\s*bot|api\s*key|secret\s*key|private\s*key|credential)\b/i,
      /\b[a-zA-Z0-9_-]{24,64}\b/, // Looks like raw API token or hash
    ];
    if (credentialPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    // 2. Financial & Banking Data (Account numbers, Credit card numbers, CVV, Salary)
    const financialPatterns = [
      /\b(nomor\s*rekening|no\s*rek|kartu\s*kredit|kartu\s*debit|cvv|cvc|nomor\s*kartu|saldo\s*bank|gaji\s*bulanan)\b/i,
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card 16-digit format
      /\b(bca|mandiri|bni|bri)\s*[:=]?\s*\d{8,14}\b/i, // Indonesian bank account patterns
    ];
    if (financialPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    // 3. Government ID / PII (NIK, KTP, Paspor, SIM)
    const piiPatterns = [
      /\b(nik|nomor\s*ktp|no\s*ktp|nomor\s*induk\s*kependudukan|no\s*paspor|nomor\s*sim)\b/i,
      /\b\d{16}\b/, // Standard 16-digit Indonesian NIK
    ];
    if (piiPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    // 4. Physical Home Address / Sensitive Location
    const addressPatterns = [
      /\b(alamat\s*rumah|tinggal\s*di\s*jalan|rumahku\s*di\s*jalan|rt\s*\d+\s*\/\s*rw\s*\d+|kode\s*pos\s*\d{5})\b/i,
    ];
    if (addressPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    // 5. Sensitive Medical History & Prescriptions
    const medicalPatterns = [
      /\b(riwayat\s*penyakit|diagnosis\s*dokter|rekam\s*medis|obat\s*resep|positif\s*hiv|mengidap\s*kanker|terkena\s*penyakit\s*menular)\b/i,
    ];
    if (medicalPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    return false;
  }

  /**
   * Add a long-term user fact to user_memories.
   * Enforces sensitive content rejection, duplicate prevention, and user quota.
   */
  public addUserMemory(params: {
    userId: string;
    fact: string;
    category?: string;
    source?: string;
    confidence?: number;
  }): AddMemoryResult {
    const trimmedFact = params.fact?.trim();
    if (!trimmedFact) {
      return { added: false, reason: 'empty' };
    }

    // SEC-10 & PRD §9: Reject sensitive facts
    if (this.isSensitiveFact(trimmedFact)) {
      console.warn(`[MemoryStore] Rejected sensitive fact for user ${params.userId}: "${trimmedFact.slice(0, 30)}..."`);
      return { added: false, reason: 'sensitive_content_rejected' };
    }

    // Check duplicate fact for this user
    const checkStmt = this.db.prepare(
      'SELECT id FROM user_memories WHERE user_id = ? AND LOWER(fact) = LOWER(?) LIMIT 1'
    );
    const existing = checkStmt.get(params.userId, trimmedFact) as { id: number } | undefined;
    if (existing) {
      // Update timestamp on existing fact
      const updateStmt = this.db.prepare(
        "UPDATE user_memories SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      );
      updateStmt.run(existing.id);
      return { added: false, reason: 'duplicate', memoryId: existing.id };
    }

    // Check quota (maxFactsPerUser, default 200 facts)
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM user_memories WHERE user_id = ?');
    const countRow = countStmt.get(params.userId) as { count: number };
    if (countRow.count >= this.maxFactsPerUser) {
      // Evict oldest updated fact
      const evictStmt = this.db.prepare(
        'DELETE FROM user_memories WHERE id = (SELECT id FROM user_memories WHERE user_id = ? ORDER BY updated_at ASC LIMIT 1)'
      );
      evictStmt.run(params.userId);
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO user_memories (user_id, fact, category, source, confidence)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      params.userId,
      trimmedFact,
      params.category || 'general',
      params.source || 'conversation',
      params.confidence ?? 1.0
    );

    return {
      added: true,
      memoryId: Number(result.lastInsertRowid),
    };
  }

  /**
   * Retrieve all persistent facts stored for a given user.
   */
  public getUserMemories(userId: string): UserMemory[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id as userId, fact, category, source, confidence,
             created_at as createdAt, updated_at as updatedAt
      FROM user_memories
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);

    return (stmt.all(userId) as any[]).map((row) => ({
      id: Number(row.id),
      userId: String(row.userId),
      fact: String(row.fact),
      category: String(row.category),
      source: row.source ? String(row.source) : undefined,
      confidence: Number(row.confidence),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    }));
  }

  /**
   * Record a single conversation turn in short-term history.
   */
  public recordTurn(params: {
    sessionId: string;
    channelId: string;
    userId: string;
    userName?: string;
    userInput: string;
    botReply: string;
    turnLatencyMs?: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_turns (
        session_id, channel_id, user_id, user_name, user_input, bot_reply, turn_latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.sessionId,
      params.channelId,
      params.userId,
      params.userName || null,
      params.userInput,
      params.botReply,
      params.turnLatencyMs ?? null
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Retrieve recent conversation turns for a given channel (default 12 turns, PRD §9).
   * Returned in ascending chronological order (oldest to newest).
   */
  public getRecentTurns(channelId: string, limit = 12): ConversationTurn[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, channel_id as channelId, user_id as userId,
             user_name as userName, user_input as userInput, bot_reply as botReply,
             turn_latency_ms as turnLatencyMs, created_at as createdAt
      FROM conversation_turns
      WHERE channel_id = ?
      ORDER BY id DESC
      LIMIT ?
    `);

    const rows = stmt.all(channelId, limit) as any[];
    // Reverse to chronological order (oldest first)
    return rows.reverse().map((row) => ({
      id: Number(row.id),
      sessionId: String(row.sessionId),
      channelId: String(row.channelId),
      userId: String(row.userId),
      userName: row.userName ? String(row.userName) : undefined,
      userInput: String(row.userInput),
      botReply: String(row.botReply),
      turnLatencyMs: row.turnLatencyMs !== null ? Number(row.turnLatencyMs) : undefined,
      createdAt: String(row.createdAt),
    }));
  }

  /**
   * Clears short-term conversation turns for a specific channel (e.g. when voice session ends).
   * Ensures the next voice session starts with a clean conversational slate.
   * Long-term user facts (user_memories) are strictly preserved.
   */
  public clearChannelTurns(channelId: string): number {
    if (!channelId) return 0;
    const stmt = this.db.prepare('DELETE FROM conversation_turns WHERE channel_id = ?');
    const result = stmt.run(channelId);
    return Number(result.changes);
  }

  /**
   * Delete all persistent facts and turn history for a single user (/forget me, FR-P4, TC-15).
   */
  public deleteUserMemories(userId: string): DeleteUserMemoriesResult {
    const deleteFactsStmt = this.db.prepare('DELETE FROM user_memories WHERE user_id = ?');
    const factsResult = deleteFactsStmt.run(userId);

    const deleteTurnsStmt = this.db.prepare('DELETE FROM conversation_turns WHERE user_id = ?');
    const turnsResult = deleteTurnsStmt.run(userId);

    const deletedFacts = Number(factsResult.changes);
    const deletedTurns = Number(turnsResult.changes);

    console.log(`[MemoryStore] Deleted ${deletedFacts} facts and ${deletedTurns} turns for user ${userId}.`);
    return {
      deletedFacts,
      deletedTurns,
    };
  }

  /**
   * Wipe the entire memory database (/forget all - Owner only, FR-P4, TC-15).
   */
  public deleteAllMemories(): DeleteUserMemoriesResult {
    const deleteFactsStmt = this.db.prepare('DELETE FROM user_memories');
    const factsResult = deleteFactsStmt.run();

    const deleteTurnsStmt = this.db.prepare('DELETE FROM conversation_turns');
    const turnsResult = deleteTurnsStmt.run();

    const deletedFacts = Number(factsResult.changes);
    const deletedTurns = Number(turnsResult.changes);

    console.log(`[MemoryStore] [PurgeAll] Wiped entire memory database: ${deletedFacts} facts, ${deletedTurns} turns.`);
    return {
      deletedFacts,
      deletedTurns,
    };
  }

  /**
   * Purge old transcripts beyond retention period (default 7 days, PRD §5 & PRD §10).
   * Returns count of purged rows.
   */
  public purgeOldTranscripts(retentionDays = 7): number {
    const stmt = this.db.prepare(`
      DELETE FROM conversation_turns
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(retentionDays);
    const count = Number(result.changes);
    if (count > 0) {
      console.log(`[MemoryStore] Purged ${count} conversation turns older than ${retentionDays} days.`);
    }
    return count;
  }

  /**
   * Close the database connection.
   */
  public close(): void {
    try {
      this.db.close();
    } catch {}
  }
}

// Global Singleton Instance
let defaultMemoryStore: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!defaultMemoryStore) {
    defaultMemoryStore = new MemoryStore();
  }
  return defaultMemoryStore;
}
