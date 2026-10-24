import { StreamType } from '@discordjs/voice';
import { VoicePlayer } from '../audio/voice-player.js';

async function run() {
  console.log('[Spike] Step 1: Querying VOICEVOX audio_query...');
  const qRes = await fetch('http://127.0.0.1:50021/audio_query?text=' + encodeURIComponent('こんにちは、テストです') + '&speaker=46', { method: 'POST' });
  if (!qRes.ok) throw new Error('audio_query failed: ' + qRes.statusText);
  const qJson = await qRes.json();

  console.log('[Spike] Step 2: Synthesizing WAV...');
  const sRes = await fetch('http://127.0.0.1:50021/synthesis?speaker=46', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(qJson),
  });
  if (!sRes.ok) throw new Error('synthesis failed: ' + sRes.statusText);
  const wavBuf = Buffer.from(await sRes.arrayBuffer());
  console.log('[Spike] Got WAV buffer size:', wavBuf.length);

  // 3. Resample 24kHz mono PCM -> 48kHz stereo PCM
  // WAV header is 44 bytes
  const pcm24k = wavBuf.subarray(44);
  const numSamples = Math.floor(pcm24k.length / 2);
  const pcm48k = Buffer.alloc(numSamples * 8);

  for (let i = 0; i < numSamples; i++) {
    const s0 = pcm24k.readInt16LE(i * 2);
    const s1 = i < numSamples - 1 ? pcm24k.readInt16LE((i + 1) * 2) : s0;
    const mid = Math.round((s0 + s1) / 2);

    const outOffset = i * 8;
    pcm48k.writeInt16LE(s0, outOffset);
    pcm48k.writeInt16LE(s0, outOffset + 2);
    pcm48k.writeInt16LE(mid, outOffset + 4);
    pcm48k.writeInt16LE(mid, outOffset + 6);
  }

  console.log('[Spike] Resampled 48kHz stereo PCM buffer size:', pcm48k.length);

  const player = new VoicePlayer();
  console.log('[Spike] Enqueuing to VoicePlayer as StreamType.Raw...');
  const start = Date.now();
  await player.enqueue(pcm48k, StreamType.Raw);
  console.log(`[Spike] VoicePlayer finished playback successfully in ${Date.now() - start} ms!`);
  player.destroy();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Spike] Error:', err);
    process.exit(1);
  });
