# P4-1 Matters core + chat scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Matters surface (list / detail / create / rename / archive) and let chats be scoped to a matter via a composer picker, so normal UI chats get RAG/citations.

**Architecture:** Idiomatic SvelteKit — `/matters` and `/matters/[id]` pages with SSR `load` + **form actions** for mutations (no new BFF endpoints; the matter list for the composer picker comes from the landing's SSR `load`). Presentational components in `src/lib/matters/`. The backend calls these _projects_ (`/api/v1/projects`); the UI calls them _matters_.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind (`mlq-*` tokens), `@lucide/svelte`, Vitest + `@testing-library/svelte` (jsdom), Playwright (live e2e).

**Spec:** `docs/superpowers/specs/2026-05-27-donna-p4-1-matters-core-design.md`

**Key backend facts:** `GET /api/v1/projects` returns `Project[]` (excludes archived by default); `POST/PATCH/DELETE /projects[/{id}]`; `Project` has `id,name,slug,description,is_sandbox,archived_at,…`. `GET /api/v1/chats?project_id={id}` returns `{ items: Chat[] }`. `ChatCreate` accepts `project_id`; `ChatUpdate` does NOT (matter fixed at creation). `GET /api/v1/chats/{id}` returns the `Chat` (with `project_id`).

---

## File Structure

| File                                            | Responsibility                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/matters/types.ts`                      | `Matter`/`MatterSummary` types + `activeMatters`/`toSummary` helpers             |
| `src/lib/matters/MatterBadge.svelte`            | read-only matter chip (link or "No matter")                                      |
| `src/lib/matters/MatterForm.svelte`             | name+description form (create + edit modes) via `use:enhance`                    |
| `src/lib/matters/MatterPicker.svelte`           | searchable matter popover for the composer control row                           |
| `src/routes/(app)/matters/+page.server.ts`      | list `load` + `create` action                                                    |
| `src/routes/(app)/matters/+page.svelte`         | matter row list + create modal                                                   |
| `src/routes/(app)/matters/[id]/+page.server.ts` | detail `load` + `rename`/`archive`/`newChat` actions                             |
| `src/routes/(app)/matters/[id]/+page.svelte`    | single-column detail (header + chats)                                            |
| `src/lib/components/Composer.svelte`            | + optional `matters` prop & bindable `selectedMatterId` (renders `MatterPicker`) |
| `src/routes/(app)/+page.server.ts`              | landing: `load` matters + thread `project_id` in `start`                         |
| `src/routes/(app)/+page.svelte`                 | landing: hidden `project_id` input + Composer wiring                             |
| `src/routes/(app)/chats/[id]/+page.server.ts`   | resolve `matter` from `project_id`                                               |
| `src/routes/(app)/chats/[id]/+page.svelte`      | matter badge in chat header                                                      |
| `tests/matters.spec.ts`                         | live e2e                                                                         |

Build order: leaf types/components (Tasks 1–4) → pages (5–6) → integration (7–9) → e2e (10) → verify/PR (11).

---

## Task 1: Matter types + helpers

**Files:**

- Create: `src/lib/matters/types.ts`
- Test: `src/lib/matters/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/matters/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { activeMatters, toSummary, type Matter } from './types';

const m = (over: Partial<Matter> = {}): Matter =>
	({
		id: 'p1',
		name: 'Acme MSA',
		slug: 'acme-msa',
		description: null,
		context_md: null,
		owner_id: 'u1',
		privileged: false,
		attached_skill_names: [],
		attached_file_ids: [],
		is_sandbox: false,
		archived_at: null,
		created_at: '',
		updated_at: '',
		...over
	}) as Matter;

describe('matters/types', () => {
	it('activeMatters drops sandbox projects', () => {
		const out = activeMatters([m({ id: 'a' }), m({ id: 'b', is_sandbox: true }), m({ id: 'c' })]);
		expect(out.map((x) => x.id)).toEqual(['a', 'c']);
	});
	it('toSummary keeps just id + name', () => {
		expect(toSummary(m({ id: 'z', name: 'Beta' }))).toEqual({ id: 'z', name: 'Beta' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/matters/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Implement**

Create `src/lib/matters/types.ts`:

```ts
import type { components } from '$lib/api/backend';

/** A matter is a backend "project". */
export type Matter = components['schemas']['Project'];
export type MatterSummary = Pick<Matter, 'id' | 'name'>;

/** Drop the per-user sandbox project; the list/picker only show real matters. */
export function activeMatters(projects: Matter[]): Matter[] {
	return projects.filter((p) => !p.is_sandbox);
}

export function toSummary(m: Matter): MatterSummary {
	return { id: m.id, name: m.name };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/matters/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matters/types.ts src/lib/matters/types.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-1): matter types + activeMatters/toSummary helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `MatterBadge.svelte`

**Files:**

- Create: `src/lib/matters/MatterBadge.svelte`
- Test: `src/lib/matters/MatterBadge.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/MatterBadge.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MatterBadge from './MatterBadge.svelte';

describe('MatterBadge', () => {
	it('links to the matter detail page', () => {
		render(MatterBadge, { props: { matter: { id: 'p1', name: 'Acme MSA' } } });
		const link = screen.getByRole('link', { name: /Acme MSA/ });
		expect(link).toHaveAttribute('href', '/matters/p1');
	});

	it('shows a muted "No matter" when null', () => {
		render(MatterBadge, { props: { matter: null } });
		expect(screen.getByText('No matter')).toBeInTheDocument();
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/matters/MatterBadge.svelte.test.ts`
Expected: FAIL — cannot resolve `./MatterBadge.svelte`.

- [ ] **Step 3: Implement**

Create `src/lib/matters/MatterBadge.svelte`:

```svelte
<script lang="ts">
	import { FolderKanban } from '@lucide/svelte';
	import type { MatterSummary } from './types';

	let { matter }: { matter: MatterSummary | null } = $props();
</script>

{#if matter}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app matter link -->
	<a
		href="/matters/{matter.id}"
		class="inline-flex items-center gap-1.5 rounded-full bg-mlq-surface-alt px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle"
	>
		<FolderKanban size={13} />
		{matter.name}
	</a>
{:else}
	<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-mlq-muted">
		<FolderKanban size={13} /> No matter
	</span>
{/if}
```

- [ ] **Step 4: Run to verify it passes, then lint**

Run: `npx vitest run src/lib/matters/MatterBadge.svelte.test.ts`
Expected: PASS (2 tests).
Run: `npx eslint src/lib/matters/MatterBadge.svelte`
Expected: clean. (The `svelte/no-navigation-without-resolve` disable is required for in-app `href` — same pattern as `UnsupportedFileCard.svelte`; keep it on the line directly above `<a`, with `<a` and `href` on the same line.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/matters/MatterBadge.svelte src/lib/matters/MatterBadge.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-1): MatterBadge — read-only matter chip for the chat header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `MatterForm.svelte` (create + edit)

A `<form method="POST">` with name (required) + description (optional), progressively enhanced. The submit button is disabled while the trimmed name is empty.

**Files:**

- Create: `src/lib/matters/MatterForm.svelte`
- Test: `src/lib/matters/MatterForm.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/MatterForm.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import MatterForm from './MatterForm.svelte';

// use:enhance needs the SvelteKit runtime; stub it to a no-op action in jsdom.
vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('MatterForm', () => {
	it('posts to the given action and disables submit until a name is typed', async () => {
		render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
		const form = screen.getByRole('form', { name: /matter/i });
		expect(form).toHaveAttribute('action', '?/create');
		const submit = screen.getByRole('button', { name: 'Create matter' });
		expect(submit).toBeDisabled();
		await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
		expect(submit).toBeEnabled();
	});

	it('seeds name and description in edit mode', () => {
		render(MatterForm, {
			props: {
				action: '?/rename',
				submitLabel: 'Save',
				name: 'Beta',
				description: 'Beta engagement'
			}
		});
		expect((screen.getByLabelText(/matter name/i) as HTMLInputElement).value).toBe('Beta');
		expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe(
			'Beta engagement'
		);
	});

	it('surfaces a server error message', () => {
		render(MatterForm, {
			props: {
				action: '?/create',
				submitLabel: 'Create matter',
				error: 'Could not create the matter.'
			}
		});
		expect(screen.getByText('Could not create the matter.')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/matters/MatterForm.svelte.test.ts`
Expected: FAIL — cannot resolve `./MatterForm.svelte`.

- [ ] **Step 3: Implement**

Create `src/lib/matters/MatterForm.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		action,
		submitLabel,
		name = '',
		description = '',
		error = ''
	}: {
		action: string;
		submitLabel: string;
		name?: string;
		description?: string;
		error?: string;
	} = $props();

	let nameValue = $state(name);
	let descValue = $state(description);
</script>

<form method="POST" {action} use:enhance aria-label="Matter" class="space-y-3">
	<div>
		<label for="matter-name" class="mb-1 block text-xs font-medium text-mlq-text"
			>Matter name <span class="text-mlq-error">*</span></label
		>
		<input
			id="matter-name"
			name="name"
			bind:value={nameValue}
			required
			class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		/>
	</div>
	<div>
		<label for="matter-desc" class="mb-1 block text-xs font-medium text-mlq-text"
			>Description <span class="text-mlq-muted">(optional)</span></label
		>
		<textarea
			id="matter-desc"
			name="description"
			bind:value={descValue}
			rows="3"
			class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		></textarea>
	</div>
	{#if error}<p class="text-xs text-mlq-error">{error}</p>{/if}
	<div class="flex justify-end">
		<button
			type="submit"
			disabled={!nameValue.trim()}
			class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
			>{submitLabel}</button
		>
	</div>
</form>
```

- [ ] **Step 4: Run to verify it passes, then lint**

Run: `npx vitest run src/lib/matters/MatterForm.svelte.test.ts`
Expected: PASS (3 tests).
Run: `npx eslint src/lib/matters/MatterForm.svelte`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matters/MatterForm.svelte src/lib/matters/MatterForm.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-1): MatterForm — create/edit matter form

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `MatterPicker.svelte`

Searchable popover for the composer control row (mirrors `SkillAttach`/`ModelPicker`: `root` div, `open` state, outside-click `$effect`, Escape). Client-side filter over an in-memory list. Exposes `selectedId` via `$bindable`.

**Files:**

- Create: `src/lib/matters/MatterPicker.svelte`
- Test: `src/lib/matters/MatterPicker.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/MatterPicker.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import MatterPicker from './MatterPicker.svelte';

const matters = [
	{ id: 'a', name: 'Acme MSA' },
	{ id: 'b', name: 'Beta NDA' }
];

describe('MatterPicker', () => {
	it('opens, lists matters + a "No matter" default, and selecting one updates the trigger', async () => {
		render(MatterPicker, { props: { matters } });
		const trigger = screen.getByRole('button', { name: /choose matter/i });
		expect(trigger).toHaveTextContent('Matter'); // nothing selected
		await fireEvent.click(trigger);
		expect(screen.getByText('No matter (general)')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Acme MSA' }));
		expect(trigger).toHaveTextContent('Acme MSA'); // selection reflected
	});

	it('filters the list by the search query', async () => {
		render(MatterPicker, { props: { matters } });
		await fireEvent.click(screen.getByRole('button', { name: /choose matter/i }));
		await fireEvent.input(screen.getByLabelText(/search matters/i), { target: { value: 'beta' } });
		expect(screen.getByRole('button', { name: 'Beta NDA' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Acme MSA' })).not.toBeInTheDocument();
	});

	it('choosing "No matter" clears the selection back to the default label', async () => {
		render(MatterPicker, { props: { matters, selectedId: 'a' } });
		const trigger = screen.getByRole('button', { name: /choose matter/i });
		expect(trigger).toHaveTextContent('Acme MSA');
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
		expect(trigger).toHaveTextContent('Matter');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/matters/MatterPicker.svelte.test.ts`
Expected: FAIL — cannot resolve `./MatterPicker.svelte`.

- [ ] **Step 3: Implement**

Create `src/lib/matters/MatterPicker.svelte`:

```svelte
<script lang="ts">
	import { FolderKanban, ChevronDown } from '@lucide/svelte';
	import type { MatterSummary } from './types';

	let {
		matters,
		selectedId = $bindable<string | null>(null)
	}: { matters: MatterSummary[]; selectedId?: string | null } = $props();

	let open = $state(false);
	let q = $state('');
	let root = $state<HTMLElement>();

	const current = $derived(matters.find((m) => m.id === selectedId) ?? null);
	const filtered = $derived(
		q.trim()
			? matters.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
			: matters
	);

	function choose(id: string | null) {
		selectedId = id;
		open = false;
		q = '';
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
	$effect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative" {onkeydown}>
	<button
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label="Choose matter"
		onclick={() => (open = !open)}
		class="inline-flex max-w-[180px] items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs {current
			? 'text-mlq-text'
			: 'text-mlq-muted'}"
	>
		<FolderKanban size={13} />
		<span class="truncate">{current ? current.name : 'Matter'}</span>
		<ChevronDown size={12} />
	</button>

	{#if open}
		<div
			class="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
		>
			<input
				type="text"
				aria-label="Search matters"
				placeholder="Search matters…"
				bind:value={q}
				class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
			/>
			<ul class="max-h-64 overflow-y-auto">
				<li>
					<button
						type="button"
						onclick={() => choose(null)}
						class="block w-full px-3 py-2 text-left text-xs text-mlq-muted hover:bg-mlq-subtle/50 {selectedId ===
						null
							? 'bg-mlq-subtle/40'
							: ''}"
					>
						No matter (general)
					</button>
				</li>
				{#each filtered as m (m.id)}
					<li>
						<button
							type="button"
							onclick={() => choose(m.id)}
							class="block w-full truncate px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50 {selectedId ===
							m.id
								? 'bg-mlq-subtle/40'
								: ''}"
						>
							{m.name}
						</button>
					</li>
				{/each}
				{#if filtered.length === 0}
					<li class="px-3 py-2 text-xs text-mlq-muted">No matters found.</li>
				{/if}
			</ul>
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run to verify it passes, then lint**

Run: `npx vitest run src/lib/matters/MatterPicker.svelte.test.ts`
Expected: PASS (3 tests).
Run: `npx eslint src/lib/matters/MatterPicker.svelte`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matters/MatterPicker.svelte src/lib/matters/MatterPicker.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-1): MatterPicker — searchable matter popover for the composer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/matters` list page (load + create action + UI)

**Files:**

- Create: `src/routes/(app)/matters/+page.server.ts`
- Create: `src/routes/(app)/matters/+page.svelte`
- Test: `src/routes/(app)/matters/page.server.test.ts`

- [ ] **Step 1: Write the failing server test**

Create `src/routes/(app)/matters/page.server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const project = (over = {}) => ({
	id: 'p1',
	name: 'Acme',
	slug: 'acme',
	description: null,
	is_sandbox: false,
	archived_at: null,
	...over
});
const formEvent = (fields: Record<string, string>) =>
	({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;
const loadEvent = () => ({}) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters load', () => {
	it('loads active matters (sandbox filtered out)', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify([project({ id: 'a' }), project({ id: 'b', is_sandbox: true })]), {
				status: 200
			})
		);
		const out = await load(loadEvent());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(out.matters.map((m: { id: string }) => m.id)).toEqual(['a']);
	});
});

describe('/matters create action', () => {
	it('rejects an empty name without calling the backend', async () => {
		const r = await actions.create(formEvent({ name: '   ' }));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('POSTs the matter and redirects to its detail page', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify(project({ id: 'new1' })), { status: 201 })
		);
		await expect(
			actions.create(formEvent({ name: 'Acme MSA', description: 'engagement' }))
		).rejects.toMatchObject({ status: 303, location: '/matters/new1' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			name: 'Acme MSA',
			description: 'engagement'
		});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/matters/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Implement the server module**

Create `src/routes/(app)/matters/+page.server.ts`:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/projects');
	if (!res.ok) throw error(502, 'Could not load matters.');
	return { matters: activeMatters((await res.json()) as Matter[]) };
};

export const actions: Actions = {
	create: async (event) => {
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		if (!name) return fail(400, { error: 'Matter name is required.' });
		const res = await lqFetch(event, '/api/v1/projects', {
			method: 'POST',
			body: JSON.stringify({ name, description })
		});
		if (!res.ok) return fail(502, { error: 'Could not create the matter.' });
		const m = (await res.json()) as Matter;
		throw redirect(303, `/matters/${m.id}`);
	}
};
```

Note: the test asserts the POST body is `{ name, description }`. Send `description` as the trimmed string (empty string when omitted) to match the test; the backend accepts an empty description.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/matters/page.server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the list page UI**

Create `src/routes/(app)/matters/+page.svelte`:

```svelte
<script lang="ts">
	import { Plus, FolderKanban } from '@lucide/svelte';
	import MatterForm from '$lib/matters/MatterForm.svelte';

	let { data, form } = $props();
	let showCreate = $state(false);
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="font-serif text-2xl text-mlq-strong">Matters</h1>
		<button
			type="button"
			onclick={() => (showCreate = true)}
			class="inline-flex items-center gap-1.5 rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white"
		>
			<Plus size={14} /> New matter
		</button>
	</div>

	{#if data.matters.length === 0}
		<div class="rounded-mlq-control border border-dashed border-mlq-subtle p-10 text-center">
			<FolderKanban size={28} class="mx-auto text-mlq-muted" />
			<p class="mt-3 text-sm text-mlq-muted">
				No matters yet — create one to organize chats and documents.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
			{#each data.matters as m (m.id)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app matter link -->
					<a
						href="/matters/{m.id}"
						class="flex items-center gap-3 px-4 py-3 hover:bg-mlq-surface-alt"
					>
						<div class="min-w-0">
							<div class="font-serif text-sm text-mlq-text">{m.name}</div>
							{#if m.description}<div class="truncate text-xs text-mlq-muted">
									{m.description}
								</div>{/if}
						</div>
						<span class="ml-auto shrink-0 text-xs text-mlq-muted"
							>{new Date(m.updated_at).toLocaleDateString()}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if showCreate}
	<div
		class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) showCreate = false;
		}}
	>
		<div
			class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
		>
			<h2 class="mb-4 font-serif text-lg text-mlq-strong">New matter</h2>
			<MatterForm action="?/create" submitLabel="Create matter" error={form?.error ?? ''} />
		</div>
	</div>
{/if}
```

Note: chat-count isn't on the `Project` schema, so the row shows the last-updated date (available) rather than a count — avoids an N+1 fetch. (A count could come later if the backend adds it.)

- [ ] **Step 6: Run check + lint**

Run: `npm run check` → expect 0 errors / 0 warnings.
Run: `npx eslint "src/routes/(app)/matters/+page.svelte" "src/routes/(app)/matters/+page.server.ts"` → clean (keep the in-app-link disable on the `<a` line).

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/matters/+page.server.ts" "src/routes/(app)/matters/+page.svelte" "src/routes/(app)/matters/page.server.test.ts"
git commit -m "$(cat <<'EOF'
feat(p4-1): /matters list page + create-matter action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/matters/[id]` detail page (load + rename/archive/newChat + UI)

**Files:**

- Create: `src/routes/(app)/matters/[id]/+page.server.ts`
- Create: `src/routes/(app)/matters/[id]/+page.svelte`
- Test: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing server test**

Create `src/routes/(app)/matters/[id]/page.server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ev = (fields: Record<string, string> = {}, id = 'p1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;
const loadEv = (id = 'p1') => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters/[id] load', () => {
	it('loads the matter and its chats', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'p1', name: 'Acme', description: 'd' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: [{ id: 'c1', title: 'Chat 1', message_count: 3 }] }), {
					status: 200
				})
			);
		const out = await load(loadEv());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/chats?project_id=p1');
		expect(out.matter.name).toBe('Acme');
		expect(out.chats).toHaveLength(1);
	});
});

describe('/matters/[id] actions', () => {
	it('rename PATCHes name + description', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
		const r = await actions.rename(ev({ name: 'Renamed', description: 'x' }));
		expect(lqFetch.mock.calls[0][0]).toBeDefined();
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			name: 'Renamed',
			description: 'x'
		});
		expect(r).toMatchObject({ success: true });
	});

	it('archive DELETEs and redirects to /matters', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
		await expect(actions.archive(ev())).rejects.toMatchObject({
			status: 303,
			location: '/matters'
		});
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('newChat POSTs a project-scoped chat and redirects to it', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chatX' }), { status: 201 }));
		await expect(actions.newChat(ev())).rejects.toMatchObject({
			status: 303,
			location: '/chats/chatX'
		});
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/matters/[id]/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Implement the server module**

Create `src/routes/(app)/matters/[id]/+page.server.ts`:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Matter } from '$lib/matters/types';
import type { components } from '$lib/api/backend';
import type { PageServerLoad } from './$types';

type Chat = components['schemas']['Chat'];

export const load: PageServerLoad = async (event) => {
	const [mRes, cRes] = await Promise.all([
		lqFetch(event, `/api/v1/projects/${event.params.id}`),
		lqFetch(event, `/api/v1/chats?project_id=${event.params.id}`)
	]);
	if (!mRes.ok) throw error(mRes.status === 404 ? 404 : 502, 'Could not load this matter.');
	const matter = (await mRes.json()) as Matter;
	const chats = cRes.ok ? (((await cRes.json()) as { items: Chat[] }).items ?? []) : [];
	return { matter, chats };
};

export const actions: Actions = {
	rename: async (event) => {
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		if (!name) return fail(400, { error: 'Matter name is required.' });
		const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ name, description })
		});
		if (!res.ok) return fail(502, { error: 'Could not rename the matter.' });
		return { success: true };
	},

	archive: async (event) => {
		const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'DELETE' });
		if (!res.ok) return fail(502, { error: 'Could not archive the matter.' });
		throw redirect(303, '/matters');
	},

	newChat: async (event) => {
		const res = await lqFetch(event, '/api/v1/chats', {
			method: 'POST',
			body: JSON.stringify({ project_id: event.params.id })
		});
		if (!res.ok) return fail(502, { error: 'Could not start a chat.' });
		const chat = (await res.json()) as Chat;
		throw redirect(303, `/chats/${chat.id}`);
	}
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/matters/[id]/page.server.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the detail page UI**

Create `src/routes/(app)/matters/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import { MessageSquare } from '@lucide/svelte';
	import MatterForm from '$lib/matters/MatterForm.svelte';

	let { data, form } = $props();
	let showRename = $state(false);
	let confirmArchive = $state(false);
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<nav class="mb-3 text-xs text-mlq-muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app link -->
		<a href="/matters" class="text-mlq-workflow hover:underline">Matters</a> › {data.matter.name}
	</nav>

	<div class="mb-6 border-b border-mlq-subtle pb-5">
		<h1 class="font-serif text-2xl text-mlq-strong">{data.matter.name}</h1>
		{#if data.matter.description}<p class="mt-1 text-sm text-mlq-muted">
				{data.matter.description}
			</p>{/if}
		<div class="mt-4 flex items-center gap-2">
			<form method="POST" action="?/newChat">
				<button
					type="submit"
					class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white"
					>+ New chat in this matter</button
				>
			</form>
			<button
				type="button"
				onclick={() => (showRename = true)}
				class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text"
				>Rename</button
			>
			<button
				type="button"
				onclick={() => (confirmArchive = true)}
				class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error"
				>Archive</button
			>
		</div>
	</div>

	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">
		Chats · {data.chats.length}
	</h2>
	{#if data.chats.length === 0}
		<p class="py-6 text-center text-sm text-mlq-muted">No chats in this matter yet.</p>
	{:else}
		<ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
			{#each data.chats as c (c.id)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app chat link -->
					<a
						href="/chats/{c.id}"
						class="flex items-center gap-3 px-4 py-3 text-sm hover:bg-mlq-surface-alt"
					>
						<MessageSquare size={14} class="text-mlq-muted" />
						<span class="min-w-0 truncate text-mlq-text">{c.title}</span>
						<span class="ml-auto shrink-0 text-xs text-mlq-muted">{c.message_count ?? 0} msgs</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if showRename}
	<div
		class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) showRename = false;
		}}
	>
		<div
			class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
		>
			<h2 class="mb-4 font-serif text-lg text-mlq-strong">Rename matter</h2>
			<MatterForm
				action="?/rename"
				submitLabel="Save"
				name={data.matter.name}
				description={data.matter.description ?? ''}
				error={form?.error ?? ''}
			/>
		</div>
	</div>
{/if}

{#if confirmArchive}
	<div
		class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) confirmArchive = false;
		}}
	>
		<div
			class="w-full max-w-sm rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
		>
			<h2 class="mb-2 font-serif text-lg text-mlq-strong">Archive this matter?</h2>
			<p class="mb-4 text-sm text-mlq-muted">
				It will be removed from your active matters. Its chats are not deleted.
			</p>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (confirmArchive = false)}
					class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text"
					>Cancel</button
				>
				<form method="POST" action="?/archive">
					<button
						type="submit"
						class="rounded-mlq-control bg-mlq-error px-3 py-1.5 text-xs font-medium text-white"
						>Archive</button
					>
				</form>
			</div>
		</div>
	</div>
{/if}
```

- [ ] **Step 6: Run check + lint**

Run: `npm run check` → 0 errors / 0 warnings.
Run: `npx eslint "src/routes/(app)/matters/[id]/+page.svelte" "src/routes/(app)/matters/[id]/+page.server.ts"` → clean.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/matters/[id]/+page.server.ts" "src/routes/(app)/matters/[id]/+page.svelte" "src/routes/(app)/matters/[id]/page.server.test.ts"
git commit -m "$(cat <<'EOF'
feat(p4-1): /matters/[id] detail — chats list, new-chat, rename, archive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Composer — optional matter picker

Add an optional `matters` prop + a bindable `selectedMatterId`; when `matters` is provided (landing only), render `MatterPicker` in the control row. In-chat usage omits the prop, so no picker shows.

**Files:**

- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.svelte.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create (or append to) `src/lib/components/Composer.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// modelStore.load() runs onMount and fetches; stub global fetch so it no-ops.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
import { vi } from 'vitest';
import Composer from './Composer.svelte';

describe('Composer matter picker', () => {
	it('shows the matter picker only when matters are provided', async () => {
		const { rerender } = render(Composer, { props: {} });
		expect(screen.queryByRole('button', { name: /choose matter/i })).not.toBeInTheDocument();
		await rerender({ matters: [{ id: 'a', name: 'Acme MSA' }] });
		expect(screen.getByRole('button', { name: /choose matter/i })).toBeInTheDocument();
	});
});
```

(If `Composer.svelte.test.ts` already exists, add this `describe` block and reuse its existing fetch/import setup instead of re-stubbing.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: FAIL — no "Choose matter" button after rerender (picker not wired yet).

- [ ] **Step 3: Implement**

In `src/lib/components/Composer.svelte`, add the import and props, and render the picker in the control row.

Add to the imports:

```ts
import MatterPicker from '$lib/matters/MatterPicker.svelte';
import type { MatterSummary } from '$lib/matters/types';
```

Extend the `$props()` destructure + type to include:

```ts
(matters, (selectedMatterId = $bindable<string | null>(null)));
```

```ts
    matters?: MatterSummary[];
    selectedMatterId?: string | null;
```

In the control row (the `<div class="mt-2 flex items-center gap-2 border-t …">`), add — right after the `<ModelPicker … />` block — :

```svelte
{#if matters}
	<MatterPicker {matters} bind:selectedId={selectedMatterId} />
{/if}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: PASS. Also run the full Composer-adjacent suite to confirm no regression: `npx vitest run src/lib/components`.

- [ ] **Step 5: Lint + check**

Run: `npx eslint src/lib/components/Composer.svelte` → clean.
Run: `npm run check` → 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-1): optional matter picker in the composer control row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Landing — load matters + thread `project_id`

**Files:**

- Modify: `src/routes/(app)/+page.server.ts`
- Modify: `src/routes/(app)/+page.svelte`
- Test: `src/routes/(app)/page.server.test.ts`

- [ ] **Step 1: Write the failing server test**

Create `src/routes/(app)/page.server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const cookies = () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() });
const startEvent = (fields: Record<string, string>) =>
	({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }),
		cookies: cookies()
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('landing load', () => {
	it('loads active matters for the picker', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify([{ id: 'a', name: 'Acme', is_sandbox: false }]), { status: 200 })
		);
		const out = await load({ cookies: cookies() } as never);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(out.matters.map((m: { id: string }) => m.id)).toEqual(['a']);
	});
});

describe('landing start action', () => {
	it('creates a matter-scoped chat when project_id is provided', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat1' }), { status: 201 }));
		await expect(
			actions.start(startEvent({ message: 'hi', project_id: 'p9' }))
		).rejects.toMatchObject({ status: 303, location: '/chats/chat1' });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p9' });
	});

	it('creates a matter-less chat when project_id is empty', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat2' }), { status: 201 }));
		await expect(
			actions.start(startEvent({ message: 'hi', project_id: '' }))
		).rejects.toMatchObject({ status: 303 });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/page.server.test.ts"`
Expected: FAIL — `load` is not exported / `project_id` not threaded.

- [ ] **Step 3: Implement**

Rewrite `src/routes/(app)/+page.server.ts`:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/projects');
	const matters = res.ok ? activeMatters((await res.json()) as Matter[]) : [];
	return { matters };
};

export const actions: Actions = {
	start: async (event) => {
		const data = await event.request.formData();
		const message = String(data.get('message') ?? '').trim();
		const projectId = String(data.get('project_id') ?? '').trim();

		const res = await lqFetch(event, '/api/v1/chats', {
			method: 'POST',
			body: JSON.stringify(projectId ? { project_id: projectId } : {})
		});
		if (!res.ok) return fail(502, { error: 'Could not start a chat. Please try again.' });

		const chat = (await res.json()) as { id: string };
		if (message) {
			event.cookies.set('donna_draft', message, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 120
			});
		}
		throw redirect(303, `/chats/${chat.id}`);
	}
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/page.server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the picker into the landing page**

Edit `src/routes/(app)/+page.svelte` — add a `selectedMatterId` state, a hidden `project_id` input, and pass `matters` + bind the id into `Composer`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import Composer from '$lib/components/Composer.svelte';

	let { data, form } = $props();
	let message = $state('');
	let selectedMatterId = $state<string | null>(null);
	let formEl = $state<HTMLFormElement>();

	const name = $derived(data.user?.display_name || data.user?.email?.split('@')[0] || 'there');
</script>

<div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6">
	<h1 class="mlq-rise mb-8 text-center font-serif text-4xl font-light text-mlq-strong">
		Hi, {name}
	</h1>

	<form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
		<input type="hidden" name="message" value={message} />
		<input type="hidden" name="project_id" value={selectedMatterId ?? ''} />
		<Composer
			bind:value={message}
			matters={data.matters}
			bind:selectedMatterId
			onsubmit={() => formEl?.requestSubmit()}
		/>
	</form>

	{#if form?.error}<p class="mt-3 text-center text-sm text-mlq-error">{form.error}</p>{/if}
	<p class="mt-3 text-center text-xs text-mlq-muted">
		AI can make mistakes. Answers are not legal advice.
	</p>
</div>
```

- [ ] **Step 6: Run check + lint**

Run: `npm run check` → 0/0.
Run: `npx eslint "src/routes/(app)/+page.svelte" "src/routes/(app)/+page.server.ts"` → clean.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/+page.server.ts" "src/routes/(app)/+page.svelte" "src/routes/(app)/page.server.test.ts"
git commit -m "$(cat <<'EOF'
feat(p4-1): landing matter picker scopes the new chat's project_id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Chat header — matter badge

**Files:**

- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`
- Test: `src/routes/(app)/chats/[id]/page.server.test.ts` (create if absent — for the matter-resolution helper)

The chat `load` is large; rather than re-test the whole loader, extract a small `resolveMatter` helper and unit-test it.

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/chats/[id]/matter.ts` consumer test at `src/routes/(app)/chats/[id]/matter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveMatter } from './matter';

describe('resolveMatter', () => {
	it('returns {id,name} when the chat has a project', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'c1', project_id: 'p1' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'p1', name: 'Acme MSA' }), { status: 200 })
			);
		expect(await resolveMatter(fetcher, 'c1')).toEqual({ id: 'p1', name: 'Acme MSA' });
		expect(fetcher.mock.calls[0][0]).toBe('/api/v1/chats/c1');
		expect(fetcher.mock.calls[1][0]).toBe('/api/v1/projects/p1');
	});

	it('returns null when the chat has no project', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'c1', project_id: null }), { status: 200 })
			);
		expect(await resolveMatter(fetcher, 'c1')).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(1); // no project fetch
	});

	it('returns null if the chat fetch fails', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		expect(await resolveMatter(fetcher, 'c1')).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/matter.test.ts"`
Expected: FAIL — cannot resolve `./matter`.

- [ ] **Step 3: Implement the helper**

Create `src/routes/(app)/chats/[id]/matter.ts`:

```ts
import type { MatterSummary } from '$lib/matters/types';

type Fetcher = (path: string) => Promise<Response>;

/** Resolve a chat's matter for the header badge. Returns null when unscoped or on error. */
export async function resolveMatter(
	fetcher: Fetcher,
	chatId: string
): Promise<MatterSummary | null> {
	const cRes = await fetcher(`/api/v1/chats/${chatId}`);
	if (!cRes.ok) return null;
	const projectId = ((await cRes.json()) as { project_id?: string | null }).project_id;
	if (!projectId) return null;
	const pRes = await fetcher(`/api/v1/projects/${projectId}`);
	if (!pRes.ok) return null;
	const p = (await pRes.json()) as { id: string; name: string };
	return { id: p.id, name: p.name };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/matter.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the helper into the chat load + render the badge**

In `src/routes/(app)/chats/[id]/+page.server.ts`, import the helper and call it (parallel with the existing messages fetch). Add near the top:

```ts
import { resolveMatter } from './matter';
```

Inside `load`, alongside the existing fetches, resolve the matter and include it in the returned object:

```ts
const matter = await resolveMatter((path) => lqFetch(event, path), event.params.id);
```

Add `matter` to the load's return value (e.g. `return { ..., matter };`).

In `src/routes/(app)/chats/[id]/+page.svelte`, import the badge and place it at the left of the header bar. Change the header `<div>` from `justify-end` to `justify-between` and add the badge:

```svelte
import MatterBadge from '$lib/matters/MatterBadge.svelte';
```

```svelte
<div class="flex items-center justify-between border-b border-mlq-subtle px-6 py-2">
	<MatterBadge matter={data.matter} />
	<button
		type="button"
		onclick={() => (showReceipts = true)}
		class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
	>
		<ReceiptText size={14} /> Receipts
	</button>
</div>
```

- [ ] **Step 6: Run check + the chat-route suite + lint**

Run: `npm run check` → 0/0.
Run: `npx vitest run "src/routes/(app)/chats"` → green (no regression).
Run: `npx eslint "src/routes/(app)/chats/[id]/+page.server.ts" "src/routes/(app)/chats/[id]/+page.svelte" "src/routes/(app)/chats/[id]/matter.ts"` → clean.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/chats/[id]/matter.ts" "src/routes/(app)/chats/[id]/matter.test.ts" "src/routes/(app)/chats/[id]/+page.server.ts" "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "$(cat <<'EOF'
feat(p4-1): show the chat's matter as a read-only header badge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Live e2e — `tests/matters.spec.ts`

**Files:**

- Create: `tests/matters.spec.ts`

- [ ] **Step 1: Write the e2e**

Create `tests/matters.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

async function token(): Promise<string> {
	return (
		await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		}).then((r) => r.json())
	).access_token;
}
async function api(tok: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${tok}`, ...(init.headers || {}) }
	});
}
async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('create a matter, start a chat in it, and rename + archive', async ({ page }) => {
	test.setTimeout(120_000);
	await login(page);
	await page.goto('/matters');

	const unique = `E2E Matter ${Date.now()}`;
	await page.getByRole('button', { name: /new matter/i }).click();
	await page.getByLabel(/matter name/i).fill(unique);
	await page.getByRole('button', { name: 'Create matter' }).click();

	// Lands on the new matter's detail page.
	await expect(page.getByRole('heading', { name: unique })).toBeVisible({ timeout: 15000 });

	// New chat in this matter → chat opens with the matter badge.
	await page.getByRole('button', { name: /new chat in this matter/i }).click();
	await page.waitForURL(/\/chats\//);
	await expect(page.getByRole('link', { name: unique })).toBeVisible({ timeout: 15000 }); // header badge links to the matter

	// Rename, then archive.
	await page.getByRole('link', { name: unique }).click(); // back to the matter
	await page.getByRole('button', { name: 'Rename' }).click();
	const renamed = `${unique} (renamed)`;
	await page.getByLabel(/matter name/i).fill(renamed);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 15000 });

	await page.getByRole('button', { name: 'Archive' }).click(); // opens the confirm modal
	await page.locator('form[action="?/archive"] button[type="submit"]').click(); // confirm
	await page.waitForURL('**/matters');
	await expect(page.getByText(renamed)).toHaveCount(0);
});

test('a matter with a KB lights up citations for a chat scoped via the landing picker', async ({
	page
}) => {
	test.setTimeout(240_000);
	const tok = await token();
	const pid = (
		await api(tok, '/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: `E2E Cited ${Date.now()}` })
		}).then((r) => r.json())
	).id;
	const kid = (
		await api(tok, '/knowledge-bases', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'E2E KB' })
		}).then((r) => r.json())
	).id;
	await api(tok, `/projects/${pid}/knowledge-bases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ knowledge_base_id: kid })
	});
	const fd = new FormData();
	fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
	const fid = (await api(tok, '/files', { method: 'POST', body: fd }).then((r) => r.json())).id;
	for (let i = 0; i < 60; i++) {
		const st = (await api(tok, `/files/${fid}`).then((r) => r.json())).ingestion_status;
		if (st === 'ready') break;
		if (st === 'failed') throw new Error('ingestion failed');
		await new Promise((r) => setTimeout(r, 2000));
	}
	await api(tok, `/knowledge-bases/${kid}/files`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ file_id: fid })
	});
	for (let i = 0; i < 60; i++) {
		const res = await api(tok, `/knowledge-bases/${kid}/query`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 })
		}).then((r) => r.json());
		if ((res.results ?? []).length > 0) break;
		await new Promise((r) => setTimeout(r, 2000));
	}

	await login(page);
	// Pick the seeded matter in the landing composer, then send a grounded question.
	await page.getByRole('button', { name: /choose matter/i }).click();
	await page.getByRole('button', { name: new RegExp('E2E Cited', 'i') }).click();
	await page
		.locator('textarea')
		.fill('What is the termination-for-convenience notice period? Quote the operative clause.');
	await page.locator('textarea').press('Enter');

	await page.waitForURL(/\/chats\//);
	// A citation pill appears → matter scoping lit up RAG for a normal UI chat.
	await expect(page.locator('.cite-tab').first()).toBeVisible({ timeout: 60000 });
});
```

- [ ] **Step 2: Ensure the seed PDF + rebuild donna-web**

```bash
# /tmp/spike.pdf (recreate if missing):
docker compose exec -T api python - <<'PY'
import fitz
d=fitz.open(); p=d.new_page()
p.insert_text((72,100),
  "MASTER SERVICES AGREEMENT\n\nSection 9. Term and Termination.\n"
  "This Agreement may be terminated by either party for convenience upon "
  "thirty (30) days prior written notice to the other party.\n", fontsize=11)
d.save("/tmp/spike.pdf"); print("ok")
PY
docker compose cp api:/tmp/spike.pdf /tmp/spike.pdf
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/matters.spec.ts`
Expected: PASS (2 tests). The citation test is RAG-timing-sensitive — re-run if embeddings haven't settled (per the established live-citation guidance). Use unique matter names (the spec uses `Date.now()`) so reruns don't collide.

- [ ] **Step 4: Commit**

```bash
git add tests/matters.spec.ts
git commit -m "$(cat <<'EOF'
test(p4-1): live e2e — matter CRUD + matter-scoped chat lights up citations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Whole-branch verification + PR

- [ ] **Step 1: Full type/lint/test sweep**

```bash
npm run check                       # 0 errors, 0 warnings (vendor ERR_MODULE_NOT_FOUND stderr is harmless)
npx eslint src/lib/matters "src/routes/(app)/matters" "src/routes/(app)/+page.svelte" "src/routes/(app)/+page.server.ts" "src/routes/(app)/chats/[id]" src/lib/components/Composer.svelte tests/matters.spec.ts
npx vitest run                      # full unit/component suite green
```

- [ ] **Step 2: Live regression + new e2e**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/matters.spec.ts tests/citation-highlight.spec.ts tests/chat-streaming.spec.ts
```

Expected: PASS (matters plus the prior chat/citation flows — confirm the landing composer + chat header changes didn't regress).

- [ ] **Step 3: Open the PR** via `superpowers:finishing-a-development-branch` (branch `p4-1-matters-core` → `main`). PR body: the matters surface, the composer picker + chat-scoping payoff, the matter badge, and the e2e evidence. Note in the PR that the P4 capability backlog (privilege/tier, matter docs/KBs/skills, KB upload, chat file attach, skills authoring, playbooks) is tracked in the spec §9 + memory.

---

## Self-Review

**Spec coverage:** matters list + create (Task 5) ✓; detail + its chats + new-chat (Task 6) ✓; rename + archive (Task 6) ✓; composer picker, landing-only (Tasks 4, 7, 8) ✓; landing `project_id` threading (Task 8) ✓; read-only chat badge (Tasks 2, 9) ✓; `project_id` fixed-at-create (picker is landing-only; chat shows badge) ✓; sandbox filtering (Task 1, used in 5 & 8) ✓; empty states (Tasks 5, 6) ✓; unit + live e2e incl. seeded-citation payoff (Task 10) ✓. The §9 capability backlog is out-of-scope and tracked in the spec + memory (not implemented here) ✓.

**Placeholder scan:** none — every step has concrete code/commands.

**Type/name consistency:** `Matter`/`MatterSummary`, `activeMatters`/`toSummary` (Task 1) are reused consistently in 5/6/8/9. `MatterPicker` prop `selectedId` (bindable) matches the Composer `bind:selectedId={selectedMatterId}` usage (Task 7) and the landing `bind:selectedMatterId` (Task 8). `resolveMatter(fetcher, chatId)` (Task 9) signature matches its test. Form actions `create`/`rename`/`archive`/`newChat`/`start` names match the `action="?/…"` attributes in the pages. Backend paths (`/api/v1/projects`, `/projects/{id}`, `/chats?project_id=`, `/chats`, `/chats/{id}`) match the verified backend facts.
