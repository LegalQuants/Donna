# Playbooks Browse + Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only `/playbooks` library (built-ins grouped by contract family) and `/playbooks/[id]` detail page that renders each negotiation position primary-first with collapsible matcher internals.

**Architecture:** Idiomatic SvelteKit SSR — server `load` calls `lqFetch` directly (no new BFF proxy), mirroring `/skills` and `/matters`. Reusable, independently-tested components under `src/lib/playbooks/` (types, grouping helper, `SeverityBadge`, `PositionCard`, `PlaybookRow`) that slices B (apply) and C (easy-gen) will reuse. No backend change.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide (`@lucide/svelte`).

**Spec:** `docs/superpowers/specs/2026-05-30-donna-playbooks-browse-design.md`

**Conventions:** TDD (test first → watch fail → minimal impl → watch pass → commit). Commit per task; push regularly. Quality bar: `npm run check` = 0 errors and 0 warnings (a vendor `ERR_MODULE_NOT_FOUND` stderr line from the lq-ai submodule is harmless — signal is exit 0 + the "0 errors and 0 warnings" line). eslint clean on touched files; no `any`. In-app `<a href>` links need the inline `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- … -->` comment (repo convention — see `SkillRow.svelte`, `Sidebar.svelte`).

**Spike-confirmed facts:**

- `Playbook = { id, name, contract_type, description?, version, created_by?, positions?: Position[] }`. The **list endpoint omits `positions`** (so the index row shows name + description, NOT a count); the **detail endpoint includes them**.
- `Position = { id, issue, description?, standard_language, fallback_tiers?: FallbackTier[], redline_strategy?, severity_if_missing: 'critical'|'high'|'medium'|'low', detection_keywords?: string[], detection_examples?: string[], position_order? }`.
- `FallbackTier = { rank: number, description: string, language: string }`.
- 5 built-ins seeded; `GET /api/v1/playbooks`, `GET /api/v1/playbooks/{id}`.
- Severity → existing `mlq` tokens (no new tokens): critical=`mlq-error`, high=`mlq-caveats` (amber), medium=`mlq-muted`, low=outline.

---

## File Structure

| File                                                                       | Create/Modify | Responsibility                                                         |
| -------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `src/lib/playbooks/types.ts`                                               | Create        | Re-export `Playbook`/`Position`/`FallbackTier` from generated contract |
| `src/lib/playbooks/contractFamily.ts` (+`.test.ts`)                        | Create        | Pure `groupByContractFamily`                                           |
| `src/lib/playbooks/SeverityBadge.svelte` (+`.test.ts`)                     | Create        | Severity → colored pill                                                |
| `src/lib/playbooks/PositionCard.svelte` (+`.test.ts`)                      | Create        | One position, primary-first + collapsible internals                    |
| `src/lib/playbooks/PlaybookRow.svelte` (+`.test.ts`)                       | Create        | Index row (name + description), links to detail                        |
| `src/routes/(app)/playbooks/+page.server.ts` (+`page.server.test.ts`)      | Create        | Index load                                                             |
| `src/routes/(app)/playbooks/+page.svelte`                                  | Create        | Grouped index render                                                   |
| `src/lib/components/Sidebar.svelte`                                        | Modify        | Add "Playbooks" nav entry                                              |
| `src/routes/(app)/playbooks/[id]/+page.server.ts` (+`page.server.test.ts`) | Create        | Detail load                                                            |
| `src/routes/(app)/playbooks/[id]/+page.svelte`                             | Create        | Detail render                                                          |
| `tests/playbooks-browse.spec.ts`                                           | Create        | Live e2e                                                               |

Page `+page.svelte` components are thin compositions covered by the component unit tests + the live e2e; no separate `page.svelte.test.ts` (YAGNI).

---

## Task 1: Types + contract-family grouping

**Files:**

- Create: `src/lib/playbooks/types.ts`
- Create: `src/lib/playbooks/contractFamily.ts`
- Test: `src/lib/playbooks/contractFamily.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/contractFamily.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupByContractFamily } from './contractFamily';
import type { Playbook } from './types';

const pb = (id: string, contract_type: string, name = id): Playbook =>
	({ id, name, contract_type, version: '1.0.0', created_at: '', updated_at: '' }) as Playbook;

describe('groupByContractFamily', () => {
	it('groups by the segment before the first dash', () => {
		const out = groupByContractFamily([
			pb('1', 'NDA'),
			pb('2', 'NDA-unilateral'),
			pb('3', 'MSA-SaaS'),
			pb('4', 'DPA-GDPR')
		]);
		expect(out.map((g) => g.family)).toEqual(['NDA', 'MSA', 'DPA']);
		expect(out[0].playbooks.map((p) => p.id)).toEqual(['1', '2']);
	});
	it('keeps first-seen family order and input order within a family', () => {
		const out = groupByContractFamily([
			pb('1', 'MSA-SaaS'),
			pb('2', 'NDA'),
			pb('3', 'MSA-Commercial')
		]);
		expect(out.map((g) => g.family)).toEqual(['MSA', 'NDA']);
		expect(out[0].playbooks.map((p) => p.id)).toEqual(['1', '3']);
	});
	it('treats a dash-less contract_type as its own family', () => {
		expect(groupByContractFamily([pb('1', 'NDA')])[0].family).toBe('NDA');
	});
	it('returns an empty array for no playbooks', () => {
		expect(groupByContractFamily([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/playbooks/contractFamily.test.ts`
Expected: FAIL — cannot resolve `./contractFamily` (and `./types`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/playbooks/types.ts`:

```ts
import type { components } from '$lib/api/backend';

export type Playbook = components['schemas']['Playbook'];
export type Position = components['schemas']['Position'];
export type FallbackTier = components['schemas']['FallbackTier'];
```

Create `src/lib/playbooks/contractFamily.ts`:

```ts
import type { Playbook } from './types';

export interface PlaybookFamily {
	family: string;
	playbooks: Playbook[];
}

/**
 * Group playbooks by contract family — the segment before the first '-' in
 * `contract_type` (NDA-unilateral → "NDA", MSA-SaaS → "MSA", DPA-GDPR → "DPA").
 * A dash-less `contract_type` is its own family. Families appear in first-seen
 * order; playbooks keep their input order within a family.
 */
export function groupByContractFamily(playbooks: Playbook[]): PlaybookFamily[] {
	const order: string[] = [];
	const byFamily = new Map<string, Playbook[]>();
	for (const pb of playbooks) {
		const family = pb.contract_type.split('-')[0];
		let bucket = byFamily.get(family);
		if (!bucket) {
			bucket = [];
			byFamily.set(family, bucket);
			order.push(family);
		}
		bucket.push(pb);
	}
	return order.map((family) => ({ family, playbooks: byFamily.get(family)! }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/playbooks/contractFamily.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbooks/types.ts src/lib/playbooks/contractFamily.ts src/lib/playbooks/contractFamily.test.ts
git commit -m "feat(playbooks): types + contract-family grouping helper"
```

---

## Task 2: SeverityBadge

**Files:**

- Create: `src/lib/playbooks/SeverityBadge.svelte`
- Test: `src/lib/playbooks/SeverityBadge.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/SeverityBadge.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SeverityBadge from './SeverityBadge.svelte';

describe('SeverityBadge', () => {
	it('renders the Critical label with the error token', () => {
		render(SeverityBadge, { props: { severity: 'critical' } });
		const el = screen.getByText('Critical');
		expect(el).toBeInTheDocument();
		expect(el.className).toMatch(/bg-mlq-error/);
	});
	it('renders High with the amber caveats token', () => {
		render(SeverityBadge, { props: { severity: 'high' } });
		expect(screen.getByText('High').className).toMatch(/bg-mlq-caveats/);
	});
	it('renders Medium with the muted token', () => {
		render(SeverityBadge, { props: { severity: 'medium' } });
		expect(screen.getByText('Medium').className).toMatch(/bg-mlq-muted/);
	});
	it('renders Low as an outline (no fill)', () => {
		render(SeverityBadge, { props: { severity: 'low' } });
		const el = screen.getByText('Low');
		expect(el.className).toMatch(/border/);
		expect(el.className).not.toMatch(/bg-mlq-(error|caveats|muted)/);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/playbooks/SeverityBadge.svelte.test.ts`
Expected: FAIL — cannot resolve `./SeverityBadge.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/playbooks/SeverityBadge.svelte`:

```svelte
<script lang="ts">
	import type { Position } from './types';

	let { severity }: { severity: Position['severity_if_missing'] } = $props();

	const STYLES: Record<Position['severity_if_missing'], string> = {
		critical: 'bg-mlq-error text-white',
		high: 'bg-mlq-caveats text-white',
		medium: 'bg-mlq-muted text-white',
		low: 'border border-mlq-subtle text-mlq-muted'
	};
	const LABELS: Record<Position['severity_if_missing'], string> = {
		critical: 'Critical',
		high: 'High',
		medium: 'Medium',
		low: 'Low'
	};
</script>

<span
	class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase {STYLES[
		severity
	]}">{LABELS[severity]}</span
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/playbooks/SeverityBadge.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbooks/SeverityBadge.svelte src/lib/playbooks/SeverityBadge.svelte.test.ts
git commit -m "feat(playbooks): SeverityBadge"
```

---

## Task 3: PositionCard

**Files:**

- Create: `src/lib/playbooks/PositionCard.svelte`
- Test: `src/lib/playbooks/PositionCard.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/PositionCard.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PositionCard from './PositionCard.svelte';
import type { Position } from './types';

const full = (over: Partial<Position> = {}): Position =>
	({
		id: 'p1',
		issue: 'Processor Obligations',
		description: 'Must process on documented instructions.',
		standard_language:
			'The Processor shall process Personal Data solely on documented instructions.',
		fallback_tiers: [{ rank: 1, description: 'softer', language: 'Tier-1 language.' }],
		redline_strategy: 'Insert the chapeau verbatim.',
		severity_if_missing: 'critical',
		detection_keywords: ['documented instructions', 'Article 28'],
		detection_examples: ['Processor processes data only as instructed.'],
		position_order: 0,
		...over
	}) as Position;

describe('PositionCard', () => {
	it('shows issue, severity, description and standard language by default', () => {
		render(PositionCard, { props: { position: full() } });
		expect(screen.getByText('Processor Obligations')).toBeInTheDocument();
		expect(screen.getByText('Critical')).toBeInTheDocument();
		expect(screen.getByText(/Must process on documented instructions/)).toBeInTheDocument();
		expect(
			screen.getByText(/process Personal Data solely on documented instructions/)
		).toBeInTheDocument();
	});
	it('hides matcher internals until the toggle is clicked', async () => {
		render(PositionCard, { props: { position: full() } });
		expect(screen.queryByText('Detection keywords')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /show matching details/i }));
		expect(screen.getByText('Detection keywords')).toBeInTheDocument();
		expect(screen.getByText('documented instructions')).toBeInTheDocument();
		expect(screen.getByText('Fallback tiers')).toBeInTheDocument();
		expect(screen.getByText(/Insert the chapeau verbatim/)).toBeInTheDocument();
	});
	it('shows no toggle when there are no internals', () => {
		render(PositionCard, {
			props: {
				position: full({
					fallback_tiers: [],
					redline_strategy: undefined,
					detection_keywords: [],
					detection_examples: []
				})
			}
		});
		expect(screen.queryByRole('button', { name: /matching details/i })).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/playbooks/PositionCard.svelte.test.ts`
Expected: FAIL — cannot resolve `./PositionCard.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/playbooks/PositionCard.svelte`:

```svelte
<script lang="ts">
	import type { Position } from './types';
	import SeverityBadge from './SeverityBadge.svelte';

	let { position }: { position: Position } = $props();
	let expanded = $state(false);

	const hasInternals = $derived(
		(position.fallback_tiers?.length ?? 0) > 0 ||
			!!position.redline_strategy ||
			(position.detection_keywords?.length ?? 0) > 0 ||
			(position.detection_examples?.length ?? 0) > 0
	);
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-start justify-between gap-3">
		<h3 class="font-serif text-mlq-strong">{position.issue}</h3>
		<SeverityBadge severity={position.severity_if_missing} />
	</div>
	{#if position.description}
		<p class="mt-1 text-sm text-mlq-text">{position.description}</p>
	{/if}
	<div class="mt-2 border-l-2 border-mlq-subtle pl-3 text-sm text-mlq-text">
		{position.standard_language}
	</div>

	{#if hasInternals}
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="mt-3 text-xs text-mlq-workflow hover:underline"
		>
			{expanded ? 'Hide matching details' : 'Show matching details'}
		</button>
		{#if expanded}
			<div class="mt-2 space-y-3 text-sm">
				{#if position.fallback_tiers?.length}
					<div>
						<div class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
							Fallback tiers
						</div>
						{#each position.fallback_tiers as tier (tier.rank)}
							<div class="mt-1 text-mlq-text">
								<span class="font-medium"
									>Tier {tier.rank}{#if tier.description}
										— {tier.description}{/if}:</span
								>
								<span class="border-l-2 border-mlq-subtle pl-2"> {tier.language}</span>
							</div>
						{/each}
					</div>
				{/if}
				{#if position.redline_strategy}
					<div>
						<div class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
							Redline strategy
						</div>
						<p class="mt-1 text-mlq-text">{position.redline_strategy}</p>
					</div>
				{/if}
				{#if position.detection_keywords?.length}
					<div>
						<div class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
							Detection keywords
						</div>
						<div class="mt-1">
							{#each position.detection_keywords as kw (kw)}<span
									class="mr-1 mb-1 inline-block rounded bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text"
									>{kw}</span
								>{/each}
						</div>
					</div>
				{/if}
				{#if position.detection_examples?.length}
					<div>
						<div class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
							Detection examples
						</div>
						<ul class="mt-1 list-disc pl-5 text-mlq-text">
							{#each position.detection_examples as ex (ex)}<li>{ex}</li>{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/playbooks/PositionCard.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbooks/PositionCard.svelte src/lib/playbooks/PositionCard.svelte.test.ts
git commit -m "feat(playbooks): PositionCard (primary-first, collapsible internals)"
```

---

## Task 4: PlaybookRow

**Files:**

- Create: `src/lib/playbooks/PlaybookRow.svelte`
- Test: `src/lib/playbooks/PlaybookRow.svelte.test.ts`

Note: the list endpoint omits `positions`, so the row shows **name + description only** (no count).

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbooks/PlaybookRow.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PlaybookRow from './PlaybookRow.svelte';
import type { Playbook } from './types';

const pb = (over: Partial<Playbook> = {}): Playbook =>
	({
		id: 'pb1',
		name: 'NDA — Mutual',
		contract_type: 'NDA',
		description: 'Mutual NDA positions.',
		version: '1.0.0',
		created_at: '',
		updated_at: '',
		...over
	}) as Playbook;

describe('PlaybookRow', () => {
	it('renders the name and description and links to the detail route', () => {
		render(PlaybookRow, { props: { playbook: pb() } });
		const link = screen.getByRole('link', { name: /NDA — Mutual/ });
		expect(link).toHaveAttribute('href', '/playbooks/pb1');
		expect(screen.getByText('Mutual NDA positions.')).toBeInTheDocument();
	});
	it('omits the description line when absent', () => {
		render(PlaybookRow, { props: { playbook: pb({ description: undefined }) } });
		expect(screen.getByRole('link', { name: /NDA — Mutual/ })).toHaveAttribute(
			'href',
			'/playbooks/pb1'
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/playbooks/PlaybookRow.svelte.test.ts`
Expected: FAIL — cannot resolve `./PlaybookRow.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/playbooks/PlaybookRow.svelte`:

```svelte
<script lang="ts">
	import type { Playbook } from './types';
	let { playbook }: { playbook: Playbook } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app playbook link -->
<a href="/playbooks/{playbook.id}" class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50">
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm text-mlq-text">{playbook.name}</span>
		{#if playbook.description}
			<span class="block truncate text-xs text-mlq-muted">{playbook.description}</span>
		{/if}
	</span>
</a>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/playbooks/PlaybookRow.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbooks/PlaybookRow.svelte src/lib/playbooks/PlaybookRow.svelte.test.ts
git commit -m "feat(playbooks): PlaybookRow"
```

---

## Task 5: Index route + Sidebar entry

**Files:**

- Create: `src/routes/(app)/playbooks/+page.server.ts`
- Create: `src/routes/(app)/playbooks/+page.svelte`
- Create: `src/routes/(app)/playbooks/page.server.test.ts`
- Modify: `src/lib/components/Sidebar.svelte`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/playbooks/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks load', () => {
	it('GETs the playbook list and returns it', async () => {
		const list = [{ id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA', version: '1.0.0' }];
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(list), { status: 200 }));
		const out = (await load(ev())) as { playbooks: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
		expect(out.playbooks).toHaveLength(1);
		expect(out.playbooks[0].id).toBe('pb1');
	});
	it('throws 502 on a backend failure', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/playbooks/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Write the implementation**

Create `src/routes/(app)/playbooks/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/playbooks');
	if (!res.ok) throw error(502, 'Could not load playbooks.');
	const playbooks = (await res.json()) as Playbook[];
	return { playbooks };
};
```

Create `src/routes/(app)/playbooks/+page.svelte`:

```svelte
<script lang="ts">
	import PlaybookRow from '$lib/playbooks/PlaybookRow.svelte';
	import { groupByContractFamily } from '$lib/playbooks/contractFamily';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const families = $derived(groupByContractFamily(data.playbooks));
</script>

<svelte:head><title>Playbooks — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Playbooks</h1>
	{#if families.length === 0}
		<div
			class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
		>
			No playbooks available.
		</div>
	{:else}
		{#each families as group (group.family)}
			<h2 class="mt-6 mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase first:mt-0">
				{group.family}
			</h2>
			<ul class="rounded-mlq-control border border-mlq-subtle">
				{#each group.playbooks as playbook (playbook.id)}
					<li class="border-b border-mlq-subtle last:border-b-0"><PlaybookRow {playbook} /></li>
				{/each}
			</ul>
		{/each}
	{/if}
</div>
```

Modify `src/lib/components/Sidebar.svelte`: add `Library` to the lucide import and a nav entry after Skills.

Change the import line:

```svelte
import {(MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut, ScrollText, Library)} from '@lucide/svelte';
```

Add to the `nav` array, right after the `/skills` entry:

```ts
    { href: '/skills', label: 'Skills', icon: ScrollText },
    { href: '/playbooks', label: 'Playbooks', icon: Library },
    { href: '/tabular', label: 'Tabular', icon: Table }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/playbooks/page.server.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the build is clean**

Run: `npm run check`
Expected: 0 errors and 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless).

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/playbooks/+page.server.ts" "src/routes/(app)/playbooks/+page.svelte" "src/routes/(app)/playbooks/page.server.test.ts" src/lib/components/Sidebar.svelte
git commit -m "feat(playbooks): /playbooks index (grouped) + sidebar entry"
```

---

## Task 6: Detail route

**Files:**

- Create: `src/routes/(app)/playbooks/[id]/+page.server.ts`
- Create: `src/routes/(app)/playbooks/[id]/+page.svelte`
- Create: `src/routes/(app)/playbooks/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/playbooks/[id]/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = (id = 'pb1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id] load', () => {
	it('GETs the playbook by id', async () => {
		const playbook = {
			id: 'pb1',
			name: 'DPA — GDPR',
			contract_type: 'DPA-GDPR',
			version: '1.0.0',
			positions: []
		};
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(playbook), { status: 200 }));
		const out = (await load(ev())) as { playbook: { id: string } };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
		expect(out.playbook.id).toBe('pb1');
	});
	it('throws 404 when the playbook is missing', async () => {
		lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 404 });
	});
	it('throws 502 on other backend failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/playbooks/[id]/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Write the implementation**

Create `src/routes/(app)/playbooks/[id]/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
	if (res.status === 404) throw error(404, 'Playbook not found.');
	if (!res.ok) throw error(502, 'Could not load this playbook.');
	const playbook = (await res.json()) as Playbook;
	return { playbook };
};
```

Create `src/routes/(app)/playbooks/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import PositionCard from '$lib/playbooks/PositionCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const positions = $derived(
		[...(data.playbook.positions ?? [])].sort(
			(a, b) => (a.position_order ?? 0) - (b.position_order ?? 0)
		)
	);
</script>

<svelte:head><title>{data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
	<a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
	<h1 class="mt-2 font-serif text-2xl text-mlq-strong">{data.playbook.name}</h1>
	<div class="mt-1 text-sm text-mlq-muted">
		{data.playbook.contract_type}{#if data.playbook.version}
			· v{data.playbook.version}{/if} · {positions.length} position{positions.length === 1
			? ''
			: 's'}
	</div>
	{#if data.playbook.description}
		<p class="mt-2 text-sm text-mlq-text">{data.playbook.description}</p>
	{/if}

	{#if positions.length === 0}
		<p class="mt-6 text-sm text-mlq-muted">No positions defined.</p>
	{:else}
		<div class="mt-6 space-y-3">
			{#each positions as position (position.id)}<PositionCard {position} />{/each}
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/playbooks/[id]/page.server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the build is clean**

Run: `npm run check`
Expected: 0 errors and 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/playbooks/[id]/+page.server.ts" "src/routes/(app)/playbooks/[id]/+page.svelte" "src/routes/(app)/playbooks/[id]/page.server.test.ts"
git commit -m "feat(playbooks): /playbooks/[id] detail (positions view)"
```

---

## Task 7: Live end-to-end test

**Files:**

- Create: `tests/playbooks-browse.spec.ts`

- [ ] **Step 1: Rebuild `donna-web` so the container serves the new routes**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` recreated and healthy. (REQUIRED before the live test — the container serves a built image, not live `src/`.)

- [ ] **Step 2: Write the e2e test**

Create `tests/playbooks-browse.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('browse playbooks: grouped index → detail with positions and expandable internals', async ({
	page
}) => {
	await login(page);

	// Sidebar entry exists, and the index lists the built-ins.
	await expect(page.locator('aside a[href="/playbooks"]')).toBeVisible();
	await page.goto('/playbooks');
	await expect(page.getByRole('heading', { name: 'Playbooks', level: 1 })).toBeVisible();

	// The DPA — GDPR built-in is present; open it.
	const link = page.getByRole('link', { name: /DPA — GDPR/i });
	await expect(link).toBeVisible({ timeout: 10000 });
	await link.click();
	await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+/i);

	// Detail: heading, position count, a severity badge, and expandable internals.
	await expect(page.getByRole('heading', { name: /DPA — GDPR/i, level: 1 })).toBeVisible();
	await expect(page.getByText(/\d+ positions?/)).toBeVisible();
	await expect(page.getByText('Critical').first()).toBeVisible();
	const toggle = page.getByRole('button', { name: /show matching details/i }).first();
	await toggle.click();
	await expect(page.getByText(/Detection keywords|Fallback tiers/).first()).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e against the running stack**

Run: `npx playwright test tests/playbooks-browse.spec.ts`
Expected: PASS — grouped index, detail with 8 positions, severity badge, expanded internals.

- [ ] **Step 4: Full verification gate**

Run: `npm run check && npx vitest run`
Expected: `npm run check` exit 0 with "0 errors and 0 warnings"; all vitest suites green.

- [ ] **Step 5: Commit**

```bash
git add tests/playbooks-browse.spec.ts
git commit -m "test(playbooks): live e2e — browse index + detail"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** §5 routes → Tasks 5 (index+sidebar) + 6 (detail); §6 components → Tasks 1–4 (types/contractFamily/SeverityBadge/PositionCard/PlaybookRow); §7 visual language → the `+page.svelte` markup; §8 tests → unit tests per component/helper + server-load tests + the live e2e. **Sidebar placement corrected** vs spec wording: it's a top-level entry next to Skills (the spec said "near Skills/Knowledge/Matters" but Knowledge isn't in the nav and `/workflows` is a stub).
- **List-vs-detail correction:** the list endpoint omits `positions`, so `PlaybookRow` shows name + description (no count); the count lives on the detail page. (Spec §6 said "name + position count" for the row — corrected here.)
- **Type consistency:** `Playbook`/`Position`/`FallbackTier` come from one `types.ts`; `groupByContractFamily`/`PlaybookFamily`, `SeverityBadge severity`, `PositionCard position`, `PlaybookRow playbook` names are consistent across tasks and call sites.
- **No placeholders:** every code/command step is concrete.
