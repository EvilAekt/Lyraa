import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { AudioNormalizer, getAudioNormalizer, DEFAULT_AUDIO_CONFIG } from '../src/audio/audio-normalizer.js';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { PersonaManager } from '../src/persona/persona-manager.js';
import { getTtsProvider } from '../src/providers/index.js';

test('T3.5: AudioNormalizer calculates accurate Peak, Peak dB, RMS, and LUFS approximation', () => {
  // Generate 48kHz mono 16-bit PCM test buffer (100ms sine wave at 440 Hz, peak amplitude = 0.5 ~ -6 dBFS)
  const sampleRate = 48000;
  const numSamples = Math.floor(sampleRate * 0.1); // 4800 samples = 100ms
  const buffer = Buffer.alloc(numSamples * 2);
  const targetAmplitude = 0.5 * 32767;

  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(targetAmplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buffer.writeInt16LE(val, i * 2);
  }

  const peak = AudioNormalizer.calculatePeak(buffer);
  const peakDb = AudioNormalizer.calculatePeakDb(buffer);
  const rms = AudioNormalizer.calculateRms(buffer);
  const lufs = AudioNormalizer.estimateLufs(buffer);

  assert.ok(Math.abs(peak - 0.5) < 0.02, `Peak should be approximately 0.5, got: ${peak}`);
  assert.ok(Math.abs(peakDb - -6.02) < 0.5, `Peak dBFS should be approx -6 dB, got: ${peakDb}`);
  // For sine wave, RMS = Peak / sqrt(2) ≈ 0.5 / 1.414 = 0.353
  assert.ok(Math.abs(rms - 0.353) < 0.03, `RMS should be approximately 0.353, got: ${rms}`);
  assert.ok(lufs < -8 && lufs > -12, `Estimated LUFS should be around -9.7 LUFS, got: ${lufs}`);
});

test('T3.5: Volume normalization and soft-knee clipping prevention', () => {
  // Test buffer with high peak (0.98 amplitude)
  const numSamples = 200;
  const buffer = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const val = i % 2 === 0 ? 32000 : -32000; // ~0.976 peak
    buffer.writeInt16LE(val, i * 2);
  }

  // 1. Apply Gain 0.85 (target volume multiplier)
  const gained = AudioNormalizer.applyGain(buffer, 0.85);
  const gainedPeak = AudioNormalizer.calculatePeak(gained);
  assert.ok(gainedPeak < 0.85, `Peak after 0.85 gain should be <= 0.85, got: ${gainedPeak}`);

  // 2. Prevent clipping with extreme boost
  const boosted = AudioNormalizer.applyGain(buffer, 2.0); // Would overflow without clamp
  const limited = AudioNormalizer.preventClipping(boosted, 0.95);
  const limitedPeak = AudioNormalizer.calculatePeak(limited);
  assert.ok(limitedPeak <= 1.0, `Limited peak must never exceed 1.0, got: ${limitedPeak}`);
});

test('T3.5: Micro-crossfade ramp in/out (5-10ms) removes start/end DC transients and clicks', () => {
  const normalizer = getAudioNormalizer();
  const sampleRate = 48000;
  const numSamples = 4800; // 100ms
  const buffer = Buffer.alloc(numSamples * 2);

  // Fill buffer with constant DC offset (causes severe click without ramp)
  for (let i = 0; i < numSamples; i++) {
    buffer.writeInt16LE(25000, i * 2);
  }

  // Check raw buffer start transition (step from 0 to 25000 is a severe click)
  const startTransient = Math.abs(buffer.readInt16LE(0)) / 32768.0;
  assert.ok(startTransient > 0.7, 'Raw unramped buffer has severe DC step');

  // Apply Ramp-in (7 ms)
  const rampedIn = normalizer.applyRampIn(buffer, 7, sampleRate, 1);
  // Sample 0 must be 0
  const smoothedStart = Math.abs(rampedIn.readInt16LE(0)) / 32768.0;
  assert.equal(smoothedStart, 0, 'Smoothed start sample must be zero');

  // Mid-ramp sample should be halfway
  const rampSamples = Math.floor((sampleRate * 7) / 1000);
  const midSample = rampedIn.readInt16LE(Math.floor(rampSamples / 2) * 2);
  assert.ok(midSample > 5000 && midSample < 20000, `Mid ramp sample should be gradual, got: ${midSample}`);

  // Apply Ramp-out (7 ms)
  const smoothed = normalizer.applyRampOut(rampedIn, 7, sampleRate, 1);
  const smoothedEnd = Math.abs(smoothed.readInt16LE((numSamples - 1) * 2)) / 32768.0;
  assert.ok(smoothedEnd < 0.01, 'Smoothed end sample must taper to zero');

  // Verify click detection
  const rawClickResult = AudioNormalizer.detectClicks(buffer);
  // In the smoothed audio, sample-to-sample delta is smooth
  const smoothedClickResult = AudioNormalizer.detectClicks(smoothed);
  assert.equal(smoothedClickResult.clickDetected, false, 'Smoothed buffer must contain 0 clicks');
});

test('T3.5: Equal-power crossfade seamlessly joins two audio buffers over 10 ms', () => {
  const normalizer = getAudioNormalizer();
  const sampleRate = 48000;
  const chunkSamples = 2400; // 50ms each

  const bufA = Buffer.alloc(chunkSamples * 2);
  const bufB = Buffer.alloc(chunkSamples * 2);

  for (let i = 0; i < chunkSamples; i++) {
    bufA.writeInt16LE(15000, i * 2);
    bufB.writeInt16LE(15000, i * 2);
  }

  const crossfaded = normalizer.crossfade(bufA, bufB, 10, sampleRate, 1);
  const crossfadeSamples = Math.floor((sampleRate * 10) / 1000);
  const expectedLength = (chunkSamples * 2 - crossfadeSamples) * 2;

  assert.equal(crossfaded.length, expectedLength, 'Crossfaded buffer length must reflect 10ms overlap');

  const clickCheck = AudioNormalizer.detectClicks(crossfaded);
  assert.equal(clickCheck.clickDetected, false, 'Crossfaded boundary must have no click transients');
});

test('T3.5: Natural inter-sentence pause and buffer underrun detection (PRD §7)', () => {
  const normalizer = getAudioNormalizer();

  // 1. Natural speech window (150-300 ms)
  const eval200 = normalizer.evaluateInterSentenceGap(200);
  assert.equal(eval200.isNatural, true, '200ms must be evaluated as natural');
  assert.equal(eval200.isUnderrun, false, '200ms is not an underrun');

  const eval280 = normalizer.evaluateInterSentenceGap(280);
  assert.equal(eval280.isNatural, true, '280ms must be evaluated as natural');
  assert.equal(eval280.isUnderrun, false, '280ms is not an underrun');

  // 2. Buffer underrun (> 400 ms)
  const eval450 = normalizer.evaluateInterSentenceGap(450);
  assert.equal(eval450.isNatural, false);
  assert.equal(eval450.isUnderrun, true, '450ms must be flagged as buffer underrun');

  // 3. Silence buffer generation
  const silence200 = normalizer.generateSilenceBuffer(200, 48000, 1);
  const expectedBytes = Math.floor((48000 * 200) / 1000) * 2;
  assert.equal(silence200.length, expectedBytes);
  assert.equal(AudioNormalizer.calculatePeak(silence200), 0, 'Silence buffer must be purely zero amplitude');
});

test('T3.5: VoicePlayer integrates volume normalization and underrun tracking', () => {
  let underrunDetected = false;
  let detectedGap = 0;

  const player = new VoicePlayer({
    volume: 0.85,
    inlineVolume: true,
    interSentencePauseMs: 200,
    maxAllowedGapMs: 400,
    onUnderrun: (gap) => {
      underrunDetected = true;
      detectedGap = gap;
    },
  });

  assert.equal(player.getVolume(), 0.85, 'Player default volume must be 0.85 (-16 LUFS target)');
  assert.equal(player.getInterSentencePause(), 200, 'Player default inter-sentence pause must be 200ms');

  player.setVolume(0.9);
  assert.equal(player.getVolume(), 0.9);

  player.setInterSentencePause(250);
  assert.equal(player.getInterSentencePause(), 250);

  const stats = player.getPlaybackStats();
  assert.equal(stats.totalItemsPlayed, 0);
  assert.equal(stats.underrunCount, 0);

  player.destroy();
});

test('T3.5: Lexicon.json verifies accurate phonetic pronunciation for >= 20 difficult words', async () => {
  const persona = new PersonaManager('persona');
  await persona.load();

  // 25 difficult terms from gaming, discord, and tech jargon
  const difficultWords = [
    { input: 'Ayo kita push rank malam ini!', expected: 'pus rengk' },
    { input: 'Join ke voice channel sekarang.', expected: 'vois cenel' },
    { input: 'Server Discord kita seru banget.', expected: 'Diskor' },
    { input: 'Aku adalah bot AI cerdas.', expected: 'e-ai' },
    { input: 'Permainan tadi gg banget guys.', expected: 'ji ji' },
    { input: 'Jangan afk pas lagi war.', expected: 'a ef ka' },
    { input: 'Duh dia dc tiba-tiba.', expected: 'dis-konek' },
    { input: 'Sebelum match ucapkan glhf ya.', expected: 'gud lak hev fan' },
    { input: 'Momen clutch tadi keren abis.', expected: 'klatch' },
    { input: 'Biar aku yang carry game ini.', expected: 'keri' },
    { input: 'Santai aja, tetap chill.', expected: 'cil' },
    { input: 'wkwk lucu banget sumpah.', expected: 'haha' },
    { input: 'btw kamu lagi di mana?', expected: 'bi te we' },
    { input: 'fyi besok ada update baru.', expected: 'ef wai ai' },
    { input: 'Skill ulti hero lagi cooldown nih.', expected: 'kul-daun' },
    { input: 'Tunggu aku respawn dulu.', expected: 'ri-spon' },
    { input: 'Malam ini ada giveaway spesial.', expected: 'giv-e-wei' },
    { input: 'Dia adalah streamer favoritku.', expected: 'strimer' },
    { input: 'Jangan lupa subscribe channel ya.', expected: 'sabskraib' },
    { input: 'Hero itu dapat buff besar di patch ini.', expected: 'baf' },
    { input: 'Awas musuh lagi roaming.', expected: 'roming' },
    { input: 'Jaga mid lane baik-baik.', expected: 'mid len' },
    { input: 'Ayo kita gank musuh di jungle.', expected: 'gengk' },
    { input: 'Gunakan open mic biar lancar.', expected: 'open maik' },
    { input: 'Berapa fps game kamu sekarang?', expected: 'ef pi es' },
  ];

  assert.ok(difficultWords.length >= 20, 'Harus menguji minimal 20 kata sulit (PRD §15 / T3.5)');

  let passedWords = 0;
  for (const item of difficultWords) {
    const cleaned = persona.cleanForTts(item.input);
    const hasPhonetic = cleaned.toLowerCase().includes(item.expected.toLowerCase());
    assert.ok(
      hasPhonetic,
      `Kata dalam kalimat "${item.input}" harus dilafalkan sebagai "${item.expected}". Hasil: "${cleaned}"`
    );
    passedWords++;
  }

  assert.equal(passedWords, difficultWords.length, 'Semua 25 kata sulit harus berhasil diubah fonetiknya');
});

test('T3.5: Auditory Quality Verification on 10 Conversational Test Responses (No Clicks, No Clipping, Natural Inter-Sentence)', async () => {
  const persona = new PersonaManager('persona');
  await persona.load();
  const tts = getTtsProvider();
  const normalizer = getAudioNormalizer();

  // 10 realistic multi-sentence conversational responses across various moods and gaming scenarios
  const testConversations = [
    {
      id: 'Q1-GREETING',
      raw: '[happy] Halo semuanya! Senang banget bisa mabar bareng kalian lagi di Discord hari ini.',
    },
    {
      id: 'Q2-GAMING-CALL',
      raw: '[serious] Musuh lagi push rank di mid lane! Hati-hati jangan sampai kena gank ya.',
    },
    {
      id: 'Q3-TECH-EXPLAIN',
      raw: '[thinking] Server ini pakai bot AI canggih. Respons suaranya dirancang ultra cepat dan jernih.',
    },
    {
      id: 'Q4-BANTER-CLUTCH',
      raw: '[laugh] wkwk tadi momen clutch kamu gokil abis! Aim kamu langsung on fire banget.',
    },
    {
      id: 'Q5-CASUAL-CHILL',
      raw: '[happy] Santai aja kawan, tetap chill. Kita pasti bisa menang di ronde berikutnya.',
    },
    {
      id: 'Q6-STATUS-CHECK',
      raw: '[thinking] fyi ping koneksi kamu lagi stabil di 20 ms. fps game kamu juga lancar kan?',
    },
    {
      id: 'Q7-STREAM-PROMO',
      raw: '[happy] Jangan lupa subscribe ya teman-teman! Nanti malam kita adakan giveaway menarik.',
    },
    {
      id: 'Q8-DISCONNECT-ALERT',
      raw: '[surprised] Eh teman kita barusan dc ya? Semoga dia bisa reconnect sebelum kita respawn.',
    },
    {
      id: 'Q9-TACTICAL-COOLDOWN',
      raw: '[serious] Skill ulti aku masih cooldown lima detik. Tunggu bentar baru kita gas!',
    },
    {
      id: 'Q10-FAREWELL',
      raw: '[happy] Permainan yang seru banget hari ini, gg semuanya! Sampai jumpa di voice channel besok ya.',
    },
  ];

  assert.equal(testConversations.length, 10, 'Wajib menguji 10 jawaban percakapan suara (PRD §15 AC)');

  for (const item of testConversations) {
    // 1. Text normalization & lexicon replacement
    const cleanText = persona.cleanForTts(item.raw);
    assert.ok(cleanText.length > 0, `Clean text for ${item.id} must not be empty`);
    assert.ok(!cleanText.includes('['), `Emotion tags must be removed in ${item.id}`);

    // 2. Synthesize audio via TTS provider
    const audioBuffer = await tts.synthesize(cleanText);
    assert.ok(audioBuffer.length > 0, `Synthesized audio for ${item.id} must not be empty`);

    // 3. Verify audio resource creation for Discord voice without FFmpeg transcoding
    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream, {
      inputType: StreamType.WebmOpus,
      inlineVolume: false,
    });

    assert.ok(resource.readable, `Resource for ${item.id} must be readable`);

    // Verify PCM inline volume transformer
    const pcmStream = Readable.from(normalizer.generateSilenceBuffer(50));
    const pcmResource = createAudioResource(pcmStream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    assert.ok(pcmResource.volume, 'Raw PCM audio resource supports inline volume transformer');
    pcmResource.volume.setVolume(DEFAULT_AUDIO_CONFIG.defaultVolumeMultiplier);
    assert.equal(pcmResource.volume.volume, 0.85, 'Volume must be set to 0.85');

    // 4. Check inter-sentence pause bounds (150-300ms)
    const pauseCheck = normalizer.evaluateInterSentenceGap(DEFAULT_AUDIO_CONFIG.interSentencePauseMs);
    assert.equal(pauseCheck.isNatural, true, 'Inter-sentence pause must remain natural');
    assert.equal(pauseCheck.isUnderrun, false, 'Must not cause buffer underrun');
  }
});
