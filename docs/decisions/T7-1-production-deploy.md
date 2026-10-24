# ADR: Task T7.1 Deploy Produksi (Jalur 2: VPS Mandiri Singapura)

- **Tanggal**: 23 Oktober 2026
- **Status**: `[TERVERIFIKASI]` — **SELESAI (GO TO PRODUCTION)**
- **Referensi Terkait**: PRD §15 Task T7.1, PRD §20 Keputusan D4, TDD §13, [docs/decisions/T5-4-jalur-3-recommendation.md](file:///g:/bot-ai/docs/decisions/T5-4-jalur-3-recommendation.md), [docker-compose.prod.yml](file:///g:/bot-ai/docker-compose.prod.yml).

---

## 1. Konteks & Latar Belakang

Berdasarkan evaluasi komparatif mendalam pada Task T5.4, proyek secara resmi memilih **Jalur 2 (VPS Mandiri Singapura $4 - $5,50/bln)** sebagai server target produksi 24/7 untuk Bot Lyra. Jalur 3 (Hosting Gratis) dinyatakan tidak layak karena kendala fatal *cold start spindown* 15 menit pada Render, biaya tersembunyi IPv4 pada GCP, dan batas kuota ketat.

Kriteria Penerimaan (AC) Task T7.1:
1. Mempersiapkan konfigurasi server produksi Jalur 2.
2. Docker dengan restart policy (`restart: unless-stopped`) dan *grace period* shutdown 15 detik.
3. Isolasi penyimpanan persisten untuk database SQLite (`/app/data`) dan log audit (`/app/logs`).
4. Skrip pencadangan harian otomatis terenkripsi AES-256-GCM ([scripts/backup-db.ts](file:///g:/bot-ai/scripts/backup-db.ts)) dengan kebijakan retensi 30 hari.
5. Pemantauan kesehatan berkala via `/healthz` terikat lokal (SEC-11).
6. Pengujian kendali jarak jauh *kill switch* (status 503 degraded saat bot dinonaktifkan).

---

## 2. Arsitektur Deployment Produksi

```
========================================================================================
ARSITEKTUR DEPLOYMENT PRODUKSI JALUR 2 (VPS SINGAPURA)
========================================================================================
Internet / Discord Voice UDP (DAVE E2EE)
        │
        ▼
   [VPS Host (Singapura - RTT 5-15ms)]
        │
        ├── Docker Container: bot-ai-production (non-root user: node)
        │     ├── Application: Node.js 20 LTS + TypeScript dist/
        │     ├── Voice Pipeline: DAVE E2EE + Gemini Streaming + Edge TTS
        │     ├── Restart Policy: unless-stopped
        │     ├── Resource Limits: 1.5 CPU, 1024 MB RAM
        │     └── Healthcheck: http://127.0.0.1:8080/healthz (interval 30s)
        │
        ├── Persistent Storage Volume (Host Bind Mount):
        │     ├── ./data/memory.sqlite   <-- SQLite Long-term & Short-term Memory (WAL mode)
        │     ├── ./logs/                <-- Redacted Operational Logs (Max 20MB x 5)
        │     └── ./backups/             <-- Daily AES-256-GCM Encrypted Snapshots
        │
        └── Cron Automation / Service:
              └── scripts/backup-db.ts   <-- Daily backup + 30-day auto-prune retention
```

---

## 3. Verifikasi & Bukti Empiris

1. **Hardening Docker Compose**:
   - Didefinisikan di [`docker-compose.prod.yml`](file:///g:/bot-ai/docker-compose.prod.yml).
   - Port 8080 hanya di-bind ke loopback `127.0.0.1` (SEC-11) sehingga tidak terpapar ke internet publik.
   - Resource limits dikunci pada 1,5 CPU dan 1024 MB RAM, mencegah kebocoran memori melumpuhkan VPS host.

2. **Pencadangan Harian Terenkripsi (SEC-14)**:
   - Teruji di [`tests/production-deploy.test.ts`](file:///g:/bot-ai/tests/production-deploy.test.ts).
   - Snapshot SQLite dibuat secara konsisten dan dienkripsi dengan header `AENC` menggunakan cipher AES-256-GCM.
   - Integritas data terbukti 100% saat didekripsi dan dipulihkan kembali ke basis data target.

3. **Remote Kill Switch**:
   - Perubahan status `BOT_ENABLED=false` atau perintah `/mute` terbukti langsung menurunkan kode status HTTP `/healthz` dari `200 OK` menjadi `503 Service Unavailable (degraded)`.

4. **Skrip Deployment**:
   - Skrip otomasi siap pakai [`scripts/deploy-prod.sh`](file:///g:/bot-ai/scripts/deploy-prod.sh) memverifikasi kredensial `.env`, membuat snapshot pre-deploy, dan memvalidasi transisi container menjadi `healthy`.

---

## 4. Keputusan & Status

- **Status**: `[TERVERIFIKASI]` — **SELESAI (LULUS PENUH)**.
- Seluruh spesifikasi deployment produksi Jalur 2 telah terpasang, teruji otomatis, dan terdokumentasi lengkap.
- Siap melanjutkan ke **Task T7.2: Peninjauan Pasca-Rilis & Penutupan Roadmap**.
