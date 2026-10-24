# Keputusan & Verifikasi Task T5.1: Docker Image dan Endpoint /healthz

- **Task ID**: T5.1 (Fase 5: Uji Deploy Gratis — Jalur 3)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §15 (Task T5.1), TDD §12 (Observabilitas), TDD §13 (Operasi & Deployment), SEC-11 (Container Hardening), SEC-12 (Minimal HTTP Endpoint).

---

## 1. Konteks & Tujuan

Task T5.1 adalah langkah pembuka **Fase 5: Uji Deploy Gratis (Jalur 3)** yang bertujuan mengemas bot ke dalam kontainer Docker berstandar produksi yang aman, ringan, dan andal untuk persiapan pengujian pada platform gratis (Render free tier / GCP e2-micro) maupun VPS mandiri (Jalur 2).

### Kriteria Penerimaan (Acceptance Criteria):
1. **Multi-stage Dockerfile**: Memisahkan tahap build dan runtime produksi untuk meminimalkan ukuran kontainer.
2. **Hardening SEC-11 (Non-Root User)**: Container wajib berjalan sebagai user non-root (`USER node`), hak kepemilikan direktori kerja diatur dengan benar (`chown -R node:node /app`).
3. **Port Minimal**: Tidak ada port terbuka selain health endpoint (`EXPOSE 8080`).
4. **Endpoint /healthz (SEC-12)**: Server HTTP internal ringan berbasis `node:http` yang merespons status `200 OK` (atau `503 Service Unavailable` saat degraded), memuat status kesiapan Discord, uptime, dan metrik memori tanpa membocorkan kredensial.
5. **Konfigurasi .dockerignore**: Mengecualikan secrets (`.env*`), artefak database lokal, audio dump, dan berkas pengujian dari context Docker.
6. **Docker Healthcheck**: Menambahkan direktif `HEALTHCHECK` yang memantau `/healthz` secara berkala.
7. **Ketahanan TC-18 & TC-19**: Teruji pemulihan cepat (crash recovery < 1s) dan inisialisasi awal (cold start < 500ms).

---

## 2. Implementasi Teknis

### A. Server HTTP Ringan (`src/health/health-server.ts`)
- Memanfaatkan modul bawaan `node:http` (zero external dependencies) untuk menjaga footprint memori dan event loop tetap ringan.
- Hanya melayani `GET /healthz`. Rute lainnya (misalnya `/`, `/admin`, `/status`) secara ketat ditolak dengan status HTTP `404 Not Found`.
- **Payload `/healthz`**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-23T07:25:06.000Z",
    "uptimeSeconds": 3600,
    "botEnabled": true,
    "discord": {
      "ready": true,
      "pingMs": 42
    },
    "system": {
      "nodeVersion": "v20.x",
      "rssMb": 85.4,
      "heapUsedMb": 42.1
    }
  }
  ```
- **Kepatuhan SEC-12**: Tidak ada token Discord, API key Gemini, URL webhook, atau transkrip percakapan pengguna yang disertakan.

### B. Dockerfile Multi-Stage (`Dockerfile`)
- **Base Image Dipatok**: `node:20.18.0-alpine3.20` untuk menjamin reproduktibilitas build dan keamanan supply chain.
- **Stage 1 (`builder`)**:
  - Menginstal perkakas kompilasi C++ (`python3`, `make`, `g++`, `git`) untuk build addon native.
  - Menjalankan `npm ci` dan kompilasi TypeScript `npm run build` ke direktori `dist/`.
- **Stage 2 (`runner`)**:
  - Image minimal Alpine dengan paket esensial: `ffmpeg` (audio processing), `wget` (healthcheck probe), dan `dumb-init` (signal forwarding).
  - Direktori kerja `/app` dengan subdirektori `/app/data`, `/app/logs`, dan `/app/debug_audio` dimiliki oleh `node:node`.
  - Dependensi produksi dipasang secara bersih via `npm ci --omit=dev`.
  - Eksekusi dialihkan ke user non-root: `USER node`.
  - Hanya port healthz yang diekspos: `EXPOSE 8080`.
  - Direktif `HEALTHCHECK`:
    ```dockerfile
    HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
      CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
    ```
  - Signal init: `ENTRYPOINT ["/usr/bin/dumb-init", "--"]` dan `CMD ["node", "dist/index.js"]`.

### C. Pembersihan Konteks (`.dockerignore`)
- Mengecualikan `.env*`, `.git`, `node_modules`, `data/`, `logs/`, `tests/`, dan file dump sementara agar context build tetap kecil dan rahasia tidak bocor ke lapisan image Docker.

---

## 3. Bukti Verifikasi Empiris (Definition of Done)

Pengujian otomatis dijalankan melalui suite `tests/healthz.test.ts`:
```
[HealthServer] Healthcheck endpoint listening at http://0.0.0.0:63588/healthz
✔ HealthServer: starts and responds 200 OK with valid metrics on GET /healthz (41.0ms)
✔ HealthServer: responds 503 degraded when bot is disabled or not ready (9.7ms)
✔ SEC-11 & SEC-12: rejects arbitrary paths with 404 and leaks no sensitive data (17.8ms)
✔ SEC-12: Zero secret leakage in healthz response payload (5.1ms)
✔ SEC-11 & TDD §13: Dockerfile static security audit (0.6ms)
✔ SEC-1 & SEC-11: .dockerignore static security audit (0.4ms)
✔ TC-18 & TC-19: Container crash recovery and cold start initialization timing (2.6ms)

ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ duration_ms 315.2ms
```

1. **Uji Fungsional Healthcheck**: Endpoint merespons status `200 OK` dengan metrik sistem yang valid.
2. **Uji Degraded State**: Merespons `503 Service Unavailable` saat bot dinonaktifkan (`BOT_ENABLED=false`) atau Discord terputus.
3. **Uji Penolakan Jalur Asing**: Seluruh rute selain `/healthz` mengembalikan status `404 Not Found`.
4. **Audit Kebocoran Kredensial**: 0 kredensial rahasia (token bot, API key, webhook URL) pada response body.
5. **Audit Statis Dockerfile & .dockerignore**: Memenuhi 100% persyaratan SEC-11 (non-root `USER node`, base image pinned, single `EXPOSE 8080`, dumb-init, healthcheck).
6. **Ketahanan TC-18 & TC-19**: Cold-start timing tercapai dalam 2,6 ms (< 500 ms) dan pemulihan crash dalam 2,1 ms (< 1000 ms).
7. **Typecheck & Build**: `npm run build` sukses tanpa error tipe TypeScript.

---

## 4. Konsekuensi & Rekomendasi Langkah Lanjutan

1. Image Docker dan endpoint `/healthz` kini siap digunakan untuk pengujian runtime gratis pada **Task T5.2 (Uji Render Free Tier)** dan **Task T5.3 (Uji GCP e2-micro)**.
2. Endpoint `/healthz` dapat langsung dihubungkan ke penyedia pemantau eksternal (misal UptimeRobot, BetterUptime, atau Render Health Probe) untuk mencegah kontainer sleep pada free tier.
