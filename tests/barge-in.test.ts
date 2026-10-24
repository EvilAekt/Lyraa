import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnManager } from '../src/audio/turn-manager.js';
import { VoicePlayer } from '../src/audio/voice-player.js';

test('TurnManager: starts turn with unique turn ID and active AbortSignal', () => {
  const manager = new TurnManager();
  const { turnId, signal } = manager.startTurn('guild-1');

  assert.ok(turnId.startsWith('turn-'));
  assert.equal(signal.aborted, false);
  assert.equal(manager.isTurnActive('guild-1'), true);

  manager.finishTurn('guild-1', turnId);
  assert.equal(manager.isTurnActive('guild-1'), false);
});

test('Barge-in (TC-05): halts active turn within <= 300 ms and triggers AbortSignal', () => {
  const manager = new TurnManager();
  const player = new VoicePlayer();

  const { turnId, signal } = manager.startTurn('guild-1');
  assert.equal(signal.aborted, false);

  const start = Date.now();
  const result = manager.handleBargeIn('guild-1', 'user-interrupter', player);
  const elapsed = Date.now() - start;

  assert.equal(result.interrupted, true, 'Barge-in must interrupt active turn');
  assert.equal(result.turnId, turnId);
  assert.equal(result.userId, 'user-interrupter');
  assert.ok(
    result.stopDurationMs <= 300,
    `Stop latency (${result.stopDurationMs}ms) must be <= 300ms (TC-05)`
  );
  assert.ok(elapsed <= 300, `Total elapsed time (${elapsed}ms) must be <= 300ms`);
  assert.equal(signal.aborted, true, 'AbortSignal must be marked aborted immediately');
  assert.equal(manager.isTurnActive('guild-1'), false);

  player.destroy();
});

test('Barge-in (TC-05): purges queued audio items to prevent stale playback', () => {
  const player = new VoicePlayer();
  const dummyBuffer = Buffer.alloc(1024);

  // Directly access queue to simulate pending chunks waiting for playback
  (player as any).queue.push(
    { id: '1', buffer: dummyBuffer, resolve: () => {} },
    { id: '2', buffer: dummyBuffer, resolve: () => {} },
    { id: '3', buffer: dummyBuffer, resolve: () => {} }
  );

  assert.equal(player.getQueueLength(), 3);

  const purgedCount = player.clearQueue();
  assert.equal(purgedCount, 3, 'Must purge exactly 3 queued audio items');
  assert.equal(player.getQueueLength(), 0, 'Queue must be completely empty after purge');

  player.destroy();
});

test('TurnManager: ignores barge-in when bot is idle (no active turn or playback)', () => {
  const manager = new TurnManager();
  const player = new VoicePlayer();

  const result = manager.handleBargeIn('guild-idle', 'user-someone', player);
  assert.equal(result.interrupted, false);
  assert.equal(result.purgedQueueCount, 0);

  player.destroy();
});
