# Donna P3-2 — Citation highlight + pill-interaction rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a verified citation pill opens the document panel, jumps to the cited page, and highlights the exact quoted span (verbatim text-layer search); hovering a pill shows verification metadata; misses degrade to a sticky callout.

**Architecture:** A standalone `pdfHighlight.ts` finds the quote in the rendered PDF.js text layer (concatenate text nodes → normalize whitespace/Unicode → substring-match → DOM `Range`) and registers it via the CSS Custom Highlight API. `PdfViewer` runs it in a `$effect` keyed on the active tab's `{page, quote}` so re-navigating within an open doc re-highlights without re-rendering. `DocumentPanel` shows a "cited passage" bar (verification chip + quote + Jump / amber miss). `CitationView`'s popover moves to hover/focus; click opens the panel.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), CSS Custom Highlight API, Vitest + @testing-library/svelte, Playwright.

**Base branch note:** this work sits on `p3-2-citation-highlight`, which is stacked on the unmerged P3-1 (PR #9). Once #9 merges, reconcile the base to `main` before opening the P3-2 PR.

**Reference patterns (read before starting):**

- P3-1 substrate (final): `src/lib/docpanel/{pdfRender.ts,docPanel.svelte.ts,PdfViewer.svelte,DocumentPanel.svelte,types.ts}`.
- Citation types + UI helpers: `src/lib/citations/types.ts` (`Citation`, `citeState(c)`, `tooltipFor(c)`), `src/lib/components/CitationView.svelte` + `CitationPopover.svelte`, `src/lib/citations/files.ts` (`fileName(id)`).
- Chat-page wiring + Message: `src/routes/(app)/chats/[id]/+page.svelte:68`, `src/lib/components/Message.svelte:8,48`.
- Global stylesheet: `src/app.css` (Tailwind v4 `@theme` + plain rules; the `::highlight(cite)` rule goes here — component-scoped styles can't target `::highlight`).
- E2E pattern: `tests/citation-live.spec.ts` and `tests/document-panel.spec.ts`.

**Quality bar:** `npm run check` = 0 errors, 0 warnings. Unit: `npx vitest run`. Live e2e against the running stack (rebuild `donna-web` before the e2e — see Task 6). Annotate fixtures so literal-union types don't widen. Only add a targeted `<!-- svelte-ignore <exact_rule> -->` where a real warning fires.

---

## Task 1: `pdfHighlight.ts` — verbatim search core + highlight wrapper

**Files:**

- Create: `src/lib/docpanel/pdfHighlight.ts`
- Test: `src/lib/docpanel/pdfHighlight.test.ts`
- Modify: `src/app.css` (add the `::highlight(cite)` rule)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/docpanel/pdfHighlight.test.ts
import { describe, it, expect } from 'vitest';
import { findQuoteRange, highlightQuote, scrollCitedIntoView } from './pdfHighlight';

// Build a synthetic PDF.js-style text layer: one <span> per text run.
function layer(...runs: string[]): HTMLElement {
	const el = document.createElement('div');
	el.className = 'textLayer';
	for (const r of runs) {
		const span = document.createElement('span');
		span.textContent = r;
		el.appendChild(span);
	}
	document.body.appendChild(el); // ranges need nodes in a document
	return el;
}
function page(...runs: string[]): HTMLElement {
	const p = document.createElement('div');
	p.className = 'pdf-page';
	p.dataset.pageNumber = '1';
	p.appendChild(layer(...runs));
	document.body.appendChild(p);
	return p;
}

describe('findQuoteRange', () => {
	it('matches a quote that spans multiple text-layer spans', () => {
		const tl = layer('This Agreement may be ', 'terminated by either party.');
		const range = findQuoteRange(tl, 'Agreement may be terminated by either');
		expect(range).not.toBeNull();
		expect(range!.toString()).toBe('Agreement may be terminated by either');
	});

	it('collapses whitespace differences between quote and text layer', () => {
		const tl = layer('foo   bar baz');
		const range = findQuoteRange(tl, 'foo bar');
		expect(range).not.toBeNull();
		expect(range!.toString()).toMatch(/^foo\s+bar$/);
	});

	it('folds ligatures via NFKC (ﬁ matches "fi")', () => {
		const tl = layer('the ﬁrst clause'); // ﬁ = ﬁ
		const range = findQuoteRange(tl, 'first');
		expect(range).not.toBeNull();
		expect(range!.toString()).toBe('ﬁrst');
	});

	it('ignores soft hyphens in the source text', () => {
		const tl = layer('inter­national law'); // soft hyphen inside the word
		const range = findQuoteRange(tl, 'international');
		expect(range).not.toBeNull();
	});

	it('returns null on a genuine content mismatch', () => {
		const tl = layer('totally unrelated wording here');
		expect(findQuoteRange(tl, 'nonexistent clause')).toBeNull();
	});

	it('returns null for an empty quote', () => {
		const tl = layer('anything');
		expect(findQuoteRange(tl, '   ')).toBeNull();
	});
});

describe('highlightQuote', () => {
	it('returns "found" when the quote is located (CSS.highlights absent in jsdom is fine)', () => {
		const p = page('This Agreement may be terminated by either party.');
		expect(highlightQuote(p, 'terminated by either')).toBe('found');
	});

	it('returns "miss" when the quote is not on the page', () => {
		const p = page('Some other text entirely.');
		expect(highlightQuote(p, 'not present')).toBe('miss');
	});

	it('returns "miss" when the page has no text layer', () => {
		const p = document.createElement('div');
		p.className = 'pdf-page';
		expect(highlightQuote(p, 'anything')).toBe('miss');
	});
});

describe('scrollCitedIntoView', () => {
	it('does not throw when there is no highlight / unsupported environment (jsdom)', () => {
		expect(() => scrollCitedIntoView()).not.toThrow();
	});
});
```

> Update the import at the top of the test to include it: `import { findQuoteRange, highlightQuote, scrollCitedIntoView } from './pdfHighlight';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/pdfHighlight.test.ts`
Expected: FAIL — cannot resolve `./pdfHighlight`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/docpanel/pdfHighlight.ts
// Locate a cited quote in a rendered PDF.js text layer and highlight it via the
// CSS Custom Highlight API. Pure + DOM-only (no pdfjs import) so the search core
// unit-tests in jsdom. The text layer splits text across many <span>s, so we
// concatenate their text nodes, normalize (collapse whitespace, NFKC-fold
// ligatures, drop soft hyphens) on BOTH sides, substring-match, and map the
// normalized match back to real DOM positions to build a Range.

const HIGHLIGHT_NAME = 'cite';

/** Yield normalized characters with the raw index they came from. */
function* normalizedChars(s: string): Generator<{ ch: string; rawIndex: number }> {
	let prevSpace = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '­') continue; // soft hyphen — drop
		const folded = c.normalize('NFKC'); // ﬁ → "fi", etc.
		for (const ch0 of folded) {
			if (/\s/.test(ch0)) {
				if (prevSpace) continue; // collapse whitespace runs
				prevSpace = true;
				yield { ch: ' ', rawIndex: i };
			} else {
				prevSpace = false;
				yield { ch: ch0, rawIndex: i };
			}
		}
	}
}

function normalize(s: string): string {
	let out = '';
	for (const { ch } of normalizedChars(s)) out += ch;
	return out;
}

export function findQuoteRange(textLayerEl: HTMLElement, quote: string): Range | null {
	const qnorm = normalize(quote).trim();
	if (!qnorm) return null;

	// Collect text nodes in document order with a per-raw-char {node, offset} map.
	const walker = document.createTreeWalker(textLayerEl, NodeFilter.SHOW_TEXT);
	let raw = '';
	const nodeAt: { node: Text; offset: number }[] = [];
	let n: Node | null;
	while ((n = walker.nextNode())) {
		const t = n as Text;
		for (let i = 0; i < t.data.length; i++) nodeAt.push({ node: t, offset: i });
		raw += t.data;
	}

	// Normalized string + map from normalized index → global raw index.
	let norm = '';
	const normToRaw: number[] = [];
	for (const { ch, rawIndex } of normalizedChars(raw)) {
		norm += ch;
		normToRaw.push(rawIndex);
	}

	const idx = norm.indexOf(qnorm);
	if (idx === -1) return null;

	const start = nodeAt[normToRaw[idx]];
	const end = nodeAt[normToRaw[idx + qnorm.length - 1]];
	if (!start || !end) return null;

	const range = document.createRange();
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset + 1);
	return range;
}

function highlightsSupported(): boolean {
	return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
}

export function clearHighlight(): void {
	if (highlightsSupported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}

/**
 * Find `quote` on `pageEl`'s text layer; on success register the highlight and
 * scroll it into view; return 'found'/'miss'. Safe in jsdom / unsupported
 * browsers (highlight just isn't painted; the result still reflects the match).
 */
export function highlightQuote(pageEl: HTMLElement, quote: string): 'found' | 'miss' {
	const textLayer = pageEl.querySelector<HTMLElement>('.textLayer');
	const range = textLayer ? findQuoteRange(textLayer, quote) : null;
	clearHighlight();
	if (!range) return 'miss';
	if (highlightsSupported()) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
	range.startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
	return 'found';
}

/** Re-centre the currently-registered citation highlight (the "Jump to ¶" action). No-op if none/unsupported. */
export function scrollCitedIntoView(): void {
	if (!highlightsSupported()) return;
	const hl = CSS.highlights.get(HIGHLIGHT_NAME);
	if (!hl) return;
	for (const range of hl) {
		(range as Range).startContainer.parentElement?.scrollIntoView?.({
			block: 'center',
			behavior: 'smooth'
		});
		break;
	}
}
```

- [ ] **Step 4: Add the highlight style to `src/app.css`**

Append at the end of `src/app.css`:

```css
/* P3-2 — citation highlight (CSS Custom Highlight API). Must be a global rule;
   ::highlight() cannot be targeted from component-scoped styles. The PDF.js text
   layer renders transparent glyphs over the canvas, so this paints a yellow box
   behind the cited words. */
::highlight(cite) {
	background-color: #fff2a8;
	color: inherit;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/pdfHighlight.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Verify check is clean**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings". (If TS flags `Highlight`/`CSS.highlights`, the project's lib.dom already includes the Highlight API — confirm `target: esnext`; do not add `// @ts-expect-error`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/docpanel/pdfHighlight.ts src/lib/docpanel/pdfHighlight.test.ts src/app.css
git commit -m "feat(p3-2): pdfHighlight — verbatim text-layer search + CSS Custom Highlight"
```

---

## Task 2: Controller carries the citation + highlight status

**Files:**

- Modify: `src/lib/docpanel/types.ts`
- Modify: `src/lib/docpanel/docPanel.svelte.ts`
- Test: `src/lib/docpanel/docPanel.svelte.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append to the existing `describe('createDocPanel', …)` in `docPanel.svelte.test.ts`)

```ts
it('stores the citation and starts highlight status pending', async () => {
	const fetchFn = vi.fn().mockResolvedValue(meta());
	const dp = createDocPanel();
	const c = cite({ source_file_id: 'f1', source_text: 'clause text' });
	await dp.open(c, fetchFn);
	expect(dp.activeTab?.cite).toEqual(c);
	expect(dp.activeTab?.highlightStatus).toBe('pending');
});

it('setHighlightStatus updates the tab; re-opening (dedupe) resets it to pending', async () => {
	const fetchFn = vi.fn().mockResolvedValue(meta());
	const dp = createDocPanel();
	await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
	dp.setHighlightStatus('f1', 'found');
	expect(dp.activeTab?.highlightStatus).toBe('found');
	await dp.open(cite({ source_file_id: 'f1', source_page: 5, source_text: 'other' }), fetchFn);
	expect(dp.activeTab?.highlightStatus).toBe('pending');
});
```

> The existing `cite()` helper builds a full `Citation`; reuse it. Existing tests use `toMatchObject`, so adding fields won't break them.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts`
Expected: FAIL — `cite`/`highlightStatus`/`setHighlightStatus` don't exist yet.

- [ ] **Step 3: Update `types.ts`**

```ts
// src/lib/docpanel/types.ts
import type { Citation } from '$lib/citations/types';

export type DocTabStatus = 'loading' | 'ready' | 'error';
export type HighlightStatus = 'pending' | 'found' | 'miss';

export interface DocTab {
	fileId: string;
	filename: string;
	mime: string;
	status: DocTabStatus;
	/** 1-based page the cited span lives on. */
	page: number | null;
	/** Verbatim cited text to highlight. */
	quote: string;
	/** The citation behind this tab — drives the panel's verification chip. */
	cite: Citation;
	/** Outcome of the highlight attempt for the current {page, quote}. */
	highlightStatus: HighlightStatus;
}
```

- [ ] **Step 4: Update `docPanel.svelte.ts`**

In `open(c, fetchFn)`, the dedupe branch and the new-tab push both need the citation + status. Replace the dedupe branch and the `tabs = [...]` push:

```ts
const existing = tabs.find((t) => t.fileId === fileId);
if (existing) {
	existing.page = page;
	existing.quote = quote;
	existing.cite = c;
	existing.highlightStatus = 'pending';
	activeId = fileId;
	return;
}

tabs = [
	...tabs,
	{
		fileId,
		filename: '',
		mime: '',
		status: 'loading',
		page,
		quote,
		cite: c,
		highlightStatus: 'pending'
	}
];
activeId = fileId;
```

Add the `setHighlightStatus` method (next to `setActive`):

```ts
function setHighlightStatus(fileId: string, status: 'found' | 'miss') {
	const t = tabs.find((t) => t.fileId === fileId);
	if (t) t.highlightStatus = status;
}
```

Add it to the returned object (after `setWidth`):

```ts
(setWidth, setHighlightStatus);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/docpanel/types.ts src/lib/docpanel/docPanel.svelte.ts src/lib/docpanel/docPanel.svelte.test.ts
git commit -m "feat(p3-2): docPanel carries citation + per-tab highlight status"
```

---

## Task 3: `PdfViewer` runs the highlight reactively

**Files:**

- Modify: `src/lib/docpanel/PdfViewer.svelte`
- Test: `src/lib/docpanel/PdfViewer.svelte.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append to the existing `describe('PdfViewer', …)`)

```ts
it('highlights the cited span after render and reports the result', async () => {
	const bytes = new Uint8Array([0x25]).buffer;
	const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
	// fake renderPdf populates the container with a page + text layer
	const renderPdf = vi.fn().mockImplementation(async (container: HTMLElement) => {
		const pg = document.createElement('div');
		pg.className = 'pdf-page';
		pg.dataset.pageNumber = '2';
		const tl = document.createElement('div');
		tl.className = 'textLayer';
		pg.appendChild(tl);
		container.appendChild(pg);
		return { numPages: 3 };
	});
	const highlightQuote = vi.fn().mockReturnValue('found');
	const onhighlight = vi.fn();

	render(PdfViewer, {
		props: {
			fileId: 'f1',
			page: 2,
			quote: 'hello clause',
			fetchFn,
			renderPdf,
			highlightQuote,
			onhighlight
		}
	});

	await vi.waitFor(() => expect(highlightQuote).toHaveBeenCalled());
	const [pageElArg, quoteArg] = highlightQuote.mock.calls[0];
	expect((pageElArg as HTMLElement).dataset.pageNumber).toBe('2');
	expect(quoteArg).toBe('hello clause');
	await vi.waitFor(() => expect(onhighlight).toHaveBeenCalledWith('found'));
});

it('reports "miss" when the cited page is not present', async () => {
	const bytes = new Uint8Array([0x25]).buffer;
	const fetchFn = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
	const renderPdf = vi.fn().mockResolvedValue({ numPages: 1 }); // renders nothing
	const highlightQuote = vi.fn().mockReturnValue('found');
	const onhighlight = vi.fn();
	render(PdfViewer, {
		props: { fileId: 'f1', page: 9, quote: 'x', fetchFn, renderPdf, highlightQuote, onhighlight }
	});
	await vi.waitFor(() => expect(onhighlight).toHaveBeenCalledWith('miss'));
	expect(highlightQuote).not.toHaveBeenCalled(); // no page element → miss before calling
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/docpanel/PdfViewer.svelte.test.ts`
Expected: FAIL — `page`/`quote`/`onhighlight`/`highlightQuote` props don't exist; effect not wired.

- [ ] **Step 3: Update `PdfViewer.svelte`**

Replace the `<script>` block with:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { renderPdf as defaultRenderPdf, type RenderedPdf } from './pdfRender';
	import { highlightQuote as defaultHighlightQuote } from './pdfHighlight';

	let {
		fileId,
		page = null,
		quote = '',
		fetchFn = fetch,
		renderPdf = defaultRenderPdf,
		highlightQuote = defaultHighlightQuote,
		onhighlight
	}: {
		fileId: string;
		page?: number | null;
		quote?: string;
		fetchFn?: typeof fetch;
		renderPdf?: (container: HTMLElement, bytes: ArrayBuffer) => Promise<RenderedPdf>;
		highlightQuote?: (pageEl: HTMLElement, quote: string) => 'found' | 'miss';
		onhighlight?: (status: 'found' | 'miss') => void;
	} = $props();

	let container = $state<HTMLElement | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetchFn(`/files/${fileId}/content`);
				if (!res.ok) throw new Error(String(res.status));
				const bytes = await res.arrayBuffer();
				if (cancelled) return;
				if (!container) throw new Error('container unmounted before render');
				await renderPdf(container, bytes);
				if (!cancelled) status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// After render, locate the cited page + highlight. Re-runs when page/quote change
	// — so re-navigating within an already-open doc re-highlights without re-render.
	$effect(() => {
		if (status !== 'ready' || !container || page == null || !quote) return;
		const pageEl = container.querySelector<HTMLElement>(`.pdf-page[data-page-number="${page}"]`);
		if (!pageEl) {
			onhighlight?.('miss');
			return;
		}
		onhighlight?.(highlightQuote(pageEl, quote));
	});
</script>
```

The template (markup below `</script>`) is unchanged from P3-1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/PdfViewer.svelte.test.ts`
Expected: PASS (existing 3 + new 2). The existing tests pass no `page` → the effect early-returns, so they're unaffected.

- [ ] **Step 5: Verify check**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings".

- [ ] **Step 6: Commit**

```bash
git add src/lib/docpanel/PdfViewer.svelte src/lib/docpanel/PdfViewer.svelte.test.ts
git commit -m "feat(p3-2): PdfViewer highlights the cited span reactively after render"
```

---

## Task 4: `DocumentPanel` cited-passage bar + viewer wiring

**Files:**

- Modify: `src/lib/docpanel/DocumentPanel.svelte`
- Test: `src/lib/docpanel/DocumentPanel.svelte.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

First, the existing `stub()` helper must provide the new tab fields. Update it (the `activeTab`/`tabs` objects) to include `cite` and `highlightStatus`, and add a `setHighlightStatus` mock. At the top of the test file add a citation factory and update `stub`:

```ts
import type { Citation } from '$lib/citations/types';

const CITE: Citation = {
	id: 'c1',
	source_file_id: 'f1',
	source_page: 1,
	source_text: 'the cited clause text',
	verified: true,
	partial: false
};
const TAB = {
	fileId: 'f1',
	filename: 'spike.pdf',
	mime: 'application/pdf',
	status: 'ready',
	page: 1,
	quote: 'the cited clause text',
	cite: CITE,
	highlightStatus: 'found'
};
```

Update `stub()` so `tabs: [TAB]`, `activeTab: TAB`, and add `setHighlightStatus: vi.fn()` to the returned object (keep the existing `as unknown as DocPanel` cast). Then add tests:

```ts
it('shows the cited quote and a verified chip in the found state', () => {
	render(DocumentPanel, { props: { docPanel: stub() } });
	expect(screen.getByText(/the cited clause text/i)).toBeInTheDocument();
	expect(screen.getByText(/verified/i)).toBeInTheDocument();
});

it('shows the amber miss callout with the full quote when highlight missed', () => {
	const tab = { ...TAB, highlightStatus: 'miss' as const };
	render(DocumentPanel, { props: { docPanel: stub({ tabs: [tab], activeTab: tab }) } });
	expect(
		screen.getByText(/couldn’t pinpoint|couldn't pinpoint|cited passage on this page/i)
	).toBeInTheDocument();
	expect(screen.getByText(/the cited clause text/i)).toBeInTheDocument();
});
```

> If TypeScript objects to the `TAB`/`tab` literal types in `stub({...})`, annotate them (`const tab: DocTab = …`) — do not loosen the stub cast further. Import `DocTab` from `./types` if needed.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: FAIL — the bar markup doesn't exist yet.

- [ ] **Step 3: Update `DocumentPanel.svelte`**

Add imports at the top of `<script>`:

```svelte
import {(citeState, tooltipFor)} from '$lib/citations/types'; import {scrollCitedIntoView} from './pdfHighlight';
```

(No extra component state needed — "Jump to ¶" calls `scrollCitedIntoView()` directly, which re-centres the registered `'cite'` highlight.)

In the markup, insert the cited-passage bar **between the header `<div>…</div>` and the `<div class="relative min-h-0 flex-1">` body**, and pass the highlight props to `PdfViewer`. Replace the body block (`<div class="relative min-h-0 flex-1"> … </div>`) with:

```svelte
  {#if docPanel.activeTab && docPanel.activeTab.mime === 'application/pdf' && docPanel.activeTab.status !== 'error'}
    {@const tab = docPanel.activeTab}
    <div
      class="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] {tab.highlightStatus === 'miss' ? 'border-mlq-caveats/40 bg-mlq-caveats/10' : 'border-mlq-subtle bg-mlq-surface-alt'}"
    >
      <span
        class="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold {citeState(tab.cite) === 'verified' ? 'bg-mlq-success/15 text-mlq-success' : citeState(tab.cite) === 'caveats' ? 'bg-mlq-caveats/15 text-mlq-caveats' : 'bg-mlq-error/15 text-mlq-error'}"
        title={tooltipFor(tab.cite)}
      >
        {citeState(tab.cite) === 'verified' ? '✓ Verified' : citeState(tab.cite) === 'caveats' ? 'Caveats' : 'Unverified'}
      </span>
      {#if tab.highlightStatus === 'miss'}
        <span class="text-mlq-text">Cited passage on this page — couldn’t pinpoint the exact span. <span class="italic text-mlq-muted">“{tab.quote}”</span></span>
      {:else}
        <span class="truncate italic text-mlq-muted">“{tab.quote}”</span>
        <button
          type="button"
          onclick={() => scrollCitedIntoView()}
          class="ml-auto shrink-0 rounded-mlq-control px-1.5 py-0.5 font-medium text-mlq-workflow hover:underline"
        >
          Jump to ¶
        </button>
      {/if}
    </div>
  {/if}

  <div class="relative min-h-0 flex-1">
    {#if docPanel.activeTab}
      {#if docPanel.activeTab.status === 'error'}
        <p class="p-4 text-center text-xs text-mlq-error">Could not load this document.</p>
      {:else if docPanel.activeTab.mime === 'application/pdf'}
        {#key docPanel.activeTab.fileId}
          <PdfViewer
            fileId={docPanel.activeTab.fileId}
            page={docPanel.activeTab.page}
            quote={docPanel.activeTab.quote}
            onhighlight={(s) => docPanel.setHighlightStatus(docPanel.activeTab!.fileId, s)}
          />
        {/key}
      {:else if docPanel.activeTab.status === 'ready'}
        <!-- Non-PDF fallback card lands in P3-3. -->
        <p class="p-4 text-center text-xs text-mlq-muted">Preview not available for this file type.</p>
      {/if}
    {/if}
  </div>
```

> Note `docPanel.activeTab!.fileId` in the `onhighlight` callback — inside the `{#if … mime === 'application/pdf'}` block `activeTab` is non-null; the `!` is safe and keeps `npm run check` clean. If svelte-check dislikes `!` there, capture `{@const tab = docPanel.activeTab}` at the top of that branch and use `tab.fileId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Verify check (watch for dead svelte-ignore / unused)**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings".

- [ ] **Step 6: Commit**

```bash
git add src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/DocumentPanel.svelte.test.ts
git commit -m "feat(p3-2): cited-passage bar (verified chip + quote + jump / amber miss)"
```

---

## Task 5: Pill rework — hover/focus popover, click opens the panel

**Files:**

- Modify: `src/lib/components/CitationView.svelte`
- Modify: `src/lib/components/CitationPopover.svelte` (remove stale footer)
- Modify: `src/lib/components/Message.svelte` (rename callback)
- Modify: `src/routes/(app)/chats/[id]/+page.svelte` (rename callsite)
- Test: `src/lib/components/CitationView.svelte.test.ts` (extend/replace)

- [ ] **Step 1: Write the failing tests** — replace the body of `src/lib/components/CitationView.svelte.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CitationView from './CitationView.svelte';
import type { Citation } from '$lib/citations/types';

const citations: Citation[] = [
	{
		id: 'c1',
		source_file_id: 'f1',
		source_page: 1,
		source_text: 'cited clause',
		verified: true,
		partial: false
	}
];

describe('CitationView pill interaction', () => {
	it('opens the metadata popover on focus and not on click', async () => {
		const onactivate = vi.fn();
		const { container } = render(CitationView, {
			props: { content: 'See the clause (Source: [1]).', citations, onactivate }
		});
		const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
		expect(pill).toBeTruthy();

		// focus → popover appears
		await fireEvent.focusIn(pill);
		expect(container.querySelector('[role="dialog"]')).toBeTruthy();
	});

	it('calls onactivate on click and does NOT open the popover', async () => {
		const onactivate = vi.fn();
		const { container } = render(CitationView, {
			props: { content: 'See the clause (Source: [1]).', citations, onactivate }
		});
		const pill = container.querySelector('[data-cite-index="1"]') as HTMLElement;
		await userEvent.click(pill);
		expect(onactivate).toHaveBeenCalledWith(citations[0]);
		expect(container.querySelector('[role="dialog"]')).toBeFalsy();
	});
});
```

> If `transform.ts`'s pill syntax differs from `(Source: [1])`, match it (it produced `data-cite-index="1"` for that string in P3-1's Task 7).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts`
Expected: FAIL — `onactivate` prop doesn't exist; click still toggles popover.

- [ ] **Step 3: Rewrite `CitationView.svelte`'s `<script>` interaction**

Replace the prop declaration and the event handlers. Keep `container`, `openIndex`, `anchor`, `popStyle`, `position()`, and the `{@html}` markup. New script (replacing `onClick`/`onKeydown`/the doc-listener `$effect` and the `onopen` prop):

```svelte
  let {
    content = '',
    citations = [],
    onactivate
  }: { content?: string; citations?: Citation[]; onactivate?: (c: Citation) => void } = $props();

  let container = $state<HTMLElement | null>(null);
  let openIndex = $state<number | null>(null);
  let anchor = $state<HTMLElement | null>(null);
  let popStyle = $state('position:absolute;');
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  function position() {
    if (openIndex === null || !anchor || !container) return;
    const a = anchor.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(a.left - c.left, c.width - 360));
    popStyle = `position:absolute;top:${a.bottom - c.top + 6}px;left:${left}px;z-index:40;`;
  }

  function show(el: HTMLElement) {
    openIndex = Number(el.dataset.citeIndex);
    anchor = el;
    position();
  }
  function hide() {
    openIndex = null;
    anchor = null;
  }

  function pillOf(e: Event): HTMLElement | null {
    return (e.target as HTMLElement).closest('[data-cite-index]');
  }

  // Hover (pointer) → show after a short delay; leaving → hide.
  function onPointerOver(e: PointerEvent) {
    const t = pillOf(e);
    if (!t) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(t), 120);
  }
  function onPointerOut(e: PointerEvent) {
    if (!pillOf(e)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(hide, 120);
  }
  // Keyboard focus → show immediately; blur → hide.
  function onFocusIn(e: FocusEvent) {
    const t = pillOf(e);
    if (t) show(t);
  }
  function onFocusOut(e: FocusEvent) {
    if (pillOf(e)) hide();
  }
  // Click / Enter / Space → open the document panel (no popover toggle).
  function activate(t: HTMLElement) {
    const c = citations[Number(t.dataset.citeIndex) - 1];
    if (c) onactivate?.(c);
  }
  function onClick(e: MouseEvent) {
    const t = pillOf(e);
    if (t) { e.preventDefault(); activate(t); }
  }
  function onKeydown(e: KeyboardEvent) {
    const t = pillOf(e);
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(t); }
    else if (e.key === 'Escape' && openIndex !== null) hide();
  }
```

Update the markup's interactive wrapper to bind the new handlers (the `{@html}` div):

```svelte
<div
	class="prose-mlq"
	onclick={onClick}
	onkeydown={onKeydown}
	onpointerover={onPointerOver}
	onpointerout={onPointerOut}
	onfocusin={onFocusIn}
	onfocusout={onFocusOut}
>
	{@html html}
</div>
```

Keep the existing `<!-- svelte-ignore a11y_no_static_element_interactions -->` and the eslint-disable line above it. Keep the popover render block (`{#if openIndex !== null}…CitationPopover…`) unchanged.

- [ ] **Step 4: Remove the stale footer from `CitationPopover.svelte`**

Delete the `.foot` block from the markup:

```svelte
<div class="foot">
	<button type="button" disabled>Open in document →</button>
	<span class="hint">Document panel arrives in P3</span>
</div>
```

…and delete the now-unused `.foot`, `.foot button`, and `.hint` CSS rules in the same file. (Run `npm run check` after — Svelte flags unused selectors, which would fail the 0-warning bar.)

- [ ] **Step 5: Rename the callback through `Message.svelte` and the chat page**

In `src/lib/components/Message.svelte`: rename the prop `onopencitation` → `onactivatecitation` and pass `onactivate={onactivatecitation}` to `CitationView`:

```svelte
  let { message, onretry, onactivatecitation }: { message: ChatMessage; onretry?: () => void; onactivatecitation?: (c: Citation) => void } = $props();
```

```svelte
        <CitationView content={message.content} citations={message.citations as Citation[]} onactivate={onactivatecitation} />
```

In `src/routes/(app)/chats/[id]/+page.svelte`, rename the `<Message>` callsite prop:

```svelte
<Message message={m} onretry={retry} onactivatecitation={(c) => docPanel.open(c)} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts && npx vitest run`
Expected: the CitationView tests PASS; the full suite PASSES (no regressions from the rename).

- [ ] **Step 7: Verify check**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings" (no unused-selector warning from the removed footer; no dead svelte-ignore).

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/CitationView.svelte src/lib/components/CitationView.svelte.test.ts src/lib/components/CitationPopover.svelte src/lib/components/Message.svelte "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p3-2): pill hover=metadata / click=open panel; drop stale popover footer"
```

---

## Task 6: Live e2e — citation click highlights; hover shows metadata

**Files:**

- Create: `tests/citation-highlight.spec.ts`

**Precondition:** rebuild `donna-web` so the container serves the P3-2 build before running:
`set -a; . ./.env; set +a; docker compose up -d --build donna-web`

- [ ] **Step 1: Write the e2e** (reuses the `tests/document-panel.spec.ts` seeding flow)

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
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
		body: JSON.stringify({ name: 'E2E Highlight Matter' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	const kid = await api(tok, '/knowledge-bases', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'E2E Highlight KB' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	await api(tok, `/projects/${pid}/knowledge-bases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ knowledge_base_id: kid })
	});

	const fd = new FormData();
	fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
	const fid = await api(tok, '/files', { method: 'POST', body: fd })
		.then((r) => r.json())
		.then((d) => d.id);

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

	for (let i = 0; i < 60; i++) {
		const res = await api(tok, `/knowledge-bases/${kid}/query`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 })
		}).then((r) => r.json());
		if ((res.results ?? []).length > 0) break;
		await new Promise((r) => setTimeout(r, 2000));
	}

	const cid = await api(tok, '/chats', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'E2E highlight chat', project_id: pid })
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

test('hovering a citation shows metadata; clicking highlights the cited span', async ({ page }) => {
	test.setTimeout(180_000);
	const cid = await seedCitedChat();
	await login(page);
	await page.goto(`/chats/${cid}`);
	await page.waitForLoadState('networkidle');

	const pill = page.locator('.cite-tab').first();
	await expect(pill).toBeVisible({ timeout: 15000 });

	// Hover → metadata popover appears (and click is NOT what triggers it).
	await pill.hover();
	await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

	// Click → panel opens, cited-passage bar shows the quote, and a highlight is registered.
	await pill.click();
	const panel = page.getByRole('complementary', { name: /document panel/i });
	await expect(panel).toBeVisible({ timeout: 15000 });
	await expect(panel.getByText(/Jump to ¶|couldn’t pinpoint|couldn't pinpoint/i)).toBeVisible({
		timeout: 15000
	});

	// The CSS Custom Highlight 'cite' has at least one range (found state).
	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						(globalThis.CSS?.highlights?.get('cite') as { size?: number } | undefined)?.size ?? 0
				),
			{ timeout: 15000 }
		)
		.toBeGreaterThan(0);
});
```

> The highlight assertion proves the found path end-to-end. If the spike PDF's extracted text legitimately can't be located (miss), the bar shows the amber callout instead — but for `spike.pdf` the P3-1 spike confirmed an `exact_match` citation, so `found` is expected. If the highlight poll fails while the bar shows the miss copy, that's a real search-logic bug — investigate, don't relax the assertion.

- [ ] **Step 2: Rebuild `donna-web` and run the e2e**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/citation-highlight.spec.ts
```

Expected: PASS. Timing-sensitive (async embeddings) — re-run once if the pill never appears. A highlight-poll failure with the bar in `found` state is a real bug.

- [ ] **Step 3: Commit**

```bash
git add tests/citation-highlight.spec.ts
git commit -m "test(p3-2): live e2e — citation hover shows metadata, click highlights the span"
```

---

## Final verification (before opening the PR)

- [ ] `npm run check` → exit 0, "0 errors and 0 warnings".
- [ ] `npx vitest run` → all unit suites pass.
- [ ] `set -a; . ./.env; set +a; docker compose up -d --build donna-web && npx playwright test` → full e2e suite passes (re-run timing-sensitive citation specs once if embeddings lag).
- [ ] Manual smoke at http://localhost:13002 (a seeded project-backed cited chat): hover a pill → metadata popover; click → panel opens, page jumps, cited clause highlighted yellow; scroll away then "Jump to ¶" re-centres; click a different citation in the same doc re-highlights without a reload flash.

## Self-review notes (spec → plan coverage)

- Spec §2 CSS Custom Highlight API → Task 1 (`highlightQuote`/`CSS.highlights` + `::highlight(cite)`). ✓
- Spec §2 whitespace+Unicode normalization, no fuzzy → Task 1 (`normalizedChars`: collapse whitespace, NFKC, drop soft hyphen; substring match). ✓
- Spec §2 tap=panel/meta-in-panel → Task 4 (bar carries verification) + Task 5 (click=onactivate→open). ✓
- Spec §2 sticky cited-passage bar (yellow found / amber miss) → Task 4. ✓
- Spec §2 standalone engine → Task 1 module; called from `PdfViewer` Task 3. ✓
- Spec §3 reactive re-highlight without re-render → Task 3 (`$effect` on `{page,quote,jump}`). ✓
- Spec §3 controller carries `cite` + `highlightStatus` + `setHighlightStatus` → Task 2. ✓
- Spec §3 hover/focus popover, click-only-activate, remove stale footer, rename callback → Task 5. ✓
- Spec §4 live e2e (found highlight + hover popover) → Task 6. ✓
- Spec §6 deferrals (multi-tab, non-PDF card, content-disposition, fuzzy, keyboard-resize) → untouched, correctly out of scope.
