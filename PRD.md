# PRD dan Rencana Kerja: Bot Discord VTuber AI (basis AIRI)

Versi 0.1 · 20 Oktober 2026 · Proyek pribadi · Brief dari senior developer untuk junior developer atau AI asisten (mis. Gemini Flash)

## 0. Cara memakai dokumen ini

Dokumen ini punya dua fungsi: PRD (apa yang dibangun dan kenapa) dan rencana kerja (urutan serta task). Pembacanya dibagi dua:

- Pemilik proyek: baca §1, §2, §14, §17, dan §20. Keputusan yang butuh jawabanmu ada di §20.
- Junior developer atau AI: baca §0 sampai §5 sekali, lalu hanya task yang ditugaskan di §15 beserta bagian yang dirujuk task itu.

Aturan kerja (berlaku untuk semua task):

1. Satu task dalam satu waktu, urut sesuai ID. Jangan masuk fase berikutnya sebelum gate fase sekarang lolos (§14).
2. Tiga label kepastian dipakai di seluruh dokumen: \[TERVERIFIKASI\] sudah dibuktikan, \[VERIFIKASI\] klaim dari catatan awal yang belum diperiksa, \[ASUMSI\] keputusan sementara. Jangan memperlakukan \[VERIFIKASI\] sebagai fakta. Buktikan dulu, lalu catat hasilnya di docs/decisions/.
3. Jangan menebak nama file, fungsi, atau parameter API. Cari di kode atau dokumentasi resmi. Kalau tidak ketemu, tulis “tidak ditemukan” di catatan lalu tanya.
4. Ubah kode upstream AIRI seminimal mungkin. Kode tambahan kita taruh di folder atau paket sendiri supaya fork tetap bisa menarik pembaruan upstream.
5. Berhenti dan tanya jika: dua kali percobaan perbaikan gagal; task menuntut keputusan di luar scope; task menyentuh secret atau akun berbayar; atau butuh dependency besar yang baru. Tulis blocker dengan template di §19.
6. Setiap task selesai dengan commit atau PR, catatan singkat, dan bukti (log, angka, rekaman audio, screenshot). “Sudah jalan” tanpa bukti berarti belum selesai.
7. Jangan pernah commit secret (token Discord, API key). Semuanya lewat file .env yang masuk .gitignore.
8. Kode, komentar, dan pesan commit memakai bahasa Inggris. Catatan dan dokumen boleh bahasa Indonesia.

Format setiap task di §15: Tujuan, Langkah, Kriteria selesai (AC), Bukti, dan Jangan.

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

- Bot tampil sebagai video atau screen share di Discord. Bot Discord tidak bisa mengirim video ke voice channel \[VERIFIKASI\], jadi avatar nanti lewat OBS atau aplikasi desktop (FR-X1).
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

## 2. Fakta, asumsi, dan hal yang harus diverifikasi

Semua klaim di tabel berasal dari catatan rencana sebelumnya dan belum dicek ulang ke sumber primer. Task T0.x memverifikasinya satu per satu. Nama model dan angka kuota gampang berubah, jadi semuanya masuk konfigurasi (§16), bukan ditulis permanen di kode.

| ID | Klaim | Status | Cara verifikasi | Jika salah |
| --- | --- | --- | --- | --- |
| F1 | Sejak Maret 2026 voice dan video Discord dienkripsi end-to-end (DAVE) secara default; klien tanpa DAVE ditolak voice gateway dengan close code 4017 | \[VERIFIKASI\] | Dokumentasi voice Discord dan T0.4 | Jalur lebih mudah; tes tetap dilakukan |
| F2 | @discordjs/voice membawa library DAVE (@snazzah/davey) dan bisa menerima audio, tetapi penerimaan audio belum didokumentasikan resmi oleh Discord | \[VERIFIKASI\] | Baca changelog dan README paket, T0.4 | Fallback sesuai ADR-001 (T0.6) |
| F3 | Bot Discord AIRI bisa masuk voice, mendengar, mentranskripsi, lalu menjawab teks dan suara; mendukung Gemini dan ElevenLabs | \[VERIFIKASI\] | Baca kode dan README service Discord, T0.2 | Rakit tipis di atas discord.js (ADR-001) |
| F4 | Bot AIRI butuh server runtime AIRI ikut berjalan; belum jelas apakah bisa tanpa avatar atau stage | \[VERIFIKASI\] | T0.2 dan T0.4 | Jalankan runtime headless atau pangkas dependensi |
| F5 | Model Gemini yang direncanakan: gemini-3.8-flash (teks dan gambar) dan gemini-3.8-live (speech-to-speech), keduanya gratis di free tier | \[VERIFIKASI\] | Google AI Studio dan T0.5 | Ganti lewat env var |
| F6 | Gemini TTS punya Voice design: deskripsi suara menjadi ID suara permanen yang bisa dipakai ulang, gratis di free tier | \[VERIFIKASI\] | T0.5 dan T3.4 | Pakai suara bawaan atau ElevenLabs |
| F7 | Free tier AI Studio: konten dipakai Google untuk memperbaiki produk; batas sesi bersamaan kecil | \[VERIFIKASI\] | Syarat penggunaan AI Studio | Lihat §10 (privasi) |
| F8 | Render free: 512 MB RAM, 0,1 CPU, spin-down, disk ephemeral, restart sewaktu-waktu; UDP keluar belum pasti | \[VERIFIKASI\] | T5.2 | Jalur 3 dinyatakan gagal, itu hasil yang sah |
| F9 | GCP e2-micro Always Free: region AS saja, egress gratis 1 GB per bulan, IPv4 eksternal ditagih sekitar $0,005 per jam | \[VERIFIKASI\] | Halaman harga GCP dan T5.3 | Lewati T5.3 |
| F10 | Lisensi AIRI mengizinkan fork untuk pemakaian pribadi; model avatar punya lisensi sendiri | \[VERIFIKASI\] | File LICENSE dan lisensi tiap aset | Ganti aset atau basis |

## 3. Arsitektur dan tiga jalur

**Tiga jalur kerja**

| Jalur | Isi | Fase | Catatan |
| --- | --- | --- | --- |
| 1. Dev di PC | Semua pengembangan, tes DAVE, tuning, QA | 0 sampai 4, dan 6 | Satu-satunya jalur yang wajib lolos lebih dulu |
| 2. Produksi 24/7 | Server rumah atau VPS Singapura (sekitar $5–6 per bulan) | 7 | Di luar scope awal, tapi desain harus portabel (Docker) |
| 3. Uji deploy gratis | Render free dan/atau GCP e2-micro | 5 | Eksperimen terukur untuk tahu batasnya, bukan produksi |

&#91;ASUMSI A1\] “Jalur 3” berarti Render atau GCP e2-micro seperti di rencana sebelumnya (Jalur 1 = dev di PC, Jalur 2 = server 24/7). Kalau maksudnya lain, ubah tabel ini sebelum Fase 5.

**Alur data (Pipeline A, default AIRI: STT → LLM → TTS)**

```
Discord Voice (UDP, DAVE/E2EE)
        |  Opus per pengguna
        v
  discord-bot (service AIRI: discord.js + @discordjs/voice)
        |  decode -> VAD/endpointing
        v
      STT
        |
        v
  Orchestrator  <-- filter dan rate limit <-- Chat teks / gambar Discord
  (persona + memori + safety + gating)
        |
        v
  LLM (Gemini flash, streaming)
        |
        v
  Sentence chunker -> TTS (streaming)
        |
        v
  resample 24k -> 48k -> encode Opus -> kirim ke voice channel

Opsional (PC saja): AIRI server runtime <-> stage (VRM/Live2D, lip-sync) -> OBS
Lintas bagian: konfigurasi, log dan metrik, DB memori, secret, kill switch
```

**Dua pipeline**

- Pipeline A (default): STT → LLM → TTS. Ini alur bawaan AIRI. Kelebihan: karakter dan suara bisa diatur terpisah, mudah disisipi memori dan filter. Kekurangan: latensi lebih tinggi sehingga perlu dioptimasi (§6).
- Pipeline B (eksperimen, Fase 6): Gemini Live speech-to-speech. Latensinya lebih rendah dan ringan di CPU, tetapi pilihan suara terbatas pada suara bawaan, sesi dibatasi, dan integrasi ke AIRI belum tentu mulus. Jangan dikerjakan sebelum Pipeline A stabil.

**Prinsip desain**

1. Fork dengan patch minimal. Tambahan kita di paket atau folder sendiri; branch main (milik kita) dan upstream (cermin AIRI) dipisah.
2. Semua provider (LLM, STT, TTS) berada di belakang interface kecil dan dipilih lewat konfigurasi.
3. Streaming di semua tahap. Tidak ada tahap yang menunggu tahap sebelumnya selesai total.
4. Setiap tahap punya timeout, retry terbatas, dan fallback (TTS gagal berarti balas teks).
5. Semua yang berasal dari pengguna (suara, chat, gambar, memori) adalah data tidak tepercaya (§10).
6. Stateless sebisa mungkin. State (memori, konfigurasi) di DB atau file yang mudah dipindah. Untuk Jalur 3 jangan simpan state penting di disk lokal.

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
| FR-T4 | Semua balasan memakai allowed\_mentions kosong: tidak boleh memicu @everyone, @here, atau ping role | M |
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
| FR-A2 | Kill switch: /mute atau env BOT\_ENABLED=false menghentikan semua respons | M |
| FR-A3 | Batas anggaran harian (request dan token). Saat tercapai: turun ke balasan teks pendek, lalu berhenti | M |
| FR-A4 | Log penting dikirim ke channel admin lewat webhook | S |

**Visual**

| ID | Persyaratan | P |
| --- | --- | --- |
| FR-X1 | Avatar VRM atau Live2D di AIRI stage (lokal) dengan lip-sync dan ekspresi dari tag emosi, ditampilkan lewat OBS | C |
| FR-X2 | Avatar tampil otomatis di Discord (bot tidak bisa mengirim video) | W |

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

## 6. Backend dan rekayasa latensi

Instrumentasi dulu, optimasi kemudian. Setiap giliran percakapan mencatat penanda waktu:

- t0: ucapan pengguna selesai (menurut VAD)
- t1: transkrip siap
- t2: token LLM pertama
- t3: kalimat pertama siap dikirim ke TTS
- t4: chunk audio TTS pertama
- t5: paket audio pertama terkirim ke Discord

Latensi tahap adalah selisih penanda berurutan; latensi total adalah t5 dikurangi t0. Semuanya dicatat per giliran di log dan dirangkum sebagai histogram per tahap (T1.6).

Teknik yang diterapkan, dari yang paling berpengaruh:

1. Streaming end-to-end. LLM dibaca per token, token dikumpulkan per kalimat, kalimat langsung masuk TTS, audio langsung diputar. Jangan menunggu jawaban penuh. (T3.2)
2. Kalimat pertama pendek. Persona menginstruksikan kalimat pembuka maksimal 8 kata supaya TTS bisa mulai cepat. Jawaban suara default maksimal 2 sampai 3 kalimat kecuali diminta panjang. (T2.3)
3. Endpointing yang disetel. Jeda diam (hangover) dicoba pada 300, 500, dan 700 ms; pilih yang paling jarang memotong ucapan tapi tidak terasa lambat. (T1.4 dan T3.1)
4. Koneksi hangat. HTTP keep-alive atau HTTP/2 ke API Gemini, ditambah panggilan pemanasan kecil saat /join supaya panggilan pertama tidak lambat. (T3.2)
5. Jaga event loop. Resample dan encode Opus lewat binding native; pantau event-loop lag (beri peringatan jika > 50 ms); pindahkan ke worker thread jika perlu. (T3.1)
6. Antrean berbatas dan buang yang basi. Jika audio atau jawaban sudah tidak relevan (pengguna menyela), buang, jangan diputar terlambat. (T1.5)
7. Timeout dan fallback per tahap. Nilai awal: STT 5 dtk, LLM 8 dtk, TTS 5 dtk, satu retry dengan jitter. Jika TTS gagal, balas teks di channel; jika LLM gagal, ucapkan frasa cadangan singkat dari daftar. (T1.7)
8. Cache. Prefix persona yang statis memakai context caching jika tersedia \[VERIFIKASI\]; frasa umum (sapaan, “bentar ya”) di-cache sebagai audio. (T3.2)
9. Wilayah. Atur Region Override voice channel ke Singapore; ukur RTT dari PC dan dari server uji ke endpoint voice Discord dan API Gemini; catat di laporan Jalur 3. (T5.4)
10. Pipeline B. Session resumption dipasang sejak awal karena sesi audio Live dibatasi sekitar 15 menit \[VERIFIKASI\]. (T6.2)

Prinsipnya: perubahan yang tidak menurunkan p50 atau p95 di benchmark (T3.1) tidak dimasukkan hanya karena “seharusnya lebih cepat”.

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

- character.md: identitas, sifat, gaya bicara.
- voice-style.md: aturan teks yang akan diucapkan.
- rules.md: batasan, aturan kejujuran (FR-P5), cara menolak sesuai karakter.
- examples.jsonl: 12 sampai 20 contoh tanya-jawab (few-shot).
- lexicon.json: kamus pelafalan.

Setiap file punya baris versi di kepala, dan versi persona yang aktif dicatat di log tiap giliran.

**Aturan teks untuk diucapkan** (isi voice-style.md):

1. Kalimat pendek dan bahasa lisan. Tanpa markdown, daftar, emoji, atau URL panjang.
2. Angka, singkatan, dan simbol ditulis sebagaimana dibaca.
3. Jawaban suara maksimal 2 sampai 3 kalimat kecuali diminta panjang; kalimat pertama maksimal 8 kata.
4. Variasikan pembuka supaya tidak terdengar berulang.
5. Tag emosi di awal kalimat, misalnya \[happy\] atau \[thinking\]. Tag dibuang sebelum TTS dan dipakai untuk ekspresi avatar.
6. Kalau tidak tahu, bilang tidak tahu. Jangan mengarang.

**Memilih suara** (T3.3 dan T3.4)

1. Kumpulkan 3 sampai 5 kandidat dari suara bawaan Gemini TTS (sekitar 30 pilihan \[VERIFIKASI\]), 1 sampai 2 dari Voice design, dan 1 pembanding dari ElevenLabs kalau kuota gratisnya cukup.
2. Naskah uji standar 10 kalimat: sapaan, ekspresif atau tertawa, bingung, penjelasan panjang, angka dan nama, campuran Inggris, semangat, bisik.
3. Tes buta oleh 5 teman. Skor 1 sampai 5 untuk: natural, enak didengar lama, cocok dengan karakter, kejelasan lafal Indonesia. Tambahkan satu pertanyaan: apakah suaranya melelahkan setelah 5 menit.
4. Pilih juara, simpan ID atau konfigurasinya di config, dan catat hasil tes di docs/decisions/.
5. Template Voice design: kesan umur, warna suara, tempo, aksen, tingkat ekspresi. Contoh pengisian (ganti sesuai karakter): “perempuan muda, hangat dan sedikit serak, tempo sedang, aksen Indonesia santai, ekspresif tapi tidak berlebihan”.
6. Dilarang membuat suara yang meniru orang sungguhan.

**Kualitas audio** (diuji di T3.5)

- Sampel TTS 24 kHz di-resample ke 48 kHz (kualitas resampler diperiksa, tidak ada desis atau aliasing).
- Volume konsisten antarkalimat dan tidak lebih keras dari suara manusia di channel (target awal sekitar -16 LUFS \[ASUMSI\], dikoreksi lewat tes telinga).
- Sambungan antar-chunk tanpa klik atau pop (crossfade 5 sampai 10 ms). Jeda antarkalimat alami, 150 sampai 300 ms. Tidak ada celah kosong lebih dari 400 ms di tengah jawaban (buffer underrun).
- Kamus pelafalan (lexicon.json) menggantikan teks sebelum TTS: nama pengguna, istilah gaming, singkatan.
- STT diuji untuk campuran Indonesia dan Inggris pada 30 ucapan nyata; hasil dihitung manual (TC-03).

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

Rekomendasi awal \[ASUMSI\]: VRM buatan sendiri atau berlisensi jelas. Keputusan final di T6.1. AIRI mendukung keduanya \[VERIFIKASI\].

- Lip-sync dari audio TTS (amplitudo atau viseme). Ekspresi dari tag emosi lewat tabel pemetaan emosi ke ekspresi. Animasi diam: kedip dan napas.
- Tampil lewat OBS Browser Source atau window capture dengan latar transparan. Bot tidak mengirim video, jadi pemilik yang menampilkannya (screen share atau virtual camera).
- Target: mulut bergerak dalam 150 ms setelah audio mulai, ekspresi berganti dalam 300 ms.
- Lisensi: simpan bukti lisensi tiap aset di assets/LICENSES.md. Jangan memakai model karakter berhak cipta (anime, game, film) tanpa izin.

## 9. Tuning dan “melatih” AI

Tidak ada pelatihan bobot model di proyek ini. Yang disetel ada lima tuas: prompt persona, contoh few-shot, memori, parameter generasi (temperature, top\_p, batas token), dan aturan gating. Fine-tuning baru dipertimbangkan setelah Fase 7, hanya jika persona drift tidak bisa diperbaiki lewat prompt dan penyedia mendukungnya \[VERIFIKASI\].

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
- Jangka panjang: fakta diekstrak setelah sesi selesai, bukan tiap giliran. Format: user\_id, fakta, sumber, tanggal, keyakinan. Maksimal 200 fakta per pengguna, yang lama dan jarang dipakai dibuang. Pengguna bisa melihat dan menghapus lewat /memory me dan /forget me.
- Fakta sensitif (kesehatan, alamat, data keuangan, identitas) tidak disimpan.
- Fakta memori disisipkan ke prompt sebagai data berlabel, bukan sebagai instruksi (lihat SEC-5).

**Log untuk perbaikan.** Hanya dengan persetujuan peserta, transkrip dipseudonimkan, disimpan maksimal 7 hari, dan dipakai khusus untuk menambah golden set.

## 10. Keamanan dan privasi

| ID | Kontrol | Diverifikasi di |
| --- | --- | --- |
| SEC-1 | Secret (token Discord, API key) hanya di .env atau secret manager platform. .env masuk .gitignore. Pre-commit hook pemindai secret (mis. gitleaks). Jika bocor: rotasi segera | T4.1 |
| SEC-2 | Token tidak pernah masuk log; log memakai redaksi untuk pola token dan key | T4.1 |
| SEC-3 | Hak minimum. Intents hanya yang perlu (Guilds, GuildVoiceStates, GuildMessages, dan MessageContent yang termasuk privileged, diaktifkan manual di Developer Portal). Permission bot: View Channel, Send Messages, Connect, Speak, Use Application Commands. Bukan Administrator | T0.3 |
| SEC-4 | Allowlist guild dan user id. Bot keluar otomatis dari guild yang tidak dikenal | T2.5 |
| SEC-5 | Prompt injection: teks chat, transkrip suara, teks dalam gambar, dan memori adalah data tidak tepercaya. System prompt dipisah dari data pengguna, data dibungkus delimiter. Bot tidak punya tool berdampak (tanpa eksekusi kode, tanpa akses file atau jaringan lewat LLM). Keluaran disanitasi (tanpa mention, tanpa tautan yang tidak dikenal) | T2.6, TC-13 |
| SEC-6 | Anti-abuse dan biaya: rate limit per pengguna (awal: 6 permintaan per menit), per guild, dan plafon harian. Cooldown. Kill switch | T2.6 |
| SEC-7 | Aktifkan safety settings Gemini. Persona melarang konten dewasa eksplisit, kebencian, dan instruksi berbahaya; penolakan tetap sesuai karakter | T2.3 |
| SEC-8 | Privasi suara: audio mentah tidak disimpan. Transkrip maksimal 7 hari. Log level INFO hanya berisi panjang teks dan id, bukan isi; isi penuh hanya di mode debug lokal | T4.1, TC-15 |
| SEC-9 | Persetujuan: saat join voice, bot mengumumkan di teks bahwa ia mendengar dan mentranskripsi, dan bahwa data diproses oleh Google. Free tier AI Studio memakai konten untuk perbaikan produk \[VERIFIKASI\], jadi jangan dipakai untuk topik sensitif; opsi: pindah ke tier berbayar | T2.5 |
| SEC-10 | Rantai pasok dependensi: lockfile di-commit, pnpm audit di CI, pembaruan otomatis (Dependabot atau Renovate) dengan tinjauan, tinjau paket baru (maintainer, popularitas, repo), pin versi image Docker. Monorepo AIRI besar, jadi hanya instal dan jalankan paket yang dibutuhkan | T4.1 |
| SEC-11 | Container berjalan sebagai non-root, tanpa port terbuka selain health endpoint, filesystem read-only bila memungkinkan | T5.1 |
| SEC-12 | Endpoint HTTP hanya /healthz tanpa data sensitif. Status lengkap lewat /status di Discord, bukan HTTP | T5.2 |
| SEC-13 | Kepatuhan: ikuti Discord Developer Terms dan Policy serta syarat API Google. Tidak meniru suara orang nyata. Bot mengaku AI (FR-P5) | T4.1 |
| SEC-14 | Backup harian DB memori ke lokasi lain (terenkripsi); uji restore minimal sekali | T4.4 |
| SEC-15 | Runbook insiden: kill switch, rotasi secret, tinjau log, pulihkan dari backup | T4.4 |

## 11. QA dan pengujian

**Strategi bertingkat**

- Unit (otomatis, CI): chunker kalimat, rate limiter, gating, pemuat persona, sanitasi mention, pembatas anggaran, parser tag emosi, lexicon.
- Integrasi (otomatis, lokal): pipeline dengan audio fixture WAV dan Discord di-stub; provider di-mock. Ada mode opsional dengan provider sungguhan yang butuh API key.
- E2E manual di Discord sungguhan memakai checklist di bawah.
- Non-fungsional: benchmark latensi, soak test, pemakaian resource, injeksi kegagalan.
- Keamanan: kasus SEC dan golden set adversarial.
- Perseptual: panel dengar (§7).

**Kasus uji**

| ID | Skenario | Lulus jika |
| --- | --- | --- |
| TC-01 | Bot join voice dengan DAVE | Tanpa close code 4017; sesi 10 menit stabil |
| TC-02 | Tangkap audio pengguna | Ucapan 10 detik tersimpan utuh, jelas, tanpa error dekripsi |
| TC-03 | Akurasi STT, 30 ucapan Indonesia dan campuran | Kata benar ≥ 90% (hitung manual) \[ASUMSI\] |
| TC-04 | Jawaban suara | Terdengar jelas, tidak patah, latensi sesuai target fase |
| TC-05 | Barge-in | Bot berhenti ≤ 300 ms, sisa antrean dibuang |
| TC-06 | 3 orang bicara bergantian dan bertumpuk | Tidak crash, tidak menjawab dua kali serentak |
| TC-07 | Mode wake | Tidak menjawab tanpa dipanggil; menjawab saat dipanggil |
| TC-08 | Jaringan putus 20 detik | Bot kembali tanpa restart proses |
| TC-09 | Provider error atau lambat (simulasi 429 dan timeout) | Fallback jalan, tidak hang |
| TC-10 | 20 pesan chat campuran | Hanya yang memenuhi aturan gating yang dijawab |
| TC-11 | 5 gambar dan 1 file > 5 MB | Komentar relevan; file besar ditolak dengan sopan |
| TC-12 | Golden set | ≥ 80% lulus |
| TC-13 | 10 kasus injection | Semua ditangani aman |
| TC-14 | Mention safety | Tidak pernah memicu @everyone, @here, atau role ping |
| TC-15 | /forget me dan audio mentah | Data terhapus; tidak ada audio mentah di disk |
| TC-16 | Kill switch dan anggaran harian | /mute menghentikan semuanya; anggaran habis berarti turun level lalu berhenti |
| TC-17 | Soak 4 jam (Fase 3) dan 24 jam (Fase 4) | Tidak crash; pertumbuhan memori < 10% per jam |
| TC-18 | Proses dimatikan paksa | Pulih ≤ 30 detik, memori tetap utuh |
| TC-19 | Cold start | Siap dalam ≤ 60 detik |
| TC-20 | Jalur 3, percakapan 30 menit | Catat patah-patah, CPU, RAM, restart; tidak ada ambang lulus keras |

**Tingkat keparahan bug.** S1: crash, kebocoran secret, bot mengaku manusia. S2: fitur wajib rusak. S3: degradasi kualitas. S4: kosmetik. Gate fase tidak boleh dilewati jika ada S1 atau S2 yang masih terbuka.

## 12. Observabilitas dan operasi

- Log terstruktur JSON (mis. pino): level, waktu, komponen, turn id, versi persona. Redaksi token dan key.
- Metrik: latensi per tahap (histogram), error per provider, jumlah giliran, token per hari, event-loop lag, RSS dan CPU, jumlah reconnect. Cukup ditulis ke file JSONL plus skrip ringkasan; ditampilkan ringkas di /status.
- Health: GET /healthz mengembalikan 200 jika proses hidup dan gateway Discord siap. Hanya dipakai di Jalur 3.
- Alert ke channel admin lewat webhook: restart setelah crash, reconnect lebih dari 3 kali per jam, error provider lebih dari 20% dalam 5 menit, anggaran harian mencapai 80%.
- Runbook (docs/runbook.md): start dan stop, rotasi token, cek log, kill switch, rollback versi, restore backup.
- Versi memakai semver dan changelog; versi tampil di /status.

## 13. Deployment per jalur

**Jalur 1: PC.** pnpm install, buat .env dari .env.example, jalankan dengan perintah yang tertulis di README AIRI (jangan menebak nama skrip). Docker Compose opsional. Pakai headset supaya bot tidak mendengar suaranya sendiri, dan siapkan akun Discord kedua untuk tes.

**Jalur 3: uji deploy gratis (Fase 5).**

- Render: web service Docker tier gratis. Hanya service bot (dan runtime minimal bila perlu), bukan seluruh monorepo. Health endpoint /healthz. UptimeRobot memanggil endpoint itu secara berkala; syarat dan intervalnya \[VERIFIKASI\]. Memori dan config tidak boleh bergantung pada disk lokal, jadi pakai DB eksternal gratis (mis. Neon, Turso, atau Supabase) \[VERIFIKASI\]. Config lewat environment dashboard.
- Yang dicatat: waktu cold start, RSS, CPU, apakah UDP keluar jalan, jumlah restart, kualitas audio selama 30 menit.
- Kriteria “layak untuk uji harian”: 30 menit tanpa patah-patah, p50 ≤ 3,5 dtk, tidak ada restart. Kalau gagal, dokumentasikan alasannya. Jangan diakali dengan menurunkan kualitas secara diam-diam.
- GCP e2-micro (opsional): region AS (us-west1, us-central1, us-east1). Sebelum apa pun, pasang budget alert sekitar $1 karena IPv4 eksternal ditagih dan egress gratis hanya 1 GB per bulan \[VERIFIKASI\]. Latensi ke Discord region Asia akan terasa; ukur dan catat.

**Jalur 2: produksi 24/7 (Fase 7).** Dua opsi: server rumah (mini PC, laptop lama, atau Raspberry Pi; bot hanya koneksi keluar jadi tidak perlu port forwarding) atau VPS Singapura sekitar $5 sampai 6 per bulan dengan 1 vCPU dan 1 GB RAM. Docker dengan restart policy atau systemd, backup, monitoring dasar. Keputusannya ada di §20.

**Syarat Dockerfile**: multi-stage build, user non-root, base image dengan versi dipatok, hanya paket yang dibutuhkan, healthcheck, .dockerignore yang mengecualikan .env dan data lokal.

**CI (GitHub Actions)**: lint, typecheck, unit test, gitleaks, pnpm audit, build image. Tanpa deploy otomatis ke produksi.

## 14. Roadmap

Estimasi memakai asumsi kerja paruh waktu sekitar 8 sampai 10 jam per minggu \[ASUMSI\]. Angkanya perkiraan, bukan janji. Fase berikutnya baru dimulai setelah gate fase sebelumnya lolos dan dicatat.

| Fase | Nama | Jalur | Estimasi | Gate (harus lolos) |
| --- | --- | --- | --- | --- |
| 0 | Spike dan go/no-go | 1 | 1 minggu | TC-01 dan TC-02 lulus 3 kali berturut-turut; Gemini terbukti jalan untuk LLM, STT, dan TTS; ADR-001 disetujui pemilik |
| 1 | Loop suara MVP | 1 | 2 minggu | Percakapan suara end-to-end 10 menit; mode wake; reconnect; instrumentasi latensi aktif (TC-04, 05, 07, 08, 09) |
| 2 | Teks, gambar, persona, memori, admin | 1 | 2 minggu | FR-T1 sampai T4, P1 sampai P5, A1 sampai A3 terpenuhi (TC-10, 11, 13, 14, 16) |
| 3 | Latensi dan suara | 1 | 2 minggu | p50 ≤ 2,0 dtk dan p95 ≤ 3,5 dtk di PC; suara terpilih skor ≥ 4/5; golden set ≥ 80%; soak 4 jam lulus |
| 4 | Hardening: keamanan, QA, soak | 1 | 1 sampai 2 minggu | Semua TC kecuali TC-20 lulus; tidak ada bug S1 atau S2; soak 24 jam; runbook dan backup teruji |
| 5 | Uji deploy gratis | 3 | 1 minggu | Laporan Jalur 3 (T5.4) selesai dan pemilik memutuskan Jalur 2 |
| 6 | Avatar dan Pipeline B (opsional) | 1 | 2 sampai 3 minggu | FR-X1 berjalan; spike Pipeline B punya angka pembanding |
| 7 | Produksi 24/7 | 2 | 1 minggu | 7 hari berjalan dengan uptime ≥ 99% \[ASUMSI\] dan alert teruji |

Sampai akhir Fase 5, total sekitar 3 bulan paruh waktu.

**Jika Fase 0 berakhir NO-GO** (bot tidak bisa menangkap audio dengan DAVE), jangan memaksa. ADR-001 mencatat opsi: (a) kerangka TypeScript lain seperti discord-voice-ai, setelah dicek status DAVE-nya; (b) rakit tipis discord.js, @discordjs/voice, dan provider Gemini sendiri; (c) menunggu perbaikan upstream sambil membangun modul yang tidak bergantung pada penerimaan audio (teks, memori, persona). Pemilik memilih; roadmap disesuaikan.

## 15. Backlog task (senior ke junior)

Estimasi jam per task untuk junior manusia; AI biasanya lebih cepat tapi tetap butuh review. Kerjakan berurutan. Semua task tunduk pada aturan di §0.

### Fase 0: Spike dan go/no-go

**T0.1 Siapkan lingkungan dan fork AIRI** (3 jam)

- Tujuan: repo kerja milik kita yang bisa build.
- Langkah: (1) fork moeru-ai/airi, privat jika memungkinkan; (2) clone dan tambahkan remote upstream; (3) baca README dan CONTRIBUTING; (4) pasang Node dan pnpm sesuai versi yang diminta repo; (5) pnpm install dan build paket yang diperlukan; (6) buat .env.example; (7) baca file LICENSE dan jawab F10.
- AC: build lokal sukses; remote upstream terpasang; hasil F10 tercatat.
- Bukti: log build dan docs/decisions/F10.md.
- Jangan: menjalankan skrip yang tidak dipahami; menjalankan seluruh monorepo kalau tidak perlu.

**T0.2 Pemetaan repo** (4 jam)

- Tujuan: tahu persis bagian mana yang kita pakai.
- Langkah: temukan service bot Discord; telusuri cara ia masuk voice, menangkap audio, STT, memanggil LLM, TTS, dan memutar suara; cari cara konfigurasi provider; cek apakah ia butuh server runtime atau stage (F3, F4); catat versi discord.js dan @discordjs/voice serta apakah @snazzah/davey ada; tulis docs/ARCHITECTURE-NOTES.md.
- AC: dokumen memuat path file nyata untuk tiap tahap pada alur di §3, daftar “tidak ditemukan” untuk yang belum jelas, dan jawaban F3 serta F4.
- Bukti: ARCHITECTURE-NOTES.md.
- Jangan: mengubah kode di task ini.

**T0.3 Aplikasi dan bot Discord** (2 jam)

- Langkah: buat Application dan Bot di Developer Portal; reset token dan simpan ke .env; aktifkan intents sesuai SEC-3; buat server tes privat dan siapkan akun kedua; undang bot lewat OAuth2 (scope bot dan applications.commands) dengan permission minimum.
- AC: bot online di server tes; token hanya ada di .env; bot tidak punya Administrator.
- Bukti: screenshot bot online dengan token tersembunyi.
- Jangan: menempel token di chat, issue, atau dokumen.

**T0.4 Spike DAVE (go/no-go)** (4 sampai 8 jam)

- Tujuan: membuktikan bot bisa masuk voice dan menangkap suara utuh.
- Langkah: (1) jalankan bot AIRI apa adanya, atau skrip minimal discord.js dan @discordjs/voice jika AIRI belum bisa; (2) masuk ke voice channel tes bersama akun kedua; (3) simpan 10 detik audio satu pengguna sebagai WAV; (4) periksa log untuk close code 4017 atau error dekripsi; (5) ulangi 3 kali, lalu satu sesi 10 menit; (6) catat versi semua paket.
- AC: TC-01 dan TC-02 lulus 3 kali berturut-turut.
- Bukti: file WAV, log, dan docs/decisions/F1-F2.md.
- Jangan: mematikan enkripsi atau memakai trik di luar @discordjs/voice resmi; melanjutkan ke Fase 1 jika gagal. Kalau gagal, berhenti dan lapor.

**T0.5 Spike Gemini** (4 jam)

- Langkah: buat API key di Google AI Studio dan simpan di .env; cek daftar model beserta nama persisnya (F5); dengan skrip kecil uji (a) teks streaming, (b) transkripsi WAV dari T0.4 dalam bahasa Indonesia, (c) TTS satu kalimat Indonesia; ukur latensi 10 kali per panggilan; catat batas kuota dari halaman AI Studio; coba Voice design (F6); catat syarat penggunaan data (F7).
- AC: tabel hasil F5 sampai F7 dengan angka, nama model yang dipakai, dan status (jalan, tidak jalan, tidak tersedia).
- Bukti: docs/decisions/F5-F7.md dan sampel audio TTS.
- Jangan: menulis nama model permanen di kode; mengirim data pribadi teman ke API untuk tes.

**T0.6 ADR-001: keputusan basis** (2 jam)

- Tujuan: putuskan GO atau NO-GO untuk AIRI sebagai basis.
- Langkah: gabungkan hasil T0.1 sampai T0.5; tulis ADR-001 berisi konteks, opsi, keputusan, dan konsekuensi, termasuk opsi fallback di §14.
- AC: ADR ditandatangani pemilik (§20).
- Jangan: memulai Fase 1 tanpa ADR.

### Fase 1: Loop suara MVP

**T1.1 Gemini sebagai provider LLM di bot** (5 jam)

- Langkah: ikuti cara AIRI memilih atau menambah provider (dari T0.2); isi lewat env (LLM\_PROVIDER, LLM\_MODEL, GEMINI\_API\_KEY); pastikan keluarannya streaming; buat interface LlmProvider kecil jika belum ada.
- AC: pesan uji dijawab Gemini lewat bot; nama model hanya berasal dari config.
- Jangan: mengubah provider lain; menulis nama model permanen.

**T1.2 Jalur STT** (5 jam)

- Langkah: pasang STT sesuai hasil T0.5 (mis. pemahaman audio Gemini atau layanan kompatibel Whisper yang sudah tersedia di AIRI). Masukan: audio satu ucapan dari VAD. Keluaran: teks, user id, timestamp. Bahasa Indonesia dan Inggris; timeout 5 detik.
- AC: TC-03 dijalankan dan akurasinya tercatat.
- Jangan: menyimpan audio mentah ke disk kecuali mode debug lokal yang eksplisit (DEBUG\_SAVE\_AUDIO).

**T1.3 Jalur TTS dan pemutaran** (7 jam)

- Langkah: TTS, resample 24 ke 48 kHz, encode Opus, lalu putar di voice. Pakai library native untuk resample dan encode. Satu suara bawaan dulu, dipilih lewat config. Antrean pemutaran satu per satu. Di task ini boleh per jawaban penuh; streaming per kalimat dikerjakan di T3.2.
- AC: bot menjawab ucapan dengan suara tanpa klik atau patah (TC-04 versi dasar).
- Jangan: memutar dua jawaban sekaligus.

**T1.4 VAD, endpointing, dan mode interaksi** (6 jam)

- Langkah: pakai VAD yang sudah ada di AIRI atau tambah VAD ringan; jeda diam (VAD\_HANGOVER\_MS) bisa diatur, default 500 ms; batas ucapan 30 detik; mode wake, ptt, open lewat config. Wake word berbasis teks hasil STT berarti tiap ucapan ditranskripsi, jadi pantau pemakaian kuota.
- AC: TC-07 lulus; dalam 20 uji, ucapan tidak terpotong di tengah kalimat.

**T1.5 Barge-in dan pembuangan antrean** (4 jam)

- Langkah: deteksi suara pengguna saat bot bicara; hentikan pemutaran dalam 300 ms; batalkan permintaan LLM dan TTS yang sedang jalan (AbortController); kosongkan antrean.
- AC: TC-05 lulus; tidak ada audio basi yang diputar setelah disela.
- Jangan: menganggap suara bot sendiri sebagai sela.

**T1.6 Instrumentasi latensi** (3 jam)

- Langkah: pasang penanda t0 sampai t5 (§6) per turn id; tulis ke log JSON; ringkasan p50 dan p95 tampil di /status.
- AC: setiap giliran punya 6 penanda dan ringkasan bisa dihitung dari log.
- Bukti: contoh log 20 giliran.

**T1.7 Timeout, retry, fallback, dan reconnect** (5 jam)

- Langkah: timeout per tahap (§6 butir 7); satu retry dengan jitter; fallback TTS ke teks dan LLM ke frasa cadangan; reconnect voice dengan backoff, termasuk handshake DAVE ulang; batasi percobaan supaya tidak loop tanpa akhir.
- AC: TC-08 dan TC-09 lulus.
- Jangan: menelan error diam-diam. Setiap fallback harus tercatat di log.

### Fase 2: Teks, gambar, persona, memori, admin

**T2.1 Chat teks dan gating** (4 jam)

- Langkah: balas saat di-mention dan di channel khusus (FR-T1); aturan gating (FR-T2) berupa mention, nama bot, pertanyaan langsung, dan cooldown; allowed\_mentions kosong (FR-T4).
- AC: TC-10 dan TC-14 lulus.
- Jangan: memanggil LLM untuk setiap pesan di channel.

**T2.2 Pemahaman gambar** (4 jam)

- Langkah: validasi tipe (png, jpg, webp) dan ukuran maksimal 5 MB; kirim ke model multimodal lewat panggilan biasa, bukan sesi Live; komentar mengikuti persona.
- AC: TC-11 lulus.
- Jangan: mengikuti instruksi yang tertulis di dalam gambar (SEC-5).

**T2.3 Persona dan gaya bicara** (5 jam)

- Langkah: buat folder persona/ dari brief pemilik (§7); pemuat file dan /persona reload; aturan voice-style; aturan keselamatan (SEC-7); versi persona masuk ke log.
- AC: persona dimuat ulang tanpa restart; 10 jawaban uji sesuai gaya dan aturan suara.
- Jangan: mengarang karakter tanpa brief pemilik. Jika brief kosong, berhenti dan tanya.

**T2.4 Memori** (6 jam)

- Langkah: memori jangka pendek dan panjang sesuai §9. Penyimpanan lewat adapter: SQLite untuk Jalur 1, bisa diganti Postgres untuk Jalur 3. Ekstraksi fakta di akhir sesi. Perintah /memory me dan /forget me.
- AC: fakta bisa dilihat dan dihapus; fakta sensitif tidak tersimpan (uji 5 contoh); TC-15 bagian memori.
- Jangan: menyisipkan memori ke prompt sebagai instruksi.

**T2.5 Admin, allowlist, dan pengumuman privasi** (4 jam)

- Langkah: /status, /mute, allowlist guild dan user (SEC-4), pengumuman privasi saat join voice (SEC-9), keluar otomatis dari guild yang tidak dikenal.
- AC: TC-16 bagian kill switch lulus; pengguna di luar allowlist ditolak dengan sopan.

**T2.6 Batas biaya, rate limit, dan anti-injection** (5 jam)

- Langkah: rate limiter (SEC-6); anggaran harian (FR-A3) dengan degradasi bertahap; pembungkus data tidak tepercaya dan sanitasi keluaran (SEC-5).
- AC: TC-16 lulus; separuh kasus adversarial di TC-13 aman.

### Fase 3: Latensi dan suara

**T3.1 Harness benchmark latensi** (6 jam)

- Langkah: skrip yang memutar fixture WAV (10 ucapan: pendek, panjang, campuran Inggris) ke pipeline, 30 putaran, menghasilkan tabel p50 dan p95 per tahap; catat event-loop lag, CPU, RSS. Jalankan sekali sebelum optimasi sebagai baseline.
- AC: docs/perf/baseline.md; hasil bisa diulang (selisih antar-run < 15% \[ASUMSI\]).

**T3.2 Streaming per kalimat dan optimasi** (10 jam)

- Langkah: chunker kalimat, TTS streaming, keep-alive, pemanasan saat /join, cache frasa umum, context caching jika tersedia. Satu optimasi per PR dengan angka sebelum dan sesudah.
- AC: p50 ≤ 2,0 dtk dan p95 ≤ 3,5 dtk di PC; TC-04 lulus. Jika target tidak tercapai, laporkan data, jangan menurunkan target.
- Jangan: menggabungkan banyak optimasi dalam satu PR.

**T3.3 Tes pemilihan suara** (4 jam, plus panel)

- Langkah: siapkan naskah uji dan 3 sampai 5 kandidat (§7); form skor di spreadsheet; 5 panelis; tes buta.
- AC: skor tercatat dan juara terpilih; hasil di docs/decisions/voice.md.

**T3.4 Eksperimen Voice design** (3 jam)

- Langkah: buat 2 suara dari deskripsi, simpan ID permanennya, masukkan ke tes T3.3.
- AC: laporan singkat. Jika fitur tidak tersedia, catat dan lewati.

**T3.5 Kualitas audio dan lexicon** (4 jam)

- Langkah: normalisasi volume, crossfade antar-chunk, jeda antarkalimat, lexicon.json, tes telinga.
- AC: tidak ada klik atau underrun dalam 10 jawaban uji; 20 kata sulit terlafal benar.

**T3.6 Golden set dan harness tuning** (8 jam)

- Langkah: 60 kasus sesuai §9; skrip penilai otomatis dan juri LLM; laporan skor; 2 sampai 3 iterasi persona.
- AC: skor baseline tercatat dan akhirnya ≥ 80% lulus (TC-12).

**T3.7 Soak 4 jam** (2 jam kerja, 4 jam berjalan)

- Langkah: bot di voice dengan ucapan sintetis tiap 2 menit; catat RSS dan CPU tiap menit.
- AC: TC-17 (4 jam) lulus.

**Gate Fase 3**: semua AC Fase 3 lulus dan p50 serta p95 sesuai target. Jika latensi tidak tercapai, jangan lanjut; diskusikan dengan pemilik (opsi: Pipeline B lebih awal).

### Fase 4: Hardening

**T4.1 Audit keamanan** (6 jam)

- Langkah: periksa SEC-1 sampai SEC-15 satu per satu; jalankan gitleaks pada seluruh riwayat git; pnpm audit; uji redaksi log dengan token palsu; pastikan tidak ada audio mentah di disk.
- AC: laporan docs/security-review.md; tiap SEC berstatus dipenuhi, atau ada alasan tertulis dan persetujuan pemilik.
- Jangan: menandai dipenuhi tanpa bukti.

**T4.2 Suite otomatis dan checklist E2E** (8 jam)

- Langkah: unit test sesuai daftar di §11; tes integrasi dengan fixture WAV; checklist E2E untuk TC-01 sampai TC-20; CI sesuai §13.
- AC: CI hijau; checklist terisi dengan tanggal dan hasil.

**T4.3 Soak 24 jam dan injeksi kegagalan** (4 jam kerja)

- Langkah: jalankan TC-08, TC-09, TC-17 (24 jam), TC-18, dan TC-19. Catat grafik RSS dan CPU.
- AC: semuanya lulus; tidak ada bug S1 atau S2 terbuka.

**T4.4 Dokumentasi, runbook, dan backup** (6 jam)

- Langkah: README setup, docs/runbook.md, skrip backup harian dan restore, alert webhook (§12).
- AC: orang lain (atau AI baru dengan konteks kosong) bisa menjalankan bot dari nol hanya dengan README dalam 30 menit; restore backup teruji sekali.

### Fase 5: Uji deploy gratis (Jalur 3)

**T5.1 Docker image** (5 jam)

- Langkah: Dockerfile sesuai §13 dan SEC-11; build dan jalankan lokal di Docker; endpoint /healthz.
- AC: berjalan sebagai non-root; healthcheck hijau; TC-18 dan TC-19 lulus di dalam container.

**T5.2 Uji Render free** (6 jam)

- Langkah: deploy hanya service bot; atur env di dashboard; pakai DB eksternal; pasang pemanggil health berkala; ukur cold start, RSS, CPU, UDP keluar, restart; lakukan percakapan 30 menit (TC-20).
- AC: laporan berisi angka p50 dan p95, daftar patah-patah, jumlah restart.
- Jangan: menaikkan ke tier berbayar tanpa persetujuan pemilik (§20 D9).

**T5.3 Uji GCP e2-micro (opsional)** (5 jam)

- Langkah: pasang budget alert sekitar $1 lebih dulu; deploy; ukur seperti T5.2; hapus VM dan IP setelah selesai.
- AC: laporan; semua resource sudah dihapus dan tagihan terverifikasi $0.

**T5.4 Laporan Jalur 3 dan rekomendasi** (2 jam)

- Langkah: tabel perbandingan PC, Render, dan GCP: latensi p50 dan p95, RAM, CPU, patah-patah, restart, biaya; rekomendasi jalur 2.
- AC: pemilik memutuskan D4 (§20).

### Fase 6: Avatar dan Pipeline B (opsional)

**T6.1 Avatar lokal lewat AIRI stage** (10 jam)

- Langkah: putuskan VRM atau Live2D dengan melihat lisensi aset; pasang stage; lip-sync dari audio TTS; tabel pemetaan emosi ke ekspresi; tampilkan lewat OBS.
- AC: FR-X1 berjalan; mulut bergerak dalam 150 ms dan ekspresi berganti dalam 300 ms; assets/LICENSES.md lengkap.
- Jangan: memakai model karakter berhak cipta tanpa izin.

**T6.2 Spike Pipeline B (Gemini Live)** (10 jam)

- Langkah: prototipe terpisah dari jalur utama; session resumption sejak awal; ukur latensi, kualitas suara, CPU, dan stabilitas sesi; bandingkan dengan Pipeline A pada naskah yang sama.
- AC: laporan perbandingan A dan B beserta rekomendasi: jadikan mode opsional atau tinggalkan.

### Fase 7: Produksi 24/7 (Jalur 2)

**T7.1 Deploy produksi** (8 jam)

- Langkah: siapkan server pilihan D4; Docker dengan restart policy atau systemd; pindahkan secret; migrasi DB; backup harian; alert aktif; uji kill switch dari jarak jauh.
- AC: 7 hari berjalan dengan uptime ≥ 99% \[ASUMSI\]; alert terbukti sampai ke channel admin.

**T7.2 Peninjauan pasca-rilis** (2 jam)

- Langkah: retro singkat, perbarui golden set dari kejadian nyata, tulis backlog berikutnya.
- AC: catatan retro di docs/retro-001.md.

## 16. Konfigurasi

Semua nilai di bawah masuk .env.example (tanpa nilai rahasia). Nama variabel di AIRI asli mungkin berbeda; padankan di T0.2 dan catat pemetaannya, jangan menebak.

| Variabel | Contoh nilai | Keterangan |
| --- | --- | --- |
| DISCORD\_TOKEN | (rahasia) | Token bot |
| OWNER\_USER\_ID | id numerik | Satu-satunya pemilik perintah admin |
| DISCORD\_GUILD\_ALLOWLIST | id1,id2 | Guild yang boleh |
| DISCORD\_USER\_ALLOWLIST | id1,id2 | Pengguna yang boleh memanggil /join |
| ADMIN\_WEBHOOK\_URL | (rahasia) | Alert ke channel admin |
| GEMINI\_API\_KEY | (rahasia) | Dari Google AI Studio |
| LLM\_PROVIDER, LLM\_MODEL | gemini, gemini-3.8-flash \[VERIFIKASI\] | Model teks dan gambar |
| STT\_PROVIDER, STT\_MODEL | sesuai T0.5 | Transkripsi |
| TTS\_PROVIDER, TTS\_MODEL, TTS\_VOICE\_ID | sesuai T3.3 | Suara karakter |
| LIVE\_MODEL | gemini-3.8-live \[VERIFIKASI\] | Hanya untuk Pipeline B |
| INTERACTION\_MODE, WAKE\_WORDS | wake, nama bot | Mode dan kata panggil |
| VAD\_HANGOVER\_MS | 500 | Jeda diam penanda ucapan selesai |
| MAX\_UTTERANCE\_SEC, MAX\_REPLY\_SEC | 30, 20 | Batas durasi |
| RATE\_LIMIT\_PER\_MIN | 6 | Per pengguna |
| DAILY\_REQUEST\_BUDGET, DAILY\_TOKEN\_BUDGET | sesuai kuota | Batas harian |
| TIMEOUT\_STT\_MS, TIMEOUT\_LLM\_MS, TIMEOUT\_TTS\_MS | 5000, 8000, 5000 | Timeout per tahap |
| MEMORY\_DB\_URL | file SQLite atau URL Postgres | Penyimpanan memori |
| TRANSCRIPT\_RETENTION\_DAYS | 7 | Retensi transkrip |
| PERSONA\_DIR | persona/ | Lokasi file persona |
| BOT\_ENABLED | true | Kill switch |
| LOG\_LEVEL, DEBUG\_SAVE\_AUDIO, HEALTH\_PORT | info, false, 8080 | Operasional; DEBUG\_SAVE\_AUDIO hanya lokal |

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
| R10 | Scope creep (avatar, Live, fitur tambahan) | Tinggi, sedang | Gate fase dan daftar W di §4 |
| R11 | Junior atau AI menebak API sehingga kode salah | Tinggi, sedang | Aturan §0, bukti wajib, review senior tiap PR |
| R12 | Discord mengubah aturan atau API penerimaan audio | Rendah, tinggi | Pantau changelog, siap fallback ke mode teks |
| R13 | Token atau API key bocor | Rendah, tinggi | SEC-1 dan SEC-2, rotasi segera |
| R14 | Lisensi aset avatar bermasalah | Sedang, sedang | assets/LICENSES.md, hanya aset berlisensi jelas |
| R15 | Proyek mandek karena terlalu besar | Sedang, sedang | Fase kecil dengan demo di tiap gate; suara MVP lebih dulu |

## 18. Definition of Done dan checklist PR

Sebuah task selesai jika semua poin ini terpenuhi:

1. Semua kriteria selesai (AC) pada task lolos.
2. Tes yang relevan hijau; lint dan typecheck bersih.
3. Tidak ada secret di diff maupun riwayat commit.
4. Bukti terlampir (log, angka, rekaman, screenshot).
5. Dokumentasi dan catatan keputusan diperbarui jika ada yang berubah.
6. Perubahan pada kode upstream AIRI dicatat di docs/upstream-patches.md beserta alasannya.
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

## 19. Template prompt untuk AI murah

Untuk AI seperti Gemini Flash: satu task per percakapan. Konteks dibatasi pada §0, §3, §5, entri task yang bersangkutan, dan file kode yang relevan. Jangan menempel seluruh dokumen.

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

## 20. Keputusan terbuka dan persetujuan

| ID | Keputusan | Dibutuhkan sebelum | Rekomendasi awal |
| --- | --- | --- | --- |
| D1 | Nama bot, wake word, dan brief karakter (§7) | T2.3 | Diisi pemilik; tanpa ini T2.3 berhenti |
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

## 21. Glosarium singkat

- DAVE: protokol enkripsi end-to-end untuk voice dan video Discord.
- VAD: voice activity detection, pendeteksi ada atau tidaknya suara bicara.
- Endpointing: keputusan bahwa pengguna sudah selesai bicara.
- STT dan TTS: speech-to-text dan text-to-speech.
- Barge-in: pengguna menyela saat bot sedang bicara.
- Gating: aturan yang menentukan kapan bot menjawab.
- Golden set: kumpulan kasus uji tetap untuk menilai kualitas jawaban.
- ADR: architecture decision record, catatan keputusan teknis.
- p50 dan p95: nilai tengah dan nilai yang tidak dilampaui 95% pengukuran.
