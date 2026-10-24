import test from 'node:test';
import assert from 'node:assert/strict';
import { ElevenLabsTtsProvider } from '../src/providers/elevenlabs/elevenlabs-tts.js';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { StreamType } from '@discordjs/voice';
import { config } from '../src/config/index.js';

test('ElevenLabsTtsProvider: initializes with custom configuration', () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: 'dummy_key',
    voiceId: '0CzBBZVHSe1kKQOUHVzq',
    modelId: 'eleven_turbo_v2_5',
    outputFormat: 'pcm_48000',
  });

  assert.equal(provider.getVoiceId(), '0CzBBZVHSe1kKQOUHVzq');
  assert.equal(provider.getVoiceName(), 'ElevenLabs (0CzBBZVHSe1kKQOUHVzq)');
  assert.equal(provider.getStreamType(), 'raw');
});

test('ElevenLabsTtsProvider: monoToStereoPcm() correctly expands 48kHz mono PCM to stereo 48kHz PCM', () => {
  // 100 samples of 16-bit mono PCM = 200 bytes
  const numSamples = 100;
  const monoPcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    monoPcm.writeInt16LE(500 + i, i * 2);
  }

  const stereoPcm = ElevenLabsTtsProvider.monoToStereoPcm(monoPcm);

  // 100 frames * 2 channels * 2 bytes = 400 bytes
  assert.equal(stereoPcm.length, numSamples * 4);

  // Check left and right channel equality
  for (let i = 0; i < numSamples; i++) {
    const left = stereoPcm.readInt16LE(i * 4);
    const right = stereoPcm.readInt16LE(i * 4 + 2);
    assert.equal(left, 500 + i);
    assert.equal(right, 500 + i);
  }
});

test('ElevenLabsTtsProvider: synthesize() returns empty buffer on empty/whitespace input', async () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: 'dummy_key',
    voiceId: '0CzBBZVHSe1kKQOUHVzq',
  });

  const empty1 = await provider.synthesize('');
  assert.equal(empty1.length, 0);

  const empty2 = await provider.synthesize('   \n  ');
  assert.equal(empty2.length, 0);
});

test('ElevenLabsTtsProvider: setVoiceId() switches active voice ID and validates non-empty', () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: 'dummy_key',
    voiceId: '0CzBBZVHSe1kKQOUHVzq',
  });

  provider.setVoiceId('new_voice_123');
  assert.equal(provider.getVoiceId(), 'new_voice_123');

  assert.throws(() => provider.setVoiceId(''), /cannot be empty/);
});

// Live integration test with ElevenLabs API
test('ElevenLabsTtsProvider (Integration): synthesize() successfully calls ElevenLabs API and generates stereo PCM', async () => {
  if (!config.ELEVENLABS_API_KEY) {
    console.warn('  [Test Skipped] ELEVENLABS_API_KEY not configured.');
    return;
  }

  const provider = new ElevenLabsTtsProvider({
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    modelId: config.ELEVENLABS_MODEL_ID,
    outputFormat: config.ELEVENLABS_OUTPUT_FORMAT,
  });

  const start = Date.now();
  const audio = await provider.synthesize('Halo! Ini uji coba suara ElevenLabs untuk Lyraa.');
  const duration = Date.now() - start;

  assert.ok(audio.length > 1000, `Synthesized audio buffer (${audio.length} bytes) must be substantial`);
  if (provider.getStreamType() === 'ogg/opus') {
    assert.equal(audio.subarray(0, 4).toString('utf8'), 'OggS', 'Audio buffer must be valid OggOpus container');
    assert.equal(VoicePlayer.detectStreamType(audio), StreamType.OggOpus);
  } else {
    assert.equal(audio.length % 4, 0, 'Audio buffer must be aligned to 4-byte 16-bit stereo PCM frames');
  }

  console.log(`\n  [ElevenLabs Live Result] Synthesized ${audio.length} bytes (${provider.getStreamType()}) in ${duration}ms`);
});

test('ElevenLabsTtsProvider (Integration): synthesized audio plays in VoicePlayer', async () => {
  if (!config.ELEVENLABS_API_KEY) {
    return;
  }

  const provider = new ElevenLabsTtsProvider({
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    modelId: config.ELEVENLABS_MODEL_ID,
    outputFormat: config.ELEVENLABS_OUTPUT_FORMAT,
  });

  const audio = await provider.synthesize('Siap Papa!');
  assert.ok(audio.length > 500);

  const player = new VoicePlayer();
  await player.enqueue(audio);
  assert.equal(player.getPlaybackStats().totalItemsPlayed, 1);
  player.destroy();
});

test('ElevenLabsTtsProvider (Integration): synthesizeStream() streams progressive audio chunks', async () => {
  if (!config.ELEVENLABS_API_KEY) {
    return;
  }

  const provider = new ElevenLabsTtsProvider({
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    modelId: config.ELEVENLABS_MODEL_ID,
    outputFormat: config.ELEVENLABS_OUTPUT_FORMAT,
  });

  const stream = provider.synthesizeStream('Halo semuanya!');
  let chunkCount = 0;
  let totalBytes = 0;

  for await (const chunk of stream) {
    chunkCount++;
    totalBytes += chunk.length;
    if (provider.getStreamType() === 'raw') {
      assert.equal(chunk.length % 4, 0, 'Each streaming chunk must align to 4-byte stereo frames');
    }
  }

  assert.ok(chunkCount >= 1, 'Stream must deliver at least 1 audio chunk');
  assert.ok(totalBytes > 500, 'Total streamed bytes must be substantial');
  console.log(`\n  [ElevenLabs Stream Result] Streamed ${chunkCount} chunks, total ${totalBytes} bytes`);
});

test('ElevenLabsTtsProvider (Integration): warmUp() executes successfully without throwing', async () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
  });

  await provider.warmUp();
});

test('Config: Dual ElevenLabs voice IDs and voice turn-taking settings are properly loaded', () => {
  assert.equal(config.ELEVENLABS_VOICE_ID, '0CzBBZVHSe1kKQOUHVzq');
  assert.equal(config.ELEVENLABS_VOICE_ID_2, 'N9pacNE5zbJ3p2Zw6iuD');
  assert.equal(config.VAD_HANGOVER_MS, 1000);
  assert.equal(config.VOICE_MAX_OUTPUT_TOKENS, 40);
  assert.equal(config.VOICE_MIN_WORDS_THRESHOLD, 2);
});

test('ElevenLabsTtsProvider: seamlessly switches between Voice 1 and Voice 2', async () => {
  const provider = new ElevenLabsTtsProvider({
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
  });

  assert.equal(provider.getVoiceId(), '0CzBBZVHSe1kKQOUHVzq');

  // Switch to Voice 2
  provider.setVoiceId(config.ELEVENLABS_VOICE_ID_2);
  assert.equal(provider.getVoiceId(), 'N9pacNE5zbJ3p2Zw6iuD');
  assert.equal(provider.getVoiceName(), 'ElevenLabs (N9pacNE5zbJ3p2Zw6iuD)');

  // If live key is present, test audio generation with Voice 2
  if (config.ELEVENLABS_API_KEY) {
    try {
      const start = Date.now();
      const audio = await provider.synthesize('Hai, ini suara keduaku!');
      const dur = Date.now() - start;
      assert.ok(audio.length > 500);
      if (provider.getStreamType() === 'ogg/opus') {
        assert.equal(audio.subarray(0, 4).toString('utf8'), 'OggS');
      } else {
        assert.equal(audio.length % 4, 0);
      }
      console.log(`\n  [ElevenLabs Voice 2 Live Result] Synthesized ${audio.length} bytes in ${dur}ms with Voice 2 (N9pacNE5zbJ3p2Zw6iuD)`);
    } catch (err: any) {
      if (err.message.includes('paid_plan_required') || err.message.includes('402')) {
        console.warn(`\n  [Notice: ElevenLabs Tier Policy] Voice 2 (N9pacNE5zbJ3p2Zw6iuD) terdeteksi sebagai Voice Library yang membutuhkan akun Creator/Credit ElevenLabs.`);
        assert.ok(true, 'Handled ElevenLabs paid plan tier restriction');
      } else {
        throw err;
      }
    }
  }
});

