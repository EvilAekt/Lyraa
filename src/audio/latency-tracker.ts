/**
 * Latency Tracker and Metrics Instrumentation
 * Implements PRD §6, FR-A1, and Task T1.6:
 * - Records timestamps t0..t5 per turnId:
 *   t0: VAD endpoint detected silence indicating end of user speech.
 *   t1: STT transcript ready.
 *   t2: First token arrived from Gemini LLM stream (TTFT).
 *   t3: First complete sentence delivered to TTS engine.
 *   t4: First audio chunk returned by TTS engine.
 *   t5: First Opus audio packet dispatched to Discord voice UDP socket.
 * - Writes structured JSON lines to logs/latency.jsonl.
 * - Computes p50, p95, and average latency metrics for /status command.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface TurnTimestamps {
  turnId: string;
  userId: string;
  guildId: string;
  t0: number; // Endpointing (end of user speech)
  t1: number; // STT ready
  t2: number; // First LLM token (TTFT)
  t3: number; // Sentence 1 chunk ready for TTS
  t4: number; // TTS first audio chunk ready
  t5: number; // Dispatched to voice player
  inputText?: string;
  outputText?: string;
  personaVersion?: string;
}

export interface TurnMetrics {
  turnId: string;
  userId: string;
  guildId: string;
  timestamp: string;
  personaVersion?: string;
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  t5: number;
  sttMs: number;       // t1 - t0
  llmTtftMs: number;   // t2 - t1
  chunkerMs: number;   // t3 - t2
  ttsMs: number;       // t4 - t3
  dispatchMs: number;  // t5 - t4
  totalMs: number;     // t5 - t0
  inputText?: string;
  outputText?: string;
}

export interface PercentileStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

export interface LatencySummary {
  totalTurns: number;
  total: PercentileStats;
  stt: PercentileStats;
  llmTtft: PercentileStats;
  chunker: PercentileStats;
  tts: PercentileStats;
  dispatch: PercentileStats;
}

export function calculatePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);

  const p50 = sorted[Math.floor(count * 0.5)];
  const p95 = sorted[Math.min(count - 1, Math.floor(count * 0.95))];
  const p99 = sorted[Math.min(count - 1, Math.floor(count * 0.99))];

  return {
    count,
    p50,
    p95,
    p99,
    avg: Math.round(sum / count),
    min: sorted[0],
    max: sorted[count - 1],
  };
}

export class LatencyTracker {
  private logFilePath: string;
  private history: TurnMetrics[] = [];
  private maxInMemoryRecords = 200;

  constructor(customLogPath?: string) {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      try {
        fs.mkdirSync(logsDir, { recursive: true });
      } catch {}
    }

    this.logFilePath = customLogPath || path.join(logsDir, 'latency.jsonl');
    this.loadHistory();
  }

  private loadHistory() {
    if (!fs.existsSync(this.logFilePath)) return;

    try {
      const content = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      const parsed: TurnMetrics[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line));
        } catch {}
      }

      this.history = parsed.slice(-this.maxInMemoryRecords);
    } catch (err: any) {
      console.warn('[LatencyTracker] Could not load prior latency history:', err.message);
    }
  }

  /**
   * Records a completed turn with t0..t5 timestamps.
   */
  public recordTurn(ts: TurnTimestamps): TurnMetrics {
    const sttMs = Math.max(0, ts.t1 - ts.t0);
    const llmTtftMs = Math.max(0, ts.t2 - ts.t1);
    const chunkerMs = Math.max(0, ts.t3 - ts.t2);
    const ttsMs = Math.max(0, ts.t4 - ts.t3);
    const dispatchMs = Math.max(0, ts.t5 - ts.t4);
    const totalMs = Math.max(0, ts.t5 - ts.t0);

    const metrics: TurnMetrics = {
      turnId: ts.turnId,
      userId: ts.userId,
      guildId: ts.guildId,
      timestamp: new Date().toISOString(),
      t0: ts.t0,
      t1: ts.t1,
      t2: ts.t2,
      t3: ts.t3,
      t4: ts.t4,
      t5: ts.t5,
      sttMs,
      llmTtftMs,
      chunkerMs,
      ttsMs,
      dispatchMs,
      totalMs,
      inputText: ts.inputText,
      outputText: ts.outputText,
      personaVersion: ts.personaVersion,
    };

    // Update in-memory history
    this.history.push(metrics);
    if (this.history.length > this.maxInMemoryRecords) {
      this.history.shift();
    }

    // Persist to JSONL file
    try {
      const line = JSON.stringify(metrics) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf-8');
    } catch (err: any) {
      console.error('[LatencyTracker] Failed to write latency record:', err.message);
    }

    console.log(
      `[LatencyTracker] [Turn ${metrics.turnId}] Total: ${totalMs}ms | STT: ${sttMs}ms | TTFT: ${llmTtftMs}ms | Chunker: ${chunkerMs}ms | TTS: ${ttsMs}ms | Dispatch: ${dispatchMs}ms`
    );

    return metrics;
  }

  /**
   * Returns percentile and aggregate summary of recorded turns.
   */
  public getSummary(): LatencySummary {
    const totals = this.history.map((h) => h.totalMs);
    const stt = this.history.map((h) => h.sttMs);
    const llmTtft = this.history.map((h) => h.llmTtftMs);
    const chunker = this.history.map((h) => h.chunkerMs);
    const tts = this.history.map((h) => h.ttsMs);
    const dispatch = this.history.map((h) => h.dispatchMs);

    return {
      totalTurns: this.history.length,
      total: calculatePercentiles(totals),
      stt: calculatePercentiles(stt),
      llmTtft: calculatePercentiles(llmTtft),
      chunker: calculatePercentiles(chunker),
      tts: calculatePercentiles(tts),
      dispatch: calculatePercentiles(dispatch),
    };
  }

  /**
   * Returns recent turn history.
   */
  public getHistory(): TurnMetrics[] {
    return [...this.history];
  }

  /**
   * Resets in-memory history (useful for benchmark test runs).
   */
  public clearMemory() {
    this.history = [];
  }
}
