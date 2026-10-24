# Architectural Decision Records (ADR) & Spike Verification

Dokumen keputusan arsitektur dan hasil verifikasi klaim PRD (`F1` s/d `F10`) dicatat di folder ini.

## Standar Format
Setiap berkas ADR atau verifikasi harus memuat:
1. **Status**: `[TERVERIFIKASI]`, `[VERIFIKASI]`, atau `[ASUMSI]`.
2. **Konteks & Bukti**: Perintah eksekusi, log nyata, atau tautan dokumentasi resmi.
3. **Keputusan**: Apa yang diputuskan (GO/NO-GO).
4. **Konsekuensi**: Dampak terhadap roadmap atau dependensi.

---

## Daftar Rekaman Keputusan & Verifikasi

| Dokumen | Topik / Cakupan | Status |
|---|---|---|
| [ADR-001-basis-architecture.md](file:///g:/bot-ai/docs/decisions/ADR-001-basis-architecture.md) | Phase Gate 0: Go/No-Go Arsitektur Lyra & AIRI Fork | `[TERVERIFIKASI]` — **GO** |
| [F1-F2.md](file:///g:/bot-ai/docs/decisions/F1-F2.md) | DAVE E2EE Handshake & Audio Receiver | `[TERVERIFIKASI]` — **GO** |
| [F5-F7.md](file:///g:/bot-ai/docs/decisions/F5-F7.md) | Gemini API (LLM Streaming, STT Multimodal) | `[TERVERIFIKASI]` — **GO** |
| [F10-license.md](file:///g:/bot-ai/docs/decisions/F10-license.md) | Analisis Lisensi AIRI (MIT) | `[TERVERIFIKASI]` — **GO** |
| [T1-3-tts-playback.md](file:///g:/bot-ai/docs/decisions/T1-3-tts-playback.md) | Task T1.3: Jalur TTS & Pemutaran Suara Native WebM Opus | `[TERVERIFIKASI]` — **SELESAI** |
| [D3-interaction-vad.md](file:///g:/bot-ai/docs/decisions/D3-interaction-vad.md) | Keputusan D3 & Task T1.4: VAD, Endpointing & Mode Interaksi | `[TERVERIFIKASI]` — **SELESAI** |
| [T1-5-barge-in.md](file:///g:/bot-ai/docs/decisions/T1-5-barge-in.md) | Task T1.5: Barge-in dan Pembuangan Antrean (TC-05) | `[TERVERIFIKASI]` — **SELESAI** |
| [T1-6-latency-instrumentation.md](file:///g:/bot-ai/docs/decisions/T1-6-latency-instrumentation.md) | Task T1.6: Instrumentasi Latensi (p50/p95, t0..t5 logging) | `[TERVERIFIKASI]` — **SELESAI** |
| [T1-7-timeout-retry-fallback-reconnect.md](file:///g:/bot-ai/docs/decisions/T1-7-timeout-retry-fallback-reconnect.md) | Task T1.7: Timeout, Retry, Fallback, dan Reconnect (TC-08, TC-09) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-1-text-chat-gating.md](file:///g:/bot-ai/docs/decisions/T2-1-text-chat-gating.md) | Task T2.1: Chat Teks dan Gating (FR-T1, FR-T2, FR-T4, TC-10, TC-14) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-2-image-understanding.md](file:///g:/bot-ai/docs/decisions/T2-2-image-understanding.md) | Task T2.2: Pemahaman Gambar (FR-T3, TC-11, SEC-5) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-3-persona-style.md](file:///g:/bot-ai/docs/decisions/T2-3-persona-style.md) | Task T2.3: Persona dan Gaya Bicara (PRD §7, FR-P1, FR-P5, SEC-7, TC-12) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-4-memory.md](file:///g:/bot-ai/docs/decisions/T2-4-memory.md) | Task T2.4: Memori Jangka Pendek & Panjang (PRD §9, FR-P2..P4, TC-15) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-5-admin-allowlist-privacy.md](file:///g:/bot-ai/docs/decisions/T2-5-admin-allowlist-privacy.md) | Task T2.5: Admin, Allowlist, dan Pengumuman Privasi (SEC-4, SEC-9, TC-16) | `[TERVERIFIKASI]` — **SELESAI** |
| [T2-6-budget-limits-anti-injection.md](file:///g:/bot-ai/docs/decisions/T2-6-budget-limits-anti-injection.md) | Task T2.6: Batas Biaya, Rate Limit, dan Anti-Injection (FR-A3, SEC-5, SEC-6, TC-13, TC-16) | `[TERVERIFIKASI]` — **SELESAI** |
| [T3-1-latency-harness.md](file:///g:/bot-ai/docs/decisions/T3-1-latency-harness.md) | Task T3.1: Harness Benchmark Latensi (PRD §5, §15, docs/perf/baseline.md) | `[TERVERIFIKASI]` — **SELESAI** |
| [T3-2-streaming-optimization.md](file:///g:/bot-ai/docs/decisions/T3-2-streaming-optimization.md) | Task T3.2: Streaming per Kalimat & Optimasi Latensi (PRD §5, §15, TC-04) | `[TERVERIFIKASI]` — **SELESAI** |
| [voice.md](file:///g:/bot-ai/docs/decisions/voice.md) | Task T3.3: Tes Pemilihan Suara Karakter Lyra (PRD §7, PRD §15) | `[TERVERIFIKASI]` — **SELESAI** |
| [voice-design.md](file:///g:/bot-ai/docs/decisions/voice-design.md) | Task T3.4: Eksperimen Voice Design Karakter Lyra (PRD §7, PRD §15) | `[TERVERIFIKASI]` — **SELESAI** |
| [audio-quality-lexicon.md](file:///g:/bot-ai/docs/decisions/audio-quality-lexicon.md) | Task T3.5: Kualitas Audio dan Kamus Pelafalan (PRD §7, PRD §15) | `[TERVERIFIKASI]` — **SELESAI** |
| [T3-6-golden-set-tuning.md](file:///g:/bot-ai/docs/decisions/T3-6-golden-set-tuning.md) | Task T3.6: Golden Set dan Harness Tuning Persona (PRD §9, PRD §15, TC-12) | `[TERVERIFIKASI]` — **SELESAI** |
| [T3-7-soak-test.md](file:///g:/bot-ai/docs/decisions/T3-7-soak-test.md) | Task T3.7: Soak Test 4 Jam & Phase Gate 3 Sign-Off (PRD §15, TC-17) | `[TERVERIFIKASI]` — **SELESAI** |
| [T4-1-security-audit.md](file:///g:/bot-ai/docs/decisions/T4-1-security-audit.md) | Task T4.1: Audit Keamanan dan Penetrasi (SEC-1 s/d SEC-15) | `[TERVERIFIKASI]` — **SELESAI** |
| [T4-2-e2e-checklist-ci.md](file:///g:/bot-ai/docs/decisions/T4-2-e2e-checklist-ci.md) | Task T4.2: Suite Otomatis dan Checklist E2E | `[TERVERIFIKASI]` — **SELESAI** |
| [T4-3-soak-24h-failure-injection.md](file:///g:/bot-ai/docs/decisions/T4-3-soak-24h-failure-injection.md) | Task T4.3: Soak 24 Jam dan Injeksi Kegagalan (TC-08, TC-09, TC-17, TC-18, TC-19) | `[TERVERIFIKASI]` — **SELESAI** |
| [T4-4-documentation-runbook-backup.md](file:///g:/bot-ai/docs/decisions/T4-4-documentation-runbook-backup.md) | Task T4.4: Dokumentasi, Runbook, dan Backup (Phase Gate 4 Sign-Off) | `[TERVERIFIKASI]` — **SELESAI** |
| [T5-1-docker-healthz.md](file:///g:/bot-ai/docs/decisions/T5-1-docker-healthz.md) | Task T5.1: Docker Image Hardening & Endpoint /healthz (SEC-11, SEC-12, TDD §13) | `[TERVERIFIKASI]` — **SELESAI** |
| [T5-2-render-free-evaluation.md](file:///g:/bot-ai/docs/decisions/T5-2-render-free-evaluation.md) | Task T5.2: Uji Render Free Tier dan Kasus Uji TC-20 (PRD F8, TDD §13) | `[TERVERIFIKASI]` — **SELESAI** |
| [T5-3-gcp-e2-micro.md](file:///g:/bot-ai/docs/decisions/T5-3-gcp-e2-micro.md) | Task T5.3: Uji GCP e2-micro (opsional) & Verifikasi Klaim F9 | `[TERVERIFIKASI]` — **SELESAI** |
| [T5-4-jalur-3-recommendation.md](file:///g:/bot-ai/docs/decisions/T5-4-jalur-3-recommendation.md) | Task T5.4: Laporan Jalur 3 & Rekomendasi Keputusan D4 (Phase Gate 5 Sign-Off) | `[TERVERIFIKASI]` — **SELESAI** |
| [T6-1-avatar-stage.md](file:///g:/bot-ai/docs/decisions/T6-1-avatar-stage.md) | Task T6.1: Avatar Lokal lewat AIRI Stage, Lip-Sync, dan Pemetaan Emosi (FR-X1) | `[TERVERIFIKASI]` — **SELESAI** |
| [T6-2-pipeline-b-spike.md](file:///g:/bot-ai/docs/decisions/T6-2-pipeline-b-spike.md) | Task T6.2: Spike Pipeline B (Gemini Live), Resumption & Komparasi Suara | `[TERVERIFIKASI]` — **SELESAI** |
| [T7-1-production-deploy.md](file:///g:/bot-ai/docs/decisions/T7-1-production-deploy.md) | Task T7.1: Deploy Produksi Jalur 2 (Docker Compose, Persistent SQLite, Backup & Kill Switch) | `[TERVERIFIKASI]` — **SELESAI** |
| [T7-2-post-release-review.md](file:///g:/bot-ai/docs/decisions/T7-2-post-release-review.md) | Task T7.2: Peninjauan Pasca-Rilis & Penutupan Roadmap (Retro-001, Golden Set v1.1 & Backlog) | `[TERVERIFIKASI]` — **SELESAI** |



