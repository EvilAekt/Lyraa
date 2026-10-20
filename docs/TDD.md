# TDD: Technical Design Document - Bot Discord VTuber AI (basis AIRI)

Versi 0.1 · 20 Oktober 2026 · Proyek pribadi

> Aturan kerja dan etika pengembangan dijelaskan di [docs/README.md](file:///g:/bot-ai/docs/README.md).  
> Persyaratan produk dan persona dijelaskan di [docs/PRD.md](file:///g:/bot-ai/docs/PRD.md).  
> Backlog dan urutan task eksekusi dijelaskan di [docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md).

---

## 3. Arsitektur dan tiga jalur

**Tiga jalur kerja**

| Jalur | Isi | Fase | Catatan |
| --- | --- | --- | --- |
| 1. Dev di PC | Semua pengembangan, tes DAVE, tuning, QA | 0 sampai 4, dan 6 | Satu-satunya jalur yang wajib lolos lebih dulu |
| 2. Produksi 24/7 | Server rumah atau VPS Singapura (sekitar $5–6 per bulan) | 7 | Di luar scope awal, tapi desain harus portabel (Docker) |
| 3. Uji deploy gratis | Render free dan/atau GCP e2-micro | 5 | Eksperimen terukur untuk tahu batasnya, bukan produksi |

[ASUMSI A1] “Jalur 3” berarti Render atau GCP e2-micro seperti di rencana sebelumnya (Jalur 1 = dev di PC, Jalur 2 = server 24/7). Kalau maksudnya lain, ubah tabel ini sebelum Fase 5.

**Alur data (Pipeline A, default AIRI: STT → LLM → TTS)**

```
Discord Voice (UDP, DAVE/E2EE)
        │  Opus per pengguna
        ▼
   discord-bot (service AIRI: discord.js + @discordjs/voice + @snazzah/davey)
        │  decode -> VAD/endpointing
        ▼
      STT
        │
        ▼
   Orchestrator  <-- filter dan rate limit <-- Chat teks / gambar Discord
   (persona + memori + safety + gating)
        │
        ▼
   LLM (Gemini flash, streaming)
        │
        ▼
   Sentence chunker -> TTS (streaming)
        │
        ▼
   resample 24k -> 48k -> encode Opus -> kirim ke voice channel

Opsional (PC saja): AIRI server runtime <-> stage (VRM/Live2D, lip-sync) -> OBS
Lintas bagian: konfigurasi, log dan metrik, DB memori, secret, kill switch
```

**Dua pipeline**

- **Pipeline A (default)**: STT → LLM → TTS. Ini alur bawaan AIRI. Kelebihan: karakter dan suara bisa diatur terpisah, mudah disisipi memori dan filter. Kekurangan: latensi lebih tinggi sehingga perlu dioptimasi (§6).
- **Pipeline B (eksperimen, Fase 6)**: Gemini Live speech-to-speech. Latensinya lebih rendah dan ringan di CPU, tetapi pilihan suara terbatas pada suara bawaan, sesi dibatasi, dan integrasi ke AIRI belum tentu mulus. Jangan dikerjakan sebelum Pipeline A stabil.

**Prinsip desain**

1. Fork dengan patch minimal. Tambahan kita di paket atau folder sendiri (`src/`); branch main (milik kita) dan upstream (cermin AIRI) dipisah.
2. Semua provider (LLM, STT, TTS) berada di belakang interface kecil dan dipilih lewat konfigurasi.
3. Streaming di semua tahap. Tidak ada tahap yang menunggu tahap sebelumnya selesai total.
4. Setiap tahap punya timeout, retry terbatas, dan fallback (TTS gagal berarti balas teks).
5. Semua yang berasal dari pengguna (suara, chat, gambar, memori) adalah data tidak tepercaya (§10).
6. Stateless sebisa mungkin. State (memori, konfigurasi) di DB atau file yang mudah dipindah. Untuk Jalur 3 jangan simpan state penting di disk lokal.

---

## 6. Backend dan rekayasa latensi

Instrumentasi dulu, optimasi kemudian. Setiap giliran percakapan mencatat penanda waktu:

- `t0`: ucapan pengguna selesai (menurut VAD)
- `t1`: transkrip siap
- `t2`: token LLM pertama
- `t3`: kalimat pertama siap dikirim ke TTS
- `t4`: chunk audio TTS pertama
- `t5`: paket audio pertama terkirim ke Discord

Latensi tahap adalah selisih penanda berurutan; latensi total adalah `t5` dikurangi `t0`. Semuanya dicatat per giliran di log dan dirangkum sebagai histogram per tahap (T1.6).

**Teknik yang diterapkan, dari yang paling berpengaruh:**

1. **Streaming end-to-end.** LLM dibaca per token, token dikumpulkan per kalimat, kalimat langsung masuk TTS, audio langsung diputar. Jangan menunggu jawaban penuh. (T3.2)
2. **Kalimat pertama pendek.** Persona menginstruksikan kalimat pembuka maksimal 8 kata supaya TTS bisa mulai cepat. Jawaban suara default maksimal 2 sampai 3 kalimat kecuali diminta panjang. (T2.3)
3. **Endpointing yang disetel.** Jeda diam (hangover) dicoba pada 300, 500, dan 700 ms; pilih yang paling jarang memotong ucapan tapi tidak terasa lambat. (T1.4 dan T3.1)
4. **Koneksi hangat.** HTTP keep-alive atau HTTP/2 ke API Gemini, ditambah panggilan pemanasan kecil saat `/join` supaya panggilan pertama tidak lambat. (T3.2)
5. **Jaga event loop.** Resample dan encode Opus lewat binding native; pantau event-loop lag (beri peringatan jika > 50 ms); pindahkan ke worker thread jika perlu. (T3.1)
6. **Antrean berbatas dan buang yang basi.** Jika audio atau jawaban sudah tidak relevan (pengguna menyela), buang, jangan diputar terlambat. (T1.5)
7. **Timeout dan fallback per tahap.** Nilai awal: STT 5 dtk, LLM 8 dtk, TTS 5 dtk, satu retry dengan jitter. Jika TTS gagal, balas teks di channel; jika LLM gagal, ucapkan frasa cadangan singkat dari daftar. (T1.7)
8. **Cache.** Prefix persona yang statis memakai context caching jika tersedia [VERIFIKASI]; frasa umum (sapaan, “bentar ya”) di-cache sebagai audio. (T3.2)
9. **Wilayah.** Atur Region Override voice channel ke Singapore; ukur RTT dari PC dan dari server uji ke endpoint voice Discord dan API Gemini; catat di laporan Jalur 3. (T5.4)
10. **Pipeline B.** Session resumption dipasang sejak awal karena sesi audio Live dibatasi sekitar 15 menit [VERIFIKASI]. (T6.2)

Prinsipnya: perubahan yang tidak menurunkan p50 atau p95 di benchmark (T3.1) tidak dimasukkan hanya karena “seharusnya lebih cepat”.

---

## 10. Keamanan dan privasi

| ID | Kontrol | Diverifikasi di |
| --- | --- | --- |
| SEC-1 | Secret (token Discord, API key) hanya di .env atau secret manager platform. .env masuk .gitignore. Pre-commit hook pemindai secret (mis. gitleaks). Jika bocor: rotasi segera | T4.1 |
| SEC-2 | Token tidak pernah masuk log; log memakai redaksi untuk pola token dan key | T4.1 |
| SEC-3 | Hak minimum. Intents hanya yang perlu (Guilds, GuildVoiceStates, GuildMessages, dan MessageContent yang termasuk privileged, diaktifkan manual di Developer Portal). Permission bot: View Channel, Send Messages, Connect, Speak, Use Application Commands. Bukan Administrator | T0.3 |
| SEC-4 | Allowlist guild dan user id. Bot keluar otomatis dari guild yang tidak dikenal | T2.5 |
| SEC-5 | Prompt injection: teks chat, transkrip suara, teks dalam gambar, dan memori adalah data tidak tepercaya. System prompt dipisah dari data pengguna, data dibungkus delimiter. Bot tidak punya tool berdampak (tanpa eksekusi kode, tanpa akses file atau jaringan lewat LLM). Keluaran disanitasi (tanpa mention, tanpa tautan yang tidak dikenal) | T2.6, TC-13 |
| SEC-6 | Anti-abuse dan biaya: rate limit per pengguna (awal: 6 permintaan per menit), per guild, dan plafon harian. Cooldown. Kill switch | T2.6 |
| SEC-7 | Aktifkan safety settings Gemini. Persona melarang konten dewasa eksplisit, kebencian, dan instruksi berbahaya; penolakan tetap sesuai karakter | T2.3 |
| SEC-8 | Privasi suara: audio mentah tidak disimpan. Transkrip maksimal 7 hari. Log level INFO hanya berisi panjang teks dan id, bukan isi; isi penuh hanya di mode debug lokal | T4.1, TC-15 |
| SEC-9 | Persetujuan: saat join voice, bot mengumumkan di teks bahwa ia mendengar dan mentranskripsi, dan bahwa data diproses oleh Google. Free tier AI Studio memakai konten untuk perbaikan produk [VERIFIKASI], jadi jangan dipakai untuk topik sensitif; opsi: pindah ke tier berbayar | T2.5 |
| SEC-10 | Rantai pasok dependensi: lockfile di-commit, pnpm audit di CI, pembaruan otomatis (Dependabot atau Renovate) dengan tinjauan, tinjau paket baru (maintainer, popularitas, repo), pin versi image Docker. Monorepo AIRI besar, jadi hanya instal dan jalankan paket yang dibutuhkan | T4.1 |
| SEC-11 | Container berjalan sebagai non-root, tanpa port terbuka selain health endpoint, filesystem read-only bila memungkinkan | T5.1 |
| SEC-12 | Endpoint HTTP hanya /healthz tanpa data sensitif. Status lengkap lewat /status di Discord, bukan HTTP | T5.2 |
| SEC-13 | Kepatuhan: ikuti Discord Developer Terms dan Policy serta syarat API Google. Tidak meniru suara orang nyata. Bot mengaku AI (FR-P5) | T4.1 |
| SEC-14 | Backup harian DB memori ke lokasi lain (terenkripsi); uji restore minimal sekali | T4.4 |
| SEC-15 | Runbook insiden: kill switch, rotasi secret, tinjau log, pulihkan dari backup | T4.4 |

---

## 11. QA dan pengujian

**Strategi bertingkat**

- **Unit** (otomatis, CI): chunker kalimat, rate limiter, gating, pemuat persona, sanitasi mention, pembatas anggaran, parser tag emosi, lexicon.
- **Integrasi** (otomatis, lokal): pipeline dengan audio fixture WAV dan Discord di-stub; provider di-mock. Ada mode opsional dengan provider sungguhan yang butuh API key.
- **E2E manual** di Discord sungguhan memakai checklist di bawah.
- **Non-fungsional**: benchmark latensi, soak test, pemakaian resource, injeksi kegagalan.
- **Keamanan**: kasus SEC dan golden set adversarial.
- **Perseptual**: panel dengar (§7).

**Kasus uji (Test Cases)**

| ID | Skenario | Lulus jika |
| --- | --- | --- |
| TC-01 | Bot join voice dengan DAVE | Tanpa close code 4017; sesi 10 menit stabil |
| TC-02 | Tangkap audio pengguna | Ucapan 10 detik tersimpan utuh, jelas, tanpa error dekripsi |
| TC-03 | Akurasi STT, 30 ucapan Indonesia dan campuran | Kata benar ≥ 90% (hitung manual) [ASUMSI] |
| TC-04 | Jawaban suara | Terdengar jelas, tidak patah, latensi sesuai target fase |
| TC-05 | Barge-in | Bot berhenti ≤ 300 ms, sisa antrean dibuang |
| TC-06 | 3 orang bicara bergantian dan bertumpuk | Tidak crash, tidak menjawab dua kali serentak |
| TC-07 | Mode wake | Tidak menjawab tanpa dipanggil; menjawab saat dipanggil |
| TC-08 | Jaringan putus 20 detik | Bot kembali tanpa restart proses |
| TC-09 | Provider error atau lambat (simulasi 429 dan timeout) | Fallback jalan, tidak hang |
| TC-10 | 20 pesan chat campuran | Hanya yang memenuhi aturan gating yang dijawab |
| TC-11 | 5 gambar dan 1 file > 5 MB | Komentar relevan; file besar ditolak dengan sopan |
| TC-12 | Golden set | ≥ 80% lulus |
| TC-13 | 10 kasus injection | Semua ditangani aman |
| TC-14 | Mention safety | Tidak pernah memicu @everyone, @here, atau role ping |
| TC-15 | /forget me dan audio mentah | Data terhapus; tidak ada audio mentah di disk |
| TC-16 | Kill switch dan anggaran harian | /mute menghentikan semuanya; anggaran habis berarti turun level lalu berhenti |
| TC-17 | Soak 4 jam (Fase 3) dan 24 jam (Fase 4) | Tidak crash; pertumbuhan memori < 10% per jam |
| TC-18 | Proses dimatikan paksa | Pulih ≤ 30 detik, memori tetap utuh |
| TC-19 | Cold start | Siap dalam ≤ 60 detik |
| TC-20 | Jalur 3, percakapan 30 menit | Catat patah-patah, CPU, RAM, restart; tidak ada ambang lulus keras |

**Tingkat keparahan bug.** S1: crash, kebocoran secret, bot mengaku manusia. S2: fitur wajib rusak. S3: degradasi kualitas. S4: kosmetik. Gate fase tidak boleh dilewati jika ada S1 atau S2 yang masih terbuka.

---

## 12. Observabilitas dan operasi

- **Log terstruktur JSON** (mis. pino): level, waktu, komponen, turn id, versi persona. Redaksi token dan key.
- **Metrik**: latensi per tahap (histogram), error per provider, jumlah giliran, token per hari, event-loop lag, RSS dan CPU, jumlah reconnect. Cukup ditulis ke file JSONL plus skrip ringkasan; ditampilkan ringkas di `/status`.
- **Health**: GET `/healthz` mengembalikan 200 jika proses hidup dan gateway Discord siap. Hanya dipakai di Jalur 3.
- **Alert ke channel admin lewat webhook**: restart setelah crash, reconnect lebih dari 3 kali per jam, error provider lebih dari 20% dalam 5 menit, anggaran harian mencapai 80%.
- **Runbook** (`docs/runbook.md`): start dan stop, rotasi token, cek log, kill switch, rollback versi, restore backup.
- Versi memakai semver dan changelog; versi tampil di `/status`.

---

## 13. Deployment per jalur

**Jalur 1: PC.** pnpm install, buat .env dari .env.example, jalankan dengan perintah yang tertulis di README AIRI (jangan menebak nama skrip). Docker Compose opsional. Pakai headset supaya bot tidak mendengar suaranya sendiri, dan siapkan akun Discord kedua untuk tes.

**Jalur 3: uji deploy gratis (Fase 5).**

- **Render**: web service Docker tier gratis. Hanya service bot (dan runtime minimal bila perlu), bukan seluruh monorepo. Health endpoint `/healthz`. UptimeRobot memanggil endpoint itu secara berkala; syarat dan intervalnya [VERIFIKASI]. Memori dan config tidak boleh bergantung pada disk lokal, jadi pakai DB eksternal gratis (mis. Neon, Turso, atau Supabase) [VERIFIKASI]. Config lewat environment dashboard.
- Yang dicatat: waktu cold start, RSS, CPU, apakah UDP keluar jalan, jumlah restart, kualitas audio selama 30 menit.
- Kriteria “layak untuk uji harian”: 30 menit tanpa patah-patah, p50 ≤ 3,5 dtk, tidak ada restart. Kalau gagal, dokumentasikan alasannya. Jangan diakali dengan menurunkan kualitas secara diam-diam.
- **GCP e2-micro (opsional)**: region AS (us-west1, us-central1, us-east1). Sebelum apa pun, pasang budget alert sekitar $1 karena IPv4 eksternal ditagih dan egress gratis hanya 1 GB per bulan [VERIFIKASI]. Latensi ke Discord region Asia akan terasa; ukur dan catat.

**Jalur 2: produksi 24/7 (Fase 7).** Dua opsi: server rumah (mini PC, laptop lama, atau Raspberry Pi; bot hanya koneksi keluar jadi tidak perlu port forwarding) atau VPS Singapura sekitar $5 sampai 6 per bulan dengan 1 vCPU dan 1 GB RAM. Docker dengan restart policy atau systemd, backup, monitoring dasar. Keputusannya ada di §20.

**Syarat Dockerfile**: multi-stage build, user non-root, base image dengan versi dipatok, hanya paket yang dibutuhkan, healthcheck, `.dockerignore` yang mengecualikan `.env` dan data lokal.

**CI (GitHub Actions)**: lint, typecheck, unit test, gitleaks, pnpm audit, build image. Tanpa deploy otomatis ke produksi.

---

## 16. Konfigurasi

Semua nilai di bawah masuk `.env.example` (tanpa nilai rahasia). Nama variabel di AIRI asli mungkin berbeda; padankan di T0.2 dan catat pemetaannya, jangan menebak.

| Variabel | Contoh nilai | Keterangan |
| --- | --- | --- |
| DISCORD_TOKEN | (rahasia) | Token bot |
| OWNER_USER_ID | id numerik | Satu-satunya pemilik perintah admin |
| DISCORD_GUILD_ALLOWLIST | id1,id2 | Guild yang boleh |
| DISCORD_USER_ALLOWLIST | id1,id2 | Pengguna yang boleh memanggil /join |
| ADMIN_WEBHOOK_URL | (rahasia) | Alert ke channel admin |
| GEMINI_API_KEY | (rahasia) | Dari Google AI Studio |
| LLM_PROVIDER, LLM_MODEL | gemini, gemini-3.8-flash [VERIFIKASI] | Model teks dan gambar |
| STT_PROVIDER, STT_MODEL | sesuai T0.5 | Transkripsi |
| TTS_PROVIDER, TTS_MODEL, TTS_VOICE_ID | sesuai T3.3 | Suara karakter |
| LIVE_MODEL | gemini-3.8-live [VERIFIKASI] | Hanya untuk Pipeline B |
| INTERACTION_MODE, WAKE_WORDS | wake, nama bot | Mode dan kata panggil |
| VAD_HANGOVER_MS | 500 | Jeda diam penanda ucapan selesai |
| MAX_UTTERANCE_SEC, MAX_REPLY_SEC | 30, 20 | Batas durasi |
| RATE_LIMIT_PER_MIN | 6 | Per pengguna |
| DAILY_REQUEST_BUDGET, DAILY_TOKEN_BUDGET | sesuai kuota | Batas harian |
| TIMEOUT_STT_MS, TIMEOUT_LLM_MS, TIMEOUT_TTS_MS | 5000, 8000, 5000 | Timeout per tahap |
| MEMORY_DB_URL | file SQLite atau URL Postgres | Penyimpanan memori |
| TRANSCRIPT_RETENTION_DAYS | 7 | Retensi transkrip |
| PERSONA_DIR | persona/ | Lokasi file persona |
| BOT_ENABLED | true | Kill switch |
| LOG_LEVEL, DEBUG_SAVE_AUDIO, HEALTH_PORT | info, false, 8080 | Operasional; DEBUG_SAVE_AUDIO hanya lokal |
