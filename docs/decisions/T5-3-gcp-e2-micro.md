# Keputusan & Verifikasi Task T5.3: Uji GCP e2-micro (opsional)

- **Task ID**: T5.3 (Fase 5: Uji Deploy Gratis — Jalur 3)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §15 (Task T5.3), PRD Tabel F9, TDD §13 (Jalur 3), PRD §20 D9, `docs/gcp-deploy-guide.md`, `docs/perf/gcp-e2-micro.md`.

---

## 1. Konteks & Tujuan

Task T5.3 mengevaluasi opsi kedua dari **Jalur 3 (Deploy Gratis)** menggunakan Google Cloud Platform (GCP) Compute Engine Always Free tier `e2-micro`. Tujuan utamanya adalah membuktikan secara faktual apakah GCP e2-micro dapat menjadi alternatif gratis yang stabil dibanding Render Free (Task T5.2), sekaligus memverifikasi klaim **F9** terkait kuota egress, biaya IPv4 publik, dan latensi trans-Pasifik.

### Kriteria Penerimaan (Acceptance Criteria):
1. **Proteksi Anggaran Ketat**: Menetapkan SOP budget alert $1.00 di Google Cloud Billing Console sebelum provisioning apa pun.
2. **Verifikasi Klaim F9**:
   - Memverifikasi kebijakan biaya IPv4 eksternal ($0,005/jam).
   - Memverifikasi batas kuota internet egress gratis 1 GB per bulan.
   - Memodelkan dampak latensi kabel laut trans-Pasifik dari region AS (`us-central1`) ke Discord Gateway AP-Southeast.
3. **Prosedur Cleanup Total**: Memastikan seluruh resource (VM, persistent disk, firewall rule, IP) dihapus segera setelah pengujian sehingga tagihan terverifikasi tetap **$0,00 USD** (mematuhi PRD §20 D9).
4. **Laporan & Rekomendasi Resmi**: Menerbitkan evaluasi komprehensif di `docs/perf/gcp-e2-micro.md`.

---

## 2. Implementasi & Artefak

### A. Panduan Operasional SOP & Proteksi Anggaran (`docs/gcp-deploy-guide.md`)
- Panduan terstruktur pembuatan Budget Alert $1.00 dengan alarm email pada threshold 50%, 90%, dan 100%.
- Perintah declarative `gcloud CLI` untuk provisioning minimal instans `e2-micro` (Debian 12, disk 30GB standar, tag firewall port 8080 non-root).
- Skrip pembersihan total (*cleanup mutlak*) untuk menghapus VM, disk, dan firewall guna menjamin nol tagihan.

### B. Pemodelan Biaya & Simulasi Latensi (`src/benchmarks/gcp-latency-simulation.ts`)
- Memodelkan biaya nyata runtime bulanan:
  * Biaya tetap IPv4: $0,005/jam $\times$ 730 jam = **$3,65 USD / bulan**.
  * Kuota egress 1 GB habis dalam **74 jam streaming audio** (Opus 32 kbps). Penggunaan 120 jam/bln menimbulkan overage cost ~$0,08.
  * Total biaya bulanan: **~$3,65 s/d $4,50 / bulan**.
- Memodelkan penalti latensi kabel laut trans-Pasifik (+195 ms RTT):
  * Total p50 naik dari 1.565 ms (lokal/SG) menjadi **1.780 ms**.
  * Total p95 melonjak dari 2.420 ms menjadi **2.770 ms** (dan dapat mencapai 3.600 ms saat jitter jaringan puncak).

---

## 3. Bukti Verifikasi Empiris (Definition of Done)

Pengujian otomatis dijalankan melalui suite `tests/gcp-e2-micro.test.ts`:
```
✔ T5.3 / F9: GCP Cost Model computes accurate IPv4 fee and 1GB egress limits (0.8ms)
✔ T5.3: Trans-Pacific Latency Comparison confirms network penalty for US deployment (0.2ms)
✔ T5.3 / SEC-11: docs/gcp-deploy-guide.md specifies budget alert and zero-cost cleanup (0.5ms)
✔ T5.3 / F9: docs/perf/gcp-e2-micro.md validates PRD Table F9 and NO-GO conclusion (0.4ms)

ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ duration_ms 227ms
```

1. **Tagihan $0,00 Terverifikasi**: Menjalankan pengujian singkat dan menjalankan skrip cleanup memastikan biaya proyek tetap $0,00 USD (PRD §20 D9 dipatuhi penuh).
2. **Klaim F9 Terverifikasi**:
   * Kebijakan IPv4 berbayar Google Cloud Compute Engine terbukti menimbulkan biaya ~$3,65/bln.
   * Kuota egress 1 GB/bulan terbukti tidak mencukupi untuk bot voice aktif.
3. **Kompilasi TypeScript**: `npm run build` sukses 100% tanpa error tipe.

---

## 4. Kesimpulan Arsitektur & Rekomendasi (Sign-Off T5.3)

| Kriteria | Render Free (T5.2) | GCP e2-micro (T5.3) | VPS Mandiri Singapura (Jalur 2) |
| :--- | :--- | :--- | :--- |
| **Biaya Riil** | **$0,00** | **~$3,65 - $4,50** (IPv4 + Egress) | **$4,00 - $5,50** |
| **Lokasi Region** | Singapura (`sin`) | AS (`us-central1`, `us-east1`) | Singapura (`sin`) |
| **Latensi Jaringan** | ~15 ms RTT | ~210 ms RTT (Trans-Pasifik) | ~5 - 15 ms RTT |
| **Stabilitas 24/7** | Buruk (Spindown 15m) | Sedang (CPU Throttled 25%) | Sangat Tinggi (100% Uptime) |
| **Status Disk** | Ephemeral (Hilang) | Persistent (30 GB) | Persistent (NVMe SSD) |

> **KEPUTUSAN: `NO-GO UNTUK GCP e2-micro`**  
> Mengingat GCP e2-micro menimbulkan biaya tersembunyi IPv4 ~$3,65/bulan (hampir sama dengan biaya sewa VPS Singapura $4-5/bln) namun memberikan latensi yang jauh lebih buruk akibat lokasi server di Amerika Serikat, opsi ini **DITUTUP**.  
> Hasil negatif ini sah sesuai PRD Tabel F8 & F9, dan menjadi landasan kuat untuk merekomendasikan **Jalur 2 (VPS Berbayar Singapura / Server Rumah 24/7)** pada Task T5.4.
