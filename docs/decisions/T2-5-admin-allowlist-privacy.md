# Keputusan & Verifikasi Task T2.5: Admin, Allowlist, dan Pengumuman Privasi

- **Task ID**: T2.5 (Fase 2: Teks, Gambar, Persona, Memori, Admin)
- **Status**: `[TERVERIFIKASI]` — **SELESAI**
- **Referensi PRD**: PRD §4 (FR-A1, FR-A2), PRD §8 (Pesan Privasi Voice), SEC-4, SEC-9, SEC-14, TC-16

---

## 1. Konteks & Tujuan

Task T2.5 berfokus pada kontrol keamanan akses server/pengguna, hak istimewa owner, kepatuhan privasi suara, dan kill switch:
1. **Penegakan Allowlist Guild & User yang Ketat (SEC-4)**:
   - Hanya guild dan pengguna yang terdaftar dalam allowlist yang dapat memanggil bot atau berinteraksi lewat suara/teks.
   - Bot owner selalu diizinkan (`ownerUserId`).
   - Penolakan terhadap pengguna di luar allowlist disampaikan secara sopan (*"Maaf, akun Anda belum terdaftar dalam daftar allowlist pengguna bot."*).
   - Auto-leave otomatis dari guild tak dikenal saat startup audit (`auditGuilds`) dan saat menerima invite baru (`Events.GuildCreate`).
2. **Pengumuman Privasi Suara & Persetujuan Lengkap (SEC-9)**:
   - Diumumkan secara otomatis saat bot masuk ke voice channel (lewat `/join` maupun `!join`).
   - Menyertakan informasi: enkripsi DAVE E2EE, pendengaran & transkripsi suara Gemini, larangan data sensitif (nomor rekening, password, PIN, NIK), retensi audio mentah = 0, transkrip maks 7 hari yang dapat dihapus dengan `/forget me`, serta opsi kontrol `/leave` dan `/mute`.
3. **Perintah Admin & Kill Switch (FR-A1, FR-A2, SEC-14, TC-16)**:
   - `/status`: Melaporkan uptime, memory RSS, status model AI, persona aktif, latensi p50/p95, statistik allowlist guild/user, dan status kill switch.
   - `/mute` dan `/unmute`: Kill switch instan (Owner only) yang membisukan bot, menghentikan seluruh audio playback di semua guild, dan memblokir seluruh interaksi suara/chat AI hingga diaktifkan kembali.

---

## 2. Implementasi Teknis

### A. Modul `AllowlistManager` (`src/admin/allowlist-manager.ts`)
- Memvalidasi autorisasi guild via `isGuildAllowed(guildId)`.
- Memvalidasi autorisasi user via `isUserAllowed(userId)` dengan pengecualian mutlak bagi bot owner (`isOwner(userId)`).
- Menjalankan `autoLeaveUnauthorizedGuild(guild)` dan `auditGuilds(guilds)`.
- Memformat teks pengumuman privasi terstruktur `formatPrivacyNotice(channelName, botName)`.

### B. Integrasi Runtime (`src/index.ts`)
- Mendaftarkan slash command `/mute`, `/unmute`, dan `/status`.
- Menjalankan audit guild saat startup di event `ClientReady`.
- Mencegat event `GuildCreate` untuk auto-leave instan dari server tak terdaftar.
- Menegakkan `allowlistManager.isGuildAllowed` dan `allowlistManager.isUserAllowed` di event `InteractionCreate` dan `MessageCreate`.
- Menyematkan `allowlistManager.formatPrivacyNotice(...)` pada `handleJoinCommand` dan `handlePrefixJoin`.
- Menyediakan kill switch di `handleMuteCommand`, `handleUnmuteCommand`, `handlePrefixMute`, dan `handlePrefixUnmute` yang menghentikan audio player seketika (`player.stop()`) serta memutus pipeline chat.

---

## 3. Bukti Verifikasi & Pengujian (Definition of Done)

### A. Unit Test Suite (`tests/admin.test.ts`)
```
[AllowlistManager] [SEC-4] Auto-leaving unauthorized guild "Unauthorized Stranger Server" (guild-stranger-2). Not in allowlist.
[AllowlistManager] [SEC-4] Auto-leaving unauthorized guild "Bad 1" (bad-guild-1). Not in allowlist.
[AllowlistManager] [SEC-4] Auto-leaving unauthorized guild "Bad 2" (bad-guild-2). Not in allowlist.
✔ SEC-4: Guild Allowlist allows all when empty, and enforces strictly when configured
✔ SEC-4: User Allowlist allows all when empty, enforces strictly, and always permits Owner
✔ SEC-4: Auto-leave unauthorized guilds on invitation or audit
✔ SEC-9: Voice privacy notice contains all mandatory disclosures and commands
✔ TC-16: Kill switch (/mute and /unmute) behavior and state transitions (FR-A2, SEC-14)
ℹ tests 5 | pass 5 | fail 0
```

### B. Full Test Suite Validation (`npm test`)
```
ℹ tests 62
ℹ suites 2
ℹ pass 62
ℹ fail 0
ℹ duration_ms ~32.8s
```
Seluruh 62 unit test di workspace lulus 100% tanpa regresi.

### C. Build & Daemon Restart
- `npm run build` (`tsc`): Berhasil tanpa error tipe.
- Daemon bot (`npm start`) aktif dan berjalan stabil dengan versi runtime teranyar.

---

## 4. Konsekuensi & Langkah Berikutnya

Dengan selesainya Task T2.5, seluruh aspek administrasi, izin server/pengguna, pengumuman privasi, dan kill switch telah terpasang rapi.
Langkah berikutnya sesuai PRD §15 & ROADMAP adalah:
👉 **Task T2.6: Batas biaya, rate limit, dan anti-injection** (FR-A3, SEC-5, SEC-6, TC-13, TC-16).
