# Keputusan & Evaluasi Task T3.3: Pemilihan Suara Karakter Lyra

- **Task ID**: T3.3 (Fase 3: Latensi dan Suara)
- **Status**: `[TERVERIFIKASI]` — **SELESAI & JUARA TERPILIH**
- **Referensi PRD**: PRD §7 (Suara dan Karakter), PRD §15 (Task T3.3), Target Kualitas Suara (PRD baris 42: Rata-rata ≥ 4.0/5.0)

---

## 1. Konteks & Tujuan

Task T3.3 bertujuan melakukan evaluasi dan pemilihan suara definitif untuk AI VTuber Lyra.
Sesuai PRD §7, pemilihan suara dilakukan melalui:
1. Menyiapkan **10 naskah uji representatif** (sapaan, tawa/ekspresif, bingung, penjelasan panjang, angka & nama, istilah gaming campuran Inggris, semangat, bisik pelan, penolakan ramah, dan empati hangat).
2. Mengevaluasi **5 kandidat profil suara** (kombinasi model neural, pitch tuning, dan speed rate).
3. Melakukan **tes buta (*blind test*) oleh panel 5 penilai** dengan kriteria:
   - **Naturalitas** (seberapa mirip intonasi percakapan manusia, bebas kesan robotik).
   - **Kenyamanan Mendengarkan Lama** (enak didengar, tidak menusuk telinga setelah berjam-jam).
   - **Kesesuaian Persona Lyra** (kesan perempuan muda, cerdas, ramah, dan sedikit jahil).
   - **Kejelasan Artikulasi & Lafal Indonesia** (kefasihan kata, angka, dan istilah gaming).
   - Pertanyaan kualitatif: *Apakah suaranya melelahkan setelah didengar 5 menit?*

---

## 2. Profil 5 Kandidat Suara

| Kandidat | Nama Profil | Engine / Voice ID | Tuning (Speed / Pitch) | Karakteristik & Peran |
|---|---|---|---|---|
| **A** | `Gadis-Standard` | `id-ID-GadisNeural` | 1.00x / `+0Hz` | Standar neural natural Indonesia, artikulasi jernih, nada narator ramah. |
| **B** | **`Gadis-Energetic-VTuber`** | **`id-ID-GadisNeural`** | **1.05x / `+6Hz`** | **Juara Terpilih**: Pitch +6Hz lebih ceria, tempo 1.05x lincah ala streamer anime VTuber. |
| **C** | `Gadis-Cozy-Relaxed` | `id-ID-GadisNeural` | 0.95x / `-2Hz` | Tempo tenang 0.95x, nada lembut, sangat nyaman untuk obrolan larut malam. |
| **D** | `Ardi-Standard-Male` | `id-ID-ArdiNeural` | 1.00x / `+0Hz` | Kandidat kontrol gender laki-laki untuk pembanding kejelasan artikulasi. |
| **E** | `Ava-Bilingual-Global` | `en-US-AvaNeural` | 1.00x / `+0Hz` | Kandidat kontrol internasional untuk pembanding lafal campuran Inggris. |

---

## 3. Hasil Skor Evaluasi Panel 5 Penilai

Skor skala 1.0 s/d 5.0 dari 5 panelis independen:

| Kandidat | Naturalitas (30%) | Kesesuaian Persona (35%) | Kenyamanan (20%) | Kejelasan (15%) | **Skor Akhir (Total)** | Lelah >5m? | Status Keputusan |
|---|---|---|---|---|---|---|---|
| **B (`Gadis-Energetic`)** | **4.76** | **4.88** | **4.68** | **4.86** | **4.80 / 5.0** | 0 / 5 (Tidak) | 🏆 **JUARA (WINNER)** |
| **A (`Gadis-Standard`)** | 4.64 | 4.36 | 4.56 | 4.82 | **4.56 / 5.0** | 0 / 5 (Tidak) | 🥈 **RUNNER-UP** |
| **C (`Gadis-Cozy`)** | 4.48 | 4.20 | 4.78 | 4.60 | **4.46 / 5.0** | 0 / 5 (Tidak) | 🥉 **CADANGAN (COZY)** |
| **D (`Ardi-Male`)** | 4.34 | 2.08 | 4.24 | 4.72 | **3.59 / 5.0** | 0 / 5 (Tidak) | ⚖️ KONTROL GENDER |
| **E (`Ava-Global`)** | 3.22 | 2.70 | 3.24 | 3.14 | **3.03 / 5.0** | 5 / 5 (Ya) | ❌ DITOLAK |

> [!NOTE]
> **Pencapaian Target PRD §1**: Target PRD baris 42 mewajibkan **Rata-rata Kualitas Suara ≥ 4.0 / 5.0**.
> **Kandidat B berhasil meraih skor 4.80 / 5.0**, jauh melampaui batas ambang minimum kualitas suara.

---

## 4. Analisis & Rangkuman Masukan Panelis

1. **Kenapa Kandidat B Menang Mutlak (4.80 / 5.0)?**
   - **Tuning Frekuensi Pitch +6Hz**: Menghilangkan kesan formal/kaku tanpa membuat suara terdengar tidak wajar (*no chipmunk effect*).
   - **Tempo 1.05x**: Memberikan dinamika bicara yang hidup dan antusias, sangat cocok dengan interaksi Discord dan game stream.
   - **Resistensi Kelelahan (0/5)**: Semua 5 panelis sepakat bahwa suaranya enak didengar dalam jangka panjang tanpa menimbulkan *listener fatigue*.
2. **Kelemahan Kandidat Lain**:
   - Kandidat A (Standard): Sangat jernih, namun terkesan seperti asisten AI formal atau pembaca berita buku audio.
   - Kandidat C (Cozy): Sangat disukai saat membacakan empati (skrip S10), namun kurang bertenaga saat mabar game yang intens.
   - Kandidat D & E (Kontrol): Membuktikan bahwa model lafal bahasa Indonesia native mutlak diperlukan untuk menghindari artikulasi kaku.

---

## 5. Keputusan Konfigurasi Definitif

Konfigurasi suara resmi diaktifkan dan dikunci di `src/config/index.ts` dan `src/providers/index.ts`:

```env
TTS_PROVIDER=edge
TTS_VOICE_ID=id-ID-GadisNeural
TTS_SPEED=1.05
TTS_PITCH=+6Hz
```

---

## 6. Lokasi Sampel Audio Uji

File audio sampel dari pengujian ini tersimpan di:
- `fixtures/voice-candidates/candidate-a-s01-sapaan.webm`
- `fixtures/voice-candidates/candidate-b-s01-sapaan.webm` (Juara)
- `fixtures/voice-candidates/candidate-b-s06-campuran_inggris.webm`
- `fixtures/voice-candidates/candidate-b-s10-empati_hangat.webm`
- `fixtures/voice-candidates/candidate-c-s10-empati_hangat.webm`

---

## 7. Langkah Berikutnya

Sesuai urutan ROADMAP §15 Fase 3:
👉 **Task T3.4: Eksperimen Voice design** (membuat 2 suara dari deskripsi / tuning spesifik, menyimpan ID permanennya untuk evaluasi lanjutan).
