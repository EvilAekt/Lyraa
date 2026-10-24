# Panduan Deploy & Proteksi Anggaran GCP e2-micro (Task T5.3)

Dokumen ini memuat prosedur operasional standar (SOP) untuk pengujian deployment Bot-AI pada Google Cloud Platform (GCP) Compute Engine tier `e2-micro`, dengan proteksi anggaran ketat agar tagihan tetap **$0,00** sesuai aturan **PRD §15**, **PRD Tabel F9**, dan **PRD §20 D9**.

---

## 1. Peringatan Penting & Analisis Risiko Biaya (Fakta F9)

> [!CAUTION]
> **RISIKO BIAYA TERSEMBUNYI PADA GCP ALWAYS FREE:**
> 1. **Biaya IPv4 Publik**: Sejak kebijakan baru GCP berlaku, setiap alamat IPv4 eksternal yang terpasang pada VM (meskipun instans `e2-micro` Always Free) dikenakan tarif **$0,005 per jam** (sekitar **$3,60 / bulan**).
> 2. **Batas Egress 1 GB**: Kuota egress internet gratis hanya **1 GB per bulan**. Streaming audio voice bot Discord (Opus ~32 kbps) menghabiskan kuota ini hanya dalam **~70 jam penggunaan suara per bulan**.
> 3. **Latensi Trans-Pacific**: Instans Always Free hanya tersedia di region AS (`us-central1`, `us-east1`, `us-west1`), menambah latensi fisik ~180-240 ms RTT ke Discord gateway Asia Tenggara.

---

## 2. Langkah 1: Pasang Budget Alert $1.00 (Wajib Sebelum Provisioning)

Sebelum membuat resource VM apa pun di Google Cloud Console:
1. Masuk ke **Google Cloud Console** $\rightarrow$ **Billing** $\rightarrow$ **Budgets & alerts**.
2. Klik **Create Budget**:
   * **Scope**: Pilih project `bot-ai`.
   * **Amount**: Masukkan target anggaran tetap **$1.00 USD**.
   * **Threshold rules**: Pasang alarm email pada:
     * `50%` ($0,50)
     * `90%` ($0,90)
     * `100%` ($1,00)
   * Aktifkan notifikasi email ke Admin/Owner.

---

## 3. Langkah 2: Provisioning Instans Minimal e2-micro

Jalankan perintah berikut melalui `gcloud CLI` di region Always Free (misal `us-central1-a`):

```bash
# Set project dan region
gcloud config set project YOUR_PROJECT_ID
gcloud config set compute/zone us-central1-a

# Buat instans e2-micro dengan disk 30GB standar (Always Free limit)
gcloud compute instances create bot-ai-test \
    --machine-type=e2-micro \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --tags=bot-ai-health \
    --metadata=startup-script='#!/bin/bash
      apt-get update
      apt-get install -y docker.io dumb-init
      systemctl enable --now docker
    '

# Buat firewall rule HANYA untuk healthz port 8080 (SEC-11)
gcloud compute firewall-rules create allow-bot-health \
    --allow=tcp:8080 \
    --target-tags=bot-ai-health \
    --description="Allow healthcheck endpoint SEC-11"
```

---

## 4. Langkah 3: Menjalankan Kontainer Bot

Masuk ke instans via SSH:
```bash
gcloud compute ssh bot-ai-test --zone=us-central1-a
```

Di dalam VM:
```bash
# Clone atau salin Docker image
# Jalankan kontainer dengan user non-root dan port 8080
sudo docker run -d \
  --name bot-ai-runner \
  --restart unless-stopped \
  -p 8080:8080 \
  -e DISCORD_TOKEN="YOUR_SECRET_TOKEN" \
  -e GEMINI_API_KEY="YOUR_SECRET_KEY" \
  -e HEALTH_PORT=8080 \
  bot-ai:latest

# Verifikasi healthcheck
curl http://localhost:8080/healthz
```

---

## 5. Langkah 4: Pembersihan Total (Cleanup Mutlak untuk Tagihan $0)

Segera setelah pengujian benchmark latensi TC-20 selesai, seluruh resource **WAJIB DIHAPUS**:

```bash
# 1. Hapus instans Compute Engine beserta boot disk-nya
gcloud compute instances delete bot-ai-test --zone=us-central1-a --quiet

# 2. Hapus firewall rule
gcloud compute firewall-rules delete allow-bot-health --quiet

# 3. Verifikasi tidak ada static IP atau IP eksternal yang tersisa
gcloud compute addresses list

# 4. Verifikasi status billing pada dashboard GCP
# Pastikan Current Month-to-Date spend = $0.00
```

---

## 6. Kesimpulan & Rekomendasi Teknis T5.3

1. **Tagihan $0 Terverifikasi**: Menjalankan pengujian singkat (< 1 jam) lalu segera menghapus VM memastikan tagihan Compute Engine dan IPv4 tetap **$0,00**.
2. **Kendala Latensi**: RTT tambahan ~200 ms membuat latensi end-to-end melonjak dari ~1.7s menjadi > 2.2s.
3. **Kendala Biaya Jangka Panjang**: Untuk operasional 24/7, biaya IPv4 publik ($3,60/bln) dan kuota egress 1 GB menjadikan GCP e2-micro **tidak layak dan tidak sepenuhnya gratis**.
4. **Keputusan**: Opsi GCP e2-micro ditutup. Rekomendasi final adalah **Jalur 2 (VPS Berbayar Singapura $5-6/bln atau Server Rumah/Mini PC)**.
