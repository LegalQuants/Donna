# P6 Tabular Reviews — Slice B Design

**Date:** 2026-06-02 · **Phase:** P6 (largest FE build, sliced) · **Slice:** B (history + resume + citation-nav, spike-gated) ·
**Pin:** `vendor/lq-ai` @ `945ad31` (citation-nav wiring gated on a future pin bump — see §7)

## What this is

Slice A shipped the core tabular vertical: a builder (pick documents + define ad-hoc columns) → cost
preview → async run + cancel → cited results grid → xlsx/csv export. It made `/tabular` **the builder**
directly, with no way to find past runs.

**Slice B** adds the *around-the-run* surface: an **executions history list** as the new `/tabular`
landing, **resume** (open a past run from the list), and — *if the backend gains it* — **cell→source
citation navigation** (open the cited PDF in the doc panel). It also folds in two banked Slice-A minors.

## Decisions locked (brainstorm 2026-06-02)

1. **IA:** `/tabular` becomes the **executions history index** with a *New review* entry; the builder
   relocates to **`/tabular/new`**. Run page stays `/tabular/[executionId]`. (Mirrors Playbooks: list at
   root, builder at `/new`.) Sidebar `/tabular` link is unchanged — it now lands on history.
2. **Citation nav:** the live spike found it **blocked without a backend change** (evidence in §7), so
   Slice B ships **counts-only** and files an **upstream request**. The cell→doc-panel click-through is a
   **final, pin-gated task**: folded in iff the upstream SHA lands during this slice; otherwise it's a
   fast follow once the pin bumps.
3. **Banked minors are in-scope:** row-label UUID fallback (§5) and document-specific bad-doc error (§6).

## Scope

In: history list (SSR via `lqFetch`); builder relocation to `/tabular/new`; resume wiring; row-label
fallback fix; bad-document error specificity; the upstream request artifact; (pin-gated) citation-nav.

Out: skill-based columns, advanced per-column options, column reorder (all **Slice C**); the backend
citation-resolution change itself (upstream, tracked by the request doc).

## Architecture & components

### 1. IA & routing (the relocation)
- **Move** `(app)/tabular/{+page.server.ts,+page.svelte,page.server.test.ts}` → `(app)/tabular/new/`.
  Update its one internal link `goto('/tabular?matter=…')` → `/tabular/new?matter=…`
  (`+page.svelte:23`). The post-submit redirect `goto('/tabular/${exec.id}')` (`:69`) is unchanged
  (still the run page). Update the moved test's route expectations.
- **New** `(app)/tabular/+page.{server.ts,svelte}` = the executions **history index**.
- `Sidebar.svelte:14` (`/tabular`) and the run page `(app)/tabular/[executionId]` are **unchanged**.

### 2. History list
- **`/tabular/+page.server.ts`** SSR-loads the list by calling backend
  `GET /api/v1/tabular/executions?limit=50` → `TabularExecutionSummary[]` **directly via `lqFetch`**
  (the Playbooks list `+page.server.ts` precedent — no separate BFF `+server.ts`, since nothing fetches
  the list client-side in this slice). Non-2xx → `error(502, 'Could not load your tabular reviews.')`.
- **`/tabular/+page.svelte`** renders:
  - a **"New review"** action (button/link → `/tabular/new`),
  - the **list** of summaries, newest first, each a **new `TabularExecutionRow.svelte`**.
  - **Empty state** when no executions: "No tabular reviews yet — start one." with the New-review CTA.
- **`TabularExecutionRow.svelte`** props `{ summary: TabularExecutionSummary }`, renders a link to
  `/tabular/[summary.id]` showing: **status badge**, **`document_count` × `column_count`**
  ("N docs · M cols"), **`cost_estimate_usd`** (estimate label — never `cost_actual_usd`, which is
  always 0 per DE-310), **relative `created_at`**. Follows the Playbooks `PlaybookRow` / Matters row
  idiom (truncating, hover, `border-mlq-subtle`).
- Summaries do **not** inline results; the row links by id and the run page fetches the grid.

### 3. Resume
Pure wiring: each row links to `/tabular/[executionId]`; the run page already SSR-loads + polls/renders
by id (`createRunPoll`). No new run-page logic.

### 4. Row-label UUID fallback (banked minor)
`parseTabularResults` currently sets `document_name = ro.document_name ?? ro.document_id` — a raw UUID
leaks when the `m3-c2-v1` payload omits a per-row name. The execution detail carries `document_names[]`
parallel to `document_ids[]` in selection order (backend.d.ts `TabularExecution`, ~:8685). Fix: thread
`execution.document_names` + `execution.document_ids` into `TabularGrid`, and resolve a row's label as
**`document_names[document_ids.indexOf(row.document_id)]`** when the row name is missing, falling back to
the UUID only if that lookup fails. Keep `parseTabularResults` payload-only; do the name resolution in
the grid (or pass the maps through) so the parser stays pure and unit-testable.

### 5. Bad-document error (banked minor)
`(app)/tabular/preview-cost/+server.ts` and `(app)/tabular/execute/+server.ts` map backend **404/422**
(invalid or not-owned `document_id`) to a generic 502. Map 404/422 instead to a **400** with a
document-specific message — e.g. *"One or more selected documents couldn't be found or isn't accessible.
Re-check your document selection."* Keep 503/504 passthrough and the generic 502 for other failures.
The builder (`/tabular/new`) surfaces the returned message in its existing error slot.

### 6. Citations — counts-only this slice
`CellDetail.svelte` stays counts-only. The pin-gated wiring task (§7) is the only place this changes.

## §7 — Citation-nav spike result & the pin-gated task

**Spike question (handoff):** do a cell's `cited_chunk_ids` resolve to a navigable
`{document, page, quote}` for the doc panel? **Live verdict: NO — blocked without a backend change.**

Evidence (live against the running stack + `vendor/lq-ai`):
- The doc panel `docPanel.open(Citation)` needs `source_file_id` (a **`files.id`**), `source_page`,
  `source_text`. A serialized tabular cell carries only `cited_chunk_ids` (real `document_chunks` UUIDs)
  + `value` + `confidence` + `document_id` — and that `document_id` is a **`documents.id`**, *not* a
  `files.id` (confirmed: the live id is present in `documents`, absent from `files`).
- No endpoint exposes the bridge: there is **no `documents` API**, **no `GET /documents/{id}`**, and
  **no chunk-resolve route** anywhere in `vendor/lq-ai/api/app/api/`. Even a degraded "open the source
  PDF, no highlight" is impossible — the frontend can't turn `documents.id` into a `files.id`.
- This matches DE-309: the tabular citation is *"display-only and never resolves."*

**Upstream request (filed, `docs/upstream-requests/lq-ai-tabular-cell-citation-provenance.md`):** a
**read-side** enrichment (not full Citation-Engine minting) of the existing
`_synthesize_cell_citations` path — for each real `chunk_id`, join `document_chunks` → `documents` to
populate `source_file_id` (`documents.file_id`), `source_page` (`chunk.page_start`), `source_text`
(`chunk.content`) on the cell's `Citation`, surfaced inline on `GET /tabular/executions/{id}`. Read-side
⇒ existing executions become navigable with no migration/backfill.

**Pin-gated task (last in the plan):** *if* the upstream SHA lands during this slice → bump
`vendor/lq-ai` + regenerate `backend.d.ts`, then make each citation in `CellDetail` clickable →
`docPanel.open({ source_file_id, source_page, source_text })` (~10 lines + a test + a live e2e). *If
not* → leave counts-only; this task ships as a fast follow (P6-B.1) when the SHA arrives. The rest of
Slice B does **not** depend on the pin and ships regardless.

## Reuse
`src/lib/tabular/` (`types.ts`/`parseTabularResults`, `createRunPoll`, `TabularGrid`, `CellDetail`),
the run page, `src/lib/docpanel/` (`docPanel.open`, the citation-nav target). Pattern precedents:
Playbooks list (`(app)/playbooks/+page.{server.ts,svelte}` + `PlaybookRow.svelte`) and the Matters list
row UI.

## Testing
- **vitest:** history `+page.server.ts` load (success → summaries; non-2xx → 502);
  `TabularExecutionRow` render (badge/counts/estimate/relative-date/link); empty state;
  `parseTabularResults` + grid label fallback (row-name present → used; absent → `document_names[i]`;
  unknown id → UUID); bad-doc error mapping in **both** proxies (404/422 → 400 specific; 503/504
  passthrough; other → 502); relocated builder still loads at `/tabular/new`.
- **live e2e** (rebuild `donna-web` first; `.pdf` fixture): `/tabular` shows a prior run → click → run
  page renders the grid → resume works; "New review" → `/tabular/new` builder loads.
- **Gate:** `npm run check` 0 errors / 0 warnings · eslint clean · `npx vitest run` ≥ ~873 green.

## Risks & notes
- **`.txt` won't ingest** on this stack (`unsupported_type`) — live e2es use a `.pdf` fixture.
- **Rebuild `donna-web`** before any live e2e (it serves built code).
- **0-warning bar:** seed reactive controllers via the established `untrack(() => …)` / `$state(null)` +
  `$effect.pre` pattern, never an ignore hack. No `any` / non-null `!`.
- **`cost_actual_usd` is always 0 (DE-310)** — the row + run page show the **estimate** only.
- The relocation must keep the moved builder's tests green (route strings updated).
