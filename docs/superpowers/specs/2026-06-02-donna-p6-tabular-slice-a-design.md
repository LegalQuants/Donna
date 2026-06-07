# P6 Tabular Reviews — Slice A Design

**Date:** 2026-06-02 · **Phase:** P6 (largest FE build, sliced) · **Slice:** A (core vertical) ·
**Pin:** `vendor/lq-ai` @ `945ad31`

## What this is

**Tabular Reviews** runs a _question-per-column_ extraction across many documents at once and returns a
grid where every cell is an extracted answer with a confidence badge and citations, exportable to
Excel/CSV. Example: pick 12 NDAs, define columns _Governing law_ · _Term_ · _Auto-renewal?_, run → a
12×3 cited table.

The backend (lq-ai, fully built — `vendor/lq-ai/docs/tabular-review.md`) provides: synchronous cost
preview, async execute → poll → cancel, an executions list, xlsx/csv export, and two ways to define
columns (**ad-hoc** = name + NL query with optional per-column verification/tier-floor, or a registered
**table skill**). The `/tabular` route is a 4-line stub today; the sidebar already has a _Tabular_ entry.

## Slicing (agreed)

P6 ships as PR-sized slices, like Playbooks (A→B→C):

- **Slice A (this spec) — core vertical:** build a review (pick documents + define ad-hoc columns) →
  preview & confirm cost → run with async progress + cancel → cited results grid → export xlsx/csv.
- **Slice B (deferred):** executions **history list** + resume-from-list + **cell→source-document**
  citation navigation (open the cited PDF in the doc panel).
- **Slice C (deferred):** **skill-based** columns (`output_format: table` skills) + **advanced
  per-column** options (`ensemble_verification`, `minimum_inference_tier`).

## Decisions locked (brainstorm 2026-06-02)

1. **Slice A = core vertical first** (not thinner slices, not one big PR).
2. **Document source:** matter-pick **+** upload, both multi-select.
3. **Build flow:** **single builder page** (documents + columns side-by-side + sticky run bar), not a
   wizard or spreadsheet-first canvas.
4. **Results grid:** **compact spreadsheet** density (confidence dot, citation count, click-cell →
   detail panel), not roomy cards.
5. **Cost:** **preview-then-confirm** — Run opens a confirmation modal (cells · est. cost · per-tier)
   before executing; the confirmed figure is sent as `confirmed_cost_usd`.
6. **Citations in Slice A:** **counts only** — cells show a citation count and the cell-detail panel
   shows the count; tapping a citation to open the source PDF is deferred to Slice B (the backend's
   cell `cited_chunk_ids` are display-only synthetic ids — DE-309 — so source mapping is uncertain and
   intentionally out of scope here).
7. **Cancel:** included in Slice A (cheap; backend supports `POST .../cancel`).
8. **Column reorder:** out of scope for Slice A (non-essential).

## Routes & flow

- **`/tabular`** (replaces the stub) — the **builder** (single page):
  - **Documents** panel, two tabs: _From a matter_ (multi-select checkboxes over a matter's ready
    files, fetched via SSR `load` keyed on `?matter=`) and _Upload_ (batch PDF drop → ingest → rows).
  - **Columns** builder: rows of `name` + `query`, add/remove (no reorder).
  - **Sticky bottom bar:** live cell count (`docs × columns`, client math) + **Preview cost** + **Run
    review**. Run is disabled until ≥1 document and ≥1 valid column (named + non-empty query).
  - **Run** → `POST /tabular/preview-cost` → **confirm modal** (exact `cells_count`,
    `estimated_cost_usd`, `per_tier_breakdown`) → on confirm `POST /tabular/execute` (with
    `confirmed_cost_usd`) → `goto('/tabular/<executionId>')`.
- **`/tabular/[executionId]`** — the **run / results page**:
  - SSR `load` fetches the execution by id (bookmarkable/resumable). Terminal → render immediately;
    in-flight → seed then client-poll.
  - In-flight: a `RunProgress`-style indicator + **Cancel** button. Terminal `completed` → the grid +
    **Export**. `failed` → an error banner from `error_text`. Partial cell failures → `(failed)` cells.

There is **no executions history list** in Slice A; a past run is reachable only by its URL (history is
Slice B). After a run the user is already on `/tabular/<id>` and can export/bookmark.

## Architecture

New `src/lib/tabular/`:

- **`types.ts`** — re-export `ColumnSpec`, `TabularExecution`, `TabularExecutionCreate`,
  `TabularPreviewCostRequest`, `TabularPreviewCostResponse` from the generated `$lib/api/backend`
  contract. **Hand-type** the runtime `m3-c2-v1` grid (the contract types `results` loosely as
  `{[k]: unknown}`):
  ```ts
  type CellConfidence = 'high' | 'medium' | 'low' | 'failed';
  interface TabularCell {
  	value: string;
  	cited_chunk_ids: string[];
  	confidence: CellConfidence;
  	error?: string | null;
  }
  interface TabularRow {
  	document_id: string;
  	document_name: string;
  	cells: Record<string, TabularCell>;
  }
  interface TabularResults {
  	schema_version: string;
  	rows: TabularRow[];
  	summary: { total_cells: number; failed_cells: number };
  }
  ```
- **`tabularBuilder.svelte.ts`** — a `createTabularBuilder()` rune controller: selected documents
  (`{document_id, name}[]`), columns (`{name, query}[]`), `addColumn`/`removeColumn`/`setColumn`,
  add/remove documents, derived `cellCount` and `canRun` (≥1 doc && ≥1 valid column).
- **Upload** reuses the **P1.2 `createFileAttach`** controller (multi-file upload + poll-to-ready); on
  each file's `ready`, resolve its `document_id` from the file meta and hand `{document_id, name}` to
  the builder. (`createFileAttach` already handles 16-cap, 413/unsupported, dispose.)

Components in `src/lib/tabular/`:

- **`DocumentMultiPicker.svelte`** — the two-tab documents panel (matter checkboxes + upload via the
  existing `Dropzone`), emits selected `{document_id, name}`.
- **`ColumnBuilder.svelte`** — name + query rows, add/remove.
- **`CostPreviewModal.svelte`** — confirm dialog (mirrors existing modal a11y: role=dialog + Escape +
  reset-on-open); shows `cells_count`, `estimated_cost_usd`, `per_tier_breakdown`; Confirm / Cancel.
- **`RunProgress.svelte`** — adapt the Playbooks step indicator to the tabular phases.
- **`TabularGrid.svelte`** — compact spreadsheet: sticky first column (document name) + sticky header
  row, horizontal scroll; per cell a confidence dot, clipped value (2 lines), citation count `⟐n`;
  `(failed)` cells styled with the error token; a summary line (`N cells · M failed`).
- **`CellDetail.svelte`** — click-a-cell panel/popover: full `value`, confidence, citation **count**,
  and `error` if failed. (No source navigation in Slice A.)
- **`ExportMenu.svelte`** — _Export ▾_ → xlsx / csv; enabled only when `status === 'completed'`.

BFF proxies (thin `lqFetch` forwards, mirroring Playbooks; error map: pass 503/504, else 502 — and 409
surfaced where meaningful). Execution-**scoped** proxies live at a **top-level `/tabular-executions/[id]`**
route group (mirrors the existing `/playbook-executions/[id]` precedent) so they never collide with the
`/tabular/[executionId]` run **page**; the two verb proxies live under `/tabular/`:

- `POST /tabular/preview-cost` → `/api/v1/tabular/preview-cost`
- `POST /tabular/execute` → `/api/v1/tabular/execute`
- `GET /tabular-executions/[id]` → `/api/v1/tabular/executions/{id}` (poll)
- `POST /tabular-executions/[id]/cancel` → `/api/v1/tabular/executions/{id}/cancel`
- `GET /tabular-executions/[id]/export?format=xlsx|csv` → backend export; **binary pass-through**
  (preserve `content-type`, set `content-disposition: attachment`, `cache-control: no-store`,
  `x-content-type-options: nosniff`) → browser download.

Uploads reuse the existing `/files` (POST) + `/files/[id]` (GET) proxies. Matter file lists come from
the builder page's SSR `load` (fetch `/projects`, and for `?matter=<id>` resolve `attached_file_ids` →
ready files with `document_id`), the Playbooks `[id]/run` load pattern.

## Run lifecycle (poll)

A client poll controller (`src/lib/tabular/runPoll.svelte.ts`, a rune controller for testability,
consistent with the codebase pattern) hits `GET /tabular-executions/[id]` every **2 s**,
**visibility-paused** (skip when
`document.visibilityState === 'hidden'`), tolerating transient non-OK responses, with a **5-min stuck**
flag — the established KbFileRow / Playbooks `runFlow` pattern. Stops on terminal status
(`completed` / `failed` / `cancelled`). The SSR `load` seeds the initial execution so a reload mid-run
resumes cleanly.

## Errors & edge cases

- **Validation:** Run disabled until ≥1 document and ≥1 column with a non-empty name + query.
- **Upload:** 413 / `unsupported_type` surfaced per file by `createFileAttach` (a file that won't
  ingest never becomes a selectable row).
- **Preview-cost failure:** inline error inside the modal; no execution created.
- **Execute failure:** 4xx/5xx mapped (502 default; pass 503/504); the builder stays intact so the user
  can retry.
- **Cancel:** available while `pending`/`running`; a terminal row returns 409 → treated as "already
  finished," reconcile by reloading the execution.
- **Failed execution** (`status === 'failed'`): show `error_text` banner, no grid.
- **Failed cells** (within a completed run): render `(failed)` with the cell's `error` in the detail
  panel; counted in the summary's `failed_cells`.
- **Export precondition:** only enabled when `completed` (backend 409s otherwise).
- **Large grids:** sticky header + first column, horizontal scroll; long values clip to 2 lines →
  full text in the detail panel.

## Known backend limitations (surface honestly, don't work around)

- Cell `cited_chunk_ids` are **display-only synthetic ids** (DE-309) — counts only in Slice A.
- `cost_actual_usd` is currently always `0` (DE-310) — show the **estimate**; don't present a
  misleading actual.
- `per_tier_breakdown` for all-ad-hoc columns will typically be a single `default` bucket (no
  per-column tier floor in Slice A) — still display it.

## Testing

- **Vitest unit/component:** builder `cellCount`/`canRun`; `ColumnBuilder` add/remove; `TabularGrid`
  rendering (confidence dot, clipped value, citation count, `(failed)` cell, summary); `CostPreviewModal`
  (numbers, confirm/cancel, reset-on-open); `CellDetail`; `ExportMenu` enable/disable + format links;
  `DocumentMultiPicker` selection.
- **Server tests** (mock `lqFetch`): each BFF proxy (forward path + error mapping; export header
  pass-through), the **builder `load`** (`/projects` list + `?matter=` → ready-file resolution), and the
  **run-page `load`** (fetch execution by `[executionId]` path param; terminal vs in-flight seeding).
- **Live Playwright e2e** (`tests/tabular-review.spec.ts`): log in → on `/tabular` add a document
  (matter-pick or upload a small **.pdf** — note: plain `.txt` does NOT ingest on this stack,
  `unsupported_type`) → define one column → Preview cost → Confirm → run polls to `completed` → assert a
  cell value is visible → Export downloads a file. Self-cleaning (no destructive mutation;
  `?execution=` reachable). Rebuild `donna-web` before the live run (the container serves built code).
- **Gate:** `npm run check` 0 errors / 0 warnings; eslint clean (no `any`, no non-null `!`).

## Out of scope (explicit)

Executions history list, resume-from-list, skill-based columns, advanced per-column options
(verification / tier floor), cell→source-document navigation, column reorder, bulk/parent executions,
editing a finished run. All tracked for Slices B/C.
