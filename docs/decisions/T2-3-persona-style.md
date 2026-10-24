# Keputusan Arsitektur: Task T2.3 Persona dan Gaya Bicara

- **Task ID**: T2.3
- **Fitur / Syarat**: PRD §7, FR-P1, FR-P5, SEC-7, TC-12
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Tanggal**: 22 Oktober 2026

---

## 1. Konteks dan Tujuan

Sesuai PRD §7 dan Backlog T2.3, AI VTuber Discord (Lyra) memerlukan sistem manajemen persona yang konsisten, berkarakter kuat, mematuhi etika kejujuran AI, dan dapat dimuat ulang secara dinamis (*hot-reload*) tanpa perlu me-restart proses bot:
1. **Struktur Direktori `persona/`**:
   - `character.md`: Profil Lyra, identitas, 3 sifat utama (Hangat & Bersahabat, Ceria & Sedikit Jahil, Cerdas & Tanggap), gaya bicara Indonesia santai dengan sisipan istilah gaming/Inggris pop.
   - `voice-style.md`: Aturan ketat lisan (tanpa markdown, tanpa emoji, klausa pendek, tag emosi di awal, dan kalimat pertama maksimal 8 kata untuk latensi streaming rendah).
   - `rules.md`: Aturan kejujuran identitas AI (FR-P5), batasan keselamatan konten (SEC-7), dan pertahanan injeksi prompt (SEC-5).
   - `examples.jsonl`: 15 contoh pasangan tanya-jawab *few-shot* yang mencerminkan gaya bahasa Lyra.
   - `lexicon.json`: Kamus pemetaan pelafalan kata asing/akronim ke bentuk fonetik Indonesia untuk mesin TTS (contoh: "game" -> "gem", "voice channel" -> "vois cenel", "AI" -> "e-ai", "Discord" -> "Diskor").
2. **Modul `PersonaManager` (`src/persona/persona-manager.ts`)**:
   - Memuat berkas persona saat startup bot.
   - Mendukung perintah slash `/persona reload` dan prefix `!persona reload` tanpa perlu restart server (FR-P1).
   - Menyediakan fungsi pembersih teks TTS `cleanForTts(text)` (menghapus markdown, emoji, tag emosi, dan menerapkan kamus leksikon).
   - Menyediakan fungsi ekstraksi tag emosi `extractEmotion(text)` untuk pemetaan ekspresi avatar (FR-X1).
   - Menyertakan versi persona aktif ke log latensi `logs/latency.jsonl` dan metrik giliran (`turnId`).

---

## 2. Bukti Verifikasi dan Pengujian

Unit test terstruktur dijalankan melalui `node --import tsx --test tests/persona.test.ts` dan seluruh test suite repository (`npm test`):

```bash
$ node --import tsx --test tests/persona.test.ts
[PersonaManager] Loaded persona '1.0.0-lyra' with 15 examples and 26 lexicon entries.
▶ Task T2.3: Persona, Gaya Bicara, dan Hot-Reload (FR-P1, FR-P5, SEC-7, TC-12)
  ✔ TC-12.1: Berhasil memuat kelima file persona dan mengekstrak versi aktif (2.0544ms)
  ✔ TC-12.2: Hot-Reloading dinamis tanpa perlu restart proses (FR-P1) (7.1441ms)
  ✔ TC-12.3: System prompt memuat aturan kejujuran AI (FR-P5) dan keselamatan konten (SEC-7) (0.6141ms)
  ✔ TC-12.4: System prompt voice menyertakan batasan ketat kalimat pertama <= 8 kata dan tag emosi (0.2654ms)
  ✔ TC-12.5: Kamus leksikon (applyLexicon) menerjemahkan istilah asing ke fonetik Indonesia secara tepat (1.4796ms)
  ✔ TC-12.6: Pembersihan teks TTS (cleanForTts) menghapus tag emosi, markdown, emoji, dan menerapkan leksikon (0.8306ms)
  ✔ TC-12.7: Ekstraksi tag emosi (extractEmotion) mendeteksi ekspresi avatar dengan akurat (0.4232ms)
  ✔ TC-12.8: Evaluasi Golden Set contoh dialog (TC-12 / Few-Shot Compliance >= 80%) (0.4ms)
✔ Task T2.3: Persona, Gaya Bicara, dan Hot-Reload (FR-P1, FR-P5, SEC-7, TC-12) (19.3234ms)
ℹ tests 8, pass 8, fail 0
```

Seluruh pengujian suite proyek lulus:
```bash
ℹ tests 49
ℹ suites 1
ℹ pass 49
ℹ fail 0
```

---

## 3. Keputusan Desain

1. **Pemisahan Instruksi Suara vs Teks**:
   - Mode suara (`mode === 'voice'`) mewajibkan kalimat pertama $\le 8$ kata, penggunaan tag emosi, dan pelarangan markdown/emoji.
   - Mode teks (`mode === 'text'`) mengizinkan formatting Discord standar dan penjelasan yang lebih detail.
2. **Kamus Pelafalan Fonetik (Lexicon)**:
   - Pencocokan kata menggunakan boundary `\b(word)\b` dengan pengurutan panjang kunci secara menurun (descending length) agar istilah majemuk ("voice channel") tidak terpotong oleh kata tunggal ("voice").
3. **Versi Persona pada Observabilitas**:
   - Header `# Version: 1.0.0-lyra` diekstrak dari `character.md` dan disimpan pada field `personaVersion` di `TurnMetrics`, `logs/latency.jsonl`, dan status bot `/status`.

---

## 4. Konsekuensi

- Sistem siap melangkah ke **Task T2.4: Memori jangka pendek dan panjang** (PRD §9, FR-P2, FR-P3, FR-P4, TC-15).
