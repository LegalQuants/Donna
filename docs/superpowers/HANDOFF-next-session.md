# Donna — Handoff for the next session

**Date:** 2026-06-04 · **`main` @ `c8a8608`** · **Pin:** `vendor/lq-ai` @ `541bd6f`.

## Where things stand
The **Automations** surface (4th Workflows segment over LQ-AI's autonomous M4 layer) is being built in slices, each its own brainstorm→spec→plan→subagent-execute→whole-branch-Opus-review→PR loop. Shipped to `main`:
- **A+B — read-only viewer (PR #58):** Sessions list + per-session **receipt** (unified chronological phase/tool timeline + cost/terminal-reason) + notifications inbox. `src/lib/automations/*`, routes `/automations`, `/automations/[id]`, `/automations/notifications`.
- **C — run-now + opt-in (PR #59):** `autonomous_enabled` toggle on `/settings/preferences` + inline `AutomationsGate`; `/automations/new` run-now form (Playbook|Skill source + required target KB + optional matter + cost cap) → `POST /autonomous/run-now` → redirect to the live receipt; "Run now" button / gate on `/automations`.

**Specs/plans:** `docs/superpowers/{specs,plans}/2026-06-04-automations-sessions-receipt*` (A+B) and `…-automations-run-now-optin*` (C). Real-receipt + run-now spike artifacts under `docs/superpowers/plans/artifacts/`.

## Sequencing (user directive, 2026-06-04)
Finish the interactive Automations slices **F (schedules) → G (watches)**, then **BYOK / provider-keys**, then the **docs-polish** milestone. Each is its own slice/PR; the user reviews+merges each PR before the next (merge the prior PR, branch the next off updated `main`).

---

## NEXT: Slice F — Schedules (cron-triggered runs)

**The big win:** a schedule is **the run-now form minus the immediate spawn, plus a name, a cron expression, and an enabled toggle.** Reuse slice C's `RunNowForm`/`SourcePicker`/`KbPicker`/`MatterPicker` heavily. The **one genuinely net-new piece is the cron-expression input.**

### Contract (pin `541bd6f`, all present — no bump)
- `GET /api/v1/autonomous/schedules?enabled=` → list (`AutonomousScheduleRead[]` envelope — confirm shape via `gen:api` types).
- `POST /api/v1/autonomous/schedules` → 201 `AutonomousScheduleRead`. Body `AutonomousScheduleCreate`: **`cron_expr: string` (required)**, `name?`, `playbook_id?`, `skill_ref?`, `target_kb_id?`, `project_id?`, **`enabled: boolean`**, `max_cost_usd?`. Same "exactly one of playbook_id/skill_ref" rule as run-now; **invalid `cron_expr` → 422**.
- `PATCH /api/v1/autonomous/schedules/{id}` → edit (changing `cron_expr` re-validates → 422). `DELETE /{id}` → **200** (soft-delete).
- All require `autonomous_enabled` (the opt-in from slice C) → **403** otherwise. Per-user; cross-user id → 404.
- **Worker:** the `arq-worker` already runs `autonomous_schedule_dispatcher` (cron, top-of-minute) — schedules fire in dev with no new service.
- **cron:** **5-field** (minute hour day-of-month month day-of-week), parsed by in-repo `vendor/lq-ai/api/app/autonomous/cron.py::validate_cron_expr` (no `croniter` dep). Backend deliberately took no cron library.

### The cron input (the one design decision to brainstorm)
Options to put to the user (visual companion helps here):
- **Friendly builder + raw advanced:** presets ("Every day at 9:00", "Every weekday morning", "Every Monday", "First of the month") that emit the 5-field string, plus a raw 5-field input behind an "Advanced" toggle with live 422 validation. **Recommended.**
- Raw 5-field only (with inline help + the backend 422 surfaced) — simplest, least friendly.
- A fuller per-field builder (minute/hour/day/month/weekday selects) — more UI.
Donna's product voice = friendly; lean to the builder+advanced. A small pure `src/lib/automations/cron.ts` (presets ↔ 5-field, a light client-side shape check that mirrors the backend's field bounds; the backend stays the source of truth for 422) is the testable unit.

### Likely shape
- IA: a 4th view? No — Automations already has Sessions + Notifications sub-nav (`AutomationsNav`). Add **Schedules** (and later **Watches**) — brainstorm whether they become sub-nav tabs or a "Automations settings"-style area. Decide in brainstorm. Routes likely `/automations/schedules` (list + create) + edit.
- Reuse `RunNowForm`'s field cluster: extract the shared source+KB+matter+cost fields into a reusable sub-component if clean, OR compose. The schedule form adds: a **name** input, the **cron input**, an **enabled** toggle; drops the immediate "Run" (replaced by "Save schedule").
- List rows: name · cadence (humanize the cron) · source · enabled toggle (PATCH) · next_run_at (on `AutonomousScheduleRead`) · delete. Reuse the row/list patterns.
- Server: SSR `load` + form actions (`?/create`, `?/toggle`, `?/delete`) via `lqFetch`; `isAutonomousEnabled` gate (reuse `src/lib/automations/optin.server.ts`) → `AutomationsGate` when off.

### Spike (light)
No heavy spike needed (schedules don't spawn immediately). Optionally: `POST /schedules` with a valid + an invalid `cron_expr` to see the 201 vs 422 detail string, and confirm `AutonomousScheduleRead` fields (esp. `next_run_at`, `enabled`) via `gen:api` types.

---

## THEN: Slice G — Watches (KB-arrival-triggered runs)

**Mirrors F minus the cron** — bound to a knowledge base instead.

### Contract
- `GET /api/v1/autonomous/watches?enabled=&knowledge_base_id=` · `POST` (201) · `PATCH /{id}` · `DELETE /{id}` (→200). All `autonomous_enabled`-gated.
- Body `AutonomousWatchCreate`: **`knowledge_base_id: string` (required — the watched KB; must be an owned KB → 404 if not)**, `playbook_id?`, `skill_ref?`, `project_id?`, **`enabled: boolean`**, `max_cost_usd?`. **`knowledge_base_id` is IMMUTABLE on PATCH** (only enabled/source/etc. change).
- Triggered when a new document arrives in the watched KB (the watch's `knowledge_base_id`); the intake phase scopes to the arriving file.

### Likely shape
- Reuse the schedule form minus cron: source (Playbook|Skill) + the **watched KB** (`KbPicker`, required, immutable on edit) + optional matter + cost cap + enabled + a name (if `AutonomousWatchCreate` has `name?` — confirm). "Save watch."
- List + enable/disable/delete, mirroring F. Same gate/optin reuse.
- The KB-ownership 404 and the immutable-KB-on-edit are the two edges to handle.

---

## After F+G: BYOK, then docs-polish
- **BYOK / provider-keys** — 🟢 UNBLOCKED (lq-ai #7). Bump pin → **`29c1106`** → `gen:api` (typed `ProviderKeyStatus`, no hand-shim) → rebuild gateway → build the admin-gated provider-keys card on `/settings/models`. Full contract in memory **[[donna-model-inference-settings]]** (`/api/v1/admin/provider-keys` GET/POST/PATCH/DELETE; masked write-only input + status badge; hot-applied; env rows unrevokable→409; 400=no gateway master key).
- **Docs-polish** — About-page refresh (cover Automations + everything since) + README/LICENSE Apache 2.0/acknowledgements. Specific UI note captured in **[[donna-docs-polish-milestone]]** (move "Build and Learn with LQ-AI" to the top of `/about/lq-ai`).

---

## Dev-stack + build-loop reminders (see [[donna-dev-stack]], [[donna-workflow]])
- **Shifted ports.** Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App http://localhost:13002 · API :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`. The `arq-worker` already runs the autonomous session job + schedule-dispatcher + idle-watchdog crons.
- **Rebuild `donna-web` before FE e2e.** No pin bump for F/G (M4 is at `541bd6f`).
- **Gate: `npm run check` = 0/0** is THE bar (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npx vitest run` ~1000+ green. `npm run lint`/`eslint .` has ~53 PRE-EXISTING errors on `main` — add **no new** ones (internal `<a href>` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on the line directly above the `href=` line, `href` on the `<a` line).
- **Build loop:** brainstorm (visual companion for the cron UI) → spec → plan → **subagent-driven execute** (fresh subagent per task; per-task spec review then code-quality review; fix→re-review) → **whole-branch Opus review** (it consistently catches real integration bugs — e.g. slice A's stale-session-on-nav, slice C's kbs-envelope/`max_cost_usd` gaps) → `finishing-a-development-branch` → PR. Sync the plan doc when a review changes the executed code.
- **Reuse map for F/G:** `src/lib/automations/{optin.server.ts (isAutonomousEnabled), AutomationsGate.svelte, SourcePicker.svelte, RunNowForm.svelte, runNow.ts (toPlaybookItems/toSkillItems)}`, `src/lib/matters/{MatterPicker, knowledge/KbPicker (has a `triggerLabel` prop)}`, the `/settings/preferences` opt-in, the `/automations` sub-nav (`AutomationsNav`).

## Key references
- Contract: regenerate via `npm run gen:api`; autonomous surface `src/lib/api/backend.d.ts` (search `autonomous`); `AutonomousScheduleCreate`/`AutonomousWatchCreate`/`AutonomousScheduleRead`/`AutonomousWatchRead`.
- Behavior: `vendor/lq-ai/docs/autonomous-layer.md` (schedules §"in-repo cron"; watches; the R4–R6 brakes). cron parser: `vendor/lq-ai/api/app/autonomous/cron.py`. Handlers: `vendor/lq-ai/api/app/api/autonomous.py` (`create_schedule` ~1040; watch handlers nearby).
- Scope origin: `docs/roadmap/autonomous-workflows-scope.md` (slices F/G rows). Memory: [[donna-autonomous-workflows-scope]] [[donna-phase-status]] [[donna-product-direction]].
