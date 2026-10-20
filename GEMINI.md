# GEMINI.md - Rules and Context for Google Gemini in Bot-AI

## Working Context
You are working on `bot-ai`, an AI VTuber Discord Bot project based on AIRI and `discord.js`.
The project is strictly guided by the modular documentation in `docs/` ([docs/README.md](file:///g:/bot-ai/docs/README.md), [docs/PRD.md](file:///g:/bot-ai/docs/PRD.md), [docs/TDD.md](file:///g:/bot-ai/docs/TDD.md), [docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md)) and [AGENTS.md](file:///g:/bot-ai/AGENTS.md).

## Critical Guidelines
1. **Response Language**: Selalu berkomunikasi dengan pengguna dalam Bahasa Indonesia yang profesional, solutif, dan jelas.
2. **Code & Commit Language**: Standard English for all TypeScript/Node code, functions, types, comments, and git commit messages.
3. **Execution Hierarchy**:
   - Always adhere to PRD §15 task sequence (T0.1 to T0.6 in Phase 0 first).
   - Check acceptance criteria (AC) before marking any task as done.
   - Record decisions with evidence in `docs/decisions/`.
4. **Safety & Zero Secret Leak**:
   - Never write Discord tokens or API keys into repository files.
   - All credentials must be read from environment variables via `dotenv` or `process.env`.
5. **No Hallucinations**:
   - Verify official documentation for Discord.js v14, `@discordjs/voice`, and `@google/genai`.
   - Never invent methods or packages.
