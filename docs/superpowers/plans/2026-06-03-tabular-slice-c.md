# Tabular Reviews — Slice C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tabular review run from a registered `output_format: table` **skill** (vs. ad-hoc columns), add a per-column **`minimum_inference_tier`** floor and **column reorder** to ad-hoc mode, and (pin-gated) a per-column **ensemble verification** toggle.

**Architecture:** All client-side in the relocated builder (`/tabular/new`) + its `createTabularBuilder` rune controller. The backend takes `skill_name` **XOR** `columns` on the existing `/tabular/{preview-cost,execute}` proxies (no proxy change — the builder constructs the body via a new `buildRequest()`). Table skills are SSR-loaded and filtered client-side. The run page/grid/export are untouched (skill runs resolve to columns the grid already renders).

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript (0 `any`, 0 warnings), Vitest + @testing-library/svelte, Tailwind (`mlq-*` tokens).

**Spec:** `docs/superpowers/specs/2026-06-03-donna-p6-tabular-slice-c-design.md`

---

## File structure

| File                                               | Responsibility                                                                               | Task    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| `src/lib/tabular/tabularBuilder.svelte.ts`         | mode/skill state, mode-aware `canRun`, `buildRequest()`, `moveColumn`, tier/ensemble fields  | 1,5,6,7 |
| `src/lib/tabular/tabularBuilder.svelte.test.ts`    | builder unit tests (extend)                                                                  | 1,5,6   |
| `src/lib/tabular/types.ts`                         | `TableSkillSummary`; `ColumnDraft` gains `minimum_inference_tier?`, `ensemble_verification?` | 1,5,7   |
| `src/routes/(app)/tabular/new/+page.server.ts`     | also SSR-load table skills                                                                   | 2       |
| `src/routes/(app)/tabular/new/page.server.test.ts` | load test (extend)                                                                           | 2       |
| `src/lib/tabular/TableSkillPicker.svelte`          | pure searchable table-skill picker (new)                                                     | 3       |
| `src/lib/tabular/TableSkillPicker.svelte.test.ts`  | picker test (new)                                                                            | 3       |
| `src/routes/(app)/tabular/new/+page.svelte`        | mode toggle, picker/builder swap, `buildRequest()` wiring, mode-aware footer                 | 4       |
| `src/lib/tabular/ColumnBuilder.svelte`             | per-column tier select, ↑/↓ reorder, (pin-gated) ensemble checkbox                           | 5,6,7   |
| `src/lib/api/backend.d.ts` (regen)                 | pin bump                                                                                     | 7       |

**Gate (every task):** `npm run check` → **0 errors and 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). No `any`, no non-null `!`. Targeted vitest per task; full `npx vitest run` (≥885) before the PR.

---

## Task 1: Builder mode, skill state, and `buildRequest()`

Teaches `createTabularBuilder` the ad-hoc/skill mode switch and a single source of truth for the request body. Ad-hoc behaviour is unchanged.

**Files:**

- Modify: `src/lib/tabular/types.ts`
- Modify: `src/lib/tabular/tabularBuilder.svelte.ts`
- Modify: `src/lib/tabular/tabularBuilder.svelte.test.ts`

- [ ] **Step 1: Add the `TableSkillSummary` type**

In `src/lib/tabular/types.ts`, after the `TabularExecutionSummary` export, add:

```ts
/** A registered `output_format: table` skill, as surfaced to the builder's picker. */
export interface TableSkillSummary {
	name: string;
	title: string;
	description?: string | null;
}
```

- [ ] **Step 2: Write the failing builder tests**

Add to `src/lib/tabular/tabularBuilder.svelte.test.ts` inside the `describe('createTabularBuilder', …)` block:

```ts
it('defaults to ad-hoc mode and builds an ad-hoc request body', () => {
	const b = createTabularBuilder();
	expect(b.mode).toBe('adhoc');
	b.addDoc({ document_id: 'd1', name: 'a.pdf' });
	b.setColumn(b.columns[0].id, { name: 'Term', query: 'How long?' });
	expect(b.buildRequest()).toEqual({
		document_ids: ['d1'],
		columns: [{ name: 'Term', query: 'How long?' }]
	});
});

it('skill mode needs a doc + a selected skill, and builds a skill request body', () => {
	const b = createTabularBuilder();
	b.setMode('skill');
	expect(b.mode).toBe('skill');
	expect(b.canRun).toBe(false); // no docs, no skill
	b.addDoc({ document_id: 'd1', name: 'a.pdf' });
	expect(b.canRun).toBe(false); // still no skill
	b.selectSkill({ name: 'contract-snapshot', title: 'Contract Snapshot' });
	expect(b.canRun).toBe(true);
	expect(b.buildRequest()).toEqual({ document_ids: ['d1'], skill_name: 'contract-snapshot' });
	b.clearSkill();
	expect(b.selectedSkill).toBeNull();
	expect(b.canRun).toBe(false);
});
```

- [ ] **Step 3: Run to confirm they fail**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: FAIL (`mode`/`setMode`/`selectSkill`/`buildRequest` undefined).

- [ ] **Step 4: Implement mode/skill/buildRequest in the builder**

In `src/lib/tabular/tabularBuilder.svelte.ts`, import the new type and add state + methods. Replace the file's contents with:

```ts
import type { SelectedDoc, ColumnDraft, ColumnSpec, TableSkillSummary } from './types';

type BuildRequest = { document_ids: string[] } & (
	| { columns: ColumnSpec[] }
	| { skill_name: string }
);

export function createTabularBuilder() {
	let docs = $state<SelectedDoc[]>([]);
	let columns = $state<ColumnDraft[]>([{ id: crypto.randomUUID(), name: '', query: '' }]);
	let mode = $state<'adhoc' | 'skill'>('adhoc');
	let selectedSkill = $state<TableSkillSummary | null>(null);

	function validColumns(): ColumnSpec[] {
		return columns
			.map((c) => ({ name: c.name.trim(), query: c.query.trim() }))
			.filter((c) => c.name.length > 0 && c.query.length > 0);
	}

	function hasDuplicateNames(): boolean {
		const names = validColumns().map((c) => c.name.toLowerCase());
		return new Set(names).size !== names.length;
	}

	return {
		get docs() {
			return docs;
		},
		get columns() {
			return columns;
		},
		get mode() {
			return mode;
		},
		get selectedSkill() {
			return selectedSkill;
		},
		get cellCount() {
			return docs.length * validColumns().length;
		},
		get canRun() {
			if (docs.length === 0) return false;
			return mode === 'skill'
				? selectedSkill !== null
				: validColumns().length > 0 && !hasDuplicateNames();
		},
		get duplicateNames() {
			return hasDuplicateNames();
		},
		setMode(m: 'adhoc' | 'skill') {
			mode = m;
		},
		selectSkill(s: TableSkillSummary) {
			selectedSkill = s;
		},
		clearSkill() {
			selectedSkill = null;
		},
		hasDoc(documentId: string) {
			return docs.some((d) => d.document_id === documentId);
		},
		addDoc(doc: SelectedDoc) {
			if (!docs.some((d) => d.document_id === doc.document_id)) docs = [...docs, doc];
		},
		removeDoc(documentId: string) {
			docs = docs.filter((d) => d.document_id !== documentId);
		},
		addColumn() {
			columns = [...columns, { id: crypto.randomUUID(), name: '', query: '' }];
		},
		removeColumn(id: string) {
			if (columns.length <= 1) return; // keep at least one row
			columns = columns.filter((c) => c.id !== id);
		},
		setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query'>>) {
			columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
		},
		validColumns,
		buildRequest(): BuildRequest {
			const document_ids = docs.map((d) => d.document_id);
			return mode === 'skill' && selectedSkill
				? { document_ids, skill_name: selectedSkill.name }
				: { document_ids, columns: validColumns() };
		}
	};
}
```

- [ ] **Step 5: Run the builder tests — expect PASS**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: PASS (existing + 2 new). Run `npm run check` → 0/0 (note `validColumns` now returns `ColumnSpec[]`; `{name,query}` objects are valid `ColumnSpec`s).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tabular/types.ts src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts
git commit -m "feat(tabular): builder ad-hoc/skill mode + buildRequest()

createTabularBuilder gains a mode (adhoc|skill), selectedSkill state, a mode-aware
canRun, and buildRequest() returning {document_ids, columns} or {document_ids,
skill_name} — the single source of truth for the preview/execute body."
```

---

## Task 2: SSR-load table skills

The builder page already SSR-loads matters/files; also load the skill list and filter to `output_format: table`.

**Files:**

- Modify: `src/routes/(app)/tabular/new/+page.server.ts`
- Modify: `src/routes/(app)/tabular/new/page.server.test.ts`

- [ ] **Step 1: Write the failing load tests**

The existing test mocks `lqFetch` per call in order. The load will fetch `/api/v1/projects` first, then (if `?matter=`) the project + files, then `/api/v1/skills` **last**. Update `src/routes/(app)/tabular/new/page.server.test.ts`: add a trailing skills mock to each existing test, and add a new filtering test. Replace the file body's `describe` with:

```ts
describe('/tabular/new load', () => {
	it('returns matters, no matterFiles, and table skills (filtered) without ?matter=', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify([
						{
							name: 'contract-snapshot',
							title: 'Contract Snapshot',
							description: 'Key terms',
							output_format: 'table'
						},
						{ name: 'comms-improver', title: 'Comms Improver', output_format: 'report' }
					]),
					{ status: 200 }
				)
			);
		const out = (await load(ev())) as {
			matters: { id: string }[];
			matterFiles: unknown[];
			tableSkills: { name: string }[];
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/skills');
		expect(out.matters).toEqual([{ id: 'm1', name: 'Acme' }]);
		expect(out.matterFiles).toEqual([]);
		expect(out.tableSkills).toEqual([
			{ name: 'contract-snapshot', title: 'Contract Snapshot', description: 'Key terms' }
		]);
	});

	it('resolves ready matter files (only ready + with document_id) when ?matter= is set', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ attached_file_ids: ['f1', 'f2', 'f3'] }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f1',
						filename: 'a.pdf',
						ingestion_status: 'ready',
						document_id: 'doc1'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f2',
						filename: 'b.pdf',
						ingestion_status: 'processing',
						document_id: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f3',
						filename: 'c.pdf',
						ingestion_status: 'ready',
						document_id: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
		const out = (await load(ev('m1'))) as {
			matterFiles: { document_id: string; name: string }[];
			tableSkills: unknown[];
		};
		expect(out.matterFiles).toEqual([{ document_id: 'doc1', name: 'a.pdf' }]);
		expect(out.tableSkills).toEqual([]);
	});

	it('returns an empty tableSkills list when the skills call fails', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
			.mockResolvedValueOnce(new Response('nope', { status: 500 }));
		const out = (await load(ev())) as { tableSkills: unknown[] };
		expect(out.tableSkills).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run "src/routes/(app)/tabular/new/page.server.test.ts"`
Expected: FAIL (no `tableSkills` / wrong call order).

- [ ] **Step 3: Add the skills load**

In `src/routes/(app)/tabular/new/+page.server.ts`, add the type import and fetch skills last. Replace the file with:

```ts
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { components } from '$lib/api/backend';
import type { TableSkillSummary } from '$lib/tabular/types';

type FileMeta = components['schemas']['File'];
type SkillSummary = components['schemas']['SkillSummary'];

export const load: PageServerLoad = async (event) => {
	const mRes = await lqFetch(event, '/api/v1/projects');
	const matters = (mRes.ok ? ((await mRes.json()) as { id: string; name: string }[]) : []).map(
		(m) => ({
			id: m.id,
			name: m.name
		})
	);

	let matterFiles: { document_id: string; name: string }[] = [];
	const matterId = event.url.searchParams.get('matter');
	if (matterId) {
		const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
		if (projRes.ok) {
			const proj = (await projRes.json()) as { attached_file_ids?: string[] };
			const metas = await Promise.all(
				(proj.attached_file_ids ?? []).map(async (fid) => {
					const r = await lqFetch(event, `/api/v1/files/${fid}`);
					return r.ok ? ((await r.json()) as FileMeta) : null;
				})
			);
			matterFiles = metas
				.filter(
					(f): f is FileMeta => f !== null && f.ingestion_status === 'ready' && !!f.document_id
				)
				.map((f) => ({ document_id: f.document_id as string, name: f.filename }));
		}
	}

	const sRes = await lqFetch(event, '/api/v1/skills');
	const allSkills = sRes.ok ? ((await sRes.json()) as SkillSummary[]) : [];
	const tableSkills: TableSkillSummary[] = allSkills
		.filter((s) => s.output_format === 'table')
		.map((s) => ({ name: s.name, title: s.title, description: s.description ?? null }));

	return { matters, matterFiles, selectedMatterId: matterId, tableSkills };
};
```

- [ ] **Step 4: Run the load tests — expect PASS**

Run: `npx vitest run "src/routes/(app)/tabular/new/page.server.test.ts"`
Expected: PASS (3 tests). `npm run check` → 0/0.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/tabular/new/+page.server.ts" "src/routes/(app)/tabular/new/page.server.test.ts"
git commit -m "feat(tabular): SSR-load output_format:table skills for the builder

Loads GET /api/v1/skills and filters to output_format === 'table' (empty on
failure), surfaced as data.tableSkills for the table-skill picker."
```

---

## Task 3: `TableSkillPicker` component

A pure searchable picker over `data.tableSkills` (mirrors `MatterPicker`).

**Files:**

- Create: `src/lib/tabular/TableSkillPicker.svelte`
- Create: `src/lib/tabular/TableSkillPicker.svelte.test.ts`

- [ ] **Step 1: Write the failing picker test**

Create `src/lib/tabular/TableSkillPicker.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import TableSkillPicker from './TableSkillPicker.svelte';
import type { TableSkillSummary } from './types';

const skills: TableSkillSummary[] = [
	{
		name: 'contract-snapshot',
		title: 'Contract Snapshot',
		description: 'Key terms across contracts'
	},
	{ name: 'nda-snapshot', title: 'NDA Snapshot', description: null }
];

describe('TableSkillPicker', () => {
	it('lists skills and calls onselect with the chosen skill', async () => {
		const onselect = vi.fn();
		render(TableSkillPicker, { props: { skills, selected: null, onselect } as never });
		await fireEvent.click(screen.getByText('Contract Snapshot'));
		expect(onselect).toHaveBeenCalledWith(skills[0]);
	});

	it('filters by the search query', async () => {
		render(TableSkillPicker, { props: { skills, selected: null, onselect: () => {} } as never });
		await fireEvent.input(screen.getByLabelText(/search table skills/i), {
			target: { value: 'nda' }
		});
		expect(screen.queryByText('Contract Snapshot')).not.toBeInTheDocument();
		expect(screen.getByText('NDA Snapshot')).toBeInTheDocument();
	});

	it('shows an empty state when there are no table skills', () => {
		render(TableSkillPicker, {
			props: { skills: [], selected: null, onselect: () => {} } as never
		});
		expect(screen.getByText(/no table skills/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/tabular/TableSkillPicker.svelte.test.ts`
Expected: FAIL (cannot resolve `./TableSkillPicker.svelte`).

- [ ] **Step 3: Implement the picker**

Create `src/lib/tabular/TableSkillPicker.svelte`:

```svelte
<script lang="ts">
	import type { TableSkillSummary } from './types';

	let {
		skills,
		selected,
		onselect
	}: {
		skills: TableSkillSummary[];
		selected: TableSkillSummary | null;
		onselect: (s: TableSkillSummary) => void;
	} = $props();

	let q = $state('');
	const filtered = $derived(
		q.trim() ? skills.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase())) : skills
	);
</script>

{#if skills.length === 0}
	<div
		class="rounded-mlq-control border border-dashed border-mlq-subtle px-3 py-6 text-center text-xs text-mlq-muted"
	>
		No table skills available. Create a skill with <code>output_format: table</code> to use one here.
	</div>
{:else}
	<div class="rounded-mlq-control border border-mlq-subtle">
		<input
			type="text"
			aria-label="Search table skills"
			placeholder="Search table skills…"
			bind:value={q}
			class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
		/>
		<ul class="max-h-64 overflow-y-auto">
			{#each filtered as s (s.name)}
				<li>
					<button
						type="button"
						onclick={() => onselect(s)}
						class="block w-full px-3 py-2 text-left hover:bg-mlq-subtle/50 {selected?.name ===
						s.name
							? 'bg-mlq-subtle/40'
							: ''}"
					>
						<span class="block truncate text-sm text-mlq-text">{s.title}</span>
						{#if s.description}<span class="block truncate text-xs text-mlq-muted"
								>{s.description}</span
							>{/if}
					</button>
				</li>
			{/each}
			{#if filtered.length === 0}
				<li class="px-3 py-2 text-xs text-mlq-muted">No table skills match.</li>
			{/if}
		</ul>
	</div>
{/if}
```

- [ ] **Step 4: Run the picker test — expect PASS**

Run: `npx vitest run src/lib/tabular/TableSkillPicker.svelte.test.ts`
Expected: PASS (3 tests). `npm run check` → 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabular/TableSkillPicker.svelte src/lib/tabular/TableSkillPicker.svelte.test.ts
git commit -m "feat(tabular): TableSkillPicker — searchable output_format:table skill list

Pure component over data.tableSkills with search + empty state; emits the chosen
skill via onselect. Mirrors MatterPicker."
```

---

## Task 4: Wire mode toggle + picker into the builder page

Adds the segmented mode control, swaps the column editor for the skill picker in skill mode, shows a selected-skill summary, and routes preview/execute through `buildRequest()`.

**Files:**

- Modify: `src/routes/(app)/tabular/new/+page.svelte`

- [ ] **Step 1: Replace the page**

Replace `src/routes/(app)/tabular/new/+page.svelte` with:

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import DocumentMultiPicker from '$lib/tabular/DocumentMultiPicker.svelte';
	import ColumnBuilder from '$lib/tabular/ColumnBuilder.svelte';
	import CostPreviewModal from '$lib/tabular/CostPreviewModal.svelte';
	import TableSkillPicker from '$lib/tabular/TableSkillPicker.svelte';
	import SegmentedControl from '$lib/preferences/SegmentedControl.svelte';
	import { createTabularBuilder } from '$lib/tabular/tabularBuilder.svelte';
	import { createTabularUploads } from '$lib/tabular/tabularUploads.svelte';
	import type { TabularPreviewCostResponse, TabularExecution } from '$lib/tabular/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const builder = createTabularBuilder();
	const uploads = createTabularUploads();
	onDestroy(() => uploads.dispose());

	let preview = $state<TabularPreviewCostResponse | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function onmatter(id: string | null) {
		goto(id ? `/tabular/new?matter=${id}` : '/tabular/new', { keepFocus: true, noScroll: true });
	}

	async function openPreview() {
		if (!builder.canRun || busy) return;
		error = null;
		busy = true;
		try {
			const res = await fetch('/tabular/preview-cost', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(builder.buildRequest())
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				error = body?.message ?? 'Could not estimate the cost. Please try again.';
				return;
			}
			preview = (await res.json()) as TabularPreviewCostResponse;
		} catch {
			error = 'Could not estimate the cost. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function confirmRun() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const res = await fetch('/tabular/execute', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					...builder.buildRequest(),
					confirmed_cost_usd: preview?.estimated_cost_usd
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				error = body?.message ?? 'Could not start the review. Please try again.';
				busy = false;
				return;
			}
			const exec = (await res.json()) as TabularExecution;
			preview = null;
			await goto(`/tabular/${exec.id}`);
		} catch {
			error = 'Could not start the review. Please try again.';
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8 pb-28">
	<h1 class="font-serif text-2xl text-mlq-strong">New tabular review</h1>
	<p class="mt-1 text-sm text-mlq-muted">
		Ask the same questions across many documents and get a cited table.
	</p>

	<div class="mt-6 grid gap-8 md:grid-cols-2">
		<section>
			<h2 class="mb-2 text-sm font-semibold text-mlq-strong">Documents</h2>
			<DocumentMultiPicker
				{builder}
				{uploads}
				matters={data.matters}
				matterFiles={data.matterFiles}
				selectedMatterId={data.selectedMatterId}
				{onmatter}
			/>
		</section>
		<section>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-mlq-strong">Columns</h2>
				<SegmentedControl
					label="Column source"
					options={[
						{ value: 'adhoc', label: 'Define columns' },
						{ value: 'skill', label: 'Use a table skill' }
					]}
					value={builder.mode}
					onchange={(v) => builder.setMode(v as 'adhoc' | 'skill')}
				/>
			</div>
			{#if builder.mode === 'skill'}
				<TableSkillPicker
					skills={data.tableSkills}
					selected={builder.selectedSkill}
					onselect={(s) => builder.selectSkill(s)}
				/>
				{#if builder.selectedSkill}
					<div
						class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt px-3 py-2"
					>
						<p class="text-sm font-medium text-mlq-text">{builder.selectedSkill.title}</p>
						{#if builder.selectedSkill.description}<p class="text-xs text-mlq-muted">
								{builder.selectedSkill.description}
							</p>{/if}
						<p class="mt-1 text-xs text-mlq-muted">
							This skill defines the columns. The exact column count and cost appear in the preview.
						</p>
					</div>
				{/if}
			{:else}
				<ColumnBuilder {builder} />
				{#if builder.duplicateNames}<p class="mt-2 text-xs text-mlq-error">
						Column names must be unique.
					</p>{/if}
			{/if}
		</section>
	</div>

	{#if error}<p class="mt-4 text-sm text-mlq-error">{error}</p>{/if}
</div>

<div class="fixed inset-x-0 bottom-0 border-t border-mlq-subtle bg-mlq-surface px-6 py-3">
	<div class="mx-auto flex max-w-5xl items-center justify-between">
		<span class="text-sm text-mlq-muted">
			{#if builder.mode === 'skill'}
				{builder.docs.length} docs · {builder.selectedSkill
					? builder.selectedSkill.title
					: 'select a table skill'}
			{:else}
				{builder.docs.length} docs × {builder.validColumns().length} cols = {builder.cellCount} cells
			{/if}
		</span>
		<button
			type="button"
			onclick={openPreview}
			disabled={!builder.canRun || busy}
			class="rounded-mlq-control bg-mlq-strong px-4 py-2 text-sm text-white disabled:opacity-40"
		>
			Preview cost
		</button>
	</div>
</div>

{#if preview}
	<CostPreviewModal {preview} {busy} onconfirm={confirmRun} oncancel={() => (preview = null)} />
{/if}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Run the tabular route + builder tests (regression)**

Run: `npx vitest run "src/routes/(app)/tabular" src/lib/tabular`
Expected: PASS (page server tests + builder + picker, all green).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/tabular/new/+page.svelte"
git commit -m "feat(tabular): builder mode toggle + table-skill picker wiring

Segmented 'Define columns | Use a table skill' control; skill mode swaps the
column editor for TableSkillPicker + a selected-skill summary; preview/execute
route through builder.buildRequest(); footer is mode-aware."
```

---

## Task 5: Per-column `minimum_inference_tier`

Adds an optional per-column tier floor to ad-hoc columns (honored by the executor).

**Files:**

- Modify: `src/lib/tabular/types.ts`
- Modify: `src/lib/tabular/tabularBuilder.svelte.ts`
- Modify: `src/lib/tabular/tabularBuilder.svelte.test.ts`
- Modify: `src/lib/tabular/ColumnBuilder.svelte`

- [ ] **Step 1: Extend `ColumnDraft`**

In `src/lib/tabular/types.ts`, extend the `ColumnDraft` interface (currently `{ id; name; query }`):

```ts
export interface ColumnDraft {
	id: string;
	name: string;
	query: string;
	minimum_inference_tier?: number | null;
}
```

- [ ] **Step 2: Write the failing builder test**

Add to `src/lib/tabular/tabularBuilder.svelte.test.ts`:

```ts
it('carries minimum_inference_tier into validColumns when set, omits it when null', () => {
	const b = createTabularBuilder();
	b.addDoc({ document_id: 'd1', name: 'a.pdf' });
	b.setColumn(b.columns[0].id, { name: 'Term', query: 'q', minimum_inference_tier: 4 });
	expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q', minimum_inference_tier: 4 }]);
	b.setColumn(b.columns[0].id, { minimum_inference_tier: null });
	expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q' }]);
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: FAIL (tier not in `validColumns` output / `setColumn` rejects the field).

- [ ] **Step 4: Thread the field through the builder**

In `src/lib/tabular/tabularBuilder.svelte.ts`: widen `setColumn`'s patch type and include the tier in `validColumns` when set. Replace `validColumns` and `setColumn`:

```ts
function validColumns(): ColumnSpec[] {
	return columns
		.map((c) => {
			const base = { name: c.name.trim(), query: c.query.trim() };
			return c.minimum_inference_tier != null
				? { ...base, minimum_inference_tier: c.minimum_inference_tier }
				: base;
		})
		.filter((c) => c.name.length > 0 && c.query.length > 0);
}
```

```ts
    setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query' | 'minimum_inference_tier'>>) {
      columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
```

- [ ] **Step 5: Run the builder test — expect PASS**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the per-column tier UI**

In `src/lib/tabular/ColumnBuilder.svelte`, add a tier `<select>` under the query input (inside the `flex-1 space-y-1` div, after the query input on line 25). Insert:

```svelte
<label class="flex items-center gap-2 text-xs text-mlq-muted">
	Min. model tier
	<select
		value={col.minimum_inference_tier ?? ''}
		onchange={(e) =>
			builder.setColumn(col.id, {
				minimum_inference_tier: e.currentTarget.value ? Number(e.currentTarget.value) : null
			})}
		aria-label="Minimum model tier for {col.name || 'this column'}"
		class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
	>
		<option value="">None</option>
		<option value="1">1</option>
		<option value="2">2</option>
		<option value="3">3</option>
		<option value="4">4</option>
		<option value="5">5</option>
	</select>
</label>
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run check` → `0 errors and 0 warnings`. Run `npx vitest run src/lib/tabular` → green.

```bash
git add src/lib/tabular/types.ts src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts src/lib/tabular/ColumnBuilder.svelte
git commit -m "feat(tabular): per-column minimum_inference_tier floor

Each ad-hoc column gets an optional 1–5 tier select; validColumns() includes
minimum_inference_tier when set. Honored by the executor (may 403 below floor);
surfaces in the cost preview's per-tier breakdown."
```

---

## Task 6: Column reorder

↑/↓ buttons to reorder ad-hoc columns; grid order follows request order.

**Files:**

- Modify: `src/lib/tabular/tabularBuilder.svelte.ts`
- Modify: `src/lib/tabular/tabularBuilder.svelte.test.ts`
- Modify: `src/lib/tabular/ColumnBuilder.svelte`

- [ ] **Step 1: Write the failing reorder test**

Add to `src/lib/tabular/tabularBuilder.svelte.test.ts`:

```ts
it('moveColumn swaps adjacent columns and is boundary-safe', () => {
	const b = createTabularBuilder();
	b.setColumn(b.columns[0].id, { name: 'A', query: 'qa' });
	b.addColumn();
	b.setColumn(b.columns[1].id, { name: 'B', query: 'qb' });
	const [a, bb] = [b.columns[0].id, b.columns[1].id];
	b.moveColumn(a, 1); // A down → [B, A]
	expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
	b.moveColumn(a, 1); // A already last → no-op
	expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
	b.moveColumn(bb, -1); // B already first → no-op
	expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: FAIL (`moveColumn` undefined).

- [ ] **Step 3: Implement `moveColumn`**

In `src/lib/tabular/tabularBuilder.svelte.ts`, add to the returned object (after `removeColumn`):

```ts
    moveColumn(id: string, dir: -1 | 1) {
      const i = columns.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= columns.length) return;
      const next = [...columns];
      [next[i], next[j]] = [next[j], next[i]];
      columns = next;
    },
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Add ↑/↓ buttons**

In `src/lib/tabular/ColumnBuilder.svelte`, replace the `{#if builder.columns.length > 1}` remove-button block (lines 27–36) with reorder + remove controls (uses the `(col, i)` index — change the `{#each}` to `{#each builder.columns as col, i (col.id)}`):

```svelte
{#if builder.columns.length > 1}
	<div class="mt-1.5 flex flex-col items-center">
		<button
			type="button"
			aria-label="Move {col.name || 'column'} up"
			onclick={() => builder.moveColumn(col.id, -1)}
			disabled={i === 0}
			class="px-1 text-mlq-muted hover:text-mlq-text disabled:opacity-30">↑</button
		>
		<button
			type="button"
			aria-label="Move {col.name || 'column'} down"
			onclick={() => builder.moveColumn(col.id, 1)}
			disabled={i === builder.columns.length - 1}
			class="px-1 text-mlq-muted hover:text-mlq-text disabled:opacity-30">↓</button
		>
		<button
			type="button"
			aria-label="Remove column"
			onclick={() => builder.removeColumn(col.id)}
			class="px-1 text-mlq-muted hover:text-mlq-text"><X size={16} /></button
		>
	</div>
{/if}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run check` → 0/0. Run `npx vitest run src/lib/tabular` → green.

```bash
git add src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts src/lib/tabular/ColumnBuilder.svelte
git commit -m "feat(tabular): reorder ad-hoc columns with up/down controls

builder.moveColumn swaps adjacent columns (boundary-safe); ColumnBuilder gets
per-row ↑/↓ buttons. Grid column order follows request order."
```

---

## Task 7 (PIN-GATED — do ONLY if the ensemble SHA has landed): per-column ensemble verification

**Gate:** Run only if the upstream ask (`docs/upstream-requests/lq-ai-tabular-ensemble-verification.md`) has merged and you have a pin SHA. **If not, STOP** — Slice C ships without it and this becomes P6-C.1 (a tiny follow-up). The toggle's frontend contract (`ColumnSpec.ensemble_verification: boolean`) is already stable; only the live-observe step depends on the SHA. Note: the backend change also surfaces `verification_method` on tabular cell citations — Donna's doc panel renders that with no extra code (closes P6-B.1); no frontend work needed for that beyond the pin bump + regen.

**Files:**

- Modify: `vendor/lq-ai` pin + `src/lib/api/backend.d.ts` (regen)
- Modify: `src/lib/tabular/types.ts` (`ColumnDraft.ensemble_verification?`)
- Modify: `src/lib/tabular/tabularBuilder.svelte.ts` (thread the field)
- Modify: `src/lib/tabular/tabularBuilder.svelte.test.ts`
- Modify: `src/lib/tabular/ColumnBuilder.svelte` (checkbox)

- [ ] **Step 1: Bump the pin + regen**

```bash
cd /Users/kevinkeller/Code/Donna/vendor/lq-ai && git fetch origin && git checkout <SHA> && cd -
npm run gen:api
npm run check
```

Expected: 0/0. (`ColumnSpec.ensemble_verification` already exists in the schema; the regen may be additive only.)

- [ ] **Step 2: Write the failing builder test**

Add to `src/lib/tabular/tabularBuilder.svelte.test.ts`:

```ts
it('carries ensemble_verification into validColumns when true, omits it otherwise', () => {
	const b = createTabularBuilder();
	b.addDoc({ document_id: 'd1', name: 'a.pdf' });
	b.setColumn(b.columns[0].id, { name: 'Term', query: 'q', ensemble_verification: true });
	expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q', ensemble_verification: true }]);
	b.setColumn(b.columns[0].id, { ensemble_verification: false });
	expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q' }]);
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 4: Thread the field**

In `types.ts`, add `ensemble_verification?: boolean` to `ColumnDraft`. In `tabularBuilder.svelte.ts`, widen `setColumn`'s patch to include `'ensemble_verification'` and include it in `validColumns` when true (only emit when truthy):

```ts
function validColumns(): ColumnSpec[] {
	return columns
		.map((c) => {
			const base: ColumnSpec = { name: c.name.trim(), query: c.query.trim() };
			if (c.minimum_inference_tier != null) base.minimum_inference_tier = c.minimum_inference_tier;
			if (c.ensemble_verification) base.ensemble_verification = true;
			return base;
		})
		.filter((c) => c.name.length > 0 && c.query.length > 0);
}
```

```ts
    setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query' | 'minimum_inference_tier' | 'ensemble_verification'>>) {
      columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
```

- [ ] **Step 5: Add the checkbox + run tests**

In `ColumnBuilder.svelte`, add under the tier select:

```svelte
<label class="flex items-center gap-2 text-xs text-mlq-muted">
	<input
		type="checkbox"
		checked={col.ensemble_verification ?? false}
		onchange={(e) => builder.setColumn(col.id, { ensemble_verification: e.currentTarget.checked })}
		class="size-3.5 accent-mlq-workflow"
	/>
	Ensemble verification
</label>
```

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts` → PASS. `npm run check` → 0/0.

- [ ] **Step 6: Commit**

```bash
git add vendor/lq-ai src/lib/api/backend.d.ts src/lib/tabular/types.ts src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts src/lib/tabular/ColumnBuilder.svelte
git commit -m "feat(tabular): per-column ensemble verification toggle

Pins lq-ai to <SHA> (ensemble verification honored on tabular columns) and adds a
per-column Ensemble verification checkbox threaded through validColumns(). The
backend also surfaces verification_method on tabular cell citations, which the
doc panel already renders (closes P6-B.1)."
```

---

## Whole-branch verification (before the PR)

- [ ] **Full unit suite:** `npx vitest run` → ≥ ~885 green (new tests add to that).
- [ ] **Gate:** `npm run check` → 0/0; `npx eslint .` clean.
- [ ] **Rebuild for live e2e:** `set -a; . ./.env; set +a; docker compose up -d --build donna-web`.
- [ ] **Live e2e** (extend `tests/tabular-review.spec.ts`): (a) **table-skill run** — at `/tabular/new` switch to "Use a table skill", pick a built-in (e.g. _Contract Snapshot_), add a `.pdf`, preview → run → the run-page grid renders the skill's resolved columns; (b) **ad-hoc tier** — set a column's Min. tier and confirm the run still completes; (c) **reorder** — reorder two columns and confirm the grid column order matches. (Pin-gated: once ensemble lands, assert the preview cost rises when a column is ensemble-verified.)
- [ ] Then `superpowers:finishing-a-development-branch` → PR into `main`.

```

```
