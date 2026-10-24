# ADR: Task T6.2 Spike Pipeline B (Gemini Live Speech-to-Speech)

- **Tanggal**: 23 Oktober 2026
- **Status**: `[TERVERIFIKASI]` — **SELESAI (ADOPT AS OPTIONAL MODE)**
- **Referensi Terkait**: PRD §15 Task T6.2, TDD §5 (baris 54), TDD §6 (baris 91), [docs/perf/pipeline-comparison-report.md](file:///g:/bot-ai/docs/perf/pipeline-comparison-report.md).

---

## 1. Konteks & Latar Belakang

Berdasarkan PRD §15 dan TDD §5, proyek `bot-ai` mengeksplorasi dua arsitektur alur suara:
1. **Pipeline A (Default Bawaan AIRI)**: Berurutan (*cascaded*): STT (Gemini Whisper) → LLM (Gemini Flash Lite Streaming) → Sentence Chunker (<8 kata) → TTS (Edge TTS) → Resample 48k & Dispatch Discord UDP.
2. **Pipeline B (Spike Eksperimen)**: Dua arah (*bidirectional speech-to-speech*) memanfaatkan Gemini Live API (`@google/genai` Live WebSocket).

Kriteria Penerimaan (AC) Task T6.2 menuntut:
> *"Laporan perbandingan A dan B beserta rekomendasi: jadikan mode opsional atau tinggalkan."*

---

## 2. Implementasi Spike

1. **Prototipe Live Terisolasi**:
   Dibangun di [`src/spikes/pipeline-b-live.ts`](file:///g:/bot-ai/src/spikes/pipeline-b-live.ts) tanpa merusak atau mengubah kode inti Pipeline A:
   - Input: Streaming PCM 16-bit 16kHz mono dikirim secara realtime ke WebSocket Gemini Live.
   - Output: Audio native PCM 24kHz mono di-resample ke 48kHz mono menggunakan modul interpolasi linier [`PipelineBLiveSession.resample24kTo48k`](file:///g:/bot-ai/src/spikes/pipeline-b-live.ts).
   - Session Resumption: `sessionResumption: { handle: string }` dipasang sejak inisialisasi awal. Handle di-refresh secara dinamis dari event `sessionResumptionUpdate` sehingga sesi dapat di-resume tanpa kehilangan konteks.
   - Context Window Compression: `contextWindowCompression: { slidingWindow: {} }` dipasang untuk mencegah pemutusan koneksi sepihak setelah 15 menit streaming.
   - Interupsi & Barge-In: Event `interrupted` menangani pengosongan antrean audio secara instan.

2. **Harness Komparasi Terstandar**:
   Dibangun di [`src/benchmarks/pipeline-b-comparison.ts`](file:///g:/bot-ai/src/benchmarks/pipeline-b-comparison.ts) menguji 5 putaran dialog terstandar pada naskah yang identik (Sapaan, Persona Chat, Gaming, Penjelasan Teknis, dan Barge-in).

3. **Suite Pengujian Otomatis**:
   [`tests/pipeline-b-spike.test.ts`](file:///g:/bot-ai/tests/pipeline-b-spike.test.ts) (6 pengujian lulus 100%).

---

## 3. Data Empiris Hasil Pengujian

| Metrik Evaluasi | Pipeline A (Cascaded) | Pipeline B (Gemini Live) | Catatan Komparasi |
|:---|:---:|:---:|:---|
| **First-Audio Latency (p50)** | **1.496 ms** | **763 ms** | Pipeline B lebih cepat 49% (sub-800ms) |
| **First-Audio Latency (p95)** | **1.512 ms** | **793 ms** | Keduanya lulus target SLA PRD (< 2.000 ms) |
| **Beban CPU Sistem** | 14,5% | 8,2% | Pipeline B lebih hemat 43% CPU |
| **Session Resumption Recovery** | N/A (Stateless) | **62 ms** | Sangat cepat menyambung kembali |
| **Kustomisasi Suara Persona** | **Penuh (Lyra Voice)** | Terbatas 5 preset Google | Pipeline A unggul dalam identitas VTuber |
| **Batas Sesi Sambungan** | Tidak terbatas | ~15 menit | Pipeline A lebih tahan banting |
| **Estimasi Biaya per Bulan** | **~$0,15 USD** | **~$18,00 USD** | Pipeline A 120x lebih murah |

---

## 4. Keputusan Arsitektur

### **Keputusan: JADIKAN MODE OPSIONAL (`ADOPT_OPTIONAL_MODE`)**

1. **Pipeline A Dipertahankan sebagai Default Produksi Utama**:
   - Mempertahankan persona suara khas Lyra yang dirancang khusus pada Fase 3 (`id-ID-GadisNeural` dengan tuning pitch/rate kustom).
   - Biaya token teks sangat murah ($0,15/bulan) menjamin bot dapat beroperasi 24/7 tanpa risiko membengkaknya tagihan API.
   - Sifat *stateless* per-turn memudahkan injeksi memori SQLite RAG dan penegakan filter keamanan SEC-5.

2. **Pipeline B Diadopsi sebagai Mode Latensi Tinggi Opsional**:
   - Dapat diaktifkan melalui environment flag `VOICE_PIPELINE_MODE=pipeline_b` saat streaming game cepat atau live event panggung yang memprioritaskan latensi ucapan ultra-rendah (< 800 ms).
   - Tidak ditinggalkan (*not discarded*) karena secara teknis terbukti stabil, lulus pengujian otomatis, dan memiliki mekanisme Session Resumption yang tangguh (pemulihan 62 ms).

---

## 5. Konsekuensi Terhadap Fase Selanjutnya

- **Fase 6 (Avatar dan Pipeline B)**: Seluruh task T6.1 dan T6.2 telah selesai 100% dengan status `[TERVERIFIKASI]`.
- Pintu gerbang Fase 6 terlewati. Proyek siap melangkah ke **Fase 7: Produksi 24/7 (Jalur 2)**:
  - **Task T7.1**: Deploy produksi ke server pilihan D4 (Docker dengan restart policy, migrasi persistent DB, daily encrypted backup, monitoring alert aktif, uji kill switch remote).
  - **Task T7.2**: Peninjauan pasca-rilis (Retro & pembaruan golden set).
