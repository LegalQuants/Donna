# Autonomous workflows — implementation scoping (Donna)

**Scoped:** 2026-06-04 · **Pin at scoping:** `vendor/lq-ai` @ `541bd6f` · **Status:** analysis only, nothing built.
**Purpose:** seed a build plan for the **4th Workflows segment** (Skills · Playbooks · Prompts · **Automations**).
Not necessarily for v0.10 — captured so the next session can plan it cleanly. See `donna-future-roadmap.md`
(this supersedes its pre-backend checklist) and the `donna-autonomous-workflows-scope` project memory.

> **Re-verify first.** These findings are at pin `541bd6f`. Before building, bump to the current pin if
> newer, `npm run gen:api`, and re-confirm the contract (esp. the loosely-typed bits below).

## TL;DR

A **clean extension of the Workflows IA**, not a re-architecture. LQ-AI's autonomous API (shipped v0.4.0)
is fully typed at this pin in `src/lib/api/backend.d.ts:6842-9158`; behavior in
`vendor/lq-ai/docs/autonomous-layer.md` + `vendor/lq-ai/api/app/api/autonomous.py`. **~8 PR-sized slices
(~1 L + 4 M + 3 S).** The biggest gift: **runs POLL, not stream** → reuse Donna's existing poll loops
(`src/lib/playbooks/runFlow.svelte.ts`, `src/lib/tabular/runPoll.svelte.ts`), no new SSE plumbing.

## Critical behavioral facts (answer several old roadmap questions)

- **Runs poll; no SSE.** A session is an arq job running a 5-phase LangGraph
  (intake → analysis → drafting → ethics*review → delivery) to a terminal status; callers poll
  `GET /sessions/{id}`. (`autonomous-layer.md:89`.) \_Old checklist #4 → answered: poll, not SSE.*
- **No human-in-the-loop / resume / `needs_input`.** A session runs to completed/halted/failed; the only
  live control is `POST /sessions/{id}/halt` (the R5 brake). _Old #6 → answered: not needed._
- **Notifications are the report-back channel** (poll `GET /notifications?unread=true`; the `delivery`
  phase writes a durable `in_app` notification + best-effort email). No push/SSE.
- **Gating is per-user opt-in, NOT admin.** Read + halt = any `ActiveUser`. **All mutate/spawn endpoints
  require `AutonomousEnabledUser` → 403 until the user's `autonomous_enabled` flag is on (off by default)**
  (`autonomous.py:45-47`). _Old #9 → answered: not admin-gated, but an opt-in gate exists._
- **Worker:** the arq `autonomous_worker` + an R5 idle-watchdog cron must run in local dev (Donna already
  runs `arq-worker`/`ingest-worker` — confirm autonomous jobs share that worker). _Old #10._
- Per-user isolation everywhere; cross-user IDs → **404**. Soft-deletes return **200** (not 204).
- **Three brakes** (the "brakes" from the How-It-Works playground): R4 economic (cost cap), R5 temporal
  (external halt + idle watchdog), R6 contextual; `terminal_reason` explains the stop.

## API surface (pin `541bd6f`, `backend.d.ts:6842-9158`)

| Family                        | Endpoints                                                                                                                                            | Notes                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Sessions**                  | `GET /sessions` (list) · `GET /sessions/{id}` (detail + **receipt**) · `POST /sessions/{id}/halt`                                                    | halt idempotent; receipt is the transparency payload |
| **Memory**                    | `GET /memory?state=proposed\|kept\|dismissed` · `POST /memory/{id}/keep` (edit-on-keep) · `POST /memory/{id}/dismiss` · `DELETE /memory/{id}` (→200) | review queue                                         |
| **Precedents**                | `GET /precedents?pattern_kind=` · `POST /{id}/dismiss` · `POST /{id}/promote` → proposal                                                             | promote = propose only (no write)                    |
| **Project-context proposals** | `GET /project-context-proposals?state=&project_id=` · `POST /{id}/accept` (appends `suggested_md` to a Project's `context_md`) · `POST /{id}/reject` | the authorized write into Projects                   |
| **Schedules**                 | `GET /schedules?enabled=` · `POST` (5-field `cron_expr`, 422 invalid) · `PATCH /{id}` · `DELETE /{id}` (→200)                                        | cron-triggered run defs                              |
| **Watches**                   | `GET /watches?enabled=&knowledge_base_id=` · `POST` (owned KB, 404 if not) · `PATCH /{id}` (`knowledge_base_id` immutable) · `DELETE /{id}` (→200)   | KB-arrival-triggered                                 |
| **Notifications**             | `GET /notifications?unread=true` · `POST /{id}/read` (idempotent)                                                                                    | report-back                                          |
| **Run-now**                   | `POST /run-now` — exactly one of `playbook_id`/`skill_ref` (zero/both → 422); 403 if not opted-in                                                    | spawns one `manual` session                          |

**Typed enums (free):** session `trigger_kind` (watch/schedule/suggestion/manual), `current_phase`
(intake/analysis/drafting/ethics_review/delivery), `halt_state` (running/halt_requested/halted/paused),
`status` (running/completed/halted/failed); notification `channel` (in_app/email/webhook).

**Loosely-typed → hand-type + parse (DE-330 pattern, like tabular `source_*`/`verification_method`):**

- `AutonomousSessionDetailResponse.receipt` = `{[k]:unknown}` (`backend.d.ts:9155`) — **the load-bearing
  transparency payload.** Doc enumerates it (session_id, trigger_kind, status, halt_state, current_phase,
  costs, `phase_transitions[]`, `tool_calls[]`, `terminal_reason`) but **none is typed.** Hand-type;
  consider an upstream ask to type it.
- `AutonomousSessionRead.params` / `.result` untyped; `AutonomousNotificationRead.payload`
  (`{[k]:unknown}|null`, `backend.d.ts:9073`) — "counts/IDs + a receipt link, never raw values."
- `pattern_kind` / memory category are bare `string` (no enum). `max_cost_usd` is `string|null` (Decimal)
  on run-now but `number` on `AutonomousSessionRead` — handle in inputs/display.

## Suggested PR slices (minimal-useful first)

| #     | Slice                              | Size    | Scope                                                                                                                                                                                                | Main risk / unknown                                                                                            |
| ----- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **A** | **Sessions + receipt** (read-only) | **L**   | Add `automations` to `WorkflowsNav` + hub card; `/automations` SSR list of sessions + a session-detail **receipt** view (phase timeline, tool calls, cost, `terminal_reason`). **No opt-in needed.** | Hand-type the untyped `receipt`; net-new transparency UI (no Donna analog) → spike the real receipt JSON first |
| **B** | Notifications inbox                | **S**   | list + mark-read + poll-based unread badge                                                                                                                                                           | untyped `payload`; poll cadence + receipt deep-link target                                                     |
| **C** | Run-now (manual one-off)           | **M**   | skill/playbook picker (reuse skills/playbooks libs) + cost-cap input → `POST /run-now` → poll spawned session → link to its receipt (A)                                                              | **first mutate slice → first hits the `autonomous_enabled` 403 opt-in (see blockers)**                         |
| **D** | Memory review                      | **S/M** | state-filtered list + keep (edit-on-keep) / dismiss / delete                                                                                                                                         | clean CRUD; delete →200                                                                                        |
| **E** | Precedents + proposals             | **M**   | list/dismiss/promote → proposal accept/reject (accept writes a Project's `context_md`)                                                                                                               | couples to Projects; two-step proposal UX                                                                      |
| **F** | Schedules                          | **M**   | create/edit/enable/disable/delete with a **cron-expression** input + 422 handling                                                                                                                    | cron input is net-new for Donna (friendly builder vs raw 5-field)                                              |
| **G** | Watches                            | **S/M** | create/edit/enable/disable/delete bound to an owned KB                                                                                                                                               | KB-ownership 404; mirrors F                                                                                    |
| **H** | Halt + live-poll polish            | **S**   | halt button on running sessions; fold the poll-to-terminal loop into A/C                                                                                                                             | poll cadence / when to stop                                                                                    |

**Three genuinely new concerns** vs Donna's CRUD trio (Skills/Playbooks/Prompts): the **receipt /
transparency view** (A), **cron inputs** (F), and the **opt-in 403 gate** (C/F/G). Everything else maps
onto existing Donna substrate (SSR `load` + form actions, the rune-controller pattern à la
`src/lib/skills/attach.svelte.ts`, client poll loops, modal/a11y, BFF-proxy-only-when-needed).

## Blockers / spikes to resolve before the _interactive_ slices

1. **Where does a user flip `autonomous_enabled`?** Mutate endpoints 403 until it's on, but **no endpoint
   in the autonomous surface sets it.** Find the toggle (likely a `/settings` or users endpoint, possibly
   admin-only) — **gates C/F/G.** If there's no self-serve toggle, that's a small upstream ask. (A + B
   need no opt-in.)
2. **Capture a real `receipt`** — hit `GET /sessions/{id}` on a completed session and record the literal
   `receipt` + `phase_transitions[]`/`tool_calls[]` element shapes before building A.
3. **Confirm poll-only holds** at the current pin (no resume/`needs_input` snuck in); tune the poll
   timeout vs a typical session runtime (cf. `runFlow` 2s / `tabular/runPoll`).
4. **`skill_ref` exact format** for run-now/schedules/watches (slug? built-in `created_by IS NULL` vs
   owned) — confirm against the skills list so the picker passes the right string.
5. **Notification `payload` shape + receipt deep-link** so B can route into A.
6. **Local worker** — confirm the autonomous arq worker (+ idle-watchdog cron) runs with the dev stack.

## Recommendation

Smallest valuable increment = **Slice A alone** (read-only Sessions + receipt) — no opt-in, no cron, no
mutate; it delivers the whole "see exactly what the agent did, what it cost, why it stopped" transparency
thesis. Then **B** (notifications, the report-back loop), then **C** (run-now, first interactive). Resolve
blocker #1 (opt-in) before committing to C/F/G. Each slice: brainstorm → spec → plan → subagent-driven
execute → whole-branch Opus review → PR.

## Key references

- Contract: `src/lib/api/backend.d.ts:6842-9158` · gating: `vendor/lq-ai/api/app/api/autonomous.py:45-47`
- Behavior: `vendor/lq-ai/docs/autonomous-layer.md`
- Extension points: `src/lib/workflows/WorkflowsNav.svelte`, `src/routes/(app)/workflows/+page.svelte`
- Poll pattern to reuse: `src/lib/playbooks/runFlow.svelte.ts`, `src/lib/tabular/runPoll.svelte.ts`
- Roadmap context: `docs/roadmap/donna-future-roadmap.md`
