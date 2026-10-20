---
name: latency-benchmark
description: >-
  Use this skill to benchmark, measure, and analyze voice pipeline latencies (t0..t5 timestamps), calculating p50/p95 percentiles and event-loop lag.
---

# Latency Benchmark Harness

This skill defines the methodology for measuring and profiling latency across the Bot-AI voice pipeline.

## 1. Timestamp Points

Every turn must record:
- `t0`: VAD endpoint detected silence indicating end of user speech.
- `t1`: STT transcript ready.
- `t2`: First token arrived from Gemini LLM stream.
- `t3`: First complete sentence delivered to TTS engine.
- `t4`: First audio chunk returned by TTS engine.
- `t5`: First Opus audio packet dispatched to Discord voice UDP socket.

## 2. Metric Calculations

- Total Latency: `t5 - t0` (Target: p50 ≤ 2.0s, p95 ≤ 3.5s)
- STT Latency: `t1 - t0` (Target budget: ~400ms)
- LLM Time-to-First-Token: `t2 - t1` (Target budget: ~400ms)
- Chunker Sentence 1 Latency: `t3 - t2` (Target budget: ~150ms)
- TTS First-Chunk Latency: `t4 - t3` (Target budget: ~450ms)
- Opus Dispatch Latency: `t5 - t4` (Target budget: ~100ms)

## 3. Benchmark Execution

Run the automated benchmark script against standard 10 audio fixtures (short, conversational, gaming terms, English-Indo mix):
```bash
npm run benchmark
```
Save baseline reports to `docs/perf/baseline.md` and subsequent runs in `docs/perf/run-<date>.md`.
