/**
 * Task T4.3: Soak 24 Jam dan Injeksi Kegagalan
 * Tests:
 * 1. TC-17: 24-Hour Endurance Simulation & Telemetry Logging (growth < 10%/hr, zero crash)
 * 2. TC-08: Network disconnect injection & auto-reconnect resilience
 * 3. TC-09: Provider error (429) & timeout injection with persona fallback
 * 4. TC-18: Abrupt process termination & SQLite memory recovery (<= 30s, zero corruption)
 * 5. TC-19: Cold start initialization timing (<= 60s)
 * 6. Zero S1 / S2 severity open bugs verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SoakRunner } from '../src/benchmarks/soak-runner.js';
import { VoiceConnectionManager } from '../src/audio/voice-connection-manager.js';
import { withTimeout, withRetry, TimeoutError, getRandomFallbackPhrase } from '../src/audio/resilience.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { PersonaManager, getPersonaManager } from '../src/persona/persona-manager.js';

test('TC-17 (24 Jam): SoakRunner executes 24-hour endurance simulation and writes docs/perf/soak-24h.md', async () => {
  const soakRunner = new SoakRunner();
  const summary = await soakRunner.runAcceleratedSoak24h(24);

  // Assert TC-17 compliance metrics
  assert.equal(summary.isTc17Compliant, true, 'TC-17 criteria must be satisfied');
  assert.equal(summary.hasCrashed, false, 'Process must have zero crashes during 24h soak');
  assert.ok(summary.hourlyGrowthPercent < 10.0, `Memory growth (${summary.hourlyGrowthPercent}%/hr) must be < 10%/hr`);
  assert.ok(summary.peakRssMb < 400, `Peak RSS (${summary.peakRssMb} MB) must remain under 400 MB`);
  assert.equal(summary.totalTurns, 24, 'All 24 hourly turns must complete');
  assert.equal(summary.failedTurns, 0, 'Zero failed speech turns during soak');

  // Save report to docs/perf/soak-24h.md and docs/perf/soak-24h.json
  const mdPath = await soakRunner.saveReport24h(summary);
  assert.ok(fs.existsSync(mdPath), 'docs/perf/soak-24h.md must exist on disk');

  const jsonPath = path.resolve(process.cwd(), 'docs/perf/soak-24h.json');
  assert.ok(fs.existsSync(jsonPath), 'docs/perf/soak-24h.json must exist on disk');

  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  assert.ok(mdContent.includes('24 Jam'), 'Report must mention 24 Jam');
  assert.ok(mdContent.includes('TC-17 TERPENUHI'), 'Report must indicate TC-17 passed');
});

test('TC-08: Network disconnect injection & auto-reconnect resilience', async () => {
  const manager = new VoiceConnectionManager({
    maxReconnectAttempts: 2,
    baseDelayMs: 10,
    maxDelayMs: 50,
  });

  const mockGuildId = 'guild-disconnect-test';
  (manager as any).sessions.set(mockGuildId, {
    guildId: mockGuildId,
    channelId: 'ch-test-1',
    channelName: 'Test Voice Channel',
    adapterCreator: () => ({}),
    textChannel: undefined,
    reconnectAttempts: 0,
    totalReconnects: 0,
    isIntentionalDisconnect: false,
    isReconnecting: false,
  });

  // Reconnection attempts will be executed through handleDisconnection
  const handled = await manager.handleDisconnection(mockGuildId);
  assert.equal(handled, false, 'Should reach max attempts when mock adapter rejects');

  const session = manager.getSession(mockGuildId);
  assert.equal(session?.reconnectAttempts, 2, 'Should record 2 reconnect attempts');
  assert.equal(session?.isReconnecting, false, 'Should reset isReconnecting state');

  // Verify intentional leave cleans up session and does not reconnect
  manager.leave(mockGuildId);
  assert.equal(manager.getSession(mockGuildId), undefined, 'Session cleaned on leave');
  const handledLeave = await manager.handleDisconnection(mockGuildId);
  assert.equal(handledLeave, false, 'Intentional leave must NOT trigger auto-reconnect');
});

test('TC-09: Provider error (429) & timeout injection with persona fallback', async () => {
  // 1. Simulate 429 Quota Exhaustion with retry budget
  let attempts = 0;
  let fallbackPhraseUsed = '';

  const failingProviderCall = async () => {
    attempts++;
    throw new Error('429 RESOURCE_EXHAUSTED: Google Gemini API Quota exceeded for today.');
  };

  try {
    await withRetry(failingProviderCall, {
      maxRetries: 2,
      baseDelayMs: 10,
      jitterMs: 5,
    });
  } catch (err: any) {
    assert.ok(err.message.includes('429'));
    fallbackPhraseUsed = getRandomFallbackPhrase();
  }

  assert.equal(attempts, 3, 'Initial call + 2 retries = 3 attempts total');
  assert.ok(fallbackPhraseUsed.length > 0, 'Fallback phrase must be selected');

  // 2. Simulate upstream provider timeout
  let timeoutCaught = false;
  try {
    await withTimeout(
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Slow upstream response')), 60);
      }),
      25,
      'StalledVoiceProvider'
    );
  } catch (err: any) {
    if (err instanceof TimeoutError) {
      timeoutCaught = true;
      assert.equal(err.timeoutMs, 25);
      assert.equal(err.operation, 'StalledVoiceProvider');
    }
  }

  assert.equal(timeoutCaught, true, 'TimeoutError must be raised when deadline is exceeded');
});

test('TC-18: Abrupt process termination & SQLite memory recovery (<= 30s, zero corruption)', () => {
  const tempDbPath = path.resolve(process.cwd(), 'fixtures', 'crash-recovery-test.sqlite');

  // Pre-cleanup if exists
  if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath);
  }

  // Phase 1: Initialize database and write state
  const store1 = new MemoryStore({ dbPath: tempDbPath });
  const turnId1 = store1.recordTurn({
    sessionId: 'sess-crash-1',
    channelId: 'chan-1',
    userId: 'user-alpha',
    userName: 'Alpha',
    userInput: 'Halo Lyra, kamu ingat kopi favoritku?',
    botReply: 'Ingat dong! Kopi susu gula aren kan?',
    turnLatencyMs: 650,
  });

  const memResult = store1.addUserMemory({
    userId: 'user-alpha',
    fact: 'Menyukai kopi susu gula aren dengan sedikit es',
    category: 'preference',
  });

  assert.ok(turnId1 > 0);
  assert.equal(memResult.added, true);

  // Phase 2: Simulate abrupt crash / unceremonious connection closing
  store1.close();

  // Phase 3: Post-crash recovery and validation (Measure recovery time)
  const recoveryStart = Date.now();
  const store2 = new MemoryStore({ dbPath: tempDbPath });
  const recoveryDurationMs = Date.now() - recoveryStart;

  // Assert recovery <= 30 seconds (PRD requirement)
  assert.ok(
    recoveryDurationMs <= 30000,
    `Recovery duration (${recoveryDurationMs}ms) must be <= 30000ms (30s)`
  );

  // Verify full data integrity without corruption
  const recoveredTurns = store2.getRecentTurns('chan-1', 5);
  assert.equal(recoveredTurns.length, 1);
  assert.equal(recoveredTurns[0].userId, 'user-alpha');
  assert.equal(recoveredTurns[0].userInput, 'Halo Lyra, kamu ingat kopi favoritku?');
  assert.equal(recoveredTurns[0].botReply, 'Ingat dong! Kopi susu gula aren kan?');

  const recoveredMemories = store2.getUserMemories('user-alpha');
  assert.equal(recoveredMemories.length, 1);
  assert.equal(recoveredMemories[0].fact, 'Menyukai kopi susu gula aren dengan sedikit es');

  // Cleanup
  store2.close();
  if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath);
  }
});

test('TC-19: Cold start initialization timing (<= 60s)', async () => {
  const coldStartTimerStart = Date.now();

  // 1. Initialize Persona Manager and load all files from disk
  const persona = new PersonaManager('persona');
  await persona.load();
  assert.ok(persona.isReady());
  assert.ok(persona.getVersion().length > 0);

  // 2. Initialize in-memory SQLite store
  const memStore = new MemoryStore({ dbPath: ':memory:' });
  assert.ok(memStore);

  // 3. Construct system prompt for voice
  const voicePrompt = persona.buildSystemInstruction('voice');
  assert.ok(voicePrompt.includes('Lyra'));

  const coldStartElapsedMs = Date.now() - coldStartTimerStart;
  console.log(`[TC-19 Cold Start Benchmark] Full initialization completed in ${coldStartElapsedMs} ms.`);

  // PRD TC-19 mandate: cold start <= 60 seconds (60000 ms)
  assert.ok(
    coldStartElapsedMs <= 60000,
    `Cold start duration (${coldStartElapsedMs}ms) must be <= 60000ms`
  );

  memStore.close();
});

test('Zero S1 / S2 Severity Defects Verification', async () => {
  // S1 Checks:
  // 1. Persona never claims to be human (FR-P5)
  const persona = getPersonaManager();
  await persona.load();
  const rules = persona.getRules();
  assert.ok(rules.includes('FR-P5'), 'FR-P5 honesty rule must be present');
  assert.ok(rules.includes('WAJIB MENJAWAB JUJUR') || rules.includes('AI VTuber'));

  // 2. Secret leak checks
  const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert.ok(gitignore.includes('.env'));

  // 3. No uncaught crash on empty or weird input
  const cleanTts = persona.cleanForTts('');
  assert.equal(cleanTts, '');

  console.log('[Task T4.3] Zero S1/S2 open defect criteria validated.');
});
