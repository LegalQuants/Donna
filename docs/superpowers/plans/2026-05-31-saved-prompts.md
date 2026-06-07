# Saved Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save reusable prompt text and drop it into the composer — a `/prompts` management page (CRUD), a composer **Prompts** popover that inserts a saved prompt at the cursor, and a **save-the-current-draft** affordance.

**Architecture:** Thin BFF JSON proxies under `/prompts/items/*` (avoids the SvelteKit page/endpoint collision with the `/prompts` page) + a shared `promptLibrary` rune controller. The composer popover and the management page both drive that one controller. The composer owns an `insertAtCursor` helper built on a pure `spliceText` function. No backend change.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide.

**Spec:** `docs/superpowers/specs/2026-05-31-donna-saved-prompts-design.md`

**Conventions:** TDD; commit per task; push regularly. `npm run check` = 0 errors/0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless — signal = exit 0 + the "0 errors and 0 warnings" line). eslint clean (no `any`). In-app `<a href>`/`goto` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- … -->`. Server-test pattern: `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`. Component tests: `@testing-library/svelte` + `render(C, { props })`. Modal a11y mirrors `ReceiptsDrawer`/skills (`role="presentation"` backdrop + `role="dialog"` + Escape `$effect`). No `arq-worker`/LLM needed.

**Backend (verified `src/lib/api/backend.d.ts`, pin `438198c`):** `GET /api/v1/saved-prompts`→`SavedPrompt[]`; `POST /api/v1/saved-prompts` `{name, prompt_text, tags?}`→201 `SavedPrompt`; `GET /api/v1/saved-prompts/{id}`→`SavedPrompt`(404); `PATCH /api/v1/saved-prompts/{id}` `{name?, prompt_text?, tags?}`→200; `DELETE`→204. `SavedPrompt={id,user_id,name,prompt_text,tags?,created_at,updated_at?}`. User-scoped server-side; no named Create/Update schema (bodies are inline).

---

## File Structure

| File                                                                        | C/M | Responsibility                                            |
| --------------------------------------------------------------------------- | --- | --------------------------------------------------------- |
| `src/lib/prompts/types.ts`                                                  | C   | `SavedPrompt` re-export + `SavedPromptInput`              |
| `src/lib/prompts/spliceText.ts` (+test)                                     | C   | pure cursor-splice helper                                 |
| `src/routes/(app)/prompts/items/+server.ts` (+test)                         | C   | proxy: GET list, POST create                              |
| `src/routes/(app)/prompts/items/[id]/+server.ts` (+test)                    | C   | proxy: PATCH, DELETE                                      |
| `src/lib/prompts/promptLibrary.svelte.ts` (+test)                           | C   | client controller                                         |
| `src/lib/prompts/PromptModal.svelte` (+test)                                | C   | create/edit modal                                         |
| `src/lib/prompts/PromptRow.svelte` (+test)                                  | C   | management list row                                       |
| `src/lib/prompts/PromptPicker.svelte` (+test)                               | C   | composer popover (search/insert/save-draft)               |
| `src/routes/(app)/prompts/+page.server.ts` (+test)                          | C   | SSR load (GET list)                                       |
| `src/routes/(app)/prompts/+page.svelte` (+test)                             | C   | management page                                           |
| `src/lib/components/Sidebar.svelte` (+test)                                 | M   | add "Prompts" nav entry                                   |
| `src/lib/components/Composer.svelte`                                        | M   | `insertAtCursor` + `promptLibrary` prop + Prompts control |
| `src/routes/(app)/+page.svelte`, `src/routes/(app)/chats/[id]/+page.svelte` | M   | instantiate `promptLibrary`, pass to Composer             |
| `tests/saved-prompts.spec.ts`                                               | C   | live e2e                                                  |

---

## Task 1: Types

**Files:** Create `src/lib/prompts/types.ts`

- [ ] **Step 1: Implement** — `src/lib/prompts/types.ts`:

```ts
import type { components } from '$lib/api/backend';

export type SavedPrompt = components['schemas']['SavedPrompt'];

/** POST/PATCH body shape (the backend has no named Create/Update schema). */
export interface SavedPromptInput {
	name: string;
	prompt_text: string;
	tags?: string[];
}
```

- [ ] **Step 2: Verify** — `npm run check` → 0/0; `npx eslint src/lib/prompts/types.ts` → 0.
- [ ] **Step 3: Commit** — `git add src/lib/prompts/types.ts && git commit -m "feat(prompts): SavedPrompt types"`

---

## Task 2: spliceText pure helper

**Files:** Create `src/lib/prompts/spliceText.ts`, `src/lib/prompts/spliceText.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/prompts/spliceText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { spliceText } from './spliceText';

describe('spliceText', () => {
	it('inserts at the cursor and returns the new caret position', () => {
		expect(spliceText('abcd', 2, 2, 'XY')).toEqual({ value: 'abXYcd', caret: 4 });
	});
	it('replaces a selection', () => {
		expect(spliceText('abcd', 1, 3, 'X')).toEqual({ value: 'aXd', caret: 2 });
	});
	it('appends when the range is at the end', () => {
		expect(spliceText('ab', 2, 2, 'cd')).toEqual({ value: 'abcd', caret: 4 });
	});
	it('fills an empty string', () => {
		expect(spliceText('', 0, 0, 'hi')).toEqual({ value: 'hi', caret: 2 });
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/prompts/spliceText.test.ts`.
- [ ] **Step 3: Implement** — `src/lib/prompts/spliceText.ts`:

```ts
/** Splice `insert` into `value` over the [start,end) range; returns the new
 *  string and the caret position just after the inserted text. Pure — the
 *  composer applies the DOM focus/selection separately. */
export function spliceText(
	value: string,
	start: number,
	end: number,
	insert: string
): { value: string; caret: number } {
	const next = value.slice(0, start) + insert + value.slice(end);
	return { value: next, caret: start + insert.length };
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run src/lib/prompts/spliceText.test.ts` (4 pass). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/prompts/spliceText.ts src/lib/prompts/spliceText.test.ts && git commit -m "feat(prompts): spliceText cursor-insert helper"`

---

## Task 3: Collection proxy (GET list + POST create)

**Files:** Create `src/routes/(app)/prompts/items/+server.ts`, `src/routes/(app)/prompts/items/server.test.ts`

- [ ] **Step 1: Write the failing test** — `src/routes/(app)/prompts/items/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET, POST } from './+server';

const postEv = (body: unknown) =>
	({
		request: new Request('http://x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /prompts/items', () => {
	it('passes through the saved-prompts list', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'p1', name: 'A', prompt_text: 'x' }]), { status: 200 })
		);
		const res = await GET({} as never);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
		expect((await res.json())[0].id).toBe('p1');
	});
	it('maps a backend failure to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		await expect(GET({} as never)).rejects.toMatchObject({ status: 502 });
	});
});

describe('POST /prompts/items', () => {
	it('forwards the create body and returns the created prompt', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'p9', name: 'New', prompt_text: 'hi' }), { status: 201 })
		);
		const res = await POST(postEv({ name: 'New', prompt_text: 'hi', tags: ['t'] }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			name: 'New',
			prompt_text: 'hi',
			tags: ['t']
		});
		expect((await res.json()).id).toBe('p9');
	});
	it('maps a 422 through', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
		await expect(POST(postEv({ name: '', prompt_text: '' }))).rejects.toMatchObject({
			status: 422
		});
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/prompts/items/server.test.ts"`.
- [ ] **Step 3: Implement** — `src/routes/(app)/prompts/items/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, '/api/v1/saved-prompts');
	if (!res.ok) throw error(502, 'Could not load your prompts.');
	return json(await res.json());
};

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/saved-prompts', { method: 'POST', body });
	if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Could not save the prompt.');
	return json(await res.json());
};
```

- [ ] **Step 4: Verify pass** (4 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/prompts/items/+server.ts" "src/routes/(app)/prompts/items/server.test.ts" && git commit -m "feat(prompts): collection proxy (list + create)"`

---

## Task 4: Item proxy (PATCH + DELETE)

**Files:** Create `src/routes/(app)/prompts/items/[id]/+server.ts`, `src/routes/(app)/prompts/items/[id]/server.test.ts`

- [ ] **Step 1: Write the failing test** — `src/routes/(app)/prompts/items/[id]/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH, DELETE } from './+server';

const ev = (method: string, body?: unknown) =>
	({
		params: { id: 'p1' },
		request: new Request('http://x', {
			method,
			headers: { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		})
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('PATCH /prompts/items/[id]', () => {
	it('forwards the patch and returns the updated prompt', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'p1', name: 'Renamed', prompt_text: 'x' }), { status: 200 })
		);
		const res = await PATCH(ev('PATCH', { name: 'Renamed' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts/p1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect((await res.json()).name).toBe('Renamed');
	});
	it('maps a 422 through', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
		await expect(PATCH(ev('PATCH', { name: '' }))).rejects.toMatchObject({ status: 422 });
	});
});

describe('DELETE /prompts/items/[id]', () => {
	it('deletes and returns 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const res = await DELETE(ev('DELETE'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts/p1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
		expect(res.status).toBe(204);
	});
	it('treats a 404 as already-gone (204)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
		const res = await DELETE(ev('DELETE'));
		expect(res.status).toBe(204);
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/prompts/items/[id]/server.test.ts"`.
- [ ] **Step 3: Implement** — `src/routes/(app)/prompts/items/[id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const PATCH: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, `/api/v1/saved-prompts/${event.params.id}`, {
		method: 'PATCH',
		body
	});
	if (!res.ok)
		throw error(
			res.status === 422 ? 422 : res.status === 404 ? 404 : 502,
			'Could not update the prompt.'
		);
	return json(await res.json());
};

export const DELETE: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/saved-prompts/${event.params.id}`, {
		method: 'DELETE'
	});
	if (!res.ok && res.status !== 404) throw error(502, 'Could not delete the prompt.');
	return new Response(null, { status: 204 });
};
```

- [ ] **Step 4: Verify pass** (4 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/prompts/items/[id]/+server.ts" "src/routes/(app)/prompts/items/[id]/server.test.ts" && git commit -m "feat(prompts): item proxy (update + delete)"`

---

## Task 5: promptLibrary controller

**Files:** Create `src/lib/prompts/promptLibrary.svelte.ts`, `src/lib/prompts/promptLibrary.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/prompts/promptLibrary.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPromptLibrary } from './promptLibrary.svelte';

const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.restoreAllMocks());

describe('createPromptLibrary', () => {
	it('seed sets prompts and marks loaded (no fetch on ensureLoaded)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		expect(lib.prompts.map((p) => p.id)).toEqual(['p1']);
		await lib.ensureLoaded();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('ensureLoaded fetches once and caches', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp([{ id: 'p1', name: 'A', prompt_text: 'x' }]));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		await lib.ensureLoaded();
		await lib.ensureLoaded();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/prompts/items');
		expect(lib.prompts.length).toBe(1);
	});

	it('create prepends the new prompt and returns true', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ id: 'p9', name: 'New', prompt_text: 'hi' }, 201));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		const ok = await lib.create({ name: 'New', prompt_text: 'hi' });
		expect(ok).toBe(true);
		expect(lib.prompts.map((p) => p.id)).toEqual(['p9', 'p1']);
	});

	it('create sets error and returns false on failure', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status: 422 }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		const ok = await lib.create({ name: '', prompt_text: '' });
		expect(ok).toBe(false);
		expect(lib.error).toBeTruthy();
		expect(lib.prompts.length).toBe(0);
	});

	it('update replaces in place', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ id: 'p1', name: 'Renamed', prompt_text: 'x' }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		await lib.update('p1', { name: 'Renamed' });
		expect(lib.prompts[0].name).toBe('Renamed');
		expect(fetchMock.mock.calls[0][0]).toBe('/prompts/items/p1');
	});

	it('remove drops the prompt', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([
			{ id: 'p1', name: 'A', prompt_text: 'x' },
			{ id: 'p2', name: 'B', prompt_text: 'y' }
		] as never);
		await lib.remove('p1');
		expect(lib.prompts.map((p) => p.id)).toEqual(['p2']);
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/prompts/promptLibrary.svelte.test.ts`.
- [ ] **Step 3: Implement** — `src/lib/prompts/promptLibrary.svelte.ts`:

```ts
import type { SavedPrompt, SavedPromptInput } from './types';

export function createPromptLibrary() {
	let prompts = $state<SavedPrompt[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	function seed(list: SavedPrompt[]) {
		prompts = list;
		loaded = true;
	}

	async function ensureLoaded(fetchFn: typeof fetch = fetch) {
		if (loaded || loading) return;
		loading = true;
		error = null;
		try {
			const res = await fetchFn('/prompts/items');
			if (!res.ok) throw new Error(String(res.status));
			prompts = (await res.json()) as SavedPrompt[];
			loaded = true;
		} catch {
			error = 'Could not load your prompts.';
		} finally {
			loading = false;
		}
	}

	async function create(input: SavedPromptInput, fetchFn: typeof fetch = fetch): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn('/prompts/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input)
			});
			if (!res.ok) throw new Error(String(res.status));
			const created = (await res.json()) as SavedPrompt;
			prompts = [created, ...prompts];
			return true;
		} catch {
			error = 'Could not save the prompt.';
			return false;
		}
	}

	async function update(
		id: string,
		patch: Partial<SavedPromptInput>,
		fetchFn: typeof fetch = fetch
	): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn(`/prompts/items/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) throw new Error(String(res.status));
			const updated = (await res.json()) as SavedPrompt;
			prompts = prompts.map((p) => (p.id === id ? updated : p));
			return true;
		} catch {
			error = 'Could not update the prompt.';
			return false;
		}
	}

	async function remove(id: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
		error = null;
		try {
			const res = await fetchFn(`/prompts/items/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(String(res.status));
			prompts = prompts.filter((p) => p.id !== id);
			return true;
		} catch {
			error = 'Could not delete the prompt.';
			return false;
		}
	}

	return {
		get prompts() {
			return prompts;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		seed,
		ensureLoaded,
		create,
		update,
		remove
	};
}
```

- [ ] **Step 4: Verify pass** (6 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/prompts/promptLibrary.svelte.ts src/lib/prompts/promptLibrary.svelte.test.ts && git commit -m "feat(prompts): promptLibrary client controller"`

---

## Task 6: PromptModal (create/edit)

**Files:** Create `src/lib/prompts/PromptModal.svelte`, `src/lib/prompts/PromptModal.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/prompts/PromptModal.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptModal from './PromptModal.svelte';

describe('PromptModal', () => {
	it('create mode: submitting emits the entered values', async () => {
		const onsave = vi.fn(() => Promise.resolve(true));
		render(PromptModal, { props: { open: true, onsave, onclose: vi.fn() } });
		await fireEvent.input(screen.getByLabelText(/name/i), { target: { value: 'My prompt' } });
		await fireEvent.input(screen.getByLabelText(/prompt text/i), {
			target: { value: 'Do the thing.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /save/i }));
		expect(onsave.mock.calls.at(-1)![0]).toMatchObject({
			name: 'My prompt',
			prompt_text: 'Do the thing.'
		});
	});

	it('edit mode: seeds fields from the prompt', () => {
		render(PromptModal, {
			props: {
				open: true,
				prompt: { id: 'p1', name: 'Seed', prompt_text: 'Body', tags: ['t'] } as never,
				onsave: vi.fn(() => Promise.resolve(true)),
				onclose: vi.fn()
			}
		});
		expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Seed');
		expect((screen.getByLabelText(/prompt text/i) as HTMLTextAreaElement).value).toBe('Body');
	});

	it('disables Save when name or prompt text is empty', () => {
		render(PromptModal, {
			props: { open: true, onsave: vi.fn(() => Promise.resolve(true)), onclose: vi.fn() }
		});
		expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/prompts/PromptModal.svelte`:

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import TagInput from '$lib/skills/authoring/TagInput.svelte';
	import type { SavedPrompt, SavedPromptInput } from './types';

	let {
		open,
		prompt = null,
		onsave,
		onclose
	}: {
		open: boolean;
		prompt?: SavedPrompt | null;
		onsave: (input: SavedPromptInput) => Promise<boolean>;
		onclose: () => void;
	} = $props();

	let name = $state(untrack(() => prompt?.name ?? ''));
	let promptText = $state(untrack(() => prompt?.prompt_text ?? ''));
	let tags = $state<string[]>(untrack(() => [...(prompt?.tags ?? [])]));
	let saving = $state(false);

	const canSave = $derived(name.trim().length > 0 && promptText.trim().length > 0 && !saving);

	async function submit() {
		if (!canSave) return;
		saving = true;
		const ok = await onsave({ name: name.trim(), prompt_text: promptText, tags });
		saving = false;
		if (ok) onclose();
	}

	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

{#if open}
	<div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={onclose}></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label={prompt ? 'Edit prompt' : 'New prompt'}
		class="fixed top-1/2 left-1/2 z-40 w-[32rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<h2 class="mb-3 text-sm font-medium text-mlq-text">{prompt ? 'Edit prompt' : 'New prompt'}</h2>
		<label class="block text-xs text-mlq-muted"
			>Name
			<input
				bind:value={name}
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
		</label>
		<label class="mt-3 block text-xs text-mlq-muted"
			>Prompt text
			<textarea
				bind:value={promptText}
				rows="6"
				class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			></textarea>
		</label>
		<div class="mt-3 block text-xs text-mlq-muted">
			Tags
			<div class="mt-1"><TagInput bind:tags /></div>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				onclick={onclose}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Cancel</button
			>
			<button
				type="button"
				onclick={submit}
				disabled={!canSave}
				class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white disabled:opacity-40"
				>Save</button
			>
		</div>
	</div>
{/if}
```

- [ ] **Step 4: Verify pass** (3 tests). `npm run check` → 0/0 (the `untrack` seeds avoid `state_referenced_locally`); eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/prompts/PromptModal.svelte src/lib/prompts/PromptModal.svelte.test.ts && git commit -m "feat(prompts): create/edit modal"`

---

## Task 7: PromptRow

**Files:** Create `src/lib/prompts/PromptRow.svelte`, `src/lib/prompts/PromptRow.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/prompts/PromptRow.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptRow from './PromptRow.svelte';

const prompt = {
	id: 'p1',
	name: 'Risk review',
	prompt_text: 'Review this contract for risk.',
	tags: ['legal']
} as never;

describe('PromptRow', () => {
	it('renders name, tag, and a preview', () => {
		render(PromptRow, { props: { prompt, onedit: vi.fn(), ondelete: vi.fn() } });
		expect(screen.getByText('Risk review')).toBeInTheDocument();
		expect(screen.getByText('legal')).toBeInTheDocument();
		expect(screen.getByText(/Review this contract/)).toBeInTheDocument();
	});
	it('fires onedit and ondelete', async () => {
		const onedit = vi.fn();
		const ondelete = vi.fn();
		render(PromptRow, { props: { prompt, onedit, ondelete } });
		await fireEvent.click(screen.getByRole('button', { name: /edit/i }));
		await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
		expect(onedit).toHaveBeenCalled();
		expect(ondelete).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/prompts/PromptRow.svelte`:

```svelte
<script lang="ts">
	import type { SavedPrompt } from './types';
	let {
		prompt,
		onedit,
		ondelete
	}: { prompt: SavedPrompt; onedit: () => void; ondelete: () => void } = $props();
</script>

<div class="flex items-start gap-3 px-3 py-2">
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="truncate text-sm font-medium text-mlq-text">{prompt.name}</span>
			{#each prompt.tags ?? [] as t (t)}<span
					class="shrink-0 rounded bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text">{t}</span
				>{/each}
		</div>
		<p class="mt-0.5 line-clamp-2 text-xs text-mlq-muted">{prompt.prompt_text}</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<button
			type="button"
			onclick={onedit}
			class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:border-mlq-workflow"
			>Edit</button
		>
		<button
			type="button"
			onclick={ondelete}
			class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-error"
			>Delete</button
		>
	</div>
</div>
```

- [ ] **Step 4: Verify pass** (2 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/prompts/PromptRow.svelte src/lib/prompts/PromptRow.svelte.test.ts && git commit -m "feat(prompts): management list row"`

---

## Task 8: Management page + sidebar entry

**Files:** Create `src/routes/(app)/prompts/+page.server.ts` (+`page.server.test.ts`), `src/routes/(app)/prompts/+page.svelte` (+`page.svelte.test.ts`); Modify `src/lib/components/Sidebar.svelte` (+`Sidebar.svelte.test.ts`)

- [ ] **Step 1: Write the failing server test** — `src/routes/(app)/prompts/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
beforeEach(() => lqFetch.mockReset());

describe('/prompts load', () => {
	it('returns the saved-prompts list', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'p1', name: 'A', prompt_text: 'x' }]), { status: 200 })
		);
		const out = (await load({} as never)) as { prompts: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
		expect(out.prompts[0].id).toBe('p1');
	});
	it('returns an empty list when the backend fails (page still renders)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		const out = (await load({} as never)) as { prompts: unknown[] };
		expect(out.prompts).toEqual([]);
	});
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/prompts/page.server.test.ts"`.
- [ ] **Step 3: Implement load** — `src/routes/(app)/prompts/+page.server.ts`:

```ts
import { lqFetch } from '$lib/server/lqClient';
import type { SavedPrompt } from '$lib/prompts/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/saved-prompts');
	const prompts = res.ok ? ((await res.json()) as SavedPrompt[]) : [];
	return { prompts };
};
```

- [ ] **Step 4: Write the failing page test** — `src/routes/(app)/prompts/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

describe('/prompts index', () => {
	it('renders rows from data and opens the create modal', async () => {
		render(Page, {
			props: {
				data: { prompts: [{ id: 'p1', name: 'Risk review', prompt_text: 'x', tags: [] }] }
			} as never
		});
		expect(screen.getByText('Risk review')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /new prompt/i }));
		expect(screen.getByRole('dialog', { name: /new prompt/i })).toBeInTheDocument();
	});
	it('shows an empty state when there are no prompts', () => {
		render(Page, { props: { data: { prompts: [] } } as never });
		expect(screen.getByText(/no saved prompts/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 5: Verify fail** — `npx vitest run "src/routes/(app)/prompts/page.svelte.test.ts"`.
- [ ] **Step 6: Implement page** — `src/routes/(app)/prompts/+page.svelte`:

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import { Plus } from '@lucide/svelte';
	import PromptRow from '$lib/prompts/PromptRow.svelte';
	import PromptModal from '$lib/prompts/PromptModal.svelte';
	import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
	import type { SavedPrompt, SavedPromptInput } from '$lib/prompts/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lib = createPromptLibrary();
	untrack(() => lib.seed(data.prompts));

	let editing = $state<SavedPrompt | null>(null);
	let modalOpen = $state(false);
	let confirmingDelete = $state<SavedPrompt | null>(null);

	function openCreate() {
		editing = null;
		modalOpen = true;
	}
	function openEdit(p: SavedPrompt) {
		editing = p;
		modalOpen = true;
	}
	function save(input: SavedPromptInput) {
		return editing ? lib.update(editing.id, input) : lib.create(input);
	}
	async function doDelete() {
		if (!confirmingDelete) return;
		await lib.remove(confirmingDelete.id);
		confirmingDelete = null;
	}

	$effect(() => {
		if (!confirmingDelete) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') confirmingDelete = null;
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

<svelte:head><title>Prompts — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-xl font-medium text-mlq-text">Prompts</h1>
		<button
			type="button"
			onclick={openCreate}
			class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"
			><Plus size={13} /> New prompt</button
		>
	</div>

	{#if lib.prompts.length === 0}
		<div
			class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
		>
			No saved prompts yet. Create one, or save a draft from the composer.
		</div>
	{:else}
		<ul class="rounded-mlq-control border border-mlq-subtle">
			{#each lib.prompts as p (p.id)}
				<li class="border-b border-mlq-subtle last:border-b-0">
					<PromptRow
						prompt={p}
						onedit={() => openEdit(p)}
						ondelete={() => (confirmingDelete = p)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
	{#if lib.error}<p class="mt-3 text-sm text-mlq-error">{lib.error}</p>{/if}
</div>

<PromptModal open={modalOpen} prompt={editing} onsave={save} onclose={() => (modalOpen = false)} />

{#if confirmingDelete}
	<div
		role="presentation"
		class="fixed inset-0 z-30 bg-black/40"
		onclick={() => (confirmingDelete = null)}
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Delete prompt"
		class="fixed top-1/2 left-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<h2 class="mb-2 text-sm font-medium text-mlq-text">Delete "{confirmingDelete.name}"?</h2>
		<p class="mb-4 text-xs text-mlq-muted">This permanently removes the saved prompt.</p>
		<div class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (confirmingDelete = null)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Cancel</button
			>
			<button
				type="button"
				onclick={doDelete}
				class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Delete</button
			>
		</div>
	</div>
{/if}
```

- [ ] **Step 7: Add the sidebar entry.** In `src/lib/components/Sidebar.svelte`: add `BookMarked` to the `@lucide/svelte` import, and insert into the `nav` array after the `/playbooks` entry:

```ts
    { href: '/prompts', label: 'Prompts', icon: BookMarked },
```

Then extend `src/lib/components/Sidebar.svelte.test.ts` with (inside the existing describe):

```ts
it('has a Prompts nav entry', () => {
	render(Sidebar, { props: {} as never });
	const link = screen.getByRole('link', { name: /prompts/i });
	expect(link).toHaveAttribute('href', '/prompts');
});
```

(If `Sidebar.svelte.test.ts` renders with specific props, mirror its existing setup — read the file and match how it already renders `Sidebar`.)

- [ ] **Step 8: Verify pass** — `npx vitest run "src/routes/(app)/prompts/page.server.test.ts" "src/routes/(app)/prompts/page.svelte.test.ts" "src/lib/components/Sidebar.svelte.test.ts"`. `npm run check` → 0/0; eslint on all changed files → 0.
- [ ] **Step 9: Commit** — `git add "src/routes/(app)/prompts" src/lib/components/Sidebar.svelte src/lib/components/Sidebar.svelte.test.ts && git commit -m "feat(prompts): management page + sidebar entry"`

---

## Task 9: PromptPicker (composer popover)

**Files:** Create `src/lib/prompts/PromptPicker.svelte`, `src/lib/prompts/PromptPicker.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/prompts/PromptPicker.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PromptPicker from './PromptPicker.svelte';

const prompts = [
	{ id: 'p1', name: 'Risk review', prompt_text: 'Review for risk.', tags: ['legal'] },
	{ id: 'p2', name: 'Summarize', prompt_text: 'Summarize this.', tags: [] }
] as never[];

function open() {
	const onopen = vi.fn();
	const oninsert = vi.fn();
	const onsave = vi.fn(() => Promise.resolve(true));
	render(PromptPicker, {
		props: { prompts, loading: false, error: null, draft: 'my draft', onopen, oninsert, onsave }
	});
	return { onopen, oninsert, onsave };
}

describe('PromptPicker', () => {
	it('opening calls onopen and lists prompts', async () => {
		const { onopen } = open();
		await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
		expect(onopen).toHaveBeenCalled();
		expect(screen.getByText('Risk review')).toBeInTheDocument();
		expect(screen.getByText('Summarize')).toBeInTheDocument();
	});
	it('search filters the list', async () => {
		open();
		await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
		await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'risk' } });
		expect(screen.getByText('Risk review')).toBeInTheDocument();
		expect(screen.queryByText('Summarize')).not.toBeInTheDocument();
	});
	it('clicking a prompt inserts its text', async () => {
		const { oninsert } = open();
		await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
		await fireEvent.click(screen.getByRole('button', { name: /insert Risk review/i }));
		expect(oninsert).toHaveBeenCalledWith('Review for risk.');
	});
	it('save-current-draft sends the draft as prompt_text', async () => {
		const { onsave } = open();
		await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
		await fireEvent.click(screen.getByRole('button', { name: /save current draft/i }));
		await fireEvent.input(screen.getByPlaceholderText(/name this prompt/i), {
			target: { value: 'My draft prompt' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
		expect(onsave.mock.calls.at(-1)![0]).toMatchObject({
			name: 'My draft prompt',
			prompt_text: 'my draft'
		});
	});
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/prompts/PromptPicker.svelte`:

```svelte
<script lang="ts">
	import { BookMarked } from '@lucide/svelte';
	import TagInput from '$lib/skills/authoring/TagInput.svelte';
	import type { SavedPrompt, SavedPromptInput } from './types';

	let {
		prompts,
		loading = false,
		error = null,
		draft,
		onopen,
		oninsert,
		onsave
	}: {
		prompts: SavedPrompt[];
		loading?: boolean;
		error?: string | null;
		draft: string;
		onopen: () => void;
		oninsert: (text: string) => void;
		onsave: (input: SavedPromptInput) => Promise<boolean>;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let query = $state('');
	let saving = $state(false);
	let savingDraft = $state(false);
	let newName = $state('');
	let newTags = $state<string[]>([]);

	const filtered = $derived(
		query.trim()
			? prompts.filter((p) =>
					(p.name + ' ' + (p.tags ?? []).join(' '))
						.toLowerCase()
						.includes(query.trim().toLowerCase())
				)
			: prompts
	);
	const canSaveDraft = $derived(newName.trim().length > 0 && draft.trim().length > 0 && !saving);

	function toggle() {
		open = !open;
		if (open) {
			onopen();
			query = '';
			savingDraft = false;
		}
	}
	function pick(p: SavedPrompt) {
		oninsert(p.prompt_text);
		open = false;
	}
	async function saveDraft() {
		if (!canSaveDraft) return;
		saving = true;
		const ok = await onsave({ name: newName.trim(), prompt_text: draft, tags: newTags });
		saving = false;
		if (ok) {
			newName = '';
			newTags = [];
			savingDraft = false;
		}
	}

	$effect(() => {
		if (!open) return;
		const onkey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		const onclick = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('keydown', onkey);
		document.addEventListener('mousedown', onclick);
		return () => {
			document.removeEventListener('keydown', onkey);
			document.removeEventListener('mousedown', onclick);
		};
	});
</script>

<div bind:this={root} class="relative">
	<button
		type="button"
		data-testid="prompt-picker"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="Prompts"
		onclick={toggle}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
		><BookMarked size={13} /> Prompts</button
	>

	{#if open}
		<div
			class="absolute bottom-full left-0 z-20 mb-1 w-80 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
		>
			<input
				type="text"
				placeholder="Search prompts…"
				bind:value={query}
				class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
			/>
			{#if error}
				<p class="px-3 py-2 text-xs text-mlq-error">{error}</p>
			{:else if loading}
				<p class="px-3 py-2 text-xs text-mlq-muted">Loading…</p>
			{:else if filtered.length === 0}
				<p class="px-3 py-2 text-xs text-mlq-muted">No saved prompts.</p>
			{:else}
				<ul class="max-h-56 overflow-y-auto">
					{#each filtered as p (p.id)}
						<li>
							<button
								type="button"
								aria-label={`Insert ${p.name}`}
								onclick={() => pick(p)}
								class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50"
							>
								<span class="font-medium text-mlq-text">{p.name}</span>
								<span class="mt-0.5 block truncate text-mlq-muted">{p.prompt_text}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="border-t border-mlq-subtle p-2">
				{#if !savingDraft}
					<button
						type="button"
						onclick={() => (savingDraft = true)}
						disabled={draft.trim().length === 0}
						class="w-full rounded-mlq-control px-2 py-1 text-left text-xs text-mlq-workflow hover:bg-mlq-subtle/50 disabled:opacity-40"
						>+ Save current draft as a prompt</button
					>
				{:else}
					<input
						type="text"
						placeholder="Name this prompt…"
						bind:value={newName}
						class="mb-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-xs text-mlq-text outline-none"
					/>
					<div class="mb-1"><TagInput bind:tags={newTags} /></div>
					<div class="flex justify-end gap-2">
						<button
							type="button"
							onclick={() => (savingDraft = false)}
							class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
							>Cancel</button
						>
						<button
							type="button"
							onclick={saveDraft}
							disabled={!canSaveDraft}
							class="rounded-mlq-control bg-mlq-strong px-2 py-0.5 text-xs text-white disabled:opacity-40"
							>Save</button
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Verify pass** (4 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/prompts/PromptPicker.svelte src/lib/prompts/PromptPicker.svelte.test.ts && git commit -m "feat(prompts): composer Prompts popover (search/insert/save-draft)"`

---

## Task 10: Composer integration + page wiring

**Files:** Modify `src/lib/components/Composer.svelte`, `src/routes/(app)/+page.svelte`, `src/routes/(app)/chats/[id]/+page.svelte`; Test: `src/lib/components/Composer.svelte.test.ts` (extend or create)

- [ ] **Step 1: Write the failing test** — add to `src/lib/components/Composer.svelte.test.ts` (create the file if absent, using the `@testing-library/svelte` idiom; if it exists, append inside its describe):

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Composer from './Composer.svelte';
import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';

describe('Composer Prompts integration', () => {
	it('inserts a saved prompt into the message at the cursor', async () => {
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'Risk', prompt_text: 'INSERTED', tags: [] }] as never);
		render(Composer, { props: { value: '', promptLibrary: lib } as never });
		await fireEvent.click(screen.getByRole('button', { name: /prompts/i }));
		await fireEvent.click(screen.getByRole('button', { name: /insert Risk/i }));
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('INSERTED');
	});
});
```

(`modelStore.load()` runs on mount and hits `fetch`; if the test environment lacks it, the existing composer tests will already establish the stub/mock pattern — mirror it. If no composer test exists yet, add `vi.mock('$lib/models/store.svelte', () => ({ modelStore: { load(){}, get options(){return []}, get selectedModel(){return 'smart'}, get error(){return null}, setModel(){} } }))` at the top.)

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/components/Composer.svelte.test.ts`.

- [ ] **Step 3: Implement the Composer changes** — in `src/lib/components/Composer.svelte`:

(a) import the picker + helper + controller type, after the existing imports (line 7-11 area):

```svelte
import PromptPicker from '$lib/prompts/PromptPicker.svelte'; import {spliceText} from '$lib/prompts/spliceText';
import type {createPromptLibrary} from '$lib/prompts/promptLibrary.svelte';
```

(b) add the prop to the `$props()` destructure + type (alongside `skillAttach`/`enhance`):

```svelte
promptLibrary,
```

and in the type block:

```svelte
    promptLibrary?: ReturnType<typeof createPromptLibrary>;
```

(c) add the insert helper near `submit()` (after `autogrow`):

```svelte
  function insertAtCursor(text: string) {
    if (!textarea) { value = value ? `${value}\n${text}` : text; return; }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const result = spliceText(value, start, end, text);
    value = result.value;
    const el = textarea;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
      autogrow();
    });
  }
```

(d) render the picker in the control row — add after the `SkillAttach` block (after line ~120), before the `enhance` block:

```svelte
{#if promptLibrary}
	<PromptPicker
		prompts={promptLibrary.prompts}
		loading={promptLibrary.loading}
		error={promptLibrary.error}
		draft={value}
		onopen={promptLibrary.ensureLoaded}
		oninsert={insertAtCursor}
		onsave={promptLibrary.create}
	/>
{/if}
```

- [ ] **Step 4: Verify the composer test passes** — `npx vitest run src/lib/components/Composer.svelte.test.ts`.

- [ ] **Step 5: Wire the controller into the two composer pages.**

In `src/routes/(app)/+page.svelte` (landing): add the import + instance and pass the prop:

```svelte
import {createPromptLibrary} from '$lib/prompts/promptLibrary.svelte';
```

```svelte
const promptLibrary = createPromptLibrary();
```

and add `{promptLibrary}` to the `<Composer … />` tag.

In `src/routes/(app)/chats/[id]/+page.svelte` (chat): same — import, `const promptLibrary = createPromptLibrary();`, and add `{promptLibrary}` to its `<Composer … />` tag.

- [ ] **Step 6: Verify** — `npm run check` → 0/0 (watch `state_referenced_locally`); `npx eslint src/lib/components/Composer.svelte "src/routes/(app)/+page.svelte" "src/routes/(app)/chats/[id]/+page.svelte"` → 0. Run the touched component tests: `npx vitest run src/lib/components/Composer.svelte.test.ts`.

- [ ] **Step 7: Commit** — `git add src/lib/components/Composer.svelte src/lib/components/Composer.svelte.test.ts "src/routes/(app)/+page.svelte" "src/routes/(app)/chats/[id]/+page.svelte" && git commit -m "feat(prompts): composer Prompts control + insert-at-cursor; wire into landing + chat"`

---

## Task 11: Live e2e + full gate

**Files:** Create `tests/saved-prompts.spec.ts`

- [ ] **Step 1: Rebuild donna-web**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

(No `arq-worker`/LLM needed — pure CRUD + a normal send.)

- [ ] **Step 2: Write the e2e** — `tests/saved-prompts.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('save a prompt from the composer, insert it, then manage it', async ({ page }) => {
	test.setTimeout(90_000);
	const name = `E2E Prompt ${Date.now()}`;
	const body = 'Review this contract for indemnity risk.';

	await login(page);

	// 1. Save the current draft as a prompt from the landing composer.
	await page.getByRole('textbox').first().fill(body);
	await page.getByRole('button', { name: /prompts/i }).click();
	await page.getByRole('button', { name: /save current draft/i }).click();
	await page.getByPlaceholder(/name this prompt/i).fill(name);
	await page.getByRole('button', { name: /^save$/i }).click();

	// 2. It now appears in the popover list; clear the box and insert it.
	await page.getByRole('textbox').first().fill('');
	await expect(page.getByRole('button', { name: new RegExp(`insert ${name}`, 'i') })).toBeVisible();
	await page.getByRole('button', { name: new RegExp(`insert ${name}`, 'i') }).click();
	await expect(page.getByRole('textbox').first()).toHaveValue(new RegExp('indemnity risk'));

	// 3. Manage it: it shows on /prompts; rename via Edit, then delete.
	await page.goto('/prompts');
	await expect(page.getByText(name)).toBeVisible();
	await page.getByRole('button', { name: /edit/i }).first().click();
	const renamed = `${name} v2`;
	await page.getByLabel(/name/i).fill(renamed);
	await page.getByRole('button', { name: /^save$/i }).click();
	await expect(page.getByText(renamed)).toBeVisible();

	await page
		.getByRole('button', { name: /delete/i })
		.first()
		.click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /^delete$/i })
		.click();
	await expect(page.getByText(renamed)).toHaveCount(0);
});
```

- [ ] **Step 3: Run the e2e** — `set -a; . ./.env; set +a; npx playwright test tests/saved-prompts.spec.ts` (Bash timeout 180000ms).
      Expected: PASS. If a locator mismatches, align it to the real DOM (read the components) without weakening intent; document any change. The test is self-cleaning (it deletes the prompt it creates).

- [ ] **Step 4: Full gate** — `npm run check && npx vitest run`.
      Expected: check 0/0; all vitest green.

- [ ] **Step 5: Commit** — `git add tests/saved-prompts.spec.ts && git commit -m "test(prompts): live e2e — save from composer, insert, manage"`

---

## Self-Review (reconciled)

- **Spec coverage:** §3.1 files → all tasks; §3.2 controller → Task 5; §3.3 composer integration (insert-at-cursor + Prompts control + save-draft, landing+in-chat) → Tasks 9 (picker) + 10 (composer/pages); §3.4 management page → Task 8; §3.5 tags via TagInput → Tasks 6 (modal) + 9 (picker); §2 backend CRUD → proxies Tasks 3-4; §5 testing → unit per component + server tests + e2e Task 11. Sidebar entry → Task 8.
- **Route-collision avoidance:** proxies live at `/prompts/items` + `/prompts/items/[id]` (not `/prompts`, which is the page) — the controller fetches those exact paths; the management page loads via `lqFetch` directly (SSR), not the proxy.
- **Type consistency:** `SavedPrompt`/`SavedPromptInput` (Task 1) used by controller (5), modal (6), row (7), picker (9), pages. `createPromptLibrary` getters (`prompts`/`loading`/`error`) + methods (`seed`/`ensureLoaded`/`create`/`update`/`remove`) match every consumer. `spliceText` (Task 2) returns `{value, caret}` consumed by Composer (10). Picker callback names (`onopen`/`oninsert`/`onsave`) match the Composer wiring in Task 10.
- **No placeholders:** every code/command step is concrete (the Sidebar test + Composer test steps note "mirror existing setup if present" — the engineer reads the one existing file to match its render call; the assertion content is given).
- **Known minor (carried):** the composer "insert" caret restore is DOM glue covered by the e2e, not the unit test (the pure `spliceText` is unit-tested instead) — intentional split.
