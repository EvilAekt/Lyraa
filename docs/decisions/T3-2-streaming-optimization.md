# Keputusan & Verifikasi Task T3.2: Streaming per Kalimat dan Optimasi Latensi

- **Task ID**: T3.2 (Fase 3: Latensi dan Suara)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §5 (Anggaran Latensi Pipeline A), PRD §15 (Task T3.2), TC-04 (Jawaban Suara), `docs/perf/optimized-t3-2.md`, `docs/perf/baseline.md`

---

## 1. Konteks & Tujuan

Task T3.2 bertujuan mengoptimasi jalur pipa suara (*voice pipeline*) end-to-end agar latensi total dari akhir ucapan pengguna (`t0`) hingga paket audio bot pertama terkirim (`t5`) semakin cepat dan stabil jauh di bawah target batas PRD §5 (`p50 ≤ 2.0s`, `p95 ≤ 3.5s`), tanpa adanya suara terputus (*underrun*) atau *stuttering* antarkalimat.

Kriteria Penerimaan (Acceptance Criteria):
1. **Streaming per kalimat**: Mengintegrasikan sentence chunker langsung ke TTS streaming secara concurrent/pipelined tanpa menunggu keseluruhan jawaban LLM selesai.
2. **HTTP Keep-Alive Connection Pool**: Mengonfigurasi pooling koneksi HTTP/HTTPS dan WebSocket untuk memangkas penalti jabat tangan TLS/TCP 150-250ms pada setiap giliran.
3. **Pre-warming Connection saat /join**: Memanaskan pool WebSocket TTS dan sesi TLS Google API saat bot bergabung ke channel suara.
4. **Caching Frasa Umum**: Mem-preload frasa umum persona ("Halo!", "Sebentar ya...", "Iya ada apa?") ke RAM buffer untuk respons instan (< 300 ms).
5. **Context Caching Evaluation**: Evaluasi batas minimum token Google Gemini Context Caching dan identifikasi implicit prompt caching native pada Gemini 2.5/3.5.
6. **Verifikasi Ulang Benchmark**: Menjalankan kembali 30 putaran benchmark latensi untuk memvalidasi penurunan angka dibanding baseline T3.1.

---

## 2. Implementasi Teknis

### A. HTTP Keep-Alive & Connection Pooling (`src/config/http-pool.ts`)
- Mengonfigurasi Undici `Agent` global (`setGlobalDispatcher`) dengan `keepAliveTimeout: 60_000ms`, `maxSockets: 64`, dan `pipelining: 1`.
- Menghilangkan *TLS handshake round-trip* pada panggilan API berulang ke endpoint Google Gen AI.

### B. Persistent Connection & Streaming TTS (`src/providers/edge/edge-tts.ts`)
- Menggunakan instance `TextToSpeech` persisten dengan internal `EdgePool` WebSocket keep-alive.
- Menyediakan metode `warmUp()` yang memicu `preload()` / `edge.warm()`.
- Menyediakan `synthesizeStream(text, options)` yang menyalurkan chunk audio WebM Opus progresif dari stream WebSocket.

### C. Common Phrase Audio Memory Cache (`src/audio/phrase-audio-cache.ts`)
- Menyimpan buffer audio WebM Opus yang telah disintesis di RAM untuk 10 frasa umum persona ("Halo!", "Sebentar ya...", "Iya ada apa?", "Siap!", dsb.).
- Pencarian cepat ter-normalisasi (*case & punctuation insensitive*).
- Menghasilkan respon suara instan (< 10 ms), jauh di bawah target PRD < 300 ms.

### D. Streaming Voice Pipeline (`src/audio/streaming-voice-pipeline.ts`)
- Menggantikan perulangan sekuensial yang saling memblokir dengan arsitektur pipa asinkron (*overlapped producer-consumer*):
  - **Producer**: LLM streaming dipecah oleh `chunkSentences` menjadi kalimat-kalimat (kalimat pertama ≤ 8 kata).
  - **Consumer**: Sintesis kalimat 1 langsung dikirim ke `VoicePlayer` (mulai diputar ke Discord), sementara LLM terus memproduksi kalimat 2 dan kalimat 2 langsung disintesis di latar belakang saat kalimat 1 sedang diputar!
  - Mendukung pembatalan instan (*barge-in interruption*) lewat `AbortSignal`.

### E. Evaluasi Gemini Context Caching (`src/providers/gemini/context-cache.ts`)
- Memvalidasi batas minimum Explicit Context Caching Google Gen AI (32.768 token).
- Mengonfirmasi bahwa model `gemini-2.5` dan `gemini-3.5` secara native mengaktifkan **Implicit Caching** untuk prompt berulang tanpa memungut biaya storage eksplisit.
- Menyediakan metode `preWarmConnection()` yang mengirimkan ping token count mikro saat bot bergabung ke channel suara (`/join`).

---

## 3. Hasil Pengujian Benchmark & Komparasi

Dari pengujian 30 putaran penuh pada [docs/perf/optimized-t3-2.md](file:///g:/bot-ai/docs/perf/optimized-t3-2.md) dibandingkan dengan [docs/perf/baseline.md](file:///g:/bot-ai/docs/perf/baseline.md):

### A. Perbandingan Total Latensi Voice-to-Voice (`t0 -> t5`)

| Metrik | T3.1 Baseline | T3.2 Teroptimasi | Selisih / Perubahan | Target PRD §5 | Status |
|---|---|---|---|---|---|
| **p50 (Median)** | **1.396 ms** | **1.331 ms** | **-65 ms (4.7% lebih cepat)** | ≤ 2.000 ms | ✅ LULUS |
| **p95** | **1.916 ms** | **1.782 ms** | **-134 ms (7.0% lebih cepat)** | ≤ 3.500 ms | ✅ LULUS |
| **Rata-rata (Avg)** | **1.430 ms** | **1.357 ms** | **-73 ms (5.1% lebih cepat)** | - | Stabil |
| **Minimum** | **1.013 ms** | **699 ms** | **-314 ms (Cache hit effect)** | - | Best case |

### B. Perbandingan Breakdown per Tahap (p50)

| Tahap | Indikator | Baseline T3.1 | Teroptimasi T3.2 | Efek Optimasi |
|---|---|---|---|---|
| **STT** | `t0 -> t1` | 401 ms | **402 ms** | Akurat (~400ms) |
| **LLM TTFT** | `t1 -> t2` | 450 ms | **420 ms** | 🔻 Turun 30ms (Keep-Alive TLS reuse) |
| **Sentence Chunker** | `t2 -> t3` | 100 ms | **89 ms** | 🔻 Turun 11ms (Kalimat 1 ≤ 8 kata instan) |
| **TTS Synthesis** | `t3 -> t4` | 445 ms | **420 ms** | 🔻 Turun 25ms (WebSocket pool pre-warmed) |
| **Opus Dispatch** | `t4 -> t5` | 15 ms | **12 ms** | Optimal |

### C. Profil Sumber Daya Sistem (30 Putaran Uji)
- **Event-Loop Lag**: p50 = **10.8 ms**, p95 = **15.0 ms**, Max = **36.1 ms** (< 50 ms aman dari stuttering).
- **CPU Usage**: Rata-rata **2%** (User: 453ms, Sys: 141ms).
- **Memory RSS**: Awal **85 MB** -> Peak **103 MB** (Sangat stabil di bawah batas 400 MB).

### D. Hasil Unit Test
Seluruh **75 unit test** di repositori lulus 100%:
```text
✔ T3.2: HTTP Keep-Alive Pool initializes properly
✔ T3.2: PhraseAudioCache normalizes keys and provides instant retrieval
✔ T3.2: PhraseAudioCache warms up using TtsProvider
✔ T3.2: GeminiContextCacheManager evaluates explicit vs implicit caching
✔ T3.2: StreamingVoicePipeline streams sentences to TTS and player concurrently
✔ T3.2: StreamingVoicePipeline leverages PhraseAudioCache for instant response
✔ T3.2: StreamingVoicePipeline halts immediately upon barge-in abort signal
ℹ tests 75 | pass 75 | fail 0
```

---

## 4. Keputusan & Langkah Berikutnya

- **Keputusan**: **GO**. Semua kriteria penerimaan Task T3.2 telah terpenuhi dengan angka performa p50 = 1.331 ms dan p95 = 1.782 ms (jauh melampaui target PRD p50 ≤ 2.0s, p95 ≤ 3.5s).
- **Langkah Berikutnya**:
  Melangkah ke **Task T3.3: Tes pemilihan suara** (PRD §7, PRD §15: naskah uji 3-5 kandidat suara persona, form skor penilaian panelis, tes buta).
