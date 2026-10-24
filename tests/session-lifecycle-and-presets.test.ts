import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ElevenLabsTtsProvider } from '../src/providers/elevenlabs/elevenlabs-tts.js';

test('MemoryStore: clearChannelTurns resets session turns without deleting permanent user memories', () => {
  const store = new MemoryStore({ dbPath: ':memory:' });

  // 1. Simpan fakta permanen user (Long-Term Memory)
  store.addUserMemory({ userId: 'user-1', fact: 'Nama panggilannya adalah Aekt', source: 'voice' });
  store.addUserMemory({ userId: 'user-1', fact: 'Menyukai game Valorant', source: 'voice' });
  store.addUserMemory({ userId: 'user-2', fact: 'Suka mendengarkan musik lofi', source: 'text' });

  // 2. Simulasikan obrolan aktif di Channel Voice A dan Channel Voice B
  for (let i = 1; i <= 5; i++) {
    store.recordTurn({
      sessionId: 'voice-session-a',
      channelId: 'channel-voice-a',
      userId: 'user-1',
      userName: 'Aekt',
      userInput: `Obrolan turn ${i} di channel A`,
      botReply: `Respon bot ${i} di channel A`,
      turnLatencyMs: 350,
    });
  }

  for (let i = 1; i <= 3; i++) {
    store.recordTurn({
      sessionId: 'voice-session-b',
      channelId: 'channel-voice-b',
      userId: 'user-2',
      userName: 'Kawan',
      userInput: `Obrolan turn ${i} di channel B`,
      botReply: `Respon bot ${i} di channel B`,
      turnLatencyMs: 400,
    });
  }

  // Verifikasi kondisi awal
  assert.equal(store.getRecentTurns('channel-voice-a', 10).length, 5);
  assert.equal(store.getRecentTurns('channel-voice-b', 10).length, 3);
  assert.equal(store.getUserMemories('user-1').length, 2);
  assert.equal(store.getUserMemories('user-2').length, 1);

  // 3. Bot keluar dari Channel A -> Reset Memory Channel A
  const deletedCount = store.clearChannelTurns('channel-voice-a');
  assert.equal(deletedCount, 5);

  // 4. Verifikasi Channel A sudah bersih (0 turns)
  const turnsAfterResetA = store.getRecentTurns('channel-voice-a', 10);
  assert.equal(turnsAfterResetA.length, 0, 'Channel A turns should be cleared after leave');

  // 5. Verifikasi Channel B tetap utuh
  const turnsChannelB = store.getRecentTurns('channel-voice-b', 10);
  assert.equal(turnsChannelB.length, 3, 'Channel B turns should remain untouched');

  // 6. Verifikasi User Memories (Long-Term Facts) TETAP AMAN dan TIDAK TERHAPUS
  const user1Memories = store.getUserMemories('user-1');
  assert.equal(user1Memories.length, 2, 'User 1 long-term facts must be preserved');
  assert.ok(user1Memories.some((m) => m.fact.includes('Aekt')));
  assert.ok(user1Memories.some((m) => m.fact.includes('Valorant')));

  const user2Memories = store.getUserMemories('user-2');
  assert.equal(user2Memories.length, 1, 'User 2 long-term facts must be preserved');
});

test('ElevenLabsTtsProvider: Voice settings tuning supports style, speed, and preset adaptation', () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: 'test-api-key',
    voiceId: 'test-voice-id-1',
    modelId: 'eleven_turbo_v2_5',
  });

  // 1. Cek default voice settings (Chibi centil baseline)
  const defaults = provider.getVoiceSettings();
  assert.equal(defaults.style, 0.65);
  assert.equal(defaults.speed, 1.15);
  assert.equal(defaults.stability, 0.35);
  assert.equal(defaults.similarityBoost, 0.75);

  // 2. Tune ke preset Tsundere
  provider.setVoiceSettings({
    stability: 0.30,
    similarityBoost: 0.80,
    style: 0.70,
    speed: 1.10,
  });

  const tsundereSettings = provider.getVoiceSettings();
  assert.equal(tsundereSettings.style, 0.70);
  assert.equal(tsundereSettings.speed, 1.10);
  assert.equal(tsundereSettings.stability, 0.30);
  assert.equal(tsundereSettings.similarityBoost, 0.80);

  // 3. Tune ke preset Sweet
  provider.setVoiceSettings({
    stability: 0.50,
    similarityBoost: 0.85,
    style: 0.45,
    speed: 0.95,
  });

  const sweetSettings = provider.getVoiceSettings();
  assert.equal(sweetSettings.style, 0.45);
  assert.equal(sweetSettings.speed, 0.95);
  assert.equal(sweetSettings.stability, 0.50);
  assert.equal(sweetSettings.similarityBoost, 0.85);

  // 4. Partial update (hanya ubah speed)
  provider.setVoiceSettings({ speed: 1.25 });
  const updatedSpeed = provider.getVoiceSettings();
  assert.equal(updatedSpeed.speed, 1.25);
  assert.equal(updatedSpeed.style, 0.45, 'Style should remain unchanged during partial update');
});
