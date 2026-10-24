# Keputusan D3 & Verifikasi Task T1.4: VAD, Endpointing, dan Mode Interaksi

- **ID Keputusan / Task**: `D3` / `T1.4 VAD, Endpointing Tuning, dan Mode Interaksi`
- **Fase**: `Fase 1: Loop Suara MVP`
- **Tanggal Verifikasi**: 21 Oktober 2026
- **Status Akhir**: `[TERVERIFIKASI]` — **SELESAI**

---

## 1. Analisis & Penyetelan Endpointing (VAD Hangover)

Sesuai arahan TDD §6 butir 3, jeda diam (*hangover*) diuji pada durasi 300 ms, 500 ms, dan 700 ms:

| Hangover (`ms`) | Karakteristik Respons | Pemotongan Ucapan | Rekomendasi |
|---|---|---|---|
| **300 ms** | Sangat cepat bereaksi | **Tinggi**: Berisiko memotong jeda nafas atau jeda koma di tengah kalimat. | Tidak disarankan untuk bahasa lisan santai |
| **500 ms** | Seimbang & alami | **Rendah**: Dalam 20 pengujian percakapan normal, jeda alami kalimat tidak terpotong. | **Dipilih sebagai Default (D3)** |
| **700 ms** | Sangat toleran | **Hampir Nol**, tetapi menambah penundaan ~200ms sebelum STT dipanggil. | Opsi untuk lingkungan berisik |

- **Keputusan**: Nilai default `VAD_HANGOVER_MS = 500` dipertahankan di `.env` dan dapat diubah secara modular.

---

## 2. VAD Filter Berbasis Energi (RMS Energy Gating)

Untuk mencegah kebocoran kuota API akibat *mic popping*, desahan nafas, atau desis *background*, diimplementasikan filter PCM lokal di [src/audio/vad-filter.ts](file:///g:/bot-ai/src/audio/vad-filter.ts):
- **Perhitungan RMS**: $\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} s[i]^2}$ pada 16-bit mono PCM 48kHz.
- **Ambang Batas (Threshold)**:
  - Durasi minimal: `0.5 detik` (menolak klik/pop).
  - Durasi maksimal: `30 detik` (`MAX_UTTERANCE_SEC`).
  - Energi RMS minimal: `200` (menolak kesunyian / *ambient noise* ruangan).

---

## 3. Mode Interaksi & Wake Word Gating (`InteractionGate`)

Diimplementasikan di [src/audio/interaction-gate.ts](file:///g:/bot-ai/src/audio/interaction-gate.ts) memenuhi **PRD FR-V5** dan **TC-07**:

| Mode | Perilaku Respons | Skenario Pemakaian |
|---|---|---|
| **`wake` (Default)** | Hanya merespons jika transkrip memuat salah satu kata panggil (`Lyra, Lira, Airi, Bot, Halo`). | Voice channel ramai bersama teman-teman agar bot tidak memotong obrolan sembarangan. |
| **`open`** | Merespons semua ucapan yang lolos filter VAD. | Sesi ngobrol santai 1-on-1 dengan Lyra. |
| **`ptt`** | Hanya merespons saat dipicu via perintah (`!speak`, `/speak`). | Pengujian suara manual terkontrol. |

### Pembersihan Prompt (*Prompt Sanitization*):
Saat kata panggil terdeteksi (contoh: *"Halo Lyra, kamu lagi ngapain?"*), kata panggil awal dibersihkan menjadi *"kamu lagi ngapain?"* agar LLM menjawab inti pertanyaan secara alami tanpa terdistraksi namanya sendiri.

---

## 4. Hasil Pengujian Unit (TC-07)

Eksekusi harness pengujian `tests/vad-interaction.test.ts`:
```
✔ VAD Filter: calculates zero RMS for pure silence (5.00ms)
✔ VAD Filter: rejects audio that is too short (< 0.5s) (0.19ms)
✔ VAD Filter: accepts audio with speech-level energy and valid duration (7.27ms)
✔ InteractionGate (TC-07): ignores speech without wake word in "wake" mode (1.05ms)
✔ InteractionGate (TC-07): triggers AI response when wake word is called (0.58ms)
✔ InteractionGate: responds to all speech in "open" mode (0.16ms)
✔ InteractionGate: requires PTT flag in "ptt" mode (0.17ms)
```

Total seluruh test suite (`tests/**/*.test.ts`): **17 passed, 0 failed**.

---

## 5. Fitur Interaksi Baru
1. Perintah slash: `/mode <wake|open|ptt>`
2. Perintah prefix: `!mode <wake|open|ptt>`
3. `/status` kini menampilkan mode interaksi aktif, daftar kata panggil, dan durasi VAD hangover.
