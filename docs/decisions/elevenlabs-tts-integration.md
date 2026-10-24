# ADR: Integrasi ElevenLabs Cloud TTS Provider (Karakter Custom)

- **Status**: [TERVERIFIKASI]
- **Tanggal**: 23 Oktober 2026
- **Konteks**: Menggantikan TTS lokal VOICEVOX dengan ElevenLabs Cloud API untuk karakter suara custom multibahasa (Indonesia, Jepang, Inggris) berkualitas studio dengan model ultra-low latency `eleven_turbo_v2_5`.

---

## 1. Konteks & Masalah

Sebelumnya, proyek mencoba mengintegrasikan VOICEVOX sebagai engine TTS lokal. Namun VOICEVOX memiliki sejumlah keterbatasan kritis untuk use-case VTuber AI kami:
1. **Keterbatasan Bahasa**: Hanya optimal untuk bahasa Jepang, tidak mendukung intonasi bahasa Indonesia secara natural.
2. **Ketergantungan Lokal**: Mengharuskan aplikasi desktop VOICEVOX selalu terbuka dan memakan resource CPU/GPU PC lokal di port 50021.
3. **Resampling Overhead**: Format output adalah 24kHz mono yang harus di-upsample ke 48kHz stereo secara manual.

Untuk mengatasi ini, pengguna memberikan API key ElevenLabs dan Voice ID custom (`0CzBBZVHSe1kKQOUHVzq`).

---

## 2. Keputusan Arsitektur

1. **Membuat `ElevenLabsTtsProvider` (`src/providers/elevenlabs/elevenlabs-tts.ts`)**:
   - Mengimplementasikan interface `TtsProvider`.
   - Menggunakan model `eleven_turbo_v2_5` untuk latensi ultra-cepat (~160-450ms).
   - Menggunakan format output native `pcm_48000` (Raw 48,000 Hz 16-bit PCM).
2. **Duplikasi Kanal Mono → Stereo (`monoToStereoPcm`)**:
   - ElevenLabs memproduksi format PCM 48kHz Mono.
   - Discord `@discordjs/voice` `StreamType.Raw` membutuhkan PCM 48kHz Stereo (4 bytes per frame).
   - Helper `monoToStereoPcm` menduplikasi setiap sample 16-bit ke Left dan Right channel tanpa resampling sample rate, menghasilkan performa ultra-ringan ($O(n)$ byte copy).
3. **Dukungan Streaming HTTP**:
   - Menggunakan endpoint `/v1/text-to-speech/{voice_id}/stream` untuk streaming chunked audio langsung ke `StreamingVoicePipeline`.
4. **Dynamic Provider Swapping**:
   - Pengguna dapat beralih antara ElevenLabs (`/voice switch speaker:elevenlabs`), Edge TTS Indonesia (`/voice switch speaker:edge`), atau VOICEVOX lokal kapan saja tanpa restart bot.

---

## 3. Hasil Pengujian Empiris `[TERVERIFIKASI]`

Test suite otomatis pada `tests/elevenlabs-tts.test.ts` membuktikan:
- **Latensi Sintesis Penuh**: 579.572 bytes dihasilkan dalam **435 ms**.
- **Latensi Streaming**: 76 chunks audio (205.080 bytes) mulai diterima dalam **163 ms**.
- **Kompatibilitas VoicePlayer**: Audio diputar langsung dengan `StreamType.Raw` tanpa membutuhkan binary FFmpeg.
- **Tingkat Kelulusan Test**: 8 dari 8 test lulus (100% pass).

---

## 4. Konsekuensi

1. **Kelebihan**:
   - Kualitas vokal natural studio level untuk Bahasa Indonesia, Jepang, dan Inggris.
   - Bebas beban komputasi lokal di PC pengguna.
   - Format 48kHz native langsung kompatibel dengan Discord Opus encoder.
2. **Pertimbangan Kuota**:
   - Penggunaan karakter dibatasi kuota akun ElevenLabs pengguna.
   - `PhraseAudioCache` pada `src/audio/phrase-audio-cache.ts` aktif meng-cache kalimat sapaan umum untuk menghemat kuota karakter API.
