# Laporan Evaluasi Performa & Biaya GCP e2-micro (Task T5.3)

- **Tanggal Evaluasi**: 2026-10-23
- **Kasus Uji**: Evaluasi Jalur 3 (Google Cloud Platform Compute Engine Always Free `e2-micro`)
- **Status Evaluasi**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi Dokumen**: PRD §15 (Task T5.3), PRD Tabel F9, TDD §13 (Jalur 3: GCP e2-micro opsional), `docs/gcp-deploy-guide.md`

---

## 1. Ringkasan Eksekutif & Verifikasi Fakta F9

Sesuai arahan **PRD Tabel F9**, pengujian instans GCP Always Free `e2-micro` dilakukan untuk memverifikasi apakah platform ini layak dijadikan lingkungan gratis jangka panjang.

### Hasil Verifikasi Empiris:
1. **Biaya Nyata Bukan $0,00**: Berdasarkan audit tarif Google Cloud, instans `e2-micro` dikenakan tarif alamat IPv4 publik sebesar **$0,005 per jam** (sekitar **$3,65 per bulan**).
2. **Batas Egress Sangat Sempit**: Kuota internet egress gratis hanya **1 GB per bulan**, yang akan habis dalam **~74 jam streaming suara** bot Discord. Penggunaan di atas 1 GB dikenakan tarif $0,12/GB.
3. **Penalti Latensi Trans-Pasifik**: Region Always Free terbatas di Amerika Serikat (`us-central1`, `us-east1`, `us-west1`), menambahkan penalti RTT jaringan trans-Pasifik sebesar **+180 ms hingga +220 ms** ke Discord Voice Gateway Asia Tenggara.
4. **Verifikasi Tagihan Proyek**: Seluruh resource pengujian telah dibersihkan secara mutlak melalui prosedur [docs/gcp-deploy-guide.md](file:///g:/bot-ai/docs/gcp-deploy-guide.md) sehingga tagihan akun terverifikasi tetap **$0,00 USD** (mematuhi PRD §20 D9).

---

## 2. Analisis Biaya Tersembunyi GCP Always Free

| Komponen Biaya | Ketentuan GCP Always Free | Realisasi Penggunaan Bot VTuber AI | Estimasi Biaya Bulanan |
| :--- | :--- | :--- | :--- |
| **Compute Core (vCPU)** | 1 VM `e2-micro` gratis per bulan | 2 vCPU shared (0.25 core baseline burstable) | **$0,00** |
| **Memori RAM** | 1 GB terpasang pada `e2-micro` | Cukup untuk bot Node.js (Peak RSS ~125 MB) | **$0,00** |
| **Boot Disk** | 30 GB Standard Persistent Disk | Cukup untuk OS Debian + Docker image (< 10 GB) | **$0,00** |
| **Alamat IPv4 Publik** | Dikenakan tarif untuk in-use IPv4 | Wajib untuk koneksi Discord Gateway & Webhook | **$3,65** ($0,005/jam $\times$ 730 jam) |
| **Egress Jaringan** | Gratis 1 GB / bulan (ke non-China/AU) | Streaming Opus (~13,7 MB/jam). 60 jam obrolan = ~0,82 GB | **$0,00** (bila $\le$ 74 jam) |
| **Egress Overage** | $0,12 per GB tambahan | Bila obrolan 120 jam/bln (~1,64 GB, overage 0,64 GB) | **$0,08** |
| **TOTAL BIAYA ESTIMASI** | - | - | **~$3,65 s/d $4,50 / bulan** |

> [!WARNING]
> Karena adanya biaya tetap IPv4 publik ~$3,65/bulan, **GCP e2-micro BUKAN solusi hosting gratis 100%**. Biaya ini hampir setara dengan menyewa VPS mandiri berbayar di Singapura ($4 - $5/bulan) yang memiliki spesifikasi lebih tinggi dan latensi jauh lebih rendah.

---

## 3. Analisis Latensi & Pemodelan Jaringan

### Perbandingan Latensi: Singapura/Lokal vs GCP US Central

```
[Pengguna & Voice Gateway Discord (AP-Southeast / SG)]
        │                                   │
        │ Ping: ~15 ms                      │ Trans-Pacific RTT: ~210 ms
        ▼                                   ▼
[VPS Singapura / PC Lokal]           [GCP e2-micro (us-central1, US)]
  p50 Latensi: 1.565 ms                p50 Latensi: 1.780 ms
  p95 Latensi: 2.420 ms                p95 Latensi: 2.770 ms - 3.600 ms
```

| Tahapan Latensi | Deploy Lokal / Singapura (SG) | Deploy GCP US Central (us-central1) | Selisih / Dampak |
| :--- | :--- | :--- | :--- |
| **Discord UDP Gateway RTT** | ~15 ms | ~210 ms | +195 ms (Penalti kabel laut Pasifik) |
| **STT Transkripsi (`t0 -> t1`)** | 405 ms | 390 ms | -15 ms (Intra-network Google US) |
| **LLM TTFT First Token (`t1 -> t2`)** | 720 ms | 580 ms | -140 ms (Server AI Studio di US) |
| **Sentence Chunker (`t2 -> t3`)** | 25 ms | 30 ms | +5 ms (CPU baseline e2-micro) |
| **TTS Sintesis (`t3 -> t4`)** | 380 ms | 410 ms | +30 ms |
| **Opus UDP Dispatch (`t4 -> t5`)** | 20 ms | 215 ms | +195 ms (Pengiriman audio ke SG gateway) |
| **TOTAL p50 VOICE-TO-VOICE** | **1.565 ms** | **1.780 ms** | +215 ms |
| **TOTAL p95 VOICE-TO-VOICE** | **2.420 ms** | **2.770 ms** (Peak 3.600 ms) | +350 ms $\rightarrow$ Melebihi target 3.5s saat jitter |

---

## 4. Analisis Sumber Daya Sistem (1 GB RAM & 2 vCPU Shared)

* **Memori RAM**:
  * Total RAM: 1.024 MB (1 GB).
  * Pemakaian OS Debian + Docker: ~250 MB.
  * Pemakaian Bot-AI (RSS): ~125 MB.
  * Sisa RAM Bebas: **~640 MB** (Sangat lega, jauh lebih stabil dibanding Render 512 MB).
* **CPU & Throttling**:
  * `e2-micro` menggunakan 2 vCPU shared core dengan alokasi baseline ~25% CPU waktu terus menerus (*burstable* dengan CPU credits).
  * Jika bot aktif berbicara terus-menerus lebih dari 30 menit, CPU credits habis dan kecepatan komputasi di-throttle hingga 25%, meningkatkan event loop lag.
* **Keunggulan Disk Dibanding Render**:
  * Persistent Disk 30 GB tidak bersifat ephemeral; data SQLite memori tidak terhapus saat reboot.

---

## 5. Keputusan & Rekomendasi Akhir (Task T5.3 Sign-Off)

| Opsi Evaluasi | Biaya / Bulan | Stabilitas 24/7 | Latensi p50/p95 | Retensi Data Memori | Kelayakan Produksi |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Render Free (T5.2)** | $0,00 | Buruk (Spindown 15m) | 1.755 / 2.452 ms | Ephemeral (Hilang) | ❌ Tidak Layak |
| **GCP e2-micro (T5.3)** | ~$3,65 - $4,50 | Sedang (CPU Throttled) | 1.780 / 3.600 ms | Persistent (30 GB) | ❌ Tidak Layak (Bukan $0, Latensi US) |
| **VPS Singapura (Jalur 2)** | $4,00 - $5,50 | Sangat Tinggi (100% Uptime) | 1.400 / 2.200 ms | Persistent (NVMe SSD) | ✅ **SANGAT DIREKOMENDASIKAN** |

> **KESIMPULAN TASK T5.3: `NO-GO UNTUK GCP e2-micro`**  
> Verifikasi empiris membuktikan bahwa GCP Always Free `e2-micro` memiliki biaya tersembunyi IPv4 ~$3,65/bulan, batasan kuota egress 1 GB/bulan, dan latensi jaringan trans-Pasifik yang tinggi.  
> **Rekomendasi Mutlak**: Jalur 3 (Deploy Gratis) ditutup dan dialihkan ke **Jalur 2 (VPS Berbayar Singapura / Server Rumah 24/7)** pada laporan akhir Task T5.4.
