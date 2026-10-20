# Performance & Latency Benchmark Records

Semua data benchmark latensi suara disimpan di folder ini.

## Indikator Waktu
- `t0`: Akhir ucapan pengguna (VAD silence threshold)
- `t1`: Transkrip STT siap
- `t2`: Token LLM pertama diterima
- `t3`: Kalimat pertama siap dikirim ke TTS
- `t4`: Chunk audio TTS pertama diterima
- `t5`: Paket Opus audio pertama terkirim ke Discord Voice UDP

## Target
- Total Latensi (`t5 - t0`): **p50 ≤ 2.0s, p95 ≤ 3.5s**
- Event Loop Lag: **< 50ms**
