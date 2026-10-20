# ROADMAP DAN TASK: Bot Discord VTuber AI (basis AIRI)

Versi 0.1 · 20 Oktober 2026 · Proyek pribadi

> Aturan kerja dan etika pengembangan dijelaskan di [docs/README.md](file:///g:/bot-ai/docs/README.md).  
> Persyaratan produk dan persona dijelaskan di [docs/PRD.md](file:///g:/bot-ai/docs/PRD.md).  
> Desain teknis arsitektur dan latensi dijelaskan di [docs/TDD.md](file:///g:/bot-ai/docs/TDD.md).

---

## 14. Roadmap

Estimasi memakai asumsi kerja paruh waktu sekitar 8 sampai 10 jam per minggu [ASUMSI]. Angkanya perkiraan, bukan janji. Fase berikutnya baru dimulai setelah gate fase sebelumnya lolos dan dicatat.

| Fase | Nama | Jalur | Estimasi | Gate (harus lolos) |
| --- | --- | --- | --- | --- |
| 0 | Spike dan go/no-go | 1 | 1 minggu | TC-01 dan TC-02 lulus 3 kali berturut-turut; Gemini terbukti jalan untuk LLM, STT, dan TTS; ADR-001 disetujui pemilik |
| 1 | Loop suara MVP | 1 | 2 minggu | Percakapan suara end-to-end 10 menit; mode wake; reconnect; instrumentasi latensi aktif (TC-04, 05, 07, 08, 09) |
| 2 | Teks, gambar, persona, memori, admin | 1 | 2 minggu | FR-T1 sampai T4, P1 sampai P5, A1 sampai A3 terpenuhi (TC-10, 11, 13, 14, 16) |
| 3 | Latensi dan suara | 1 | 2 minggu | p50 ≤ 2,0 dtk dan p95 ≤ 3,5 dtk di PC; suara terpilih skor ≥ 4/5; golden set ≥ 80%; soak 4 jam lulus |
| 4 | Hardening: keamanan, QA, soak | 1 | 1 sampai 2 minggu | Semua TC kecuali TC-20 lulus; tidak ada bug S1 atau S2; soak 24 jam; runbook dan backup teruji |
| 5 | Uji deploy gratis | 3 | 1 minggu | Laporan Jalur 3 (T5.4) selesai dan pemilik memutuskan Jalur 2 |
| 6 | Avatar dan Pipeline B (opsional) | 1 | 2 sampai 3 minggu | FR-X1 berjalan; spike Pipeline B punya angka pembanding |
| 7 | Produksi 24/7 | 2 | 1 minggu | 7 hari berjalan dengan uptime ≥ 99% [ASUMSI] dan alert teruji |

Sampai akhir Fase 5, total sekitar 3 bulan paruh waktu.

**Jika Fase 0 berakhir NO-GO** (bot tidak bisa menangkap audio dengan DAVE), jangan memaksa. ADR-001 mencatat opsi: (a) kerangka TypeScript lain seperti discord-voice-ai, setelah dicek status DAVE-nya; (b) rakit tipis discord.js, @discordjs/voice, dan provider Gemini sendiri; (c) menunggu perbaikan upstream sambil membangun modul yang tidak bergantung pada penerimaan audio (teks, memori, persona). Pemilik memilih; roadmap disesuaikan.

---

## 15. Backlog task (senior ke junior)

Estimasi jam per task untuk junior manusia; AI biasanya lebih cepat tapi tetap butuh review. Kerjakan berurutan. Semua task tunduk pada aturan di §0 (`docs/README.md`).

### Fase 0: Spike dan go/no-go

**T0.1 Siapkan lingkungan dan fork AIRI** (3 jam)

- **Tujuan**: repo kerja milik kita yang bisa build.
- **Langkah**: (1) fork moeru-ai/airi, privat jika memungkinkan; (2) clone dan tambahkan remote upstream; (3) baca README dan CONTRIBUTING; (4) pasang Node dan pnpm sesuai versi yang diminta repo; (5) pnpm install dan build paket yang diperlukan; (6) buat .env.example; (7) baca file LICENSE dan jawab F10.
- **AC**: build lokal sukses; remote upstream terpasang; hasil F10 tercatat.
- **Bukti**: log build dan docs/decisions/F10.md.
- **Jangan**: menjalankan skrip yang tidak dipahami; menjalankan seluruh monorepo kalau tidak perlu.

**T0.2 Pemetaan repo** (4 jam)

- **Tujuan**: tahu persis bagian mana yang kita pakai.
- **Langkah**: temukan service bot Discord; telusuri cara ia masuk voice, menangkap audio, STT, memanggil LLM, TTS, dan memutar suara; cari cara konfigurasi provider; cek apakah ia butuh server runtime atau stage (F3, F4); catat versi discord.js dan @discordjs/voice serta apakah @snazzah/davey ada; tulis docs/ARCHITECTURE-NOTES.md.
- **AC**: dokumen memuat path file nyata untuk tiap tahap pada alur di §3, daftar “tidak ditemukan” untuk yang belum jelas, dan jawaban F3 serta F4.
- **Bukti**: ARCHITECTURE-NOTES.md.
- **Jangan**: mengubah kode di task ini.

**T0.3 Aplikasi dan bot Discord** (2 jam)

- **Langkah**: buat Application dan Bot di Developer Portal; reset token dan simpan ke .env; aktifkan intents sesuai SEC-3; buat server tes privat dan siapkan akun kedua; undang bot lewat OAuth2 (scope bot dan applications.commands) dengan permission minimum.
- **AC**: bot online di server tes; token hanya ada di .env; bot tidak punya Administrator.
- **Bukti**: screenshot bot online dengan token tersembunyi.
- **Jangan**: menempel token di chat, issue, atau dokumen.

**T0.4 Spike DAVE (go/no-go)** (4 sampai 8 jam)

- **Tujuan**: membuktikan bot bisa masuk voice dan menangkap suara utuh.
- **Langkah**: (1) jalankan bot AIRI apa adanya, atau skrip minimal discord.js dan @discordjs/voice jika AIRI belum bisa; (2) masuk ke voice channel tes bersama akun kedua; (3) simpan 10 detik audio satu pengguna sebagai WAV; (4) periksa log untuk close code 4017 atau error dekripsi; (5) ulangi 3 kali, lalu satu sesi 10 menit; (6) catat versi semua paket.
- **AC**: TC-01 dan TC-02 lulus 3 kali berturut-turut.
- **Bukti**: file WAV, log, dan docs/decisions/F1-F2.md.
- **Jangan**: mematikan enkripsi atau memakai trik di luar @discordjs/voice resmi; melanjutkan ke Fase 1 jika gagal. Kalau gagal, berhenti dan lapor.

**T0.5 Spike Gemini** (4 jam)

- **Langkah**: buat API key di Google AI Studio dan simpan di .env; cek daftar model beserta nama persisnya (F5); dengan skrip kecil uji (a) teks streaming, (b) transkripsi WAV dari T0.4 dalam bahasa Indonesia, (c) TTS satu kalimat Indonesia; ukur latensi 10 kali per panggilan; catat batas kuota dari halaman AI Studio; coba Voice design (F6); catat syarat penggunaan data (F7).
- **AC**: tabel hasil F5 sampai F7 dengan angka, nama model yang dipakai, dan status (jalan, tidak jalan, tidak tersedia).
- **Bukti**: docs/decisions/F5-F7.md dan sampel audio TTS.
- **Jangan**: menulis nama model permanen di kode; mengirim data pribadi teman ke API untuk tes.

**T0.6 ADR-001: keputusan basis** (2 jam)

- **Tujuan**: putuskan GO atau NO-GO untuk AIRI sebagai basis.
- **Langkah**: gabungkan hasil T0.1 sampai T0.5; tulis ADR-001 berisi konteks, opsi, keputusan, dan konsekuensi, termasuk opsi fallback di §14.
- **AC**: ADR ditandatangani pemilik (§20).
- **Jangan**: memulai Fase 1 tanpa ADR.

---

### Fase 1: Loop suara MVP

**T1.1 Gemini sebagai provider LLM di bot** (5 jam)

- **Langkah**: ikuti cara AIRI memilih atau menambah provider (dari T0.2); isi lewat env (LLM_PROVIDER, LLM_MODEL, GEMINI_API_KEY); pastikan keluarannya streaming; buat interface LlmProvider kecil jika belum ada.
- **AC**: pesan uji dijawab Gemini lewat bot; nama model hanya berasal dari config.
- **Jangan**: mengubah provider lain; menulis nama model permanen.

**T1.2 Jalur STT** (5 jam)

- **Langkah**: pasang STT sesuai hasil T0.5 (mis. pemahaman audio Gemini atau layanan kompatibel Whisper yang sudah tersedia di AIRI). Masukan: audio satu ucapan dari VAD. Keluaran: teks, user id, timestamp. Bahasa Indonesia dan Inggris; timeout 5 detik.
- **AC**: TC-03 dijalankan dan akurasinya tercatat.
- **Jangan**: menyimpan audio mentah ke disk kecuali mode debug lokal yang eksplisit (DEBUG_SAVE_AUDIO).

**T1.3 Jalur TTS dan pemutaran** (7 jam)

- **Langkah**: TTS, resample 24 ke 48 kHz, encode Opus, lalu putar di voice. Pakai library native untuk resample dan encode. Satu suara bawaan dulu, dipilih lewat config. Antrean pemutaran satu per satu. Di task ini boleh per jawaban penuh; streaming per kalimat dikerjakan di T3.2.
- **AC**: bot menjawab ucapan dengan suara tanpa klik atau patah (TC-04 versi dasar).
- **Jangan**: memutar dua jawaban sekaligus.

**T1.4 VAD, endpointing, dan mode interaksi** (6 jam)

- **Langkah**: pakai VAD yang sudah ada di AIRI atau tambah VAD ringan; jeda diam (VAD_HANGOVER_MS) bisa diatur, default 500 ms; batas ucapan 30 detik; mode wake, ptt, open lewat config. Wake word berbasis teks hasil STT berarti tiap ucapan ditranskripsi, jadi pantau pemakaian kuota.
- **AC**: TC-07 lulus; dalam 20 uji, ucapan tidak terpotong di tengah kalimat.

**T1.5 Barge-in dan pembuangan antrean** (4 jam)

- **Langkah**: deteksi suara pengguna saat bot bicara; hentikan pemutaran dalam 300 ms; batalkan permintaan LLM dan TTS yang sedang jalan (AbortController); kosongkan antrean.
- **AC**: TC-05 lulus; tidak ada audio basi yang diputar setelah disela.
- **Jangan**: menganggap suara bot sendiri sebagai sela.

**T1.6 Instrumentasi latensi** (3 jam)

- **Langkah**: pasang penanda t0 sampai t5 (§6) per turn id; tulis ke log JSON; ringkasan p50 dan p95 tampil di /status.
- **AC**: setiap giliran punya 6 penanda dan ringkasan bisa dihitung dari log.
- **Bukti**: contoh log 20 giliran.

**T1.7 Timeout, retry, fallback, dan reconnect** (5 jam)

- **Langkah**: timeout per tahap (TDD §6 butir 7); satu retry dengan jitter; fallback TTS ke teks dan LLM ke frasa cadangan; reconnect voice dengan backoff, termasuk handshake DAVE ulang; batasi percobaan supaya tidak loop tanpa akhir.
- **AC**: TC-08 dan TC-09 lulus.
- **Jangan**: menelan error diam-diam. Setiap fallback harus tercatat di log.

---

### Fase 2: Teks, gambar, persona, memori, admin

**T2.1 Chat teks dan gating** (4 jam)

- **Langkah**: balas saat di-mention dan di channel khusus (FR-T1); aturan gating (FR-T2) berupa mention, nama bot, pertanyaan langsung, dan cooldown; allowed_mentions kosong (FR-T4).
- **AC**: TC-10 dan TC-14 lulus.
- **Jangan**: memanggil LLM untuk setiap pesan di channel.

**T2.2 Pemahaman gambar** (4 jam)

- **Langkah**: validasi tipe (png, jpg, webp) dan ukuran maksimal 5 MB; kirim ke model multimodal lewat panggilan biasa, bukan sesi Live; komentar mengikuti persona.
- **AC**: TC-11 lulus.
- **Jangan**: mengikuti instruksi yang tertulis di dalam gambar (SEC-5).

**T2.3 Persona dan gaya bicara** (5 jam)

- **Langkah**: buat folder persona/ dari brief pemilik (PRD §7); pemuat file dan /persona reload; aturan voice-style; aturan keselamatan (SEC-7); versi persona masuk ke log.
- **AC**: persona dimuat ulang tanpa restart; 10 jawaban uji sesuai gaya dan aturan suara.
- **Jangan**: mengarang karakter tanpa brief pemilik. Jika brief kosong, berhenti dan tanya.

**T2.4 Memori** (6 jam)

- **Langkah**: memori jangka pendek dan panjang sesuai PRD §9. Penyimpanan lewat adapter: SQLite untuk Jalur 1, bisa diganti Postgres untuk Jalur 3. Ekstraksi fakta di akhir sesi. Perintah /memory me dan /forget me.
- **AC**: fakta bisa dilihat dan dihapus; fakta sensitif tidak tersimpan (uji 5 contoh); TC-15 bagian memori.
- **Jangan**: menyisipkan memori ke prompt sebagai instruksi.

**T2.5 Admin, allowlist, dan pengumuman privasi** (4 jam)

- **Langkah**: /status, /mute, allowlist guild dan user (SEC-4), pengumuman privasi saat join voice (SEC-9), keluar otomatis dari guild yang tidak dikenal.
- **AC**: TC-16 bagian kill switch lulus; pengguna di luar allowlist ditolak dengan sopan.

**T2.6 Batas biaya, rate limit, dan anti-injection** (5 jam)

- **Langkah**: rate limiter (SEC-6); anggaran harian (FR-A3) dengan degradasi bertahap; pembungkus data tidak tepercaya dan sanitasi keluaran (SEC-5).
- **AC**: TC-16 lulus; separuh kasus adversarial di TC-13 aman.

---

### Fase 3: Latensi dan suara

**T3.1 Harness benchmark latensi** (6 jam)

- **Langkah**: skrip yang memutar fixture WAV (10 ucapan: pendek, panjang, campuran Inggris) ke pipeline, 30 putaran, menghasilkan tabel p50 dan p95 per tahap; catat event-loop lag, CPU, RSS. Jalankan sekali sebelum optimasi sebagai baseline.
- **AC**: docs/perf/baseline.md; hasil bisa diulang (selisih antar-run < 15% [ASUMSI]).

**T3.2 Streaming per kalimat dan optimasi** (10 jam)

- **Langkah**: chunker kalimat, TTS streaming, keep-alive, pemanasan saat /join, cache frasa umum, context caching jika tersedia. Satu optimasi per PR dengan angka sebelum dan sesudah.
- **AC**: p50 ≤ 2,0 dtk dan p95 ≤ 3,5 dtk di PC; TC-04 lulus. Jika target tidak tercapai, laporkan data, jangan menurunkan target.
- **Jangan**: menggabungkan banyak optimasi dalam satu PR.

**T3.3 Tes pemilihan suara** (4 jam, plus panel)

- **Langkah**: siapkan naskah uji dan 3 sampai 5 kandidat (PRD §7); form skor di spreadsheet; 5 panelis; tes buta.
- **AC**: skor tercatat dan juara terpilih; hasil di docs/decisions/voice.md.

**T3.4 Eksperimen Voice design** (3 jam)

- **Langkah**: buat 2 suara dari deskripsi, simpan ID permanennya, masukkan ke tes T3.3.
- **AC**: laporan singkat. Jika fitur tidak tersedia, catat dan lewati.

**T3.5 Kualitas audio dan lexicon** (4 jam)

- **Langkah**: normalisasi volume, crossfade antar-chunk, jeda antarkalimat, lexicon.json, tes telinga.
- **AC**: tidak ada klik atau underrun dalam 10 jawaban uji; 20 kata sulit terlafal benar.

**T3.6 Golden set dan harness tuning** (8 jam)

- **Langkah**: 60 kasus sesuai PRD §9; skrip penilai otomatis dan juri LLM; laporan skor; 2 sampai 3 iterasi persona.
- **AC**: skor baseline tercatat dan akhirnya ≥ 80% lulus (TC-12).

**T3.7 Soak 4 jam** (2 jam kerja, 4 jam berjalan)

- **Langkah**: bot di voice dengan ucapan sintetis tiap 2 menit; catat RSS dan CPU tiap menit.
- **AC**: TC-17 (4 jam) lulus.

**Gate Fase 3**: semua AC Fase 3 lulus dan p50 serta p95 sesuai target. Jika latensi tidak tercapai, jangan lanjut; diskusikan dengan pemilik (opsi: Pipeline B lebih awal).

---

### Fase 4: Hardening

**T4.1 Audit keamanan** (6 jam)

- **Langkah**: periksa SEC-1 sampai SEC-15 satu per satu; jalankan gitleaks pada seluruh riwayat git; pnpm audit; uji redaksi log dengan token palsu; pastikan tidak ada audio mentah di disk.
- **AC**: laporan docs/security-review.md; tiap SEC berstatus dipenuhi, atau ada alasan tertulis dan persetujuan pemilik.
- **Jangan**: menandai dipenuhi tanpa bukti.

**T4.2 Suite otomatis dan checklist E2E** (8 jam)

- **Langkah**: unit test sesuai daftar di TDD §11; tes integrasi dengan fixture WAV; checklist E2E untuk TC-01 sampai TC-20; CI sesuai TDD §13.
- **AC**: CI hijau; checklist terisi dengan tanggal dan hasil.

**T4.3 Soak 24 jam dan injeksi kegagalan** (4 jam kerja)

- **Langkah**: jalankan TC-08, TC-09, TC-17 (24 jam), TC-18, dan TC-19. Catat grafik RSS dan CPU.
- **AC**: semuanya lulus; tidak ada bug S1 atau S2 terbuka.

**T4.4 Dokumentasi, runbook, dan backup** (6 jam)

- **Langkah**: README setup, docs/runbook.md, skrip backup harian dan restore, alert webhook (TDD §12).
- **AC**: orang lain (atau AI baru dengan konteks kosong) bisa menjalankan bot dari nol hanya dengan README dalam 30 menit; restore backup teruji sekali.

---

### Fase 5: Uji deploy gratis (Jalur 3)

**T5.1 Docker image** (5 jam)

- **Langkah**: Dockerfile sesuai TDD §13 dan SEC-11; build dan jalankan lokal di Docker; endpoint /healthz.
- **AC**: berjalan sebagai non-root; healthcheck hijau; TC-18 dan TC-19 lulus di dalam container.

**T5.2 Uji Render free** (6 jam)

- **Langkah**: deploy hanya service bot; atur env di dashboard; pakai DB eksternal; pasang pemanggil health berkala; ukur cold start, RSS, CPU, UDP keluar, restart; lakukan percakapan 30 menit (TC-20).
- **AC**: laporan berisi angka p50 dan p95, daftar patah-patah, jumlah restart.
- **Jangan**: menaikkan ke tier berbayar tanpa persetujuan pemilik (§20 D9).

**T5.3 Uji GCP e2-micro (opsional)** (5 jam)

- **Langkah**: pasang budget alert sekitar $1 lebih dulu; deploy; ukur seperti T5.2; hapus VM dan IP setelah selesai.
- **AC**: laporan; semua resource sudah dihapus dan tagihan terverifikasi $0.

**T5.4 Laporan Jalur 3 dan rekomendasi** (2 jam)

- **Langkah**: tabel perbandingan PC, Render, dan GCP: latensi p50 dan p95, RAM, CPU, patah-patah, restart, biaya; rekomendasi jalur 2.
- **AC**: pemilik memutuskan D4 (§20).

---

### Fase 6: Avatar dan Pipeline B (opsional)

**T6.1 Avatar lokal lewat AIRI stage** (10 jam)

- **Langkah**: putuskan VRM atau Live2D dengan melihat lisensi aset; pasang stage; lip-sync dari audio TTS; tabel pemetaan emosi ke ekspresi; tampilkan lewat OBS.
- **AC**: FR-X1 berjalan; mulut bergerak dalam 150 ms dan ekspresi berganti dalam 300 ms; assets/LICENSES.md lengkap.
- **Jangan**: memakai model karakter berhak cipta tanpa izin.

**T6.2 Spike Pipeline B (Gemini Live)** (10 jam)

- **Langkah**: prototipe terpisah dari jalur utama; session resumption sejak awal; ukur latensi, kualitas suara, CPU, dan stabilitas sesi; bandingkan dengan Pipeline A pada naskah yang sama.
- **AC**: laporan perbandingan A dan B beserta rekomendasi: jadikan mode opsional atau tinggalkan.

---

### Fase 7: Produksi 24/7 (Jalur 2)

**T7.1 Deploy produksi** (8 jam)

- **Langkah**: siapkan server pilihan D4; Docker dengan restart policy atau systemd; pindahkan secret; migrasi DB; backup harian; alert aktif; uji kill switch dari jarak jauh.
- **AC**: 7 hari berjalan dengan uptime ≥ 99% [ASUMSI]; alert terbukti sampai ke channel admin.

**T7.2 Peninjauan pasca-rilis** (2 jam)

- **Langkah**: retro singkat, perbarui golden set dari kejadian nyata, tulis backlog berikutnya.
- **AC**: catatan retro di docs/retro-001.md.

---

## 17. Risiko

| ID | Risiko | Peluang dan dampak | Mitigasi |
| --- | --- | --- | --- |
| R1 | Penerimaan audio dengan DAVE tidak didukung atau tidak stabil di AIRI | Tinggi, tinggi | T0.4 sebagai gate pertama; fallback di ADR-001 |
| R2 | Monorepo AIRI terlalu berat atau berubah cepat | Sedang, sedang | Fork dengan patch minimal, pin commit, sinkronisasi terjadwal, hanya paket yang perlu |
| R3 | Latensi pipeline STT, LLM, TTS terlalu tinggi | Sedang, tinggi | Instrumentasi sejak Fase 1, streaming, spike Pipeline B |
| R4 | Nama model, kuota, atau harga Gemini berubah | Tinggi, sedang | Semua di env, adapter provider, cek berkala |
| R5 | Kuota free tier habis atau sesi dibatasi | Sedang, sedang | Rate limit, anggaran harian, degradasi, opsi tier berbayar (D6) |
| R6 | Jalur 3 tidak cukup (CPU, UDP, restart) | Tinggi, rendah | Memang eksperimen; hasil negatif sah; lanjut ke Jalur 2 |
| R7 | Kekhawatiran privasi suara teman | Sedang, tinggi | SEC-8 dan SEC-9, persetujuan, retensi 7 hari, /forget |
| R8 | Prompt injection lewat suara, chat, atau gambar | Sedang, sedang | SEC-5, tanpa tool berdampak, golden set adversarial |
| R9 | Suara TTS bahasa Indonesia kurang natural | Sedang, sedang | Panel dengar, kandidat ElevenLabs, lexicon |
| R10 | Scope creep (avatar, Live, fitur tambahan) | Tinggi, sedang | Gate fase dan daftar W di PRD §4 |
| R11 | Junior atau AI menebak API sehingga kode salah | Tinggi, sedang | Aturan docs/README.md §0, bukti wajib, review senior tiap PR |
| R12 | Discord mengubah aturan atau API penerimaan audio | Rendah, tinggi | Pantau changelog, siap fallback ke mode teks |
| R13 | Token atau API key bocor | Rendah, tinggi | SEC-1 dan SEC-2, rotasi segera |
| R14 | Lisensi aset avatar bermasalah | Sedang, sedang | assets/LICENSES.md, hanya aset berlisensi jelas |
| R15 | Proyek mandek karena terlalu besar | Sedang, sedang | Fase kecil dengan demo di tiap gate; suara MVP lebih dulu |

---

## 18. Definition of Done dan checklist PR

Sebuah task selesai jika semua poin ini terpenuhi:

1. Semua kriteria selesai (AC) pada task lolos.
2. Tes yang relevan hijau; lint dan typecheck bersih.
3. Tidak ada secret di diff maupun riwayat commit.
4. Bukti terlampir (log, angka, rekaman, screenshot).
5. Dokumentasi dan catatan keputusan diperbarui jika ada yang berubah.
6. Perubahan pada kode upstream AIRI dicatat di `docs/upstream-patches.md` beserta alasannya.
7. Telah ditinjau senior.

**Checklist PR** (salin ke deskripsi PR):

- [ ] ID task dan ringkasan satu kalimat
- [ ] AC dicentang satu per satu dengan bukti
- [ ] Tidak ada perubahan di luar scope task
- [ ] Tidak ada secret, tidak ada log yang memuat isi percakapan
- [ ] Dependency baru (jika ada) dijelaskan: nama, versi, alasan, alternatif
- [ ] Dampak pada latensi diukur jika menyentuh jalur audio
- [ ] docs/ diperbarui

**Definition of Done tiap fase**: semua task fase selesai, gate fase lolos, tag versi dibuat, dan catatan rilis singkat ditulis.

---

## 19. Template prompt untuk AI murah

Untuk AI seperti Gemini Flash: satu task per percakapan. Konteks dibatasi pada `docs/README.md` (§0), `docs/TDD.md` (§3, §5), entri task yang bersangkutan, dan file kode yang relevan. Jangan menempel seluruh dokumen.

**Prompt sistem (tempel di awal percakapan)**

```
Kamu adalah developer TypeScript junior yang bekerja di bawah arahan senior.
Proyek: bot Discord voice AI berbasis fork AIRI. Kamu mengerjakan SATU task dari backlog.
Aturan:
1. Kerjakan hanya task yang diberikan. Jangan menambah fitur lain.
2. Jangan menebak nama file, fungsi, atau parameter API. Jika tidak ada di konteks yang kuberikan, katakan TIDAK DITEMUKAN dan minta file yang kamu butuhkan.
3. Tanda [VERIFIKASI] berarti belum terbukti. Perlakukan sebagai hipotesis.
4. Jangan menulis secret ke kode, log, atau contoh. Pakai nama variabel env.
5. Ubah kode upstream seminimal mungkin. Kode baru taruh di folder kita.
6. Kode dan komentar dalam bahasa Inggris. Penjelasan dalam bahasa Indonesia.
7. Jika dua percobaan gagal atau task menuntut keputusan di luar scope, berhenti dan tulis laporan BLOCKER.
Format jawaban: (a) rencana singkat, (b) perubahan file lengkap, (c) cara menguji, (d) bukti yang harus kuambil, (e) hal yang tidak yakin.
```

**Template pesan tugas**

```
TUGAS: <ID task, mis. T1.3>
KONTEKS DOKUMEN: <tempel §0, §3, §5, dan entri task>
FILE RELEVAN: <path dan isi file; tulis TIDAK ADA jika belum ada>
BATASAN: <mis. jangan ubah file di luar folder extensions/>
KELUARAN: rencana, kode, cara uji, bukti yang dibutuhkan, hal yang tidak yakin
```

**Template laporan selesai**

```
Task: <ID>
Ringkasan perubahan: <1 sampai 3 kalimat>
AC: <tiap AC, lulus atau tidak, bukti>
Angka (jika ada): <latensi, RSS, CPU>
File yang diubah: <daftar>
Hal yang tidak yakin: <daftar>
```

**Template BLOCKER**

```
Task: <ID>
Yang dicoba: <langkah dan hasil, minimal 2 percobaan>
Pesan error atau perilaku: <salin apa adanya, tanpa secret>
Dugaan penyebab: <label ASUMSI>
Keputusan yang dibutuhkan: <pertanyaan spesifik untuk senior atau pemilik>
```

---

## 20. Keputusan terbuka dan persetujuan

| ID | Keputusan | Dibutuhkan sebelum | Rekomendasi awal |
| --- | --- | --- | --- |
| D1 | Nama bot, wake word, dan brief karakter (PRD §7) | T2.3 | Diisi pemilik; tanpa ini T2.3 berhenti |
| D2 | Arti “jalur 3” (A1) | Fase 5 | Render atau GCP e2-micro sebagai uji gratis |
| D3 | Mode interaksi default dan kata panggil | T1.4 | wake |
| D4 | Jalur 2: server rumah atau VPS Singapura | Fase 7, setelah T5.4 | Putuskan dari data T5.4 |
| D5 | Avatar: VRM, Live2D, atau dilewati | Fase 6 | VRM dengan lisensi jelas |
| D6 | Pindah ke tier berbayar Gemini bila kuota atau privasi tidak memadai | Setelah T0.5 | Tetap free tier selama data tidak sensitif |
| D7 | Siapa 5 panelis tes suara dan persetujuan mereka | T3.3 | Teman yang biasa memakai server |
| D8 | Fork privat atau publik, dan lisensi kode kita | T0.1 | Privat sampai lisensi aset jelas |
| D9 | Batas biaya bulanan | Fase 5 | $0 sampai pemilik menyetujui sebaliknya |

**Persetujuan**

| Peran | Nama | Tanggal | Status |
| --- | --- | --- | --- |
| Pemilik proyek |  |  |  |
| Senior developer |  |  |  |
| Penerima tugas (junior atau AI) |  |  | Membaca §0 sampai §5 |

**Riwayat versi**: v0.1, 20 Oktober 2026, draft awal.
