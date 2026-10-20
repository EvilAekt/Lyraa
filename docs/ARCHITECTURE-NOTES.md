# ARCHITECTURE-NOTES.md: Pemetaan Repositori AIRI (Task T0.2)

Tanggal: 21 Oktober 2026  
Status: Selesai (Task T0.1 & T0.2)  
Basis Kode: Fork `https://github.com/EvilAekt/airi` (upstream: `moeru-ai/airi`)

---

## 1. Pemetaan Komponen (Poin a sampai k)

| Poin | Komponen | Path File Nyata / Temuan | Keterangan & Detail |
| :--- | :--- | :--- | :--- |
| **(a)** | **Service / Folder Bot Discord** | `airi/integrations/discord-bot/` | Entrypoint di `src/index.ts`, adapter di `src/adapters/airi-adapter.ts`. |
| **(b)** | **Masuk Voice & Tangkap Audio** | `airi/integrations/discord-bot/src/bots/discord/commands/summon.ts` | • Masuk voice: `joinChannel()` (L165–221) via `joinVoiceChannel` dari `@discordjs/voice`.<br>• Tangkap audio: `handleAudioReceiveStreamStart()` (L136) & `monitorMember()` (L239–252) via `connection.receiver.subscribe(userId, { autoDestroy: true, emitClose: true })`. |
| **(c)** | **VAD & Endpointing** | `airi/integrations/discord-bot/src/utils/audio-monitor.ts`<br>`airi/integrations/discord-bot/src/bots/discord/commands/summon.ts` | • VAD audio stream: `AudioMonitor` (deteksi speaking started/stopped).<br>• Endpointing: `debouncedProcessTranscription` (L359–397) dengan jeda diam `DEBOUNCE_TRANSCRIPTION_THRESHOLD = 1500` ms.<br>• Deteksi volume & barge-in: `dataHandler` (L259–282) dengan `SPEAKING_THRESHOLD = 0.05`. |
| **(d)** | **STT (Speech-to-Text)** | `airi/integrations/discord-bot/src/pipelines/tts.ts`<br>`airi/integrations/discord-bot/src/bots/discord/commands/summon.ts` | • File bernama `tts.ts` tetapi isinya fungsi transkripsi STT: `transcribe()` (Whisper lokal via `@huggingface/transformers`) dan `openaiTranscribe()` (OpenAI-compatible via `@xsai/generate-transcription`).<br>• Dipanggil di `summon.ts` (L468). |
| **(e)** | **Pemanggilan LLM** | **TIDAK DITEMUKAN** di dalam `integrations/discord-bot` | Bot Discord AIRI **tidak memanggil LLM secara mandiri**. Bot mengirim event WebSocket `input:text` / `input:text:voice` ke server runtime AIRI (`airiClient.send(...)`). Pemanggilan model LLM dipusatkan di server runtime (`server/apps/api`). |
| **(f)** | **TTS (Text-to-Speech)** | **TIDAK DITEMUKAN** di dalam `integrations/discord-bot` | Tidak ada sintesis audio TTS di dalam modul `discord-bot`. Paket TTS AIRI berada di packages terpisah (`packages/provider-inference/src/providers/cloud/google-gemini-audio-speech`, `elevenlabs`). |
| **(g)** | **Pemutaran Audio** | `airi/integrations/discord-bot/src/bots/discord/commands/summon.ts` (L504–535) | Fungsi `playAudioStream(userId, audioStream)` menggunakan `createAudioPlayer` & `createAudioResource` dari `@discordjs/voice` telah dibuat, **TETAPI TIDAK PERNAH DIPANGGIL** di mana pun di dalam `discord-bot`. Respons dari AIRI saat ini hanya dikirim dalam bentuk chat teks (`airi-adapter.ts` L159–200). |
| **(h)** | **Konfigurasi Provider (Nama Env Sebenarnya)** | `airi/integrations/discord-bot/.env` | • Discord: `DISCORD_TOKEN`, `DISCORD_BOT_CLIENT_ID`<br>• LLM/OpenAI: `OPENAI_MODEL`, `OPENAI_API_BASE_URL`, `OPENAI_API_KEY`<br>• STT: `OPENAI_STT_API_BASE_URL`, `OPENAI_STT_API_KEY`, `OPENAI_STT_MODEL`<br>• ElevenLabs: `ELEVENLABS_API_KEY`, `ELEVENLABS_API_BASE_URL`<br>• AIRI Runtime: `AIRI_TOKEN`, `AIRI_URL` (default `ws://localhost:6121/ws`) |
| **(i)** | **Ketergantungan Server Runtime / Avatar** | `airi/integrations/discord-bot/src/index.ts`<br>`airi/integrations/discord-bot/src/adapters/airi-adapter.ts` | • **Server Runtime**: **YA, BUTUH**. Klien bot secara wajib melakukan koneksi WebSocket ke runtime AIRI (`ws://localhost:6121/ws`). Tanpa runtime, bot tidak bisa memproses balasan AI.<br>• **Stage / Avatar**: **TIDAK BUTUH**. Bot dapat berjalan headless tanpa membuka frontend visual 3D/2D. |
| **(j)** | **Versi library Voice & Status DAVE** | `airi/pnpm-workspace.yaml`<br>`airi/integrations/discord-bot/package.json` | • `discord.js`: `^14.27.0`<br>• `@discordjs/voice`: `^0.19.2`<br>• `@snazzah/davey`: `^0.1.12` **[TERVERIFIKASI ADA]**. |
| **(k)** | **Dukungan Gemini & ElevenLabs** | Di `integrations/discord-bot`: Gemini **TIDAK DITEMUKAN**; ElevenLabs ada di env tapi tidak dipanggil.<br>Di monorepo AIRI: **ADA** di `packages/provider-inference/src/providers/cloud/google-generative-ai`, `google-gemini-audio-speech`, dan `elevenlabs`. |

---

## 2. Diagram Alur Data Eksisting AIRI vs Target Proyek

### Alur Eksisting di `airi/integrations/discord-bot`:
```
Discord Voice (DAVE UDP)
       │  Opus per pengguna
       ▼
[summon.ts] receiver.subscribe()
       │
       ▼ OpusDecoder (48kHz, mono)
[AudioMonitor.ts] VAD (1500ms hangover)
       │  PCM -> WAV
       ▼
[tts.ts] openaiTranscribe() / Whisper
       │  Teks hasil transkripsi
       ▼
[airi-adapter.ts] airiClient.send('input:text')
       │
       ▼ WebSocket (ws://localhost:6121/ws)
======================================================
[AIRI Server Runtime] (Harus berjalan terpisah)
       │  Orchestration, Persona, LLM
       ▼
[airi-adapter.ts] onEvent('output:gen-ai:chat:message')
       │
       ▼ (Hanya teks!)
Discord Text Channel (channel.send) ◄── [BELUM ADA TTS KE VOICE!]
```

### Kesimpulan Kritis untuk Proyek Kita:
1. Kode `integrations/discord-bot` di AIRI **belum memiliki loop suara penuh**: bot bisa mendengar suara dan mentranskripsi (STT), tetapi responnya dikembalikan ke teks, dan fungsi `playAudioStream` belum dihubungkan ke TTS!
2. Bot bawaan AIRI bergantung erat pada WebSocket server runtime monorepo AIRI (`ws://localhost:6121/ws`).
3. Sesuai opsi di **ADR-001 (T0.6)** pada PRD: Merakit bot langsung di repo mandiri kita (mengambil modul receiver DAVE, opus decoder, dan menyambungkannya langsung ke streaming Gemini LLM + TTS tanpa overhead monorepo server AIRI) akan jauh lebih ringan, cepat, dan stabil untuk mencapai target latensi p50 ≤ 2.0s.

---

## 3. Jawaban Tegas: Bisakah Bot Berjalan Tanpa Stage atau Avatar?

**JAWABAN: BISA.**  
Bot Discord adalah proses Node.js murni di terminal (`integrations/discord-bot`). Ia sama sekali tidak membutuhkan browser, stage 3D VRM, Electron, atau Live2D untuk berjalan. Namun, jika memakai basis kode AIRI apa adanya, ia **membutuhkan server runtime WebSocket AIRI (`@proj-airi/server-runtime`)** tetap aktif di latar belakang.
