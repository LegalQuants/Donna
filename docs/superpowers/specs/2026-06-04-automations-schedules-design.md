# Automations — Slice F: Schedules (cron-triggered runs)

**Date:** 2026-06-04 · **Branch:** `feat/automations-schedules` · **Pin:** `vendor/lq-ai` @ `541bd6f` (no bump) · **Prior slices:** A+B (#58, read-only viewer), C (#59, run-now + opt-in).

## Summary
Add the ability to **schedule** autonomous runs on a recurring cadence. A schedule is the run-now config (source + KB + matter + cost cap) **minus the immediate spawn**, **plus** a name, a 5-field cron expression, and an enabled toggle. The existing `arq-worker` already runs `autonomous_schedule_dispatcher` (cron, top-of-minute), so schedules fire in dev with no new service. This slice is the user-facing CRUD over the backend's autonomous schedules layer.

## Goals
- List / create / edit / enable-disable / delete schedules, gated on the slice-C `autonomous_enabled` opt-in.
- A **friendly cron input** (presets + raw advanced) — the one genuinely net-new UI piece.
- Heavy reuse of slice C's pickers; no regression to the shipped run-now form.

## Non-goals
- Watches (KB-arrival triggers) — that's slice G, mirrors this minus the cron.
- Any change to the dispatcher / backend (the contract is fully present at the pin).
- A general-purpose arbitrary-cron humanizer (see Cadence display).

---

## Backend contract (pin `541bd6f`, all present — no bump)
The vendor working tree is clean at the pin and `app/schemas/autonomous.py` already defines every field below. **The checked-in `src/lib/api/backend.d.ts` is stale** (missing `max_cost_usd` on `AutonomousScheduleCreate`/`Update`) — so **the first plan task is `npm run gen:api`** to make the surface typed.

- `GET /api/v1/autonomous/schedules?enabled=` → **`AutonomousScheduleListResponse`** `{ schedules: AutonomousScheduleRead[], total_count, limit, offset }` (envelope, not a bare array).
- `POST /api/v1/autonomous/schedules` → 201 `AutonomousScheduleRead`. Body **`AutonomousScheduleCreate`**:
  - `cron_expr: string` (**required**) — 5-field (minute hour day-of-month month day-of-week), validated by `app/autonomous/cron.py::validate_cron_expr`; invalid → **422**.
  - `name?: string`
  - exactly one of `playbook_id?: uuid` / `skill_ref?: string` (zero or both → 422, same rule as run-now)
  - `target_kb_id?: uuid`, `project_id?: uuid`
  - `enabled: boolean` (default `true`)
  - `max_cost_usd?: Decimal` — per-schedule spend cap (NULL → backend `autonomous_default_max_cost_usd` at spawn).
- `PATCH /api/v1/autonomous/schedules/{id}` → **`AutonomousScheduleUpdate`** (all optional: `name`, `cron_expr`, `enabled`, `playbook_id`, `skill_ref`, `target_kb_id`). Changing `cron_expr` re-validates → 422 and recomputes `next_run_at`.
- `DELETE /api/v1/autonomous/schedules/{id}` → **200** (soft-delete; `deleted_at` set).
- **All require `autonomous_enabled`** (slice-C opt-in) → **403** otherwise. Per-user; cross-user id → **404**.
- **`AutonomousScheduleRead`** fields used: `id`, `name?`, `cron_expr`, `playbook_id?`, `skill_ref?`, `target_kb_id?`, `enabled`, `last_run_at?`, `next_run_at?`, `created_at`, `updated_at`.

---

## IA & routes
Add **"Schedules"** as a **3rd tab** in `AutomationsNav` (Watches becomes the 4th in slice G):
`/automations` (Sessions) · `/automations/notifications` · **`/automations/schedules`**.

- **`/automations/schedules`** — list + a "New schedule" affordance opening the create form **inline on the page** (consistent with the list-centric Automations views; avoids an extra route). The form collapses/expands; on success it re-loads the list.
- **`/automations/schedules/[id]`** — edit page (PATCH) for an existing schedule.

(Decision: inline create over a `/schedules/new` route. Edit gets its own `[id]` route because it's deep-linkable from a row.)

---

## Components & reuse
Compose the existing **standalone** pickers directly — **do not refactor the shipped `RunNowForm`** (keeps run-now's tests/behavior intact):

- **`ScheduleForm.svelte`** — fields: `SourcePicker` (Playbook|Skill), `KbPicker` (`triggerLabel` prop), `MatterPicker` (optional matter/`project_id`), reused cost-cap input (`max_cost_usd`), **name** input, **`CronInput`**, **enabled** toggle. Primary CTA = **"Save schedule"**. Used by both the inline create and the `[id]` edit page (create vs update mode).
- **`CronInput.svelte`** — preset chips that fill the cron + an **"Advanced"** disclosure containing a raw 5-field monospace input. Shows a **live humanized preview** (`describeCron`) and surfaces the backend **422** detail when present. Light client-side `looksValid` feedback only.
- **`ScheduleList.svelte` / `ScheduleRow.svelte`** — row = **name** · **cadence** (`describeCron`) · **source** (playbook/skill label) · **enabled** toggle (PATCH `?/toggle`) · **`next_run_at`** · **delete**. Mirrors `SessionList`/`SessionRow` markup + the existing row/list patterns. Empty state with example ideas (see Copy).
- Reuse: `optin.server.ts` (`isAutonomousEnabled`), `AutomationsGate.svelte`, `runNow.ts` source-item helpers (`toPlaybookItems`/`toSkillItems`) where the source picker needs them.

---

## `src/lib/automations/cron.ts` (the testable unit)
Pure module, no network:
- **`PRESETS`** — labeled friendly presets ↔ 5-field strings:
  - "Every day at 9:00" → `0 9 * * *`
  - "Every weekday at 9:00" → `0 9 * * 1-5`
  - "Every Monday at 9:00" → `0 9 * * 1`
  - "First of the month at 9:00" → `0 9 1 * *`
- **`describeCron(expr): string`** — **preset reverse-map**: exact match → the friendly label; otherwise the raw 5-field string. Used in rows and the input preview. (No arbitrary-cron→English parser — `next_run_at` from the backend supplies the concrete next-run time.)
- **`looksValid(expr): boolean`** — light 5-field bounds check mirroring `cron.py`'s field ranges, for early UX feedback only. **The backend 422 remains the source of truth.**

---

## Server, error handling
- SSR `+page.server.ts` `load`: `isAutonomousEnabled` gate first → if off, render `AutomationsGate` (no list fetch). Else `GET /schedules` via `lqFetch`, return `schedules`.
- Form actions via `lqFetch`:
  - `?/create` → `POST /schedules`; on 422 return the cron detail to the form; on success re-load.
  - `?/toggle` → `PATCH /schedules/{id}` `{ enabled }`.
  - `?/delete` → `DELETE /schedules/{id}`.
  - Edit page `?/update` → `PATCH /schedules/{id}` (incl. `cron_expr` re-validation surfacing 422).
- Error mapping: **422** → inline field error (cron/source rules); **403** → gate (opt-in turned off mid-session); **404** → not-found; generic → form-level error message. Follow slice C's action error conventions.

---

## Copy / example use-cases (UI empty state + docs)
The framing: **a schedule takes over a recurring administrative chore and makes the user's life easier.** Surface concrete, evocative examples — in the **list empty state** and carried into the **docs-polish** About refresh. The valuable output is a **well-formatted markdown document** (a deck is just one nice-to-have shape, not the point). Examples to seed:
- **Weekly summary:** drop documents into a knowledge base across the week, then a scheduled playbook/skill produces a **well-formatted weekly summary document** every Friday.
- **Dashboard / digest document:** a recurring run that regenerates a **dashboard or digest document** from the latest KB contents.
- **Other admin chores:** any standing "every week I have to compile/review/report X" task — the example copy should make the user picture *their* recurring chore being handled for them.
- **Slide deck (nice-to-have):** if a built-in playbook/skill can emit deck-style output, a scheduled "weekly deck" is a fun example — but it's optional flavor, not required. **To verify** before promising it in copy; otherwise a well-formatted markdown document is the headline output.

---

## Testing & quality bar
- **`cron.ts`** unit: presets round-trip (label↔expr), `describeCron` (preset hit + raw fallback), `looksValid` bounds.
- Component tests: `CronInput` (preset fill, advanced toggle, preview, 422 surface), `ScheduleForm` (create/edit modes, source-exactly-one rule), `ScheduleList`/`ScheduleRow` (cadence render, toggle, delete, empty state).
- Action tests: create/toggle/delete + 422 / 403 paths; gate-off renders `AutomationsGate`.
- **Bar:** `npm run check` **0/0** (vendor `ERR_MODULE_NOT_FOUND` stderr harmless), `npx vitest run` green, **no new** eslint errors (internal `<a href>` need the `svelte/no-navigation-without-resolve` disable-next-line directly above the `href` line).

## Build loop (per `[[donna-workflow]]`)
spec → plan → subagent-driven execute (fresh subagent per task; per-task spec review + code-quality review; fix→re-review) → **whole-branch Opus review** → `finishing-a-development-branch` → PR. Sync this spec + the plan doc if a review changes executed code.
