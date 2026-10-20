# AGENTS.md - Antigravity Agent Directives for Bot-AI (VTuber AI Discord Bot)

This project builds an autonomous AI VTuber Discord Bot (based on AIRI / discord.js) capable of participating in Discord voice channels with End-to-End Encryption (DAVE protocol), hearing speech, transcribing (STT), reasoning with LLMs (Google Gemini), and responding with a character voice (TTS) with ultra-low latency and natural persona.

---

## 1. Prime Directives & Working Rules (Strict PRD Compliance)

1. **One Task at a Time in Strict Sequence**:
   - Work strictly sequentially according to Task IDs in PRD §15 (e.g., T0.1 -> T0.2 -> T0.3 ...). Never advance to the next phase before the current phase gate passes (§14).
2. **Three Epistemic Labels**:
   - `[TERVERIFIKASI]` (Proven with empirical evidence / tests).
   - `[VERIFIKASI]` (Hypothesis or unverified assumption from notes. Must be tested before treating as truth).
   - `[ASUMSI]` (Interim design choice).
   - Record all verified findings in `docs/decisions/`.
3. **No Hallucinated APIs or File Paths**:
   - Never invent function names, options, or endpoints. Always cross-check official SDK docs or active code. If not found, explicitly record as "not found" and consult the project lead.
4. **Upstream Fork Discipline**:
   - Keep modifications to upstream AIRI minimal. Put custom extensions, wrappers, and orchestration in dedicated packages/folders (`src/` or dedicated modules) so upstream updates can be pulled cleanly.
5. **Stop and Ask Conditions**:
   - Stop and escalate immediately if:
     - 2 fix attempts fail consecutively.
     - Task demands out-of-scope architectural decisions.
     - Task involves paid services or billing.
     - A heavy, non-standard external dependency is required.
6. **Definition of Done & Proof Obligation**:
   - "It works" without concrete proof is considered **incomplete**. Every task must finish with verifiable proof (command output, test log, benchmark numbers, audio sample, or decision record).
7. **Absolute Secret Protection**:
   - NEVER commit API keys, bot tokens, or webhook secrets. All secrets live exclusively in `.env` (strictly ignored by `.gitignore`). Always keep `.env.example` up to date.
8. **Language Standards**:
   - Code, variable names, functions, classes, code comments, and git commit messages MUST be in standard English.
   - Developer notes, discussions, and decision documentation may be written in Indonesian.

---

## 2. Core Architecture: Voice Pipeline & Constraints

### Pipeline A (Default: STT -> LLM -> TTS)
```
Discord Voice (UDP, DAVE/E2EE)
        │ Opus per user
        ▼
   discord-bot (discord.js + @discordjs/voice + @snazzah/davey)
        │ decode -> VAD / endpointing (hangover ~500ms)
        ▼
      STT (Gemini / Whisper compatible)
        │ text, user_id, timestamp
        ▼
   Orchestrator (Gating, Persona, Short/Long-term Memory, Safety)
        │
        ▼
   LLM (Gemini 2.5 Flash streaming)
        │ token stream -> sentence chunker (<8 words first sentence)
        ▼
   TTS (Streaming TTS, crossfade 5-10ms)
        │ resample 24kHz -> 48kHz native Opus
        ▼
   Discord Voice Output Channel
```

### Latency Budget (Target: p50 ≤ 2.0s, p95 ≤ 3.5s)
Turn timestamps MUST be recorded per turn (`turn_id`):
- `t0`: User speech finished (VAD endpoint)
- `t1`: STT transcript ready
- `t2`: First LLM token received
- `t3`: First sentence chunk ready for TTS
- `t4`: First TTS audio chunk received
- `t5`: First audio packet sent to Discord voice UDP

---

## 3. Security & Safety Guardrails (PRD SEC-1 to SEC-15)

- **SEC-1**: Untrusted User Input Wrapping — user messages, transcripts, and image descriptions are strictly treated as data, NEVER as direct instructions.
- **SEC-4**: Guild & User Allowlist — only allowlisted guilds and users can trigger `/join` or interact with voice. Auto-leave unauthorized guilds.
- **SEC-5**: Prompt Injection Defense — prevent jailbreaks, persona leaks, or attempts to claim human identity (Bot always acknowledges being an AI if asked seriously - FR-P5).
- **SEC-7**: Empty Allowed Mentions — all bot text replies MUST specify `allowed_mentions: { parse: [] }` to prevent pinging `@everyone`, `@here`, or roles.
- **SEC-9**: Privacy & Voice Notice — state privacy notice upon entering voice ("Aku mendengarkan dan mentranskripsi suara di channel ini...").
- **SEC-10**: Ephemeral Audio — Raw audio is NEVER stored to disk unless running explicitly in local `DEBUG_SAVE_AUDIO=true` mode. Transcripts retained for max 7 days.
- **SEC-14**: Kill Switch — `/mute` command or `BOT_ENABLED=false` immediately halts all AI responses and voice streaming.

---

## 4. Skills & Task Execution Available in Workspace

Agents can leverage modular skills stored in `.agents/skills/`:
- `prd-task-runner`: Systematic guide to run PRD tasks (T0.1 to T7.2), verify acceptance criteria, and record proof.
- `discord-voice-dave`: Recipes for DAVE protocol E2EE, `@discordjs/voice`, `@snazzah/davey`, receiver streams, and barge-in.
- `gemini-pipeline`: Implementation patterns for `@google/genai`, streaming LLM, multimodal image handling, and TTS.
- `persona-and-memory`: Loading persona files (`persona/`), hot reload, and SQLite short/long-term memory.
- `latency-benchmark`: Automated benchmark harness measuring t0..t5 and generating baseline reports.
