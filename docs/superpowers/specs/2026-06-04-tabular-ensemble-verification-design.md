# Tabular ensemble verification (P6-C.1) — Design Spec

**Date:** 2026-06-04 · **Pin:** `vendor/lq-ai` @ `541bd6f` (bumped this branch from `c22360a`).
**Branch:** `feat/tabular-ensemble-verification` (off `main`).

## Goal

Wire the now-shipped backend `ensemble_verification` (lq-ai #127 / Donna #6) into Donna's tabular
surface: a per-column **ensemble verification** toggle, the **cost premium** in the preview, and
**`verification_method`** surfaced on tabular cell citations — which also **closes P6-B.1** (the
doc-panel "Unverified" chip on tabular citations). See [[donna-phase-status]] P6-C.1 / P6-B.1.

The pin bump + `npm run gen:api` is already committed on this branch (`b917167`): `ColumnSpec` gained
`ensemble_verification?: boolean | null`; the cost-preview response gained `ensemble_cells_count?` +
`ensemble_premium_usd?`; the `results` prose documents a per-cell + per-citation `verification_method`
(string|null: `ensemble_strict` / `ensemble_majority`; null when the column isn't ensemble-verified or
support wasn't confirmed) — loosely typed (DE-330), so hand-typed in `parseTabularResults`.

## Part 1 — Per-column ensemble verification toggle

- `src/lib/tabular/types.ts`: add `ensemble_verification?: boolean | null` to `ColumnDraft`.
- `src/lib/tabular/tabularBuilder.svelte.ts`: extend the `setColumn` `Pick<>` union with
  `'ensemble_verification'`; in `validColumns()`, include `ensemble_verification: true` on the emitted
  `ColumnSpec` only when `c.ensemble_verification === true` (omit otherwise — keep the request minimal,
  matching how `minimum_inference_tier` is handled). `buildRequest()` needs no change (it calls
  `validColumns()`).
- `src/lib/tabular/ColumnBuilder.svelte`: a checkbox beside the `Min. model tier` select —
  `checked={col.ensemble_verification ?? false}`, `onchange` → `builder.setColumn(col.id, {
ensemble_verification: e.currentTarget.checked || null })`, `aria-label="Ensemble verification for
{col.name || 'this column'}"`, label "Ensemble verification". Default off. (Skill mode is unaffected —
  the toggle is per ad-hoc column; ensemble for skill-defined columns is the skill's own setting.)

## Part 2 — Cost premium in the preview

- `src/lib/tabular/CostPreviewModal.svelte`: after the per-tier breakdown, when
  `preview.ensemble_cells_count` is truthy, render a muted line:
  "`{ensemble_cells_count}` ensemble-verified cell(s) · +$`{ensemble_premium_usd ?? '0'}` ensemble
  premium (included above)". `TabularPreviewCostResponse` already carries both fields (generated) — no
  parsing change.

## Part 3 — `verification_method` on tabular citations

- `src/lib/tabular/types.ts`: add `verification_method?: string | null` to `TabularCitation` (and,
  optionally, `verification_method?: string | null` to `TabularCell` — the backend mirrors cell→citation;
  the citation-level field is what the doc panel consumes, so the citation field is required, the cell
  field optional/nice-to-have).
- `src/lib/tabular/parseTabularResults` (in `types.ts`): in the citation `flatMap`, parse
  `verification_method: typeof cc.verification_method === 'string' ? cc.verification_method : null`.

## Part 4 — Doc-panel presentation (closes P6-B.1): "positive-or-nothing"

Decision (locked): an ensemble-verified tabular citation shows a green **"✓ Verified"** chip; a
non-ensemble citation (no `verification_method`) shows **no verification chip at all** (those cells
convey trust via the grid's confidence dot, not verification). Never show a misleading "Unverified" on a
cell that was never ensemble-checked.

Two coordinated changes:

1. **Treat the ensemble methods as verified (green).** In `src/lib/citations/types.ts`, add
   `ensemble_strict` and `ensemble_majority` to the GREEN verification-method set used by `citeState`,
   so a citation whose `verification_method` is one of those resolves to `'verified'`. This is safe for
   chat: chat citations never carry those methods (they're tabular-only), so chat behavior is unchanged
   — confirm via the existing `citations/types.test.ts` cases.
2. **Suppress the chip when verification doesn't apply.** The doc panel
   (`src/lib/docpanel/DocumentPanel.svelte`) currently renders the verification chip unconditionally
   from `tab.cite`. Add an explicit suppression signal so a tabular non-ensemble citation renders no
   chip — **do NOT infer from "no verification fields"**, because chat _unverified_ citations also lack a
   positive signal and must keep their red "Unverified" chip. Mechanism: the tabular `openCitation`
   (`src/routes/(app)/tabular/[executionId]/+page.svelte`) builds the `Citation` cast and:
   - when `c.verification_method` is set → include `verified: true` + `verification_method` (→ green
     "✓ Verified" via change #1);
   - when `c.verification_method` is null → set an explicit "verification not applicable" marker that the
     doc panel honors to skip the chip.
     The marker should be carried on the opened citation/tab in the least-invasive way (e.g. an optional
     `verificationApplicable?: boolean` on the doc-panel `Citation`/open path, defaulting to applicable so
     all chat citations are unchanged; tabular non-ensemble sets it `false`). The plan finalizes the exact
     field after reading `docpanel/docPanel.svelte.ts` + `DocumentPanel.svelte` + `citations/types.ts`.

## Testing

**Unit:**

- `tabularBuilder.svelte.test.ts`: `validColumns()` includes `ensemble_verification: true` when set,
  omits it when false/unset (parallel to the existing `minimum_inference_tier` test).
- `ColumnBuilder.svelte.test.ts`: toggling the checkbox calls `setColumn` with `ensemble_verification`.
- `CostPreviewModal.svelte.test.ts`: premium line renders when `ensemble_cells_count` > 0; absent when 0/missing.
- `types.test.ts` (parseTabularResults): `verification_method` parsed from a raw citation; null when absent.
- `citations/types.test.ts`: `ensemble_strict`/`ensemble_majority` → `citeState` `'verified'`.
- Doc-panel chip: a unit test (extend `DocumentPanel.svelte.test.ts`) that the chip is suppressed when
  the marker says verification doesn't apply, and shows green "✓ Verified" for an ensemble citation.

**Live e2e:** requires rebuilding the backend from the new pin — `docker compose up -d --build api
gateway arq-worker ingest-worker donna-web` (541bd6f). Then extend `tests/tabular-review.spec.ts` (or a
focused case): build a review with **one ensemble-verified column**, confirm the preview shows the
ensemble premium, run it (a real ensemble judge run — slower/costs judge calls), and assert a cell's
citation opens the doc panel with the green "✓ Verified" chip. Keep the assertion resilient (the LLM
content varies); gate on the chip + premium, not exact text. Use a PDF fixture (`.txt` won't ingest).

## Success criteria

1. A per-column **Ensemble verification** checkbox in the builder; checked columns send
   `ensemble_verification: true`; the preview shows the ensemble cell count + premium.
2. Tabular cell citations carry `verification_method`; ensemble-verified citations show a green
   **"✓ Verified"** chip in the doc panel; non-ensemble citations show **no** verification chip (P6-B.1
   closed — no more misleading "Unverified").
3. Chat citation verification behavior is unchanged.
4. `npm run check` = 0/0; no new lint; `npx vitest run` green; live e2e passes against the 541bd6f backend.

## Out of scope

- Surfacing `verification_method` inside the grid/`CellDetail` text (the doc-panel chip is the trust
  signal; the grid keeps its confidence dot). Optional `TabularCell.verification_method` may be parsed
  but need not be displayed in the grid.
- Provider-keys / BYOK (separate, still upstream-pending).
