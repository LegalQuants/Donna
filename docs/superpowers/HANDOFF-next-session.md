# Donna — Handoff for the next session

**Date:** 2026-06-07 · **`main` @ `fceb31f`** · **Pin:** `vendor/lq-ai` @ `0097b01`.
**Baseline gates:** `npm run check` 0/0 · vitest **1285/1285** (234 files) · `npm run lint` **fully
green** (prettier + eslint 0 — this is new since docs-polish; keep it green, not just "no new").

## Where things stand — every planned milestone is MERGED

- **Automations segment COMPLETE** (A/B/C/F/G + D #71 + E #72): sessions/receipts, notifications,
  run-now + opt-in, schedules, watches, run Results (findings + memories), and the **Review** view
  (`/automations/review`): memory keep/edit-on-keep/dismiss/delete · precedents dismiss/promote ·
  proposals accept (writes the matter's `context_md`) / reject.
- **docs-polish COMPLETE** (#68 About refresh · #69 repo presentation: README/LICENSE/credits,
  one-time prettier format — see the `.git-blame-ignore-revs` note below).
- Everything earlier (P0–P8, Tabular, BYOK, settings, About) long merged.

## THE NEXT SESSION'S JOB — incorporate the two upstream SHAs

The user is relaying TWO asks to LQ-AI CC; both were "almost done" at handoff time and will
probably land as ONE pin bump. **Goal: a user can see and open the documents a workflow run
produced, right from the run's receipt.**

### 1. Document-grade run artifacts (the main build)

Ask: `docs/upstream-requests/lq-ai-autonomous-run-artifacts.md` (filed via PR #67). Agreed shape:
`emit_artifact` chokepoint in the run; artifacts persisted as **real Documents in the run's
`target_kb_id`** (so RAG/doc-panel/download work for free); **artifact references on the session
read model**; **`artifact_count` on notifications**. KB doc OUTLIVES the session.

On the SHA (slice runs the normal loop — brainstorm lite → spec → plan → subagent-execute):

1. **Pin bump recipe:** `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` →
   rebuild `api` + `arq-worker` + `donna-web` (migrations run on api boot) → update
   `docs/decisions/lq-ai-pin.md` bump log → commit on the feature branch.
2. **Verify the contract in `src/lib/api/backend.d.ts`** before building: where do artifact refs
   live (session read model? separate endpoint?), exact field names, and the notification payload.
   The asks doc proposed shapes but THE MERGED CONTRACT WINS — re-read it from the generated types
   (the ask explicitly allowed upstream latitude).
3. **Build the "Documents" block** in `src/lib/automations/RunResults.svelte`, ABOVE the findings
   list. The threading seam already exists end-to-end: `loadRunOutput`
   (`$lib/automations/runOutput.server.ts`) → `[id]` SSR load AND the `[id]/+server.ts` poll proxy
   → `pollSession.svelte.ts` → `SessionDetail` → `RunResults` props (this exact chain carried
   `memories_total` in #71 — mirror it). Per-artifact row: name + link. **Opening a document:**
   artifacts are real KB documents → `/files/{file_id}/content` serves bytes and the existing
   document panel (`$lib/docpanel/`) can render PDFs; artifacts will likely be markdown/text →
   check the doc-panel's non-PDF fallback (`UnsupportedFileCard` offers Download). Decide at spec
   time: v1 = name + Download link (+ doc-panel open if the type renders); don't over-build.
4. **Notifications:** surface `artifact_count` in the inbox row copy if the payload carries it
   (one line in `NotificationRow.svelte`).
5. **Last-known-good + degradation rules apply:** Results must never fail the receipt page;
   follow the findings/memories null-degradation pattern in `loadRunOutput`.
6. **Live e2e:** extend `tests/automations-run-results.spec.ts` or a new spec — a real run that
   emits an artifact (depends on what upstream playbooks/skills emit; if runs don't reliably emit
   artifacts, seed the Document + artifact-ref rows via SQL like the memory/precedent e2es —
   helpers and the marker-row pattern live in `tests/automations-memory-review.spec.ts` /
   `tests/automations-precedents.spec.ts`; Postgres creds: `POSTGRES_USER=lq_ai`, db `lq_ai`).
7. **About touch:** `/about/automations` Results section gains a sentence about documents.

### 2. Skill-registry init fix (verification only, no Donna code)

Ask: `docs/upstream-requests/lq-ai-autonomous-skill-registry-init.md` (PR #70). The arq-worker
never initialises `app.state.skill_registry` (lifespan-only), so EVERY worker-side `skill_ref`
session fails — confirmed reproducing on `0097b01` (06-06 + 06-07 09:00Z ticks, error
`skill registry not initialised (skill_ref='dpa-checklist-review')`).

On the SHA: pin bump (same bump as above) + rebuild `arq-worker`, then verify: the dev DB has ONE
enabled schedule (`0 9 * * *` UTC, `skill_ref: dpa-checklist-review`) — either wait for the next
09:00Z tick or trigger a run-now with a skill source and confirm the session completes (the
`/automations` sessions list shows it; a failed one carries the registry error in its receipt).

## Open ends (small, not scheduled)

- **Hero image swap offer stands:** README references stable `docs/images/donna-hero.png`; if the
  user supplies nicer screenshots, swap the file in one commit.
- **PR #72 follow-up nits (cosmetic):** precedents list caps at 50 with no "N of M" line; a
  `pattern_kind` named like a memory state picks up its chip color; "Proposal created below." can
  render above a failed proposals section.
- **Possible upstream ask (unfiled):** schedule/watch edit source-switch PATCHes the new source
  key without nulling the other (backend row can hold both `playbook_id` + `skill_ref`).

## Dev-stack + build-loop reminders (see [[donna-dev-stack]], [[donna-workflow]])

- **Cold start:** `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio
gateway api donna-web ingest-worker arq-worker`. App http://localhost:13002 · API :18000 ·
  admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`.
- **Rebuild `donna-web` before any manual/e2e check**; after a pin bump also rebuild `api` +
  `arq-worker`.
- **Gates:** `npm run check` 0/0 (vendor `ERR_MODULE_NOT_FOUND` stderr harmless) · `npm run lint`
  fully green · vitest baseline 1285. **Merge PRs with MERGE COMMITS** (a squash would orphan the
  two format SHAs in `.git-blame-ignore-revs`).
- **Loop:** brainstorm → spec → plan → subagent-execute (fresh implementer per task + two-stage
  review) → live e2e → whole-branch Opus review → PR. Commit + push per task.
- **Upstream-fix workflow:** never edit `vendor/lq-ai`; ask docs go to
  `docs/upstream-requests/<name>.md`, user relays, pin-bump on the merged SHA.
