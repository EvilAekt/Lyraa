import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicevoxTtsProvider, VOICEVOX_SPEAKER_MAP } from '../src/providers/voicevox/voicevox-tts.js';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { StreamType } from '@discordjs/voice';

test('VoicevoxTtsProvider: initializes with default configuration', () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  assert.equal(provider.getCurrentSpeakerId(), 46);
  assert.equal(provider.getVoiceName(), VOICEVOX_SPEAKER_MAP[46]);
  assert.equal(provider.getStreamType(), 'raw');
});

test('VoicevoxTtsProvider: switchSpeaker() switches speaker ID and rejects invalid IDs', () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  provider.switchSpeaker(14);
  assert.equal(provider.getCurrentSpeakerId(), 14);
  assert.equal(provider.getVoiceName(), VOICEVOX_SPEAKER_MAP[14]);

  provider.switchSpeaker(46);
  assert.equal(provider.getCurrentSpeakerId(), 46);

  assert.throws(
    () => provider.switchSpeaker(9999),
    /Invalid speaker ID 9999/
  );
});

test('VoicevoxTtsProvider: getAvailableSpeakers() returns list of configured speakers', () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  const list = provider.getAvailableSpeakers();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 46);
  assert.equal(list[1].id, 14);
});

test('VoicevoxTtsProvider: synthesize() returns empty buffer on empty/whitespace text', async () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  const empty1 = await provider.synthesize('');
  assert.equal(empty1.length, 0);

  const empty2 = await provider.synthesize('   ');
  assert.equal(empty2.length, 0);
});

test('VoicevoxTtsProvider: wavTo48kStereoPcm() correctly resamples 24kHz mono WAV to 48kHz stereo PCM', () => {
  // Synthesize a synthetic WAV header + 240 samples of 24kHz mono 16-bit PCM (10ms)
  const numSamples24k = 240;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + numSamples24k * 2, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // Mono
  wavHeader.writeUInt32LE(24000, 24); // 24kHz
  wavHeader.writeUInt32LE(48000, 28); // Byte rate
  wavHeader.writeUInt16LE(2, 32); // Block align
  wavHeader.writeUInt16LE(16, 34); // 16-bit
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(numSamples24k * 2, 40);

  const pcmData = Buffer.alloc(numSamples24k * 2);
  for (let i = 0; i < numSamples24k; i++) {
    pcmData.writeInt16LE(1000 + i, i * 2);
  }

  const mockWav = Buffer.concat([wavHeader, pcmData]);
  const resampled = VoicevoxTtsProvider.wavTo48kStereoPcm(mockWav);

  // 240 samples at 24kHz mono -> 480 frames at 48kHz stereo
  // 480 frames * 2 channels * 2 bytes = 1920 bytes (numSamples * 8)
  assert.equal(resampled.length, numSamples24k * 8);

  // Check first frame (Left and Right should equal sample 0)
  assert.equal(resampled.readInt16LE(0), 1000);
  assert.equal(resampled.readInt16LE(2), 1000);
});

// Integration tests with local running VOICEVOX Engine
test('VoicevoxTtsProvider (Integration): synthesizeWav() produces valid WAV with RIFF header', async () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  try {
    const wav = await provider.synthesizeWav('テスト');
    assert.ok(wav.length > 1000, 'WAV buffer should be non-empty');
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    console.log(`\n  [VOICEVOX Sayo WAV] Synthesized ${wav.length} bytes`);
  } catch (err: any) {
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      console.warn('  [VOICEVOX Test Skipped] Local engine not reachable');
      return;
    }
    throw err;
  }
});

test('VoicevoxTtsProvider (Integration): synthesize() produces 48kHz stereo PCM and plays in VoicePlayer', async () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 14, // Meimei Himari
    availableSpeakers: [46, 14],
  });

  try {
    const start = Date.now();
    const pcm = await provider.synthesize('こんにちは');
    const synthDuration = Date.now() - start;

    assert.ok(pcm.length > 4000, 'PCM buffer should be non-empty');
    assert.equal(pcm.length % 4, 0, 'PCM buffer should align with 4-byte 16-bit stereo frames');
    console.log(`\n  [VOICEVOX Himari PCM] Synthesized ${pcm.length} bytes in ${synthDuration}ms`);

    // Verify it enqueues and plays in VoicePlayer
    const player = new VoicePlayer();
    await player.enqueue(pcm, StreamType.Raw);
    assert.equal(player.getPlaybackStats().totalItemsPlayed, 1);
    player.destroy();
  } catch (err: any) {
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      console.warn('  [VOICEVOX Test Skipped] Local engine not reachable');
      return;
    }
    throw err;
  }
});

test('VoicevoxTtsProvider (Integration): warmUp() executes successfully', async () => {
  const provider = new VoicevoxTtsProvider({
    baseUrl: 'http://127.0.0.1:50021',
    speakerId: 46,
    availableSpeakers: [46, 14],
  });

  await provider.warmUp();
});
