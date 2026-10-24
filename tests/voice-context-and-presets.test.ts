import test from 'node:test';
import assert from 'node:assert/strict';
import { FactExtractor } from '../src/memory/fact-extractor.js';
import { MemoryStore } from '../src/memory/memory-store.js';

test('Auto-Remember: Extracts user nickname, game, likes, and dislikes accurately', () => {
  const store = new MemoryStore({ dbPath: ':memory:' });
  const extractor = new FactExtractor(store);

  // 1. Nickname extraction
  const nickResult = extractor.processTurnAndSave('user-1', 'Halo Lyra, panggil aku Aekt ya dong', 'voice');
  assert.equal(nickResult.length, 1);
  assert.equal(nickResult[0].added, true);

  const facts1 = store.getUserMemories('user-1');
  assert.equal(facts1.length, 1);
  assert.ok(facts1[0].fact.includes('Aekt'));

  // 2. Game preference
  const gameResult = extractor.processTurnAndSave('user-1', 'Aku lagi suka main game Valorant bareng temen', 'voice');
  assert.equal(gameResult.length, 1);
  assert.equal(gameResult[0].added, true);

  // 3. Dislike / Allergy
  const dislikeResult = extractor.processTurnAndSave('user-1', 'Aku gak suka makanan pedas nih', 'voice');
  assert.equal(dislikeResult.length, 1);
  assert.equal(dislikeResult[0].added, true);

  // 4. Sensitive fact rejected by sanitizer
  const piiResult = extractor.processTurnAndSave('user-1', 'Password akun saya rahasia12345', 'voice');
  assert.equal(piiResult.length, 0);

  const allFacts = store.getUserMemories('user-1');
  assert.equal(allFacts.length, 3);
  assert.ok(allFacts.some((f) => f.fact.includes('Aekt')));
  assert.ok(allFacts.some((f) => f.fact.includes('Valorant')));
  assert.ok(allFacts.some((f) => f.fact.includes('pedas')));
});

test('Multi-Turn Context: Stores and retrieves up to 15 turns with passive room support', () => {
  const store = new MemoryStore({ dbPath: ':memory:' });

  // Simulate 18 turns in a voice channel
  for (let i = 1; i <= 18; i++) {
    const isPassive = i % 3 === 0;
    store.recordTurn({
      sessionId: 'voice-session-1',
      channelId: 'voice-channel-1',
      userId: `user-${i % 2}`,
      userName: `User${i % 2}`,
      userInput: `Pesan percakapan ${i}`,
      botReply: isPassive ? '' : `Jawaban bot ${i}`,
      turnLatencyMs: 500,
    });
  }

  // Retrieve 15 recent turns
  const turns = store.getRecentTurns('voice-channel-1', 15);
  assert.equal(turns.length, 15);
  // Oldest of the 15 should be turn 4 (since total is 18)
  assert.equal(turns[0].userInput, 'Pesan percakapan 4');
  assert.equal(turns[14].userInput, 'Pesan percakapan 18');

  // Verify passive turn has empty bot reply
  const passiveTurn = turns.find((t) => t.userInput === 'Pesan percakapan 18');
  assert.ok(passiveTurn);
  assert.equal(passiveTurn.botReply, '');
});
