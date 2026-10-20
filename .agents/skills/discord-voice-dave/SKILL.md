---
name: discord-voice-dave
description: >-
  Use this skill when implementing, debugging, or verifying Discord voice connections with DAVE E2EE protocol, audio receiver streams, VAD endpointing, and barge-in interruption.
---

# Discord Voice with DAVE Protocol

This skill provides verified implementation recipes for Discord voice with End-to-End Encryption (DAVE) and duplex voice streaming.

## 1. Key Libraries and Dependencies

- `@discordjs/voice`: Official voice library for Discord.js.
- `@snazzah/davey`: DAVE protocol native library required for Discord E2EE voice encryption.
- `prism-media`: Opus decoding/encoding and audio conversion pipelines.

## 2. Joining Voice Channel with DAVE Handshake

```typescript
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} from '@discordjs/voice';

export async function connectToVoice(channel: any) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // Await ready state with DAVE handshake
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  return connection;
}
```

## 3. Audio Receiving (Per-User Stream)

```typescript
import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';

export function listenToUser(connection: any, userId: string, onAudioEnd: (pcmBuffer: Buffer) => void) {
  const receiver = connection.receiver;
  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 500, // VAD hangover ms
    },
  });

  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const chunks: Buffer[] = [];

  opusStream.pipe(decoder);

  decoder.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  decoder.on('end', () => {
    const fullPcm = Buffer.concat(chunks);
    onAudioEnd(fullPcm);
  });
}
```

## 4. Barge-In Interruption Handling

1. Monitor receiver audio packets while `audioPlayer.state.status === AudioPlayerStatus.Playing`.
2. Upon user voice packet arrival:
   - Call `audioPlayer.stop(true)`.
   - Abort current LLM & TTS pipeline controllers: `abortController.abort()`.
   - Clear pending audio queue within ≤ 300ms.
   - Record barge-in event in telemetry logs.
