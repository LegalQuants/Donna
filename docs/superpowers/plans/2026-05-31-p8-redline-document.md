# P8 — Consolidated Redline Document Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, document-style "Redlines" view to playbook run results — every deviating position's redline rendered as a tracked-changes document with issue/severity/justification in a right margin — toggled from the existing verdict-card view.

**Architecture:** A new presentational `RedlineDocument.svelte` renders from the `ExecutionResults` object the run page already has (no new data/backend). The struck-old/green-new visual is extracted into a shared `RedlineChange.svelte` (reused by the existing `RedlineBlocks.svelte`). A pure `compareBySeverity` helper orders the changes. `ExecutionResults.svelte` gains a Verdict-cards ⇄ Redlines toggle hosting both views with the scorecard pinned above.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind `mlq-*` tokens, Vitest + @testing-library/svelte, Playwright for the live e2e. **No TipTap** (read-only custom renderer — see spec).

---

## Context the implementer needs

- **Spec:** `docs/superpowers/specs/2026-05-31-p8-redline-document-design.md`.
- **The data** (`src/lib/playbooks/types.ts`, already defined — do NOT redefine):
  ```ts
  export interface Redline {
  	new_text: string;
  	old_text: string;
  	justification: string;
  }
  export interface PositionResult {
  	issue: string;
  	position_id: string;
  	severity_if_missing: Position['severity_if_missing'];
  	verdict: Verdict;
  	confidence: number;
  	matched_text: string | null;
  	matched_fallback_rank: number | null;
  	justification: string;
  	redline: Redline | null;
  	cited_chunk_ids: string[];
  }
  export interface ExecutionResults {
  	schema_version: string;
  	summary: ResultSummary;
  	positions: PositionResult[];
  }
  ```
  `Position['severity_if_missing']` is the union `'critical' | 'high' | 'medium' | 'low'`.
- **Existing components to reuse:** `SeverityBadge.svelte` (prop `severity`; renders a pill with label Critical/High/Medium/Low), `RedlineBlocks.svelte` (current: old struck + new + justification).
- **Design tokens** (`src/app.css`): `mlq-error` (red), `mlq-success` (green), `mlq-subtle` (border), `mlq-muted`, `mlq-strong`, `rounded-mlq-control`. Existing redline visual: old = `border-l-2 border-mlq-error/40 bg-mlq-error/5 … text-mlq-error line-through`; new = `border-l-2 border-mlq-success/40 bg-mlq-success/5 … text-mlq-success`.
- **Conventions:** Svelte 5 runes (`$props`, `$state`, `$derived`); component tests `render(C, { props })`; **no `any`** and **no non-null assertions** (`!`) — narrow with a type predicate instead; quality bar `npm run check` = `0 ERRORS 0 WARNINGS` (a vendor `ERR_MODULE_NOT_FOUND` stderr line is expected/harmless — success is the `COMPLETED … 0 ERRORS 0 WARNINGS` line). Run unit tests with `npx vitest run <file>`.
- **No run-page change:** the toggle lives inside `ExecutionResults.svelte`, which the run page already renders when an execution has results.

## File structure

- **Create** `src/lib/playbooks/RedlineChange.svelte` — the old/new tracked-change pair only (no justification). One responsibility: render a single `Redline`'s strike+insert, handling pure insertions.
- **Create** `src/lib/playbooks/RedlineChange.svelte.test.ts`.
- **Modify** `src/lib/playbooks/RedlineBlocks.svelte` — render `<RedlineChange>` + the justification (preserves current output + its test).
- **Create** `src/lib/playbooks/severity.ts` — pure `compareBySeverity(a, b)`.
- **Create** `src/lib/playbooks/severity.test.ts`.
- **Create** `src/lib/playbooks/RedlineDocument.svelte` — the consolidated document (filter → sort → grid rows + margin notes + empty state).
- **Create** `src/lib/playbooks/RedlineDocument.svelte.test.ts`.
- **Modify** `src/lib/playbooks/ExecutionResults.svelte` — add the view toggle.
- **Modify** `src/lib/playbooks/ExecutionResults.svelte.test.ts` — toggle test.
- **Modify** `tests/playbooks-apply.spec.ts` — extend the existing live run to exercise the toggle.

---

## Task 1: Extract `RedlineChange` and refactor `RedlineBlocks` to use it

**Files:**

- Create: `src/lib/playbooks/RedlineChange.svelte`
- Create: `src/lib/playbooks/RedlineChange.svelte.test.ts`
- Modify: `src/lib/playbooks/RedlineBlocks.svelte`

- [ ] **Step 1: Write the failing test for `RedlineChange`**

Create `src/lib/playbooks/RedlineChange.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineChange from './RedlineChange.svelte';

describe('RedlineChange', () => {
	it('renders the old text struck-through and the new text', () => {
		render(RedlineChange, {
			props: {
				redline: { old_text: 'ninety (90) days', new_text: 'thirty (30) days', justification: 'j' }
			}
		});
		const oldEl = screen.getByText('ninety (90) days');
		expect(oldEl.className).toMatch(/line-through/);
		expect(screen.getByText('thirty (30) days')).toBeInTheDocument();
	});

	it('renders only the insertion when old_text is empty (pure insertion)', () => {
		const { container } = render(RedlineChange, {
			props: {
				redline: { old_text: '', new_text: 'Added confidentiality clause.', justification: 'j' }
			}
		});
		expect(screen.getByText('Added confidentiality clause.')).toBeInTheDocument();
		expect(container.querySelector('.line-through')).toBeNull();
	});

	it('does not render the justification (that belongs to the caller)', () => {
		render(RedlineChange, {
			props: { redline: { old_text: 'a', new_text: 'b', justification: 'SHOULD NOT APPEAR' } }
		});
		expect(screen.queryByText('SHOULD NOT APPEAR')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/playbooks/RedlineChange.svelte.test.ts`
Expected: FAIL — `./RedlineChange.svelte` does not exist.

- [ ] **Step 3: Create `RedlineChange.svelte`**

```svelte
<script lang="ts">
	import type { Redline } from './types';
	let { redline }: { redline: Redline } = $props();
	const hasOld = $derived(redline.old_text.trim().length > 0);
</script>

<div class="space-y-1">
	{#if hasOld}
		<div
			class="border-l-2 border-mlq-error/40 bg-mlq-error/5 px-2 py-1 text-xs text-mlq-error line-through"
		>
			{redline.old_text}
		</div>
	{/if}
	<div class="border-l-2 border-mlq-success/40 bg-mlq-success/5 px-2 py-1 text-xs text-mlq-success">
		{redline.new_text}
	</div>
</div>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/playbooks/RedlineChange.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `RedlineBlocks.svelte` to use `RedlineChange`**

Replace the entire contents of `src/lib/playbooks/RedlineBlocks.svelte`:

```svelte
<script lang="ts">
	import type { Redline } from './types';
	import RedlineChange from './RedlineChange.svelte';
	let { redline }: { redline: Redline } = $props();
</script>

<div class="space-y-1">
	<RedlineChange {redline} />
	{#if redline.justification}
		<p class="text-xs text-mlq-muted">{redline.justification}</p>
	{/if}
</div>
```

- [ ] **Step 6: Run the existing `RedlineBlocks` test to confirm it still passes**

Run: `npx vitest run src/lib/playbooks/RedlineBlocks.svelte.test.ts`
Expected: PASS (2 tests — old struck-through + new, and justification still render).

- [ ] **Step 7: Run the check gate**

Run: `npm run check`
Expected: `COMPLETED … 0 ERRORS 0 WARNINGS`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/playbooks/RedlineChange.svelte src/lib/playbooks/RedlineChange.svelte.test.ts src/lib/playbooks/RedlineBlocks.svelte
git commit -m "refactor(playbooks): extract RedlineChange (old/new pair) shared by RedlineBlocks"
```

---

## Task 2: `compareBySeverity` pure helper

**Files:**

- Create: `src/lib/playbooks/severity.ts`
- Create: `src/lib/playbooks/severity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/severity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compareBySeverity } from './severity';
import type { PositionResult } from './types';

const pos = (severity: PositionResult['severity_if_missing'], id: string): PositionResult => ({
	issue: id,
	position_id: id,
	severity_if_missing: severity,
	verdict: 'deviates',
	confidence: 1,
	matched_text: null,
	matched_fallback_rank: null,
	justification: '',
	redline: null,
	cited_chunk_ids: []
});

describe('compareBySeverity', () => {
	it('orders critical → high → medium → low', () => {
		const sorted = [
			pos('low', 'a'),
			pos('critical', 'b'),
			pos('medium', 'c'),
			pos('high', 'd')
		].sort(compareBySeverity);
		expect(sorted.map((p) => p.severity_if_missing)).toEqual(['critical', 'high', 'medium', 'low']);
	});

	it('is stable within a severity tier (preserves input order)', () => {
		const sorted = [pos('high', 'x'), pos('high', 'y'), pos('high', 'z')].sort(compareBySeverity);
		expect(sorted.map((p) => p.position_id)).toEqual(['x', 'y', 'z']);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/playbooks/severity.test.ts`
Expected: FAIL — `./severity` does not exist.

- [ ] **Step 3: Create `severity.ts`**

```ts
import type { Position, PositionResult } from './types';

const SEVERITY_RANK: Record<Position['severity_if_missing'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};

/** Sort comparator: critical-first, then high, medium, low. Stable within a tier
 *  (Array.prototype.sort is stable in V8). */
export function compareBySeverity(a: PositionResult, b: PositionResult): number {
	return SEVERITY_RANK[a.severity_if_missing] - SEVERITY_RANK[b.severity_if_missing];
}
```

(`Position` and `PositionResult` are both exported from `src/lib/playbooks/types.ts`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/playbooks/severity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: `COMPLETED … 0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/playbooks/severity.ts src/lib/playbooks/severity.test.ts
git commit -m "feat(playbooks): compareBySeverity helper for redline ordering"
```

---

## Task 3: `RedlineDocument.svelte`

**Files:**

- Create: `src/lib/playbooks/RedlineDocument.svelte`
- Create: `src/lib/playbooks/RedlineDocument.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/RedlineDocument.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineDocument from './RedlineDocument.svelte';
import type { ExecutionResults as Results, PositionResult, Redline } from './types';

const change = (
	issue: string,
	severity: PositionResult['severity_if_missing'],
	redline: Redline | null
): PositionResult => ({
	issue,
	position_id: issue,
	severity_if_missing: severity,
	verdict: 'deviates',
	confidence: 1,
	matched_text: null,
	matched_fallback_rank: null,
	justification: 'verdict-j',
	redline,
	cited_chunk_ids: []
});

const wrap = (positions: PositionResult[]): Results => ({
	schema_version: 'm3-a2-v1',
	summary: { matches_standard: 0, matches_fallback: 0, deviates: positions.length, missing: 0 },
	positions
});

describe('RedlineDocument', () => {
	it('renders one change per redline position, severity-ordered, filtering null redlines', () => {
		const results = wrap([
			change('Low Issue', 'low', { old_text: 'a', new_text: 'b', justification: 'jl' }),
			change('No Redline', 'critical', null),
			change('Crit Issue', 'critical', { old_text: 'c', new_text: 'd', justification: 'jc' })
		]);
		render(RedlineDocument, { props: { results } });
		expect(screen.queryByText('No Redline')).not.toBeInTheDocument();
		const issues = screen.getAllByText(/Issue$/).map((e) => e.textContent);
		expect(issues).toEqual(['Crit Issue', 'Low Issue']);
	});

	it('shows the issue, severity badge, and the redline justification in the margin note', () => {
		const results = wrap([
			change('Term', 'high', { old_text: 'x', new_text: 'y', justification: 'because reasons' })
		]);
		render(RedlineDocument, { props: { results } });
		expect(screen.getByText('Term')).toBeInTheDocument();
		expect(screen.getByText('High')).toBeInTheDocument();
		expect(screen.getByText('because reasons')).toBeInTheDocument();
	});

	it('renders a pure insertion (empty old_text) with no struck text', () => {
		const results = wrap([
			change('Add', 'medium', { old_text: '', new_text: 'New clause', justification: 'j' })
		]);
		const { container } = render(RedlineDocument, { props: { results } });
		expect(screen.getByText('New clause')).toBeInTheDocument();
		expect(container.querySelector('.line-through')).toBeNull();
	});

	it('shows an empty state when no position has a redline', () => {
		const results = wrap([change('A', 'high', null), change('B', 'low', null)]);
		render(RedlineDocument, { props: { results } });
		expect(screen.getByText(/No redlines/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/playbooks/RedlineDocument.svelte.test.ts`
Expected: FAIL — `./RedlineDocument.svelte` does not exist.

- [ ] **Step 3: Create `RedlineDocument.svelte`**

```svelte
<script lang="ts">
	import type { ExecutionResults, PositionResult, Redline } from './types';
	import { compareBySeverity } from './severity';
	import RedlineChange from './RedlineChange.svelte';
	import SeverityBadge from './SeverityBadge.svelte';

	let { results }: { results: ExecutionResults } = $props();

	// Only positions with a redline; narrow via predicate so `c.redline` is non-null
	// (no `!`). Severity-ordered, critical-first.
	const changes = $derived(
		results.positions
			.filter((p): p is PositionResult & { redline: Redline } => p.redline !== null)
			.sort(compareBySeverity)
	);
</script>

{#if changes.length === 0}
	<p
		class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
	>
		No redlines — the contract matches the playbook's positions.
	</p>
{:else}
	<div class="space-y-5">
		{#each changes as c (c.position_id)}
			<div class="grid gap-3 sm:grid-cols-[1fr_minmax(0,12rem)]">
				<div><RedlineChange redline={c.redline} /></div>
				<div class="space-y-1 text-xs">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-mlq-strong">{c.issue}</span>
						<SeverityBadge severity={c.severity_if_missing} />
					</div>
					<p class="text-mlq-muted">{c.redline.justification}</p>
				</div>
			</div>
		{/each}
	</div>
{/if}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/playbooks/RedlineDocument.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: `COMPLETED … 0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/playbooks/RedlineDocument.svelte src/lib/playbooks/RedlineDocument.svelte.test.ts
git commit -m "feat(playbooks): RedlineDocument — consolidated read-only redline view"
```

---

## Task 4: View toggle in `ExecutionResults.svelte`

**Files:**

- Modify: `src/lib/playbooks/ExecutionResults.svelte`
- Modify: `src/lib/playbooks/ExecutionResults.svelte.test.ts`

- [ ] **Step 1: Add the failing toggle test**

In `src/lib/playbooks/ExecutionResults.svelte.test.ts`, change the import line:

```ts
import { render, screen } from '@testing-library/svelte';
```

to:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
```

Then add this `it` inside the `describe('ExecutionResults', …)` block (the existing `results` fixture has all `redline: null`, so the Redlines view shows its empty state — which proves `RedlineDocument` rendered and the cards are hidden):

```ts
it('toggles between verdict cards and the redline document', async () => {
	render(ExecutionResults, { props: { results } });
	// Defaults to the verdict-card view.
	expect(screen.getByText('Dev One')).toBeInTheDocument();
	// Switch to Redlines: cards hidden, redline view shown, scorecard still present.
	await fireEvent.click(screen.getByRole('button', { name: 'Redlines' }));
	expect(screen.queryByText('Dev One')).not.toBeInTheDocument();
	expect(screen.getByText(/No redlines/i)).toBeInTheDocument();
	expect(screen.getByText('1 Missing')).toBeInTheDocument();
	// Switch back.
	await fireEvent.click(screen.getByRole('button', { name: 'Verdict cards' }));
	expect(screen.getByText('Dev One')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/playbooks/ExecutionResults.svelte.test.ts`
Expected: the new test FAILS (no "Redlines" button yet); the existing "renders the scorecard and orders cards worst-first" test still PASSES.

- [ ] **Step 3: Add the toggle to `ExecutionResults.svelte`**

Replace the entire contents of `src/lib/playbooks/ExecutionResults.svelte`:

```svelte
<script lang="ts">
	import type { ExecutionResults } from './types';
	import { compareByVerdict } from './verdict';
	import ResultSummary from './ResultSummary.svelte';
	import ResultCard from './ResultCard.svelte';
	import RedlineDocument from './RedlineDocument.svelte';

	let { results }: { results: ExecutionResults } = $props();
	const ordered = $derived([...results.positions].sort(compareByVerdict));
	let view = $state<'cards' | 'redlines'>('cards');

	const segClass = (active: boolean) =>
		`rounded-mlq-control px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow ${
			active ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'
		}`;
</script>

<ResultSummary summary={results.summary} />

<div
	class="mt-3 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1"
	role="group"
	aria-label="Results view"
>
	<button
		type="button"
		aria-pressed={view === 'cards'}
		class={segClass(view === 'cards')}
		onclick={() => (view = 'cards')}>Verdict cards</button
	>
	<button
		type="button"
		aria-pressed={view === 'redlines'}
		class={segClass(view === 'redlines')}
		onclick={() => (view = 'redlines')}>Redlines</button
	>
</div>

{#if view === 'cards'}
	<div class="mt-4 space-y-3">
		{#each ordered as result (result.position_id)}<ResultCard {result} />{/each}
	</div>
{:else}
	<div class="mt-4"><RedlineDocument {results} /></div>
{/if}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/playbooks/ExecutionResults.svelte.test.ts`
Expected: PASS (both tests — existing worst-first ordering + the new toggle).

- [ ] **Step 5: Run the check gate + full unit suite**

Run: `npm run check`
Expected: `COMPLETED … 0 ERRORS 0 WARNINGS`.
Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/playbooks/ExecutionResults.svelte src/lib/playbooks/ExecutionResults.svelte.test.ts
git commit -m "feat(playbooks): Verdict cards / Redlines view toggle on run results"
```

---

## Task 5: Extend the live e2e

**Files:**

- Modify: `tests/playbooks-apply.spec.ts`

- [ ] **Step 1: Add the toggle assertions to the existing test**

In `tests/playbooks-apply.spec.ts`, the test currently ends with:

```ts
  // Results render: the scorecard + at least one verdict card with a redline.
  await expect(page.getByText(/\d+ Standard/)).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText('Suggested redline').first()).toBeVisible();
});
```

Replace those last lines (keep everything above, including the `setTimeout`, login, navigation, and upload) with:

```ts
  // Results render: the scorecard + at least one verdict card with a redline.
  await expect(page.getByText(/\d+ Standard/)).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText('Suggested redline').first()).toBeVisible();

  // Toggle to the consolidated Redlines view: the verdict cards' "Suggested redline"
  // label is gone, and the redline document shows at least one struck change.
  await page.getByRole('button', { name: 'Redlines' }).click();
  await expect(page.getByText('Suggested redline')).toHaveCount(0);
  await expect(page.locator('.line-through').first()).toBeVisible();

  // Toggle back restores the verdict cards.
  await page.getByRole('button', { name: 'Verdict cards' }).click();
  await expect(page.getByText('Suggested redline').first()).toBeVisible();
});
```

(Note: the existing test already requires a `deviates` position with a "Suggested redline" to be present, and such redlines carry the matched clause as `old_text`, so `.line-through` will be present in the Redlines view.)

- [ ] **Step 2: Ensure the stack is up, then run the e2e**

Confirm the app responds: `curl -s -o /dev/null -w "%{http_code}" http://localhost:13002/` → expect `303` or `200`. If the running `donna-web` container predates this branch, rebuild it first: `docker compose up -d --build donna-web` (the container serves built code, not live `src/`).

Run: `set -a; . ./.env; set +a; npx playwright test tests/playbooks-apply.spec.ts`
Expected: `1 passed` (a real ingest + ~52s LLM execution, then the toggle assertions).

- [ ] **Step 3: Commit**

```bash
git add tests/playbooks-apply.spec.ts
git commit -m "test(playbooks): exercise the Redlines view toggle in the apply e2e"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` → `0 ERRORS 0 WARNINGS`.
- [ ] `npx vitest run` → all green (incl. RedlineChange, severity, RedlineDocument, ExecutionResults toggle, and the unchanged RedlineBlocks test).
- [ ] `set -a; . ./.env; set +a; npx playwright test tests/playbooks-apply.spec.ts` → `1 passed`.
- [ ] Manual smoke at http://localhost:13002: apply a playbook → on results, toggle **Redlines** → changes render as a document with margin notes; toggle back to **Verdict cards**.
- [ ] Whole-branch review (opus), then `superpowers:finishing-a-development-branch` → PR into `main`.

## Notes / non-goals (do not implement)

- No TipTap, no editability (accept/reject), no DOCX/redline export.
- No `cited_chunk_ids` → doc-panel linking.
- No full-contract reconstruction.
- Do not persist the toggle state (ephemeral `$state`).
- Do not modify `src/routes/(app)/playbooks/[id]/run/+page.svelte` — the toggle lives inside `ExecutionResults`.
