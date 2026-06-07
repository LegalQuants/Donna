# Playbooks Apply + Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a playbook's detail page, an admin runs the playbook against a contract (uploaded or chosen from a matter), polls the async execution, and sees a verdict scorecard + per-position results with stacked old→new redlines, on a reload-safe `/playbooks/[id]/run` page.

**Architecture:** SSR `load` (admin-gated; playbook + matters + optional `?matter` files + optional `?execution` resume) on a dedicated run route; three new JSON BFF proxies (`POST /files`, `POST /playbooks/[id]/execute`, `GET /playbook-executions/[id]`); a client rune controller (`runFlow.svelte.ts`) that orchestrates upload→ingest-poll→execute→execution-poll via plain `fetch`. Reuses slice-A `SeverityBadge`, P4-1 `MatterPicker`, P4-3a `Dropzone`. No backend change.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide.

**Spec:** `docs/superpowers/specs/2026-05-30-donna-playbooks-apply-design.md`

**Conventions:** TDD; commit per task; push regularly. `npm run check` = 0 errors/0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless — signal = exit 0 + the "0 errors and 0 warnings" line). eslint clean (no `any`). In-app `<a href>` links need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- … -->`. Server-test pattern: `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)` (see `skills/[id]/page.server.test.ts`). Component-test pattern: `@testing-library/svelte` `render`/`screen` (see slice-A tests).

**Spike facts (live `438198c`):** `target_document_id` = the File's `document_id` (parsed Document UUID). Execute is admin-only for built-ins. Results schema `m3-a2-v1` — see Task 1 types. Sample contract for the e2e: `vendor/lq-ai/docs/quickstart/sample-ndas/nda-1-acme-beta.pdf`.

---

## File Structure

| File                                                           | C/M | Responsibility                                                                                               |
| -------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------ |
| `src/lib/playbooks/types.ts`                                   | M   | Add `PlaybookExecution` + hand-typed `Verdict`/`Redline`/`PositionResult`/`ResultSummary`/`ExecutionResults` |
| `src/lib/playbooks/verdict.ts` (+test)                         | C   | Pure verdict ordering/labels/badge classes                                                                   |
| `src/lib/playbooks/VerdictBadge.svelte` (+test)                | C   | verdict → chip                                                                                               |
| `src/lib/playbooks/RedlineBlocks.svelte` (+test)               | C   | redline → old/new blocks                                                                                     |
| `src/lib/playbooks/ResultSummary.svelte` (+test)               | C   | scorecard                                                                                                    |
| `src/lib/playbooks/ResultCard.svelte` (+test)                  | C   | one PositionResult                                                                                           |
| `src/lib/playbooks/ExecutionResults.svelte` (+test)            | C   | summary + worst-first cards                                                                                  |
| `src/routes/(app)/files/+server.ts` (+test)                    | C   | upload proxy (POST)                                                                                          |
| `src/routes/(app)/playbooks/[id]/execute/+server.ts` (+test)   | C   | execute proxy (POST)                                                                                         |
| `src/routes/(app)/playbook-executions/[id]/+server.ts` (+test) | C   | execution poll proxy (GET)                                                                                   |
| `src/routes/(app)/playbooks/[id]/run/+page.server.ts` (+test)  | C   | run-page load (admin gate, playbook, matters, ?matter, ?execution)                                           |
| `src/lib/playbooks/runFlow.svelte.ts` (+test)                  | C   | client run state-machine                                                                                     |
| `src/lib/playbooks/DocumentChooser.svelte` (+test)             | C   | Upload \| Choose-from-matter tabs                                                                            |
| `src/lib/playbooks/RunProgress.svelte` (+test)                 | C   | progress stepper                                                                                             |
| `src/routes/(app)/playbooks/[id]/run/+page.svelte`             | C   | composition (covered by e2e)                                                                                 |
| `src/routes/(app)/playbooks/[id]/+page.server.ts` (+test)      | M   | add `isAdmin` to load                                                                                        |
| `src/routes/(app)/playbooks/[id]/+page.svelte` (+test)         | M   | admin-gated Apply affordance                                                                                 |
| `tests/playbooks-apply.spec.ts`                                | C   | live e2e                                                                                                     |

Page `run/+page.svelte` is a thin composition covered by component tests + the live e2e (no separate page.svelte.test.ts), matching slice A.

---

## Task 1: Result types + verdict helpers

**Files:** Modify `src/lib/playbooks/types.ts`; Create `src/lib/playbooks/verdict.ts`, `src/lib/playbooks/verdict.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/verdict.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VERDICTS, verdictMeta, compareByVerdict } from './verdict';
import type { PositionResult } from './types';

const pr = (verdict: PositionResult['verdict']): PositionResult => ({ verdict }) as PositionResult;

describe('verdict helpers', () => {
	it('orders verdicts worst-first', () => {
		expect(VERDICTS).toEqual(['missing', 'deviates', 'matches_fallback', 'matches_standard']);
	});
	it('maps each verdict to a label and a badge class', () => {
		expect(verdictMeta('matches_standard').label).toBe('Standard');
		expect(verdictMeta('matches_fallback').label).toBe('Fallback');
		expect(verdictMeta('deviates').label).toBe('Deviates');
		expect(verdictMeta('missing').label).toBe('Missing');
		expect(verdictMeta('missing').badgeClass).toMatch(/mlq-error/);
	});
	it('sorts position results worst-first via compareByVerdict', () => {
		const sorted = [
			pr('matches_standard'),
			pr('missing'),
			pr('matches_fallback'),
			pr('deviates')
		].sort(compareByVerdict);
		expect(sorted.map((p) => p.verdict)).toEqual([
			'missing',
			'deviates',
			'matches_fallback',
			'matches_standard'
		]);
	});
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/playbooks/verdict.test.ts`

- [ ] **Step 3: Implement.** Append to `src/lib/playbooks/types.ts`:

```ts
export type PlaybookExecution = components['schemas']['PlaybookExecution'];

export type Verdict = 'matches_standard' | 'matches_fallback' | 'deviates' | 'missing';

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

export interface ResultSummary {
	matches_standard: number;
	matches_fallback: number;
	deviates: number;
	missing: number;
}

/** The `PlaybookExecution.results` payload (schema `m3-a2-v1`). Hand-typed:
 *  the generated contract types `results` loosely as `{ [k]: unknown }`. */
export interface ExecutionResults {
	schema_version: string;
	summary: ResultSummary;
	positions: PositionResult[];
}
```

Create `src/lib/playbooks/verdict.ts`:

```ts
import type { Verdict, PositionResult, ResultSummary } from './types';

/** Verdicts ordered worst-first (drives result sorting + the scorecard). */
export const VERDICTS: Verdict[] = ['missing', 'deviates', 'matches_fallback', 'matches_standard'];

interface VerdictMeta {
	label: string;
	/** Tailwind classes: same-hue saturated text on a light tint of the same hue. */
	badgeClass: string;
}

const META: Record<Verdict, VerdictMeta> = {
	missing: { label: 'Missing', badgeClass: 'bg-mlq-error/15 text-mlq-error' },
	deviates: { label: 'Deviates', badgeClass: 'bg-mlq-caveats/20 text-mlq-caveats' },
	matches_fallback: { label: 'Fallback', badgeClass: 'bg-mlq-workflow/15 text-mlq-workflow' },
	matches_standard: { label: 'Standard', badgeClass: 'bg-mlq-verified/15 text-mlq-verified' }
};

export function verdictMeta(v: Verdict): VerdictMeta {
	return META[v];
}

export function compareByVerdict(a: PositionResult, b: PositionResult): number {
	return VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict);
}

/** Scorecard rows in worst-first order, with their summary counts. */
export const SUMMARY_ROWS: { verdict: Verdict; key: keyof ResultSummary }[] = VERDICTS.map((v) => ({
	verdict: v,
	key: v as keyof ResultSummary
}));
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/playbooks/verdict.test.ts` (3 tests).
- [ ] **Step 5: Verify `npm run check`** → 0/0.
- [ ] **Step 6: Commit** — `git add src/lib/playbooks/types.ts src/lib/playbooks/verdict.ts src/lib/playbooks/verdict.test.ts && git commit -m "feat(playbooks): execution result types + verdict helpers"`

---

## Task 2: VerdictBadge

**Files:** Create `src/lib/playbooks/VerdictBadge.svelte` (+`.svelte.test.ts`)

- [ ] **Step 1: Failing test** — `src/lib/playbooks/VerdictBadge.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import VerdictBadge from './VerdictBadge.svelte';

describe('VerdictBadge', () => {
	it('renders the verdict label', () => {
		render(VerdictBadge, { props: { verdict: 'deviates' } });
		expect(screen.getByText('Deviates')).toBeInTheDocument();
	});
	it('appends the fallback rank when matches_fallback with a rank', () => {
		render(VerdictBadge, { props: { verdict: 'matches_fallback', fallbackRank: 1 } });
		expect(screen.getByText(/Fallback · tier 1/)).toBeInTheDocument();
	});
	it('uses the error token for missing', () => {
		render(VerdictBadge, { props: { verdict: 'missing' } });
		expect(screen.getByText('Missing').className).toMatch(/mlq-error/);
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/playbooks/VerdictBadge.svelte.test.ts`
- [ ] **Step 3: Implement** — `src/lib/playbooks/VerdictBadge.svelte`:

```svelte
<script lang="ts">
	import type { Verdict } from './types';
	import { verdictMeta } from './verdict';

	let { verdict, fallbackRank = null }: { verdict: Verdict; fallbackRank?: number | null } =
		$props();
	const meta = $derived(verdictMeta(verdict));
	const label = $derived(
		verdict === 'matches_fallback' && fallbackRank != null
			? `${meta.label} · tier ${fallbackRank}`
			: meta.label
	);
</script>

<span
	class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase {meta.badgeClass}"
	>{label}</span
>
```

- [ ] **Step 4: Verify pass** (3 tests).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/VerdictBadge.svelte src/lib/playbooks/VerdictBadge.svelte.test.ts && git commit -m "feat(playbooks): VerdictBadge"`

---

## Task 3: RedlineBlocks

**Files:** Create `src/lib/playbooks/RedlineBlocks.svelte` (+`.svelte.test.ts`)

- [ ] **Step 1: Failing test** — `src/lib/playbooks/RedlineBlocks.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineBlocks from './RedlineBlocks.svelte';

const redline = {
	old_text: 'survive for five (5) years',
	new_text: 'survive for so long as it remains a trade secret',
	justification: 'Align with standard.'
};

describe('RedlineBlocks', () => {
	it('renders the old text struck-through and the new text', () => {
		render(RedlineBlocks, { props: { redline } });
		const oldEl = screen.getByText(/survive for five \(5\) years/);
		expect(oldEl.className).toMatch(/line-through/);
		expect(screen.getByText(/so long as it remains a trade secret/)).toBeInTheDocument();
	});
	it('renders the redline justification', () => {
		render(RedlineBlocks, { props: { redline } });
		expect(screen.getByText(/Align with standard/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/RedlineBlocks.svelte`:

```svelte
<script lang="ts">
	import type { Redline } from './types';
	let { redline }: { redline: Redline } = $props();
</script>

<div class="space-y-1">
	<div
		class="border-l-2 border-mlq-error/40 bg-mlq-error/5 px-2 py-1 text-xs text-mlq-error line-through"
	>
		{redline.old_text}
	</div>
	<div class="border-l-2 border-mlq-success/40 bg-mlq-success/5 px-2 py-1 text-xs text-mlq-success">
		{redline.new_text}
	</div>
	{#if redline.justification}
		<p class="text-xs text-mlq-muted">{redline.justification}</p>
	{/if}
</div>
```

- [ ] **Step 4: Verify pass** (2 tests).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/RedlineBlocks.svelte src/lib/playbooks/RedlineBlocks.svelte.test.ts && git commit -m "feat(playbooks): RedlineBlocks (stacked old→new)"`

---

## Task 4: ResultSummary (scorecard)

**Files:** Create `src/lib/playbooks/ResultSummary.svelte` (+`.svelte.test.ts`)

- [ ] **Step 1: Failing test** — `src/lib/playbooks/ResultSummary.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultSummary from './ResultSummary.svelte';

describe('ResultSummary', () => {
	it('renders a chip per verdict with its count', () => {
		render(ResultSummary, {
			props: { summary: { matches_standard: 5, matches_fallback: 2, deviates: 1, missing: 0 } }
		});
		expect(screen.getByText('5 Standard')).toBeInTheDocument();
		expect(screen.getByText('2 Fallback')).toBeInTheDocument();
		expect(screen.getByText('1 Deviates')).toBeInTheDocument();
		expect(screen.getByText('0 Missing')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/ResultSummary.svelte`:

```svelte
<script lang="ts">
	import type { ResultSummary } from './types';
	import { SUMMARY_ROWS, verdictMeta } from './verdict';
	let { summary }: { summary: ResultSummary } = $props();
</script>

<div class="flex flex-wrap gap-2">
	{#each SUMMARY_ROWS as row (row.verdict)}
		<span
			class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {verdictMeta(
				row.verdict
			).badgeClass}"
		>
			{summary[row.key]}
			{verdictMeta(row.verdict).label}
		</span>
	{/each}
</div>
```

- [ ] **Step 4: Verify pass** (1 test).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/ResultSummary.svelte src/lib/playbooks/ResultSummary.svelte.test.ts && git commit -m "feat(playbooks): ResultSummary scorecard"`

---

## Task 5: ResultCard

**Files:** Create `src/lib/playbooks/ResultCard.svelte` (+`.svelte.test.ts`). Reuses `SeverityBadge` (slice A), `VerdictBadge`, `RedlineBlocks`.

- [ ] **Step 1: Failing test** — `src/lib/playbooks/ResultCard.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultCard from './ResultCard.svelte';
import type { PositionResult } from './types';

const base = (over: Partial<PositionResult> = {}): PositionResult => ({
	issue: 'Survival of Confidentiality',
	position_id: 'p1',
	severity_if_missing: 'high',
	verdict: 'deviates',
	confidence: 0.9,
	matched_text: 'survive for five (5) years',
	matched_fallback_rank: null,
	justification: 'Caps trade-secret survival.',
	redline: {
		old_text: 'five (5) years',
		new_text: 'so long as it remains a trade secret',
		justification: 'Align.'
	},
	cited_chunk_ids: [],
	...over
});

describe('ResultCard', () => {
	it('shows issue, verdict, matched text and justification', () => {
		render(ResultCard, { props: { result: base() } });
		expect(screen.getByText('Survival of Confidentiality')).toBeInTheDocument();
		expect(screen.getByText('Deviates')).toBeInTheDocument();
		expect(screen.getByText(/survive for five \(5\) years/)).toBeInTheDocument();
		expect(screen.getByText(/Caps trade-secret survival/)).toBeInTheDocument();
	});
	it('shows the redline when present', () => {
		render(ResultCard, { props: { result: base() } });
		expect(screen.getByText(/so long as it remains a trade secret/)).toBeInTheDocument();
	});
	it('omits the redline block when redline is null', () => {
		render(ResultCard, { props: { result: base({ verdict: 'matches_standard', redline: null }) } });
		expect(screen.queryByText(/Suggested redline/i)).toBeNull();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/ResultCard.svelte`:

```svelte
<script lang="ts">
	import type { PositionResult } from './types';
	import VerdictBadge from './VerdictBadge.svelte';
	import SeverityBadge from './SeverityBadge.svelte';
	import RedlineBlocks from './RedlineBlocks.svelte';

	let { result }: { result: PositionResult } = $props();
	const pct = $derived(Math.round(result.confidence * 100));
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-start justify-between gap-3">
		<h3 class="font-serif text-mlq-strong">{result.issue}</h3>
		<VerdictBadge verdict={result.verdict} fallbackRank={result.matched_fallback_rank} />
	</div>
	<div class="mt-1 flex items-center gap-2 text-xs text-mlq-muted">
		<SeverityBadge severity={result.severity_if_missing} />
		<span>{pct}% confidence</span>
	</div>

	{#if result.matched_text}
		<div class="mt-2 text-[10px] font-medium tracking-wide text-mlq-muted uppercase">
			What the contract says
		</div>
		<div class="mt-1 border-l-2 border-mlq-subtle pl-3 text-sm text-mlq-text">
			{result.matched_text}
		</div>
	{/if}

	<p class="mt-2 text-sm text-mlq-muted">{result.justification}</p>

	{#if result.redline}
		<div class="mt-3 text-[10px] font-medium tracking-wide text-mlq-muted uppercase">
			Suggested redline
		</div>
		<div class="mt-1"><RedlineBlocks redline={result.redline} /></div>
	{/if}
</div>
```

- [ ] **Step 4: Verify pass** (3 tests). **Step 5: `npm run check`** 0/0.
- [ ] **Step 6: Commit** — `git add src/lib/playbooks/ResultCard.svelte src/lib/playbooks/ResultCard.svelte.test.ts && git commit -m "feat(playbooks): ResultCard"`

---

## Task 6: ExecutionResults

**Files:** Create `src/lib/playbooks/ExecutionResults.svelte` (+`.svelte.test.ts`).

- [ ] **Step 1: Failing test** — `src/lib/playbooks/ExecutionResults.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ExecutionResults from './ExecutionResults.svelte';
import type { ExecutionResults as Results, PositionResult } from './types';

const p = (verdict: PositionResult['verdict'], issue: string): PositionResult => ({
	issue,
	position_id: issue,
	severity_if_missing: 'high',
	verdict,
	confidence: 0.8,
	matched_text: 'x',
	matched_fallback_rank: null,
	justification: 'j',
	redline: null,
	cited_chunk_ids: []
});

const results: Results = {
	schema_version: 'm3-a2-v1',
	summary: { matches_standard: 1, matches_fallback: 0, deviates: 1, missing: 1 },
	positions: [p('matches_standard', 'Std One'), p('missing', 'Miss One'), p('deviates', 'Dev One')]
};

describe('ExecutionResults', () => {
	it('renders the scorecard and orders cards worst-first', () => {
		const { container } = render(ExecutionResults, { props: { results } });
		expect(screen.getByText('1 Missing')).toBeInTheDocument();
		const headings = [...container.querySelectorAll('h3')].map((h) => h.textContent);
		expect(headings).toEqual(['Miss One', 'Dev One', 'Std One']);
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/ExecutionResults.svelte`:

```svelte
<script lang="ts">
	import type { ExecutionResults } from './types';
	import { compareByVerdict } from './verdict';
	import ResultSummary from './ResultSummary.svelte';
	import ResultCard from './ResultCard.svelte';

	let { results }: { results: ExecutionResults } = $props();
	const ordered = $derived([...results.positions].sort(compareByVerdict));
</script>

<ResultSummary summary={results.summary} />
<div class="mt-4 space-y-3">
	{#each ordered as result (result.position_id)}<ResultCard {result} />{/each}
</div>
```

- [ ] **Step 4: Verify pass** (1 test).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/ExecutionResults.svelte src/lib/playbooks/ExecutionResults.svelte.test.ts && git commit -m "feat(playbooks): ExecutionResults (scorecard + worst-first cards)"`

---

## Task 7: BFF proxies (upload, execute, execution-poll)

**Files:** Create `src/routes/(app)/files/+server.ts` (+`server.test.ts`), `src/routes/(app)/playbooks/[id]/execute/+server.ts` (+`server.test.ts`), `src/routes/(app)/playbook-executions/[id]/+server.ts` (+`server.test.ts`)

- [ ] **Step 1: Failing tests.**

`src/routes/(app)/playbook-executions/[id]/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (id = 'e1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /playbook-executions/[id]', () => {
	it('passes through the execution JSON', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'e1', status: 'completed' }), { status: 200 })
		);
		const res = await GET(ev());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbook-executions/e1');
		expect((await res.json()).status).toBe('completed');
	});
	it('maps a 500 to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
	});
});
```

`src/routes/(app)/playbooks/[id]/execute/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';
const ev = (body: unknown, id = 'pb1') =>
	({
		params: { id },
		request: new Request('http://x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /playbooks/[id]/execute', () => {
	it('forwards the body and returns the execution', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'e1', status: 'pending' }), { status: 202 })
		);
		const res = await POST(ev({ target_document_id: 'd1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1/execute');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ target_document_id: 'd1' });
		expect((await res.json()).id).toBe('e1');
	});
	it('maps a 404 (target/playbook not found) through', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		await expect(POST(ev({ target_document_id: 'd1' }))).rejects.toMatchObject({ status: 404 });
	});
});
```

`src/routes/(app)/files/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

function formEv() {
	const fd = new FormData();
	fd.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'c.pdf');
	return { request: new Request('http://x', { method: 'POST', body: fd }) } as never;
}
beforeEach(() => lqFetch.mockReset());

describe('POST /files', () => {
	it('forwards the multipart body to /api/v1/files and returns the new file', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }));
		const res = await POST(formEv());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData); // boundary preserved
		expect((await res.json()).id).toBe('f1');
	});
	it('maps a 413 to a size message', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ details: { limit_bytes: 52428800 } }), { status: 413 })
		);
		await expect(POST(formEv())).rejects.toMatchObject({ status: 413 });
	});
});
```

- [ ] **Step 2: Verify all three fail** — `npx vitest run "src/routes/(app)/files/server.test.ts" "src/routes/(app)/playbooks/[id]/execute/server.test.ts" "src/routes/(app)/playbook-executions/[id]/server.test.ts"`

- [ ] **Step 3: Implement.**

`src/routes/(app)/playbook-executions/[id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/playbook-executions/${event.params.id}`);
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load the execution.'
		);
	return json(await res.json());
};
```

`src/routes/(app)/playbooks/[id]/execute/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}/execute`, {
		method: 'POST',
		body
	});
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not start the playbook run.');
	return json(await res.json());
};
```

`src/routes/(app)/files/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	// Pass the multipart body straight through; lqFetch/raw preserves the
	// FormData boundary (do NOT set content-type — see P4-3a fix).
	const form = await event.request.formData();
	const res = await lqFetch(event, '/api/v1/files', { method: 'POST', body: form });
	if (!res.ok) {
		if (res.status === 413) {
			let limitMb = 100;
			try {
				const b = (await res.json()) as { details?: { limit_bytes?: number } };
				if (b.details?.limit_bytes) limitMb = Math.round(b.details.limit_bytes / 1024 / 1024);
			} catch {
				/* keep default */
			}
			throw error(413, `File is too large — max ${limitMb} MB.`);
		}
		throw error(502, 'Could not upload the file.');
	}
	return json(await res.json());
};
```

Note: `lqFetch`'s underlying `raw()` only defaults `content-type: application/json` when the body is NOT a `FormData` (the P4-3a fix). Passing the reconstructed `FormData` preserves the multipart boundary.

- [ ] **Step 4: Verify all pass.** **Step 4b: `npm run check`** 0/0; `npx eslint` on the three `+server.ts` → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/files" "src/routes/(app)/playbooks/[id]/execute" "src/routes/(app)/playbook-executions" && git commit -m "feat(playbooks): BFF proxies — upload, execute, execution-poll"`

---

## Task 8: Run-page server load

**Files:** Create `src/routes/(app)/playbooks/[id]/run/+page.server.ts` (+`page.server.test.ts`)

The matter-file source: a `Project` carries `attached_file_ids`; fetch each `GET /files/{id}` and keep only ingested ones (`ingestion_status==='ready'` && `document_id`).

- [ ] **Step 1: Failing test** — `src/routes/(app)/playbooks/[id]/run/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = (over: Record<string, unknown> = {}) =>
	({
		params: { id: 'pb1' },
		url: new URL('http://x/playbooks/pb1/run'),
		locals: { user: { is_admin: true } },
		...over
	}) as never;
const evMatter = (matter: string) =>
	({
		params: { id: 'pb1' },
		url: new URL(`http://x/playbooks/pb1/run?matter=${matter}`),
		locals: { user: { is_admin: true } }
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id]/run load', () => {
	it('throws 403 for a non-admin', async () => {
		await expect(
			load({
				params: { id: 'pb1' },
				url: new URL('http://x/playbooks/pb1/run'),
				locals: { user: { is_admin: false } }
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});
	it('loads the playbook and the user matters', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA' }), {
					status: 200
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			);
		const out = (await load(ev())) as {
			playbook: { id: string };
			matters: { id: string }[];
			matterFiles: unknown[];
			execution: unknown;
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
		expect(out.playbook.id).toBe('pb1');
		expect(out.matters[0].id).toBe('m1');
		expect(out.matterFiles).toEqual([]);
		expect(out.execution).toBeNull();
	});
	it('throws 404 when the playbook is missing', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 404 });
	});
	it('returns only ingested files for ?matter', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA' }), {
					status: 200
				})
			) // playbook
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			) // matters
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'm1', name: 'Acme', attached_file_ids: ['f1', 'f2'] }), {
					status: 200
				})
			) // project
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f1',
						filename: 'a.pdf',
						ingestion_status: 'ready',
						document_id: 'd1'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f2',
						filename: 'b.docx',
						ingestion_status: 'failed',
						document_id: null
					}),
					{ status: 200 }
				)
			);
		const out = (await load(evMatter('m1'))) as { matterFiles: { id: string }[] };
		expect(out.matterFiles.map((f) => f.id)).toEqual(['f1']);
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/routes/(app)/playbooks/[id]/run/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook, PlaybookExecution } from '$lib/playbooks/types';
import type { File as PlaybookFile } from '$lib/api/backend' assert { 'resolution-mode': 'import' };
import type { PageServerLoad } from './$types';

type MatterSummary = { id: string; name: string };
type IngestedFile = { id: string; filename: string; document_id: string };

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user?.is_admin) {
		throw error(403, 'Running built-in playbooks requires an admin account in this version.');
	}

	const pbRes = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
	if (pbRes.status === 404) throw error(404, 'Playbook not found.');
	if (!pbRes.ok) throw error(502, 'Could not load this playbook.');
	const playbook = (await pbRes.json()) as Playbook;

	const mRes = await lqFetch(event, '/api/v1/projects');
	const matters = (mRes.ok ? ((await mRes.json()) as MatterSummary[]) : []).map((m) => ({
		id: m.id,
		name: m.name
	}));

	let matterFiles: IngestedFile[] = [];
	const matterId = event.url.searchParams.get('matter');
	if (matterId) {
		const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
		if (projRes.ok) {
			const proj = (await projRes.json()) as { attached_file_ids?: string[] };
			const files = await Promise.all(
				(proj.attached_file_ids ?? []).map(async (fid) => {
					const r = await lqFetch(event, `/api/v1/files/${fid}`);
					return r.ok
						? ((await r.json()) as {
								id: string;
								filename: string;
								ingestion_status?: string;
								document_id?: string | null;
							})
						: null;
				})
			);
			matterFiles = files
				.filter(
					(f): f is NonNullable<typeof f> =>
						f !== null && f.ingestion_status === 'ready' && !!f.document_id
				)
				.map((f) => ({ id: f.id, filename: f.filename, document_id: f.document_id as string }));
		}
	}

	let execution: PlaybookExecution | null = null;
	const executionId = event.url.searchParams.get('execution');
	if (executionId) {
		const eRes = await lqFetch(event, `/api/v1/playbook-executions/${executionId}`);
		if (eRes.ok) execution = (await eRes.json()) as PlaybookExecution;
	}

	return { playbook, matters, matterFiles, execution };
};
```

(Drop the unused `PlaybookFile` import line if the engineer finds it unnecessary — `IngestedFile`/inline types cover the shapes. Keep types `any`-free.)

- [ ] **Step 4: Verify pass** (4 tests). **Step 4b: `npm run check`** 0/0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/[id]/run/+page.server.ts" "src/routes/(app)/playbooks/[id]/run/page.server.test.ts" && git commit -m "feat(playbooks): run-page load (admin gate, matters, ?matter, ?execution)"`

---

## Task 9: Run flow controller

**Files:** Create `src/lib/playbooks/runFlow.svelte.ts` (+`.svelte.test.ts`)

A rune controller orchestrating the async run via the JSON proxies. Poll interval is injectable for tests.

- [ ] **Step 1: Failing test** — `src/lib/playbooks/runFlow.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunFlow } from './runFlow.svelte';

function jsonResp(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createRunFlow', () => {
	it('runs the pick path: execute → poll → done with results', async () => {
		const completed = {
			id: 'e1',
			status: 'completed',
			results: {
				schema_version: 'm3-a2-v1',
				summary: { matches_standard: 1, matches_fallback: 0, deviates: 0, missing: 0 },
				positions: []
			}
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202)) // POST execute
			.mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'running' })) // poll 1
			.mockResolvedValueOnce(jsonResp(completed)); // poll 2
		vi.stubGlobal('fetch', fetchMock);

		const flow = createRunFlow('pb1', { pollMs: 10 });
		const done = flow.runWithDocument('d1');
		await vi.advanceTimersByTimeAsync(50);
		await done;

		expect(fetchMock.mock.calls[0][0]).toBe('/playbooks/pb1/execute');
		expect(fetchMock.mock.calls[1][0]).toBe('/playbook-executions/e1');
		expect(flow.phase).toBe('done');
		expect(flow.results?.summary.matches_standard).toBe(1);
	});

	it('surfaces a backend execution error', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202))
			.mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'error', error: 'boom' }));
		vi.stubGlobal('fetch', fetchMock);
		const flow = createRunFlow('pb1', { pollMs: 10 });
		const done = flow.runWithDocument('d1');
		await vi.advanceTimersByTimeAsync(30);
		await done;
		expect(flow.phase).toBe('error');
		expect(flow.error).toMatch(/boom/);
	});

	it('runs the upload path: upload → ingest poll → execute → poll → done', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201)) // POST /files
			.mockResolvedValueOnce(
				jsonResp({ id: 'f1', ingestion_status: 'processing', document_id: null })
			) // poll files
			.mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'ready', document_id: 'd1' })) // poll files ready
			.mockResolvedValueOnce(jsonResp({ id: 'e1', status: 'pending' }, 202)) // POST execute
			.mockResolvedValueOnce(
				jsonResp({
					id: 'e1',
					status: 'completed',
					results: {
						schema_version: 'm3-a2-v1',
						summary: { matches_standard: 0, matches_fallback: 0, deviates: 0, missing: 0 },
						positions: []
					}
				})
			);
		vi.stubGlobal('fetch', fetchMock);
		const flow = createRunFlow('pb1', { pollMs: 10 });
		const file = new File([new Uint8Array([1])], 'c.pdf', { type: 'application/pdf' });
		const done = flow.runWithUpload(file);
		await vi.advanceTimersByTimeAsync(80);
		await done;
		expect(fetchMock.mock.calls[0][0]).toBe('/files');
		expect(flow.phase).toBe('done');
	});

	it('errors when ingestion fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201))
			.mockResolvedValueOnce(
				jsonResp({
					id: 'f1',
					ingestion_status: 'failed',
					ingestion_error: 'unsupported_type',
					document_id: null
				})
			);
		vi.stubGlobal('fetch', fetchMock);
		const flow = createRunFlow('pb1', { pollMs: 10 });
		const done = flow.runWithUpload(new File([new Uint8Array([1])], 'c.docx'));
		await vi.advanceTimersByTimeAsync(30);
		await done;
		expect(flow.phase).toBe('error');
		expect(flow.error).toMatch(/unsupported_type/);
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/runFlow.svelte.ts`:

```ts
import type { ExecutionResults, PlaybookExecution } from './types';

export type RunPhase =
	| 'idle'
	| 'uploading'
	| 'ingesting'
	| 'executing'
	| 'analysing'
	| 'done'
	| 'error';

interface RunFlowOptions {
	pollMs?: number;
	/** Called with the execution id once execute returns, so the page can push `?execution=`. */
	onExecutionStarted?: (executionId: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRunFlow(playbookId: string, opts: RunFlowOptions = {}) {
	const pollMs = opts.pollMs ?? 2000;
	let phase = $state<RunPhase>('idle');
	let error = $state<string | null>(null);
	let results = $state<ExecutionResults | null>(null);

	function fail(msg: string) {
		error = msg;
		phase = 'error';
	}

	async function pollExecution(executionId: string): Promise<void> {
		phase = 'analysing';
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const res = await fetch(`/playbook-executions/${executionId}`);
			if (!res.ok) return fail('Lost contact with the run. Please retry.');
			const exec = (await res.json()) as PlaybookExecution & {
				results?: ExecutionResults;
				error?: string | null;
			};
			if (exec.status === 'completed') {
				results = (exec.results as ExecutionResults) ?? null;
				phase = 'done';
				return;
			}
			if (exec.status === 'error') return fail(exec.error ?? 'The playbook run failed.');
			await sleep(pollMs);
		}
	}

	async function execute(documentId: string, projectId?: string | null): Promise<void> {
		phase = 'executing';
		const res = await fetch(`/playbooks/${playbookId}/execute`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				target_document_id: documentId,
				...(projectId ? { project_id: projectId } : {})
			})
		});
		if (!res.ok) return fail('Could not start the playbook run.');
		const exec = (await res.json()) as PlaybookExecution;
		opts.onExecutionStarted?.(exec.id);
		await pollExecution(exec.id);
	}

	async function runWithDocument(documentId: string, projectId?: string | null): Promise<void> {
		error = null;
		results = null;
		await execute(documentId, projectId);
	}

	async function runWithUpload(file: File): Promise<void> {
		error = null;
		results = null;
		phase = 'uploading';
		const fd = new FormData();
		fd.append('file', file, file.name);
		const upRes = await fetch('/files', { method: 'POST', body: fd });
		if (!upRes.ok)
			return fail(upRes.status === 413 ? 'That file is too large.' : 'Could not upload the file.');
		const { id: fileId } = (await upRes.json()) as { id: string };

		phase = 'ingesting';
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const sRes = await fetch(`/files/${fileId}`);
			if (!sRes.ok) return fail('Could not check the document status.');
			const f = (await sRes.json()) as {
				ingestion_status?: string;
				ingestion_error?: string | null;
				document_id?: string | null;
			};
			if (f.ingestion_status === 'ready' && f.document_id) {
				await execute(f.document_id);
				return;
			}
			if (f.ingestion_status === 'failed')
				return fail(`Document processing failed: ${f.ingestion_error ?? 'unknown error'}.`);
			await sleep(pollMs);
		}
	}

	/** Resume from an execution loaded server-side (?execution=). */
	async function resume(
		exec: PlaybookExecution & { results?: ExecutionResults; error?: string | null }
	): Promise<void> {
		if (exec.status === 'completed') {
			results = (exec.results as ExecutionResults) ?? null;
			phase = 'done';
			return;
		}
		if (exec.status === 'error') return fail(exec.error ?? 'The playbook run failed.');
		await pollExecution(exec.id);
	}

	return {
		get phase() {
			return phase;
		},
		get error() {
			return error;
		},
		get results() {
			return results;
		},
		runWithDocument,
		runWithUpload,
		resume
	};
}
```

- [ ] **Step 4: Verify pass** (4 tests). **Step 4b: `npm run check`** 0/0; eslint on the file → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/runFlow.svelte.ts src/lib/playbooks/runFlow.svelte.test.ts && git commit -m "feat(playbooks): runFlow client controller"`

---

## Task 10: DocumentChooser

**Files:** Create `src/lib/playbooks/DocumentChooser.svelte` (+`.svelte.test.ts`). Reuses `Dropzone` (`$lib/matters/files/Dropzone.svelte`) and `MatterPicker` (`$lib/matters/MatterPicker.svelte`).

- [ ] **Step 1: Failing test** — `src/lib/playbooks/DocumentChooser.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DocumentChooser from './DocumentChooser.svelte';

const props = () => ({
	matters: [{ id: 'm1', name: 'Acme' }],
	matterFiles: [{ id: 'f1', filename: 'nda.pdf', document_id: 'd1' }],
	onupload: vi.fn(),
	onpick: vi.fn()
});

describe('DocumentChooser', () => {
	it('defaults to the Upload tab (dropzone visible)', () => {
		render(DocumentChooser, { props: props() });
		expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
	});
	it('switches to the matter tab and lists ingested files; picking emits the document_id', async () => {
		const p = props();
		render(DocumentChooser, { props: p });
		await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /select nda\.pdf/i }));
		expect(p.onpick).toHaveBeenCalledWith('d1');
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/DocumentChooser.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';

	type MatterSummary = { id: string; name: string };
	type IngestedFile = { id: string; filename: string; document_id: string };

	let {
		matters,
		matterFiles,
		onupload,
		onpick
	}: {
		matters: MatterSummary[];
		matterFiles: IngestedFile[];
		onupload: (file: File) => void;
		onpick: (documentId: string) => void;
	} = $props();

	let tab = $state<'upload' | 'matter'>('upload');
	let selectedMatter = $state<string | null>(page.url.searchParams.get('matter'));

	// When the matter selection changes, reflect it in the URL so the server load
	// fetches that matter's files (?matter=).
	function onMatterChange(id: string | null) {
		selectedMatter = id;
		const url = new URL(page.url);
		if (id) url.searchParams.set('matter', id);
		else url.searchParams.delete('matter');
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}
	$effect(() => onMatterChange(selectedMatter));

	function handleFiles(files: File[]) {
		if (files[0]) onupload(files[0]);
	}
</script>

<div role="tablist" class="flex gap-1 border-b border-mlq-subtle text-sm">
	<button
		role="tab"
		type="button"
		aria-selected={tab === 'upload'}
		onclick={() => (tab = 'upload')}
		class="px-3 py-2 {tab === 'upload'
			? 'border-b-2 border-mlq-text font-medium text-mlq-text'
			: 'text-mlq-muted'}">Upload a document</button
	>
	<button
		role="tab"
		type="button"
		aria-selected={tab === 'matter'}
		onclick={() => (tab = 'matter')}
		class="px-3 py-2 {tab === 'matter'
			? 'border-b-2 border-mlq-text font-medium text-mlq-text'
			: 'text-mlq-muted'}">Choose from a matter</button
	>
</div>

<div class="mt-3">
	{#if tab === 'upload'}
		<Dropzone onfiles={handleFiles} />
	{:else}
		<MatterPicker {matters} bind:selectedId={selectedMatter} />
		<div class="mt-3">
			{#if !selectedMatter}
				<p class="text-sm text-mlq-muted">Pick a matter to see its documents.</p>
			{:else if matterFiles.length === 0}
				<p class="text-sm text-mlq-muted">No ingested documents in this matter yet.</p>
			{:else}
				<ul class="rounded-mlq-control border border-mlq-subtle">
					{#each matterFiles as f (f.id)}
						<li
							class="flex items-center justify-between gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0"
						>
							<span class="truncate text-sm text-mlq-text">{f.filename}</span>
							<button
								type="button"
								onclick={() => onpick(f.document_id)}
								class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle"
								aria-label={`Select ${f.filename}`}>Select</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
```

Note: the `$effect` calling `goto` runs on mount too; that's benign (re-sets the same `?matter`). If the engineer finds the effect causes a redundant initial navigation, guard it with an `untrack` of the initial value — but keep behavior: changing the matter must update `?matter`.

- [ ] **Step 4: Verify pass** (2 tests). The test mocks `$app/navigation`/`$app/state` as needed — add at the top of the test file:

```ts
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://x/playbooks/pb1/run') } }));
```

(Place these mocks before the `import DocumentChooser` line.)

- [ ] **Step 4b: `npm run check`** 0/0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/DocumentChooser.svelte src/lib/playbooks/DocumentChooser.svelte.test.ts && git commit -m "feat(playbooks): DocumentChooser (upload | choose-from-matter)"`

---

## Task 11: RunProgress

**Files:** Create `src/lib/playbooks/RunProgress.svelte` (+`.svelte.test.ts`)

- [ ] **Step 1: Failing test** — `src/lib/playbooks/RunProgress.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RunProgress from './RunProgress.svelte';

describe('RunProgress', () => {
	it('marks earlier steps done and the current step active', () => {
		render(RunProgress, { props: { phase: 'analysing' } });
		expect(screen.getByText(/Analysing/)).toBeInTheDocument();
		const uploaded = screen.getByText(/Uploaded/);
		expect(uploaded.className).toMatch(/mlq-success/);
	});
	it('shows an error message in the error phase', () => {
		render(RunProgress, { props: { phase: 'error', error: 'unsupported_type' } });
		expect(screen.getByText(/unsupported_type/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/RunProgress.svelte`:

```svelte
<script lang="ts">
	import type { RunPhase } from './runFlow.svelte';

	let { phase, error = null }: { phase: RunPhase; error?: string | null } = $props();

	const STEPS: { key: RunPhase; label: string }[] = [
		{ key: 'uploading', label: 'Uploaded' },
		{ key: 'ingesting', label: 'Ingested' },
		{ key: 'analysing', label: 'Analysing' },
		{ key: 'done', label: 'Results' }
	];
	const ORDER: RunPhase[] = ['idle', 'uploading', 'ingesting', 'executing', 'analysing', 'done'];
	const rank = $derived(ORDER.indexOf(phase === 'error' ? 'idle' : phase));

	function stepClass(stepKey: RunPhase): string {
		const stepRank = ORDER.indexOf(stepKey);
		if (rank > stepRank) return 'text-mlq-success';
		if (rank === stepRank) return 'font-semibold text-mlq-text';
		return 'text-mlq-muted';
	}
</script>

{#if phase === 'error'}
	<p class="text-sm text-mlq-error">⚠ {error ?? 'The run failed.'}</p>
{:else}
	<div class="flex items-center gap-2 text-xs">
		<span
			class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle"
			aria-label="Running"
		></span>
		{#each STEPS as step, i (step.key)}
			<span class={stepClass(step.key)}
				>{rank > ORDER.indexOf(step.key) ? '✓ ' : ''}{step.label}</span
			>
			{#if i < STEPS.length - 1}<span class="text-mlq-subtle">→</span>{/if}
		{/each}
	</div>
{/if}
```

- [ ] **Step 4: Verify pass** (2 tests).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/RunProgress.svelte src/lib/playbooks/RunProgress.svelte.test.ts && git commit -m "feat(playbooks): RunProgress stepper"`

---

## Task 12: Run page composition

**Files:** Create `src/routes/(app)/playbooks/[id]/run/+page.svelte`

Composes the chooser → progress → results via `runFlow`. Covered by the live e2e (Task 14) + the component tests above; no separate page test.

- [ ] **Step 1: Implement** — `src/routes/(app)/playbooks/[id]/run/+page.svelte`:

```svelte
<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import DocumentChooser from '$lib/playbooks/DocumentChooser.svelte';
	import RunProgress from '$lib/playbooks/RunProgress.svelte';
	import ExecutionResults from '$lib/playbooks/ExecutionResults.svelte';
	import { createRunFlow } from '$lib/playbooks/runFlow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const flow = createRunFlow(data.playbook.id, {
		onExecutionStarted: (id) => {
			const url = new URL(page.url);
			url.searchParams.set('execution', id);
			replaceState(`${url.pathname}${url.search}`, {});
		}
	});

	// Resume a server-loaded execution (reload-safe ?execution=).
	let resumed = false;
	$effect(() => {
		if (data.execution && !resumed) {
			resumed = true;
			flow.resume(data.execution);
		}
	});
</script>

<svelte:head><title>Run {data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
	<a href="/playbooks/{data.playbook.id}" class="text-xs text-mlq-muted hover:underline"
		>← {data.playbook.name}</a
	>
	<h1 class="mt-2 font-serif text-2xl text-mlq-strong">Run against a document</h1>
	<p class="mt-1 text-sm text-mlq-muted">{data.playbook.name} · {data.playbook.contract_type}</p>

	{#if flow.phase === 'idle'}
		<div class="mt-6">
			<DocumentChooser
				matters={data.matters}
				matterFiles={data.matterFiles}
				onupload={(file) => flow.runWithUpload(file)}
				onpick={(documentId) => flow.runWithDocument(documentId)}
			/>
		</div>
	{:else if flow.phase !== 'done'}
		<div class="mt-6"><RunProgress phase={flow.phase} error={flow.error} /></div>
	{/if}

	{#if flow.phase === 'done' && flow.results}
		<div class="mt-6"><ExecutionResults results={flow.results} /></div>
	{/if}
</div>
```

- [ ] **Step 2: Verify build** — `npm run check` → 0/0; `npx eslint "src/routes/(app)/playbooks/[id]/run/+page.svelte"` → 0.
- [ ] **Step 3: Commit** — `git add "src/routes/(app)/playbooks/[id]/run/+page.svelte" && git commit -m "feat(playbooks): run page composition"`

---

## Task 13: Admin-gated Apply affordance on the detail page

**Files:** Modify `src/routes/(app)/playbooks/[id]/+page.server.ts`, `src/routes/(app)/playbooks/[id]/+page.svelte`, and their tests.

- [ ] **Step 1: Extend the failing tests.**

In `src/routes/(app)/playbooks/[id]/page.server.test.ts`, add a test that `isAdmin` is returned (and update existing `load` calls to pass `locals`):

```ts
it('returns isAdmin from locals', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', positions: [] }), {
			status: 200
		})
	);
	const out = (await load({
		params: { id: 'pb1' },
		locals: { user: { is_admin: true } }
	} as never)) as { isAdmin: boolean };
	expect(out.isAdmin).toBe(true);
});
```

(Update the existing detail-load tests' event factory to include `locals: { user: { is_admin: false } }` so they still pass.)

Create `src/routes/(app)/playbooks/[id]/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const data = (isAdmin: boolean) => ({
	data: {
		playbook: {
			id: 'pb1',
			name: 'NDA — Mutual',
			contract_type: 'NDA',
			version: '1.0.0',
			positions: []
		},
		isAdmin
	}
});

describe('/playbooks/[id] Apply affordance', () => {
	it('shows the Apply link for admins', () => {
		render(Page, { props: data(true) as never });
		const link = screen.getByRole('link', { name: /apply to a document/i });
		expect(link).toHaveAttribute('href', '/playbooks/pb1/run');
	});
	it('shows a note instead for non-admins', () => {
		render(Page, { props: data(false) as never });
		expect(screen.queryByRole('link', { name: /apply to a document/i })).toBeNull();
		expect(screen.getByText(/requires an admin account/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Verify the new tests fail.**
- [ ] **Step 3: Implement.**

In `src/routes/(app)/playbooks/[id]/+page.server.ts`, return `isAdmin` from `load` (add to the returned object):

```ts
const playbook = (await res.json()) as Playbook;
return { playbook, isAdmin: event.locals.user?.is_admin ?? false };
```

In `src/routes/(app)/playbooks/[id]/+page.svelte`, add the affordance after the header `<div>` (the contract_type/version line), before the positions block:

```svelte
{#if data.isAdmin}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app run link -->
	<a
		href="/playbooks/{data.playbook.id}/run"
		class="mt-3 inline-block rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface hover:opacity-90"
		>Apply to a document</a
	>
{:else}
	<p class="mt-3 text-xs text-mlq-muted">
		Running built-in playbooks requires an admin account in this version.
	</p>
{/if}
```

(Ensure `data.isAdmin` is read via the existing `let { data }: PageProps = $props();`.)

- [ ] **Step 4: Verify all pass** (detail load tests + new page.svelte tests). **Step 4b: `npm run check`** 0/0; eslint on both files → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/[id]/+page.server.ts" "src/routes/(app)/playbooks/[id]/+page.svelte" "src/routes/(app)/playbooks/[id]/page.server.test.ts" "src/routes/(app)/playbooks/[id]/page.svelte.test.ts" && git commit -m "feat(playbooks): admin-gated Apply affordance on detail"`

---

## Task 14: Live end-to-end test

**Files:** Create `tests/playbooks-apply.spec.ts`

- [ ] **Step 1: Rebuild `donna-web`**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

- [ ] **Step 2: Write the e2e** — `tests/playbooks-apply.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const NDA = 'vendor/lq-ai/docs/quickstart/sample-ndas/nda-1-acme-beta.pdf';

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('apply a playbook to an uploaded document and see results with a redline', async ({
	page
}) => {
	test.setTimeout(120_000); // real ingest + 4-node LLM execution

	await login(page);

	// Open NDA — Mutual, click Apply (admin account).
	await page.goto('/playbooks');
	await page.getByRole('link', { name: /NDA — Mutual/i }).click();
	await page.getByRole('link', { name: /apply to a document/i }).click();
	await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+\/run/i);

	// Upload the sample NDA via the dropzone input.
	await page.getByTestId('dropzone-input').setInputFiles({
		name: 'nda-1-acme-beta.pdf',
		mimeType: 'application/pdf',
		buffer: readFileSync(NDA)
	});

	// Results render: the scorecard + at least one verdict card.
	await expect(page.getByText(/\d+ Standard/)).toBeVisible({ timeout: 100_000 });
	await expect(page.getByText('Suggested redline').first()).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e** — `npx playwright test tests/playbooks-apply.spec.ts`
      Expected: PASS — upload ingests, the execution completes, the scorecard + a redline render. (Slow ~40–90 s.)

- [ ] **Step 4: Full gate** — `npm run check && npx vitest run`
      Expected: check 0/0; all vitest green.

- [ ] **Step 5: Commit** — `git add tests/playbooks-apply.spec.ts && git commit -m "test(playbooks): live e2e — apply + results"`

---

## Self-Review notes (reconciled)

- **Spec coverage:** §4 load+proxies → Tasks 7, 8; §4 controller → Task 9; §5 components → Tasks 1–6, 10, 11; run page → Task 12; admin gate → Tasks 8 (route) + 13 (affordance); §8 tests → per-task + Task 14 e2e.
- **Type consistency:** `Verdict`/`PositionResult`/`Redline`/`ExecutionResults`/`ResultSummary`/`PlaybookExecution` defined once in `types.ts` (Task 1) and used throughout; `RunPhase` defined in `runFlow.svelte.ts` (Task 9) and imported by `RunProgress` (Task 11). `verdictMeta`/`compareByVerdict`/`SUMMARY_ROWS`/`VERDICTS` consistent. Proxy paths (`/files`, `/playbooks/[id]/execute`, `/playbook-executions/[id]`) match the controller's fetch URLs.
- **No placeholders:** every code/command step is concrete.
- **Known minor (carried from slice A):** verdict/severity badge tints use same-hue token text on a light tint; the amber `deviates`/`caveats` combination is the weakest contrast — acceptable per the approved design, flag at review if it reads poorly.
