# P2c-B3 Enhance-Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `✦ Enhance` affordance to the in-chat composer that rewrites the draft via `POST /api/v1/enhance-prompt`, shown as an accept/discard preview card, with `PATCH` outcome telemetry.

**Architecture:** Two thin BFF proxies (`POST /enhance-prompt`, `PATCH /enhance-prompt/[interaction_id]`) → a `createEnhance` rune controller (owns the loading/preview/skipped/error states, cancel, accept/discard + telemetry) → a presentational `EnhancePreview.svelte` card → wired into the Composer behind an `enhance?` prop (in-chat only). Mirrors B1/B2.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + `@testing-library/svelte`, Playwright. Spec: `docs/superpowers/specs/2026-05-26-donna-p2c-b3-enhance-prompt-design.md`.

**Conventions (match existing code):**

- Commit per task. Branch is `p2c-b3-enhance-prompt` (already created off `main`; pin `438198c`).
- After any task that changes `src/`, `npm run check` must report **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal).
- BFF tests mock `$lib/server/lqClient`; rune controllers are tested with an injected `fetch` mock (like `src/lib/skills/attach.svelte.ts`); component tests use `@testing-library/svelte`.
- Icons from `@lucide/svelte` (`Sparkles` for enhance). Tailwind tokens: `mlq-*`.

---

### Task 1: enhance-prompt BFF proxies (POST + PATCH)

**Files:**

- Create: `src/routes/(app)/enhance-prompt/+server.ts`
- Test: `src/routes/(app)/enhance-prompt/server.test.ts`
- Create: `src/routes/(app)/enhance-prompt/[interaction_id]/+server.ts`
- Test: `src/routes/(app)/enhance-prompt/[interaction_id]/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/routes/(app)/enhance-prompt/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		request: new Request('http://x/enhance-prompt', { method: 'POST', body: JSON.stringify(body) })
	}) as any;

beforeEach(() => lqFetch.mockReset());

describe('POST /enhance-prompt', () => {
	it('proxies the body and returns the response', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					interaction_id: 'i1',
					expansion_applied: true,
					expanded_prompt: 'X',
					reasoning: []
				}),
				{ status: 200 }
			)
		);
		const res = await POST(event({ raw_input: 'hi', chat_id: 'c1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/enhance-prompt');
		expect((lqFetch.mock.calls[0][2] as { method: string }).method).toBe('POST');
		expect(JSON.parse((lqFetch.mock.calls[0][2] as { body: string }).body)).toMatchObject({
			raw_input: 'hi',
			chat_id: 'c1'
		});
		expect((await res.json()).interaction_id).toBe('i1');
	});

	it('passes through 503/504', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
		await expect(POST(event({ raw_input: 'hi' }))).rejects.toMatchObject({ status: 504 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(POST(event({ raw_input: 'hi' }))).rejects.toMatchObject({ status: 502 });
	});
});
```

Create `src/routes/(app)/enhance-prompt/[interaction_id]/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH } from './+server';

const event = (body: unknown) =>
	({
		params: { interaction_id: 'i1' },
		request: new Request('http://x/enhance-prompt/i1', {
			method: 'PATCH',
			body: JSON.stringify(body)
		})
	}) as any;

beforeEach(() => lqFetch.mockReset());

describe('PATCH /enhance-prompt/[interaction_id]', () => {
	it('proxies the body to the interaction path', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					interaction_id: 'i1',
					expansion_applied: true,
					expanded_prompt: 'X',
					reasoning: []
				}),
				{ status: 200 }
			)
		);
		await PATCH(event({ used: true }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/enhance-prompt/i1');
		expect((lqFetch.mock.calls[0][2] as { method: string }).method).toBe('PATCH');
		expect(JSON.parse((lqFetch.mock.calls[0][2] as { body: string }).body)).toEqual({ used: true });
	});

	it('maps 404 to 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(PATCH(event({ used: true }))).rejects.toMatchObject({ status: 404 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(PATCH(event({ used: false }))).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/routes/(app)/enhance-prompt/"`
Expected: FAIL — no `POST`/`PATCH` exports.

- [ ] **Step 3: Write the implementations**

Create `src/routes/(app)/enhance-prompt/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/enhance-prompt', { method: 'POST', body });
	// 503/504 are the gateway's documented unreachable/timeout signals; pass them
	// through; map anything else (incl. the endpoint's 502) to 502.
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not enhance the prompt.'
		);
	return json(await res.json());
};
```

Create `src/routes/(app)/enhance-prompt/[interaction_id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const PATCH: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, `/api/v1/enhance-prompt/${event.params.interaction_id}`, {
		method: 'PATCH',
		body
	});
	if (!res.ok)
		throw error(res.status === 404 ? 404 : 502, 'Could not record the enhancement outcome.');
	return json(await res.json());
};
```

> `lqFetch`'s helper sets `content-type: application/json` when a body is present and no content-type is set, so forwarding the raw `text()` body is correct.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/enhance-prompt/"`
Expected: PASS (3 + 3 cases).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/enhance-prompt/+server.ts" "src/routes/(app)/enhance-prompt/server.test.ts" "src/routes/(app)/enhance-prompt/[interaction_id]/+server.ts" "src/routes/(app)/enhance-prompt/[interaction_id]/server.test.ts"
git commit -m "feat(p2c-b3): enhance-prompt BFF proxies (POST + PATCH)"
```

---

### Task 2: enhance types + `createEnhance` controller

**Files:**

- Create: `src/lib/enhance/types.ts`
- Create: `src/lib/enhance/enhance.svelte.ts`
- Test: `src/lib/enhance/enhance.svelte.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/enhance/types.ts`:

```ts
import type { components } from '$lib/api/backend';

/** Response from POST /api/v1/enhance-prompt (named schema component). */
export type EnhancePromptResponse = components['schemas']['EnhancePromptResponse'];
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/enhance/enhance.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createEnhance } from './enhance.svelte';

const okResp = (over: Record<string, unknown> = {}) =>
	new Response(
		JSON.stringify({
			interaction_id: 'i1',
			expansion_applied: true,
			expanded_prompt: 'BIG',
			reasoning: ['a'],
			...over
		}),
		{ status: 200 }
	);

describe('createEnhance', () => {
	it('run posts raw_input + chat_id + attached_skills and enters preview', async () => {
		const f = vi.fn().mockResolvedValue(okResp());
		const e = createEnhance('c1', () => ['nda-review']);
		await e.run('review this nda', f);
		expect(f.mock.calls[0][0]).toBe('/enhance-prompt');
		const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
		expect(body).toEqual({
			raw_input: 'review this nda',
			chat_id: 'c1',
			attached_skills: [{ name: 'nda-review' }]
		});
		expect(e.status).toBe('preview');
		expect(e.result?.expanded_prompt).toBe('BIG');
	});

	it('enters skipped when expansion_applied is false', async () => {
		const f = vi
			.fn()
			.mockResolvedValue(okResp({ expansion_applied: false, expanded_prompt: 'review this nda' }));
		const e = createEnhance('c1', () => []);
		await e.run('review this nda', f);
		expect(e.status).toBe('skipped');
	});

	it('enters error on a non-ok response', async () => {
		const f = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		const e = createEnhance('c1', () => []);
		await e.run('hi', f);
		expect(e.status).toBe('error');
	});

	it('does not run on a blank draft', async () => {
		const f = vi.fn();
		const e = createEnhance('c1', () => []);
		await e.run('   ', f);
		expect(f).not.toHaveBeenCalled();
		expect(e.status).toBe('idle');
	});

	it('accept returns expanded_prompt, PATCHes used:true, and resets', async () => {
		const e = createEnhance('c1', () => []);
		await e.run('hi', vi.fn().mockResolvedValue(okResp()));
		const patch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		const text = e.accept(patch);
		expect(text).toBe('BIG');
		expect(patch.mock.calls[0][0]).toBe('/enhance-prompt/i1');
		expect((patch.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
		expect(JSON.parse((patch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
			used: true
		});
		expect(e.status).toBe('idle');
		expect(e.result).toBeNull();
	});

	it('discard PATCHes used:false and resets', async () => {
		const e = createEnhance('c1', () => []);
		await e.run('hi', vi.fn().mockResolvedValue(okResp()));
		const patch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		e.discard(patch);
		expect(JSON.parse((patch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
			used: false
		});
		expect(e.status).toBe('idle');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/enhance/enhance.svelte.test.ts`
Expected: FAIL — `createEnhance` not exported.

- [ ] **Step 4: Write the implementation**

Create `src/lib/enhance/enhance.svelte.ts`:

```ts
import type { EnhancePromptResponse } from './types';

export function createEnhance(chatId: string, getSkills: () => string[]) {
	let status = $state<'idle' | 'loading' | 'preview' | 'skipped' | 'error'>('idle');
	let result = $state<EnhancePromptResponse | null>(null);
	let controller: AbortController | null = null;

	function patchOutcome(id: string, used: boolean, fetchFn: typeof fetch) {
		// Fire-and-forget telemetry — failures are non-blocking.
		fetchFn(`/enhance-prompt/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ used })
		}).catch(() => {});
	}

	async function run(rawInput: string, fetchFn: typeof fetch = fetch) {
		if (!rawInput.trim() || status === 'loading') return;
		status = 'loading';
		result = null;
		controller = new AbortController();
		try {
			const res = await fetchFn('/enhance-prompt', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					raw_input: rawInput,
					chat_id: chatId,
					attached_skills: getSkills().map((name) => ({ name }))
				}),
				signal: controller.signal
			});
			if (!res.ok) {
				status = 'error';
				return;
			}
			result = (await res.json()) as EnhancePromptResponse;
			status = result.expansion_applied ? 'preview' : 'skipped';
		} catch (e) {
			status = (e as Error).name === 'AbortError' ? 'idle' : 'error';
		} finally {
			controller = null;
		}
	}

	function cancel() {
		controller?.abort();
	}

	/** Apply the enhancement: returns the expanded prompt and records used=true. */
	function accept(fetchFn: typeof fetch = fetch): string {
		const text = result?.expanded_prompt ?? '';
		if (result?.interaction_id) patchOutcome(result.interaction_id, true, fetchFn);
		status = 'idle';
		result = null;
		return text;
	}

	function discard(fetchFn: typeof fetch = fetch) {
		if (result?.interaction_id) patchOutcome(result.interaction_id, false, fetchFn);
		status = 'idle';
		result = null;
	}

	return {
		get status() {
			return status;
		},
		get result() {
			return result;
		},
		run,
		cancel,
		accept,
		discard
	};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/enhance/enhance.svelte.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/enhance/types.ts src/lib/enhance/enhance.svelte.ts src/lib/enhance/enhance.svelte.test.ts
git commit -m "feat(p2c-b3): enhance types + createEnhance rune controller"
```

---

### Task 3: `EnhancePreview.svelte` (preview card)

**Files:**

- Create: `src/lib/components/EnhancePreview.svelte`
- Test: `src/lib/components/EnhancePreview.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/EnhancePreview.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import EnhancePreview from './EnhancePreview.svelte';
import type { EnhancePromptResponse } from '$lib/enhance/types';

const result: EnhancePromptResponse = {
	interaction_id: 'i1',
	expansion_applied: true,
	expanded_prompt: 'You are in-house counsel reviewing an NDA…',
	reasoning: ['Added role', 'Added scope']
};

describe('EnhancePreview', () => {
	it('shows the expanded prompt and toggles the reasoning list', async () => {
		const { getByTestId, getByText, queryByText } = render(EnhancePreview, {
			props: { result, onaccept: vi.fn(), ondiscard: vi.fn() }
		});
		expect(getByTestId('enhance-expanded')).toHaveTextContent('in-house counsel');
		expect(queryByText('Added role')).toBeNull();
		await userEvent.click(getByText(/why these changes/i));
		expect(getByText('Added role')).toBeInTheDocument();
	});

	it('fires accept and discard', async () => {
		const onaccept = vi.fn();
		const ondiscard = vi.fn();
		const { getByTestId } = render(EnhancePreview, { props: { result, onaccept, ondiscard } });
		await userEvent.click(getByTestId('enhance-accept'));
		expect(onaccept).toHaveBeenCalledTimes(1);
		await userEvent.click(getByTestId('enhance-discard'));
		expect(ondiscard).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/EnhancePreview.svelte.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/EnhancePreview.svelte`:

```svelte
<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import type { EnhancePromptResponse } from '$lib/enhance/types';

	let {
		result,
		onaccept,
		ondiscard
	}: {
		result: EnhancePromptResponse;
		onaccept: () => void;
		ondiscard: () => void;
	} = $props();

	let showReasoning = $state(false);
</script>

<div
	class="mb-2 rounded-mlq-control border border-l-2 border-mlq-subtle border-l-mlq-strong bg-mlq-surface p-3"
>
	<div class="mb-1 flex items-center gap-1.5 text-[11px] tracking-wide text-mlq-muted uppercase">
		<Sparkles size={12} /> Enhanced prompt
	</div>
	<p data-testid="enhance-expanded" class="font-serif text-sm whitespace-pre-wrap text-mlq-text">
		{result.expanded_prompt}
	</p>

	{#if result.reasoning.length}
		<button
			type="button"
			onclick={() => (showReasoning = !showReasoning)}
			class="mt-2 text-xs text-mlq-muted hover:text-mlq-text"
		>
			{showReasoning ? '▾' : '▸'} Why these changes ({result.reasoning.length})
		</button>
		{#if showReasoning}
			<ul class="mt-1 list-disc space-y-1 pl-5 text-xs text-mlq-muted">
				{#each result.reasoning as r}<li>{r}</li>{/each}
			</ul>
		{/if}
	{/if}

	<div class="mt-3 flex gap-2">
		<button
			type="button"
			data-testid="enhance-accept"
			onclick={onaccept}
			class="rounded-mlq-control bg-mlq-strong px-3 py-1 text-xs text-white">Use this</button
		>
		<button
			type="button"
			data-testid="enhance-discard"
			onclick={ondiscard}
			class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-xs text-mlq-text"
			>Discard</button
		>
	</div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/EnhancePreview.svelte.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings". (No interactive non-button elements here, so no `svelte-ignore` expected. If svelte-check flags the unkeyed `{#each result.reasoning as r}`, add an index key `{#each result.reasoning as r, i (i)}`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/EnhancePreview.svelte src/lib/components/EnhancePreview.svelte.test.ts
git commit -m "feat(p2c-b3): EnhancePreview card (expanded prompt + reasoning toggle)"
```

---

### Task 4: Composer enhance button + preview wiring

**Files:**

- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.test.ts` (add cases)

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe('Composer', …)` block in `src/lib/components/Composer.test.ts`:

```ts
it('hides the enhance button when no enhance controller is passed', () => {
	const { queryByTestId } = render(Composer, { props: {} });
	expect(queryByTestId('enhance-button')).toBeNull();
});

it('shows the enhance button and runs it with the current draft', async () => {
	const run = vi.fn();
	const enhance = {
		status: 'idle',
		result: null,
		run,
		cancel: vi.fn(),
		accept: vi.fn(),
		discard: vi.fn()
	} as unknown as ReturnType<typeof import('$lib/enhance/enhance.svelte').createEnhance>;
	const { getByRole, getByTestId } = render(Composer, { props: { enhance } });
	await userEvent.type(getByRole('textbox'), 'review this');
	await userEvent.click(getByTestId('enhance-button'));
	expect(run).toHaveBeenCalledWith('review this');
});

it('renders the preview and applies accepted text to the textarea', async () => {
	const accept = vi.fn(() => 'EXPANDED TEXT');
	const enhance = {
		status: 'preview',
		result: {
			interaction_id: 'i1',
			expansion_applied: true,
			expanded_prompt: 'EXPANDED TEXT',
			reasoning: []
		},
		run: vi.fn(),
		cancel: vi.fn(),
		accept,
		discard: vi.fn()
	} as unknown as ReturnType<typeof import('$lib/enhance/enhance.svelte').createEnhance>;
	const { getByRole, getByTestId } = render(Composer, { props: { enhance } });
	await userEvent.click(getByTestId('enhance-accept'));
	expect(accept).toHaveBeenCalled();
	expect((getByRole('textbox') as HTMLTextAreaElement).value).toBe('EXPANDED TEXT');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Composer.test.ts -t "enhance"`
Expected: FAIL — no `enhance-button`/`enhance-accept` testids.

- [ ] **Step 3: Write the implementation**

Edit `src/lib/components/Composer.svelte`:

1. Update the imports + `Sparkles` icon + `createEnhance` type and add the `enhance?` prop. Replace the top `<script>` import lines and the props block:

```svelte
  import { onMount } from 'svelte';
  import { ArrowRight, Square, X, Sparkles } from '@lucide/svelte';
  import ModelPicker from './ModelPicker.svelte';
  import SkillAttach from './SkillAttach.svelte';
  import EnhancePreview from './EnhancePreview.svelte';
  import { modelStore } from '$lib/models/store.svelte';
  import type { createSkillAttach } from '$lib/skills/attach.svelte';
  import type { createEnhance } from '$lib/enhance/enhance.svelte';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop,
    skillAttach,
    enhance
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string, skills: string[]) => void;
    streaming?: boolean;
    onstop?: () => void;
    skillAttach?: ReturnType<typeof createSkillAttach>;
    enhance?: ReturnType<typeof createEnhance>;
  } = $props();
```

2. Add the enhance preview / skip / error block ABOVE the skill chips block (immediately after the opening composer `<div ...>`):

```svelte
{#if enhance}
	{#if enhance.status === 'preview' && enhance.result}
		<EnhancePreview
			result={enhance.result}
			onaccept={() => (value = enhance.accept())}
			ondiscard={enhance.discard}
		/>
	{:else if enhance.status === 'skipped'}
		<p class="mb-2 text-xs text-mlq-muted">No changes suggested.</p>
	{:else if enhance.status === 'error'}
		<p class="mb-2 text-xs text-mlq-muted">Couldn't enhance the prompt.</p>
	{/if}
{/if}
```

3. Add the Enhance control in the control row, immediately after the `{#if skillAttach}…{/if}` SkillAttach block and before the `<span class="flex-1">`:

```svelte
{#if enhance}
	{#if enhance.status === 'loading'}
		<span
			class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-muted"
		>
			Enhancing…
			<button
				type="button"
				aria-label="Cancel enhance"
				onclick={enhance.cancel}
				class="hover:text-mlq-text"><X size={12} /></button
			>
		</span>
	{:else}
		<button
			type="button"
			data-testid="enhance-button"
			onclick={() => enhance.run(value)}
			disabled={!value.trim()}
			class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text disabled:opacity-40"
		>
			<Sparkles size={13} /> Enhance
		</button>
	{/if}
{/if}
```

(Everything else — model picker, skill chips/button, send/stop, `submit`, `onkeydown` — stays unchanged.)

- [ ] **Step 4: Run the full Composer suite**

Run: `npx vitest run src/lib/components/Composer.test.ts`
Expected: PASS — the three new cases plus all existing (the existing B1/B2 cases don't pass an `enhance` prop, so the enhance UI is absent and they're unaffected; no signature change to `onsubmit`).

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings".

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.test.ts
git commit -m "feat(p2c-b3): composer enhance button + preview wiring"
```

---

### Task 5: Wire the chat page to own the enhance controller

**Files:**

- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

- [ ] **Step 1: Make these three edits.** Read the file first.

1. Add the import beside the existing `createSkillAttach` import:

```svelte
import {createEnhance} from '$lib/enhance/enhance.svelte';
```

2. Create the controller after the existing `const skillAttach = createSkillAttach();` line (it closes over the chat id and reuses the B2 attached-skill names):

```svelte
const enhance = createEnhance(data.chatId, () => skillAttach.names);
```

3. Pass it to the Composer — add `{enhance}` to the existing `<Composer ... />` (keep all existing props, including `{skillAttach}`):

```svelte
<Composer
	bind:value={draftValue}
	onsubmit={submit}
	streaming={chat.status === 'streaming'}
	onstop={chat.stop}
	{skillAttach}
	{enhance}
/>
```

- [ ] **Step 2: Verify check + the full unit suite**

Run: `npm run check && npx vitest run`
Expected: check "0 errors and 0 warnings"; all unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p2c-b3): chat page owns enhance controller (chat_id + attached skills)"
```

---

### Task 6: Live e2e + full gate

**Files:**

- Create: `tests/enhance-prompt.spec.ts`

**Prereqs (run once):**

```bash
cd /Users/kevinkeller/Code/Donna
set -a; . ./.env; set +a
docker compose up -d --build donna-web
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
```

- [ ] **Step 1: Write the e2e test**

Create `tests/enhance-prompt.spec.ts`:

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

test('enhance rewrites the draft via a preview the user accepts, and records the outcome', async ({
	page
}) => {
	test.setTimeout(90_000);
	await login(page);

	// Start a chat (enhance is in-chat only).
	await page.fill('textarea', 'In one short sentence, what is an NDA?');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

	// Type a short, vague draft and enhance it.
	await page.fill('textarea', 'review this nda');
	await page.getByTestId('enhance-button').click();

	// The ~20s call returns a preview card with the expanded prompt.
	await expect(page.getByTestId('enhance-expanded')).toContainText(/in-house counsel/i, {
		timeout: 45000
	});

	// Accept → the expanded prompt lands in the textarea, and a PATCH outcome is recorded.
	const patchPromise = page.waitForRequest(
		(r: any) => r.url().includes('/enhance-prompt/') && r.method() === 'PATCH'
	);
	await page.getByTestId('enhance-accept').click();
	await patchPromise;
	await expect(page.locator('textarea')).toHaveValue(/in-house counsel/i);
});
```

- [ ] **Step 2: Run the e2e against the running stack**

Run: `npx playwright test tests/enhance-prompt.spec.ts`
Expected: PASS. If the preview never appears, confirm `donna-web` was rebuilt and `POST /enhance-prompt` works (`curl` the BFF route while logged in). The enhance call is slow (~20s) — the 45s assertion timeout covers it.

- [ ] **Step 3: Full gate**

Run: `npm run check && npx vitest run && npx playwright test`
Expected: check "0 errors and 0 warnings"; all unit specs pass; all Playwright specs pass (the new one + the existing suites — confirm no regression from the Composer change). Note: `tests/citation-live.spec.ts` is RAG-seed timing-sensitive and may need one retry while embeddings settle (unaffected by this change).

- [ ] **Step 4: Commit**

```bash
git add tests/enhance-prompt.spec.ts
git commit -m "test(p2c-b3): live e2e for enhance-prompt (preview, accept, applied + PATCH)"
```

---

## Self-review

**Spec coverage:**

- `✦ Enhance` button → `POST /enhance-prompt` with raw_input+chat_id+attached_skills → Tasks 2 (controller builds the body), 4 (button), 5 (page supplies chatId + skill getter).
- Preview card (expanded_prompt + collapsible reasoning + Use this/Discard) → Task 3 + Task 4 (renders it on `status==='preview'`).
- Original untouched until accept; accept applies to textarea → Task 4 (`value = enhance.accept()`).
- ~20s loading + cancel → Task 4 (`Enhancing…` + cancel) + Task 2 (`cancel`/AbortController).
- skip (`expansion_applied:false`) → Task 2 (`skipped`) + Task 4 (note). Error → Task 2 (`error`) + Task 4 (note).
- PATCH telemetry `used:true`/`false` → Task 2 (`accept`/`discard`) + Task 1 (PATCH proxy).
- In-chat only → Task 4 (`{#if enhance}`) + Task 5 (only the chat page creates/passes it).
- Testing: BFF (1), controller (2), component (3), Composer (4), live e2e (6).

**Out of scope (correctly absent):** attached_files, jurisdiction, edited_before_use, landing enhance, streaming.

**Type consistency:** `EnhancePromptResponse` (Task 2) is used in Tasks 3, 4. The controller surface (`status/result/run/cancel/accept/discard`) defined in Task 2 matches the Composer wiring + test mocks (Task 4) and the page (Task 5). `createEnhance(chatId, getSkills)` signature matches the page call. `accept()` returns `string` (applied to `value`) — consistent between Task 2, the Composer handler (Task 4), and its test. No `onsubmit` signature change, so unlike B2 there is **no ripple** to existing Composer tests.
