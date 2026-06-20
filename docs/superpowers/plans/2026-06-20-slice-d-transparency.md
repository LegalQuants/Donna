# Slice D — Transparency & external-source citations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface case-law provenance in chat (a "Sources consulted" pill + panel under assistant
turns that consulted case law) and a built-in skill's declared connectors (a read-only skill
inspector with a non-blocking "Uses: …" note).

**Architecture:** Two independent surfaces on lq-ai pin `658fdbc` (PR6c/6d). (1) Chat: a new BFF
proxy + a defensive parser + a post-stream lazy-fetch in the chat store + a presentational panel and
a footer pill in `Message.svelte` — mirroring the existing per-message citations path exactly.
(2) Skills: a pure `toolUsageNote` helper + a new read-only `/skills/view/[name]` inspector route
that loads the full `Skill` schema, plus a "View" link from the skills list.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest + `@testing-library/svelte`,
Playwright e2e, Tailwind (`mlq-*` tokens). Backend via the BFF (`lqFetch`, httpOnly-cookie auth).

## Global Constraints

- **Never edit `vendor/lq-ai`.** Consume the contract via generated `src/lib/api/backend.d.ts`.
- **Bar is green:** `npm run check` = 0 errors / 0 warnings; `npm run lint` = prettier + eslint
  fully clean; `npx vitest run` passes. Run all three before claiming a task done.
- **Tabs for indentation** (prettier-enforced) — copy a neighboring file's style.
- **Svelte 5 runes** (`$props`, `$state`, `$derived`, `$effect`); seed `$state` from `data` once via
  `untrack(() => …)` to avoid `state_referenced_locally` warnings.
- **Defensive parsers at the data boundary:** `parseXList(raw: unknown)` with local `str`/`obj`
  guards that drop malformed rows rather than throwing (template: `src/lib/automations/findings.ts`).
- **Honest degradation:** a failed sub-fetch degrades to absent UI; never break the page or
  fabricate data. Live pollers keep last-known-good (only overwrite on a successful incoming value).
- **External links:** `<a target="_blank" rel="noopener noreferrer">`, plain text — never `{@html}`.
- **Do NOT weaken `eslint.config.js`** to dodge a test type error — cast the `load`/action result at
  the call site (the codebase pattern; a prior `@ts-nocheck` attempt was reverted).
- **Commit per task.** Conventional-commit messages, end with the `Co-Authored-By` trailer.
- Rebuild `donna-web` (`docker compose up -d --build donna-web`) before any manual/e2e check — the
  container serves built code, not the working tree. The stack is up with CL + DeepWiki MCP wired;
  login `admin@lq.ai` / `DONNA_E2E_PASSWORD` from `.env`.

---

## File Structure

**Part 1 — Chat external-source citations**
- Create `src/lib/citations/sources.ts` — `ToolSource` type + `parseToolSources(raw)`.
- Create `src/lib/citations/sources.test.ts` — parser unit tests.
- Create `src/routes/(app)/chats/[id]/messages/[message_id]/sources/+server.ts` — BFF GET proxy.
- Create `src/routes/(app)/chats/[id]/messages/[message_id]/sources/server.test.ts` — proxy test.
- Modify `src/lib/chat/chatStream.svelte.ts` — add `sources?` to `ChatMessage`, `loadSources(idx)`,
  call it post-stream; reset in `retry()`.
- Create `src/lib/chat/chatStream.sources.test.ts` — `loadSources` store test.
- Create `src/lib/components/ToolSourcesPanel.svelte` — presentational panel.
- Create `src/lib/components/ToolSourcesPanel.svelte.test.ts` — render test.
- Modify `src/lib/components/Message.svelte` — footer pill + panel wiring.

**Part 2 — Built-in skill tool-usage note**
- Modify `src/lib/skills/types.ts` — `Skill` type alias + `toolUsageNote` helper. (Helper may live
  in a sibling `src/lib/skills/toolUsage.ts` if cleaner; this plan puts it in `types.ts`.)
- Create `src/lib/skills/toolUsage.test.ts` — `toolUsageNote` unit tests.
- Create `src/routes/(app)/skills/view/[name]/+page.server.ts` — load full `Skill` via `/contents`.
- Create `src/routes/(app)/skills/view/[name]/page.server.test.ts` — load test.
- Create `src/routes/(app)/skills/view/[name]/+page.svelte` — read-only inspector.
- Modify `src/routes/(app)/skills/+page.svelte` — "View" link on built-in rows.

**e2e**
- Create `tests/skill-inspector.spec.ts` — view `case-law-research`, assert "Uses: courtlistener".
- Create `tests/chat-sources.spec.ts` — self-skipping chat-sources check (model-nondeterministic).

---

## Part 1 — Chat external-source citations

### Task 1: `ToolSource` type + `parseToolSources` parser

**Files:**
- Create: `src/lib/citations/sources.ts`
- Test: `src/lib/citations/sources.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ToolSource { id: string; message_id: string; source_kind: string; label: string;
    subtitle: string | null; url: string | null; external_ref: string | null; provider: string;
    tool: string; created_at: string | null }`
  - `parseToolSources(raw: unknown): ToolSource[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citations/sources.test.ts
import { describe, it, expect } from 'vitest';
import { parseToolSources } from './sources';

describe('parseToolSources', () => {
	it('parses well-formed rows and preserves order', () => {
		const out = parseToolSources([
			{
				id: 's1',
				message_id: 'm1',
				source_kind: 'caselaw',
				label: 'Roe v. Wade, 410 U.S. 113 (1973)',
				subtitle: 'U.S. Supreme Court · 1973',
				url: 'https://www.courtlistener.com/opinion/108713/roe-v-wade/',
				external_ref: '108713',
				provider: 'courtlistener',
				tool: 'search_case_law',
				created_at: '2026-06-20T00:00:00Z'
			},
			{ label: 'Second case', provider: 'courtlistener', tool: 'get_cluster' }
		]);
		expect(out).toHaveLength(2);
		expect(out[0].label).toBe('Roe v. Wade, 410 U.S. 113 (1973)');
		expect(out[0].subtitle).toBe('U.S. Supreme Court · 1973');
		expect(out[1].label).toBe('Second case');
		expect(out[1].subtitle).toBeNull();
		expect(out[1].url).toBeNull();
	});

	it('drops rows missing the load-bearing label', () => {
		const out = parseToolSources([
			{ id: 'x', provider: 'courtlistener', tool: 'search_case_law' },
			{ label: 'Keep me' }
		]);
		expect(out).toHaveLength(1);
		expect(out[0].label).toBe('Keep me');
	});

	it('returns [] for non-array / malformed input', () => {
		expect(parseToolSources(null)).toEqual([]);
		expect(parseToolSources({ nope: true })).toEqual([]);
		expect(parseToolSources([null, 3, 'x'])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/citations/sources.test.ts`
Expected: FAIL — `parseToolSources` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/citations/sources.ts
// Defensively-parsed external-source provenance (lq-ai PR6c). The
// /messages/{id}/sources endpoint returns rows with every field optional
// (source_kind='caselaw' in 6c), so we hand-parse — mirroring findings.ts.
// Retrieval-provenance ("sources consulted"), distinct from verified-quote
// citations; rendered as a per-message panel, never claim-level grounded.

export interface ToolSource {
	id: string;
	message_id: string;
	source_kind: string;
	label: string;
	subtitle: string | null;
	url: string | null;
	external_ref: string | null;
	provider: string;
	tool: string;
	created_at: string | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseToolSource(raw: unknown): ToolSource | null {
	const r = obj(raw);
	const label = str(r.label);
	if (label === null) return null; // label is the load-bearing field
	return {
		id: str(r.id) ?? '',
		message_id: str(r.message_id) ?? '',
		source_kind: str(r.source_kind) ?? '',
		label,
		subtitle: str(r.subtitle),
		url: str(r.url),
		external_ref: str(r.external_ref),
		provider: str(r.provider) ?? '',
		tool: str(r.tool) ?? '',
		created_at: str(r.created_at)
	};
}

/** Parse the raw /sources array; drops malformed/label-less rows, preserves
 *  retrieval order. Non-array input → []. */
export function parseToolSources(raw: unknown): ToolSource[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(parseToolSource).filter((s): s is ToolSource => s !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/citations/sources.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npm run lint
git add src/lib/citations/sources.ts src/lib/citations/sources.test.ts
git commit -m "feat(chat): ToolSource type + parseToolSources defensive parser (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sources BFF proxy route

**Files:**
- Create: `src/routes/(app)/chats/[id]/messages/[message_id]/sources/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/[message_id]/sources/server.test.ts`

**Interfaces:**
- Consumes: `lqFetch` from `$lib/server/lqClient`.
- Produces: `GET` handler proxying `/api/v1/chats/{id}/messages/{message_id}/sources`.

- [ ] **Step 1: Write the failing test** (mirrors the citations `server.test.ts`)

```ts
// src/routes/(app)/chats/[id]/messages/[message_id]/sources/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { GET } from './+server';

const event = () => ({ params: { id: 'c1', message_id: 'm1' } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET sources', () => {
	it('proxies the per-message sources endpoint', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify([{ label: 'x' }]), { status: 200 }));
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/messages/m1/sources');
		expect(await res.json()).toEqual([{ label: 'x' }]);
	});

	it('maps a 404 to a 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/[message_id]/sources/server.test.ts"`
Expected: FAIL — `./+server` has no `GET` / module missing.

- [ ] **Step 3: Write minimal implementation** (mirrors the citations proxy)

```ts
// src/routes/(app)/chats/[id]/messages/[message_id]/sources/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(
		event,
		`/api/v1/chats/${event.params.id}/messages/${event.params.message_id}/sources`
	);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load sources.');
	return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/[message_id]/sources/server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npm run lint
git add "src/routes/(app)/chats/[id]/messages/[message_id]/sources/"
git commit -m "feat(chat): BFF proxy for per-message external sources (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `loadSources` in the chat store

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.sources.test.ts`

**Interfaces:**
- Consumes: `parseToolSources`, `ToolSource` (Task 1); the existing `createChatStream` / SSE plumbing.
- Produces: `ChatMessage.sources?: ToolSource[]`, populated post-stream on assistant `done`.

**Context:** `loadCitations(idx)` (lines 97–119) and its call site in `consumeStream` (lines 182–185)
are the template. `loadSources` is the same shape **minus** the `hasCitationMarkers` gate (sources
have no in-text marker — fetch unconditionally; the endpoint returns `[]` cheaply). `retry()` (lines
272–285) resets per-turn state — add `sources` there too.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/chatStream.sources.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom provides no fetch; stub it per-test.
const fetchMock = vi.fn();
beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) });
});

import { createChatStream } from './chatStream.svelte';

// A minimal SSE Response body: start → delta → complete → done. NOTE: the parser
// (src/lib/chat/sse.ts) keys off the `type` field INSIDE the `data:` JSON, ignores
// any `event:` line, and treats `data: [DONE]` as the terminal frame.
function sseResponse(messageId: string, content: string) {
	const frames = [
		`data: ${JSON.stringify({ type: 'start', lq_ai_message_id: messageId, chat_id: 'chat-1' })}\n\n`,
		`data: ${JSON.stringify({ type: 'delta', delta: content, lq_ai_message_id: messageId })}\n\n`,
		`data: ${JSON.stringify({ type: 'complete', lq_ai_message_id: messageId, message: { id: messageId, content } })}\n\n`,
		`data: [DONE]\n\n`
	];
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			const enc = new TextEncoder();
			for (const f of frames) c.enqueue(enc.encode(f));
			c.close();
		}
	});
	return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('chat store loadSources', () => {
	it('fetches and stores external sources after the turn completes', async () => {
		fetchMock.mockImplementation((url: string) => {
			if (url.endsWith('/messages')) return Promise.resolve(sseResponse('mid-1', 'hello'));
			if (url.endsWith('/sources'))
				return Promise.resolve(
					new Response(JSON.stringify([{ label: 'Roe v. Wade', tool: 'search_case_law' }]), {
						status: 200
					})
				);
			// citations + receipts endpoints: empty
			return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
		});

		const store = createChatStream('chat-1');
		await store.send('find a case');

		const assistant = store.messages[store.messages.length - 1];
		expect(assistant.role).toBe('assistant');
		expect(assistant.sources).toEqual([
			expect.objectContaining({ label: 'Roe v. Wade', tool: 'search_case_law' })
		]);
	});

	it('leaves sources undefined when the fetch fails', async () => {
		fetchMock.mockImplementation((url: string) => {
			if (url.endsWith('/messages')) return Promise.resolve(sseResponse('mid-2', 'hi'));
			if (url.endsWith('/sources')) return Promise.resolve(new Response('no', { status: 500 }));
			return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
		});

		const store = createChatStream('chat-1');
		await store.send('hi');

		const assistant = store.messages[store.messages.length - 1];
		expect(assistant.sources).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.sources.test.ts`
Expected: FAIL — `assistant.sources` is `undefined` in the first test (no `loadSources` yet).

- [ ] **Step 3: Implement — three edits to `chatStream.svelte.ts`**

(a) Import the parser/type at the top, beside the citations import (line 2–3):

```ts
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';
import { parseToolSources, type ToolSource } from '$lib/citations/sources';
```

(b) Add the field to `ChatMessage` (after `citations?: Citation[];`, line 18):

```ts
	citations?: Citation[];
	/** External-source provenance (case law consulted), lazy-fetched post-stream (PR6c). */
	sources?: ToolSource[];
```

(c) Add `loadSources` right after `loadCitations` (after line 119):

```ts
	// External-source provenance lives in the message_tool_sources table (PR6c),
	// not the SSE frame. Unlike citations there is no in-text marker, so fetch
	// unconditionally once the turn is persisted; the endpoint returns [] cheaply
	// for the common no-tool turn. One retry covers the persist/fetch race.
	async function loadSources(idx: number) {
		const id = messages[idx].id;
		if (!id || id === 'pending') return;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetch(`/chats/${chatId}/messages/${id}/sources`);
				if (!res.ok) {
					if (import.meta.env.DEV) console.warn(`loadSources: ${res.status} for message ${id}`);
					return;
				}
				const srcs = parseToolSources(await res.json());
				if (srcs.length > 0 || attempt === 1) {
					if (srcs.length > 0) messages[idx].sources = srcs; // last-known-good: never clobber with []
					return;
				}
			} catch {
				return;
			}
			await new Promise((r) => setTimeout(r, 400));
		}
	}
```

(d) Call it in `consumeStream`, beside `loadCitations` (lines 182–185):

```ts
		if (messages[idx].status === 'done') {
			await loadCitations(idx);
			await loadSources(idx);
			await loadAnonymization(idx);
		}
```

(e) Reset it in `retry()` beside `citations` (line 279):

```ts
		messages[idx].citations = undefined;
		messages[idx].sources = undefined;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/chatStream.sources.test.ts`
Expected: PASS (2 tests). Also run the existing chat-store tests to confirm no regression:
`npx vitest run src/lib/chat/`

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npm run lint
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.sources.test.ts
git commit -m "feat(chat): lazy-fetch external sources post-stream into the chat store (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `ToolSourcesPanel.svelte`

**Files:**
- Create: `src/lib/components/ToolSourcesPanel.svelte`
- Test: `src/lib/components/ToolSourcesPanel.svelte.test.ts`

**Interfaces:**
- Consumes: `ToolSource` (Task 1).
- Produces: a presentational component `<ToolSourcesPanel sources={ToolSource[]} />`. Visibility is
  owned by the parent (`Message.svelte`); this renders nothing when `sources` is empty.

- [ ] **Step 1: Write the failing test** (mirrors `ResearchGate.svelte.test.ts`)

```ts
// src/lib/components/ToolSourcesPanel.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ToolSourcesPanel from './ToolSourcesPanel.svelte';
import type { ToolSource } from '$lib/citations/sources';

const row = (over: Partial<ToolSource> = {}): ToolSource => ({
	id: 's1',
	message_id: 'm1',
	source_kind: 'caselaw',
	label: 'Roe v. Wade, 410 U.S. 113 (1973)',
	subtitle: 'U.S. Supreme Court · 1973',
	url: 'https://www.courtlistener.com/opinion/108713/roe-v-wade/',
	external_ref: '108713',
	provider: 'courtlistener',
	tool: 'search_case_law',
	created_at: null,
	...over
});

describe('ToolSourcesPanel', () => {
	it('renders a header with the count and one row per source', () => {
		render(ToolSourcesPanel, { sources: [row(), row({ label: 'Second', url: null })] });
		expect(screen.getByText(/Sources consulted \(2\)/i)).toBeInTheDocument();
		expect(screen.getByText('Roe v. Wade, 410 U.S. 113 (1973)')).toBeInTheDocument();
		expect(screen.getByText('U.S. Supreme Court · 1973')).toBeInTheDocument();
		// row with a url renders an external link; opens in a new tab, safely.
		const link = screen.getByRole('link', { name: /courtlistener/i });
		expect(link).toHaveAttribute('href', row().url);
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
	});

	it('renders nothing when there are no sources', () => {
		const { container } = render(ToolSourcesPanel, { sources: [] });
		expect(container.textContent?.trim()).toBe('');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ToolSourcesPanel.svelte.test.ts`
Expected: FAIL — component module missing.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/lib/components/ToolSourcesPanel.svelte -->
<script lang="ts">
	import { Scale } from '@lucide/svelte';
	import type { ToolSource } from '$lib/citations/sources';

	let { sources }: { sources: ToolSource[] } = $props();
</script>

{#if sources.length > 0}
	<div class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs">
		<p class="mb-2 flex items-center gap-1 font-medium text-mlq-text">
			<Scale size={13} aria-hidden="true" /> Sources consulted ({sources.length})
		</p>
		<ul class="space-y-2">
			{#each sources as s (s.id || s.external_ref || s.label)}
				<li>
					<span class="block font-medium text-mlq-text">{s.label}</span>
					{#if s.subtitle}<span class="block text-mlq-muted">{s.subtitle}</span>{/if}
					{#if s.url}
						<a
							href={s.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-mlq-workflow hover:underline">View on CourtListener →</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ToolSourcesPanel.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npm run lint
git add src/lib/components/ToolSourcesPanel.svelte src/lib/components/ToolSourcesPanel.svelte.test.ts
git commit -m "feat(chat): ToolSourcesPanel — case-law provenance sidecar (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the pill + panel into `Message.svelte`

**Files:**
- Modify: `src/lib/components/Message.svelte`

**Interfaces:**
- Consumes: `ChatMessage.sources` (Task 3), `ToolSourcesPanel` (Task 4).
- Produces: a footer pill `⚖ N source(s) consulted` (always visible when sources exist, regardless
  of the `provenance_pills` collapse setting) that toggles a `showSources` `$state` (default open),
  and the panel rendered after the content/citation block.

**Context:** import sits beside `CitationView` (line 3); the panel renders inside the `{:else}`
content branch after the `CitationView`/`Markdown` block (after line 147, before the streaming-cursor
span on line 148); the pill goes in the `status === 'done'` footer row (after the Copy button, line
159).

- [ ] **Step 1: Add imports + state**

In the `<script>` block, add the import beside `CitationView` (line 3) and `Scale` to the lucide
import (line 4), and add a `showSources` state (after line 25):

```ts
	import CitationView from './CitationView.svelte';
	import ToolSourcesPanel from './ToolSourcesPanel.svelte';
	import { ShieldCheck, ScrollText, Paperclip, Scale } from '@lucide/svelte';
```

```ts
	let showDetails = $state(false);
	let showSources = $state(true); // sources panel defaults open (small, high-value)
```

- [ ] **Step 2: Render the panel after the content block**

Immediately after the citation/markdown `{#if … }{:else}{/if}` block (after line 147) and before the
streaming-cursor span (line 148), add:

```svelte
		{#if message.status === 'done' && message.sources && message.sources.length > 0 && showSources}
			<ToolSourcesPanel sources={message.sources} />
		{/if}
```

- [ ] **Step 3: Add the pill to the footer row**

Inside the `{#if message.status === 'done'}` footer `<div>` (lines 152–186), after the Copy button
(line 159), add the pill — rendered whenever sources exist (NOT gated on `showPills`):

```svelte
			{#if message.sources && message.sources.length > 0}
				{@const n = message.sources.length}
				<button
					type="button"
					onclick={() => (showSources = !showSources)}
					aria-expanded={showSources}
					class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
				>
					<Scale size={11} aria-hidden="true" />
					{n} source{n === 1 ? '' : 's'} consulted
				</button>
			{/if}
```

- [ ] **Step 4: Verify (no new unit test — covered by Task 4 + the e2e)**

Run: `npm run check && npm run lint && npx vitest run`
Expected: 0/0, lint clean, full suite green. Then rebuild + eyeball:
`docker compose up -d --build donna-web` and confirm a normal (no-tool) chat turn is visually
unchanged (no pill, no panel).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Message.svelte
git commit -m "feat(chat): show the sources pill + panel on tool-consulting turns (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Part 2 — Built-in skill tool-usage note

### Task 6: `Skill` type alias + `toolUsageNote` helper

**Files:**
- Modify: `src/lib/skills/types.ts`
- Test: `src/lib/skills/toolUsage.test.ts`

**Interfaces:**
- Consumes: generated `components['schemas']['Skill']`.
- Produces:
  - `export type Skill = components['schemas']['Skill'];`
  - `toolUsageNote(skill: Pick<Skill, 'tool_usage' | 'unavailable_tool_usage'>): { text: string;
    unavailable: string[] } | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/skills/toolUsage.test.ts
import { describe, it, expect } from 'vitest';
import { toolUsageNote } from './types';

describe('toolUsageNote', () => {
	it('returns null when the skill declares no tool usage', () => {
		expect(toolUsageNote({ tool_usage: null, unavailable_tool_usage: null })).toBeNull();
		expect(toolUsageNote({ tool_usage: [], unavailable_tool_usage: [] })).toBeNull();
	});

	it('reports declared connectors when all are available', () => {
		expect(
			toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: [] })
		).toEqual({ text: 'Uses: courtlistener', unavailable: [] });
	});

	it('treats null unavailable as available (undeterminable, never an error)', () => {
		expect(
			toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: null })
		).toEqual({ text: 'Uses: courtlistener', unavailable: [] });
	});

	it('flags unavailable connectors', () => {
		expect(
			toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: ['courtlistener'] })
		).toEqual({ text: 'Uses: courtlistener', unavailable: ['courtlistener'] });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/toolUsage.test.ts`
Expected: FAIL — `toolUsageNote` not exported.

- [ ] **Step 3: Implement — append to `src/lib/skills/types.ts`**

```ts
/** The full skill-detail payload (built-in or resolved user/team skill),
 *  including the C5 tool_usage fields. Returned by /skills/{name}/contents. */
export type Skill = components['schemas']['Skill'];

/** Build the non-blocking "Uses: …" note for a skill's declared connectors (C5,
 *  PR6d). Returns null when nothing is declared. `unavailable` lists declared
 *  connectors not configured in this deployment (null ⇒ undeterminable ⇒ treated
 *  as available — informational, never gating). */
export function toolUsageNote(
	skill: Pick<Skill, 'tool_usage' | 'unavailable_tool_usage'>
): { text: string; unavailable: string[] } | null {
	const used = skill.tool_usage ?? [];
	if (used.length === 0) return null;
	return { text: `Uses: ${used.join(', ')}`, unavailable: skill.unavailable_tool_usage ?? [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/toolUsage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npm run lint
git add src/lib/skills/types.ts src/lib/skills/toolUsage.test.ts
git commit -m "feat(skills): Skill type alias + toolUsageNote helper (C5, Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `/skills/view/[name]` read-only inspector route

**Files:**
- Create: `src/routes/(app)/skills/view/[name]/+page.server.ts`
- Test: `src/routes/(app)/skills/view/[name]/page.server.test.ts`
- Create: `src/routes/(app)/skills/view/[name]/+page.svelte`

**Interfaces:**
- Consumes: `lqFetch`; `Skill` + `toolUsageNote` (Task 6); the existing `Markdown` component.
- Produces: `load` returning `{ skill: Skill }`; a read-only inspector page.

- [ ] **Step 1: Write the failing load test**

```ts
// src/routes/(app)/skills/view/[name]/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

const event = (name = 'case-law-research') => ({ params: { name } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('skill inspector load', () => {
	it('loads the full skill via the /contents endpoint', async () => {
		const skill = { name: 'case-law-research', title: 'Case-law research', tool_usage: ['courtlistener'] };
		lqFetch.mockResolvedValue(new Response(JSON.stringify(skill), { status: 200 }));
		const out = await load(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/case-law-research/contents');
		expect((out as { skill: typeof skill }).skill.title).toBe('Case-law research');
	});

	it('404s for an unknown skill', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(load(event('nope'))).rejects.toMatchObject({ status: 404 });
	});

	it('502s on a backend error', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(load(event())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/view/[name]/page.server.test.ts"`
Expected: FAIL — `./+page.server` missing.

- [ ] **Step 3: Implement the loader**

```ts
// src/routes/(app)/skills/view/[name]/+page.server.ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Skill } from '$lib/skills/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(
		event,
		`/api/v1/skills/${encodeURIComponent(event.params.name)}/contents`
	);
	if (res.status === 404) throw error(404, 'Skill not found.');
	if (!res.ok) throw error(502, 'Could not load this skill.');
	const skill = (await res.json()) as Skill;
	return { skill };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/skills/view/[name]/page.server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the inspector page**

```svelte
<!-- src/routes/(app)/skills/view/[name]/+page.svelte -->
<script lang="ts">
	import { AlertTriangle } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { toolUsageNote } from '$lib/skills/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const note = $derived(toolUsageNote(data.skill));
</script>

<svelte:head><title>{data.skill.title} — Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-sm text-mlq-muted">
		<a href="/skills" class="hover:text-mlq-text">Skills</a> › {data.skill.title}
	</nav>

	<h1 class="text-xl font-medium text-mlq-text">{data.skill.title}</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-mlq-muted">
		<span class="rounded-full border border-mlq-subtle px-2 leading-5">{data.skill.scope}</span>
		<span class="font-mono">v{data.skill.version}</span>
		{#if data.skill.author}<span>· {data.skill.author}</span>{/if}
		{#if data.skill.jurisdiction}<span>· {data.skill.jurisdiction}</span>{/if}
	</div>

	{#if data.skill.description}
		<p class="mt-3 text-sm text-mlq-text">{data.skill.description}</p>
	{/if}

	{#if note}
		{#if note.unavailable.length > 0}
			<p class="mt-3 flex items-center gap-1.5 text-xs text-mlq-caveats">
				<AlertTriangle size={13} aria-hidden="true" />
				<span>{note.text} — {note.unavailable.join(', ')} not configured in this deployment</span>
			</p>
		{:else}
			<p class="mt-3 inline-block rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-muted">
				{note.text}
			</p>
		{/if}
	{/if}

	{#if data.skill.tags?.length}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each data.skill.tags as t (t)}
				<span class="rounded-full bg-mlq-surface-alt px-2 py-0.5 text-xs text-mlq-muted">{t}</span>
			{/each}
		</div>
	{/if}

	<div class="prose prose-sm mt-6 max-w-none border-t border-mlq-subtle pt-6">
		<Markdown content={data.skill.content_md} />
	</div>
</div>
```

- [ ] **Step 6: Gate + commit**

```bash
npm run check && npm run lint && npx vitest run "src/routes/(app)/skills/view/[name]/"
git add "src/routes/(app)/skills/view/[name]/"
git commit -m "feat(skills): read-only built-in skill inspector with tool-usage note (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: "View" link on built-in skill rows

**Files:**
- Modify: `src/routes/(app)/skills/+page.svelte`

**Interfaces:**
- Consumes: the inspector route (Task 7).
- Produces: a "View" link to `/skills/view/{name}` on each built-in row, beside the Fork button.

**Context:** the built-in row is lines 73–90; the Fork button is lines 83–89. Add a "View" link
just before it.

- [ ] **Step 1: Add the link**

In `src/routes/(app)/skills/+page.svelte`, inside the built-in `<li>` (line 73), immediately before
the Fork `<button>` (line 83), add:

```svelte
						<a
							href="/skills/view/{b.name}"
							class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50"
							>View</a
						>
```

- [ ] **Step 2: Verify**

Run: `npm run check && npm run lint && npx vitest run "src/routes/(app)/skills/"`
Expected: 0/0, lint clean, the skills page tests still green.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/skills/+page.svelte"
git commit -m "feat(skills): link built-in skills to the inspector (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Live e2e + API-level chat-sources verification

**Files:**
- Create: `tests/skill-inspector.spec.ts`
- Create: `tests/chat-sources.spec.ts`

**Context:** Playwright runs live against the stack (rebuild `donna-web` first). Login helper mirrors
`tests/applied-skills.spec.ts`. `case-law-research` is present in `/skills` (built-in). The
chat-sources flow is model-nondeterministic (per Slice C): the test **self-skips** if the model
doesn't surface a source row — so the binding evidence is the API-level check + a manual screenshot
recorded in the PR.

- [ ] **Step 1: Skill inspector e2e**

```ts
// tests/skill-inspector.spec.ts
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

test('built-in skill inspector shows the case-law tool-usage note', async ({ page }) => {
	await login(page);
	await page.goto('/skills/view/case-law-research');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
	// The C5 tool-usage note names the courtlistener connector.
	await expect(page.getByText(/Uses:\s*courtlistener/i)).toBeVisible();
});

test('the skills list links a built-in skill to its inspector', async ({ page }) => {
	await login(page);
	await page.goto('/skills');
	await page.getByLabel('Search built-in skills').fill('case-law');
	const view = page.getByRole('link', { name: 'View' }).first();
	await expect(view).toBeVisible({ timeout: 10000 });
	await view.click();
	await expect(page).toHaveURL(/\/skills\/view\//);
});
```

- [ ] **Step 2: Chat-sources e2e (self-skipping)**

```ts
// tests/chat-sources.spec.ts
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

// Model-nondeterministic: the assistant may not call a case-law tool. If no
// sources pill appears within the budget, the test self-skips (the binding
// evidence is the API-level check, documented in the PR). When the pill DOES
// appear, assert the panel renders a CourtListener link.
test('case-law turn surfaces a sources pill + panel (best-effort)', async ({ page }) => {
	await login(page);
	await page.fill(
		'textarea',
		'Use the case-law research tool to find a landmark U.S. Supreme Court case on abortion, and cite it.'
	);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 60000 });

	const pill = page.getByRole('button', { name: /sources? consulted/i });
	if (!(await pill.isVisible().catch(() => false))) {
		test.skip(true, 'model did not consult a case-law tool this run — verify at the API');
		return;
	}
	await expect(page.getByText(/Sources consulted \(/i)).toBeVisible();
	await expect(page.getByRole('link', { name: /courtlistener/i }).first()).toBeVisible();
});
```

- [ ] **Step 3: Rebuild + run the e2e**

```bash
docker compose up -d --build donna-web
npx playwright test tests/skill-inspector.spec.ts tests/chat-sources.spec.ts
```
Expected: `skill-inspector` PASSES (2 tests); `chat-sources` PASSES or SKIPS.

- [ ] **Step 4: API-level chat-sources evidence (binding)**

Drive a chat turn that calls a case-law tool and confirm `/sources` returns rows. Capture the
chat id + assistant message id from the API, then:

```bash
# (run inside the e2e/browser session or via the BFF with the session cookie)
# 1) POST a message that forces a case-law tool call into a chat
# 2) GET /api/v1/chats/{chat_id}/messages/{message_id}/sources
docker compose exec -T postgres psql -U lq_ai -d lq_ai \
  -c "select source_kind, label, provider, tool from message_tool_sources order by created_at desc limit 5;"
```
Expected: at least one `caselaw` row with a `courtlistener` provider after a case-law turn. Record
the output + a UI screenshot of the pill/panel in the PR description.

- [ ] **Step 5: Commit**

```bash
git add tests/skill-inspector.spec.ts tests/chat-sources.spec.ts
git commit -m "test(e2e): skill inspector tool-usage note + chat-sources (self-skipping) (Slice D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (before the whole-branch review + PR)

- [ ] `npm run check` → 0 errors / 0 warnings.
- [ ] `npm run lint` → fully clean.
- [ ] `npx vitest run` → full suite green (≈1429 + the new tests).
- [ ] `docker compose up -d --build donna-web` then `npx playwright test tests/skill-inspector.spec.ts
      tests/chat-sources.spec.ts` → inspector green; chat-sources green-or-skip.
- [ ] API-level evidence captured (a `message_tool_sources` row + a UI screenshot of the pill/panel).
- [ ] Whole-branch Opus review (superpowers:requesting-code-review), fold fixes.
- [ ] PR with a **merge commit** (never squash). Then mirror `main` + the branch to `tucuxi`.

## Spec → task coverage map

- Part 1 data layer / parser → Task 1. BFF proxy → Task 2. Store lazy-fetch → Task 3.
  `ToolSourcesPanel` → Task 4. `Message.svelte` pill+panel → Task 5.
- Part 2 `Skill`/`toolUsageNote` → Task 6. Inspector route → Task 7. List "View" link → Task 8.
- Testing (unit/component/e2e) → folded into each task + Task 9. Honest degradation → Tasks 1, 3, 6,
  7 (drop-malformed, last-known-good, null-safe note, 404/502 loader).
- Upstream follow-ups → not code; relayed separately to LQ-AI CC (spec §Upstream follow-ups).
