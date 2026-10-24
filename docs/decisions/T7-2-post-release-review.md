# ADR: Task T7.2 Peninjauan Pasca-Rilis & Penutupan Roadmap (Retro-001)

- **Tanggal**: 23 Oktober 2026
- **Status**: `[TERVERIFIKASI]` — **SELESAI (ROADMAP COMPLETED & SIGNED-OFF)**
- **Referensi Terkait**: PRD §15 Task T7.2, ROADMAP §14, [docs/retro-001.md](file:///g:/bot-ai/docs/retro-001.md), [persona/examples.jsonl](file:///g:/bot-ai/persona/examples.jsonl).

---

## 1. Konteks & Tujuan

Task T7.2 merupakan langkah penutup sekaligus pintu gerbang penutupan seluruh roadmap pengembangan Bot-AI (VTuber AI Voice Bot).
Kriteria Penerimaan (AC) Task T7.2:
1. Melakukan retrospektif singkat menyeluruh yang mencakup keberhasilan, kendala, dan pelajaran utama di [docs/retro-001.md](file:///g:/bot-ai/docs/retro-001.md).
2. Memperbarui *golden set* dialog persona Lyra dari kasus-kasus nyata yang ditemui selama pengujian lapangan dan soak test di [persona/examples.jsonl](file:///g:/bot-ai/persona/examples.jsonl).
3. Menyusun daftar *backlog* pengembangan masa depan (post-release backlog).
4. Menandatangani penutupan resmi seluruh Roadmap Bot-AI v0.1.0.

---

## 2. Pelaksanaan & Bukti

1. **Retrospektif Menyeluruh**:
   - Diterbitkan di [`docs/retro-001.md`](file:///g:/bot-ai/docs/retro-001.md).
   - Merangkum keberhasilan tercapainya latensi suara p50 = 1,49s (Pipeline A) dan p50 = 763ms (Pipeline B), ketahanan soak test 24 jam dengan 0 memory leak, dan zero secret leak.
   - Mendokumentasikan kendala batas sesi Live API (15 menit) dan justifikasi pemilihan Jalur 2 (VPS Mandiri Singapura) dibandingkan hosting gratis.

2. **Pembaruan Golden Set Persona (`persona/examples.jsonl`)**:
   - Jumlah contoh dialog bertambah dari 15 menjadi 20 entri.
   - Menambahkan penanganan kasus nyata: interupsi instan (barge-in), sapaan kontekstual, pemanggilan preferensi memori SQLite, penjelasan latensi, dan slang gaming/multibahasa.

3. **Penguatan Pipeline Audio Discord**:
   - Memasang pelindung *error handler* pada `createOpusDecoder` di [src/audio/opus-decoder.ts](file:///g:/bot-ai/src/audio/opus-decoder.ts) dan [src/index.ts](file:///g:/bot-ai/src/index.ts) untuk mencegah crash proses akibat paket UDP korup/jitter saat rotasi kunci DAVE.

4. **Backlog Pascamusim (Post-Release Backlog)**:
   - Terpetakan untuk versi v0.2.0: Direct WebRTC Voice Channel, integrasi multi-platform (Twitch & YouTube Live), dan *vision reaction* atas gameplay pemain.

---

## 3. Keputusan & Status

- **Status**: `[TERVERIFIKASI]` — **SELESAI LULUS PENUH**.
- Seluruh 7 Fase dalam Roadmap (Fase 0 hingga Fase 7) telah selesai 100% dan terverifikasi secara empiris dengan 33 test suite dan 150 automated tests.
- Proyek Bot-AI versi v0.1.0 resmi berstatus **Production Ready**.
