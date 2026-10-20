---
name: persona-and-memory
description: >-
  Use this skill to manage VTuber AI persona definition files, dynamic reload (/persona reload), and user short/long-term memory with SQLite.
---

# Persona and Memory Management

This skill provides procedures for loading, hot-reloading, and querying the VTuber AI character persona and SQLite memory store.

## 1. Persona Directory Layout

All character persona assets reside in `persona/`:
- `character.md`: Core identity, backstory, 3 key traits, speech idiosyncrasies.
- `voice-style.md`: Strict spoken dialogue rules (spoken grammar, max 8 words in first sentence, no markdown, no emojis).
- `rules.md`: Operational boundaries, refusal phrasing, AI honesty rule (FR-P5: must acknowledge AI identity if asked seriously).
- `examples.jsonl`: 12 to 20 few-shot question/answer pairs.
- `lexicon.json`: Word pronunciation mapping dictionary.

## 2. Dynamic Hot-Reloading

The persona loader must support reloading via `/persona reload` without server restarts:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

export interface PersonaState {
  character: string;
  voiceStyle: string;
  rules: string;
  examples: any[];
  lexicon: Record<string, string>;
  version: string;
}

export async function loadPersona(personaDir = 'persona/'): Promise<PersonaState> {
  const character = await fs.readFile(path.join(personaDir, 'character.md'), 'utf-8');
  const voiceStyle = await fs.readFile(path.join(personaDir, 'voice-style.md'), 'utf-8');
  const rules = await fs.readFile(path.join(personaDir, 'rules.md'), 'utf-8');
  const lexiconRaw = await fs.readFile(path.join(personaDir, 'lexicon.json'), 'utf-8');
  const lexicon = JSON.parse(lexiconRaw);

  const examplesRaw = await fs.readFile(path.join(personaDir, 'examples.jsonl'), 'utf-8');
  const examples = examplesRaw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  return {
    character,
    voiceStyle,
    rules,
    examples,
    lexicon,
    version: `persona-v${Date.now()}`
  };
}
```

## 3. SQLite Memory Schema & Adapter

Store short-term and long-term user facts in SQLite (`data/memory.sqlite`):

```sql
CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_input TEXT NOT NULL,
  bot_reply TEXT NOT NULL,
  turn_latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Commands:
- `/memory me`: Lists all stored facts for the requesting user.
- `/forget me`: Deletes all memory records and turn history for the user.
- `/forget all` (Owner only): Wipes the entire memory database.
