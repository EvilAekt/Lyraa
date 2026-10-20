---
name: prd-task-runner
description: >-
  Use this skill to systematically execute, verify, and document tasks from the Bot-AI PRD (PRD.md §15), ensuring proper phase gates, evidence collection, and decision recording.
---

# PRD Task Runner

This skill guides the systematic execution of development tasks defined in [PRD.md](file:///g:/bot-ai/PRD.md).

## Task Execution Procedure

1. **Identify the Active Task**:
   - Locate the current task in `PRD.md §15` (e.g. `T0.1`, `T0.2`, ..., `T1.1`).
   - Confirm that all preceding tasks have met their Acceptance Criteria (AC).
2. **Review Task Constraints**:
   - Read the **Tujuan** (Goal), **Langkah** (Steps), **AC** (Acceptance Criteria), **Bukti** (Proof), and **Jangan** (Forbidden Actions).
3. **Execute Steps Incrementally**:
   - Perform atomic changes.
   - Run verification commands (build, lint, test, audio probe).
4. **Collect Proof**:
   - Capture exact stdout, benchmark tables, audio samples, or logs.
   - For architecture choices or research findings, write a Markdown report in `docs/decisions/<TaskID>-<topic>.md`.
5. **Commit & Checkpoint**:
   - Create a clean git commit in English:
     `feat(scope): implement <TaskID> - <summary>` or `chore(spike): complete <TaskID> - <summary>`.
6. **Phase Gate Check**:
   - Before advancing to the next phase, verify all gates in `PRD.md §14`. If gate criteria are not met, do NOT proceed.
