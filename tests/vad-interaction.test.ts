import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePcmRms, filterVoiceAudio } from '../src/audio/vad-filter.js';
import { InteractionGate } from '../src/audio/interaction-gate.js';

test('VAD Filter: calculates zero RMS for pure silence', () => {
  const silenceBuffer = Buffer.alloc(48000 * 2 * 1); // 1s silence
  const rms = calculatePcmRms(silenceBuffer);
  assert.equal(rms, 0);

  const filter = filterVoiceAudio(silenceBuffer);
  assert.equal(filter.isVoice, false);
  assert.equal(filter.reason, 'below_energy_threshold');
});

test('VAD Filter: rejects audio that is too short (< 0.5s)', () => {
  const shortBuffer = Buffer.alloc(48000 * 2 * 0.2); // 0.2s
  const filter = filterVoiceAudio(shortBuffer);
  assert.equal(filter.isVoice, false);
  assert.equal(filter.reason, 'too_short');
});

test('VAD Filter: accepts audio with speech-level energy and valid duration', () => {
  const sampleCount = 48000 * 1; // 1 second
  const speechBuffer = Buffer.alloc(sampleCount * 2);
  // Fill with simulated 1000 Hz sine wave with amplitude 5000 (typical speech level)
  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.round(5000 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    speechBuffer.writeInt16LE(sample, i * 2);
  }

  const rms = calculatePcmRms(speechBuffer);
  assert.ok(rms > 3000, `RMS (${rms}) should be high for simulated speech`);

  const filter = filterVoiceAudio(speechBuffer);
  assert.equal(filter.isVoice, true);
  assert.equal(filter.reason, 'valid_speech');
});

test('InteractionGate (TC-07): ignores speech without wake word in "wake" mode', () => {
  const gate = new InteractionGate({
    mode: 'wake',
    wakeWords: ['lyra', 'lira', 'airi', 'bot'],
  });

  const utterances = [
    'Halo guys, gimana kabar game semalam?',
    'Siapa yang menang turnamen tadi?',
    'Cuaca hari ini cukup panas ya.',
    'Bisa tolong mute mic sebentar?',
    'Wkwk lucu banget videonya.',
  ];

  for (const text of utterances) {
    const result = gate.evaluate(text);
    assert.equal(result.allowed, false, `Utterance "${text}" must NOT trigger bot in wake mode`);
    assert.equal(result.reason, 'wake_word_missing');
  }
});

test('InteractionGate (TC-07): triggers AI response when wake word is called', () => {
  const gate = new InteractionGate({
    mode: 'wake',
    wakeWords: ['lyra', 'lira', 'airi', 'bot'],
  });

  const testCases = [
    { input: 'Halo Lyra, kamu lagi apa?', expectedClean: 'kamu lagi apa?' },
    { input: 'Lyra, ceritakan lelucon dong!', expectedClean: 'ceritakan lelucon dong!' },
    { input: 'Lira, apakah kamu mendengarku?', expectedClean: 'apakah kamu mendengarku?' },
    { input: 'Hai Airi, selamat malam!', expectedClean: 'selamat malam!' },
    { input: 'Bot, tolong beri tahu jam berapa sekarang', expectedClean: 'tolong beri tahu jam berapa sekarang' },
    { input: 'Lyra', expectedClean: 'Lyra' },
    { input: 'Halo Lyra', expectedClean: 'Halo Lyra' },
  ];

  for (const tc of testCases) {
    const result = gate.evaluate(tc.input);
    assert.equal(result.allowed, true, `Utterance "${tc.input}" must trigger bot`);
    assert.equal(result.reason, 'wake_word_matched');
    assert.ok(result.wakeWordMatched, 'Must identify matched wake word');
    assert.equal(result.cleanedText, tc.expectedClean);
  }
});

test('InteractionGate: responds to all speech in "open" mode', () => {
  const gate = new InteractionGate({ mode: 'open' });
  const result = gate.evaluate('Selamat pagi semuanya');
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'open_mode');
});

test('InteractionGate: requires PTT flag in "ptt" mode', () => {
  const gate = new InteractionGate({ mode: 'ptt' });

  const inactive = gate.evaluate('Halo Lyra', { isPttTriggered: false });
  assert.equal(inactive.allowed, false);
  assert.equal(inactive.reason, 'ptt_inactive');

  const active = gate.evaluate('Halo Lyra', { isPttTriggered: true });
  assert.equal(active.allowed, true);
  assert.equal(active.reason, 'ptt_active');
});
