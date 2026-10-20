# Rule: Voice Pipeline and Latency Engineering

## 1. DAVE E2EE Compliance
- Discord Voice Gateway uses DAVE (Discord Audio/Video End-to-End Encryption).
- Ensure voice connections are established using `@discordjs/voice` with DAVE support (`@snazzah/davey`).
- Never disable voice encryption or use deprecated unencrypted protocols.
- Watch logs for close code `4017` or decryption errors; handle automatic reconnect with backoff.

## 2. End-to-End Streaming
- Never wait for full LLM generation before beginning TTS.
- Stream LLM tokens into sentence chunkers.
- Chunker delivers sentence to TTS as soon as punctuation (`.`, `!`, `?`, `\n`) is encountered.
- Sentence 1 optimization: Limit the first sentence to ≤ 8 words so TTS audio generation can start immediately.

## 3. Latency Timestamp Logging
Every conversation turn MUST record 6 timestamps:
- `t0`: User finished speaking (VAD endpoint)
- `t1`: STT transcript available
- `t2`: First LLM token arrived
- `t3`: First sentence chunk delivered to TTS
- `t4`: First TTS audio chunk received
- `t5`: First Opus packet sent to Discord UDP socket

Latency = `t5 - t0`. Log in structured JSON format. Maintain running p50 and p95 metrics.

## 4. Barge-In & Cancellation
- If user starts speaking while the bot is outputting voice:
  - Stop playback within ≤ 300 ms.
  - Abort ongoing LLM request (`AbortController`).
  - Abort ongoing TTS stream.
  - Clear pending audio playback buffers.
- Never consider the bot's own audio stream as barge-in.
