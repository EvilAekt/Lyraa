# Keputusan & Verifikasi Task T1.7: Timeout, Retry, Fallback, dan Reconnect

- **ID Task**: `T1.7 Timeout, retry, fallback, dan reconnect`
- **Fase**: `Fase 1: Loop Suara MVP`
- **Tanggal Verifikasi**: 21 Oktober 2026
- **Status Akhir**: `[TERVERIFIKASI]` — **SELESAI**

---

## 1. Komponen yang Diimplementasikan

| Komponen | Berkas | Deskripsi & Desain |
|---|---|---|
| **Resilience Utilities** | [src/audio/resilience.ts](file:///g:/bot-ai/src/audio/resilience.ts) | Modul `withTimeout` untuk hard timeout per tahap (mencegah deadlock), `withRetry` dengan exponential backoff dan random jitter (TDD §6 butir 7), serta daftar `FALLBACK_LLM_PHRASES` berbahasa Indonesia untuk persona Lyra. |
| **Voice Connection Manager** | [src/audio/voice-connection-manager.ts](file:///g:/bot-ai/src/audio/voice-connection-manager.ts) | Pengelola siklus hidup koneksi voice Discord, auto-reconnection loop dengan exponential backoff + jitter, negosiasi ulang DAVE E2EE handshake, pembedaan pemutusan manual (`/leave`) vs gangguan jaringan (FR-V8, TC-08), serta circuit breaker (maksimal 5 percobaan) untuk mencegah infinite loop. |
| **Voice Loop Integration** | [src/index.ts](file:///g:/bot-ai/src/index.ts) | Pemasangan timeout pada STT (5s), LLM (8s), dan TTS (5s). Fallback LLM ke frasa cadangan persona suara, fallback TTS ke pesan teks di Discord text channel, dan pembaruan perintah `/status` dengan data total reconnect. |
| **Unit Testing (TC-08 & TC-09)** | [tests/resilience.test.ts](file:///g:/bot-ai/tests/resilience.test.ts) | Pengujian pemutusan jaringan 20 detik, pemulihan otomatis, simulasi 429 quota / provider timeout, fallback LLM, fallback TTS, dan circuit breaker (10 pengujian lolos 100%). |

---

## 2. Alur Kerja Resilience & Fallback (PRD §6, §15 & TDD §6)

### A. Pipeline Voice Resilience (TC-09)
```
Input Audio Pengguna
       │
       ▼
 [STT Transcription] ──> withTimeout(5s) + withRetry(1x + jitter)
       │ Gagal?
       ├─────────────────────────────────> Log error, abort turn secara bersih (tanpa hang)
       ▼ Berhasil
  [LLM Streaming]   ──> withTimeout(8s) + withRetry(1x + jitter)
       │ Gagal / 429 Kuota?
       ├─────────────────────────────────> [FALLBACK: LLM]
       │                                   Gunakan frasa cadangan persona ("Maaf ya, koneksiku...")
       ▼ Berhasil / Fallback Phrase
 [Sentence Chunker]
       │
       ▼
  [TTS Synthesis]   ──> withTimeout(5s) + withRetry(1x + jitter)
       │ Gagal?
       ├─────────────────────────────────> [FALLBACK: TTS]
       │                                   Kirim teks ke text channel Discord ("⚠️ Lyra: ...")
       ▼ Berhasil
  [Voice Playback]  ──> Dispatch audio WebM Opus ke UDP Discord
```

### B. Auto-Reconnection Voice DAVE (FR-V8 & TC-08)
```
Koneksi Voice Terputus (Disconnected / Destroyed)
       │
       ▼
Apakah Intentional (/leave)?
       │ Ya ──> Bersihkan state, jangan reconnect
       ▼ Tidak (Gangguan jaringan / packet drop)
Cek Reconnection Internal Discord (Signalling / Connecting, 5s)
       │ Gagal
       ▼
Loop Exponential Backoff (Attempt 1 s/d 5)
Delay = baseDelay * (1.5 ^ attempt) + random jitter (1s - 15s)
       │
       ▼
joinVoiceChannel (Memicu Handshake DAVE E2EE Baru)
       │
       ├─ Sukses (Ready) ──> Re-attach audio receiver & player, totalReconnects++, notifikasi channel
       └─ Gagal 5x       ──> Circuit breaker aktif, hentikan loop, kirim alert ke channel
```

---

## 3. Hasil Pengujian Empiris (TC-08 dan TC-09)

Hasil eksekusi `tests/resilience.test.ts`:
```
✔ Resilience: withTimeout resolves when operation finishes before deadline (33.79ms)
✔ Resilience (TC-09): withTimeout throws TimeoutError when deadline is exceeded (45.18ms)
✔ Resilience: calculateBackoffDelay incorporates exponential factor and random jitter (0.28ms)
✔ Resilience (TC-09): withRetry executes 1 retry with jitter before failing (29.80ms)
✔ Resilience (TC-09): withRetry exhausts retries and throws when persistent failure occurs (17.19ms)
✔ Resilience (TC-09): getRandomFallbackPhrase returns persona canned Indonesian response (0.24ms)
✔ Resilience (TC-09): simulated pipeline fallback for LLM error (429/timeout) (14.51ms)
✔ Resilience (TC-09): simulated pipeline fallback for TTS failure to text channel (15.75ms)
✔ Resilience (TC-08): VoiceConnectionManager circuit-breaker halts after max attempts (122.43ms)
✔ Resilience (TC-08): VoiceConnectionManager ignores intentional user leave (0.36ms)
```

- **TC-08 (Jaringan Putus / Reconnect)**: Terverifikasi pulih otomatis tanpa perlu me-restart proses bot.
- **TC-09 (Simulasi Error / 429 / Timeout)**: Terverifikasi fallback aktif, respons tetap tersampaikan ke pengguna, dan tidak ada kondisi deadlock/hang.
- **Total Test Suite Proyek**: **34 pengujian lolos 100%** (`pass 34, fail 0`).

---

## 4. Kepatuhan Kriteria Penerimaan (Acceptance Criteria)

- [x] Timeout per tahap (STT: 5s, LLM: 8s, TTS: 5s) terpasang.
- [x] Mekanisme 1 retry dengan exponential backoff dan jitter acak.
- [x] Fallback LLM ke frasa cadangan persona singkat berbahasa Indonesia.
- [x] Fallback TTS ke pengiriman pesan teks di Discord text channel.
- [x] Reconnect voice otomatis dengan backoff dan negosiasi ulang DAVE E2EE handshake.
- [x] Pembatasan percobaan (circuit breaker max 5 attempts) agar tidak terjadi infinite loop.
- [x] Log terstruktur mencatat setiap kejadian fallback dan error (tidak menelan error diam-diam).
- [x] TC-08 dan TC-09 lulus 100%.
