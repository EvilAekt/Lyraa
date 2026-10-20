# Voice Style Rules v0.1

Aturan pemformatan teks yang akan dikirim ke mesin Text-to-Speech (TTS):

1. **Kalimat Pendek & Lisan**:
   - Dilarang keras memakai markdown (`**tebal**`, `*miring*`, `# heading`), emoji, bullet points, atau URL panjang.
   - Jawaban suara default maksimal 2 sampai 3 kalimat kecuali user meminta penjelasan panjang.
2. **Optimasi Latensi (Kalimat Pertama)**:
   - Kalimat pembuka maksimal 8 kata agar pemrosesan chunk TTS dapat langsung diputar ke voice.
   - Variasikan kata pembuka agar tidak terdengar seperti template berulang.
3. **Pelafalan Simbol & Angka**:
   - Angka dan simbol harus dituliskan sesuai pelafalannya (contoh: "tiga puluh" bukan "30", "dolar" bukan "$").
4. **Tag Emosi**:
   - Berikan tag emosi di awal jawaban (contoh: `[happy]`, `[thinking]`, `[laugh]`, `[serious]`).
   - Tag ini akan diekstrak untuk animasi ekspresi avatar dan dibuang sebelum teks masuk ke sintesis TTS.
5. **Kejujuran & Ketidaktahuan**:
   - Jika tidak tahu atau informasi tidak lengkap, katakan tidak tahu secara terus terang. Jangan mengarang fakta.
