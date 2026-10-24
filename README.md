# Bot-AI: Discord VTuber AI Voice Bot (basis AIRI & discord.js)

Autonomous AI VTuber Discord Bot dengan protokol enkripsi suara DAVE (*Discord Audio/Video End-to-End Encryption*), streaming LLM Google Gemini (2.5 Flash), pemrosesan VAD endpointing, sintesis suara neural karakter berbahasa Indonesia, kepribadian adaptif berleksikon, serta persistensi memori SQLite.

Proyek ini dipandu oleh arsitektur modular di folder `docs/` ([docs/README.md](file:///g:/bot-ai/docs/README.md), [docs/PRD.md](file:///g:/bot-ai/docs/PRD.md), [docs/TDD.md](file:///g:/bot-ai/docs/TDD.md), [docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md)) dan direktif [AGENTS.md](file:///g:/bot-ai/AGENTS.md).

---

## ⚡ Ringkasan Kemampuan Utama

- **Enkripsi Suara DAVE E2EE**: Lolos gateway suara Discord terbaru tanpa error *close code 4017* berkat integrasi `@snazzah/davey` dan `@discordjs/voice`.
- **Pipeline Suara Streaming Ultra-Low Latency**:
  $$\text{Audio In (Opus/DAVE)} \longrightarrow \text{VAD} \longrightarrow \text{STT} \longrightarrow \text{LLM Stream} \longrightarrow \text{Chunker (<8 kata)} \longrightarrow \text{TTS Stream} \longrightarrow \text{Opus Out}$$
  - Target latensi suara: $p50 \le 2.0$ detik (hasil terukur: $1.32$ detik), $p95 \le 3.5$ detik (hasil terukur: $1.93$ detik).
- **Interupsi Cepat (Barge-in)**: Bot langsung memotong dan membuang sisa ucapan dalam $\le 300$ ms saat pengguna menyela.
- **Karakter & Persona Dinamis**: Profil persona, aturan keselamatan, contoh few-shot, dan kamus pelafalan fonetik dikelola modular di folder `persona/` dan mendukung pemuatan ulang saat runtime (`/persona reload`).
- **Memori Percakapan Jangka Pendek & Panjang**: Memori tersimpan persisten di database lokal SQLite dengan fitur kendali pengguna penuh (`/memory me` dan `/forget me`).
- **Keamanan & Guardrails (SEC-1 s/d SEC-15)**: Nol rahasia bocor di git, sanitasi mention massal, isolasi delimiter data tidak tepercaya, batas kuota biaya harian, dan kill switch instan (`/mute`).

---

## ⏱️ Panduan Mulai Cepat (Zero-to-Hero dalam < 30 Menit)

Ikuti 7 langkah praktis ini untuk menjalankan bot dari nol di lingkungan lokal Anda:

### 1. Prasyarat Sistem
- **Node.js**: Versi `20.0.0` atau `22.x LTS` ke atas (pastikan cek dengan `node -v`).
- **NPM** atau **PNPM**: Bawaan Node.js.
- **Headset / Earphone**: Gunakan headset saat menguji suara di Discord agar bot tidak mendengar dan mentranskripsi suaranya sendiri.

---

### 2. Buat Aplikasi Bot di Discord Developer Portal
1. Kunjungi [Discord Developer Portal](https://discord.com/developers/applications) dan klik **New Application**.
2. Berikan nama bot (misalnya: `Lyra AI`).
3. Masuk ke tab **Bot**:
   - Klik **Reset Token** untuk mendapatkan `DISCORD_TOKEN`. Simpan token ini dengan aman.
   - Gulir ke bagian **Privileged Gateway Intents** dan **AKTIFKAN** ketiga opsi berikut:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent** (Kritikal agar bot bisa membaca chat di channel teks)
4. Masuk ke tab **OAuth2** ➔ **URL Generator**:
   - Pilih Scopes: `bot`, `applications.commands`.
   - Pilih Bot Permissions:
     - **View Channels**
     - **Send Messages**
     - **Connect**
     - **Speak**
     - **Use Application Commands**
     *(Catatan: JANGAN berikan hak Administrator sesuai prinsip Least Privilege SEC-3).*
   - Salin tautan yang dihasilkan dan buka di browser untuk mengundang bot ke server Discord Anda.

---

### 3. Dapatkan Google Gemini API Key
1. Kunjungi [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Masuk dengan akun Google Anda dan klik **Create API Key**.
3. Salin API key Anda (format: `AIzaSy...`).

---

### 4. Clone Repositori & Instalasi Dependensi
```bash
# 1. Masuk ke direktori proyek
cd bot-ai

# 2. Instal seluruh dependensi terkunci
npm install
```

---

### 5. Konfigurasi Variabel Lingkungan (`.env`)
Salin berkas template konfigurasi:
```bash
cp .env.example .env
```
Buka file `.env` dengan teks editor favorit Anda dan isi variabel berikut:
```env
# Kredensial Inti
DISCORD_TOKEN=token_bot_discord_anda_di_sini
GEMINI_API_KEY=kunci_api_gemini_anda_di_sini
OWNER_USER_ID=id_discord_anda_sendiri

# Akses & Keamanan
DISCORD_GUILD_ALLOWLIST=id_server_discord_anda
DISCORD_USER_ALLOWLIST=id_discord_anda_dan_teman

# Konfigurasi Model & Karakter
LLM_MODEL=gemini-2.5-flash
INTERACTION_MODE=wake
WAKE_WORDS=lyra,lira

# Database Memori
MEMORY_DB_URL=data/memory.sqlite
```

---

### 6. Kompilasi & Validasi Tipe
Pastikan proyek terkompilasi tanpa error TypeScript:
```bash
npm run build
```

---

### 7. Jalankan Bot!
```bash
# Mode Pengembangan (Otomatis reload jika file berubah)
npm run dev

# ATAU Mode Produksi
npm start
```
Saat terminal menampilkan log:
```text
[Bot-AI] Logged in successfully as Lyra#1234
[Bot-AI] Interaction Mode: wake
[Bot-AI] Persona initialized: 1.0.0-lyra
```
**Selamat! Bot Anda kini telah aktif dan siap diajak berinteraksi di Discord.**

---

## 🎮 Daftar Slash Command di Discord

| Command | Keterangan | Hak Akses |
|---|---|---|
| `/join` | Memanggil bot untuk bergabung ke Voice Channel Anda | Allowlist Users |
| `/leave` | Meminta bot keluar dari Voice Channel | Semua Pengguna |
| `/chat pesan:<teks>` | Mengirim pesan teks dan menerima jawaban streaming | Semua Pengguna |
| `/speak teks:<teks>` | Menguji sintesis suara TTS langsung di voice channel | Semua Pengguna |
| `/mode mode:<wake\|open\|ptt>` | Mengatur mode interaksi bot di voice channel | Allowlist Users |
| `/voice switch speaker:<elevenlabs\|sayo\|meimei_himari\|edge>` | Ganti karakter suara aktif secara runtime tanpa restart bot | Allowlist Users |
| `/voice list` | Lihat daftar karakter suara dan status aktif provider | Semua Pengguna |
| `/voice current` | Melihat detail karakter suara aktif saat ini | Semua Pengguna |
| `/voice preset preset:<cute\|chibi\|...>` | Mengatur preset nada suara Edge-TTS | Allowlist Users |
| `/status` | Melihat uptime, model aktif, p50/p95 latency, dan token hari ini | Semua Pengguna |
| `/memory me` | Melihat fakta preferensi yang tersimpan tentang diri Anda | Pengguna Terkait |
| `/forget me` | Menghapus seluruh data memori dan transkrip Anda (FR-P4, TC-15) | Pengguna Terkait |
| `/forget all` | Mengosongkan seluruh isi database memori sistem | **Owner Only** |
| `/mute` | **Kill switch darurat**: membekukan semua respons bot | **Owner Only** |
| `/unmute` | Mengaktifkan kembali respons bot setelah dimute | **Owner Only** |
| `/persona reload` | Memuat ulang file persona tanpa perlu me-restart bot (FR-P1) | **Owner Only** |
| `/persona info` | Menampilkan versi persona dan kamus leksikon aktif | Semua Pengguna |

---

## 🎙️ Karakter Suara: ElevenLabs Cloud TTS (Studio Quality)

Bot-AI mendukung **ElevenLabs Cloud TTS** dengan model ultra-low latency `eleven_turbo_v2_5` dan format native `pcm_48000` (48kHz Stereo PCM):
- **Karakter Custom**: Menggunakan Voice ID custom pengguna (`0CzBBZVHSe1kKQOUHVzq`).
- **Multilingual Luwes**: Otomatis fasih berbicara dalam Bahasa Indonesia, Jepang, dan Inggris.
- **Latensi Cepat**: First-chunk audio stream tiba dalam ~160ms - 450ms.

### Cara Menjalankan:
1. Pastikan konfigurasi aktif di file `.env`:
   ```env
   TTS_PROVIDER=elevenlabs
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   ELEVENLABS_VOICE_ID=0CzBBZVHSe1kKQOUHVzq
   ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
   ELEVENLABS_OUTPUT_FORMAT=pcm_48000
   ```
2. Jalankan bot:
   ```bash
   npm run dev
   ```
3. Di Discord, ganti suara kapan saja dengan slash command:
   - `/voice switch speaker:elevenlabs` — Mengaktifkan suara ElevenLabs
   - `/voice switch speaker:edge` — Beralih ke suara Edge-TTS Indonesia bawaan
   - Atau lewat chat prefix: `!voice elevenlabs` / `!voice edge`

---

## 🧪 Pengujian & Tolok Ukur Kualitas

Repositori dilengkapi dengan 26 test suite komprehensif yang menguji **TC-01 sampai TC-20**:

```bash
# Menjalankan seluruh test suite otomatis (118 unit & integration tests)
npm test

# Menjalankan benchmark latensi suara t0..t5
npm run benchmark

# Menjalankan audit keamanan & rantai pasok dependensi
npm audit

# Menjalankan pencadangan database memori terenkripsi
npx tsx scripts/backup-db.ts

# Memulihkan database dari backup
npx tsx scripts/restore-db.ts backups/memory-backup-<timestamp>.sqlite
```

---

## 📂 Struktur Direktori Proyek

```text
bot-ai/
├── .github/workflows/      # GitHub Actions CI workflow (lint, test, audit, gitleaks)
├── data/                   # Basis data lokal SQLite (memory.sqlite)
├── docs/                   # Dokumentasi arsitektur, PRD, TDD, roadmap, dan keputusan
│   ├── decisions/          # Architectural Decision Records (ADR T0.1 s/d T4.4)
│   ├── perf/               # Hasil telemetri latensi baseline, soak 4 jam, dan soak 24 jam
│   ├── e2e-checklist.md    # Checklist pengujian end-to-end 20 kasus uji & 12 skenario live
│   ├── runbook.md          # Panduan operasional harian, insiden, dan backup restore
│   └── security-review.md  # Laporan formal audit keamanan 15 kontrol (SEC-1 s/d SEC-15)
├── fixtures/               # Fixture berkas audio WAV percakapan (utt-01.wav s/d utt-10.wav)
├── persona/                # Karakter VTuber AI: character.md, rules.md, voice-style.md, lexicon.json
├── scripts/                # Skrip backup-db, restore-db, dan benchmark
├── src/                    # Kode sumber bot (audio, chat, memory, persona, providers, security)
└── tests/                  # 26 berkas test unit, integrasi, audit keamanan, dan uji ketahanan
```

---

## 📖 Dokumentasi Terkait

- [Dokumen PRD (Product Requirements Document)](file:///g:/bot-ai/docs/PRD.md)
- [Dokumen TDD (Technical Design Document)](file:///g:/bot-ai/docs/TDD.md)
- [Panduan Operasional & Runbook](file:///g:/bot-ai/docs/runbook.md)
- [Laporan Audit Keamanan (SEC-1 s/d SEC-15)](file:///g:/bot-ai/docs/security-review.md)
- [Laporan Uji Ketahanan 24 Jam (Soak 24H)](file:///g:/bot-ai/docs/perf/soak-24h.md)
- [Checklist Pengujian E2E](file:///g:/bot-ai/docs/e2e-checklist.md)

---

## 📄 Lisensi

Proyek ini berlisensi [MIT License](file:///g:/bot-ai/LICENSE) dengan fondasi open-source dari [AIRI](https://github.com/moeru-ai/airi).
