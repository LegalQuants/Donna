# Donna — Handoff for the next session

**Date:** 2026-06-05 · **`main` @ `6ece8c7`** · **Pin:** `vendor/lq-ai` @ `35c8bb6` (a newer pin `fc832ca` is available — see "Leverage now").

## Where things stand — Automations (4th Workflows segment over LQ-AI's autonomous M4 layer)
Built in slices, each its own brainstorm→spec→plan→subagent-execute→whole-branch-Opus-review→PR loop. **All shipped to `main`:**
- **A+B (#58):** read-only viewer — Sessions list + per-session receipt + notifications inbox.
- **C (#59):** run-now + `autonomous_enabled` opt-in.
- **F — Schedules (#60, MERGED):** `/automations/schedules` list/create/edit/toggle/delete cron runs; `CronInput`, `ScheduleForm`, pure `cron.ts`/`schedules.ts`. **Pin bumped `541bd6f → 35c8bb6` during F** → autonomous cost fields uniformly typed `string` + the **BYOK provider-key backend is in-pin** (lq-ai #128). Two run-now crash fixes shipped (each_key_duplicate dedupe; cost-cap `type=number→text`).
- **G — Watches (#61, MERGED):** `/automations/watches` list/create/edit/toggle/delete KB-arrival watches; `WatchForm` (KB required+immutable, matter immutable, fire+cost emphasis), `WatchRow`/`WatchList`/`watches.ts`; shared `sourceLabel` extracted to `$lib/automations/sourceLabel` (schedules re-exports). Whole-branch Opus review = integration-clean.

## ✅ Spike done (2026-06-05): "run output surfacing" — premise corrected + upstream ask filed
The next user-priority slice was "surface a run's work-product, not just the receipt." **The spike (against vendor source) corrected the premise:** a run produces **findings / memories / precedents**, NOT a document-in-a-KB. Phases = intake→analysis→drafting→ethics_review→notify. **The blocker:** **findings (the core deliverable) are transient + audit-only — no `AutonomousFinding` table, no endpoint returns a run's findings content** (the user only sees `finding_count` in the notification). Memories/precedents ARE persisted but `GET /memory` has no `?source_session_id=` filter.
- **→ Upstream ask written: `docs/upstream-requests/lq-ai-autonomous-run-output.md`** (relay to LQ-AI CC). Asks: (1) persist findings + a `GET /sessions/{id}/findings` (or fold into session detail); (2) add `?source_session_id=` to `GET /memory`/precedents. **This slice is upstream-blocked until #1 lands** — relay the ask, then bump pin + build the "Results / What it produced" receipt section.

## Leverage now: LQ-AI PR #133 = `fc832ca` (matter reassignment + project-ownership validation)
Merged upstream. **Bump pin `35c8bb6 → fc832ca`, then `npm run gen:api`.** What it gives + the follow-up it unblocks:
- `project_id` is now on **`AutonomousScheduleUpdate` AND `AutonomousWatchUpdate`** → a schedule's/watch's **matter is reassignable via PATCH** (PATCH `project_id`→reassign · `project_id:null`→unassign · omit→unchanged). **So we can swap the read-only matter control in `ScheduleForm` AND `WatchForm` for an editable one** (drop the `editing` read-only branch for matter; keep KB read-only on watches — KB is still immutable).
- **New 404** on assigning an unowned `project_id` — now validated on POST `/schedules`, POST `/watches`, POST `/run-now`, AND the two PATCHes (id-probing-safe). Normal flow is a non-event (users pick their own matters), but the editable matter control should map a **404 → "matter not found / not yours"** rather than a generic error.
- Tiny follow-up slice ("editable matter on schedules+watches"): pin bump + gen:api → make matter editable in both forms (and `buildScheduleBody`/`buildWatchBody` already emit `project_id` on update — they just need the form to allow changing it + drop the read-only branch) → map the 404. ~1 small PR.

## Sequencing (user-confirmed) — pick at session start
F ✅ → G ✅ → **next:** run-output surfacing (upstream-blocked — relay `lq-ai-autonomous-run-output.md` first) **and/or** the **editable-matter** quick win (unblocked now by `fc832ca`) → **BYOK frontend** (unblocked, backend in-pin — full contract in [[donna-model-inference-settings]]) → **docs-polish** (About refresh + README/LICENSE Apache 2.0/acknowledgements, [[donna-docs-polish-milestone]]). Suggested: do the editable-matter quick win (or BYOK) while the output-surfacing upstream ask is in flight.

## Dev-stack + build-loop reminders (see [[donna-dev-stack]], [[donna-workflow]])
- **Shifted ports.** Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App http://localhost:13002 · API :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`. `arq-worker` runs the autonomous job + schedule-dispatcher + watch-dispatcher + idle-watchdog.
- **Rebuild `donna-web`** (`docker compose up -d --build donna-web`) before any manual/e2e check — stale container serves the old bundle.
- **Gate: `npm run check` = 0/0** is THE bar (vendor `ERR_MODULE_NOT_FOUND` stderr harmless). `npx vitest run` ~1100 green on `main`. `npm run lint`/`eslint .` has ~53 PRE-EXISTING errors — add **no new** ones (internal `<a href>` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on the line above the `href`).
- **Pin-bump recipe:** `cd vendor/lq-ai && git fetch && git checkout <sha>`; `npm run gen:api`; rebuild affected containers; `npm run check` + `npx vitest run`; update `docs/decisions/lq-ai-pin.md` bump log; commit on the feature branch.
- **Upstream-fix workflow:** the user runs a separate Claude Code on `LegalQuants/lq-ai`. Don't edit `vendor/lq-ai` directly — write the precise ask to `docs/upstream-requests/<name>.md`, hand it over, and on the merged SHA bump the pin.
