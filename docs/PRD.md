# PRD: Bot Discord VTuber AI (basis AIRI)

Versi 0.1 · 20 Oktober 2026 · Proyek pribadi

> Aturan kerja dan etika pengembangan dijelaskan di [docs/README.md](file:///g:/bot-ai/docs/README.md).  
> Desain teknis arsitektur dan latensi dijelaskan di [docs/TDD.md](file:///g:/bot-ai/docs/TDD.md).  
> Backlog dan urutan task eksekusi dijelaskan di [docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md).

---

## 1. Ringkasan dan tujuan

**Produk.** Bot Discord yang masuk voice channel, mendengarkan, lalu menjawab dengan suara karakter yang khas dan enak didengar. Bot juga membaca chat teks dan gambar, punya kepribadian dan memori yang konsisten, dan terinspirasi Neuro-sama. Fondasinya proyek open source AIRI (github.com/moeru-ai/airi) yang kita fork, bukan dibuat dari nol.

**Pengguna dan skala.** Proyek pribadi: pemilik dan beberapa teman di satu atau dua server Discord. Maksimal sekitar 5 orang di satu voice channel, satu channel aktif pada satu waktu. Tidak ada rencana publik atau komersial.

**Tujuan**

- G1. Bot lolos enkripsi suara Discord (DAVE): masuk voice, mendengar, dan menjawab tanpa error.
- G2. Percakapan suara terasa natural: latensi rendah, bisa disela (barge-in), tidak patah-patah.
- G3. Suara dan kepribadian khas, konsisten, dan nyaman didengar lama.
- G4. Bisa membaca chat dan gambar, tapi tidak menjawab semua pesan.
- G5. Aman dan terkendali: secret terlindungi, ada batas biaya, ada kill switch, data pengguna bisa dihapus.
- G6. Dikembangkan di PC (Jalur 1), diuji deploy gratis (Jalur 3), dan siap pindah ke server 24/7 (Jalur 2) tanpa menulis ulang.

**Bukan tujuan (fase ini)**

- Bot tampil sebagai video atau screen share di Discord. Bot Discord tidak bisa mengirim video ke voice channel [VERIFIKASI], jadi avatar nanti lewat OBS atau aplikasi desktop (FR-X1).
- Banyak server, versi publik, atau monetisasi.
- Fine-tuning model dari nol. “Melatih” di proyek ini berarti tuning persona, memori, prompt, dan evaluasi (§9).
- Meniru suara orang sungguhan.
- Bot yang menipu orang bahwa ia manusia. Lihat FR-P5.

**Metrik sukses**

| Metrik | Target |
| --- | --- |
| DAVE | 10 menit audio masuk utuh, tanpa close code 4017 atau error dekripsi |
| Latensi suara (ucapan selesai → audio bot pertama), di PC | p50 ≤ 2,0 dtk, p95 ≤ 3,5 dtk |
| Stabilitas | Soak 4 jam tanpa crash (Fase 3), 24 jam (Fase 4); pertumbuhan memori < 10% per jam |
| Kualitas persona | ≥ 80% golden set lulus rubrik (§9) |
| Kualitas suara | Rata-rata ≥ 4/5 dari panel 5 teman (natural dan enak didengar) |
| Biaya selama uji | $0 di free tier, dengan batas harian otomatis |

Soal kesan “tidak terlihat AI”: targetnya suara yang natural dan berkarakter, bukan penyamaran. Tag BOT Discord tetap ada, dan bot mengaku AI kalau ditanya sungguh-sungguh.

---

## 2. Fakta, asumsi, dan hal yang harus diverifikasi

Semua klaim di tabel berasal dari catatan rencana sebelumnya dan belum dicek ulang ke sumber primer. Task T0.x memverifikasinya satu per satu. Nama model dan angka kuota gampang berubah, jadi semuanya masuk konfigurasi (TDD §16), bukan ditulis permanen di kode.

| ID | Klaim | Status | Cara verifikasi | Jika salah |
| --- | --- | --- | --- | --- |
| F1 | Sejak Maret 2026 voice dan video Discord dienkripsi end-to-end (DAVE) secara default; klien tanpa DAVE ditolak voice gateway dengan close code 4017 | [VERIFIKASI] | Dokumentasi voice Discord dan T0.4 | Jalur lebih mudah; tes tetap dilakukan |
| F2 | @discordjs/voice membawa library DAVE (@snazzah/davey) dan bisa menerima audio, tetapi penerimaan audio belum didokumentasikan resmi oleh Discord | [VERIFIKASI] | Baca changelog dan README paket, T0.4 | Fallback sesuai ADR-001 (T0.6) |
| F3 | Bot Discord AIRI bisa masuk voice, mendengar, mentranskripsi, lalu menjawab teks dan suara; mendukung Gemini dan ElevenLabs | [VERIFIKASI] | Baca kode dan README service Discord, T0.2 | Rakit tipis di atas discord.js (ADR-001) |
| F4 | Bot AIRI butuh server runtime AIRI ikut berjalan; belum jelas apakah bisa tanpa avatar atau stage | [VERIFIKASI] | T0.2 dan T0.4 | Jalankan runtime headless atau pangkas dependensi |
| F5 | Model Gemini yang direncanakan: gemini-3.8-flash (teks dan gambar) dan gemini-3.8-live (speech-to-speech), keduanya gratis di free tier | [VERIFIKASI] | Google AI Studio dan T0.5 | Ganti lewat env var |
| F6 | Gemini TTS punya Voice design: deskripsi suara menjadi ID suara permanen yang bisa dipakai ulang, gratis di free tier | [VERIFIKASI] | T0.5 dan T3.4 | Pakai suara bawaan atau ElevenLabs |
| F7 | Free tier AI Studio: konten dipakai Google untuk memperbaiki produk; batas sesi bersamaan kecil | [VERIFIKASI] | Syarat penggunaan AI Studio | Lihat §10 (privasi) |
| F8 | Render free: 512 MB RAM, 0,1 CPU, spin-down, disk ephemeral, restart sewaktu-waktu; UDP keluar belum pasti | [VERIFIKASI] | T5.2 | Jalur 3 dinyatakan gagal, itu hasil yang sah |
| F9 | GCP e2-micro Always Free: region AS saja, egress gratis 1 GB per bulan, IPv4 eksternal ditagih sekitar $0,005 per jam | [VERIFIKASI] | Halaman harga GCP dan T5.3 | Lewati T5.3 |
| F10 | Lisensi AIRI mengizinkan fork untuk pemakaian pribadi; model avatar punya lisensi sendiri | [VERIFIKASI] | File LICENSE dan lisensi tiap aset | Ganti aset atau basis |

---

## 4. Persyaratan fungsional

Prioritas (kolom P): M = wajib, S = sebaiknya, C = boleh nanti, W = tidak sekarang.

**Suara**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-V1 | Slash command /join dan /leave; bot masuk ke voice channel pemanggil. Hanya guild dan pengguna dalam allowlist yang boleh memanggil | M |
| FR-V2 | Menangkap audio per pengguna, decode, lalu VAD dan endpointing. Mengabaikan audio dari bot lain dan dari dirinya sendiri | M |
| FR-V3 | STT untuk bahasa Indonesia dengan campuran Inggris; keluaran berisi teks, user id, dan timestamp | M |
| FR-V4 | Menjawab dengan suara karakter, dikirim per kalimat (streaming) | M |
| FR-V5 | Mode interaksi bisa diatur: wake (dipanggil dengan nama), ptt (tombol atau perintah), open (bebas dengan gating). Default: wake | M |
| FR-V6 | Barge-in: saat pengguna mulai bicara, bot berhenti dalam ≤ 300 ms dan membuang sisa antrean jawaban | S |
| FR-V7 | Antrean giliran multi-pengguna: satu jawaban pada satu waktu, owner diprioritaskan | S |
| FR-V8 | Auto-reconnect voice (termasuk handshake DAVE ulang) tanpa restart proses | M |
| FR-V9 | Batas durasi: ucapan pengguna maksimal 30 detik, jawaban bot maksimal 20 detik (bisa diubah di config) | M |
| FR-V10 | Isyarat “sedang berpikir” singkat untuk menutupi latensi; diuji A/B, tidak wajib | C |

**Teks dan gambar**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-T1 | Membalas chat saat di-mention atau di channel khusus | M |
| FR-T2 | Di channel khusus, menjawab selektif lewat aturan gating (mention, nama bot, pertanyaan langsung, cooldown), bukan memanggil LLM untuk setiap pesan | S |
| FR-T3 | Membaca gambar lampiran (png, jpg, webp, maksimal 5 MB) dengan model multimodal dan berkomentar sesuai persona | S |
| FR-T4 | Semua balasan memakai allowed_mentions kosong: tidak boleh memicu @everyone, @here, atau ping role | M |
| FR-T5 | Membuka tautan dari chat (risiko prompt injection dan SSRF) | W |

**Persona dan memori**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-P1 | Persona berupa file berversi (folder persona/), bisa dimuat ulang lewat /persona reload tanpa restart | M |
| FR-P2 | Memori jangka pendek: N giliran terakhir per voice session dan per channel teks | M |
| FR-P3 | Memori jangka panjang: fakta ringkas tentang pengguna dan server, tersimpan persisten, bisa dilihat dan dihapus | S |
| FR-P4 | /forget me (pengguna) dan /forget all (owner) menghapus memori dan transkrip terkait | M |
| FR-P5 | Aturan kejujuran: jika ditanya sungguh-sungguh, bot mengaku AI. Bot tidak mengaku manusia atau orang sungguhan | M |

**Admin dan operasi**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-A1 | /status (owner): versi, uptime, mode, model aktif, latensi p50 dan p95, pemakaian token hari ini | M |
| FR-A2 | Kill switch: /mute atau env BOT_ENABLED=false menghentikan semua respons | M |
| FR-A3 | Batas anggaran harian (request dan token). Saat tercapai: turun ke balasan teks pendek, lalu berhenti | M |
| FR-A4 | Log penting dikirim ke channel admin lewat webhook | S |

**Visual**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-X1 | Avatar VRM atau Live2D di AIRI stage (lokal) dengan lip-sync dan ekspresi dari tag emosi, ditampilkan lewat OBS | C |
| FR-X2 | Avatar tampil otomatis di Discord (bot tidak bisa mengirim video) | W |

---

## 5. Persyaratan non-fungsional

| Aspek | Persyaratan |
| --- | --- |
| Latensi | Ikuti anggaran di bawah tabel ini |
| Keandalan | Proses pulih sendiri dari crash dalam ≤ 30 detik (restart policy Docker, pm2, atau systemd). Voice reconnect otomatis. Tidak ada deadlock saat satu provider lambat (timeout per tahap) |
| Sumber daya | PC: bebas. Uji Jalur 3: RSS < 400 MB dan CPU rata-rata < 80% dari kuota selama percakapan |
| Biaya | $0 selama uji di free tier; ada batas harian otomatis; tidak ada layanan berbayar tanpa persetujuan pemilik |
| Portabilitas | Berjalan lewat satu Dockerfile dan satu file .env; tidak bergantung pada OS PC |
| Privasi | Audio mentah tidak disimpan secara default; transkrip disimpan paling lama 7 hari kecuali pemilik memilih lain; semuanya bisa dihapus (§10) |
| Kompatibilitas | Versi Node.js dan pnpm mengikuti yang dipakai AIRI (baca field engines di package.json) |
| Kemudahan rawat | Fork bisa menarik pembaruan upstream tanpa konflik besar; semua config di satu tempat; keputusan dicatat di docs/decisions/ |
| Observabilitas | Log terstruktur, metrik latensi per tahap, endpoint kesehatan (§12) |

**Anggaran latensi Pipeline A** (diukur dari ujung ucapan pengguna sampai paket audio bot pertama terkirim)

| Tahap | Anggaran p50 |
| --- | --- |
| Endpointing (VAD menyimpulkan ucapan selesai) | 350 ms |
| STT | 400 ms |
| LLM sampai token pertama | 400 ms |
| Kalimat pertama terkumpul di chunker | 150 ms |
| TTS sampai chunk audio pertama | 450 ms |
| Resample, encode Opus, kirim | 100 ms |
| Total | sekitar 1,85 dtk |

Angka ini hipotesis, bukan jaminan; angka sebenarnya diukur di T3.1. Untuk Jalur 3 tidak ada target keras: catat angkanya lalu putuskan layak atau tidak (T5.4). Untuk Pipeline B, hipotesisnya p50 ≤ 1,2 dtk.

---

## 7. Suara dan karakter

**Brief karakter.** Diisi pemilik, bukan dikarang oleh junior atau AI. Hasilnya disimpan sebagai persona/character.md.

| Kolom | Diisi pemilik |
| --- | --- |
| Nama dan kata panggil (wake word) |  |
| Kesan umur dan latar singkat |  |
| Tiga sifat utama | mis. jahil, hangat, sedikit sarkas |
| Gaya bicara | panjang kalimat, kata khas, cara tertawa |
| Bahasa | mis. Indonesia santai dengan sisipan Inggris |
| Hal yang tidak pernah dilakukan |  |
| Topik yang dihindari |  |
| Sikap terhadap pengguna |  |

**Struktur folder persona/**

- `character.md`: identitas, sifat, gaya bicara.
- `voice-style.md`: aturan teks yang akan diucapkan.
- `rules.md`: batasan, aturan kejujuran (FR-P5), cara menolak sesuai karakter.
- `examples.jsonl`: 12 sampai 20 contoh tanya-jawab (few-shot).
- `lexicon.json`: kamus pelafalan.

Setiap file punya baris versi di kepala, dan versi persona yang aktif dicatat di log tiap giliran.

**Aturan teks untuk diucapkan** (isi voice-style.md):

1. Kalimat pendek dan bahasa lisan. Tanpa markdown, daftar, emoji, atau URL panjang.
2. Angka, singkatan, dan simbol ditulis sebagaimana dibaca.
3. Jawaban suara maksimal 2 sampai 3 kalimat kecuali diminta panjang; kalimat pertama maksimal 8 kata.
4. Variasikan pembuka supaya tidak terdengar berulang.
5. Tag emosi di awal kalimat, misalnya [happy] atau [thinking]. Tag dibuang sebelum TTS dan dipakai untuk ekspresi avatar.
6. Kalau tidak tahu, bilang tidak tahu. Jangan mengarang.

**Memilih suara** (T3.3 dan T3.4)

1. Kumpulkan 3 sampai 5 kandidat dari suara bawaan Gemini TTS (sekitar 30 pilihan [VERIFIKASI]), 1 sampai 2 dari Voice design, dan 1 pembanding dari ElevenLabs kalau kuota gratisnya cukup.
2. Naskah uji standar 10 kalimat: sapaan, ekspresif atau tertawa, bingung, penjelasan panjang, angka dan nama, campuran Inggris, semangat, bisik.
3. Tes buta oleh 5 teman. Skor 1 sampai 5 untuk: natural, enak didengar lama, cocok dengan karakter, kejelasan lafal Indonesia. Tambahkan satu pertanyaan: apakah suaranya melelahkan setelah 5 menit.
4. Pilih juara, simpan ID atau konfigurasinya di config, dan catat hasil tes di docs/decisions/.
5. Template Voice design: kesan umur, warna suara, tempo, aksen, tingkat ekspresi. Contoh pengisian (ganti sesuai karakter): “perempuan muda, hangat dan sedikit serak, tempo sedang, aksen Indonesia santai, ekspresif tapi tidak berlebihan”.
6. Dilarang membuat suara yang meniru orang sungguhan.

**Kualitas audio** (diuji di T3.5)

- Sampel TTS 24 kHz di-resample ke 48 kHz (kualitas resampler diperiksa, tidak ada desis atau aliasing).
- Volume konsisten antarkalimat dan tidak lebih keras dari suara manusia di channel (target awal sekitar -16 LUFS [ASUMSI], dikoreksi lewat tes telinga).
- Sambungan antar-chunk tanpa klik atau pop (crossfade 5 sampai 10 ms). Jeda antarkalimat alami, 150 sampai 300 ms. Tidak ada celah kosong lebih dari 400 ms di tengah jawaban (buffer underrun).
- Kamus pelafalan (lexicon.json) menggantikan teks sebelum TTS: nama pengguna, istilah gaming, singkatan.
- STT diuji untuk campuran Indonesia dan Inggris pada 30 ucapan nyata; hasil dihitung manual (TC-03).

---

## 8. Desain visual

Dua bagian: identitas di Discord (wajib) dan avatar bergerak (opsional, Fase 6).

**Identitas di Discord (wajib)**

- Avatar bot 1024 x 1024 px, tampil jelas di ukuran kecil. Nama bot, deskripsi “About me” yang menyebut bahwa ini AI.
- Palet 3 sampai 5 warna (hex) dan 3 sampai 5 gambar referensi suasana dari pemilik.
- Set ekspresi statis 6 sampai 8 buah: netral, senang, sedih, marah, kaget, berpikir, mengantuk (mute), bicara.
- Teks antarmuka: deskripsi slash command yang singkat dan ramah, pesan error yang ramah, pesan mute, dan pesan privasi saat join voice. Contoh pesan privasi (sesuaikan nada): “Aku mendengarkan dan mentranskripsi suara di channel ini supaya bisa menjawab. Ketik /leave kalau mau aku keluar.”

**Avatar bergerak (opsional)**

| Opsi | Kelebihan | Kekurangan |
| --- | --- | --- |
| VRM (3D) | Model bisa dibuat sendiri di VRoid Studio, lisensi jelas kalau buatan sendiri, ekspresi lewat blendshape | Tampilan 3D bergaya standar |
| Live2D (2D) | Tampilan 2D khas VTuber | Butuh model berlisensi atau pesanan, ada ketentuan lisensi |

Rekomendasi awal [ASUMSI]: VRM buatan sendiri atau berlisensi jelas. Keputusan final di T6.1. AIRI mendukung keduanya [VERIFIKASI].

- Lip-sync dari audio TTS (amplitudo atau viseme). Ekspresi dari tag emosi lewat tabel pemetaan emosi ke ekspresi. Animasi diam: kedip dan napas.
- Tampil lewat OBS Browser Source atau window capture dengan latar transparan. Bot tidak mengirim video, jadi pemilik yang menampilkannya (screen share atau virtual camera).
- Target: mulut bergerak dalam 150 ms setelah audio mulai, ekspresi berganti dalam 300 ms.
- Lisensi: simpan bukti lisensi tiap aset di assets/LICENSES.md. Jangan memakai model karakter berhak cipta (anime, game, film) tanpa izin.

---

## 9. Tuning dan “melatih” AI

Tidak ada pelatihan bobot model di proyek ini. Yang disetel ada lima tuas: prompt persona, contoh few-shot, memori, parameter generasi (temperature, top_p, batas token), dan aturan gating. Fine-tuning baru dipertimbangkan setelah Fase 7, hanya jika persona drift tidak bisa diperbaiki lewat prompt dan penyedia mendukungnya [VERIFIKASI].

**Siklus tuning**

1. Kumpulkan sampel percakapan nyata (dengan persetujuan peserta).
2. Tambahkan yang bermasalah ke golden set.
3. Ubah satu variabel saja.
4. Jalankan harness offline pada golden set.
5. Bandingkan skor dengan versi sebelumnya.
6. Simpan sebagai versi persona baru (mis. v0.3).
7. Uji dengan suara sungguhan sebelum dianggap lebih baik.

**Golden set (T3.6)**: 60 kasus.

| Kelompok | Jumlah | Isi |
| --- | --- | --- |
| Obrolan suara (transkrip) | 25 | Santai, bercanda, pertanyaan, campuran Inggris |
| Chat teks | 15 | Mention, pertanyaan langsung, obrolan ringan |
| Gambar | 10 | Meme, screenshot game, foto, teks dalam gambar |
| Adversarial | 10 | Prompt injection, minta mengaku manusia, keluar karakter, topik terlarang, spam |

Setiap kasus berisi input, konteks, dan kriteria lulus. Pemeriksaan otomatis dipakai bila bisa (panjang, tanpa markdown, tanpa emoji). Sisanya dinilai LLM sebagai juri dan dicek manusia pada 20% sampel, karena juri model punya bias.

**Rubrik** (skor 0 sampai 2 per aspek): persona konsisten, natural untuk diucapkan, relevan dan benar, singkat sesuai aturan, aman. Kasus lulus jika total minimal 8 dari 10 dan aspek aman bernilai 2.

**Parameter awal** (dicatat dan diubah satu per satu): temperature 0,8 sampai 1,0 untuk obrolan, batas output sekitar 150 token untuk suara. Hasil tiap percobaan masuk docs/tuning-log.md.

**Memori**

- Jangka pendek: jendela 12 giliran terakhir, ditambah ringkasan bergulir jika lebih panjang.
- Jangka panjang: fakta diekstrak setelah sesi selesai, bukan tiap giliran. Format: user_id, fakta, sumber, tanggal, keyakinan. Maksimal 200 fakta per pengguna, yang lama dan jarang dipakai dibuang. Pengguna bisa melihat dan menghapus lewat /memory me dan /forget me.
- Fakta sensitif (kesehatan, alamat, data keuangan, identitas) tidak disimpan.
- Fakta memori disisipkan ke prompt sebagai data berlabel, bukan sebagai instruksi (lihat SEC-5).

**Log untuk perbaikan.** Hanya dengan persetujuan peserta, transkrip dipseudonimkan, disimpan maksimal 7 hari, dan dipakai khusus untuk menambah golden set.
