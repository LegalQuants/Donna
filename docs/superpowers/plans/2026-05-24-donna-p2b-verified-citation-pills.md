# P2b — Verified Citation Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the model's `(Source: [N])` markers in assistant messages into interactive, verification-stated citation pills (underlined quote + numbered tab + click popover), fed by the live per-message citations endpoint.

**Architecture:** Keep `Markdown.svelte`'s `markdown-it → DOMPurify` pipeline authoritative; layer pills on top by transforming the _sanitized_ HTML (tag-aware regex), with event-delegated interactivity opening one shared popover. Citations are fetched by `message_id` (M2-A2 relational endpoint) for both fresh-stream (after `done`) and history (in `load`).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind v4 (`mlq-*` theme), vitest + @testing-library/svelte, Playwright. Backend: lq-ai (pinned).

**Spec:** `docs/superpowers/specs/2026-05-24-donna-p2b-verified-citation-pills-design.md`

**Conventions (from CLAUDE.md / project memory):** commit per task and push regularly; `npm run check` must be **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless — exit 0 + `0 errors 0 warnings` is the signal); icons via `@lucide/svelte`; route via `$app/state`. Run unit tests with `npx vitest run <path>`.

## File Structure

| File                                                                           | Responsibility                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/lib/citations/types.ts` (new)                                             | `Citation` type (extends generated), `CiteState`, `citeState()`, `tooltipFor()` |
| `src/lib/citations/transform.ts` (new)                                         | `hasCitationMarkers()`, `transformCitations()` — pure, no DOM                   |
| `src/lib/citations/files.ts` (new)                                             | client-side filename cache (`fileName(id)`)                                     |
| `src/lib/markdown.ts` (new)                                                    | extracted `renderMarkdown()` (markdown-it + KaTeX + DOMPurify)                  |
| `src/lib/components/Markdown.svelte` (modify)                                  | call `renderMarkdown()`                                                         |
| `src/lib/components/CitationPopover.svelte` (new)                              | anchored detail panel                                                           |
| `src/lib/components/CitationView.svelte` (new)                                 | transformed `{@html}` + delegated popover                                       |
| `src/lib/components/Message.svelte` (modify)                                   | choose `CitationView` vs `Markdown`                                             |
| `src/lib/chat/chatStream.svelte.ts` (modify)                                   | type citations; fetch on `done`; clear on retry                                 |
| `src/lib/chat/sse.ts` (modify)                                                 | stop relying on `complete.citations`                                            |
| `src/routes/(app)/chats/[id]/+page.server.ts` (modify)                         | fetch history citations in parallel                                             |
| `src/routes/(app)/chats/[id]/messages/[message_id]/citations/+server.ts` (new) | BFF citations proxy                                                             |
| `src/routes/(app)/files/[id]/+server.ts` (new)                                 | BFF filename proxy                                                              |
| `src/app.css` (modify)                                                         | citation color tokens + `.cite-*` global classes                                |
| `tests/citation-pills.spec.ts` (new)                                           | deterministic Playwright (intercepts)                                           |
| `tests/citation-live.spec.ts` (new)                                            | live-stack smoke (API-seeded chat)                                              |

---

### Task 1: Citation types & state derivation

**Files:**

- Create: `src/lib/citations/types.ts`
- Test: `src/lib/citations/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citations/types.test.ts
import { describe, it, expect } from 'vitest';
import { citeState, tooltipFor, type Citation } from './types';

const base = (over: Partial<Citation> = {}): Citation => ({
	id: 'c',
	source_file_id: 'f',
	source_text: 'x',
	partial: false,
	verified: true,
	verification_method: 'exact_match',
	verification_confidence: 1,
	...over
});

describe('citeState', () => {
	it('exact_match / tolerant_match verified → green', () => {
		expect(citeState(base({ verification_method: 'exact_match' }))).toBe('verified');
		expect(citeState(base({ verification_method: 'tolerant_match' }))).toBe('verified');
	});
	it('judge / ensemble methods → caveats (yellow)', () => {
		expect(citeState(base({ verification_method: 'paraphrase_judge' }))).toBe('caveats');
		expect(citeState(base({ verification_method: 'ensemble_majority' }))).toBe('caveats');
	});
	it('partial → caveats even if method is green', () => {
		expect(citeState(base({ verification_method: 'exact_match', partial: true }))).toBe('caveats');
	});
	it('not verified or missing → unverified', () => {
		expect(citeState(base({ verified: false }))).toBe('unverified');
		expect(citeState(undefined)).toBe('unverified');
	});
	it('verified with unknown method → green (defensive)', () => {
		expect(citeState(base({ verification_method: undefined }))).toBe('verified');
	});
});

describe('tooltipFor', () => {
	it('labels by method with confidence', () => {
		expect(
			tooltipFor(base({ verification_method: 'exact_match', verification_confidence: 1 }))
		).toBe('Verified — exact match in source (100%)');
	});
	it('paraphrase partial appends caveat', () => {
		expect(
			tooltipFor(
				base({
					verification_method: 'paraphrase_judge',
					partial: true,
					verification_confidence: 0.7
				})
			)
		).toContain('source partially supports');
	});
	it('unverified label', () => {
		expect(tooltipFor(base({ verified: false }))).toMatch(/could not confirm/i);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/citations/types.test.ts`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/citations/types.ts
import type { components } from '$lib/api/backend';

export type VerificationMethod =
	| 'exact_match'
	| 'tolerant_match'
	| 'paraphrase_judge'
	| 'ensemble_strict'
	| 'ensemble_majority';

/** The live M2-A2 citations endpoint returns more than the generated schema documents. */
export type Citation = components['schemas']['Citation'] & {
	verification_method?: VerificationMethod | (string & {});
	verification_confidence?: number | null;
};

export type CiteState = 'verified' | 'caveats' | 'unverified';

const GREEN = new Set(['exact_match', 'tolerant_match']);

/** Derive the UI state. Method drives green-vs-yellow (per citation-engine doc). */
export function citeState(c: Citation | undefined): CiteState {
	if (!c || c.verified !== true) return 'unverified';
	if (c.partial) return 'caveats';
	if (c.verification_method) return GREEN.has(c.verification_method) ? 'verified' : 'caveats';
	return 'verified'; // verified && !partial && method unknown
}

export function tooltipFor(c: Citation | undefined): string {
	if (!c || c.verified !== true) return 'Unverified — could not confirm against the source';
	const conf =
		typeof c.verification_confidence === 'number'
			? ` (${Math.round(c.verification_confidence * 100)}%)`
			: '';
	const partial = c.partial ? ' (source partially supports)' : '';
	switch (c.verification_method) {
		case 'exact_match':
			return `Verified — exact match in source${conf}`;
		case 'tolerant_match':
			return `Verified — matches source (normalized)${conf}`;
		case 'paraphrase_judge':
			return `Verified by judge — source supports this claim${conf}${partial}`;
		case 'ensemble_strict':
			return `Verified by ensemble — all judges agreed${conf}${partial}`;
		case 'ensemble_majority':
			return `Verified by ensemble — majority of judges agreed${conf}${partial}`;
		default:
			return `Verified${conf}${partial}`;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/citations/types.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/citations/types.ts src/lib/citations/types.test.ts
git commit -m "feat(p2b): citation types + state/tooltip derivation"
git push
```

---

### Task 2: Extract the markdown pipeline

**Files:**

- Create: `src/lib/markdown.ts`
- Modify: `src/lib/components/Markdown.svelte`

- [ ] **Step 1: Create the shared renderer**

```ts
// src/lib/markdown.ts
import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
import DOMPurify from 'isomorphic-dompurify';

// html:true → raw HTML passes to DOMPurify which strips dangerous tags/attrs.
// DOMPurify is the authoritative sanitizer (also covers KaTeX-emitted HTML).
const md = new MarkdownIt({ html: true, linkify: true, breaks: true }).use(katex);

/** Render markdown to sanitized HTML. */
export function renderMarkdown(content: string = ''): string {
	return DOMPurify.sanitize(md.render(content ?? ''));
}
```

- [ ] **Step 2: Update `Markdown.svelte` to use it**

Replace the entire file with:

```svelte
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let { content = '' }: { content?: string } = $props();

	const html = $derived(renderMarkdown(content));
</script>

<div class="prose-mlq">{@html html}</div>
```

- [ ] **Step 3: Run the existing Markdown test to verify no regression**

Run: `npx vitest run src/lib/components/Markdown.svelte.test.ts`
Expected: PASS (sanitization + rendering unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/markdown.ts src/lib/components/Markdown.svelte
git commit -m "refactor(p2b): extract renderMarkdown() into \$lib/markdown"
git push
```

---

### Task 3: Citation transform (tag-aware, post-sanitize)

**Files:**

- Create: `src/lib/citations/transform.ts`
- Test: `src/lib/citations/transform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citations/transform.test.ts
import { describe, it, expect } from 'vitest';
import { transformCitations, hasCitationMarkers } from './transform';
import type { Citation } from './types';

const cite = (over: Partial<Citation>): Citation => ({
	id: 'c',
	source_file_id: 'f',
	source_text: 's',
	partial: false,
	verified: true,
	verification_method: 'exact_match',
	...over
});

describe('hasCitationMarkers', () => {
	it('detects markers', () => {
		expect(hasCitationMarkers('foo "bar" (Source: [1]).')).toBe(true);
		expect(hasCitationMarkers('no markers here')).toBe(false);
	});
});

describe('transformCitations', () => {
	it('wraps the quote and converts the marker, colored by state', () => {
		const html = '<p>The term is "thirty days" (Source: [1]).</p>';
		const out = transformCitations(html, [cite({ verification_method: 'exact_match' })]);
		expect(out).toContain('cite-quote cite-verified');
		expect(out).toContain('data-cite-index="1"');
		expect(out).toContain('cite-tab cite-verified');
		expect(out).not.toContain('(Source: [1])');
	});

	it('uses caveats (yellow) for paraphrase and unverified (red) for missing', () => {
		const html = '<p>a "x" (Source: [1]) and b "y" (Source: [2]).</p>';
		const out = transformCitations(html, [cite({ verification_method: 'paraphrase_judge' })]);
		expect(out).toContain('cite-tab cite-caveats'); // [1]
		expect(out).toContain('cite-tab cite-unverified'); // [2] out of range
	});

	it('does NOT convert a marker that appears inside a tag/attribute', () => {
		const html = '<a href="/x?q=(Source:%20[1])">link</a> "q" (Source: [1])';
		const out = transformCitations(html, [cite({})]);
		// the href is untouched; only the text marker becomes a tab
		expect(out).toContain('href="/x?q=(Source:%20[1])"');
		expect((out.match(/data-cite-index="1"/g) || []).length).toBe(1);
	});

	it('falls back to a marker-only tab when the quote is split by inline markup', () => {
		const html = '<p>see <em>"the clause"</em> (Source: [1]).</p>';
		const out = transformCitations(html, [cite({})]);
		expect(out).toContain('data-cite-index="1"'); // tab present
		expect(out).not.toContain('cite-quote'); // quote not underlined (split)
	});

	it('passes through content with no markers unchanged', () => {
		const html = '<p>nothing to cite</p>';
		expect(transformCitations(html, [])).toBe(html);
	});

	it('handles repeated indices', () => {
		const html = '<p>"a" (Source: [1]) then "b" (Source: [1])</p>';
		const out = transformCitations(html, [cite({})]);
		expect((out.match(/data-cite-index="1"/g) || []).length).toBe(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/citations/transform.test.ts`
Expected: FAIL — `Cannot find module './transform'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/citations/transform.ts
import { citeState, type CiteState, type Citation } from './types';

const ANY_MARKER = /\(Source:\s*\[\d+\]\)/;
const QUOTE_MARKER = /"([^"]+)"(\s*)\(Source:\s*\[(\d+)\]\)/g;
const BARE_MARKER = /\(Source:\s*\[(\d+)\]\)/g;

export function hasCitationMarkers(content: string): boolean {
	return ANY_MARKER.test(content ?? '');
}

function tab(index: number, state: CiteState): string {
	return (
		`<span class="cite-tab cite-${state}" data-cite-index="${index}" ` +
		`role="button" tabindex="0" aria-label="Citation ${index}, ${state}">${index}</span>`
	);
}

function stateFor(citations: Citation[], index: number): CiteState {
	return citeState(citations[index - 1]);
}

/**
 * Layer citation pills onto already-sanitized markdown HTML. Tag-aware: the marker
 * regex runs only on text segments, never on tag/attribute segments. Inserts only
 * static markup + an integer index — no citation text enters the HTML.
 */
export function transformCitations(sanitizedHtml: string, citations: Citation[] = []): string {
	// Odd indices are the captured tags (<...>); even indices are text between tags.
	return sanitizedHtml
		.split(/(<[^>]+>)/)
		.map((seg, i) => {
			if (i % 2 === 1) return seg; // tag — leave untouched
			let out = seg.replace(QUOTE_MARKER, (_m, quote: string, _ws: string, n: string) => {
				const idx = Number(n);
				const state = stateFor(citations, idx);
				return `<span class="cite-quote cite-${state}">&quot;${quote}&quot;</span>${tab(idx, state)}`;
			});
			out = out.replace(BARE_MARKER, (_m, n: string) => {
				const idx = Number(n);
				return tab(idx, stateFor(citations, idx));
			});
			return out;
		})
		.join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/citations/transform.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/citations/transform.ts src/lib/citations/transform.test.ts
git commit -m "feat(p2b): tag-aware post-sanitize citation transform"
git push
```

---

### Task 4: Citation styles (tokens + global `.cite-*` classes)

**Files:**

- Modify: `src/app.css`

`{@html}` content can't use component-scoped styles, so pill styles are global.

- [ ] **Step 1: Add citation color tokens**

In `src/app.css`, inside the `@theme { … }` block, after the `--color-mlq-privileged` line (line 22), add:

```css
/* Citation pill states (P2b) */
--color-mlq-verified: #16a34a; /* green */
--color-mlq-caveats: #c9a227; /* amber — verified with caveats */
--color-mlq-unverified: #dc2626; /* red */
```

- [ ] **Step 2: Add the global `.cite-*` rules**

Append to the end of `src/app.css`:

```css
/* Verified citation pills (P2b) — rendered inside sanitized {@html}, so global. */
.cite-quote {
	border-bottom: 2px solid;
	padding-bottom: 1px;
}
.cite-quote.cite-verified {
	border-color: var(--color-mlq-verified);
}
.cite-quote.cite-caveats {
	border-color: var(--color-mlq-caveats);
}
.cite-quote.cite-unverified {
	border-color: var(--color-mlq-unverified);
	border-bottom-style: dashed;
}

.cite-tab {
	font-family: var(--font-sans);
	font-size: 0.7em;
	font-weight: 600;
	line-height: 1;
	padding: 0.1em 0.4em;
	border-radius: 4px;
	margin-left: 2px;
	position: relative;
	top: -0.35em;
	color: #fff;
	cursor: pointer;
	user-select: none;
}
.cite-tab.cite-verified {
	background: var(--color-mlq-verified);
}
.cite-tab.cite-caveats {
	background: var(--color-mlq-caveats);
}
.cite-tab.cite-unverified {
	background: var(--color-mlq-unverified);
}
.cite-tab:focus-visible {
	outline: 2px solid var(--color-mlq-strong);
	outline-offset: 1px;
}
```

- [ ] **Step 3: Verify the build still type/style-checks**

Run: `npm run check`
Expected: exit 0, `0 errors and 0 warnings` (ignore the harmless vendor `ERR_MODULE_NOT_FOUND` stderr).

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "feat(p2b): citation pill color tokens + global styles"
git push
```

---

### Task 5: Filename BFF route + client cache

**Files:**

- Create: `src/routes/(app)/files/[id]/+server.ts`
- Create: `src/lib/citations/files.ts`
- Test: `src/lib/citations/files.test.ts`

- [ ] **Step 1: Write the failing test for the cache**

```ts
// src/lib/citations/files.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileName, _resetFileCache } from './files';

afterEach(() => {
	_resetFileCache();
	vi.unstubAllGlobals();
});

describe('fileName', () => {
	it('fetches once per id and caches the result', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ filename: 'MSA.pdf' }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		expect(await fileName('abc')).toBe('MSA.pdf');
		expect(await fileName('abc')).toBe('MSA.pdf');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/files/abc');
	});

	it('returns null on a non-ok response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
		expect(await fileName('missing')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/citations/files.test.ts`
Expected: FAIL — `Cannot find module './files'`.

- [ ] **Step 3: Write the cache module**

```ts
// src/lib/citations/files.ts
// Client-side filename resolver. One in-flight/result promise per file id.
const cache = new Map<string, Promise<string | null>>();

export function fileName(id: string): Promise<string | null> {
	let p = cache.get(id);
	if (!p) {
		p = fetch(`/files/${id}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => (d && typeof d.filename === 'string' ? d.filename : null))
			.catch(() => null);
		cache.set(id, p);
	}
	return p;
}

/** Test-only: clear the cache between cases. */
export function _resetFileCache(): void {
	cache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/citations/files.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the BFF route**

```ts
// src/routes/(app)/files/[id]/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/files/${event.params.id}`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load file.');
	const file = (await res.json()) as { filename?: string; page_count?: number | null };
	return json({ filename: file.filename ?? null, page_count: file.page_count ?? null });
};
```

- [ ] **Step 6: Verify type-check**

Run: `npm run check`
Expected: exit 0, 0 errors / 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/citations/files.ts src/lib/citations/files.test.ts "src/routes/(app)/files/[id]/+server.ts"
git commit -m "feat(p2b): filename BFF proxy + client cache"
git push
```

---

### Task 6: Citations BFF route

**Files:**

- Create: `src/routes/(app)/chats/[id]/messages/[message_id]/citations/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/[message_id]/citations/server.test.ts`

- [ ] **Step 1: Write the failing test (mock `lqFetch`)**

```ts
// src/routes/(app)/chats/[id]/messages/[message_id]/citations/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { GET } from './+server';

const event = () => ({ params: { id: 'c1', message_id: 'm1' } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET citations', () => {
	it('proxies the per-message citations endpoint', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify([{ id: 'x' }]), { status: 200 }));
		const res = await GET(event());
		expect(lqFetch).toHaveBeenCalledWith(
			event().params && expect.anything(),
			'/api/v1/chats/c1/messages/m1/citations'
		);
		expect(await res.json()).toEqual([{ id: 'x' }]);
	});

	it('maps a 404 to a 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/[message_id]/citations/server.test.ts"`
Expected: FAIL — `Cannot find module './+server'`.

- [ ] **Step 3: Write the route**

```ts
// src/routes/(app)/chats/[id]/messages/[message_id]/citations/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(
		event,
		`/api/v1/chats/${event.params.id}/messages/${event.params.message_id}/citations`
	);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load citations.');
	return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/[message_id]/citations/server.test.ts"`
Expected: PASS. (If the `toHaveBeenCalledWith` event matcher is fussy, assert on the second arg only: `expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/messages/m1/citations')`.)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/messages/[message_id]/citations"
git commit -m "feat(p2b): per-message citations BFF proxy"
git push
```

---

### Task 7: `CitationPopover.svelte`

**Files:**

- Create: `src/lib/components/CitationPopover.svelte`
- Test: `src/lib/components/CitationPopover.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CitationPopover from './CitationPopover.svelte';
import { _resetFileCache } from '$lib/citations/files';
import type { Citation } from '$lib/citations/types';

afterEach(() => {
	_resetFileCache();
	vi.unstubAllGlobals();
});

const c: Citation = {
	id: 'c',
	source_file_id: 'f1',
	source_text: 'the indemnity survives',
	source_page: 14,
	partial: false,
	verified: true,
	verification_method: 'exact_match',
	verification_confidence: 1
};

describe('CitationPopover', () => {
	it('shows state label, quote, page, and resolves the filename', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response(JSON.stringify({ filename: 'MSA.pdf' }), { status: 200 }))
		);
		const { getByText, findByText } = render(CitationPopover, { props: { citation: c, index: 1 } });
		expect(getByText(/exact match/i)).toBeInTheDocument();
		expect(getByText('the indemnity survives')).toBeInTheDocument();
		expect(getByText(/Page 14/)).toBeInTheDocument();
		expect(await findByText('MSA.pdf')).toBeInTheDocument();
	});

	it('renders an empty-state when citation is undefined', () => {
		const { getByText } = render(CitationPopover, { props: { citation: undefined, index: 3 } });
		expect(getByText(/could not be matched/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/CitationPopover.svelte.test.ts`
Expected: FAIL — cannot resolve `./CitationPopover.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/components/CitationPopover.svelte -->
<script lang="ts">
	import { citeState, tooltipFor, type Citation } from '$lib/citations/types';
	import { fileName } from '$lib/citations/files';

	let { citation, index }: { citation: Citation | undefined; index: number } = $props();

	const state = $derived(citeState(citation));
	const label = $derived(tooltipFor(citation));
	let filename = $state<string | null>(null);

	$effect(() => {
		filename = null;
		const fid = citation?.source_file_id;
		if (fid) fileName(fid).then((n) => (filename = n));
	});
</script>

<div class="pop pop-{state}" role="dialog" aria-label={`Citation ${index} detail`}>
	<div class="bar">{label}</div>
	{#if citation}
		<blockquote class="quote">{citation.source_text}</blockquote>
		<div class="meta">
			{#if filename}<span>{filename}</span>{/if}
			{#if citation.source_page != null}<span>Page {citation.source_page}</span>{/if}
		</div>
	{:else}
		<p class="empty">This citation could not be matched to a source.</p>
	{/if}
	<div class="foot">
		<button type="button" disabled>Open in document →</button>
		<span class="hint">Document panel arrives in P3</span>
	</div>
</div>

<style>
	.pop {
		width: 360px;
		max-width: 88vw;
		background: var(--color-mlq-surface);
		border: 1px solid var(--color-mlq-subtle);
		border-radius: 10px;
		box-shadow: 0 8px 28px rgb(0 0 0 / 12%);
		overflow: hidden;
		font-family: var(--font-sans);
	}
	.bar {
		padding: 0.55rem 0.8rem;
		font-size: 12.5px;
		font-weight: 600;
		border-bottom: 1px solid var(--color-mlq-subtle);
	}
	.pop-verified .bar {
		background: #eef4ef;
		color: #2f6b43;
	}
	.pop-caveats .bar {
		background: #f8f3e2;
		color: #8a6d1c;
	}
	.pop-unverified .bar {
		background: #f9eae8;
		color: #a23b32;
	}
	.quote {
		font-family: var(--font-serif);
		font-size: 14px;
		color: var(--color-mlq-text);
		border-left: 3px solid var(--color-mlq-subtle);
		margin: 0.7rem 0.8rem;
		padding-left: 0.7rem;
		line-height: 1.5;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		padding: 0 0.8rem 0.7rem;
		font-size: 11.5px;
		color: var(--color-mlq-muted);
	}
	.empty {
		padding: 0.7rem 0.8rem;
		font-size: 13px;
		color: var(--color-mlq-muted);
	}
	.foot {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.8rem;
		border-top: 1px solid var(--color-mlq-subtle);
	}
	.foot button {
		font-size: 12px;
		border: 1px solid var(--color-mlq-subtle);
		background: var(--color-mlq-surface-alt);
		border-radius: 6px;
		padding: 0.25rem 0.6rem;
		color: var(--color-mlq-text);
		opacity: 0.5;
		cursor: not-allowed;
	}
	.hint {
		font-size: 10.5px;
		color: var(--color-mlq-muted);
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/CitationPopover.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/CitationPopover.svelte src/lib/components/CitationPopover.svelte.test.ts
git commit -m "feat(p2b): CitationPopover detail panel"
git push
```

---

### Task 8: `CitationView.svelte` (transformed HTML + delegated popover)

**Files:**

- Create: `src/lib/components/CitationView.svelte`
- Test: `src/lib/components/CitationView.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CitationView from './CitationView.svelte';
import { _resetFileCache } from '$lib/citations/files';
import type { Citation } from '$lib/citations/types';

afterEach(() => {
	_resetFileCache();
	vi.unstubAllGlobals();
});

const cites: Citation[] = [
	{
		id: 'c1',
		source_file_id: 'f1',
		source_text: 'thirty days notice',
		source_page: 1,
		partial: false,
		verified: true,
		verification_method: 'exact_match'
	}
];

describe('CitationView', () => {
	it('renders a colored tab and opens the popover on click; Esc closes', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response(JSON.stringify({ filename: 'A.pdf' }), { status: 200 }))
		);
		const { container, queryByRole, getByRole } = render(CitationView, {
			props: { content: 'Terminate on "thirty days" (Source: [1]).', citations: cites }
		});
		const tab = container.querySelector('.cite-tab.cite-verified') as HTMLElement;
		expect(tab).not.toBeNull();
		expect(queryByRole('dialog')).toBeNull();
		await fireEvent.click(tab);
		expect(getByRole('dialog')).toBeInTheDocument();
		await fireEvent.keyDown(container, { key: 'Escape' });
		expect(queryByRole('dialog')).toBeNull();
	});

	it('opens an unverified popover for an out-of-range marker', async () => {
		const { container, getByText } = render(CitationView, {
			props: { content: 'Claim "x" (Source: [2]).', citations: cites }
		});
		const tab = container.querySelector('.cite-tab.cite-unverified') as HTMLElement;
		expect(tab).not.toBeNull();
		await fireEvent.click(tab);
		expect(getByText(/could not be matched/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts`
Expected: FAIL — cannot resolve `./CitationView.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/components/CitationView.svelte -->
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';
	import { transformCitations } from '$lib/citations/transform';
	import CitationPopover from './CitationPopover.svelte';
	import type { Citation } from '$lib/citations/types';

	let { content = '', citations = [] }: { content?: string; citations?: Citation[] } = $props();

	const html = $derived(transformCitations(renderMarkdown(content), citations));

	let container = $state<HTMLElement | null>(null);
	let openIndex = $state<number | null>(null);
	let anchor = $state<HTMLElement | null>(null);
	let popStyle = $state('position:absolute;');

	function position() {
		if (openIndex === null || !anchor || !container) return;
		const a = anchor.getBoundingClientRect();
		const c = container.getBoundingClientRect();
		const left = Math.max(0, Math.min(a.left - c.left, c.width - 360));
		popStyle = `position:absolute;top:${a.bottom - c.top + 6}px;left:${left}px;z-index:40;`;
	}

	function openFrom(el: HTMLElement) {
		const n = Number(el.dataset.citeIndex);
		if (openIndex === n) {
			close();
			return;
		}
		openIndex = n;
		anchor = el;
		position();
	}
	function close() {
		openIndex = null;
		anchor = null;
	}

	function onClick(e: MouseEvent) {
		const t = (e.target as HTMLElement).closest('[data-cite-index]') as HTMLElement | null;
		if (t) {
			e.preventDefault();
			openFrom(t);
		} else if (openIndex !== null) close();
	}
	function onKeydown(e: KeyboardEvent) {
		const t = (e.target as HTMLElement).closest('[data-cite-index]') as HTMLElement | null;
		if (t && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			openFrom(t);
		} else if (e.key === 'Escape' && openIndex !== null) {
			const a = anchor;
			close();
			a?.focus();
		}
	}

	// Close when clicking outside the view.
	$effect(() => {
		if (openIndex === null) return;
		const handler = (e: MouseEvent) => {
			if (container && !container.contains(e.target as Node)) close();
		};
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});
</script>

<div
	bind:this={container}
	class="cite-view"
	style="position:relative"
	onkeydown={onKeydown}
	role="presentation"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- input is DOMPurify-sanitized in renderMarkdown -->
	<div class="prose-mlq" onclick={onClick} role="presentation">{@html html}</div>
	{#if openIndex !== null}
		<div style={popStyle}>
			<CitationPopover index={openIndex} citation={citations[openIndex - 1]} />
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts`
Expected: PASS. (jsdom `getBoundingClientRect` returns zeros — `position()` still runs safely; rendering/visibility assertions hold.)

- [ ] **Step 5: Type-check (catches a11y/lint warnings — must be zero)**

Run: `npm run check`
Expected: exit 0, 0 errors / 0 warnings. If svelte-check flags the `{@html}` or click-without-keyboard, the inline `role="presentation"` + the container `onkeydown` satisfy it; keep the eslint-disable comment on the `{@html}` line.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/CitationView.svelte src/lib/components/CitationView.svelte.test.ts
git commit -m "feat(p2b): CitationView with delegated single popover"
git push
```

---

### Task 9: Wire pills into `Message.svelte`

**Files:**

- Modify: `src/lib/components/Message.svelte`
- Modify: `src/lib/components/Message.svelte.test.ts`

- [ ] **Step 1: Add a failing test for the citation branch**

Append to `src/lib/components/Message.svelte.test.ts` (inside the `describe`):

```ts
it('renders citation pills for a done assistant message with citations', () => {
	const { container } = render(Message, {
		props: {
			message: {
				key: 'a2',
				id: 'a2',
				role: 'assistant',
				status: 'done',
				content: 'Terminate on "thirty days" (Source: [1]).',
				citations: [
					{
						id: 'c1',
						source_file_id: 'f1',
						source_text: 'thirty days',
						partial: false,
						verified: true,
						verification_method: 'exact_match'
					}
				]
			}
		}
	});
	expect(container.querySelector('.cite-tab.cite-verified')).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: FAIL — no `.cite-tab` (still rendered via `Markdown`).

- [ ] **Step 3: Update `Message.svelte`**

Add the import near the top of the `<script>` (after the `Markdown` import):

```ts
import CitationView from './CitationView.svelte';
import type { Citation } from '$lib/citations/types';
```

Change `ChatMessage`-typed access: the assistant render block currently is:

```svelte
{#if message.content === '' && message.status === 'streaming'}
	<span
		class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle"
		aria-label="Generating"
	></span>
{:else}
	<Markdown content={message.content} />
{/if}
```

Replace the inner `{:else} … {/if}` branch with:

```svelte
      {#if message.content === '' && message.status === 'streaming'}
        <span class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle" aria-label="Generating"></span>
      {:else if message.status === 'done' && message.citations && message.citations.length > 0}
        <CitationView content={message.content} citations={message.citations as Citation[]} />
      {:else}
        <Markdown content={message.content} />
      {/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: PASS (all cases, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(p2b): render CitationView for cited assistant messages"
git push
```

---

### Task 10: Fetch citations on stream completion (`chatStream`)

**Files:**

- Modify: `src/lib/chat/chatStream.svelte.ts`
- Modify: `src/lib/chat/sse.ts`
- Modify: `src/lib/chat/chatStream.svelte.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/lib/chat/chatStream.svelte.test.ts` (inside the `describe`):

```ts
it('fetches citations for the assistant message after completion when markers are present', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(
			streamResponse([
				'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
				'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"Terminate on \\"thirty days\\" (Source: [1])."}}\n\n',
				'data: [DONE]\n\n'
			])
		)
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify([
					{
						id: 'cit1',
						source_file_id: 'f1',
						source_text: 'thirty days',
						partial: false,
						verified: true,
						verification_method: 'exact_match'
					}
				]),
				{ status: 200 }
			)
		);
	vi.stubGlobal('fetch', fetchMock);
	const chat = createChatStream('c1');
	await chat.send('when can I terminate?');
	expect(fetchMock).toHaveBeenCalledTimes(2);
	expect(fetchMock.mock.calls[1][0]).toBe('/chats/c1/messages/a1/citations');
	expect(chat.messages[1].citations).toHaveLength(1);
	expect(chat.messages[1].citations?.[0].verification_method).toBe('exact_match');
});

it('does not fetch citations when the answer has no markers', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValue(
			streamResponse([
				'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
				'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"No citations here."}}\n\n',
				'data: [DONE]\n\n'
			])
		);
	vi.stubGlobal('fetch', fetchMock);
	const chat = createChatStream('c1');
	await chat.send('hi');
	expect(fetchMock).toHaveBeenCalledTimes(1); // SSE only
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — only one fetch call (no citations fetch yet); `citations` undefined.

- [ ] **Step 3: Update `chatStream.svelte.ts`**

3a. Update imports and the `ChatMessage.citations` type at the top:

```ts
import { createSseParser, type StreamFrame } from './sse';
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';
```

In the `ChatMessage` interface, change `citations?: unknown[];` to:

```ts
  citations?: Citation[];
```

3b. In `applyFrame`, in the `complete` branch, **remove** the line:

```ts
m.citations = frame.citations ?? [];
```

(Stop trusting the SSE frame — citations come from the dedicated endpoint.)

3c. Add a `loadCitations` helper above `runStream`:

```ts
// Citations live in the M2-A2 relational table, not the SSE complete frame.
// Fetch them by message id once the assistant turn is persisted (one retry to
// cover the persist/fetch race).
async function loadCitations(idx: number) {
	const id = messages[idx].id;
	if (!id || id === 'pending') return;
	if (!hasCitationMarkers(messages[idx].content)) return;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(`/chats/${chatId}/messages/${id}/citations`);
			if (!res.ok) return;
			const cites = (await res.json()) as Citation[];
			if (cites.length > 0 || attempt === 1) {
				messages[idx].citations = cites;
				return;
			}
		} catch {
			return;
		}
		await new Promise((r) => setTimeout(r, 400));
	}
}
```

3d. In `runStream`, after the existing success transitions (the two lines
`if (messages[idx].status === 'streaming') messages[idx].status = 'done';` and
`if (status === 'streaming') status = 'idle';`), add:

```ts
await loadCitations(idx);
```

3e. In `retry()`, before `messages[idx].status = 'streaming';`, add:

```ts
messages[idx].citations = undefined;
```

- [ ] **Step 4: Update `sse.ts` typing (leave field, mark unused)**

In `src/lib/chat/sse.ts`, in the `complete` frame type, change `citations?: unknown[];` to:

```ts
      /** Deprecated: empty under M2-A2; citations come from the per-message endpoint. */
      citations?: unknown[];
```

(Type unchanged; this is a documenting comment so a reader doesn't re-wire it.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS (existing 5 + 2 new). The pre-existing "Hello" tests have no markers, so they still issue exactly one fetch.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/sse.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(p2b): fetch citations by message id after stream completes"
git push
```

---

### Task 11: Fetch history citations in the page load

**Files:**

- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`

No new unit test (server `load` is covered by the live e2e in Task 13; the marker
predicate it relies on is already unit-tested in Task 3).

- [ ] **Step 1: Update the load**

Add imports at the top of `src/routes/(app)/chats/[id]/+page.server.ts`:

```ts
import { hasCitationMarkers } from '$lib/citations/transform';
import type { Citation } from '$lib/citations/types';
```

After the `const messages: ChatMessage[] = page.items.map(...)` block and before
`return { … }`, insert:

```ts
// Citations are served per-message (M2-A2), not inline in the messages list.
// Fetch them in parallel for assistant turns that actually contain markers.
await Promise.all(
	messages.map(async (m) => {
		if (m.role !== 'assistant' || !hasCitationMarkers(m.content)) return;
		try {
			const r = await lqFetch(event, `/api/v1/chats/${event.params.id}/messages/${m.id}/citations`);
			if (r.ok) m.citations = (await r.json()) as Citation[];
		} catch {
			/* leave undefined — message degrades to plain markers */
		}
	})
);
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: exit 0, 0 errors / 0 warnings.

- [ ] **Step 3: Full unit suite green**

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat(p2b): load history citations per message in parallel"
git push
```

---

### Task 12: Deterministic Playwright e2e (route intercepts)

Proves the full client path (transform → pills → popover → filename) against the
built app, with fixed data — the only reliable way to hit all three states + the
out-of-range edge.

**Files:**

- Create: `tests/citation-pills.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/citation-pills.spec.ts
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

// A crafted assistant turn with three states + an out-of-range marker.
const CONTENT =
	'Green "thirty days notice" (Source: [1]); ' +
	'yellow "obligations survive" (Source: [2]); ' +
	'red "unsupported claim" (Source: [3]); ' +
	'missing "no citation" (Source: [9]).';

const SSE = [
	'data: {"type":"start","lq_ai_message_id":"m_fixed","chat_id":"c"}\n\n',
	`data: {"type":"complete","lq_ai_message_id":"m_fixed","message":{"id":"m_fixed","content":${JSON.stringify(CONTENT)},"routed_inference_tier":4}}\n\n`,
	'data: [DONE]\n\n'
].join('');

const CITATIONS = [
	{
		id: 'a',
		source_file_id: 'file-1',
		source_text: 'thirty days notice',
		source_page: 1,
		verified: true,
		partial: false,
		verification_method: 'exact_match',
		verification_confidence: 1
	},
	{
		id: 'b',
		source_file_id: 'file-1',
		source_text: 'obligations survive',
		source_page: 2,
		verified: true,
		partial: true,
		verification_method: 'paraphrase_judge',
		verification_confidence: 0.7
	},
	{
		id: 'c',
		source_file_id: 'file-1',
		source_text: 'unsupported claim',
		source_page: 3,
		verified: false,
		partial: false
	}
];

test('renders three citation states and an out-of-range pill, with a working popover', async ({
	page
}) => {
	await login(page);

	// Intercept the browser-side BFF calls (SSE stream, citations, filename).
	await page.route('**/chats/*/messages', (route) =>
		route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: SSE })
	);
	await page.route('**/messages/*/citations', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CITATIONS) })
	);
	await page.route('**/files/*', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ filename: 'MSA.pdf' })
		})
	);

	await page.fill('textarea', 'cite something');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);

	// Three states render + the out-of-range marker renders unverified.
	await expect(page.locator('.cite-tab.cite-verified')).toHaveCount(1);
	await expect(page.locator('.cite-tab.cite-caveats')).toHaveCount(1);
	await expect(page.locator('.cite-tab.cite-unverified')).toHaveCount(2); // [3] + [9]

	// Click the green tab → popover with the source quote + filename.
	await page.locator('.cite-tab.cite-verified').click();
	const pop = page.getByRole('dialog');
	await expect(pop).toBeVisible();
	await expect(pop).toContainText('thirty days notice');
	await expect(pop).toContainText('MSA.pdf');
	await expect(pop).toContainText(/exact match/i);

	// Esc closes.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// The out-of-range [9] opens the "could not be matched" empty state.
	await page.locator('.cite-tab.cite-unverified').last().click();
	await expect(page.getByRole('dialog')).toContainText(/could not be matched/i);
});
```

- [ ] **Step 2: Bring the stack up and run**

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose exec -T api python -m app.cli reset-admin-password --email "$DONNA_E2E_EMAIL" --password "$DONNA_E2E_PASSWORD" --no-force-change
npx playwright test tests/citation-pills.spec.ts
```

Expected: PASS. (The chat row is created for real but its content/citations are
served from the intercepts, so the result is deterministic.)

- [ ] **Step 3: Commit**

```bash
git add tests/citation-pills.spec.ts
git commit -m "test(p2b): deterministic e2e for pill states + popover"
git push
```

---

### Task 13: Live-stack smoke (API-seeded, real backend)

Donna's UI creates project-less chats, so RAG isn't reachable through the normal
flow. This test **seeds a project-backed chat via the API** (the proven spike chain),
then loads it in the Donna UI and asserts real persisted citations render. The seeded
chat has a `project_id`, so a follow-up message also exercises the fresh-stream path live.

**Files:**

- Create: `tests/citation-live.spec.ts`

- [ ] **Step 1: Write the test (with API seeding helper)**

```ts
// tests/citation-live.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
// The lq-ai API on its shifted host port (see .env). Override if needed.
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

async function api(token: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) }
	});
}

async function seedCitedChat(): Promise<string> {
	const tok = await fetch(`${API}/auth/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD })
	})
		.then((r) => r.json())
		.then((d) => d.access_token);

	const pid = await api(tok, '/projects', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'E2E Citation Matter' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	const kid = await api(tok, '/knowledge-bases', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'E2E KB' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	await api(tok, `/projects/${pid}/knowledge-bases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ knowledge_base_id: kid })
	});

	// Upload the PDF (multipart).
	const fd = new FormData();
	fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
	const fid = await api(tok, '/files', { method: 'POST', body: fd })
		.then((r) => r.json())
		.then((d) => d.id);

	// Wait for ingestion ready.
	for (let i = 0; i < 60; i++) {
		const st = await api(tok, `/files/${fid}`)
			.then((r) => r.json())
			.then((d) => d.ingestion_status);
		if (st === 'ready') break;
		if (st === 'failed') throw new Error('ingestion failed');
		await new Promise((r) => setTimeout(r, 2000));
	}
	await api(tok, `/knowledge-bases/${kid}/files`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ file_id: fid })
	});

	// Wait for the chunk to embed (chat retrieval needs embedding IS NOT NULL).
	for (let i = 0; i < 60; i++) {
		const res = await api(tok, `/knowledge-bases/${kid}/query`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 })
		}).then((r) => r.json());
		if ((res.results ?? []).length > 0) break;
		await new Promise((r) => setTimeout(r, 2000));
	}

	// Create a project-backed chat and post a grounding message (persists a cited turn).
	const cid = await api(tok, '/chats', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'E2E cited chat', project_id: pid })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	const q = 'What is the termination-for-convenience notice period? Quote the operative clause.';
	await api(tok, `/chats/${cid}/messages`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ content: q, model: 'smart', stream: false })
	});
	return cid;
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('history load renders real verified citation pills from the live backend', async ({
	page
}) => {
	test.setTimeout(180_000);
	const cid = await seedCitedChat();
	await login(page);
	await page.goto(`/chats/${cid}`);
	await page.waitForLoadState('networkidle');

	// At least one pill renders from real persisted citations.
	const tab = page.locator('.cite-tab').first();
	await expect(tab).toBeVisible({ timeout: 15000 });

	await tab.click();
	const pop = page.getByRole('dialog');
	await expect(pop).toBeVisible();
	await expect(pop).toContainText(/\w/); // non-empty source_text
	await expect(pop).toContainText(/spike\.pdf/i); // filename resolved via /files/{id}
});
```

- [ ] **Step 2: Ensure the seed PDF exists, then run**

```bash
# Recreate the seed PDF if missing (one page with quotable clauses):
docker compose exec -T api python - <<'PY'
import fitz
d=fitz.open(); p=d.new_page()
p.insert_text((72,100),
  "MASTER SERVICES AGREEMENT\n\nSection 9. Term and Termination.\n"
  "This Agreement may be terminated by either party for convenience upon "
  "thirty (30) days prior written notice to the other party.\n\n"
  "Section 12. Indemnification.\nThe indemnification obligations of each party "
  "shall survive any expiration or earlier termination of this Agreement for "
  "a period of three (3) years.\n", fontsize=11)
d.save("/tmp/spike.pdf"); print("ok")
PY
docker compose cp api:/tmp/spike.pdf /tmp/spike.pdf

set -a; . ./.env; set +a
npx playwright test tests/citation-live.spec.ts
```

Expected: PASS — a real `cite-tab` renders, the popover shows non-empty `source_text`
and `spike.pdf`. If the model declines to quote (rare), re-run; assert is on structure,
not exact text.

- [ ] **Step 3: Commit**

```bash
git add tests/citation-live.spec.ts
git commit -m "test(p2b): live-stack smoke for real verified citation pills"
git push
```

---

### Task 14: Final verification gate

- [ ] **Step 1: Full check + unit + e2e**

```bash
npm run check
npx vitest run
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
npx playwright test
```

Expected: `npm run check` exit 0 / 0 errors 0 warnings; all vitest suites green;
both new Playwright specs + the existing P2a specs green.

- [ ] **Step 2: Commit any fixups, then proceed to finishing-a-development-branch (open the PR).**

---

## Self-Review

**Spec coverage:**

- §1 backend contract → Tasks 1 (types incl. method/confidence), 6 + 10 + 11 (per-message fetch, fresh + history). ✓
- §2 state derivation + tooltip → Task 1. ✓
- §3 visual design (treatment C, click popover, popover content) → Tasks 4 (styles), 7 (popover), 8 (view). ✓
- §4 Approach A transform → Tasks 2 (extract renderMarkdown), 3 (transform). ✓
- §5 components/files → Tasks 2,5,6,7,8,9,10,11 (every file in the table mapped). ✓
- §6 filename resolution → Task 5. ✓
- §7 error/edge cases → Task 3 (out-of-range, no-quote fallback, tag-aware), 10 (race retry), 5 (filename fail), 11 (history fail). ✓
- §9 testing (unit, deterministic, live) → Tasks 1,3,5,6,7,8 (unit), 12 (deterministic), 13 (live). ✓

**Placeholder scan:** No TBD/TODO; every code/test step has complete content. ✓

**Type consistency:** `Citation` (with `verification_method`/`verification_confidence`) defined in Task 1 and used identically in transform (Task 3), popover (7), view (8), Message (9), chatStream (10), load (11). `citeState`/`tooltipFor`/`transformCitations`/`hasCitationMarkers`/`fileName`/`renderMarkdown` signatures match across tasks. Class names `cite-quote`/`cite-tab`/`cite-{verified,caveats,unverified}` and `data-cite-index` are consistent between transform (emit), styles (Task 4), and tests/e2e (assert). ✓
