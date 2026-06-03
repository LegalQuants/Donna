# P6 Tabular Reviews — Slice C Design

**Date:** 2026-06-03 · **Phase:** P6 (largest FE build, sliced) · **Slice:** C (skill-based columns + advanced per-column options + reorder) ·
**Pin:** `vendor/lq-ai` @ `c22360a` (ensemble toggle gated on a future pin bump — see §5)

## What this is

Slices A/B shipped the tabular vertical (build → preview → run → cited grid → export) plus history,
resume, and cell→source citation nav. Slice C completes the builder's power surface:

1. **Table-skill mode** — run a review from a registered `output_format: table` **skill** instead of
   typing ad-hoc columns.
2. **Advanced per-column option** — per-column **`minimum_inference_tier`** floor (honored by the
   executor).
3. **Column reorder** — ↑/↓ on ad-hoc columns (grid order follows request order).
4. **`ensemble_verification`** per-column toggle — **pin-gated** (the backend currently ignores it; an
   upstream request wires it, then we expose the toggle).

## Decisions locked (brainstorm 2026-06-03)

1. **One slice (C)** — skill mode + per-column tier + reorder ship together (one builder surface).
2. **`ensemble_verification`:** it's **accepted-but-ignored** today (stored on the snapshot, never
   passed to the gateway — same no-op class as P5 `skill_inputs`). We **do not** expose a no-op control.
   An **upstream request** (`docs/upstream-requests/lq-ai-tabular-ensemble-verification.md`) wires it
   through the executor + cost; the per-column toggle is a **pin-gated final task** folded in once the
   SHA lands (else a fast follow, P6-C.1). The toggle's frontend contract (`ColumnSpec.ensemble_
   verification: boolean`) is already stable, so the rest of C does not depend on the pin.

## Spike results (live, 2026-06-03)

- **Skill mode has real content:** the running API serves **14 skills, 3 are `output_format: table`**
  (`contract-snapshot`, `msa-snapshot`, `nda-snapshot`, builtin, tier-2). The **`GET /api/v1/skills`
  summary carries `output_format`** → the frontend filters table skills client-side (no API filter
  param, no upstream needed).
- **Skill mode is execution-level:** `POST /tabular/{preview-cost,execute}` accept **`skill_name` XOR
  `columns`** (400 if both/neither). A skill resolves to its `frontmatter.lq_ai.columns`, **snapshotted
  onto the execution**, so `GET /tabular/executions/{id}` returns the resolved `columns[]` and the
  existing run-page grid renders skill runs **unchanged**.
- **No structured columns on skill detail:** `GET /api/v1/skills/{name}` returns `content_yaml` (raw
  frontmatter), **not** a structured `columns[]`. So the builder can't cheaply preview a skill's column
  *names* pre-run. The **cost preview returns `cells_count`** (→ "≈ N columns" = cells ÷ docs) and the
  **run page shows the actual columns**. Column-name preview in the builder is **out of scope** (optional
  future upstream ask to populate `columns` on detail).
- **`minimum_inference_tier` is honored** (`nodes.py` passes it to the gateway `ChatCompletionRequest`;
  can 403 if routed below floor; stored as `tier_used`). Cost estimate is a tier-agnostic rolling
  average in v0.3, but `per_tier_breakdown` (already shown in `CostPreviewModal`) buckets by tier.
- **`ensemble_verification` is a no-op** (only `state.py:30` stores it; `nodes.py` never reads it). →
  §5 + upstream request. **Backend-CC correction (2026-06-03):** the tabular cell path runs **no**
  Citation-Engine verification *at all* (`nodes.py:298-320` just stores `cited_chunk_ids`; DE-309), so
  the ask is "wire verification into the tabular path, in ensemble mode" (overlaps DE-309), not "swap a
  default." Bonus: surfacing a real `verification_method` on tabular cells also **closes P6-B.1** (the
  doc panel's "Unverified" chip on tabular citations) for verified columns — the panel already renders
  chat `verification_method` correctly.

## Architecture & components

### 1. Builder mode toggle (ad-hoc ↔ table skill)
`createTabularBuilder` gains:
- `mode: 'adhoc' | 'skill'` (`$state`, default `'adhoc'`) + `setMode(m)`.
- `selectedSkill: { name: string; title: string; description?: string } | null` + `selectSkill(s)` /
  `clearSkill()`.
- `canRun` becomes mode-aware: adhoc → `docs.length > 0 && validColumns().length > 0 && !duplicateNames`;
  skill → `docs.length > 0 && selectedSkill != null`.
- New `buildRequest(): { document_ids: string[] } & ({ columns: ColumnSpec[] } | { skill_name: string })`
  — the single source of truth for the preview/execute body (replaces the inline `validColumns()` body
  building in `+page.svelte`). Ad-hoc → `{ document_ids, columns }`; skill → `{ document_ids, skill_name }`.

The Columns section header gets a segmented control **"Define columns" | "Use a table skill"** (reuse the
`SegmentedControl` from `src/lib/preferences/` if it fits, else a small inline pair). Documents
(`DocumentMultiPicker`) are unchanged and required in both modes. Skill mode swaps `ColumnBuilder` for
the skill picker + a selected-skill summary card (title · description · "≈ N columns" once a cost preview
has run).

### 2. Table-skill picker (data via SSR)
`/tabular/new/+page.server.ts` (already loads matters/files) **also** loads `GET /api/v1/skills` via
`lqFetch`, filters to `output_format === 'table'`, and returns `tableSkills: { name, title, description? }[]`
(empty array on non-2xx — the picker shows an empty state, the builder still works in ad-hoc mode). New
`TableSkillPicker.svelte` is a **pure searchable list** over `data.tableSkills` (mirrors `MatterPicker`),
emitting the chosen skill to the builder. New type `TableSkillSummary` in `src/lib/tabular/types.ts`
(derived from the generated `SkillSummary`).

### 3. Advanced per-column option — `minimum_inference_tier` (ad-hoc mode)
`ColumnDraft` gains `minimum_inference_tier?: number | null`. `ColumnBuilder` per-column UI gains a small
**Advanced** disclosure with a tier `<select>` (None / 1–5, mirroring `MatterForm`). `setColumn` accepts
the new field; `validColumns()` returns `ColumnSpec`-shaped objects including `minimum_inference_tier`
when set (omit/`undefined` when "None"). The existing `CostPreviewModal` per-tier breakdown now reflects
real tiers.

### 4. Column reorder (ad-hoc mode)
`createTabularBuilder` gains `moveColumn(id, dir: -1 | 1)` (array swap, boundary-guarded — mirror
`PlaybookEditor.move()`). `ColumnBuilder` adds ↑/↓ buttons per column (disabled at boundaries, aria-
labelled). Grid column order follows the request `columns[]` order (verified backend-side).

### 5. `ensemble_verification` — PIN-GATED final task
Upstream request filed (`docs/upstream-requests/lq-ai-tabular-ensemble-verification.md`): wire the
column's `ensemble_verification` through the tabular executor (route those cells through the Citation
Engine ensemble stage) + reflect the premium in `preview-cost`. **Pin-gated task:** once the SHA lands →
bump `vendor/lq-ai` + regen types, add a per-column **Ensemble verification** checkbox (thread through
`ColumnDraft`/`setColumn`/`validColumns()` as `ensemble_verification: true`), and assert the cost premium
live. The field is already in `ColumnSpec`, so this task's frontend code is contract-stable; only the
*live-observe* assertion depends on the SHA. If the SHA isn't in by slice end, C ships without the toggle
(fast follow P6-C.1) — we do not expose a no-op control.

### 6. Wiring & reuse
No BFF proxy changes — `/tabular/{preview-cost,execute}` already forward the request body verbatim, so
sending `skill_name` or extended `ColumnSpec`s "just works"; the builder constructs the body via
`buildRequest()`. Run page, grid, `CellDetail`, export, history — all unchanged (skill runs resolve to
columns the grid already renders). Reuse: `MatterPicker`/`SkillAttach` (picker idiom), `MatterForm` tier
select, `PlaybookEditor.move()` (reorder), `SegmentedControl` (mode toggle).

## Testing
- **vitest:** builder mode switch + `buildRequest()` shape per mode; mode-aware `canRun`; `selectSkill`/
  `clearSkill`; `minimum_inference_tier` round-trip in `validColumns()` (set → included; None → omitted);
  `moveColumn` (swap + boundaries); `TableSkillPicker` render/search/select; `+page.server.ts` surfaces
  `tableSkills` (filters `output_format`; non-2xx → `[]`).
- **live e2e** (rebuild `donna-web` first; built-in table skill = real content): run a built-in **table
  skill** end-to-end → run page grid renders its resolved columns; an **ad-hoc** run with a per-column
  tier floor; **reorder** changes the grid column order. (Pin-gated: once ensemble lands, assert the cost
  premium when a column is ensemble-verified.)
- **Gate:** `npm run check` 0/0 · eslint clean · `npx vitest run` ≥ ~885 green.

## Risks & notes
- **Rebuild `donna-web`** before live e2e (serves built code). `.txt` won't ingest — `.pdf` fixtures.
- **0-warning bar:** no `any` / non-null `!`; seed reactive state via the established `untrack`/
  `$effect.pre` patterns.
- Skill-mode **column preview is intentionally count-only** (detail API lacks structured `columns`).
- `minimum_inference_tier` cost is informational per-tier (v0.3 rolling-average estimate); the floor is
  still functionally honored at execution.
- `cost_actual_usd` remains 0 (DE-310) — show the estimate.
