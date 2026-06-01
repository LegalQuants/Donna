# P8 — Consolidated redline document pane — design spec

**Date:** 2026-05-31 · **Phase:** P8 · **Status:** approved, ready to plan

## Goal

Give playbook run results a second, document-style way to read the proposed changes: a **read-only
consolidated redline document** — every deviating position's redline rendered as a flowing
tracked-changes document with the issue/severity/justification in a right margin — toggled from the
existing run-results page. It complements (does not replace) the current per-position verdict cards.

## Decisions (settled in brainstorming, with the visual companion)

1. **What it renders: a consolidated change-set document**, not a full-contract reconstruction. It
   renders the redlines an execution already produces (the deviating positions). Full reconstruction
   was rejected — it needs full document text + reliable per-change positioning we don't have
   (only PDF bytes + fuzzy `matched_text`).
2. **Renderer: a lightweight custom Svelte/HTML/CSS component — no TipTap.** For a read-only view,
   TipTap/ProseMirror is a heavy dependency that's harder to unit-test and whose payoff (interactive
   editing) we don't need yet. **Deviation from the roadmap's "TipTap redline pane" label, recorded
   deliberately:** TipTap remains the path *if/when* interactive accept/reject + DOCX export is
   scoped — at which point this read-only renderer would be replaced. YAGNI until then.
3. **Layout: A — document + margin notes.** A centered document column; each change is a 2-column row:
   the tracked change (struck `old_text` in red, then `new_text` in green) on the left, and
   `issue` + severity + `justification` as a right-margin note (like contract-review comments).
4. **Entry: a view toggle on the run-results page** (`/playbooks/[id]/run`): **Verdict cards** (the
   current view, default) ⇄ **Redlines** (the new document). Same page, same data.

## Scope

One PR-sized slice. **In scope:** a new `RedlineDocument` component, a toggle hosted in
`ExecutionResults`, tests, and one live e2e assertion.

**Out of scope (non-goals), deferred:**

- DOCX / redline export.
- `cited_chunk_ids` → doc-panel citation linking.
- Full-contract reconstruction.
- Any editability (accept/reject/edit) — and therefore TipTap.
- Persisting the toggle state.

## Components

### `src/lib/playbooks/RedlineDocument.svelte` (new)

Pure/presentational — no I/O, no `load`, no controller.

- Props: `results: ExecutionResults`.
- Derives the rendered list: `results.positions` filtered to `redline != null`, sorted by
  **severity** (`critical` → `high` → `medium` → `low`), stable within a tier. (Rationale: redline
  positions are all `deviates`-class; `PositionResult` carries no `position_order`, so true document
  order isn't available — severity is the meaningful axis and matches the scorecard's worst-first
  spirit.) A pure helper for the severity rank keeps this testable.
- Renders a centered document column. Each change is a 2-column grid row:
  - **Left (the change):** the struck-through `old_text` (red) followed by `new_text` (green),
    using the existing red/green visual language of `RedlineBlocks.svelte`
    (`border-mlq-error`/`bg-mlq-error/5` line-through; `border-mlq-success`/`bg-mlq-success/5`). The
    change cell shows **only** the old/new pair — **not** the justification (which lives in the
    margin note, so it isn't rendered twice). To avoid duplicating the old/new markup across the two
    components, factor that pair into a tiny shared piece: extract a `RedlineChange.svelte`
    (old/new only) and have `RedlineBlocks` render `<RedlineChange>` + its justification, while
    `RedlineDocument` renders `<RedlineChange>` with the justification in the margin instead. (Keeps
    `RedlineBlocks`'s existing behavior/tests intact while sharing the visual.)
  - **Right margin (the note):** `issue` (label), `<SeverityBadge severity={…} />`, and
    `justification`.
- **Pure insertion** (`redline.old_text` empty/blank): render only the green insertion, no strike.
- **Empty state** (no positions with a redline): a quiet
  "No redlines — the contract matches the playbook's positions." message.
- **Responsive:** the 2-column grid collapses to a single column (margin note beneath the change) at
  narrow widths.

### `src/lib/playbooks/ExecutionResults.svelte` (edit)

Becomes the host of the view toggle.

- `ResultSummary` (the scorecard) stays pinned at the top in **both** views.
- Below it: a segmented **Verdict cards ⇄ Redlines** control. Ephemeral local `$state`, defaulting
  to **Verdict cards** (current behavior unchanged; Redlines is opt-in). a11y: the toggle is a
  labelled control (e.g. two `aria-pressed` buttons or a rad/tab group), keyboard-operable.
- Below the toggle: conditionally the existing sorted `ResultCard` list **or**
  `<RedlineDocument {results} />`.

## Data flow

None new. `RedlineDocument` renders from the `ExecutionResults` object the run page already loads/polls.
No new BFF proxies, no backend calls, no contract changes.

## Error handling

Nothing new to handle — no I/O introduced. The empty-state (no redlines) is the only special case and
is handled in `RedlineDocument`. Existing run-flow error handling is unchanged.

## Testing (TDD)

Unit/component (`@testing-library/svelte`, `render(C, { props })`):

- **`RedlineDocument.svelte.test.ts`** —
  - renders one change row per position with `redline != null`; positions with `redline: null` are
    filtered out;
  - severity ordering (a `low` + a `critical` input renders critical first);
  - pure insertion (empty `old_text`) renders the insertion and no strike element;
  - each change's margin note shows its `issue`, a severity badge, and `justification`;
  - empty-state message when no position has a redline.
- **`ExecutionResults` (extend the existing test / add one)** — toggle defaults to Verdict cards
  (cards visible, `RedlineDocument` absent); activating **Redlines** shows the redline document and
  hides the cards; `ResultSummary` present in both states.

Live e2e:

- **Extend `tests/playbooks-apply.spec.ts`** (which already performs one real ~52s execution and
  lands on the results view) to flip the toggle to **Redlines** and assert at least one change row
  renders (e.g. a struck `old_text` + green `new_text`). This avoids a second expensive live
  execution. Keep the existing assertions intact.

## Quality bar

`npm run check` 0 errors / 0 warnings; eslint clean (no `any`); component tests via
`@testing-library/svelte`. Established loop: TDD, fresh implementer per task with two-stage review
(spec compliance, then code quality), commit per task, whole-branch review, PR into `main`.

## Future work (not this slice)

- **Interactive redlining** (accept/reject/edit a change) → would reintroduce **TipTap** and replace
  this read-only renderer; pairs with **DOCX/redline export**.
- **`cited_chunk_ids` → doc-panel** linking, so each change opens its source passage (the doc panel
  already exists from P3).
- **True document order** for the redline list if the backend ever exposes `position_order` on the
  execution result.
