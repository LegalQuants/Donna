# Upstream request: honor `ensemble_verification` on tabular columns

**For:** lq-ai backend · **From:** Donna (frontend) · **Filed:** 2026-06-03 · **Status:** dispatched (awaiting SHA)
**Relates to:** Donna P6-C (Tabular Slice C) · `ColumnSpec.ensemble_verification`

## Problem

Donna's tabular builder will expose a per-column **Ensemble verification** toggle. Today
`ColumnSpec.ensemble_verification` is **accepted but inert**:

- It's stored on the column snapshot — `api/app/tabular/state.py:30` (`_ColumnSpecState.ensemble_verification: bool | None`) — but the cell-extraction node never reads it.
- In `api/app/tabular/nodes.py` (~line 264) the `ChatCompletionRequest` is built with
  `minimum_inference_tier=column.minimum_inference_tier` and **no ensemble parameter**.
- `api/app/schemas/gateway.py`'s `ChatCompletionRequest` has no ensemble field.

So a user toggling it changes nothing (the same no-op class we hit with `skill_inputs`). We won't ship a
no-op control, so the toggle is gated on this change.

> **Premise correction (from the backend CC, 2026-06-03):** the tabular cell node (`nodes.py:298-320`)
> only parses `cited_chunk_indices → cited_chunk_ids` and stores them — it runs **no** Citation-Engine
> verification at all (neither single-pass nor ensemble). That's **DE-309** (tabular citations are
> display-only, never resolved through the engine). So honoring `ensemble_verification` is **not** "swap
> a default verification for ensemble" — there is no default to swap. It's **"wire citation verification
> into the tabular cell path, in ensemble mode,"** which **overlaps the deferred DE-309**. The backend CC
> is confirming the reuse surface (the Citation-Engine `verify()` entrypoint + how chat calls it) to
> scope this accurately — the ask below is the intent; defer to the backend on the exact mechanism.

## Ask — wire citation verification into the tabular cell path, in ensemble mode

When a tabular column has `ensemble_verification: true`, its cells' citations should be **verified
through the Citation Engine ensemble path** — the same machinery that produces chat citations with
`verification_method ∈ {ensemble_strict, ensemble_majority}` (multiple judge models verifying the cited
span). Since the tabular path currently does **no** verification, this means adding verification to that
path (overlapping DE-309), defaulting to the ensemble mode for ensemble columns.

- In the tabular extraction/verification path (`api/app/tabular/nodes.py`), read the column's
  `ensemble_verification` (per-column override of the skill-level field; fall back to skill/deployment
  default when null) and, when true, invoke the **existing** Citation Engine ensemble path that chat
  already uses — do not reimplement it.
- Make the result **observable** on the cell: e.g. the cell's citations carry an `ensemble_*`
  `verification_method` (and/or the cell `confidence` reflects the ensemble outcome). This both lets the
  UI show that an ensemble-verified column was treated differently **and closes a related Donna gap**:
  P6-B's read-side citation resolution (this same pin, `c22360a`) made tabular citations *navigable* but
  left them **unverified**, so Donna's doc panel currently shows an "Unverified" chip on every tabular
  citation. A real `verification_method` on the cell's citations lets Donna render the true state (the
  doc panel already does this for chat) — so this change also resolves Donna's P6-B.1 follow-up for
  verified columns. **(Non-binding note:** if a lightweight *default* (non-ensemble) verification for
  ordinary tabular columns is cheap to include alongside, it would close P6-B.1 for *all* columns, not
  just ensemble ones — but that's DE-309's full scope; ensemble-only is sufficient for this ask.)

## Cost

Ensemble verification means extra judge calls, so it must cost more. Reflect that in
**`POST /api/v1/tabular/preview-cost`** (`api/app/tabular/cost.py`): a column with
`ensemble_verification: true` should estimate higher than the same column without it (a per-cell
ensemble multiplier / extra judge-call cost), and ideally expose the premium in the response (per-column
or a distinct breakdown bucket) so the UI can show it. If a precise model isn't available, a **documented
flat multiplier** is acceptable for v1 — just don't cost ensemble columns identically to non-ensemble.

## Acceptance

For a completed execution with one `ensemble_verification: true` column and one ordinary column on the
same run:
- the ensemble column's cells show evidence of ensemble verification (citations carry an `ensemble_*`
  `verification_method`, or an equivalent observable signal) while the ordinary column's do not; and
- `preview-cost` returns a **higher** `estimated_cost_usd` (and/or a per-column/per-tier premium) when a
  column is ensemble-verified vs. not.

No change to the `skill_name` XOR `columns` contract; `minimum_inference_tier` behavior unchanged.

## Handoff

Push to `main` and return the **commit SHA**. Donna pins `vendor/lq-ai` to it, regenerates types, and
wires the per-column **Ensemble verification** toggle (already designed as the pin-gated final task of
P6-C). The toggle's frontend contract (`ColumnSpec.ensemble_verification: boolean`) is already stable —
this change makes it functional and observable.
