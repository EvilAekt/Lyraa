# ADR-001: Keputusan Basis Arsitektur Bot (Opsi B: Rakit Mandiri Berbasis discord.js + DAVE + Gemini)

- **Status**: Disetujui Pemilik Proyek (`[TERVERIFIKASI]`)
- **Tanggal**: 21 Oktober 2026
- **Pengambil Keputusan**: Pemilik Proyek (@EvilAekt) & AI Asisten
- **Task Terkait**: `T0.1`, `T0.2`, `T0.6`
- **Repositori Target**: [Lyraa (https://github.com/EvilAekt/Lyraa)](https://github.com/EvilAekt/Lyraa)

---

## 1. Konteks dan Masalah

Berdasarkan hasil investigasi dan pemetaan repositori monorepo AIRI pada **Task T0.1 & T0.2** (tercatat di [docs/ARCHITECTURE-NOTES.md](file:///g:/bot-ai/docs/ARCHITECTURE-NOTES.md)):

1. **Loop Suara Tidak Lengkap di AIRI**: Modul `integrations/discord-bot` di AIRI saat ini hanya mengimplementasikan penangkapan suara (audio receiver) dan transkripsi STT. Respons AI dikembalikan dalam bentuk chat teks ke Discord channel. Fungsi pemutar suara `playAudioStream` menganggur dan belum pernah disambungkan ke TTS.
2. **Ketergantungan Kuat ke Server Monorepo**: Bot bawaan AIRI tidak mandiri; ia wajib terhubung via WebSocket ke `@proj-airi/server-runtime` (`ws://localhost:6121/ws`). Tanpa server runtime monorepo, bot tidak dapat memproses percakapan.
3. **Overhead Monorepo yang Sangat Besar**: AIRI terdiri dari 78 workspace projects (termasuk Electron, Godot engine, dan tools berat). Pemasangan dependensi dan typecheck upstream saat ini mengalami breaking change pada paket shared types.
4. **Target Latensi Ketat**: Target proyek adalah latensi percakapan suara **p50 ≤ 2.0s, p95 ≤ 3.5s**. Overhead serialize/deserialize antarkomponen WebSocket server runtime AIRI akan menambah latensi yang tidak perlu.

---

## 2. Pilihan yang Dipertimbangkan

- **Opsi A: Memperbaiki & Mengembangkan di Dalam Fork AIRI**
  - *Kelebihan*: Mewarisi fitur ekosistem AIRI (mis. integrasi stage avatar jika suatu saat diperlukan).
  - *Kekurangan*: Sangat berat, kompleksitas monorepo tinggi, typecheck upstream saat ini rusak, latensi bertambah karena hop WebSocket server.
- **Opsi B (Dipilih): Rakit Mandiri Berbasis discord.js + DAVE + Gemini (Basis Repositori Lyra)**
  - *Kelebihan*:
    - Mengadopsi layer audio terbaik dari AIRI: protokol DAVE (`@snazzah/davey`), audio receiver stream, dan decoding Opus (`OpusDecoder` + `AudioMonitor` VAD).
    - Menghubungkan langsung ke provider `@google/genai` secara native (streaming LLM token, chunking kalimat, dan TTS), mengeliminasi perantara WebSocket.
    - Struktur proyek sangat bersih, ringan, mandiri, dan mudah di-tuning/deploy via Docker.
    - Menjamin pemenuhan target latensi (Pipeline A: STT ➔ LLM ➔ TTS streaming end-to-end).
  - *Kekurangan*: Fitur visual avatar (stage 3D/VRM) ditunda ke Fase 6 dan dijalankan terpisah via OBS.

---

## 3. Keputusan

Pemilik proyek memutuskan **OPSI B (Sesuai ADR-001 & PRD §14)**:
1. Membangun bot secara mandiri pada repositori **Lyra** (`https://github.com/EvilAekt/Lyraa`).
2. Mengadopsi pola receiver audio Discord DAVE dan Opus decoding dari AIRI ke dalam folder `src/audio/` di repo Lyra.
3. Mengintegrasikan langsung Google Gemini SDK (`@google/genai`) untuk streaming LLM, transkripsi STT, dan sintesis audio TTS.
4. Menjaga arsitektur tetap modular dan portabel sesuai panduan [docs/TDD.md](file:///g:/bot-ai/docs/TDD.md) dan aturan kerja [docs/README.md](file:///g:/bot-ai/docs/README.md).

---

## 4. Konsekuensi

- **Roadmap**: Alur kerja Fase 0 berlanjut ke verifikasi token Discord (**T0.3**), pengujian DAVE E2EE (**T0.4**), dan pengujian latensi streaming Gemini (**T0.5**).
- **Dependensi**: Workspace tidak perlu menjalankan monorepo AIRI; cukup menjalankan paket mandiri di repo `bot-ai` / `Lyraa`.
- **Git Remote**: `origin` diarahkan ke `https://github.com/EvilAekt/Lyraa.git`, dengan `airi/` tetap tersedia secara lokal sebagai referensi upstream kode audio.
