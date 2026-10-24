# Runbook Operasional Bot-AI (Lyra VTuber AI Discord Bot)
**Proyek:** Bot-AI  
**Task ID:** Task T4.4 (PRD §15, TDD §12, SEC-14, SEC-15)  
**Versi:** 1.0.0 · 23 Oktober 2026

---

## 1. Memulai, Menghentikan, dan Me-restart Bot

### 1.1. Menjalankan di Lingkungan Lokal (PC / Node.js)
```bash
# 1. Mode Pengembangan (Hot-reload dengan tsx)
npm run dev

# 2. Build dan Jalankan Mode Produksi
npm run build
npm start
```

### 1.2. Menjalankan dengan Process Manager (PM2)
Jika bot dijalankan di server mini-PC atau VPS 24/7 (Jalur 2):
```bash
# Instal PM2 secara global jika belum terpasang
npm install -g pm2

# Jalankan bot dengan konfigurasi auto-restart
pm2 start dist/index.js --name "bot-ai-lyra" --max-memory-restart 350M --time

# Memeriksa status dan log
pm2 status
pm2 logs bot-ai-lyra

# Me-restart bot
pm2 restart bot-ai-lyra

# Menghentikan bot
pm2 stop bot-ai-lyra
```

### 1.3. Menjalankan dengan Docker Container
```bash
# Build image Docker
docker build -t bot-ai:latest .

# Jalankan container dengan file .env terisolasi
docker run -d --name bot-ai-instance \
  --restart unless-stopped \
  --env-file .env \
  -v bot_data:/app/data \
  bot-ai:latest

# Memeriksa log container
docker logs -f bot-ai-instance

# Menghentikan container
docker stop bot-ai-instance
```

---

## 2. Prosedur Rotasi Secret & Token Kredensial (SEC-1, SEC-2, SEC-15)

Lakukan rotasi segera jika token terindikasi terkompromi atau sebagai bagian dari pemeliharaan berkala tiap 90 hari:

### 2.1. Rotasi Token Discord Bot
1. Kunjungi [Discord Developer Portal](https://discord.com/developers/applications).
2. Pilih aplikasi Bot Anda ➔ Masuk ke menu **Bot**.
3. Klik tombol **Reset Token** dan konfirmasikan dengan 2FA.
4. Salin token baru.
5. Perbarui nilai `DISCORD_TOKEN` di file `.env` server hosting:
   ```env
   DISCORD_TOKEN=Token_Baru_Anda_Di_Sini
   ```
6. Lakukan restart proses (`pm2 restart bot-ai-lyra` atau `docker restart bot-ai-instance`).
7. Verifikasi log: pastikan bot berhasil login sebagai `readyClient.user.tag`.

### 2.2. Rotasi Google Gemini API Key
1. Buka [Google AI Studio - API Keys](https://aistudio.google.com/app/apikey).
2. Buat API Key baru.
3. Perbarui variabel `GEMINI_API_KEY` di file `.env`:
   ```env
   GEMINI_API_KEY=AIzaSy_Kunci_Baru_Anda
   ```
4. Restart proses bot.
5. Uji respons teks dengan perintah `/chat pesan: Halo Lyra`.
6. Hapus API Key lama di dashboard Google AI Studio setelah kunci baru terverifikasi normal.

---

## 3. Pemantauan & Analisis Log Operasional (TDD §12)

Log dicetak dalam format terstruktur dengan penyaringan sensor kredensial otomatis (`redactSensitiveCredentials`):

### 3.1. Level Log
- **`INFO` (Default)**: Menampilkan status lifecycle koneksi, ID giliran (`turn_id`), durasi latensi, serta ringkasan pesan tanpa menyimpan rekaman suara.
- **`WARN`**: Mencatat timeout jaringan, retrying koneksi WebSocket TTS, atau penggunaan frasa fallback persona.
- **`ERROR`**: Mencatat kegagalan API provider, kegagalan rekoneksi voice gateway, atau error unhandled.
- **`DEBUG`**: Hanya aktif saat pengembangan lokal jika `LOG_LEVEL=debug` dan `DEBUG_SAVE_AUDIO=true`.

### 3.2. Memeriksa Log
```bash
# Log PM2
pm2 logs bot-ai-lyra --lines 100

# Memeriksa log benchmark latensi terstruktur JSONL
tail -n 20 logs/latency.jsonl

# Mencari error atau peringatan pada log
grep -E "WARN|ERROR|429|ETIMEDOUT" logs/app.log
```

---

## 4. Pengoperasian Kill Switch & Pengendalian Biaya (FR-A2, FR-A3, SEC-6, SEC-14)

Jika bot menunjukkan perilaku abnormal, spam, atau terjadi serangan banjir kuota:

### 4.1. Kill Switch Instan via Discord (Owner Only)
1. Kirim slash command di server yang diizinkan:
   ```text
   /mute
   ```
2. Bot akan membekukan seluruh pemrosesan suara, audio streaming, dan respons pesan teks seketika.
3. Untuk menyalakan kembali:
   ```text
   /unmute
   ```

### 4.2. Kill Switch via Lingkungan Sistem
Ubah konfigurasi di file `.env`:
```env
BOT_ENABLED=false
```
Lakukan reload proses. Bot akan mengabaikan seluruh permintaan pesan dan percakapan suara sampai flag diubah kembali ke `true`.

---

## 5. Prosedur Rollback Versi & Pemuatan Ulang Persona (FR-P1)

### 5.1. Hot-Reload Persona (Tanpa Downtime)
Jika ingin memperbarui gaya bicara, aturan keselamatan, atau kamus pelafalan fonetik tanpa me-restart bot:
1. Sunting berkas di folder `persona/` (`character.md`, `rules.md`, `voice-style.md`, `lexicon.json`).
2. Jalankan slash command di Discord:
   ```text
   /persona reload
   ```
3. Bot akan memperbarui profil persona di memori RAM dan mengonfirmasi versi baru aktif.

### 5.2. Rollback Kode Git
Jika rilis versi kode terbaru menyebabkan regresi atau bug:
```bash
# 1. Kembali ke commit stabil sebelumnya
git checkout <commit-hash-stabil>

# 2. Kompilasi ulang
npm run build

# 3. Restart proses
pm2 restart bot-ai-lyra
```

---

## 6. Prosedur Pencadangan & Pemulihan Basis Data (SEC-14, Task T4.4)

### 6.1. Membuat Backup Harian (Manual / Cron)
Gunakan skrip `scripts/backup-db.ts`:
```bash
# 1. Backup standar tidak terenkripsi
npx tsx scripts/backup-db.ts

# 2. Backup terenkripsi AES-256-GCM (Direkomendasikan untuk upload offsite)
BACKUP_ENCRYPTION_KEY="kunci-enkripsi-rahasia-anda" npx tsx scripts/backup-db.ts
```
Berkas backup akan tersimpan di direktori `backups/` dengan penamaan:
`backups/memory-backup-YYYY-MM-DD-HHmmss.sqlite` (atau `.sqlite.enc`).

#### Menjadwalkan Backup Otomatis Harian (Linux Cron)
Tambahkan ke `crontab -e`:
```text
0 3 * * * cd /opt/bot-ai && BACKUP_ENCRYPTION_KEY="kunci-rahasia" /usr/bin/npx tsx scripts/backup-db.ts >> /var/log/bot-backup.log 2>&1
```

### 6.2. Memulihkan Basis Data dari Backup (Disaster Recovery)
Gunakan skrip `scripts/restore-db.ts`:
```bash
# 1. Restore dari backup standar
npx tsx scripts/restore-db.ts backups/memory-backup-2026-10-23T07-12-27.sqlite

# 2. Restore dari backup terenkripsi AES-256-GCM
BACKUP_ENCRYPTION_KEY="kunci-enkripsi-rahasia-anda" npx tsx scripts/restore-db.ts backups/memory-backup-2026-10-23T07-12-27.sqlite.enc
```
Skrip akan secara otomatis:
1. Memvalidasi format enkripsi dan melakukan dekripsi data.
2. Memverifikasi integritas header SQLite 3 (`SQLite format 3`).
3. Membuat salinan cadangan pengaman dari database aktif (`data/memory.sqlite.pre-restore-TIMESTAMP`).
4. Mengganti berkas database secara aman.

---

## 7. Sistem Peringatan Webhook Admin (FR-A4, TDD §12)

Bot secara otomatis mengirim notifikasi Discord embed ke URL webhook admin (`ADMIN_WEBHOOK_URL`) saat:
1. **Restart Pasca-Crash**: Memberikan peringatan bahwa proses baru saja pulih.
2. **Koneksi Voice Reconnect > 3x/Jam**: Memberikan sinyal gangguan jaringan Discord UDP gateway.
3. **Kegagalan Provider > 20% dalam 5 Menit**: Peringatan gangguan API Gemini atau TTS.
4. **Anggaran Harian Mencapai 80%**: Peringatan degradasi batas token harian.

Untuk mengatur webhook alert:
1. Buka channel teks admin di Discord ➔ **Channel Settings** ➔ **Integrations** ➔ **Webhooks**.
2. Buat webhook baru dan salin URL-nya.
3. Masukkan ke file `.env`:
   ```env
   ADMIN_WEBHOOK_URL=https://discord.com/api/webhooks/xxxx/yyyy
   ```
