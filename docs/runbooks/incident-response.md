# Runbook Tanggap Darurat Insiden Keamanan (SEC-15)
**Proyek:** Bot-AI (Lyra VTuber AI Discord Bot)  
**Tujuan:** Panduan langkah-demi-langkah mitigasi dan pemulihan insiden keamanan operasional.

---

## 1. Klasifikasi Insiden

| Level Insiden | Deskripsi | Tindakan Pertama |
|---|---|---|
| **P0 - Kritis** | Kredensial bocor (Token Discord / Gemini API Key), eksploitasi jailbreak berbahaya, bot disalahgunakan untuk spam masif | Aktifkan Kill Switch seketika, rotasi token |
| **P1 - Tinggi** | Serangan abuse kuota / DDoS token, percobaan prompt injection intensif, memory leak mendadak | Turunkan kuota harian, isolasi user/guild bermasalah |
| **P2 - Sedang** | Pelanggaran filter konten minor, voice gateway error 4017 berulang | Restart koneksi suara, perbarui konfigurasi allowlist |

---

## 2. Prosedur Tanggap Darurat P0 (Kill Switch & Rotasi Kredensial)

### Langkah 1: Aktifkan Kill Switch Segera
Hentikan aktivitas bot seketika melalui salah satu metode berikut:
1. **Via Discord Command (Admin/Owner):**
   ```text
   /mute
   ```
   Bot akan seketika membekukan seluruh pemrosesan suara, streaming LLM, dan penerimaan teks.
2. **Via Lingkungan Runtime:**
   Ubah variabel lingkungan:
   ```bash
   BOT_ENABLED=false
   ```
   Atau matikan proses container/service (`docker stop bot-ai` atau `pm2 stop bot-ai`).

---

### Langkah 2: Rotasi Secret yang Terkompromi
Jika terjadi dugaan kebocoran secret:
1. **Discord Bot Token**:
   - Buka [Discord Developer Portal](https://discord.com/developers/applications).
   - Masuk ke tab **Bot** -> Klik **Reset Token**.
   - Salin token baru ke file `.env` di server hosting.
2. **Google Gemini API Key**:
   - Buka [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Buat API Key baru.
   - Hapus / Nonaktifkan API Key lama.
   - Perbarui `GEMINI_API_KEY` di file `.env`.
3. **Validasi**:
   - Pastikan secret baru TIDAK PERNAH di-commit ke Git.
   - Jalankan pemindaian secret riwayat Git lokal.

---

### Langkah 3: Forensik & Tinjau Log
Periksa rekaman log terkini untuk mengidentifikasi vektor serangan:
1. Cari user ID atau guild ID yang memicu anomali:
   - Pola injeksi prompt atau payload karakter khusus.
   - Permintaan melebihi batas rate limit normal.
2. Masukkan ID penyerang ke daftar blokir atau hapus dari allowlist:
   - Perbarui variabel `ALLOWED_USERS` dan `ALLOWED_GUILDS` di `.env`.

---

### Langkah 4: Pemulihan Data & Memory Purge
Jika memori bot terkontaminasi instruksi injeksi jahat:
1. Jalankan perintah pembersihan memori:
   ```text
   /forget all
   ```
2. Atau hapus file database SQLite lokal:
   ```bash
   # Hapus database memori yang terkontaminasi
   rm bot-memory.sqlite
   # Mulai ulang bot untuk inisialisasi skema bersih
   ```

---

### Langkah 5: Reaktivasi & Validasi Post-Mortem
1. Aktifkan kembali bot:
   ```text
   /unmute
   ```
   atau `BOT_ENABLED=true`.
2. Jalankan health check otomatis:
   ```bash
   npm test
   ```
3. Susun dokumen Post-Mortem dalam `docs/decisions/` yang mencatat akar penyebab, dampak durasi downtime, dan tindakan perbaikan permanen.
