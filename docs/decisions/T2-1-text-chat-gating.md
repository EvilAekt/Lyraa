# Keputusan & Verifikasi Task T2.1: Chat Teks dan Gating

- **ID Task**: `T2.1 Chat teks dan gating`
- **Fase**: `Fase 2: Teks, gambar, persona, memori, admin`
- **Tanggal Verifikasi**: 22 Oktober 2026
- **Status Akhir**: `[TERVERIFIKASI]` — **SELESAI**

---

## 1. Komponen yang Diimplementasikan

| Komponen | Berkas | Deskripsi & Desain |
|---|---|---|
| **Text Gating Engine** | [src/chat/text-gating.ts](file:///g:/bot-ai/src/chat/text-gating.ts) | Mesin evaluasi aturan obrolan teks (FR-T1, FR-T2), penyaringan mention bot, deteksi balasan (*reply to bot*), pencocokan nama bot (*wake words*), deteksi pertanyaan langsung (*direct questions*), pembatasan jeda (*cooldown*) & *rate limit* sliding window (SEC-6), serta sanitasi mention (FR-T4, TC-14). |
| **Chat Handler** | [src/chat/chat-handler.ts](file:///g:/bot-ai/src/chat/chat-handler.ts) | Mengelola siklus interaksi pesan teks: indikator *typing* berkala (`sendTyping`), *input wrapping* aman (SEC-1, SEC-5), eksekusi *streaming* token LLM Gemini dengan *resilience retry* (T1.7), dan pengiriman balasan dengan `allowed_mentions: { parse: [] }`. |
| **Konfigurasi Chat** | [src/config/index.ts](file:///g:/bot-ai/src/config/index.ts) | Menambahkan `CHAT_CHANNEL_NAMES` (default: `chat-ai, bot-chat, lyra-chat, obrolan-ai, general-ai`), `CHAT_CHANNEL_IDS`, dan `CHAT_COOLDOWN_MS` (3.000 ms). |
| **Integrasi Runtime** | [src/index.ts](file:///g:/bot-ai/src/index.ts) | Menghubungkan event `Events.MessageCreate` ke `ChatHandler`, mensinkronkan *kill switch* `/mute` untuk memblokir chat teks seketika, dan memperbarui `/status` dengan metrik obrolan teks. |
| **Unit Testing (TC-10 & TC-14)** | [tests/text-gating.test.ts](file:///g:/bot-ai/tests/text-gating.test.ts) | 20 skenario pesan campuran nyata (TC-10) dan pengujian sanitasi *mention safety* (TC-14). |

---

## 2. Alur Evaluasi Gating Teks (PRD FR-T1, FR-T2)

```
Pesan Teks Diterima (Events.MessageCreate)
                 │
                 ▼
     Pengirim adalah Bot Lain? ──────────────> Abaikan (allowed: false, reason: bot_sender)
                 │ Tidak
                 ▼
      Kill Switch Aktif? ─────────────────────> Abaikan (allowed: false, reason: bot_disabled)
                 │ Tidak
                 ▼
       Guild dalam Allowlist? ────────────────> Abaikan jika ada allowlist & tidak cocok
                 │ Cocok
                 ▼
     Kriteria Pemicu (Trigger):
     1. Prefix eksplisit `!chat`? ────────────> Diterima (trigger: prefix)
     2. Mention langsung bot (`<@botId>`)? ───> Diterima (trigger: mention)
     3. Balasan langsung ke pesan bot? ───────> Diterima (trigger: reply)
     4. Di Saluran Khusus (`#chat-ai` dsb):
        - Menyebut nama bot (Lyra, Lira, Airi)? ──> Diterima (trigger: name)
        - Pertanyaan langsung ke bot? ─────────> Diterima (trigger: question)
        - Obrolan bebas sesama manusia? ───────> Abaikan (FR-T2: Tanpa panggil LLM)
     5. Di Saluran Umum:
        - Tanpa mention / reply / prefix? ────> Abaikan
                 │ Lolos
                 ▼
       Cek Cooldown & Rate Limit:
     - Jeda antar pesan < 3 detik? ───────────> Tolak (reason: cooldown)
     - Pesan > 6 req/menit? ──────────────────> Tolak (reason: rate_limited)
                 │ Lolos
                 ▼
        Kirim ke Gemini LLM Streaming
                 │
                 ▼
      Sanitasi Mention (FR-T4, TC-14):
      - Ubah @everyone -> @\u200beveryone
      - Ubah @here -> @\u200bhere
      - Ubah <@&roleId> -> [@role-id]
      - Kirim dengan allowedMentions: { parse: [] }
```

---

## 3. Hasil Pengujian Empiris (TC-10 & TC-14)

Hasil eksekusi `tests/text-gating.test.ts`:
```
✔ TC-14: Mention Safety sanitizes @everyone, @here, and role pings (2.62ms)
✔ TC-10: 20 mixed text chat messages evaluated against gating rules (FR-T1, FR-T2) (1.23ms)
```

### Rincian 20 Skenario Pesan Campuran (TC-10)
1. Obrolan umum antar user di `#general` $\to$ **Ditolak** (`not_for_bot`).
2. Pesan dari bot lain di `#chat-ai` $\to$ **Ditolak** (`bot_sender`).
3. Mention bot `<@botId>` di `#general` $\to$ **Diterima** (`matched_mention`).
4. Nickname mention `<@!botId>` di `#general` $\to$ **Diterima** (`matched_mention`).
5. Balasan (*reply*) ke pesan bot di `#general` $\to$ **Diterima** (`matched_reply`).
6. Perintah prefix `!chat` di `#general` $\to$ **Diterima** (`matched_prefix`).
7. Obrolan ajakan futsal antar teman di `#chat-ai` $\to$ **Ditolak** (`not_for_bot`).
8. Nama bot di awal kalimat di `#chat-ai` $\to$ **Diterima** (`matched_wake_name`).
9. Nama bot di tengah kalimat di `#chat-ai` $\to$ **Diterima** (`matched_wake_name`).
10. Variasi fonetik "Lira" di `#chat-ai` $\to$ **Diterima** (`matched_wake_name`).
11. Alias upstream "Airi" di `#chat-ai` $\to$ **Diterima** (`matched_wake_name`).
12. Pertanyaan langsung "apa arti kata clutch?" di `#chat-ai` $\to$ **Diterima** (`matched_direct_question`).
13. Tawa / interjeksi "wkwkwk" di `#chat-ai` $\to$ **Ditolak** (`not_for_bot`).
14. Curhat kekalahan ranked di `#chat-ai` $\to$ **Ditolak** (`not_for_bot`).
15. Pertanyaan jual-beli antar user di `#chat-ai` $\to$ **Ditolak** (`not_for_bot`).
16. Pertanyaan teknis "gimana cara coding typescript?" di `#chat-ai` $\to$ **Diterima** (`matched_direct_question`).
17. Pertanyaan lanjutan dalam sesi aktif "bisa tolong berikan contohnya?" $\to$ **Diterima** (`matched_direct_question`).
18. Pesan kosong / whitespace $\to$ **Ditolak** (`empty_content`).
19. Pesan saat *kill switch* aktif $\to$ **Ditolak** (`bot_disabled`).
20. Pesan spam bertubi-tubi (< 3 detik) $\to$ **Ditolak** (`cooldown`).

- **Total Test Suite Proyek**: **36 pengujian lolos 100%** (`pass 36, fail 0`).

---

## 4. Kepatuhan Kriteria Penerimaan (Acceptance Criteria)

- [x] **FR-T1**: Bot merespons saat di-mention atau di channel khusus.
- [x] **FR-T2**: Aturan gating selektif aktif (tidak memanggil LLM untuk setiap obrolan bebas antar manusia).
- [x] **FR-T4**: `allowed_mentions: { parse: [] }` diterapkan pada semua balasan teks dan sanitasi token ping massal (`@everyone`, `@here`, role ping).
- [x] **TC-10**: 20 pesan campuran dievaluasi dan terverifikasi 100% akurat.
- [x] **TC-14**: Sanitasi mention aman dan teruji.
