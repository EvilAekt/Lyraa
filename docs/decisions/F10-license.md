# Hasil Verifikasi Klaim F10: Lisensi AIRI dan Aset

- **ID Klaim**: `F10`
- **Status**: `[TERVERIFIKASI]`
- **Tanggal**: 21 Oktober 2026
- **Task Terkait**: `T0.1`

---

## 1. Temuan Lisensi Repositori (AIRI Core)

File `airi/LICENSE`:
- **Jenis Lisensi**: **MIT License**
- **Pemegang Hak Cipta**: Copyright (c) 2024-PRESENT Neko Ayaka
- **Hak untuk Pemakaian / Fork Pribadi**: Diizinkan penuh tanpa pembatasan. Pengguna bebas menyalin, memodifikasi, menggabungkan, mempublikasikan, mendistribusikan, mensublisensikan, atau membuat turunan (fork) untuk pemakaian pribadi maupun produksi, dengan syarat menyertakan pemberitahuan hak cipta asli.

---

## 2. Temuan Lisensi Pihak Ketiga & Aset Avatar

Beberapa komponen dan paket dalam monorepo AIRI membawa lisensi terpisah:
- **Font & Tipografi**:
  - `packages/font-departure-mono`: SIL Open Font License (OFL)
  - `packages/font-cjkfonts-allseto`: SIL Open Font License (OFL)
  - `packages/font-chillroundm`: SIL Open Font License (OFL)
- **Shader & VRM**:
  - `engines/stage-tamagotchi-godot/addons/vrm`: MIT License
  - `engines/stage-tamagotchi-godot/addons/Godot-MToon-Shader`: MIT License
- **Spine Runtime**:
  - `packages/stage-ui-spine`: Spine Runtimes Software License (berlaku ketentuan Esoteric Software).
- **Model Avatar VRM / Live2D**:
  - Aset model karakter yang disediakan pihak ketiga tunduk pada ketentuan pembuat model aslinya. Untuk bot pribadi kita, wajib menggunakan model berlisensi terbuka atau model buatan sendiri (VRoid Studio) sesuai arahan PRD §8 dan task T6.1.

---

## 3. Kesimpulan

Klaim `F10` **TERVERIFIKASI**. Fork AIRI legal dan aman untuk proyek pribadi.
