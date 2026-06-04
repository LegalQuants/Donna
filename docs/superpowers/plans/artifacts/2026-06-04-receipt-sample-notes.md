# Receipt spike — captured values (Task 0)

**Captured:** 2026-06-04, pin `541bd6f`, against the live dev stack. Session spawned via
`POST /api/v1/autonomous/run-now` with `playbook_id` (DPA — GDPR) + `max_cost_usd:"2.00"`.
Sample: `2026-06-04-receipt-sample.json` (`{ session, receipt }`).

## Confirmed: receipt shape matches the plan's `SessionReceipt` exactly
All 13 keys present: `session_id, trigger_kind, status, halt_state, current_phase,
cost_total_usd, max_cost_usd, cost_cap_reached, created_at, completed_at,
phase_transitions[], tool_calls[], terminal_reason`. In the **receipt** object costs are
**numbers** (`cost_total_usd: 0.005`, `max_cost_usd: 2.0`); on the **session row** they are
**strings** (`"0.0050"`, `"2.0000"`). Parsers coerce both. ✔

## Real example values (use these in tests/labels)
- `tool_calls[].tool`: **`run_playbook`**, **`emit_finding`**, **`notify`**.
- `tool_calls[].outcome`: **`started`** then **`success`** (a started/success pair per tool).
  **NOT `ok`.** → Timeline outcome coloring must treat `success` as positive, `started` as
  neutral/in-progress, anything else (e.g. `error`/`failed`) as warning.
- `tool_calls[].cost_usd`: present on `success` entries (incl. `0.0`); **absent on `started`
  entries**. Show cost only when `> 0` to avoid `$0.00` noise.
- `phase_transitions[].to_phase`: `intake, analysis, drafting, ethics_review, delivery`.
- `terminal_reason`: `completed`.
- `trigger_kind`: `manual`; `halt_state`: `running` (stays `running` even when completed —
  halt_state tracks the halt channel, not the run status; don't surface it as a status).

## Behavioral notes
- With **no documents**, the session completes in ~11s and all phase/tool timestamps are
  **identical** (written in one burst). The merge-by-timestamp stable sort then renders
  phases-then-tools (no interleaving) — the designed degenerate-case behavior. A real
  long-running session will have distinct timestamps and interleave properly.
- `run-now` returns **HTTP 201** with an `AutonomousSessionRead` (status `running`).
- The `notify` tool wrote an in-app notification → use for the inbox e2e (Task 11).
- User-preferences shape (for the future opt-in toggle, slice C): `reasoning_visibility,
  featured_tools, workspace_layout, trust_pills, provenance_pills, autonomous_enabled`.

## Plan reconciliation applied
- Task 8 `SessionTimeline.svelte`: outcome coloring `success`→emerald, `started`→muted,
  else→amber; show `cost_usd` only when `> 0`.
- Task 8 fixtures + Task 1 note: use real `tool`/`outcome` values.
- Task 1 `SessionReceipt`/`parseReceipt`: confirmed correct as written — no change.
