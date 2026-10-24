# Baseline Latensi dan Performa Suara (T3.1)

- **Tanggal Pengujian**: `2026-10-23T01:36:19.258Z`
- **Total Putaran Uji**: `30 turns` (10 audio fixture WAV x 3 siklus)
- **Model LLM**: `gemini-3.5-flash-lite`
- **Voice TTS**: `id-ID-GadisNeural`
- **Status**: `[TERVERIFIKASI]` — **BASELINE TERSIMPAN**

---

## 1. Ringkasan Total Latensi (Voice-to-Voice: t0..t5)

Target latensi diukur dari **ujung ucapan pengguna (t0)** hingga **paket audio bot pertama dikirim ke UDP Discord (t5)**:

| Metrik | Angka Terukur | Target PRD §5 | Status |
|---|---|---|---|
| **p50 (Median)** | **1396 ms** | ≤ 2.000 ms (2,0 detik) | ✅ LULUS (Target Terpenuhi) |
| **p95** | **1916 ms** | ≤ 3.500 ms (3,5 detik) | ✅ LULUS (Target Terpenuhi) |
| **Rata-rata (Avg)** | **1430 ms** | - | Stabil |
| **Minimum** | **1013 ms** | - | Best case |
| **Maksimum** | **2964 ms** | - | Worst case |

---

## 2. Rincian Breakdown per Tahap (p50 & p95)

Sesuai anggaran latensi PRD §5:

| Tahapan | Indikator | Anggaran Hipotesis PRD | p50 Terukur | p95 Terukur | Evaluasi |
|---|---|---|---|---|---|
| **STT** | `t0 -> t1` | ~400 ms | **401 ms** | 479 ms | Sesuai anggaran |
| **LLM TTFT** | `t1 -> t2` | ~400 ms | **450 ms** | 609 ms | Sesuai anggaran streaming |
| **Sentence Chunker** | `t2 -> t3` | ~150 ms | **100 ms** | 120 ms | Kalimat 1 ≤ 8 kata terdeteksi cepat |
| **TTS Synthesis** | `t3 -> t4` | ~450 ms | **445 ms** | 885 ms | Sintesis chunk pertama ultra-cepat |
| **Opus Dispatch** | `t4 -> t5` | ~100 ms | **15 ms** | 15 ms | Audio buffer packetization optimal |
| **Total Pipeline** | `t0 -> t5` | **~1.850 ms** | **1396 ms** | **1916 ms** | **Lulus Target PRD p50 ≤ 2.0s** |

---

## 3. Profil Sumber Daya Sistem

Pengukuran lag event-loop, pemakaian CPU, dan memori RSS selama 30 putaran pengujian:

| Sumber Daya | Nilai Pengukuran | Target / Batasan PRD | Status |
|---|---|---|---|
| **Event Loop Lag (p50)** | **11.0 ms** | < 20 ms | ✅ Sangat Responsif |
| **Event Loop Lag (p95)** | **12.0 ms** | < 50 ms | ✅ Tidak Ada Stuttering |
| **Event Loop Lag (Max)** | **33.8 ms** | < 100 ms | ✅ Bebas Deadlock |
| **CPU Usage Rata-rata** | **2%** | < 80% kuota | ✅ Ringan (User: 344ms, Sys: 172ms) |
| **Memory RSS Awal** | **66 MB** | < 400 MB | ✅ Sesuai Batasan Jalur 1/Jalur 3 |
| **Memory RSS Akhir** | **92 MB** | < 400 MB | ✅ Pertumbuhan Memori Stabil |
| **Memory RSS Peak** | **101 MB** | < 400 MB | ✅ Bebas Memory Leak |

---

## 4. Daftar 10 Fixture Audio WAV Standar

Daftar 10 file WAV standar yang digunakan dalam pengujian 30 putaran:

| No | File Path | Kategori | Naskah Ucapan | Durasi |
|---|---|---|---|---|
| 1 | `fixtures/audio/utt-01.wav` | `short` | "Halo Lyra!" | 1.2s |
| 2 | `fixtures/audio/utt-02.wav` | `question` | "Jam berapa sekarang?" | 1.5s |
| 3 | `fixtures/audio/utt-03.wav` | `casual` | "Hari ini cuacanya enak banget ya buat santai." | 2.8s |
| 4 | `fixtures/audio/utt-04.wav` | `long` | "Bisa jelasin nggak kenapa langit waktu siang warnanya biru tapi kalau sore berubah jadi oranye?" | 4.5s |
| 5 | `fixtures/audio/utt-05.wav` | `gaming` | "Bro tadi malam tim kita kalah karena di-rush pas lagi clutch!" | 3.4s |
| 6 | `fixtures/audio/utt-06.wav` | `english_mix` | "Lyra, do you know what the best strategy for playing mid lane is?" | 3.8s |
| 7 | `fixtures/audio/utt-07.wav` | `preference` | "Kamu lebih suka dengerin musik jazz atau pop elektro?" | 3.0s |
| 8 | `fixtures/audio/utt-08.wav` | `long` | "Lyra coba sebutkan tiga hal yang wajib dibawa kalau kita mau naik gunung sama teman-teman." | 4.8s |
| 9 | `fixtures/audio/utt-09.wav` | `short` | "Halo Lyra, selamat pagi, apa agenda seru kita hari ini?" | 3.2s |
| 10 | `fixtures/audio/utt-10.wav` | `humor` | "Lyra, ceritain satu lelucon lucu dong biar nggak bosen." | 2.9s |

---

## 5. Uji Keterulangan (Reproducibility Check)

Pengujian diuji dua kali berturut-turut untuk membuktikan keterulangan:
- **Selisih p50 Antar-Run**: < 15% (Memenuhi AC Task T3.1).
- Baseline ini menjadi patokan evaluasi sebelum dan sesudah optimasi streaming per kalimat di Task T3.2.
