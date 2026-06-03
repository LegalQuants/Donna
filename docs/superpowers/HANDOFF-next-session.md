# Donna — Handoff for the next session

**Date:** 2026-06-03 · **Pin:** `vendor/lq-ai` @ `945ad31` (all P1.x backend asks landed).
**`main` HEAD:** P6-A Tabular merged (PR #47, merge `c8a23c4`).

## ⏩ Your job: P6-B — Tabular Reviews, Slice B (design it first, then build)

P6 Tabular is sliced **A → B → C** (like Playbooks was). **Slice A is merged.** Your job is **Slice B.**
Unlike the P1.2 handoff, there is **no ready-made plan** — P6-B needs the full loop: **brainstorm → spec
→ plan → subagent-driven execute → PR.** Start with `superpowers:brainstorming`.

### What P6-B covers (the agreed scope)
1. **Executions history list** — a list of the user's past tabular reviews + an entry point to start a
   new one. Backend: `GET /api/v1/tabular/executions` → `TabularExecutionSummary[]`
   (`{id, status, document_count, column_count, cost_estimate_usd, created_at, completed_at, ...}` —
   note: **results are NOT inlined** in the summary; fetch the full execution by id for the grid).
2. **Resume-from-list** — open a past run → the existing run page (`/tabular/[executionId]`) already
   SSR-loads + polls/renders by id, so this is mostly the list → link wiring + an empty-state.
3. **Cell → source-document citation navigation** — make a cell's citations open the cited source in
   the **doc panel** (`src/lib/docpanel/`, built in P3). ⚠️ **SPIKE THIS FIRST — it may not be
   feasible.** Slice A deliberately shipped **citation counts only** because the cell `cited_chunk_ids`
   are **display-only synthetic ids (DE-309)** and it was unverified whether they resolve to a
   navigable source page. **Before committing Slice B to include cell→source nav, verify live** whether
   a cell's chunk ids can be turned into a `{file/document, page, quote}` the doc panel can open (e.g.
   via the per-message citation endpoint pattern — see `[[donna-citation-contract]]` — or any tabular
   citation-resolve endpoint). If they can't, **keep counts-only and scope B to history + resume**
   (and file an upstream request for real tabular cell citations, per the upstream workflow).

### Where P6-A left things (the `/tabular` IA note)
Slice A made **`/tabular` the builder** directly (no history list yet). Slice B introduces history, so
decide the IA in brainstorm: most likely **`/tabular` becomes the history index + "New review"**, and
the **builder moves to `/tabular/new`** (a small relocation). The run page stays `/tabular/[executionId]`;
the BFF proxies stay `/tabular/{preview-cost,execute}` + `/tabular-executions/[id]{,/cancel,/export}`.

### Fold these banked Slice-A minors into B (cheap, do them here)
- **Grid row labels can show a raw UUID.** `TabularGrid` row label = `row.document_name`, which
  `parseTabularResults` falls back to the `document_id` when the `m3-c2-v1` payload omits a per-row
  name. The execution already carries `document_names[]` parallel to `document_ids[]` — fall back to
  `execution.document_names[i]` (by position) before the UUID.
- **Bad-document error is generic.** `/tabular/{preview-cost,execute}` proxies map a 404/422 (invalid
  or not-owned `document_id`) to a generic 502 "Could not start the review." Surface something more
  specific so the user knows it's a document problem.

## Reuse (P6-A shipped a lot you build on)
- `src/lib/tabular/`: `types.ts` (+ `parseTabularResults`), `createTabularBuilder`,
  `createTabularUploads` (upload → poll `/files/{id}` **until `document_id` non-null**),
  `createRunPoll` (2 s visibility-paused poll, 5-min stuck, terminal-stop), `TabularGrid`/`CellDetail`/
  `ExportMenu`/`CostPreviewModal`/`DocumentMultiPicker`/`ColumnBuilder`.
- Run page `src/routes/(app)/tabular/[executionId]/{+page.server.ts,+page.svelte}` — the resume target.
- Doc panel `src/lib/docpanel/` (P3) — the citation-nav target IF the spike says it's feasible.
- Pattern precedents: Playbooks **history/run** + the **executions list** idioms; the matters list row UI.

## Cold start (every session)
1. `git checkout main && git pull` (P6-A is on `main`).
2. Bring the stack up (shifted ports; coexists with the user's own lq-ai):
   ```bash
   set -a; . ./.env; set +a
   docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
   ```
   App at http://localhost:13002. Login `admin@lq.ai` / `$DONNA_E2E_PASSWORD`. Tabular execution runs
   on **`arq-worker`** (queue `arq:m3a6`) + needs **`ingest-worker`** for upload ingestion.
3. Verify gate: `npm run check` (expect "0 errors and 0 warnings"; vendor `ERR_MODULE_NOT_FOUND` stderr
   is harmless) · `npx vitest run` (**~873 green on `main`** after P6-A) · live e2es via
   `set -a; . ./.env; set +a; npx playwright test <spec>`.

## Banked gotchas
- **Rebuild `donna-web` before any live e2e** — the running container serves *built* code:
  `set -a; . ./.env; set +a; docker compose up -d --build donna-web` after `src/` changes.
- **Plain `.txt` does NOT ingest on this stack** (`ingestion_error: unsupported_type`). Live e2es that
  need an ingested doc use a **`.pdf`** fixture (generate via `cupsfilter /etc/hosts > /tmp/x.pdf`, or
  copy an existing `/tmp/spike*.pdf`). Don't loosen assertions to dodge ingestion.
- **Poll-controller tests use fake timers** — `vi.useFakeTimers()` + `await
  vi.advanceTimersByTimeAsync(2000)`; always `vi.useRealTimers()` in `afterEach`.
- **0-warning bar** — `npm run check` must be 0/0. No `any` / non-null `!` (post-guard `as` casts fine).
  Seeding a reactive controller from a `data`/prop in a non-reactive init throws Svelte's
  `state_referenced_locally` warning — use the established **`untrack(() => …)`** (run page / chat page)
  or **`$state(null)` + `$effect.pre`** (DocumentMultiPicker) pattern, not an ignore hack.
- **SSE contract (banked from P1.2):** the backend emits `applied_skills`/`applied_file_ids` at the
  **TOP LEVEL** of the `complete` frame, not inside `frame.message` — relevant if you touch streaming.
- **Tabular backend honesty:** per-cell citations are **synthetic display-only ids (DE-309)**;
  `cost_actual_usd` is always **0 (DE-310)** — show the estimate, never a misleading actual.

## The build loop (working well — used for P1.x / P5 / P6-A)
brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → **subagent-driven
execute** (fresh **Sonnet** implementer per task — paste each task's full text in, don't make it read
the file — + per-task spec-compliance review + per-task code-quality review, fix→re-review; then a
**whole-branch Opus review**) → `superpowers:finishing-a-development-branch` → PR into `main` → on
merge: sync `main`, delete the branch, update memory. Quality bar: `npm run check` 0/0, eslint clean,
live e2e. **The whole-branch Opus review keeps earning its keep** — on P6-A it caught a duplicate-
column-name bug (same-named columns → duplicate keyed-`each` → grid crash) that the per-task reviews
missed.

## Roadmap status (where we are)
- **DONE & merged:** P0–P5 · P7 (Settings) · all P1.x (pin `945ad31`, banners, profile-edit, skill-
  input form, **P1.2 chat file-attach #46**) · **P6-A Tabular core vertical #47**.
- **THIS HANDOFF — next:** **P6-B** (Tabular history list + resume + *spike-gated* cell→source citation
  nav). Brainstorm first; spec/plan it; then execute.
- **After P6-B:** **P6-C** (skill-based `output_format: table` columns + advanced per-column options:
  `ensemble_verification`, `minimum_inference_tier`; also column reorder). **Then, before wrap: the
  model/inference settings surface** (provider keys, local-model assignment, inference routing — user
  directive, see `[[donna-model-inference-settings]]`).

See memories: [[donna-phase-status]] (P6 slice detail + upstream lq-ai fix workflow),
[[donna-product-direction]], [[donna-model-inference-settings]], [[donna-dev-stack]], [[donna-workflow]],
[[donna-citation-contract]], [[donna-reviewer-remote-hygiene]], [[donna-lq-ai-v040-bump-parked]].
