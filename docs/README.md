# Panduan dan Aturan Kerja: Bot Discord VTuber AI (basis AIRI)

Versi 0.1 · 20 Oktober 2026 · Proyek pribadi · Brief dari senior developer untuk junior developer atau AI asisten (mis. Gemini Flash)

---

## 0. Cara memakai dokumen ini

Dokumen dokumentasi proyek ini dipecah menjadi 4 berkas di folder `docs/` agar ramah konteks LLM/AI (termasuk model hemat token):

1. **[docs/README.md](file:///g:/bot-ai/docs/README.md)**: Aturan kerja, etika rekayasa, dan glosarium (§0, §21). *(Dokumen ini)*
2. **[docs/PRD.md](file:///g:/bot-ai/docs/PRD.md)**: Persyaratan produk, karakter, persona, dan suara (§1, §2, §4, §5, §7, §8, §9).
3. **[docs/TDD.md](file:///g:/bot-ai/docs/TDD.md)**: Arsitektur teknis, rekayasa latensi, keamanan, QA, observabilitas, deployment, dan konfigurasi (§3, §6, §10 s/d §13, §16).
4. **[docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md)**: Roadmap fase, backlog task berurutan, risiko, DoD checklist, template prompt AI, dan persetujuan (§14, §15, §17 s/d §20).

### Pembaca Dokumen:
- **Pemilik proyek**: baca `docs/PRD.md` (§1, §2), `docs/ROADMAP-DAN-TASK.md` (§14, §17, §20). Keputusan yang butuh jawabanmu ada di §20.
- **Junior developer atau AI**: baca `docs/README.md` (§0), sekilas `docs/PRD.md` (§1 s/d §5), lalu HANYA task yang ditugaskan di `docs/ROADMAP-DAN-TASK.md` (§15) beserta bagian teknis yang dirujuk di `docs/TDD.md`.

---

### Aturan Kerja (Berlaku untuk Semua Task)

1. **Satu task dalam satu waktu**, urut sesuai ID. Jangan masuk fase berikutnya sebelum gate fase sekarang lolos (§14).
2. **Tiga label kepastian** dipakai di seluruh dokumen:
   - `[TERVERIFIKASI]`: sudah dibuktikan secara empiris / pengujian nyata.
   - `[VERIFIKASI]`: klaim dari catatan awal yang belum diperiksa. Jangan memperlakukannya sebagai fakta. Buktikan dulu, lalu catat hasilnya di `docs/decisions/`.
   - `[ASUMSI]`: keputusan desain sementara.
3. **Jangan menebak** nama file, fungsi, atau parameter API. Cari di kode atau dokumentasi resmi. Kalau tidak ketemu, tulis "tidak ditemukan" di catatan lalu tanya.
4. **Ubah kode upstream AIRI seminimal mungkin**. Kode tambahan kita taruh di folder atau paket sendiri (`src/`) supaya fork tetap bisa menarik pembaruan upstream secara bersih.
5. **Berhenti dan tanya jika**:
   - Dua kali percobaan perbaikan gagal berturut-turut.
   - Task menuntut keputusan di luar scope.
   - Task menyentuh secret atau akun berbayar.
   - Membutuhkan dependency besar baru yang tidak standar.
   - Tulis laporan blocker memakai template di `docs/ROADMAP-DAN-TASK.md` (§19).
6. **Setiap task selesai dengan commit atau PR**, catatan singkat, dan bukti (log, angka benchmark, rekaman audio, screenshot). *"Sudah jalan"* tanpa bukti konkret dianggap **belum selesai**.
7. **Jangan pernah commit secret** (token Discord, API key). Semuanya lewat file `.env` yang masuk `.gitignore`.
8. **Bahasa**: Kode, komentar kode, dan pesan commit memakai Bahasa Inggris standar. Catatan dan dokumen boleh memakai Bahasa Indonesia.

**Format setiap task di §15**: Tujuan, Langkah, Kriteria selesai (AC), Bukti, dan Jangan.

---

## 21. Glosarium singkat

- **DAVE**: Protokol enkripsi end-to-end untuk voice dan video Discord (*Discord Audio/Video End-to-End Encryption*).
- **VAD**: *Voice Activity Detection*, pendeteksi ada atau tidaknya suara bicara manusia.
- **Endpointing**: Keputusan algoritmik bahwa pengguna sudah selesai berbicara (berdasarkan jeda diam/hangover).
- **STT dan TTS**: *Speech-to-Text* (transkripsi suara ke teks) dan *Text-to-Speech* (sintesis teks menjadi suara).
- **Barge-in**: Pengguna menyela saat bot sedang berbicara, memicu pemotongan audio dan pembersihan antrean seketika.
- **Gating**: Aturan logika yang menentukan apakah bot harus merespons atau mengabaikan pesan/suara.
- **Golden set**: Kumpulan 60 kasus uji tetap untuk mengevaluasi kualitas dan konsistensi persona LLM.
- **ADR**: *Architecture Decision Record*, catatan resmi keputusan teknis arsitektur.
- **p50 dan p95**: Persentil 50 (median) dan persentil 95 dari pengukuran latensi.
