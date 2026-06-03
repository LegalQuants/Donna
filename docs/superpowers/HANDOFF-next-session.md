# Donna — Handoff for the next session

**Date:** 2026-06-02 · **Pin:** `vendor/lq-ai` @ `945ad31` (all P1.x backend asks landed).

## ⏩ Your job: execute the P1.2 chat file-attach plan

The spec and a full, execution-ready implementation plan are written and committed on the branch
**`feat/chat-file-attach`**. Your job is to **execute that plan** — you do not need to design
anything.

- **Branch:** `feat/chat-file-attach` (already has the spec + plan commits; build on it).
- **Plan:** `docs/superpowers/plans/2026-06-02-chat-file-attach.md` — 7 tasks, TDD, exact code +
  commands per task. **Read it; it is self-contained.**
- **Spec (context):** `docs/superpowers/specs/2026-06-02-chat-file-attach-design.md`.

### How to execute
1. `git checkout feat/chat-file-attach && git pull` (it's pushed to origin).
2. Bring the stack up (cold start, below).
3. Run the plan with **`superpowers:subagent-driven-development`**: a fresh **Sonnet** implementer
   subagent per task (paste the task's full text from the plan into the subagent — don't make it
   read the file), then a **spec-compliance** review and a **code-quality** review per task
   (fix → re-review until clean), then a **whole-branch Opus review** at the end, then
   `superpowers:finishing-a-development-branch` → PR into `main`.
4. After merge: sync `main`, delete the local + remote branch, update memory, mark P1.2 done.

### What this slice builds (one-line)
Per-message file attach in the composer: a `createFileAttach` controller uploads via the existing
`/files` proxy and polls `/files/{id}` to `ready`; the composer adds a paperclip + drag-drop, gates
Send until all files are ready, and threads ready `file_ids` (≤16) through `chatStream` → messages
BFF → backend; `applied_file_ids` is echoed and shown as a 📎 indicator. Both composers (landing
carries `file_ids` via a new `donna_draft_file_ids` cookie).

## Cold start (every session)
1. `git checkout feat/chat-file-attach && git pull`.
2. Bring the stack up (shifted ports; coexists with the user's own lq-ai):
   ```bash
   set -a; . ./.env; set +a
   docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
   ```
   App at http://localhost:13002. Login `admin@lq.ai` / `$DONNA_E2E_PASSWORD`.
3. Verify gate: `npm run check` (expect "0 errors and 0 warnings"; vendor `ERR_MODULE_NOT_FOUND`
   stderr is harmless) · `npx vitest run` (currently ~801 green on `main`; this slice adds more) ·
   live e2es via `set -a; . ./.env; set +a; npx playwright test <spec>`.

## Banked gotchas this slice WILL hit
- **Rebuild `donna-web` before any live e2e** — the running container serves *built* code:
  `set -a; . ./.env; set +a; docker compose up -d --build donna-web` after `src/` changes (Task 7).
- **Polling controller tests use fake timers** — `vi.useFakeTimers()` +
  `await vi.advanceTimersByTimeAsync(2000)` to step the 2 s `/files/{id}` poll (Task 1). Always
  `vi.useRealTimers()` in `afterEach`.
- **0-warning bar** — `npm run check` must be 0/0. The composer drag-drop handlers need a
  `<!-- svelte-ignore a11y_no_static_element_interactions -->` (in the plan) to stay warning-free.
  No `any` / non-null `!` (post-guard `as string` is fine).
- **Live e2e fixture** — Task 7 creates a tiny `.txt` in the OS temp dir and waits for the chip to
  reach `ready` (≤120 s). If `.txt` doesn't ingest to `ready` on the dev stack, switch to a small
  `.pdf` (the RAG e2es use `cupsfilter`-generated `/tmp/spike*.pdf`) — don't loosen assertions.
- **e2e mutates nothing destructive** — it just sends one chat message; no fixture cleanup needed
  beyond the temp file.

## The build loop (working well — used for P1.1/P1.3/P7)
brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) →
**subagent-driven execute** (fresh Sonnet implementer per task + per-task spec review + per-task
code-quality review + whole-branch Opus review) → `finishing-a-development-branch` → PR into `main`
→ update memory. Quality bar: `npm run check` 0/0, eslint clean, live e2e self-cleaning. The
whole-branch Opus review has caught real cross-seam bugs (P1.1: a required `file`-type skill input
permanently disabling Send) — keep it.

## Roadmap status (where we are)
- **DONE & merged to `main`:** P7 (Settings) · pin bump to `945ad31` (#42) · pending-deletion
  banner (#43) · profile-edit/P1.3 (#44) · composer skill-input form/P1.1 (#45).
- **PLANNED, ready to execute (this handoff):** **P1.2 chat file-attach** — branch
  `feat/chat-file-attach`, plan `docs/superpowers/plans/2026-06-02-chat-file-attach.md`.
- **NEXT after P1.2:** **P6 Tabular** — the largest FE build; backend at `/api/v1/tabular/*` (see
  `donna-phase-status` memory). User wants P6 after the P1.x slices.

See memories: [[donna-lq-ai-v040-bump-parked]], [[donna-phase-status]], [[donna-dev-stack]],
[[donna-workflow]], [[donna-citation-contract]], [[donna-reviewer-remote-hygiene]].
