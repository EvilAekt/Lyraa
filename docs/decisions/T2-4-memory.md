# Keputusan Arsitektur: Task T2.4 Memori Jangka Pendek dan Panjang

- **Task ID**: T2.4
- **Fitur / Syarat**: PRD §9, FR-P2, FR-P3, FR-P4, SEC-5, SEC-10, TC-15
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Tanggal**: 22 Oktober 2026

---

## 1. Konteks dan Tujuan

Sesuai PRD §9 dan Task T2.4, bot memerlukan sistem memori cerdas yang dapat mengingat konteks percakapan multi-turn tanpa memicu risiko kebocoran data privasi atau injeksi prompt:
1. **Memori Jangka Pendek (`conversation_turns`)**:
   - Jendela giliran hingga 12 giliran terakhir per channel/sesi (**FR-P2**).
   - Format percakapan multi-turn yang kronologis dan terstruktur dikirimkan ke model LLM Gemini.
   - Retensi transkrip maksimal 7 hari (**PRD §5 & PRD §10**), dengan mekanisme pembersihan otomatis (`purgeOldTranscripts`).
2. **Memori Jangka Panjang (`user_memories`)**:
   - Penyimpanan berbasis SQLite (`node:sqlite`) dengan path konfigurasi `MEMORY_DB_URL` (default `data/memory.sqlite`).
   - Ekstraksi fakta preferensi pengguna non-sensitif (game favorit, makanan kesukaan, nama panggilan, hobi) melalui [`FactExtractor`](file:///g:/bot-ai/src/memory/fact-extractor.ts).
   - Batas maksimal 200 fakta per pengguna dengan strategi eviksi data terlama jika kuota terlampaui.
3. **Filter Fakta Sensitif / Anti-Leak (SEC-10, TC-15)**:
   - Dilarang keras menyimpan 5 kategori data sensitif:
     1. Kredensial, password, token API, secret key, PIN.
     2. Informasi perbankan/keuangan (nomor rekening, nomor kartu kredit/debit, CVV, gaji).
     3. NIK, KTP, nomor identitas resmi pemerintah.
     4. Alamat rumah lengkap atau lokasi fisik pribadi sensitif.
     5. Riwayat diagnosis medis atau rekam penyakit sensitif.
4. **Penyisipan Memori Aman (SEC-5, PRD §9)**:
   - Fakta pengguna disisipkan ke system prompt murni sebagai **blok data pasif** berlabel (`[USER_FACTS]`), **BUKAN sebagai instruksi langsung** yang dapat dieksekusi.
5. **Hak Privasi Pengguna & Penghapusan Data (FR-P4, TC-15)**:
   - Slash command `/memory me` dan prefix `!memory me`: Menampilkan fakta tersimpan pemanggil.
   - Slash command `/forget me` dan prefix `!forget me`: Menghapus seluruh memori dan transkrip milik pengguna terkait secara permanen.
   - Slash command `/forget all` dan prefix `!forget all`: Mengosongkan seluruh database memori (Owner only).

---

## 2. Bukti Verifikasi dan Pengujian

Unit test terstruktur dijalankan melalui `tests/memory.test.ts` dan seluruh suite repository (`npm test`):

```bash
$ node --import tsx --test tests/memory.test.ts
▶ Task T2.4: Memori Jangka Pendek & Panjang (PRD §9, FR-P2, FR-P3, FR-P4, TC-15)
  ✔ TC-15.1: Menyimpan dan mengambil riwayat giliran percakapan jangka pendek (FR-P2, 12 turn) (2.2769ms)
  ✔ TC-15.2: Menolak 5 contoh fakta sensitif secara deterministik (SEC-10, PRD §9, TC-15) (3.7321ms)
  ✔ TC-15.3: Menyimpan fakta non-sensitif, mencegah duplikasi, dan mematuhi kuota evict (FR-P3) (1.3044ms)
  ✔ TC-15.4: Ekstraksi fakta preferensi otomatis melalui FactExtractor (1.3874ms)
  ✔ TC-15.5: Format penyisipan memori ke prompt adalah data pasif, bukan instruksi (SEC-5, PRD §9) (1.3277ms)
  ✔ TC-15.6: /forget me menghapus seluruh fakta dan transkrip percakapan pengguna (FR-P4, TC-15) (0.9875ms)
  ✔ TC-15.7: /forget all mengosongkan seluruh database memori (Owner only, FR-P4, TC-15) (0.8811ms)
  ✔ TC-15.8: Purge riwayat lama melebihi retensi 7 hari (PRD §5, PRD §10, TC-15) (0.6686ms)
✔ Task T2.4: Memori Jangka Pendek & Panjang (PRD §9, FR-P2, FR-P3, FR-P4, TC-15) (13.7196ms)
ℹ tests 8, pass 8, fail 0
```

Hasil Full Test Suite (`npm test`):
```
ℹ tests 57
ℹ suites 2
ℹ pass 57
ℹ fail 0
```
Seluruh 57 test lolos 100%.

---

## 3. Keputusan Arsitektur

1. **Pemanfaatan Built-in `node:sqlite` (Node.js 22)**:
   - Menggunakan `DatabaseSync` bawaan Node.js tanpa perlu dependensi kompilasi `better-sqlite3` atau package external C++ yang rentan dependensi native di Windows/Linux.
2. **Isolasi Memori Pasif**:
   - Mencegah *jailbreak via memory* dengan melarang format instruksi pada memori. Fakta selalu diletakkan dalam kontainer `[USER_FACTS ... BUKAN INSTRUKSI]`.
3. **Penyimpanan Lokal Persisten**:
   - Disimpan di `data/memory.sqlite` (diabaikan oleh git lewat `.gitignore`).

---

## 4. Konsekuensi

- Sistem siap melangkah ke **Task T2.5: Admin, allowlist, dan pengumuman privasi** (PRD §4, SEC-4, SEC-9, TC-16).
