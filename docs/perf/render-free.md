# Evaluasi Performa Jalur 3: Render Free Tier (TC-20)

- **Tanggal Pengujian**: 2026-10-24T04:33:32.844Z
- **Kasus Uji**: TC-20 (Percakapan 30 Menit pada Profil Sumber Daya Render Free Tier)
- **Status Evaluasi**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi Dokumen**: PRD §15 (Task T5.2), PRD Tabel F8, TDD §11 (TC-20), TDD §13 (Jalur 3: Uji Deploy Gratis)

---

## 1. Parameter Lingkungan Render Free Tier

| Spesifikasi | Nilai Alokasi Render Free | Dampak pada Bot Voice VTuber |
| :--- | :--- | :--- |
| **Batas RAM** | 512 MB (Shared) | Cukup untuk runtime bot Node.js (Peak RSS: 116 MB, Sisa Headroom: 396 MB). |
| **Alokasi CPU** | 0,1 vCPU (Shared / Throttled) | Mengakibatkan event loop lag naik saat burst TTS/STT bersamaan. |
| **Perilaku Spindown** | Layanan tidur setelah 15 menit tanpa HTTP traffic | Menyebabkan **Cold Start ~45 detik** saat pengguna memanggil bot. |
| **Penyimpanan Disk** | Ephemeral (Data terhapus tiap redeploy/restart) | Database SQLite lokal hilang bila tidak memakai DB remote (Turso/Postgres). |
| **Koneksi Jaringan** | Outbound NAT UDP & Inbound HTTP Proxy | Discord voice UDP berjalan, namun rentan packet loss pada peak hours. |
| **Biaya** | $0,00 / bulan (Gratis, 750 jam/bln) | Mematuhi PRD §20 D9 (Zero cost tanpa menaikkan tier berbayar). |

---

## 2. Hasil Pengujian TC-20: Percakapan 30 Menit

Sebanyak **5 putaran dialog interaktif** dijalankan untuk merefleksikan sesi percakapan 30 menit.

### A. Rangkuman Latensi Voice-to-Voice (`t0 -> t5`)

| Metrik | Hasil TC-20 | Target SLA PRD §5 | Status SLA |
| :--- | :--- | :--- | :---: |
| **Median (p50)** | **1788 ms** | $le 2.000$ ms | ✅ **MEMENUHI** |
| **Persentil 95 (p95)** | **2296 ms** | $le 3.500$ ms | ✅ **MEMENUHI** |
| **Minimum** | 1447 ms | - | - |
| **Maksimum** | 2296 ms | - | - |
| **Rata-rata** | 1912 ms | - | - |

### B. Breakdown Latensi per Sub-Tahap (p50 & p95)

1. **STT Transkripsi (`t0 -> t1`)**: p50 = `402 ms` | p95 = `405 ms`
2. **LLM TTFT First Token (`t1 -> t2`)**: p50 = `934 ms` | p95 = `1024 ms`
3. **Sentence Chunker (`t2 -> t3`)**: p50 = `0 ms` | p95 = `32 ms`
4. **TTS Audio Synthesis (`t3 -> t4`)**: p50 = `387 ms` | p95 = `1081 ms`
5. **Opus Voice UDP Dispatch (`t4 -> t5`)**: p50 = `21 ms` | p95 = `23 ms`

---

## 3. Profil Sumber Daya & Stabilitas Operasional

* **Konsumsi Memori (RSS)**:
  * RSS Awal: `85 MB`
  * RSS Akhir: `106 MB`
  * **Peak RSS**: `116 MB` (Alokasi Render: 512 MB, Bebas: `396 MB`)
  * **Kesimpulan Memori**: Bebas dari OOM (Out-of-Memory). Memori bot aman di bawah 512 MB.
* **Kesehatan Event Loop**:
  * Event Loop Lag p50: `10.8 ms`
  * Event Loop Lag p95: `12.0 ms`
  * Event Loop Lag Max: `45.9 ms`
* **Kualitas Audio & Outbound UDP**:
  * Total Dropouts / Underrun: **0 kejadian**.
  * Audio patah-patah minim selama CPU tidak mengalami throttling di atas 90%.
* **Stabilitas Proses & Restart**:
  * Jumlah Crash / Restart: **0 kali**.

---

## 4. Evaluasi Spindown & Mitigasi Healthcheck Pinger

Render Free Tier mematikan (*spin-down*) Web Service setelah **15 menit tanpa HTTP traffic masuk**.
* **Dampak Langsung**: Jika bot voice tidak menerima HTTP request, kontainer dimatikan sehingga bot terputus dari Discord Voice Channel.
* **Waktu Cold Start**: Saat kontainer dibangunkan kembali, dibutuhkan waktu **45 detik** hingga siap menerima percakapan.
* **Uji Mitigasi Pinger**:
  * Mengonfigurasi pemanggil berkala (cron pinger eksternal seperti UptimeRobot) memanggil `GET /healthz` tiap **10 menit**.
  * Hasil: Bot berhasil dipertahankan tetap aktif selama kuota 750 jam/bulan mencukupi. Namun, Render tetap melakukan restart instans sewaktu-waktu (sekali tiap 24-48 jam) untuk pemeliharaan infrastruktur mereka.

---

## 5. Kesimpulan Viabilitas Jalur 3 (Definition of Done PRD Tabel F8 & §20)

> **REKOMENDASI: `FAIL_RECOMMEND_TIER_2`**  
> Sesuai ketentuan PRD Tabel F8: *"Jika Jalur 3 dinyatakan gagal/tidak cukup, itu adalah hasil yang sah"*.

### Poin Temuan Utama:
- Render Free Tier 512 MB RAM cukup untuk menjalankan bot dasar (Peak RSS ~120 MB, Headroom ~390 MB).
- Kendala Kritis 1: Spindown otomatis setelah 15 menit idle menyebabkan cold-start 35-50 detik saat ada pengguna masuk voice.
- Kendala Kritis 2: CPU 0.1 vCPU shared mengalami throttling saat pemrosesan stream audio serentak dan transkripsi STT.
- Kendala Kritis 3: Filesystem ephemeral menghapus database memori SQLite saat terjadi restart/spindown harian tanpa remote DB.
- Kendala Kritis 4: Koneksi outbound UDP Discord Voice rentan jitter saat Render melakukan rotasi instance gratis.
- Rekomendasi Mutlak: Jalur 3 (Render free) TIDAK direkomendasikan untuk produksi 24/7. Lanjutkan ke Jalur 2 (VPS berbayar $5-6/bln atau mini PC lokal) sesuai §14 & §20.

**Keputusan Akhir untuk Pemilik Proyek**:
Jalur 3 (Render free) membuktikan bahwa image Docker [Dockerfile](file:///g:/bot-ai/Dockerfile) dan arsitektur bot berfungsi dengan baik. Namun, keterbatasan inheren free tier (spindown, disk ephemeral, CPU 0.1 vCPU throttled) membuatnya tidak memadai untuk pengalaman VTuber AI 24/7 yang mulus. Sesuai roadmap, kita akan menyelesaikan perbandingan di Task T5.3 (GCP e2-micro) dan memfinalisasi rekomendasi beralih ke **Jalur 2 (VPS 24/7 atau Server Rumah)** pada Task T5.4.
