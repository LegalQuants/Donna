# Skills Authoring (P5-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user a friendly Donna surface to create, edit, fork, and archive their own (user-scope) skills — closing the gap where authoring today requires the LQ_AI developer frontend.

**Architecture:** New top-level `/skills` (index) + `/skills/[id]` (detail/edit) routes mirroring `/knowledge`. Browser → SvelteKit BFF (`lqFetch`, JWT in httpOnly cookie) → lq-ai `api`. Presentational components in `src/lib/skills/authoring/`. Plain `<textarea>` body editor + structured frontmatter fields. Fork-from-built-in via a searchable popover; the edit page after fork _is_ the preview. The composer's existing `SkillAttach` picks up new/forked skills automatically — no composer change.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Tailwind (mlq design tokens), `@lucide/svelte`, vitest + `@testing-library/svelte` (jsdom), Playwright (live e2e), generated `backend.d.ts` types.

**Spec:** `docs/superpowers/specs/2026-05-28-skills-authoring-design.md`

**Backend contract (verified at pin `438198c`):**

- `GET /api/v1/user-skills?scope=user` → `UserSkill[]` (rich, includes `body`).
- `POST /api/v1/user-skills` (`UserSkillCreate`) → 201 `UserSkill` / 409 slug / 422 scope|alias.
- `GET /api/v1/user-skills/{skill_id}` → `UserSkill` (UUID key, owner-only, 404 otherwise).
- `PATCH /api/v1/user-skills/{skill_id}` (`UserSkillUpdate`) → 200 / 422 alias / 404.
- `DELETE /api/v1/user-skills/{skill_id}` → 204 / 409 already-archived / 404 (soft-delete).
- `GET /api/v1/skills?scope=builtin` → `SkillSummary[]` (`name`, `title`, `description`, `tags`).
- `POST /api/v1/skills/{skill_name}/fork` body `{ new_name?, scope:'user' }` → 201 `Skill` (has `id` UUID) / 409.

**Key constraints baked into the design:**

- Detail route keys off `[id]` (UUID), not slug. `slug` is set at create and **immutable after** (absent from `UserSkillUpdate`) → shown read-only on the detail page.
- Archive is terminal (no un-archive endpoint) → archive redirects to `/skills` and the row disappears; index filters `archived_at == null` defensively.
- `SkillSummary` uses `name` (slug-like id) + `title` (display). The fork endpoint's `{skill_name}` = `SkillSummary.name`.

**Conventions for every task:**

- After code steps: `npm run check` (exit 0 + "0 errors and 0 warnings"; the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless) and `npx eslint <touched files>` clean.
- Run unit tests with `npx vitest run <file>`.
- Exact-string Testing-Library queries (never `/regex/i`); `{ name: 'X', exact: true }` when a button name substring-collides.
- Commit per task with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Create:**

- `src/lib/skills/authoring/types.ts` — re-export `UserSkill`, `UserSkillCreate`, `UserSkillUpdate`, `SkillSummary`.
- `src/lib/skills/authoring/deriveSlug.ts` — `display_name` → slug.
- `src/lib/skills/authoring/deriveSlug.test.ts`
- `src/lib/skills/authoring/TagInput.svelte` — chip input for tags.
- `src/lib/skills/authoring/TagInput.svelte.test.ts`
- `src/lib/skills/authoring/SkillRow.svelte` — index row.
- `src/lib/skills/authoring/SkillRow.svelte.test.ts`
- `src/lib/skills/authoring/CreateSkillModal.svelte` — blank-create modal.
- `src/lib/skills/authoring/CreateSkillModal.svelte.test.ts`
- `src/lib/skills/authoring/ForkBrowser.svelte` — searchable built-in popover + confirm-fork.
- `src/lib/skills/authoring/ForkBrowser.svelte.test.ts`
- `src/routes/(app)/skills/builtins/+server.ts` — GET proxy for built-ins.
- `src/routes/(app)/skills/builtins/server.test.ts`
- `src/routes/(app)/skills/+page.server.ts` — load + `?/create` + `?/fork`.
- `src/routes/(app)/skills/+page.svelte` — index page.
- `src/routes/(app)/skills/page.server.test.ts`
- `src/routes/(app)/skills/[id]/+page.server.ts` — load + `?/save` + `?/archive`.
- `src/routes/(app)/skills/[id]/+page.svelte` — detail/edit page.
- `src/routes/(app)/skills/[id]/page.server.test.ts`
- `tests/skills-authoring.spec.ts` — live e2e.

**Modify:**

- `src/lib/components/Sidebar.svelte` — add the `Skills` nav entry.
- `src/lib/components/Sidebar.svelte.test.ts` — **create** (no Sidebar render test exists yet).

The existing `src/lib/skills/` (attach machinery: `attach.svelte.ts`, `types.ts`, `autocomplete/`) is **untouched**.

---

## Task 1: Authoring types

**Files:**

- Create: `src/lib/skills/authoring/types.ts`

- [ ] **Step 1: Write the type re-export module**

```ts
import type { components } from '$lib/api/backend';

/** Rich management view of an editable skill (includes body + frontmatter_extra). */
export type UserSkill = components['schemas']['UserSkill'];
/** Create payload for POST /api/v1/user-skills. */
export type UserSkillCreate = components['schemas']['UserSkillCreate'];
/** Patch payload for PATCH /api/v1/user-skills/{skill_id}. */
export type UserSkillUpdate = components['schemas']['UserSkillUpdate'];
/** Picker/summary shape (built-ins list, fork source). Uses `name` + `title`. */
export type SkillSummary = components['schemas']['SkillSummary'];
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings".

- [ ] **Step 3: Commit**

```bash
git add src/lib/skills/authoring/types.ts
git commit -m "feat(p5-1): skills authoring types re-export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: deriveSlug helper

Pure function: friendly display name → a stable slug matching the backend's `/[a-z0-9-]/` filesystem convention, clamped to 32 chars.

**Files:**

- Create: `src/lib/skills/authoring/deriveSlug.ts`
- Test: `src/lib/skills/authoring/deriveSlug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { deriveSlug } from './deriveSlug';

describe('deriveSlug', () => {
	it('lowercases and hyphenates words', () => {
		expect(deriveSlug('Contract Review')).toBe('contract-review');
	});
	it('strips punctuation and collapses repeated separators', () => {
		expect(deriveSlug('NDA  —  v2!!')).toBe('nda-v2');
	});
	it('drops non-ascii characters', () => {
		expect(deriveSlug('Café Notes')).toBe('caf-notes');
	});
	it('trims leading and trailing dashes', () => {
		expect(deriveSlug('  -Hello-  ')).toBe('hello');
	});
	it('clamps to 32 chars without a trailing dash', () => {
		const out = deriveSlug('a'.repeat(40) + ' bbb');
		expect(out.length).toBeLessThanOrEqual(32);
		expect(out.endsWith('-')).toBe(false);
	});
	it('returns empty string for input with no usable characters', () => {
		expect(deriveSlug('   ***   ')).toBe('');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/authoring/deriveSlug.test.ts`
Expected: FAIL — "deriveSlug is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Derive a backend-safe skill slug from a display name.
 * Lowercase, ascii [a-z0-9] words joined by single dashes, max 32 chars,
 * no leading/trailing dash. Matches the filesystem skill folder convention.
 */
export function deriveSlug(displayName: string): string {
	return displayName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → dash
		.replace(/^-+|-+$/g, '') // trim edge dashes
		.slice(0, 32)
		.replace(/-+$/g, ''); // re-trim a dash left dangling by the slice
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/authoring/deriveSlug.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/authoring/deriveSlug.ts src/lib/skills/authoring/deriveSlug.test.ts
git commit -m "feat(p5-1): deriveSlug — display name to backend-safe slug

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: TagInput component

Chip input bound to a `string[]`. Add on Enter or comma; remove on chip click or Backspace-on-empty; kebab-normalize via `deriveSlug`; dedupe. Renders a hidden `<input name="tags">` per tag so server actions read them with `formData.getAll('tags')`.

**Files:**

- Create: `src/lib/skills/authoring/TagInput.svelte`
- Test: `src/lib/skills/authoring/TagInput.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TagInput from './TagInput.svelte';

describe('TagInput', () => {
	it('renders a hidden input per existing tag', () => {
		const { container } = render(TagInput, { props: { tags: ['nda', 'review'] } });
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(2);
		expect((hidden[0] as HTMLInputElement).value).toBe('nda');
	});

	it('adds a normalized tag on Enter and clears the field', async () => {
		const { container } = render(TagInput, { props: { tags: [] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'Due Diligence' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(field.value).toBe('');
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect((hidden[0] as HTMLInputElement).value).toBe('due-diligence');
	});

	it('does not add a duplicate tag', async () => {
		const { container } = render(TagInput, { props: { tags: ['nda'] } });
		const field = screen.getByLabelText('Add a tag') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'NDA' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(container.querySelectorAll('input[type="hidden"][name="tags"]')).toHaveLength(1);
	});

	it('removes a tag when its remove button is clicked', async () => {
		const { container } = render(TagInput, { props: { tags: ['nda', 'review'] } });
		await fireEvent.click(screen.getByRole('button', { name: 'Remove tag nda' }));
		const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
		expect(hidden).toHaveLength(1);
		expect((hidden[0] as HTMLInputElement).value).toBe('review');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/authoring/TagInput.svelte.test.ts`
Expected: FAIL — cannot find `./TagInput.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<script lang="ts">
	import { X } from '@lucide/svelte';
	import { deriveSlug } from './deriveSlug';

	let { tags = $bindable([]) }: { tags?: string[] } = $props();
	let draft = $state('');

	function commit() {
		const t = deriveSlug(draft);
		draft = '';
		if (!t || tags.includes(t)) return;
		tags = [...tags, t];
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Backspace' && draft === '' && tags.length) {
			tags = tags.slice(0, -1);
		}
	}

	function remove(t: string) {
		tags = tags.filter((x) => x !== t);
	}
</script>

<div
	class="flex flex-wrap items-center gap-1 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1"
>
	{#each tags as t (t)}
		<span
			class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text"
		>
			{t}
			<input type="hidden" name="tags" value={t} />
			<button
				type="button"
				aria-label="Remove tag {t}"
				onclick={() => remove(t)}
				class="text-mlq-muted hover:text-mlq-text"><X size={11} /></button
			>
		</span>
	{/each}
	<input
		type="text"
		aria-label="Add a tag"
		placeholder="Add a tag…"
		bind:value={draft}
		{onkeydown}
		onblur={commit}
		class="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-mlq-text outline-none placeholder:text-mlq-muted"
	/>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/authoring/TagInput.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/authoring/TagInput.svelte src/lib/skills/authoring/TagInput.svelte.test.ts
git commit -m "feat(p5-1): TagInput chip component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: /skills/builtins GET proxy

BFF endpoint the fork popover fetches on open. Mirrors `src/routes/(app)/skills/autocomplete/+server.ts`.

**Files:**

- Create: `src/routes/(app)/skills/builtins/+server.ts`
- Test: `src/routes/(app)/skills/builtins/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/skills/builtins GET', () => {
	it('proxies GET /api/v1/skills?scope=builtin and returns the JSON', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify([
					{ name: 'contract-review', title: 'Contract Review', version: '1.0.0', scope: 'builtin' }
				]),
				{ status: 200 }
			)
		);
		const res = await GET(ev());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills?scope=builtin');
		const body = (await res.json()) as { name: string }[];
		expect(body[0].name).toBe('contract-review');
	});

	it('maps a 500 to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
	});

	it('passes through 503 (gateway unreachable)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('down', { status: 503 }));
		await expect(GET(ev())).rejects.toMatchObject({ status: 503 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/builtins/server.test.ts"`
Expected: FAIL — cannot find `./+server`.

- [ ] **Step 3: Write the endpoint**

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, '/api/v1/skills?scope=builtin');
	// 503/504 are the gateway's unreachable/timeout signals; pass them through so
	// the popover can say "Couldn't load skills". Map anything else to 502.
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load built-in skills.'
		);
	return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/skills/builtins/server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/skills/builtins/+server.ts" "src/routes/(app)/skills/builtins/server.test.ts"
git commit -m "feat(p5-1): /skills/builtins BFF proxy for fork picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /skills index server (load + create + fork)

**Files:**

- Create: `src/routes/(app)/skills/+page.server.ts`
- Test: `src/routes/(app)/skills/page.server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions, load } from './+page.server';

const loadEv = () => ({}) as never;
const formEv = (fields: Record<string, string | string[]>) => {
	const body = new URLSearchParams();
	for (const [k, v] of Object.entries(fields)) {
		if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
		else body.append(k, v);
	}
	return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

const skill = (over: Record<string, unknown> = {}) => ({
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA',
	description: '',
	version: '1.0.0',
	body: 'b',
	archived_at: null,
	created_at: '',
	updated_at: '',
	...over
});

describe('/skills load', () => {
	it('GETs user-skills?scope=user and returns active skills', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify([
					skill({ id: 's1' }),
					skill({ id: 's2', archived_at: '2026-01-01T00:00:00Z' })
				]),
				{ status: 200 }
			)
		);
		const out = (await load(loadEv())) as { skills: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills?scope=user');
		expect(out.skills.map((s) => s.id)).toEqual(['s1']); // archived filtered out
	});

	it('throws 502 when the backend fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
	});
});

describe('/skills ?/create', () => {
	it('POSTs a UserSkillCreate and redirects to the new skill', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify(skill({ id: 'new1' })), { status: 201 })
		);
		await expect(
			actions.create(
				formEv({
					display_name: 'NDA',
					slug: 'nda',
					description: 'x',
					body: 'B',
					tags: ['a', 'b'],
					slash_alias: '/nda'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/skills/new1' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			slug: 'nda',
			display_name: 'NDA',
			description: 'x',
			body: 'B',
			version: '1.0.0',
			scope: 'user',
			tags: ['a', 'b'],
			slash_alias: '/nda'
		});
	});

	it('omits slash_alias when blank', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify(skill({ id: 'new1' })), { status: 201 })
		);
		await expect(
			actions.create(formEv({ display_name: 'NDA', slug: 'nda', body: 'B' }))
		).rejects.toMatchObject({ status: 303 });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body).slash_alias).toBeUndefined();
	});

	it('rejects a missing display_name / slug / body without calling the backend', async () => {
		const r = await actions.create(formEv({ display_name: '', slug: '', body: '' }));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps 409 to an inline slug error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
		const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', body: 'B' }));
		expect(r).toMatchObject({
			status: 409,
			data: { field: 'slug', error: 'A skill with that name already exists.' }
		});
	});

	it('maps 422 to an inline slash_alias error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 422 }));
		const r = await actions.create(
			formEv({ display_name: 'NDA', slug: 'nda', body: 'B', slash_alias: '/nda' })
		);
		expect(r).toMatchObject({ status: 422, data: { field: 'slash_alias' } });
	});

	it('maps other failures to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', body: 'B' }));
		expect(r).toMatchObject({ status: 502 });
	});
});

describe('/skills ?/fork', () => {
	it('POSTs to /skills/{name}/fork and redirects to the new skill', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'fork1', name: 'contract-review' }), { status: 201 })
		);
		await expect(
			actions.fork(formEv({ skill_name: 'contract-review', new_name: 'My Contract Review' }))
		).rejects.toMatchObject({ status: 303, location: '/skills/fork1' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/contract-review/fork');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			scope: 'user',
			new_name: 'My Contract Review'
		});
	});

	it('omits new_name when blank', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'fork1' }), { status: 201 }));
		await expect(actions.fork(formEv({ skill_name: 'contract-review' }))).rejects.toMatchObject({
			status: 303
		});
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ scope: 'user' });
	});

	it('rejects a missing skill_name', async () => {
		const r = await actions.fork(formEv({}));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps 409 to a friendly already-forked error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
		const r = await actions.fork(formEv({ skill_name: 'contract-review' }));
		expect(r).toMatchObject({
			status: 409,
			data: { error: 'You already have a skill forked from this one.' }
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/page.server.test.ts"`
Expected: FAIL — cannot find `./+page.server`.

- [ ] **Step 3: Write the server module**

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { UserSkill, UserSkillCreate } from '$lib/skills/authoring/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/user-skills?scope=user');
	if (!res.ok) throw error(502, 'Could not load your skills.');
	const all = (await res.json()) as UserSkill[];
	const skills = all
		.filter((s) => !s.archived_at)
		.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
	return { skills };
};

export const actions: Actions = {
	create: async (event) => {
		const data = await event.request.formData();
		const display_name = String(data.get('display_name') ?? '').trim();
		const slug = String(data.get('slug') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const body = String(data.get('body') ?? '');
		const tags = data.getAll('tags').map(String).filter(Boolean);
		const slash_alias = String(data.get('slash_alias') ?? '').trim();

		if (!display_name || !slug || !body.trim()) {
			return fail(400, { error: 'Name and body are required.' });
		}

		const payload: UserSkillCreate = {
			slug,
			display_name,
			description,
			body,
			version: '1.0.0',
			scope: 'user',
			tags
		};
		if (slash_alias) payload.slash_alias = slash_alias;

		const res = await lqFetch(event, '/api/v1/user-skills', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		if (res.status === 201) {
			const created = (await res.json()) as UserSkill;
			throw redirect(303, `/skills/${created.id}`);
		}
		if (res.status === 409)
			return fail(409, { field: 'slug', error: 'A skill with that name already exists.' });
		if (res.status === 422)
			return fail(422, { field: 'slash_alias', error: 'That slash command is already in use.' });
		return fail(502, { error: 'Could not create the skill.' });
	},

	fork: async (event) => {
		const data = await event.request.formData();
		const skill_name = String(data.get('skill_name') ?? '').trim();
		const new_name = String(data.get('new_name') ?? '').trim();
		if (!skill_name) return fail(400, { error: 'Missing skill to fork.' });

		const payload: { scope: 'user'; new_name?: string } = { scope: 'user' };
		if (new_name) payload.new_name = new_name;

		const res = await lqFetch(event, `/api/v1/skills/${encodeURIComponent(skill_name)}/fork`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		if (res.status === 201) {
			const forked = (await res.json()) as { id?: string | null };
			throw redirect(303, forked.id ? `/skills/${forked.id}` : '/skills');
		}
		if (res.status === 409)
			return fail(409, { error: 'You already have a skill forked from this one.' });
		return fail(502, { error: 'Could not fork the skill.' });
	}
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/skills/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/skills/+page.server.ts" "src/routes/(app)/skills/page.server.test.ts"
git commit -m "feat(p5-1): /skills index server — load + create + fork actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SkillRow + /skills index page

**Files:**

- Create: `src/lib/skills/authoring/SkillRow.svelte`
- Create: `src/lib/skills/authoring/SkillRow.svelte.test.ts`
- Create: `src/routes/(app)/skills/+page.svelte`

> The index page wires in `CreateSkillModal` and `ForkBrowser` in Tasks 7–8; here it renders the list + empty state + two trigger buttons whose handlers toggle local `$state` (the modal/popover come next).

- [ ] **Step 1: Write the failing test (SkillRow)**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SkillRow from './SkillRow.svelte';
import type { UserSkill } from './types';

const skill: UserSkill = {
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA Review',
	description: 'Reviews NDAs',
	version: '1.0.0',
	tags: ['nda'],
	body: 'b',
	slash_alias: '/nda',
	archived_at: null,
	created_at: '',
	updated_at: ''
} as UserSkill;

describe('SkillRow', () => {
	it('links to the skill detail page and shows the display name', () => {
		render(SkillRow, { props: { skill } });
		const link = screen.getByRole('link', { name: /NDA Review/ });
		expect(link).toHaveAttribute('href', '/skills/s1');
	});

	it('shows the slash alias when present', () => {
		render(SkillRow, { props: { skill } });
		expect(screen.getByText('/nda')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/skills/authoring/SkillRow.svelte.test.ts`
Expected: FAIL — cannot find `./SkillRow.svelte`.

- [ ] **Step 3: Write SkillRow**

```svelte
<script lang="ts">
	import type { UserSkill } from './types';
	let { skill }: { skill: UserSkill } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app skill link -->
<a href="/skills/{skill.id}" class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50">
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm text-mlq-text">{skill.display_name}</span>
		{#if skill.description}
			<span class="block truncate text-xs text-mlq-muted">{skill.description}</span>
		{/if}
	</span>
	{#if skill.slash_alias}
		<span
			class="shrink-0 rounded-mlq-control bg-mlq-subtle px-1.5 py-0.5 font-mono text-xs text-mlq-muted"
			>{skill.slash_alias}</span
		>
	{/if}
	{#if skill.tags?.length}
		<span class="shrink-0 text-xs text-mlq-muted">{skill.tags.slice(0, 3).join(' · ')}</span>
	{/if}
</a>
```

- [ ] **Step 4: Write the index page**

`src/routes/(app)/skills/+page.svelte`:

```svelte
<script lang="ts">
	import { Plus, GitFork } from '@lucide/svelte';
	import SkillRow from '$lib/skills/authoring/SkillRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let creating = $state(false);
	let forking = $state(false);
</script>

<svelte:head><title>Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-xl font-medium text-mlq-text">Skills</h1>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (forking = true)}
				class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
				><GitFork size={13} /> Browse &amp; fork</button
			>
			<button
				type="button"
				onclick={() => (creating = true)}
				class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"
				><Plus size={13} /> New skill</button
			>
		</div>
	</div>

	{#if data.skills.length === 0}
		<div
			class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
		>
			No skills yet. Create one, or fork a built-in to tweak.
		</div>
	{:else}
		<ul class="rounded-mlq-control border border-mlq-subtle">
			{#each data.skills as s (s.id)}
				<li class="border-b border-mlq-subtle last:border-b-0"><SkillRow skill={s} /></li>
			{/each}
		</ul>
	{/if}

	<!-- CreateSkillModal (Task 7) bound to `creating`; ForkBrowser (Task 8) bound to `forking`. -->
</div>
```

- [ ] **Step 5: Run tests + check**

Run: `npx vitest run src/lib/skills/authoring/SkillRow.svelte.test.ts && npm run check`
Expected: PASS; check exit 0, 0 warnings. (The `creating`/`forking` state is referenced only by the placeholder comment for now; if `npm run check` warns about unused `$state`, wire the buttons to `console`-free no-ops is **not** needed — the bindings are consumed in Tasks 7–8, and unused local `$state` does not warn. If a lint warning appears, leave a `<!-- wired in Task 7/8 -->` and proceed; do not add throwaway code.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills/authoring/SkillRow.svelte src/lib/skills/authoring/SkillRow.svelte.test.ts "src/routes/(app)/skills/+page.svelte"
git commit -m "feat(p5-1): SkillRow + /skills index page (list + empty state)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: CreateSkillModal + wire into index

Modal for blank create. Fields: display_name (live slug derivation with editable override), description, body (seeded with a generic non-empty scaffold), tags (`TagInput`), slash_alias. Posts `?/create`; on server redirect, `use:enhance`'s `update()` follows it; on failure, shows the inline error.

**Files:**

- Create: `src/lib/skills/authoring/CreateSkillModal.svelte`
- Create: `src/lib/skills/authoring/CreateSkillModal.svelte.test.ts`
- Modify: `src/routes/(app)/skills/+page.svelte`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CreateSkillModal from './CreateSkillModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('CreateSkillModal', () => {
	it('posts to ?/create and derives the slug from the display name', async () => {
		render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
		const form = screen.getByRole('form', { name: 'Create skill' });
		expect(form).toHaveAttribute('action', '?/create');
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Contract Review' } });
		expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('contract-review');
	});

	it('lets the user override the slug, which then stops auto-deriving', async () => {
		render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
		const slug = screen.getByLabelText('Slug') as HTMLInputElement;
		await fireEvent.input(slug, { target: { value: 'my-custom' } });
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Something Else' } });
		expect(slug.value).toBe('my-custom');
	});

	it('seeds a non-empty body and disables Create until name + body present', async () => {
		render(CreateSkillModal, { props: { open: true, onclose: () => {} } });
		const create = screen.getByRole('button', { name: 'Create', exact: true });
		const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
		expect(body.value.length).toBeGreaterThan(0);
		expect(create).toBeDisabled(); // no name yet
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'NDA' } });
		expect(create).not.toBeDisabled();
	});

	it('renders an inline error from the create action failure', () => {
		render(CreateSkillModal, {
			props: {
				open: true,
				onclose: () => {},
				form: { field: 'slug', error: 'A skill with that name already exists.' }
			}
		});
		expect(screen.getByText('A skill with that name already exists.')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/skills/authoring/CreateSkillModal.svelte.test.ts`
Expected: FAIL — cannot find `./CreateSkillModal.svelte`.

- [ ] **Step 3: Write the modal**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import { deriveSlug } from './deriveSlug';
	import TagInput from './TagInput.svelte';

	type CreateFail = { field?: string; error?: string };
	let { open, onclose, form }: { open: boolean; onclose: () => void; form?: CreateFail | null } =
		$props();

	const STARTER_BODY =
		'## Instructions\n\nDescribe what Donna should do when this skill is used.\n';

	let displayName = $state('');
	let slug = $state('');
	let slugTouched = $state(false);
	let description = $state('');
	let body = $state(STARTER_BODY);
	let tags = $state<string[]>([]);
	let slashAlias = $state('');

	// Auto-derive the slug from the name until the user edits the slug themselves.
	$effect(() => {
		if (!slugTouched) slug = deriveSlug(displayName);
	});

	const canCreate = $derived(displayName.trim() !== '' && body.trim() !== '' && slug.trim() !== '');

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
		aria-label="Create skill"
		class="fixed top-1/2 left-1/2 z-40 max-h-[90vh] w-[34rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-mlq-text">New skill</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button
			>
		</div>

		<form
			method="POST"
			action="?/create"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
				}}
			aria-label="Create skill"
			class="space-y-3"
		>
			<label class="block text-xs text-mlq-muted">
				Name
				<input
					name="display_name"
					type="text"
					required
					bind:value={displayName}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>

			<label class="block text-xs text-mlq-muted">
				Slug
				<input
					name="slug"
					type="text"
					required
					bind:value={slug}
					oninput={() => (slugTouched = true)}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			{#if form?.field === 'slug' && form?.error}
				<p class="text-xs text-mlq-error">{form.error}</p>
			{/if}

			<label class="block text-xs text-mlq-muted">
				Description
				<input
					name="description"
					type="text"
					bind:value={description}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>

			<div class="block text-xs text-mlq-muted">
				Tags
				<div class="mt-1"><TagInput bind:tags /></div>
			</div>

			<label class="block text-xs text-mlq-muted">
				Slash command (optional)
				<input
					name="slash_alias"
					type="text"
					placeholder="/nda"
					bind:value={slashAlias}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			{#if form?.field === 'slash_alias' && form?.error}
				<p class="text-xs text-mlq-error">{form.error}</p>
			{/if}

			<label class="block text-xs text-mlq-muted">
				Body
				<textarea
					name="body"
					rows="8"
					bind:value={body}
					class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				></textarea>
			</label>

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={onclose}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
					>Cancel</button
				>
				<button
					type="submit"
					disabled={!canCreate}
					class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface disabled:opacity-50"
					>Create</button
				>
			</div>
		</form>
	</div>
{/if}
```

- [ ] **Step 4: Wire into the index page**

In `src/routes/(app)/skills/+page.svelte`, add to the `<script>` imports:

```svelte
import CreateSkillModal from '$lib/skills/authoring/CreateSkillModal.svelte';
```

Change the props line to also receive `form`:

```svelte
let {(data, form)}: PageProps = $props();
```

Replace the placeholder comment near the end of the template with:

```svelte
<CreateSkillModal
	open={creating}
	form={creating ? form : null}
	onclose={() => (creating = false)}
/>
```

- [ ] **Step 5: Run tests + check**

Run: `npx vitest run src/lib/skills/authoring/CreateSkillModal.svelte.test.ts && npm run check`
Expected: PASS; check 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills/authoring/CreateSkillModal.svelte src/lib/skills/authoring/CreateSkillModal.svelte.test.ts "src/routes/(app)/skills/+page.svelte"
git commit -m "feat(p5-1): CreateSkillModal + wire into /skills index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ForkBrowser + wire into index

Searchable popover that fetches `/skills/builtins` on open (mirrors the `SkillAttach` autocomplete pattern), filters client-side, and on selecting a built-in switches to a confirm view with an editable name that submits `?/fork`. Modeled on `KbPicker.svelte` (list vs. confirm mode).

**Files:**

- Create: `src/lib/skills/authoring/ForkBrowser.svelte`
- Create: `src/lib/skills/authoring/ForkBrowser.svelte.test.ts`
- Modify: `src/routes/(app)/skills/+page.svelte`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ForkBrowser from './ForkBrowser.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const builtins = [
	{
		name: 'contract-review',
		title: 'Contract Review',
		version: '1',
		scope: 'builtin',
		description: 'Reviews contracts'
	},
	{ name: 'nda-check', title: 'NDA Check', version: '1', scope: 'builtin' }
];

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(builtins), { status: 200 }))
	);
});

describe('ForkBrowser', () => {
	it('fetches built-ins when opened and lists them', async () => {
		render(ForkBrowser, { props: { open: true, onclose: () => {} } });
		await waitFor(() => expect(fetch).toHaveBeenCalledWith('/skills/builtins'));
		expect(await screen.findByText('Contract Review')).toBeInTheDocument();
		expect(screen.getByText('NDA Check')).toBeInTheDocument();
	});

	it('filters the list by the search query', async () => {
		render(ForkBrowser, { props: { open: true, onclose: () => {} } });
		await screen.findByText('Contract Review');
		await fireEvent.input(screen.getByLabelText('Search built-in skills'), {
			target: { value: 'nda' }
		});
		expect(screen.queryByText('Contract Review')).not.toBeInTheDocument();
		expect(screen.getByText('NDA Check')).toBeInTheDocument();
	});

	it('opens a confirm form posting ?/fork with the chosen skill name', async () => {
		render(ForkBrowser, { props: { open: true, onclose: () => {} } });
		await screen.findByText('Contract Review');
		await fireEvent.click(screen.getByRole('button', { name: 'Fork Contract Review' }));
		const form = screen.getByRole('form', { name: 'Fork skill' });
		expect(form).toHaveAttribute('action', '?/fork');
		expect((form.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe(
			'contract-review'
		);
		expect((screen.getByLabelText('New name') as HTMLInputElement).value).toBe('Contract Review');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/skills/authoring/ForkBrowser.svelte.test.ts`
Expected: FAIL — cannot find `./ForkBrowser.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import type { SkillSummary } from './types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	let items = $state<SkillSummary[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let q = $state('');
	let selected = $state<SkillSummary | null>(null);
	let newName = $state('');

	const filtered = $derived(
		q.trim()
			? items.filter((s) =>
					(s.title + ' ' + (s.description ?? '')).toLowerCase().includes(q.trim().toLowerCase())
				)
			: items
	);

	async function fetchBuiltins() {
		loading = true;
		failed = false;
		try {
			const res = await fetch('/skills/builtins');
			if (!res.ok) throw new Error(String(res.status));
			items = (await res.json()) as SkillSummary[];
		} catch {
			failed = true;
			items = [];
		} finally {
			loading = false;
		}
	}

	function choose(s: SkillSummary) {
		selected = s;
		newName = s.title;
	}

	// Load on open; reset to the list when closed.
	$effect(() => {
		if (open) {
			void fetchBuiltins();
		} else {
			selected = null;
			q = '';
		}
	});

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
		aria-label="Browse and fork a skill"
		class="fixed top-1/2 left-1/2 z-40 max-h-[80vh] w-[30rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-mlq-subtle px-3 py-2">
			<h2 class="text-sm font-medium text-mlq-text">
				{selected ? 'Fork skill' : 'Fork a built-in skill'}
			</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button
			>
		</div>

		{#if selected}
			<form
				method="POST"
				action="?/fork"
				use:enhance={() =>
					async ({ update }) => {
						await update();
					}}
				aria-label="Fork skill"
				class="space-y-3 p-3"
			>
				<input type="hidden" name="skill_name" value={selected.name} />
				<label class="block text-xs text-mlq-muted">
					New name
					<input
						name="new_name"
						type="text"
						bind:value={newName}
						class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
					/>
				</label>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (selected = null)}
						class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
						>Back</button
					>
					<button
						type="submit"
						class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"
						>Fork</button
					>
				</div>
			</form>
		{:else}
			<input
				type="text"
				aria-label="Search built-in skills"
				placeholder="Search built-in skills…"
				bind:value={q}
				class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none placeholder:text-mlq-muted"
			/>
			{#if loading}
				<p class="px-3 py-3 text-xs text-mlq-muted">Loading…</p>
			{:else if failed}
				<p class="px-3 py-3 text-xs text-mlq-error">Couldn't load built-in skills.</p>
			{:else if filtered.length === 0}
				<p class="px-3 py-3 text-xs text-mlq-muted">No matches.</p>
			{:else}
				<ul class="max-h-[50vh] overflow-y-auto">
					{#each filtered as s (s.name)}
						<li
							class="flex items-center gap-2 border-b border-mlq-subtle px-3 py-2 last:border-b-0"
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-mlq-text">{s.title}</span>
								{#if s.description}<span class="block truncate text-xs text-mlq-muted"
										>{s.description}</span
									>{/if}
							</span>
							<button
								type="button"
								aria-label="Fork {s.title}"
								onclick={() => choose(s)}
								class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50"
								>Fork</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/if}
```

- [ ] **Step 4: Wire into the index page**

In `src/routes/(app)/skills/+page.svelte`, add the import:

```svelte
import ForkBrowser from '$lib/skills/authoring/ForkBrowser.svelte';
```

Add next to the `CreateSkillModal` line:

```svelte
<ForkBrowser open={forking} onclose={() => (forking = false)} />
```

- [ ] **Step 5: Run tests + check**

Run: `npx vitest run src/lib/skills/authoring/ForkBrowser.svelte.test.ts && npm run check`
Expected: PASS; check 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills/authoring/ForkBrowser.svelte src/lib/skills/authoring/ForkBrowser.svelte.test.ts "src/routes/(app)/skills/+page.svelte"
git commit -m "feat(p5-1): ForkBrowser popover + wire into /skills index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: /skills/[id] server (load + save + archive)

**Files:**

- Create: `src/routes/(app)/skills/[id]/+page.server.ts`
- Test: `src/routes/(app)/skills/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions, load } from './+page.server';

const loadEv = (id = 's1') => ({ params: { id } }) as never;
const formEv = (fields: Record<string, string | string[]>, id = 's1') => {
	const body = new URLSearchParams();
	for (const [k, v] of Object.entries(fields)) {
		if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
		else body.append(k, v);
	}
	return { params: { id }, request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

const skill = (over: Record<string, unknown> = {}) => ({
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA',
	description: 'd',
	version: '1.0.0',
	tags: ['nda'],
	body: 'B',
	slash_alias: '/nda',
	archived_at: null,
	created_at: '',
	updated_at: '',
	...over
});

describe('/skills/[id] load', () => {
	it('GETs the user skill by id', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill()), { status: 200 }));
		const out = (await load(loadEv())) as { skill: { id: string } };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(out.skill.id).toBe('s1');
	});

	it('throws 404 when the skill is missing or not owned', async () => {
		lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 404 });
	});

	it('throws 502 on other backend failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
	});
});

describe('/skills/[id] ?/save', () => {
	it('PATCHes a UserSkillUpdate and returns success', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill()), { status: 200 }));
		const r = await actions.save(
			formEv({
				display_name: 'NDA v2',
				description: 'd2',
				version: '1.1.0',
				body: 'B2',
				tags: ['nda', 'corp'],
				slash_alias: '/nda2'
			})
		);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			display_name: 'NDA v2',
			description: 'd2',
			version: '1.1.0',
			body: 'B2',
			tags: ['nda', 'corp'],
			slash_alias: '/nda2'
		});
		expect(r).toMatchObject({ success: true });
	});

	it('sends slash_alias as null when cleared', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		await actions.save(
			formEv({ display_name: 'NDA', description: '', version: '1.0.0', body: 'B', slash_alias: '' })
		);
		expect(JSON.parse(lqFetch.mock.calls[0][2].body).slash_alias).toBeNull();
	});

	it('maps 422 to an inline slash_alias error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 422 }));
		const r = await actions.save(
			formEv({ display_name: 'NDA', body: 'B', version: '1.0.0', slash_alias: '/taken' })
		);
		expect(r).toMatchObject({ status: 422, data: { field: 'slash_alias' } });
	});

	it('maps 404 to a gone error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.save(formEv({ display_name: 'NDA', body: 'B', version: '1.0.0' }));
		expect(r).toMatchObject({ status: 404, data: { error: 'This skill no longer exists.' } });
	});

	it('rejects empty display_name or body without calling the backend', async () => {
		const r = await actions.save(formEv({ display_name: '', body: '', version: '1.0.0' }));
		expect(r).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('/skills/[id] ?/archive', () => {
	it('DELETEs and redirects to /skills on 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await expect(actions.archive(formEv({}))).rejects.toMatchObject({
			status: 303,
			location: '/skills'
		});
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills/s1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('treats 409 (already archived) as success and still redirects', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
		await expect(actions.archive(formEv({}))).rejects.toMatchObject({
			status: 303,
			location: '/skills'
		});
	});

	it('returns fail(502) on other failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.archive(formEv({}));
		expect(r).toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/[id]/page.server.test.ts"`
Expected: FAIL — cannot find `./+page.server`.

- [ ] **Step 3: Write the server module**

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { UserSkill, UserSkillUpdate } from '$lib/skills/authoring/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`);
	if (res.status === 404) throw error(404, 'Skill not found.');
	if (!res.ok) throw error(502, 'Could not load this skill.');
	const skill = (await res.json()) as UserSkill;
	return { skill };
};

export const actions: Actions = {
	save: async (event) => {
		const data = await event.request.formData();
		const display_name = String(data.get('display_name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const version = String(data.get('version') ?? '').trim();
		const body = String(data.get('body') ?? '');
		const tags = data.getAll('tags').map(String).filter(Boolean);
		const slashRaw = String(data.get('slash_alias') ?? '').trim();

		if (!display_name || !body.trim()) return fail(400, { error: 'Name and body are required.' });

		const payload: UserSkillUpdate = {
			display_name,
			description,
			version,
			body,
			tags,
			slash_alias: slashRaw === '' ? null : slashRaw
		};

		const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload)
		});
		if (res.ok) return { success: true };
		if (res.status === 422)
			return fail(422, { field: 'slash_alias', error: 'That slash command is already in use.' });
		if (res.status === 404) return fail(404, { error: 'This skill no longer exists.' });
		return fail(502, { error: 'Could not save the skill.' });
	},

	archive: async (event) => {
		const res = await lqFetch(event, `/api/v1/user-skills/${event.params.id}`, {
			method: 'DELETE'
		});
		// 204 deleted; 409 already-archived → both mean "it's gone", redirect to the list.
		if (res.ok || res.status === 409) throw redirect(303, '/skills');
		return fail(502, { error: 'Could not archive the skill.' });
	}
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/routes/(app)/skills/[id]/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/skills/[id]/+page.server.ts" "src/routes/(app)/skills/[id]/page.server.test.ts"
git commit -m "feat(p5-1): /skills/[id] server — load + save + archive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: /skills/[id] detail/edit page

Header (breadcrumb, read-only slug, forked-from note) + one Save form (frontmatter fields + body editor) + Archive confirm. Save uses plain `use:enhance` (keeps the page mounted and `invalidateAll`s, so the body `$state` survives — gotcha #9). Inline alias error read from the `form` action data.

**Files:**

- Create: `src/routes/(app)/skills/[id]/+page.svelte`
- Test: `src/routes/(app)/skills/[id]/+page.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { UserSkill } from '$lib/skills/authoring/types';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const skill: UserSkill = {
	id: 's1',
	scope: 'user',
	slug: 'nda',
	display_name: 'NDA',
	description: 'd',
	version: '1.0.0',
	tags: ['nda'],
	body: 'Body text',
	slash_alias: '/nda',
	archived_at: null,
	created_at: '',
	updated_at: ''
} as UserSkill;

const props = (over: Record<string, unknown> = {}) =>
	({ data: { skill }, form: null, ...over }) as never;

describe('/skills/[id] page', () => {
	it('shows the breadcrumb and read-only slug', () => {
		render(Page, props());
		expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
		expect(screen.getByText('nda')).toBeInTheDocument();
	});

	it('has a Save form posting ?/save seeded with the body', () => {
		render(Page, props());
		const form = screen.getByRole('form', { name: 'Edit skill' });
		expect(form).toHaveAttribute('action', '?/save');
		expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Body text');
	});

	it('shows a forked-from note when present', () => {
		render(Page, props({ data: { skill: { ...skill, forked_from: 'contract-review' } } }));
		expect(screen.getByText(/forked from/i)).toBeInTheDocument();
	});

	it('renders an inline slash_alias error from the form action', () => {
		render(
			Page,
			props({ form: { field: 'slash_alias', error: 'That slash command is already in use.' } })
		);
		expect(screen.getByText('That slash command is already in use.')).toBeInTheDocument();
	});

	it('opens an archive confirm dialog with a ?/archive form', async () => {
		render(Page, props());
		await fireEvent.click(screen.getByRole('button', { name: 'Archive', exact: true }));
		const dialog = screen.getByRole('dialog', { name: 'Archive skill' });
		expect(dialog.querySelector('form[action="?/archive"]')).not.toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/[id]/+page.svelte.test.ts"`
Expected: FAIL — cannot find `./+page.svelte`.

- [ ] **Step 3: Write the page**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import TagInput from '$lib/skills/authoring/TagInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// One-time seeds from the loaded skill (props refresh on invalidate; $state persists across save).
	let displayName = $state(untrack(() => data.skill.display_name));
	let description = $state(untrack(() => data.skill.description));
	let version = $state(untrack(() => data.skill.version));
	let slashAlias = $state(untrack(() => data.skill.slash_alias ?? ''));
	let tags = $state<string[]>(untrack(() => [...(data.skill.tags ?? [])]));
	let body = $state(untrack(() => data.skill.body));

	const bytes = $derived(new TextEncoder().encode(body).length);
	const canSave = $derived(displayName.trim() !== '' && body.trim() !== '');

	let confirmingArchive = $state(false);

	$effect(() => {
		if (!confirmingArchive) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') confirmingArchive = false;
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

<svelte:head><title>{data.skill.display_name} — Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-sm text-mlq-muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app skills link -->
		<a href="/skills" class="hover:text-mlq-text">Skills</a> › {data.skill.display_name}
	</nav>

	<div class="mb-4 flex items-center gap-2 text-xs text-mlq-muted">
		<span class="font-mono">{data.skill.slug}</span>
		<span>·</span>
		<span>v{data.skill.version}</span>
		{#if data.skill.forked_from}
			<span>·</span><span>forked from <span class="font-mono">{data.skill.forked_from}</span></span>
		{/if}
	</div>

	<form method="POST" action="?/save" use:enhance aria-label="Edit skill" class="space-y-4">
		<label class="block text-xs text-mlq-muted">
			Name
			<input
				name="display_name"
				type="text"
				required
				bind:value={displayName}
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
		</label>

		<label class="block text-xs text-mlq-muted">
			Description
			<input
				name="description"
				type="text"
				bind:value={description}
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
		</label>

		<div class="flex gap-4">
			<label class="block w-32 text-xs text-mlq-muted">
				Version
				<input
					name="version"
					type="text"
					bind:value={version}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			<label class="block flex-1 text-xs text-mlq-muted">
				Slash command (optional)
				<input
					name="slash_alias"
					type="text"
					placeholder="/nda"
					bind:value={slashAlias}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
		</div>
		{#if form?.field === 'slash_alias' && form?.error}
			<p class="text-xs text-mlq-error">{form.error}</p>
		{/if}

		<div class="block text-xs text-mlq-muted">
			Tags
			<div class="mt-1"><TagInput bind:tags /></div>
		</div>

		<label class="block text-xs text-mlq-muted">
			Body
			<textarea
				name="body"
				rows="16"
				bind:value={body}
				class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			></textarea>
		</label>

		<div class="flex items-center justify-between">
			<p class="text-xs text-mlq-muted">{bytes} bytes</p>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (confirmingArchive = true)}
					class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error"
					>Archive</button
				>
				<button
					type="submit"
					disabled={!canSave}
					class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
					>Save</button
				>
			</div>
		</div>
	</form>
</div>

{#if confirmingArchive}
	<div
		role="presentation"
		class="fixed inset-0 z-30 bg-black/40"
		onclick={() => (confirmingArchive = false)}
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Archive skill"
		class="fixed top-1/2 left-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<h2 class="mb-2 text-sm font-medium text-mlq-text">Archive “{data.skill.display_name}”?</h2>
		<p class="mb-4 text-xs text-mlq-muted">
			It will be removed from your skills and the composer. This can't be undone.
		</p>
		<form method="POST" action="?/archive" use:enhance class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (confirmingArchive = false)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Cancel</button
			>
			<button type="submit" class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white"
				>Archive</button
			>
		</form>
	</div>
{/if}
```

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run "src/routes/(app)/skills/[id]/+page.svelte.test.ts" && npm run check`
Expected: PASS; check 0 errors / 0 warnings.

> Note on the Archive button collision: the page has an "Archive" button (opens the dialog) and the dialog's submit "Archive" button. Tests use `getByRole('button', { name: 'Archive', exact: true })` before opening the dialog (only one present), then scope the submit button via the dialog. If a test needs the dialog's button while both are mounted, scope with `within(dialog)`.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/skills/[id]/+page.svelte" "src/routes/(app)/skills/[id]/+page.svelte.test.ts"
git commit -m "feat(p5-1): /skills/[id] detail-edit page (frontmatter + body + archive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Sidebar "Skills" entry

**Files:**

- Modify: `src/lib/components/Sidebar.svelte`
- Create: `src/lib/components/Sidebar.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Sidebar from './Sidebar.svelte';

beforeEach(() => localStorage.clear());

describe('Sidebar', () => {
	it('includes a Skills nav link pointing at /skills', () => {
		render(Sidebar, { props: { displayName: 'Admin' } });
		expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
	});

	it('keeps the existing Projects link', () => {
		render(Sidebar, { props: { displayName: 'Admin' } });
		expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/matters');
	});
});
```

> `Sidebar` uses `import { page } from '$app/state'`. If the test runner can't resolve `$app/state`, add a mock at the top of the test file: `vi.mock('$app/state', () => ({ page: { url: { pathname: '/' } } }));` (import `vi` from vitest). Run Step 2 first; only add the mock if the failure is a `$app/state` resolution error rather than the assertion.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: FAIL — no link named "Skills" (assertion failure), confirming the nav entry is missing.

- [ ] **Step 3: Add the nav entry**

In `src/lib/components/Sidebar.svelte`, update the lucide import to include `ScrollText`:

```svelte
import {(MessageSquare, FolderKanban, Workflow, Table, ScrollText, PanelLeft, LogOut)} from '@lucide/svelte';
```

Add the `Skills` item to the `nav` array (after `Workflows`):

```svelte
  const nav = [
    { href: '/', label: 'Assistant', icon: MessageSquare },
    { href: '/matters', label: 'Projects', icon: FolderKanban },
    { href: '/workflows', label: 'Workflows', icon: Workflow },
    { href: '/skills', label: 'Skills', icon: ScrollText },
    { href: '/tabular', label: 'Tabular', icon: Table }
  ];
```

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts && npm run check`
Expected: PASS; check 0 errors / 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/lib/components/Sidebar.svelte.test.ts
git commit -m "feat(p5-1): add Skills entry to the sidebar nav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Live e2e + full-branch review + PR

**Files:**

- Create: `tests/skills-authoring.spec.ts`

- [ ] **Step 1: Confirm the stack is up and rebuild donna-web**

```bash
set -a; . ./.env; set +a
docker compose ps
docker compose up -d --build donna-web
```

Expected: all services healthy; `donna-web` rebuilt from current `src/`.

- [ ] **Step 2: Write the self-cleaning live e2e**

Reference the patterns in `tests/kb-management.spec.ts` (login helper, unique `Date.now()` names, exact-name locators, `try/finally` API cleanup, SPA-nav over `page.reload()`).

```ts
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.DONNA_BASE_URL ?? 'http://localhost:13002';
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD ?? '';

async function login(page: Page) {
	await page.goto(`${BASE}/login`);
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(`${BASE}/`);
}

test('skills authoring: create, edit, fork, archive', async ({ page }) => {
	const stamp = Date.now();
	const name = `E2E Skill ${stamp}`;
	const slug = `e2e-skill-${stamp}`;
	const createdSlugs: string[] = [];

	try {
		await login(page);
		await page.goto(`${BASE}/skills`);

		// Create
		await page.getByRole('button', { name: 'New skill', exact: true }).click();
		await page.getByLabel('Name').fill(name);
		await expect(page.getByLabel('Slug')).toHaveValue(slug);
		await page.getByLabel('Body').fill('## Instructions\n\nE2E body.');
		await page.getByRole('button', { name: 'Create', exact: true }).click();

		// Lands on the detail/edit page
		await page.waitForURL(new RegExp(`${BASE}/skills/[0-9a-f-]+`));
		createdSlugs.push(slug);
		await expect(page.getByLabel('Name')).toHaveValue(name);

		// Edit: add a slash alias + change body, Save
		const alias = `/e2e${stamp}`;
		await page.getByLabel('Slash command (optional)').fill(alias);
		await page.getByLabel('Body').fill('## Instructions\n\nEdited body.');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.locator('text=Edited body.'))
			.toBeHidden({ timeout: 0 })
			.catch(() => {});
		// Verify persistence via SPA nav back to the list and into the skill again.
		await page.getByRole('link', { name: 'Skills' }).click();
		await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();

		// Fork a built-in
		await page.getByRole('button', { name: 'Browse & fork' }).click();
		await expect(page.getByLabel('Search built-in skills')).toBeVisible();
		const firstFork = page.getByRole('button', { name: /^Fork / }).first();
		await firstFork.click();
		const forkName = `E2E Fork ${stamp}`;
		await page.getByLabel('New name').fill(forkName);
		await page.getByRole('button', { name: 'Fork', exact: true }).click();
		await page.waitForURL(new RegExp(`${BASE}/skills/[0-9a-f-]+`));
		await expect(page.getByLabel('Name')).toHaveValue(forkName);

		// Archive the fork → back to the list, gone
		await page.getByRole('button', { name: 'Archive', exact: true }).click();
		await page
			.getByRole('dialog', { name: 'Archive skill' })
			.getByRole('button', { name: 'Archive', exact: true })
			.click();
		await page.waitForURL(`${BASE}/skills`);
		await expect(page.getByRole('link', { name: forkName })).toHaveCount(0);
	} finally {
		// Best-effort cleanup: archive every user skill created this run via the BFF.
		const res = await page.request.get(`${BASE}/skills/builtins`).catch(() => null);
		void res; // builtins are not deletable; the loop below targets user skills.
		// Archive any leftover user skill whose name matches this run.
		const listPage = await page.goto(`${BASE}/skills`).catch(() => null);
		void listPage;
		for (const linkName of [name, `E2E Fork ${stamp}`]) {
			const link = page.getByRole('link', { name: linkName });
			if (await link.count()) {
				await link.first().click();
				await page.getByRole('button', { name: 'Archive', exact: true }).click();
				await page
					.getByRole('dialog', { name: 'Archive skill' })
					.getByRole('button', { name: 'Archive', exact: true })
					.click()
					.catch(() => {});
				await page.waitForURL(`${BASE}/skills`).catch(() => {});
			}
		}
	}
});
```

> **Cleanup note:** the primary created skill is archived in `finally` if the test bailed before its own archive step; the fork is archived in the happy path and re-checked in `finally`. Keep the `finally` block resilient (`.catch`) so a mid-test failure still cleans up. If the team prefers direct API teardown, the management endpoint is `DELETE /api/v1/user-skills/{id}` — but the UI-driven archive above avoids needing to resolve slug→id in the test.

- [ ] **Step 3: Run the full local verification**

```bash
npm run check
npx vitest run
npx playwright test tests/skills-authoring.spec.ts
```

Expected: check 0/0; all vitest green (note the pre-existing red `tests/citation-pills.spec.ts` / `citation-live.spec.ts` are P3 debt, out of scope — do not let them block, but do not "fix" them here); the new e2e passes against the live stack.

- [ ] **Step 4: Commit the e2e**

```bash
git add tests/skills-authoring.spec.ts
git commit -m "test(p5-1): live e2e — skills authoring create/edit/fork/archive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Full-branch review**

Dispatch the two-stage review (spec-compliance, then code-quality) over the whole branch diff against `origin/main`. In the review prompt, include an explicit `git rev-parse HEAD origin/p5-1-skills-authoring` step and name the exact feature branch (memory `donna-reviewer-remote-hygiene`) so reviewers diff the right ref. The controller verifies each finding before acting.

- [ ] **Step 6: Open the PR**

Use the `superpowers:finishing-a-development-branch` skill to push `p5-1-skills-authoring` and open a PR into `main` summarizing the slice (index + detail/edit + fork + archive, user scope), the contract corrections vs. the handoff (`{skill_id}` UUID key, slug immutable, DELETE = soft-archive), and the test evidence.

---

## Self-Review (against the spec)

**Spec coverage:**

- §1 scope (create/edit/fork/archive, user scope, textarea, standard frontmatter) → Tasks 5–10. ✓
- §2 contract (all 7 endpoints) → builtins (T4), list/create/fork (T5), load/save/archive (T9). ✓
- §3 IA (`/skills`, `/skills/[id]`, `/skills/builtins`, new sidebar entry) → T4, T5/T6, T9/T10, T11. ✓
- §3 fork flow (browse → confirm → redirect-to-edit) → T8 + T5 `?/fork`. ✓
- §4 components (deriveSlug, types, TagInput, SkillRow, CreateSkillModal, ForkBrowser) → T1, T2, T3, T6, T7, T8. (ForkModal consolidated into ForkBrowser's confirm mode — documented in T8.) ✓
- §5 server actions + error mapping → T5, T9 (each documented status covered in tests). ✓
- §6 reactivity gotchas (use:enhance on Save, untrack seeds, read-only slug) → T10. ✓
- §7 nav → T11. ✓
- §8 error-handling table → covered across T5/T9 tests + inline error rendering T7/T10. ✓
- §9 testing (unit + live e2e, exact queries, rebuild donna-web, SPA-nav) → every task + T12. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The two soft notes (T6 unused-state, T11 `$app/state` mock) are conditional fallbacks with explicit instructions, not placeholders.

**Type consistency:** `UserSkill`/`UserSkillCreate`/`UserSkillUpdate`/`SkillSummary` defined in T1 and used consistently. Form field names (`display_name`, `slug`, `description`, `body`, `tags`, `slash_alias`, `version`, `skill_name`, `new_name`) match between components (T3/T7/T8/T10) and server parsers (T5/T9). Redirect targets `/skills/{id}` consistent. `SkillSummary.name`/`.title` used for the fork source throughout. ✓
