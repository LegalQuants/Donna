# Tabular ensemble verification (P6-C.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire backend `ensemble_verification` into Donna's tabular surface — a per-column toggle, the cost premium, and `verification_method` on cell citations (closing the P6-B.1 doc-panel "Unverified" chip).

**Architecture:** Pure-frontend. The pin is already bumped to `541bd6f` + `gen:api` regenerated (commit `b917167`). Thread `ensemble_verification` through the builder's `ColumnDraft`/`validColumns()`; show the preview premium; hand-type + parse `verification_method` on `TabularCitation`; and in the doc panel, render a green "✓ Verified" chip for ensemble citations and suppress the chip entirely for non-ensemble ones — without changing chat citation behavior.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-04-tabular-ensemble-verification-design.md`

---

### Task 1: Thread `ensemble_verification` through the builder

**Files:**

- Modify: `src/lib/tabular/types.ts` (the `ColumnDraft` interface)
- Modify: `src/lib/tabular/tabularBuilder.svelte.ts` (`setColumn`, `validColumns`)
- Test: `src/lib/tabular/tabularBuilder.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — add to `tabularBuilder.svelte.test.ts` (mirror the existing `minimum_inference_tier` test; reuse its setup pattern for adding a column + setting fields):

```ts
it('includes ensemble_verification in validColumns only when toggled on', () => {
	const b = createTabularBuilder();
	b.addColumn();
	const id = b.columns[0].id;
	b.setColumn(id, { name: 'Governing law', query: 'What law governs?' });
	// off by default → field omitted
	expect(b.validColumns()[0]).not.toHaveProperty('ensemble_verification');
	// on → field present
	b.setColumn(id, { ensemble_verification: true });
	expect(b.validColumns()[0]).toMatchObject({ name: 'Governing law', ensemble_verification: true });
});
```

(If the builder's column-add API differs, match the existing test file's helpers — read it first.)

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts` (type error / missing field).

- [ ] **Step 3: Add the field to `ColumnDraft`** (`types.ts`):

```ts
export interface ColumnDraft {
	id: string;
	name: string;
	query: string;
	minimum_inference_tier?: number | null;
	ensemble_verification?: boolean | null;
}
```

- [ ] **Step 4: Extend `setColumn` + `validColumns`** (`tabularBuilder.svelte.ts`). `setColumn` Pick union:

```ts
    setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query' | 'minimum_inference_tier' | 'ensemble_verification'>>) {
      columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
```

`validColumns` — add `ensemble_verification` to the emitted spec when true (keep the minimal-omit style):

```ts
function validColumns(): ColumnSpec[] {
	return columns
		.map((c) => {
			const base: ColumnSpec = { name: c.name.trim(), query: c.query.trim() };
			if (c.minimum_inference_tier != null) base.minimum_inference_tier = c.minimum_inference_tier;
			if (c.ensemble_verification === true) base.ensemble_verification = true;
			return base;
		})
		.filter((c) => c.name.length > 0 && c.query.length > 0);
}
```

(`ColumnSpec` already has both optional fields from the regenerated `backend.d.ts`.)

- [ ] **Step 5: Run → pass** — `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`; then `npm run check` (0/0).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tabular/types.ts src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts
git commit -m "feat(tabular): thread per-column ensemble_verification into the request"
```

---

### Task 2: Ensemble checkbox in the column builder UI

**Files:**

- Modify: `src/lib/tabular/ColumnBuilder.svelte`
- Test: `src/lib/tabular/ColumnBuilder.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — add to `ColumnBuilder.svelte.test.ts` (match the file's existing render/setup; it already has a `builder` mock or real builder — reuse it):

```ts
it('toggling Ensemble verification calls setColumn with ensemble_verification', async () => {
	// render with one column (reuse the file's existing setup/helpers)
	const cb = screen.getByRole('checkbox', { name: /ensemble verification/i });
	await fireEvent.click(cb);
	expect(setColumnSpy).toHaveBeenCalledWith(expect.any(String), { ensemble_verification: true });
});
```

(Use the same spy/mechanism the existing tier-select test uses to observe `setColumn`.)

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/tabular/ColumnBuilder.svelte.test.ts` (no such checkbox).

- [ ] **Step 3: Add the checkbox** — in `ColumnBuilder.svelte`, immediately after the `Min. model tier` `<label>…</label>` block, add a sibling:

```svelte
<label class="flex items-center gap-2 text-xs text-mlq-muted">
	<input
		type="checkbox"
		checked={col.ensemble_verification ?? false}
		onchange={(e) =>
			builder.setColumn(col.id, { ensemble_verification: e.currentTarget.checked || null })}
		aria-label="Ensemble verification for {col.name || 'this column'}"
		class="rounded-mlq-control border border-mlq-subtle"
	/>
	Ensemble verification
</label>
```

(`checked || null` sends `true` when on and `null` when off, so `validColumns` omits it.)

- [ ] **Step 4: Run → pass** — `npx vitest run src/lib/tabular/ColumnBuilder.svelte.test.ts`; `npm run check` (0/0); `npx eslint src/lib/tabular/ColumnBuilder.svelte` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabular/ColumnBuilder.svelte src/lib/tabular/ColumnBuilder.svelte.test.ts
git commit -m "feat(tabular): per-column Ensemble verification checkbox"
```

---

### Task 3: Ensemble cost premium in the preview

**Files:**

- Modify: `src/lib/tabular/CostPreviewModal.svelte`
- Test: `src/lib/tabular/CostPreviewModal.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — add to `CostPreviewModal.svelte.test.ts` (reuse the file's existing render with a `preview` prop):

```ts
it('shows the ensemble premium line when ensemble cells are present', () => {
	render(CostPreviewModal, {
		props: {
			preview: {
				cells_count: 4,
				estimated_cost_usd: '0.10',
				per_tier_breakdown: {},
				ensemble_cells_count: 2,
				ensemble_premium_usd: '0.04'
			} /* + the other required props the file uses */
		} as never
	});
	expect(screen.getByText(/2 ensemble-verified cell/i)).toBeInTheDocument();
	expect(screen.getByText(/\+\$0\.04 ensemble premium/i)).toBeInTheDocument();
});

it('omits the premium line when there are no ensemble cells', () => {
	render(CostPreviewModal, {
		props: {
			preview: {
				cells_count: 4,
				estimated_cost_usd: '0.10',
				per_tier_breakdown: {}
			} /* + other props */
		} as never
	});
	expect(screen.queryByText(/ensemble premium/i)).not.toBeInTheDocument();
});
```

(Match the modal's actual required props from the existing test.)

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/tabular/CostPreviewModal.svelte.test.ts`.

- [ ] **Step 3: Add the premium line** — after the per-tier breakdown `{/if}` block, add:

```svelte
{#if preview.ensemble_cells_count}
	<p class="mt-2 text-xs text-mlq-muted">
		{preview.ensemble_cells_count} ensemble-verified cell{preview.ensemble_cells_count === 1
			? ''
			: 's'}
		· +${preview.ensemble_premium_usd ?? '0'} ensemble premium (included above)
	</p>
{/if}
```

- [ ] **Step 4: Run → pass**; `npm run check` (0/0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabular/CostPreviewModal.svelte src/lib/tabular/CostPreviewModal.svelte.test.ts
git commit -m "feat(tabular): show the ensemble cost premium in the preview"
```

---

### Task 4: Parse `verification_method` onto tabular citations

**Files:**

- Modify: `src/lib/tabular/types.ts` (`TabularCitation`, optionally `TabularCell`; the `parseTabularResults` citation `flatMap`)
- Test: `src/lib/tabular/types.test.ts`

- [ ] **Step 1: Write the failing test** — extend the existing "narrows navigable citations" test (around line 75) or add a case:

```ts
it('parses verification_method on a navigable citation (null when absent)', () => {
	const parsed = parseTabularResults({
		rows: [
			{
				document_id: 'd1',
				cells: {
					Col: {
						value: 'x',
						cited_chunk_ids: [],
						confidence: 'high',
						citations: [
							{
								source_file_id: 'f1',
								source_page: 2,
								source_text: 'q',
								verification_method: 'ensemble_strict'
							},
							{ source_file_id: 'f2', source_page: 1, source_text: 'r' }
						]
					}
				}
			}
		]
	} as never);
	const cites = parsed.rows[0].cells.Col.citations;
	expect(cites[0].verification_method).toBe('ensemble_strict');
	expect(cites[1].verification_method).toBeNull();
});
```

(Match `parseTabularResults`'s actual call signature/shape from the file.)

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/tabular/types.test.ts`.

- [ ] **Step 3: Add the field + parse.** `TabularCitation`:

```ts
export interface TabularCitation {
	source_file_id: string;
	source_page: number | null;
	source_text: string;
	document_id?: string;
	chunk_id?: string;
	verification_method?: string | null;
}
```

In the citation `flatMap` return object, add as the last field:

```ts
verification_method: typeof cc.verification_method === 'string' ? cc.verification_method : null;
```

- [ ] **Step 4: Run → pass**; `npm run check` (0/0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabular/types.ts src/lib/tabular/types.test.ts
git commit -m "feat(tabular): parse verification_method on cell citations"
```

---

### Task 5: Doc-panel presentation — green "✓ Verified" or no chip (closes P6-B.1)

**Files:**

- Modify: `src/lib/citations/types.ts` (GREEN set + `Citation` type)
- Modify: `src/lib/docpanel/DocumentPanel.svelte` (gate the chip)
- Modify: `src/routes/(app)/tabular/[executionId]/+page.svelte` (`openCitation`)
- Test: `src/lib/citations/types.test.ts`, `src/lib/docpanel/DocumentPanel.svelte.test.ts`

- [ ] **Step 1: Write the failing tests.**

In `citations/types.test.ts` (mirror existing `citeState` cases):

```ts
it('treats ensemble methods as verified (green)', () => {
	expect(citeState({ verified: true, verification_method: 'ensemble_strict' } as never)).toBe(
		'verified'
	);
	expect(citeState({ verified: true, verification_method: 'ensemble_majority' } as never)).toBe(
		'verified'
	);
});
```

In `DocumentPanel.svelte.test.ts` (reuse the file's existing render+docPanel setup that opens a PDF tab with a `cite`):

```ts
it('suppresses the verification chip when verificationApplicable is false', async () => {
	// open a tab whose cite has verificationApplicable: false (use the file's existing open helper)
	expect(screen.queryByText(/Verified|Caveats|Unverified/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/citations/types.test.ts src/lib/docpanel/DocumentPanel.svelte.test.ts`.

- [ ] **Step 3: GREEN set + Citation flag** (`citations/types.ts`):

```ts
const GREEN = new Set(['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']);
```

Extend the `Citation` type with the optional presentation flag:

```ts
export type Citation = components['schemas']['Citation'] & {
	verification_method?: VerificationMethod | (string & {});
	verification_confidence?: number | null;
	/** Doc-panel hint: when false, the verification chip is suppressed (e.g. a tabular citation in a non-ensemble column, which carries confidence, not verification). Undefined ⇒ chip shown (chat default). */
	verificationApplicable?: boolean;
};
```

- [ ] **Step 4: Gate the chip** (`DocumentPanel.svelte`) — wrap the chip `<span>` (the one rendering `✓ Verified / Caveats / Unverified`, currently lines ~120-125) in:

```svelte
{#if tab.cite?.verificationApplicable !== false}
	<span
		class="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold {cs === 'verified'
			? 'bg-mlq-success/15 text-mlq-success'
			: cs === 'caveats'
				? 'bg-mlq-caveats/15 text-mlq-caveats'
				: 'bg-mlq-error/15 text-mlq-error'}"
		title={tooltipFor(tab.cite)}
	>
		{cs === 'verified' ? '✓ Verified' : cs === 'caveats' ? 'Caveats' : 'Unverified'}
	</span>
{/if}
```

(Chat citations never set `verificationApplicable` → `!== false` is true → chip shown, unchanged.)

- [ ] **Step 5: Update `openCitation`** (`tabular/[executionId]/+page.svelte`) — replace the existing `openCitation` (the one with the P6-B.1 comment) with:

```ts
function openCitation(c: TabularCitation) {
	// Ensemble-verified cells carry a verification_method → show the green "✓ Verified" chip.
	// Non-ensemble cells have no verification concept (they convey trust via the grid's confidence
	// dot), so suppress the chip rather than mislabel them "Unverified" (closes P6-B.1).
	const verified = c.verification_method != null;
	docPanel.open({
		source_file_id: c.source_file_id,
		source_page: c.source_page,
		source_text: c.source_text,
		...(verified
			? { verified: true, verification_method: c.verification_method ?? undefined }
			: { verificationApplicable: false })
	} as Citation);
}
```

- [ ] **Step 6: Run → pass** — the two test files above; then `npm run check` (0/0), `npx eslint src/lib/citations/types.ts src/lib/docpanel/DocumentPanel.svelte "src/routes/(app)/tabular/[executionId]/+page.svelte"` (clean), `npx vitest run` (full suite green — confirm no chat-citation regressions in `citations/types.test.ts` / `citation-*`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/citations/types.ts src/lib/docpanel/DocumentPanel.svelte "src/routes/(app)/tabular/[executionId]/+page.svelte" src/lib/citations/types.test.ts src/lib/docpanel/DocumentPanel.svelte.test.ts
git commit -m "feat(tabular): doc-panel shows ✓ Verified for ensemble citations, no chip otherwise (closes P6-B.1)"
```

---

### Task 6: Live verification (controller-run, after the unit tasks)

**Files:** Modify `tests/tabular-review.spec.ts` (add/extend a case) — and a backend rebuild.

- [ ] **Step 1: Rebuild the stack from the new pin (541bd6f).** The api/gateway/workers must run the new backend for ensemble verification to execute:

```bash
set -a; . ./.env; set +a
docker compose up -d --build api gateway arq-worker ingest-worker donna-web
```

Wait for healthy.

- [ ] **Step 2: Add a focused e2e** in `tests/tabular-review.spec.ts` (reuse the file's `login` + PDF fixture + builder helpers): on `/tabular/new`, pick the PDF fixture, add ONE column with a question and **check Ensemble verification**, open the cost preview and assert the **ensemble premium** line is visible, run the review (real ensemble judge run — allow a long timeout, e.g. `test.setTimeout(180_000)`), wait for completion, open a cell with a citation, and assert the doc panel shows the green **"✓ Verified"** chip (`getByText('✓ Verified')`). Keep assertions resilient to LLM content variance — gate on the premium line + the verified chip, not exact cell text.

- [ ] **Step 3: Run live** — `set -a; . ./.env; set +a; npx playwright test tabular-review.spec.ts`. Expected: green (the ensemble path produces a verified citation).

- [ ] **Step 4: Commit**

```bash
git add tests/tabular-review.spec.ts
git commit -m "test(tabular): e2e — ensemble column shows premium + ✓ Verified citation"
```

---

## Notes for the executor

- **Gate bar:** `npm run check` = 0/0. No new lint. The pin bump + `gen:api` are already committed (`b917167`) — do NOT re-bump or re-gen.
- **Don't regress chat citations:** Task 5's GREEN/flag changes must leave chat behavior identical — `verificationApplicable` is undefined for chat citations (chip shown), and the ensemble methods are tabular-only. Confirm via the existing `citations/types.test.ts` + `tests/citation-*` specs staying green.
- **`verification_method` is loosely typed** in the backend `results` (DE-330), hence hand-typed in `parseTabularResults` (Task 4) — same pattern as the existing `source_*` fields.
- The live e2e (Task 6) is a **real ensemble run** (judge calls) — slower and incurs cost; that's expected. Use a PDF fixture (`.txt` won't ingest).
- After execution: whole-branch Opus review, then `finishing-a-development-branch` → PR. The PR carries the pin bump, so its description should note the `541bd6f` bump.
