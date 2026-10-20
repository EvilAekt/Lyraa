# Rule: PRD Task Execution Workflow

## 1. Sequential Progression
- Tasks must be processed one at a time following the numeric Task ID defined in [docs/ROADMAP-DAN-TASK.md](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md#15-backlog-task-senior-ke-junior).
- Do not skip tasks or leap ahead to future phases without passing the current Phase Gate ([docs/ROADMAP-DAN-TASK.md §14](file:///g:/bot-ai/docs/ROADMAP-DAN-TASK.md#14-roadmap)).

## 2. Epistemic Labels
Always tag claims and findings with:
- `[TERVERIFIKASI]`: Confirmed with empirical proof or official test.
- `[VERIFIKASI]`: Unverified assumption. Must be tested before making architectural commitments.
- `[ASUMSI]`: Temporary design choice pending validation.

## 3. Evidence Requirement
A task is never complete until the following items are provided:
- Exact command outputs / logs
- Verification metrics (e.g. latency, memory RSS, audio clip confirmation)
- Architectural Decision Record in `docs/decisions/` where applicable.

## 4. Blocker Protocol
Stop immediately and escalate if:
- Two consecutive fix attempts fail.
- Task touches billing, paid APIs, or secrets.
- Major unapproved dependencies are required.
- Architectural fork divergence risks breaking upstream pullability.
