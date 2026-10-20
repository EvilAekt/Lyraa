# Rule: Security and Safety Guardrails (SEC-1 to SEC-15)

## 1. Secrets and Credentials (SEC-2)
- Zero secret policy in version control.
- Tokens, API keys, and webhooks MUST ONLY be loaded from environment variables (`.env`).
- Ensure `.gitignore` explicitly prevents `.env` and `.env.*.local` from being tracked.

## 2. Input Isolation & Injection Defense (SEC-1, SEC-5)
- All user inputs (voice transcripts, chat messages, image attachments) are treated as UNTRUSTED DATA.
- Wrap user inputs in labeled data blocks (e.g. `<user_input>...</user_input>`).
- System prompts must explicitly instruct the LLM never to follow system-level directives embedded inside user inputs.

## 3. Discord Messaging Safety (SEC-7)
- All replies via Discord text channels MUST set:
  ```typescript
  allowed_mentions: { parse: [] }
  ```
- Under no circumstances should the bot trigger `@everyone`, `@here`, or mass role pings.

## 4. Access Control & Kill Switch (SEC-4, SEC-14)
- Guild and User Allowlist check must precede any voice or AI invocation.
- If invoked in an unauthorized guild, reject politely or leave the guild.
- Admin commands (`/mute`, `/forget all`, `/status`) are strictly restricted to `OWNER_USER_ID`.
- If `BOT_ENABLED=false` or `/mute` is active, immediately kill ongoing streams and suppress answers.

## 5. Privacy and Audio Data (SEC-9, SEC-10)
- Raw audio buffers must NOT be persisted to disk, except when temporary local debugging (`DEBUG_SAVE_AUDIO=true`) is active.
- Transcripts may be cached for short-term memory (up to 12 turns) and retained for maximum 7 days.
- User `/forget me` must erase all related user facts and transcripts.
