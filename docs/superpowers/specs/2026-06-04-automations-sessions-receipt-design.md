# Automations — Sessions + Receipt and Notifications (Slices A + B)

**Date:** 2026-06-04 · **Pin:** `vendor/lq-ai` @ `541bd6f` (contract re-confirmed; `gen:api` clean, no drift) · **Status:** design approved, ready to plan.

The 4th **Workflows** segment — **Automations** — over LQ-AI's `/api/v1/autonomous/*` surface. This spec covers **Slice A** (read-only Sessions list + receipt detail) and **Slice B** (Notifications inbox). Slices C–H are documented as a forward roadmap (§10) but **not built** here.

Supersedes the open questions in `docs/roadmap/autonomous-workflows-scope.md` — every blocker that doc flagged is resolved below. See also memory `donna-autonomous-workflows-scope`.

---

## 1. Goal & non-goals

**Goal.** Deliver the transparency thesis of the autonomous layer — _"see exactly what the agent did, what it cost, and why it stopped"_ — as a clean 4th segment in Donna's existing Workflows IA, plus the report-back inbox. Both slices are **read-only** and require **no `autonomous_enabled` opt-in**, so they ship with zero upstream dependencies.

**Non-goals (explicitly out of scope for A + B):**

- No halt button (slice H).
- No run-now / session spawn (slice C).
- No schedules, watches, memory review, or precedents/proposals (slices D–G).
- No opt-in toggle UI. A brand-new user with `autonomous_enabled=off` and zero sessions sees a **friendly explainer** empty state, not a settings control. (The toggle endpoint is known — §10 — but building it belongs with the first mutate slice.)

---

## 2. Contract re-confirmation (pin `541bd6f`)

Re-ran `npm run gen:api` at the current pin: **zero diff** — committed `src/lib/api/backend.d.ts` matches the pin. The autonomous surface is present at `backend.d.ts:6842–8144` (7 resource families + run-now). Every scope-doc blocker is now resolved at the contract/source level:

| Blocker (scope doc)                             | Resolution                                                                                                                                                                            | Source                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| #1 Where does a user flip `autonomous_enabled`? | `GET`/`PATCH /api/v1/users/me/preferences` `{ autonomous_enabled?: boolean }` → echoes `autonomous_enabled: boolean`. **Self-serve, not admin.**                                      | `vendor/lq-ai/api/app/api/users.py:274` · `backend.d.ts:9328,9346` |
| #2 Receipt exact shape                          | Fixed-key dict from `build_receipt`; **can be `null`** (`build_receipt_safe` returns `None` on build failure).                                                                        | `vendor/lq-ai/api/app/autonomous/receipt.py:32,149`                |
| #5 Notification → receipt deep-link             | `AutonomousNotificationRead` carries a **typed top-level `session_id`** (no `payload` parsing needed).                                                                                | `vendor/lq-ai/api/app/schemas/autonomous.py`                       |
| #6 Worker runs in dev?                          | `autonomous_session_job` + idle-watchdog + schedule-dispatcher crons are registered in `app.workers.arq_setup.WorkerSettings` — run by the existing **`arq-worker`** compose service. | `vendor/lq-ai/api/app/workers/arq_setup.py:43–56,178–206`          |

**Standing note:** these findings hold at pin `541bd6f`. On any pin bump, re-`gen:api` and re-confirm the loosely-typed `receipt` (the only DE-330 hand-type here).

---

## 3. Information architecture

- `src/lib/workflows/WorkflowsNav.svelte` gains a 4th segment so the pill bar reads **Skills · Playbooks · Prompts · Automations** (extend the `Tool` union + `segments` array). A matching hub card is added to `src/routes/(app)/workflows/+page.svelte`.
- **Product voice:** the segment is labelled **Automations** (friendly, Donna-voice). The word "autonomous" is reserved for explanatory page copy where the transparency story is told.
- **Within Automations**, an inner sub-nav scopes the two views and keeps the global nav clean:
  - **Sessions** (default) — `/automations`
  - **Notifications `[n]`** — `/automations/notifications` (unread count badge lives here, not on the global nav)
- **Receipt detail** — `/automations/[id]`.

Routes are top-level under `(app)`, consistent with `/skills`, `/playbooks`, `/prompts`.

---

## 4. Data model — the one DE-330 hand-type

Session list/detail fields and notification fields are **fully typed by `gen:api`** and used as-is from `backend.d.ts` (`AutonomousSessionRead`, `AutonomousNotificationRead`, and the typed enums `TriggerKind`, `Phase`, `HaltState`, `SessionStatus`, `NotificationChannel`). The **only** untyped payload is the session `receipt`. Its exact shape is taken from the builder source (authoritative — better than a single live sample):

```ts
// src/lib/automations/types.ts
export interface PhaseTransition {
	to_phase: string | null;
	timestamp: string | null; // ISO
}
export interface ToolCall {
	tool: string | null;
	outcome: string | null;
	timestamp: string | null; // ISO
	cost_usd?: number | null; // present only when the audit row carried it
}
export interface Receipt {
	session_id: string;
	trigger_kind: string;
	status: string | null;
	halt_state: string | null;
	current_phase: string | null;
	cost_total_usd: number | null; // builder defaults to 0.0
	max_cost_usd: number | null;
	cost_cap_reached: boolean;
	created_at: string | null;
	completed_at: string | null;
	phase_transitions: PhaseTransition[];
	tool_calls: ToolCall[];
	terminal_reason: string | null; // completed | cost_cap_reached | external_halt | idle_timeout | <halt reason> | null
}
```

`src/lib/automations/parseReceipt.ts` exposes `parseReceipt(input: unknown): Receipt | null`, following the `parseTabularResults` discipline:

- coerce Decimal-as-string costs (`cost_total_usd`, `max_cost_usd`, `cost_usd`) to `number`;
- default `phase_transitions` / `tool_calls` to `[]`;
- guard every field (tolerate missing/extra keys);
- return `null` when the receipt is absent — **a real UI state** (build failure), not an error.

> The detail endpoint exposes the live-reconstructed `receipt`; the list rows render the typed top-level session scalars (`status`, `trigger_kind`, `current_phase`, `cost_total_usd`) and need no parsing.

---

## 5. Data flow & components

Reuses Donna's existing substrate exactly — no new patterns.

- **Lists (SSR):** `+page.server.ts` `load` calls `lqFetch(event, '/api/v1/autonomous/...')` (auto Bearer + one 401-refresh), identical to `playbooks/+page.server.ts`.
- **Live poll (running sessions):** a thin BFF proxy `src/routes/(app)/automations/[id]/+server.ts` (`GET` → `lqFetch` → `json`, error-mapped like `playbook-executions/[id]/+server.ts`), polled by a rune controller `src/lib/automations/pollSession.svelte.ts` modeled on `runFlow.svelte.ts` (2 s cadence; stop at `completed | halted | failed`; a `stuckMs` guard).
- **Mark-read (B):** a SvelteKit **form action** posting to `POST /api/v1/autonomous/notifications/{id}/read` (idempotent), optimistic UI.

**Components:**
| Component | Responsibility |
|---|---|
| `WorkflowsNav.svelte` (edit) | add `'automations'` to `Tool` + `segments` |
| `AutomationsNav.svelte` (new) | inner Sessions / Notifications `[n]` sub-nav |
| `SessionList.svelte` / `SessionRow.svelte` | list rows + empty state |
| `ReceiptHeader.svelte` | status pill · trigger · cost vs cap · `terminal_reason` · timing |
| `ReceiptView.svelte` | **unified chronological stream** — merge `phase_transitions[]` + `tool_calls[]` by timestamp (stable sort), render one timeline |
| `NotificationsInbox.svelte` / `NotificationRow.svelte` | inbox list, unread dot, deep-link, mark-read |

All internal `<a href>` carry `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` (per dev-stack convention).

---

## 6. Slice A — Sessions + receipt

**List (`/automations`).** `GET /api/v1/autonomous/sessions` → rows showing a status pill, `trigger_kind`, `current_phase`, cost, and relative time; row click → `/automations/[id]`. Friendly empty state explains what automations are and (text only) that they run once enabled and scheduled — **no toggle rendered here**.

**Detail (`/automations/[id]`).** `GET /api/v1/autonomous/sessions/{id}` → `ReceiptHeader` + unified `ReceiptView`.

- **Presentation:** chosen approach **B** — a single chronological event stream interleaving phase transitions and tool calls by timestamp, reading as the story of what the agent did in order. Header surfaces the at-a-glance facts (status, trigger, cost vs cap, terminal reason, timing).
- **Running session:** `pollSession.svelte.ts` live-polls to terminal; the phase advances and `terminal_reason` is `null` until a terminal row exists.
- **Null receipt:** "Receipt unavailable" panel that still shows the typed session scalars we have (status, cost, `error`).
- **Failed session:** surface the typed `error` string alongside the terminal state.
- **Cross-user / missing id:** backend returns 404 → SvelteKit `error(404)`. Backend 502/503/504 pass through mirroring the playbooks route.

---

## 7. Slice B — Notifications inbox

**List (`/automations/notifications`).** `GET /api/v1/autonomous/notifications` with an **Unread / All** filter (`?unread=true`). Each row: `title`, `body`, `channel`, relative time, unread dot; row → `/automations/{session_id}` (typed `session_id`, no `payload` parsing).

**Mark-read.** `POST /api/v1/autonomous/notifications/{id}/read` (idempotent) via form action, optimistic.

**Unread badge.** SSR one-shot count (`?unread=true`) for first paint; a light **~30 s** poll refreshes the `[n]` on the Notifications sub-tab while the Automations area is open (notifications aren't time-critical — avoid hammering).

---

## 8. Error handling & edge cases (summary)

Null receipt → degraded panel · running → live poll · failed → show `error` · empty lists → explainer · backend 404 → `error(404)` · 502/503/504 passthrough · idempotent mark-read tolerant of double-submit · every internal link eslint-annotated.

---

## 9. Testing (to Donna's `npm run check` = 0/0 bar; `npx vitest run` green)

- `parseReceipt` units: full receipt · `null` receipt · sparse/missing fields · Decimal-as-string cost · empty arrays.
- Merge-by-timestamp ordering unit: stable order when timestamps are equal or missing.
- `+page.server.ts` load tests (success / 502 / 404) mirroring `playbooks/page.server.test.ts`.
- Component tests: session list + empty state · receipt timeline + null-receipt + running states · notifications inbox + mark-read.
- BFF proxy `server.test.ts` (proxies GET; maps errors).
- **No new eslint errors** (~53 pre-existing on `main` — add none).

---

## 10. Forward roadmap — Slices C–H (documented, not built)

For the next session. All blockers resolved; contract at pin `541bd6f` (re-`gen:api` on bump). Each slice runs its own brainstorm → spec → plan → subagent-execute → whole-branch Opus review → PR.

| #     | Slice                    | Size | Scope                                                                                                                                                                            | Notes / now-resolved blockers                                                                                                                                                                                                               |
| ----- | ------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C** | Run-now (manual one-off) | M    | skill/playbook picker + cost-cap input → `POST /autonomous/run-now` (exactly one of `playbook_id`/`skill_ref`; zero/both → 422) → poll spawned session → link to its receipt (A) | **First mutate slice.** Requires `autonomous_enabled` — surface the **opt-in toggle** via `PATCH /api/v1/users/me/preferences` (likely a Donna `/settings` control). Confirm `skill_ref` format (the live spike, §11, captures a real one). |
| **D** | Memory review            | S/M  | state-filtered list (`?state=proposed\|kept\|dismissed`) + keep (edit-on-keep) / dismiss / delete (→200)                                                                         | Clean CRUD; soft-delete returns **200**, not 204.                                                                                                                                                                                           |
| **E** | Precedents + proposals   | M    | list/dismiss/promote (→ proposal) → project-context-proposal accept (writes a Project's `context_md`) / reject                                                                   | Couples to Projects; two-step proposal UX.                                                                                                                                                                                                  |
| **F** | Schedules                | M    | create/edit/enable/disable/delete with a **cron-expression** input (5-field; 422 on invalid)                                                                                     | **Net-new UI concern:** a friendly cron builder vs raw 5-field. Backend parses via in-repo `validate_cron_expr` (no `croniter` dep).                                                                                                        |
| **G** | Watches                  | S/M  | create/edit/enable/disable/delete bound to an **owned** KB                                                                                                                       | KB-ownership → 404; `knowledge_base_id` immutable on PATCH; mirrors F.                                                                                                                                                                      |
| **H** | Halt + live-poll polish  | S    | halt button on running sessions (`POST /autonomous/sessions/{id}/halt`, idempotent)                                                                                              | Fold into A/C's poll loop; tune cadence / stop condition.                                                                                                                                                                                   |

**Opt-in mechanism (gates C/F/G):** `PATCH /api/v1/users/me/preferences` `{ autonomous_enabled: true }`. The lq-ai reference app exposes this at `web/src/routes/lq-ai/settings/autonomous/`; Donna would add an equivalent toggle (admin-or-self per product call) when building C.

---

## 11. Execution order (the spike is task 1)

0. **Live confirmation spike** (per the "live spike first" decision, run as execution task 1). Bring up the dev stack (`arq-worker` already runs the autonomous job + crons). `PATCH /api/v1/users/me/preferences {autonomous_enabled:true}` for the admin fixture → `POST /api/v1/autonomous/run-now` (with a `playbook_id` or `skill_ref` — **also resolves the `skill_ref`-format unknown**) → poll `GET /autonomous/sessions/{id}` to terminal → **capture the real `receipt` + example `tool` / `outcome` / `to_phase` label values** → reconcile `types.ts` / `parseReceipt` and the timeline labels against reality. Record the captured sample in the plan.
1. `types.ts` + `parseReceipt` + unit tests.
2. `WorkflowsNav` 4th segment + hub card + `AutomationsNav` + sessions list (SSR) + empty state.
3. Receipt detail (unified stream B) + `pollSession` live-poll + null/failed states.
4. Notifications inbox + mark-read + unread badge.
5. Whole-branch Opus review → `finishing-a-development-branch` → PR.

---

## Key references

- Contract: `src/lib/api/backend.d.ts:6842–8144` (autonomous), `:9146` (`AutonomousSessionDetailResponse`; `receipt` field `~:9162`), `:9328`/`:9346` (preferences `autonomous_enabled` response/request).
- Gating: `vendor/lq-ai/api/app/api/dependencies.py:161` (`AutonomousEnabledUser`).
- Receipt builder (shape source): `vendor/lq-ai/api/app/autonomous/receipt.py`.
- Worker registration: `vendor/lq-ai/api/app/workers/arq_setup.py`.
- Behavior: `vendor/lq-ai/docs/autonomous-layer.md`.
- Donna substrate to reuse: `src/lib/server/lqClient.ts` (`lqFetch`), `src/routes/(app)/playbooks/+page.server.ts` (SSR load), `src/routes/(app)/playbook-executions/[id]/+server.ts` (BFF proxy), `src/lib/playbooks/runFlow.svelte.ts` (poll controller), `src/lib/workflows/WorkflowsNav.svelte` + `src/routes/(app)/workflows/+page.svelte` (extension points).
- Scope origin: `docs/roadmap/autonomous-workflows-scope.md`.
