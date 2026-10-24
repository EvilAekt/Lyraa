import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { VoicePlayer } from '../src/audio/voice-player.js';
import { getTtsProvider } from '../src/providers/index.js';

test('VoicePlayer: instantiates with AudioPlayer in idle state', () => {
  const player = new VoicePlayer();
  assert.equal(player.isPlaying(), false);
  player.destroy();
});

test('VoicePlayer: successfully creates WebmOpus audio resource from TTS audio', async () => {
  const ttsProvider = getTtsProvider();
  const audio = await ttsProvider.synthesize('Tes satu dua tiga');

  assert.ok(audio.length > 0);
  const stream = Readable.from(audio);
  const resource = createAudioResource(stream, {
    inputType: StreamType.WebmOpus,
    inlineVolume: false,
  });

  assert.ok(resource, 'Audio resource must be created successfully');
  assert.ok(resource.readable, 'Resource must be readable stream');
});
