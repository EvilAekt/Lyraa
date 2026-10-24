# Keputusan & Verifikasi Task T1.3: Jalur TTS dan Pemutaran Suara

- **ID Task**: `T1.3 Jalur TTS dan Pemutaran Suara`
- **Fase**: `Fase 1: Loop Suara MVP`
- **Tanggal Verifikasi**: 21 Oktober 2026
- **Status Akhir**: `[TERVERIFIKASI]` — **SELESAI**

---

## 1. Komponen yang Diimplementasikan

| Komponen | Berkas | Deskripsi & Desain |
|---|---|---|
| **TTS Interface** | [src/providers/tts-provider.ts](file:///g:/bot-ai/src/providers/tts-provider.ts) | Abstraksi modular `TtsProvider` untuk sintesis audio buffer ucapan. |
| **Edge TTS Provider** | [src/providers/edge/edge-tts.ts](file:///g:/bot-ai/src/providers/edge/edge-tts.ts) | Provider sintesis suara Microsoft Edge Neural (`@kirillasyamov/text-to-speech`), menggunakan suara VTuber ramah `id-ID-GadisNeural` dengan format native `webm-24khz-16bit-mono-opus`. |
| **Voice Player** | [src/audio/voice-player.ts](file:///g:/bot-ai/src/audio/voice-player.ts) | Wrapper `AudioPlayer` (@discordjs/voice) yang memutar WebM Opus langsung via `WebmDemuxer` bawaan prism-media tanpa butuh instalasi executable `ffmpeg.exe` eksternal. |
| **Testing Harness** | [tests/edge-tts.test.ts](file:///g:/bot-ai/tests/edge-tts.test.ts)<br>[tests/voice-player.test.ts](file:///g:/bot-ai/tests/voice-player.test.ts) | Verifikasi sintesis WebM Opus dan pemutaran audio resource. |
| **Integrasi Runtime** | [src/index.ts](file:///g:/bot-ai/src/index.ts) | Integrasi perintah `/speak`, `!speak`, dan penyambungan loop suara end-to-end (STT $\rightarrow$ LLM $\rightarrow$ Sentence Chunker $\rightarrow$ TTS $\rightarrow$ Voice Output). |

---

## 2. Hasil Pengujian Empiris

### A. Uji Sintesis Edge TTS (`tests/edge-tts.test.ts`)
- **Teks Uji**: `"Halo semuanya, aku Lyra!"`
- **Voice**: `id-ID-GadisNeural`
- **Ukuran Audio**: 21.901 bytes
- **Header Magic Bytes**: `1a45dfa3` (Valid WebM EBML header)
- **Durasi Sintesis**: **766ms - 838ms** (Target PRD: <2.500ms, terpenuhi dengan margin sangat besar).

### B. Uji Voice Player Resource (`tests/voice-player.test.ts`)
- Pembuatan resource `StreamType.WebmOpus` dari audio buffer TTS: **Lolos (652ms)**.
- `AudioPlayer` status `Idle` dan transisi state berjalan normal tanpa galat decoder.

### C. Ringkasan Uji Unit
```
✔ EdgeTtsProvider: initializes with Indonesian GadisNeural voice by default (0.6346ms)
✔ EdgeTtsProvider: synthesizes natural Indonesian speech in WebmOpus format under 2s (838.2495ms)
✔ VoicePlayer: instantiates with AudioPlayer in idle state (2.148ms)
✔ VoicePlayer: successfully creates WebmOpus audio resource from TTS audio (652.6828ms)
ℹ tests 4, pass 4, fail 0
```

---

## 3. Fitur Interaksi Voice Baru

1. **Perintah `/speak <teks>` & `!speak <teks>`**:
   - Memungkinkan pengujian suara langsung tanpa harus berbicara di mic.
   - Lyra menyuarakan teks yang diberikan secara langsung di voice channel pengguna.
2. **Loop Suara End-to-End (Pipeline A)**:
   - Pengguna berbicara di voice channel $\rightarrow$ Discord receiver (DAVE E2EE) $\rightarrow$ Opus Decoder $\rightarrow$ Gemini STT (`gemini-3.5-flash-lite`) $\rightarrow$ Gemini LLM Stream (`gemini-3.5-flash-lite`) $\rightarrow$ Sentence Chunker (<8 kata) $\rightarrow$ Edge TTS (`id-ID-GadisNeural`) $\rightarrow$ `VoicePlayer` memutar suara Lyra secara langsung ke voice channel.
   - Dilengkapi proteksi anti self-loop (`userId === client.user?.id`) agar bot tidak mendengar dan mentranskripsi suaranya sendiri.
