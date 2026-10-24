# ADR: Integrasi VOICEVOX Local TTS Engine (Sayo & Meimei Himari)

- **Status**: [TERVERIFIKASI]
- **Tanggal**: 23 Oktober 2026
- **Konteks**: Menambahkan engine TTS lokal (VOICEVOX) dengan karakter suara Jepang (小夜/SAYO dan 冥鳴ひまり/Meimei Himari) ke dalam bot-ai, disertai runtime toggle tanpa restart.

---

## 1. Konteks & Latar Belakang

Sistem TTS default bot-ai saat ini menggunakan Microsoft Edge Neural TTS (`id-ID-GadisNeural`) yang optimal untuk bahasa Indonesia dan streaming WebM Opus.
Untuk keperluan persona karakter VTuber berbahasa Jepang, ditambahkan opsi TTS lokal berbasis VOICEVOX Engine yang berjalan di komputer lokal (`http://127.0.0.1:50021`).

Dua karakter yang dipilih:
1. **小夜 / SAYO**: Suara lembut, tenang, dan ramah (Speaker ID: `46`).
2. **冥鳴ひまり / Meimei Himari**: Suara lembut, hangat, dan manis (Speaker ID: `14`).

---

## 2. Temuan Empiris [TERVERIFIKASI]

1. **VOICEVOX Engine REST API**:
   - Engine terverifikasi berjalan di `http://127.0.0.1:50021` (Versi 0.25.2).
   - `GET /speakers` mengonfirmasi:
     - `小夜/SAYO`: UUID `a8cc6d22-aad0-4ab8-bf1e-2f843924164a`, Style `ノーマル` = ID `46`.
     - `冥鳴ひまり`: UUID `8eaad775-3119-417e-8cf4-2a10bfd592c8`, Style `ノーマル` = ID `14`.
   - Alur sintesis:
     1. `POST /audio_query?text=...&speaker=ID`
     2. `POST /synthesis?speaker=ID` (JSON body)
     3. Output: WAV PCM 24kHz 16-bit mono.

2. **Tantangan Format Audio & Solusi Resampling**:
   - `@discordjs/voice` dengan `StreamType.Arbitrary` gagal jika FFmpeg tidak terinstall di OS (`FFmpeg/avconv not found!`).
   - `@discordjs/voice` dengan `StreamType.Raw` mengharuskan format **Signed 16-bit Little-Endian Stereo PCM pada 48,000 Hz**.
   - Solusi: `VoicevoxTtsProvider.wavTo48kStereoPcm()` melakukan upsampling linear 24kHz Mono → 48kHz Stereo PCM (faktor 2x sample rate dan duplikasi stereo Left=Right), tanpa dependensi eksternal (FFmpeg).
   - Pengujian pemutaran melalui `VoicePlayer` terverifikasi sukses (`totalItemsPlayed: 1`, playback duration ~2.2s).

---

## 3. Komponen yang Diimplementasikan

1. **`VoicevoxTtsProvider` (`src/providers/voicevox/voicevox-tts.ts`)**:
   - Mengimplementasikan interface `TtsProvider`.
   - Mendukung `synthesize()` (mengembalikan 48kHz stereo PCM buffer), `synthesizeWav()` (WAV asli), dan `synthesizeStream()`.
   - `switchSpeaker(speakerId)`: Mengganti karakter suara aktif secara instan saat runtime.
   - `warmUp()`: Menjalankan pre-warming koneksi ke `/version`.
   - Retry otomatis via `withRetry` dan batas waktu via `withTimeout`.

2. **Provider Registry (`src/providers/index.ts`)**:
   - Mendukung `TTS_PROVIDER=voicevox`.
   - Fungsi `getVoicevoxProvider()` untuk mengakses instance VOICEVOX yang aktif.

3. **Konfigurasi (`src/config/index.ts`, `.env`, `.env.example`)**:
   - `VOICEVOX_URL` (default: `http://127.0.0.1:50021`)
   - `VOICEVOX_DEFAULT_SPEAKER` (default: `46`)
   - `VOICEVOX_SPEAKERS` (default: `46,14`)

4. **Audio Pipeline (`src/audio/streaming-voice-pipeline.ts`)**:
   - Deteksi otomatis `StreamType.Raw` ketika provider mengembalikan stream type `'raw'`.

5. **Discord Commands (`src/index.ts`)**:
   - `/voice switch sayo` atau `/voice switch meimei_himari` untuk toggle karakter runtime.
   - `/voice list` untuk melihat status suara dan provider aktif.
   - `/voice current` untuk melihat detail suara aktif saat ini.
   - `/voice preset` untuk memilih preset Edge-TTS.
   - Prefix text commands: `!voice sayo`, `!voice himari`, `!voice list`, `!voice current`.

6. **Pengujian (`tests/voicevox-tts.test.ts`)**:
   - 8 test cases lulus 100% mencakup unit test dan integrasi sintesis lokal.

---

## 4. Konsekuensi & Limitasi

1. **Ketergantungan Lokal**:
   - VOICEVOX Engine harus berjalan di PC lokal pada port 50021.
   - Jika engine belum dinyalakan, fallback atau error warning akan ditampilkan dengan jelas tanpa menyebabkan bot crash.
2. **Karakter Fonetik**:
   - VOICEVOX dirancang khusus untuk fonetik bahasa Jepang. Untuk respons bahasa Indonesia, Edge-TTS tetap menjadi opsi utama.
