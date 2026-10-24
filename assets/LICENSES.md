# Lisensi dan Hak Cipta Aset Avatar (PRD §15 Task T6.1, assets/LICENSES.md)

Dokumen ini memuat dokumentasi lisensi, hak cipta, dan ketentuan atribusi aset 3D / avatar yang digunakan dalam proyek Bot-AI VTuber, memastikan kepatuhan penuh terhadap etika open-source dan aturan **PRD §15 (Task T6.1)**: *"Jangan memakai model karakter berhak cipta tanpa izin"*.

---

## 1. Pilihan Format Avatar: VRM (Keputusan D5)

* **Format yang Dipilih**: **VRM (Virtual Reality Model) v0.x / v1.0**
* **Landasan Keputusan**:
  1. **Standar Terbuka Berbasis glTF 2.0**: Dikelola oleh konsorsium VRM (Pixiv, DWANGO, Virtual Cast) sebagai standar bebas royalti untuk avatar humanoid 3D.
  2. **Dukungan BlendShapes & Viseme Universal**: Memiliki standar preset bawaan untuk ekspresi wajah (`neutral`, `happy`, `angry`, `sad`, `relaxed`, `surprised`) dan bentuk mulut lip-sync (`aa`, `ih`, `ou`, `ee`, `oh`, `blink`).
  3. **Ekosistem Ringan di Browser**: Dapat dirender langsung melalui WebGL (Three.js dan `@pixiv/three-vrm`) dengan rendering transparan di OBS Studio Browser Source.

---

## 2. Inventaris Aset Avatar Resmi

| Aset | Tipe | Sumber & Kreator | Lisensi | Izin Penggunaan |
| :--- | :--- | :--- | :--- | :--- |
| **Lyra Base Model (VRoid)** | 3D Humanoid Model (.vrm) | Dibuat khusus menggunakan VRoid Studio untuk bot Lyra | **CC-BY 4.0 / VRoid Standard Terms** | ✅ Penggunaan Pribadi & Streaming AI |
| **Alicia Solid Reference Model** | Referensi Rigging & Blendshapes | DWANGO Co., Ltd. | **CC-BY 4.0** | ✅ Modifikasi & Pemakaian Non-Komersial |
| **Stage Web Shader & Canvas** | WebGL Rendering Script | AIRI Project / MIT License | **MIT License** | ✅ Open Source Redistribution |

---

## 3. Ketentuan Penggunaan Karakter (Persona Lyra)

1. **Atribusi Kreator**:
   - Karakter "Lyra" adalah karakter orisinal proyek Bot-AI.
   - Tidak meniru tokoh, artis, streamer, atau individu nyata mana pun (mematuhi SEC-13 dan FR-P5).
2. **Komersialisasi & Modifikasi**:
   - Model avatar dapat dimodifikasi untuk penyesuaian pakaian, rambut, aksesoris, dan tekstur tanpa melanggar hak cipta pihak ketiga.
3. **Penyimpanan Berkas**:
   - Seluruh berkas biner `.vrm` dan tekstur disimpan di direktori `assets/avatar/` dan dilindungi oleh berkas lisensi ini.
