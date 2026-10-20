# Bot-AI: Discord VTuber AI Voice Bot (basis AIRI & discord.js)

Autonomous AI VTuber Discord Bot dengan protokol enkripsi suara DAVE (Discord Audio/Video End-to-End Encryption), integrasi Google Gemini streaming pipeline, VAD endpointing, kepribadian adaptif, serta memori pengguna SQLite.

Proyek ini dipandu oleh [PRD.md](file:///g:/bot-ai/PRD.md) dan standar pengembangan Antigravity [AGENTS.md](file:///g:/bot-ai/AGENTS.md).

---

## 🚀 Fitur & Kemampuan Utama

- **Enkripsi Suara DAVE (E2EE)**: Kompatibel dengan gateway suara Discord terbaru menggunakan `@discordjs/voice` dan `@snazzah/davey`.
- **Streaming Pipeline Suara**:
  `Audio In (Opus/DAVE) ➔ VAD ➔ STT ➔ LLM (Gemini Streaming) ➔ Sentence Chunker ➔ TTS ➔ Opus 48kHz Out`
- **Barge-In Interruption**: Bot memotong respons dalam ≤ 300ms saat pengguna mulai berbicara kembali.
- **Persona & Gaya Bicara Dinamis**: Dikelola secara modular di folder `persona/` dan dapat dimuat ulang saat runtime lewat `/persona reload`.
- **Keamanan & Guardrails (SEC-1 s/d SEC-15)**: Isolasi input pengguna, proteksi prompt injection, allowlist guild & user, empty `allowed_mentions`, dan kill switch darurat (`/mute`).
- **Memori Pengguna**: Memori jangka pendek dan panjang tersimpan di database lokal SQLite (`data/memory.sqlite`) dengan dukungan `/memory me` dan `/forget me`.

---

## 🛠️ Antigravity Customizations (Rules, Skills & MCP)

Workspace ini telah dilengkapi kustomisasi Antigravity di direktori `.agents/`:

### 1. Workspace Rules (`.agents/rules/`)
- `prd-workflow.md`: Alur kerja bertahap sesuai Task ID PRD, label kepastian (`[TERVERIFIKASI]`, `[VERIFIKASI]`, `[ASUMSI]`), dan kewajiban bukti.
- `security-guardrails.md`: Aturan keamanan ketat (isolasi input, tanpa commit secret, isolasi mention, kill switch).
- `audio-latency.md`: Standar rekayasa latensi suara, pencatatan t0..t5, dan barge-in.

### 2. Workspace Custom Skills (`.agents/skills/`)
- **`prd-task-runner`**: Panduan eksekusi dan verifikasi task PRD langkah demi langkah.
- **`discord-voice-dave`**: Implementasi koneksi voice Discord dengan enkripsi DAVE dan receiver stream.
- **`gemini-pipeline`**: Pola streaming `@google/genai`, multimodal vision, dan sintesis audio.
- **`persona-and-memory`**: Manajemen file persona dan adapter memori SQLite.
- **`latency-benchmark`**: Harness benchmark latensi t0..t5 untuk mengukur p50/p95.

### 3. MCP Configuration
- Terkonfigurasi di `.agents/mcp_config.json` dan `.agents/plugins/bot-ai-suite/mcp_config.json` (termasuk SQLite MCP untuk inspeksi memori).

---

## 📦 Setup & Menjalankan

1. Salin konfigurasi environment:
   ```bash
   cp .env.example .env
   ```
2. Isi token dan API key di `.env`:
   - `DISCORD_TOKEN`: Token bot dari Discord Developer Portal
   - `GEMINI_API_KEY`: API Key dari Google AI Studio
   - `OWNER_USER_ID`: ID Discord Anda
3. Jalankan bot:
   ```bash
   # Mode pengembangan (hot-reload)
   npm run dev

   # Spike DAVE (Task T0.4)
   npm run spike:dave

   # Spike Gemini Streaming (Task T0.5)
   npm run spike:gemini

   # Benchmark Latensi
   npm run benchmark
   ```
