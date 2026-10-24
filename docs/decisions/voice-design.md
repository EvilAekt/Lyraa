# Keputusan & Eksperimen Task T3.4: Eksperimen Voice Design Karakter Lyra

- **Task ID**: T3.4 (Fase 3: Latensi dan Suara)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §7 (Suara dan Karakter - Butir 5 & 6: Template Voice Design), ROADMAP §15 (Task T3.4)

---

## 1. Konteks & Tujuan

Task T3.4 mengeksplorasi pembuatan profil suara kustom (*Voice Design*) berbasis deskripsi tekstual terstruktur sesuai template standar PRD §7 (kesan umur, warna suara, tempo, aksen, tingkat ekspresi).

Kriteria Penerimaan (Acceptance Criteria):
1. Merancang **2 profil suara kustom** dari deskripsi terstruktur sesuai karakter VTuber Lyra.
2. Mengunci **ID permanen** untuk masing-masing profil agar dapat dipanggil secara deterministik.
3. Menghasilkan berkas audio sampel fisik dan menyimpannya di folder fixtures untuk dievaluasi.
4. Mematuhi **batasan etika ketat** (PRD §7.6 & FR-P5): Dilarang membuat suara yang meniru orang sungguhan.
5. Mendokumentasikan hasil eksperimen dan rekomendasi konfigurasi di `docs/decisions/voice-design.md`.

---

## 2. Template dan Deskripsi 2 Profil Voice Design

### Desain 1: `Lyra Energetic Streamer (High-Energy Overdrive)`
- **ID Permanen**: `voice-design-lyra-streamer-v1`
- **Kesan Umur**: Perempuan muda, rentang umur 19-21 tahun
- **Warna Suara & Timbre**: Cerah, renyah (bright & crisp), nada vokal jernih dengan resonansi anime VTuber yang bersemangat
- **Tempo Bicara**: Sedang cenderung cepat (1.08x tempo), intonasi lincah dan berirama dinamis
- **Aksen & Dialek**: Indonesia kasual metropolitan / santai dengan pelafalan istilah gaming yang luwes
- **Tingkat Ekspresi**: Tinggi, antusias, ekspresif, sedikit jahil (playful), dan penuh energi saat momen menegangkan
- **Batasan Etika AI**: Karakter AI VTuber orisinal, TIDAK meniru figur atau orang sungguhan (PRD §7.6, FR-P5)
- **Parameter Akustik**:
  - Base Neural Voice: `id-ID-GadisNeural`
  - Speed / Rate: `1.08x`
  - Pitch Adjustment: `+8Hz`
  - Volume: `+0%`
- **Teks Sampel Uji**:
  > *"Halo semuanya! Kenalin aku Lyra! Ayo gas mabar sekarang juga, jangan kasih kendor ya guys!"*

### Desain 2: `Lyra Late-Night Cozy (Warm & Relaxed)`
- **ID Permanen**: `voice-design-lyra-cozy-v1`
- **Kesan Umur**: Perempuan muda, rentang umur 21-23 tahun
- **Warna Suara & Timbre**: Hangat, lembut, sedikit serak ramah (warm & slightly husky), empuk di telinga
- **Tempo Bicara**: Sedang cenderung santai (0.92x tempo), jeda nafas alami dan tenang
- **Aksen & Dialek**: Indonesia santai dan akrab, intonasi bersahabat seperti sahabat karib
- **Tingkat Ekspresi**: Sedang, menenangkan, penuh empati, sangat nyaman didengarkan dalam sesi larut malam
- **Batasan Etika AI**: Karakter AI VTuber orisinal, TIDAK meniru figur atau orang sungguhan (PRD §7.6, FR-P5)
- **Parameter Akustik**:
  - Base Neural Voice: `id-ID-GadisNeural`
  - Speed / Rate: `0.92x`
  - Pitch Adjustment: `-4Hz`
  - Volume: `+0%`
- **Teks Sampel Uji**:
  > *"Malam semuanya... Gimana hari kamu tadi? Kalau capek, istirahat dulu ya sambil dengerin obrolan santai Lyra."*


---

## 3. Hasil Sintesis Sampel Audio Fisik

Kedua profil Voice Design berhasil disintesis dan disimpan ke direktori `fixtures/voice-candidates/`:

| ID Permanen | Nama Berkas Sampel | Ukuran Berkas | Format Audio | Karakteristik Akustik |
|---|---|---|---|---|
| `voice-design-lyra-streamer-v1` | `voice-design-lyra-streamer-v1.webm` | ~55 KB | WebM Opus 48kHz | Ceria, energik, tempo lincah 1.08x, pitch +8Hz |
| `voice-design-lyra-cozy-v1` | `voice-design-lyra-cozy-v1.webm` | ~62 KB | WebM Opus 48kHz | Hangat, santai, tempo tenang 0.92x, pitch -4Hz |

---

## 4. Evaluasi & Komparasi dengan Baseline T3.3

1. **Perbandingan dengan Kandidat Pemenang T3.3 (`Gadis-Energetic` 1.05x, +6Hz)**:
   - Profil **`voice-design-lyra-streamer-v1`** (1.08x, +8Hz) memberikan sensasi yang lebih menonjol dan ceria saat live stream game berlangsung seru (*high energy*).
   - Profil **`voice-design-lyra-cozy-v1`** (0.92x, -4Hz) sangat unggul ketika bot digunakan dalam sesi ngobrol santai (*late-night chat*) atau pembacaan teks panjang yang membutuhkan intonasi relaksasi.
2. **Fleksibilitas Multi-Preset**:
   - Dengan adanya ID permanen, bot dapat mendukung pergantian gaya bicara (*dynamic voice mood*) di masa depan tanpa mengubah model dasar:
     - Mode Siang / Gaming: `voice-design-lyra-streamer-v1`
     - Mode Malam / Santai: `voice-design-lyra-cozy-v1`
     - Default Universal: `id-ID-GadisNeural` (1.05x, +6Hz)

---

## 5. Keputusan & Rekomendasi Arsitektur

- **Keputusan**: **SELESAI (GO)**.
- Kedua profil suara kustom telah terdaftar di `src/audio/voice-designer.ts` dengan ID permanen yang aman dan siap digunakan.
- Suara utama operasional tetap menggunakan Juara T3.3 (`1.05x, +6Hz`), sementara kedua preset Voice Design ini tersedia sebagai modul variasi ekspresi.
- Seluruh sampel audio lulus uji integritas tanpa artefak vokal (*no audible aliasing / clicks*).

---

## 6. Langkah Berikutnya

Sesuai urutan ROADMAP §15 Fase 3:
👉 **Task T3.5: Kualitas audio dan lexicon** (normalisasi volume, crossfade antar-chunk, jeda antarkalimat alami, kamus pelafalan `lexicon.json`, tes telinga).
