# Automations — Slice G: Watches (KB-arrival-triggered runs)

**Date:** 2026-06-04 · **Branch:** `feat/automations-watches` · **Pin:** `vendor/lq-ai` @ `35c8bb6` (no bump) · **Prior slices:** A+B (#58), C (#59 run-now+opt-in), F (#60 schedules).

## Summary
Add the ability to **watch** a knowledge base: a watch fires an autonomous run **every time a new document arrives** in the watched KB. A watch is the schedule config **minus cron, minus name**, bound to a **required, immutable knowledge base**. The existing `arq-worker` dispatcher fires watches — no new service. This slice is the user-facing CRUD over the autonomous **watches** layer; it heavily mirrors slice F (schedules).

## Goals
- List / create / edit / enable-disable / delete watches, gated on the slice-C `autonomous_enabled` opt-in.
- Make the **recurring-fire + cost** behavior explicit (user directive): lead copy "Runs every time a new document is added to this knowledge base," with the per-run **cost cap emphasized as the safety control**.
- Heavy reuse of slice F's components/patterns; no regression to shipped schedule/run-now code.

## Non-goals
- The run's **output/work-product surfacing** — that's the next slice after G ([[donna-automations-output-surfacing]]).
- Any backend/dispatcher change (the contract is fully present at the pin).
- KB-sharing (watches require an **owned** KB; sharing is out of scope upstream).

---

## Backend contract (pin `35c8bb6`, all present — no bump)
Generated types in `src/lib/api/backend.d.ts` (`AutonomousWatchRead`/`Create`/`Update`/`ListResponse`).

- `GET /api/v1/autonomous/watches?enabled=&knowledge_base_id=` → **`AutonomousWatchListResponse`** `{ watches: AutonomousWatchRead[], total_count, limit, offset }` (envelope).
- `POST /api/v1/autonomous/watches` → 201 `AutonomousWatchRead`. Body **`AutonomousWatchCreate`**:
  - `knowledge_base_id: string` (**required**; must be an **owned** KB → **404** otherwise)
  - exactly one of `playbook_id?: uuid` / `skill_ref?: string` (zero or both → 422, same rule as run-now/schedule)
  - `project_id?: uuid`, `enabled: boolean` (default `true`), `max_cost_usd?: string`
- `PATCH /api/v1/autonomous/watches/{watch_id}` → **`AutonomousWatchUpdate`** = `enabled?`, `playbook_id?`, `skill_ref?`, `max_cost_usd?` **only**. **`knowledge_base_id` and `project_id` are immutable** (absent from Update) — a watch is bound to its KB and matter.
- `DELETE /api/v1/autonomous/watches/{watch_id}` → **200** (soft-delete; re-delete → 404).
- **All require `autonomous_enabled`** → **403** otherwise. Per-user; cross-user id → **404**.
- **No GET-single** endpoint (`/watches/{watch_id}` exposes only PATCH + DELETE) — the edit page loads the list and finds by id.
- **`AutonomousWatchRead`** fields used: `id`, `knowledge_base_id`, `playbook_id?`, `skill_ref?`, `project_id?`, `enabled`, `max_cost_usd?`, `created_at`, `updated_at`. **No `name`, no `next_run_at`/`last_run_at`** (event-triggered).
- **Trigger semantics:** when a new document arrives in the watched KB, the intake phase scopes the run to the arriving file.

### Deltas from slice F (schedules)
| | Schedule (F) | Watch (G) |
|---|---|---|
| Trigger | `cron_expr` (time) | KB-arrival (event) — **no cron** |
| KB | `target_kb_id` optional | `knowledge_base_id` **required + immutable** |
| Name | optional | **none** |
| Cadence/next-run on row | yes | **none** (event-triggered) |
| Matter on edit | immutable (read-only) | immutable (read-only) — same |

---

## IA & routes
Add **"Watches"** as the **4th tab** in `AutomationsNav` → **Sessions · Schedules · Watches · Notifications**.
- **`/automations/watches`** — list + inline "New watch" create form (mirrors `/automations/schedules`).
- **`/automations/watches/[id]`** — edit page (PATCH).

---

## Components & reuse
Compose existing standalone components — do **not** modify shipped F/run-now files:

- **`WatchForm.svelte`** — fields: `SourcePicker` (Playbook|Skill), `KbPicker` (**required** — the watched KB), `MatterPicker` (optional matter/`project_id`), cost-cap input, enabled toggle. CTA **"Save watch."**
  - **Fire + cost emphasis (user directive):** a lead line *"Runs every time a new document is added to this knowledge base."* The **cost cap is presented as the emphasized safety control** — its own visually-distinct block with helper text (e.g. "Caps spend per run — recommended for watches, since they fire on every new document"). Not forced (backend `max_cost_usd` optional → falls back to the config default), but prominent and recommended.
  - **`canSave` = a source is chosen AND `knowledge_base_id` is set.** (KB required, unlike F.)
  - **Edit mode** (`initial` present): KB rendered **read-only** ("Watching: {KB name} · set at creation"); matter rendered **read-only** (both immutable per `AutonomousWatchUpdate`). Only source / cost cap / enabled are editable. Seed local state once via `untrack` (F's pattern). The KB-name resolves from the loaded `kbs` list.
- **`WatchList.svelte` / `WatchRow.svelte`** — row title = **watched KB name** (resolved from `kbs`, falls back to the id if absent); subtitle = source label · "watches for new documents"; **enabled** toggle (PATCH `?/toggle`); **two-step Delete** confirm (reuse F's pattern). No cadence/next-run. Empty state seeds examples reinforcing the framing (e.g. "Auto-summarize every contract dropped into a knowledge base").
- Reuse as-is: `AutomationsGate`, `optin.server` (`isAutonomousEnabled`), `unread.server` (`unreadCount`), `SourcePicker`, `KbPicker` (`triggerLabel` reflects selection), `MatterPicker`, `runNow` (`toPlaybookItems`/`toSkillItems`), `$lib/server/loadJson` (`jsonOr`).

---

## `src/lib/automations/watches.ts` (the testable unit)
Pure module, no network:
- **`WatchSummary`** — `{ id, knowledge_base_id, playbook_id|null, skill_ref|null, project_id|null, max_cost_usd|null, enabled }`.
- **`parseWatch`/`parseWatchList`** — defensive (mirrors `schedules.ts`); list reads the `{ watches: [...] }` envelope or a bare array; `parseWatch` returns null unless `id` and `knowledge_base_id` are strings.
- **`buildWatchBody(form: FormData)`** — `{ ok: true; body } | { ok: false }`. Requires (exactly-one source for the mode) **AND** `knowledge_base_id`. Emits `knowledge_base_id`, `playbook_id`|`skill_ref`, `enabled`, optional `max_cost_usd`, and `project_id` **only in create mode** (omit on update, since it's immutable). The action passes a `mode: 'create' | 'update'` (or the update action strips `project_id`/`knowledge_base_id` from the body).
- **`sourceLabel`** — generalize F's helper to accept any `{ playbook_id, skill_ref }` source (shared shape used by both schedules and watches; small refactor of `schedules.ts::sourceLabel` to a shared signature, OR a parallel watch helper — implementer's call, keep it DRY without disturbing F's tests). Plus **`kbLabel(watch, kbs)`** for the row title.

---

## Server, error handling
- `/watches/+page.server.ts` `load`: `isAutonomousEnabled` gate → gate-only shape (`{ autonomousEnabled:false, unread:0, watches:[], …libs:[] }`, 1 fetch) when off. Else `Promise.all` of `unreadCount`, `GET /watches`, playbooks, user-skills, builtins, knowledge-bases, projects. 502 if watches fetch fails; libraries degrade via `jsonOr`.
- Actions (via `lqFetch`):
  - `?/create` → `POST /watches`; **404 → form error "That knowledge base isn't available."**; 403 → gate; 422 → field error; success → `{ created: true }`.
  - `?/toggle` → `PATCH /watches/{id}` `{ enabled }`.
  - `?/delete` → `DELETE /watches/{id}`.
- `/watches/[id]/+page.server.ts` `load`: 403 if opted out; find the watch by `params.id` in the list (404 if absent); load libraries + `unreadCount` for the nav badge. `update` action → `PATCH /watches/{id}` with **only `enabled`/source/`max_cost_usd`** (no KB/matter); 404/403/422 mapped; success → 303 `/automations/watches`.
- Error mapping mirrors F: 422 → inline (cron-equivalent here is the source rule), 403 → gate, 404 → not-found/form error, generic → form-level.

---

## Copy / example use-cases (UI)
Reinforce the framing in the empty state (and carry into the docs-polish About refresh):
- "**Auto-summarize** every contract dropped into a knowledge base."
- "Run a **risk-review skill** on each new document as it arrives."
- Lead copy in the form: "Runs every time a new document is added to this knowledge base."

---

## Testing & quality bar
- **`watches.ts`** unit: parse (envelope + bare array + null guards), `buildWatchBody` (required KB + source rule, create-vs-update `project_id` handling, `max_cost_usd` numeric guard), `sourceLabel`/`kbLabel`.
- Component tests: `WatchForm` (KB-required gating, create emits `knowledge_base_id`, edit read-only KB+matter + cost emphasis present), `WatchList`/`WatchRow` (KB-name title, toggle negation, two-step delete, empty state).
- Action tests: create/toggle/delete + 404(KB)/403 paths; gate-off shape; edit find-by-id 404 + update 303.
- **Bar:** `npm run check` **0/0**, `npx vitest run` green, **no new** eslint errors (internal `<a href>` need the `svelte/no-navigation-without-resolve` disable-next-line directly above the `href` line).

## Build loop (per `[[donna-workflow]]`)
spec → plan → subagent-driven execute (fresh subagent per task; per-task spec + code-quality review) → whole-branch Opus review → `finishing-a-development-branch` → PR. Rebuild `donna-web` before any manual check. Sync this spec + the plan if a review changes executed code.
