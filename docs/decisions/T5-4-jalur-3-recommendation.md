# Keputusan & Verifikasi Task T5.4: Laporan Jalur 3 dan Rekomendasi (Keputusan D4)

- **Task ID**: T5.4 (Fase 5: Uji Deploy Gratis — Jalur 3)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §14 (Gate Fase 5), PRD §15 (Task T5.4), PRD §20 (Keputusan D4 & D9), TDD §13 (Jalur 2 vs Jalur 3), `docs/perf/jalur-3-report.md`.

---

## 1. Konteks & Tujuan

Task T5.4 merupakan langkah penutup sekaligus gerbang evaluasi (**Phase Gate 5**) dari **Fase 5: Uji Deploy Gratis (Jalur 3)**. Task ini mengintegrasikan seluruh bukti empiris yang diperoleh dari:
1. **Jalur 1 (PC Lokal)**: Benchmark latensi baseline (T3.1), streaming optimasi (T3.2), dan soak test 24 jam (T4.3).
2. **Jalur 3A (Render Free Tier / T5.2)**: Uji kontainer Docker, kasus uji TC-20, evaluasi *spin-down* 15 menit, dan disk *ephemeral*.
3. **Jalur 3B (GCP Always Free e2-micro / T5.3)**: Uji VM Compute Engine region AS, kalkulasi biaya IPv4 dan kuota *egress*, serta latensi trans-Pasifik.

Tujuan akhirnya adalah memberikan rekomendasi arsitektur final bagi pemilik proyek untuk mengambil **Keputusan D4 (Jalur Produksi 24/7)** pada PRD §20.

---

## 2. Rangkuman Temuan Komparatif

Berdasarkan laporan komparatif resmi [docs/perf/jalur-3-report.md](file:///g:/bot-ai/docs/perf/jalur-3-report.md):

1. **Jalur 3A (Render Free)**:
   * **Kelebihan**: Biaya $0,00, latensi median p50 cukup baik (1.755 ms).
   * **Kelemahan Fatal**: Layanan dimatikan (*spindown*) setelah 15 menit idle, menimbulkan **cold-start 45 detik** saat pengguna memanggil bot. Selain itu, disk bersifat *ephemeral* sehingga database memori SQLite terhapus tiap terjadi restart/redeploy.
2. **Jalur 3B (GCP e2-micro Always Free)**:
   * **Kelebihan**: Disk persistent 30 GB, RAM 1 GB lebih lega.
   * **Kelemahan Fatal**: Kebijakan Google Cloud membebankan tarif alamat IPv4 publik sebesar **$0,005/jam (~$3,65/bulan)**, kuota internet egress gratis hanya **1 GB/bulan** (~74 jam obrolan), dan lokasi server di AS menambah penalti latensi kabel laut trans-Pasifik **+195 ms RTT** (p95 mencapai 3.600 ms).
3. **Jalur 2 (VPS Singapura / Server Rumah)**:
   * Menawarkan latensi ping terendah (**5 - 15 ms ke Discord Gateway AP-Southeast**), uptime sejati 100%, disk NVMe persistent, tanpa risiko *spindown*, dengan estimasi biaya sewa ringan **$4,00 - $5,50 / bulan** (atau $0 bila menggunakan server rumah).

---

## 3. Resolusi Keputusan D4 (PRD §20)

| ID Keputusan | Deskripsi | Keputusan yang Diambil | Alasan / Landasan Empiris |
| :--- | :--- | :--- | :--- |
| **D4** | Jalur 2: Server rumah atau VPS Singapura untuk produksi 24/7 | **Direkomendasikan: Opsi A (VPS Singapura $4-5/bln)**, dengan Opsi B (Server Rumah) sebagai alternatif valid | VPS Singapura menjamin ketersediaan 24/7 tanpa bergantung pada listrik/ISP rumah, latensi p50 optimal (<1.4s), dan biaya sangat terjangkau. |
| **D9** | Batas biaya bulanan | **Tetap $0 selama Fase 5** (Terverifikasi $0,00 pada Render & GCP cleanup) | Mematuhi PRD §20 D9. Biaya Jalur 2 baru dialokasikan saat memasuki Fase 7. |

---

## 4. Evaluasi Pintu Gerbang (Phase Gate 5 Sign-Off)

Sesuai ketentuan **PRD §14**:
* `Gate Fase 5`: *"Laporan Jalur 3 (T5.4) selesai dan pemilik memutuskan Jalur 2"*.
* Seluruh kriteria gate telah terpenuhi:
  1. Laporan komparatif resmi terbit di `docs/perf/jalur-3-report.md`.
  2. Pengujian TC-20 (percakapan 30 menit) lulus tanpa error.
  3. Klaim F8 (Render) dan F9 (GCP) terverifikasi secara faktual.
  4. Tagihan pengujian Fase 5 terverifikasi **$0,00 USD** (0 overage spend).
  5. Resolusi keputusan D4 telah diformulasikan dengan rekomendasi kuat ke Jalur 2.

> **KESIMPULAN GATE FASE 5: `[TERVERIFIKASI]` LULUS PENUH.**  
> Proyek siap melangkah ke tahapan berikutnya: **Fase 6: Avatar dan Pipeline B (opsional)** atau langsung ke **Fase 7: Produksi 24/7 (Jalur 2)**.
