# Donna P3-2 — Citation highlight + pill-interaction rework (design)

**Date:** 2026-05-26 · **Phase:** P3, slice 2 · **Branch base:** `main` (after P3-1 / PR #9 merges; `vendor/lq-ai` @ `438198c`)

Second slice of P3. Builds on P3-1 (the citation-driven, right-docked PDF.js panel). Delivers the headline **character-exact citation highlight** and reworks the citation-pill interaction to **hover = verification metadata / click = open + highlight in the panel** — which also retires the carried-forward P2b "popover doesn't re-anchor on scroll" bug.

Parent design: `docs/superpowers/specs/2026-05-26-donna-p3-document-panel-design.md` (decisions §2 still hold). This spec resolves the _how_ for the items that doc deferred to P3-2.

## 1. What P3-1 already provides (the substrate)

- `src/lib/docpanel/pdfRender.ts` renders each page into a `.pdf-page[data-page-number]` element containing a `<canvas>` and a `.textLayer` of absolutely-positioned `<span>`s (one per `getTextContent` item).
- `docPanel` controller (`docPanel.svelte.ts`) holds tabs; each `DocTab` already carries the pending highlight `{ page, quote }` (set from the citation's `source_page` / `source_text`).
- `PdfViewer.svelte` fetches `/files/{id}/content` and renders once on mount (`{#key fileId}`).
- `DocumentPanel.svelte` is the docked shell (resize, close, header with filename + page).
- `CitationView.svelte` fires `onopen(citation)` on pill activation **and still toggles today's click-popover** (P3-1 interim). `CitationPopover.svelte` shows verification metadata and a **stale disabled "Open in document → / Document panel arrives in P3" footer**.

## 2. Decisions (locked during the P3-2 brainstorm)

| #                         | Decision                                                                   | Choice                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlight mechanism       | How the highlight renders                                                  | **CSS Custom Highlight API** — build a DOM `Range` over the matched text nodes, register via `CSS.highlights.set('cite', new Highlight(range))` + a `::highlight(cite)` rule. No text-layer DOM mutation; trivial to replace on re-navigation. (Broadly supported by 2026; jsdom lacks it → guard + unit-test the pure range-finding.) |
| Match normalization       | How forgiving the verbatim search is                                       | **Whitespace + Unicode**, applied to BOTH the quote and the text-layer string: collapse whitespace runs, `normalizeUnicode` (handles ligatures e.g. `ﬁ→fi`), strip soft hyphens. Still a true substring match — **no fuzzy/partial matching**. A genuine content mismatch → miss.                                                      |
| Touch + metadata          | No hover on touch; where verification meta lives                           | **Tap = open panel** (primary action everywhere); verification metadata is surfaced **in the panel** on the cited-passage bar. Hover popover is the desktop quick-peek.                                                                                                                                                                |
| Panel surface             | How the panel shows the cited passage + verification, and degrades on miss | **Sticky "cited passage" bar** under the panel header: verification chip + truncated quote + "Jump to ¶"; **yellow** in-page highlight. On a **miss**, the same bar turns **amber** and shows the full quote ("Cited passage on this page — couldn't pinpoint the exact span"). One surface, found and miss.                           |
| Highlight engine location | Where the logic lives                                                      | **Standalone `pdfHighlight.ts`**, called reactively from `PdfViewer` (not baked into `pdfRender`, so re-highlight needs no re-render).                                                                                                                                                                                                 |

## 3. Architecture

### New module — `src/lib/docpanel/pdfHighlight.ts`

- **`findQuoteRange(textLayerEl: HTMLElement, quote: string): Range | null`** — the unit-testable core. Walks the text-layer's text nodes in DOM order; builds the concatenated string plus an array mapping each _normalized_ character index back to `{ node, offsetInNode }`; normalizes the quote the same way; finds the quote as a substring; constructs and returns a DOM `Range` from the start node/offset to the end node/offset. Returns `null` on no match. Normalization = collapse whitespace runs to a single space + `normalizeUnicode` + strip soft hyphens (`­`), with the index map tracking the original node offsets so the `Range` lands on the real DOM.
- **`highlightQuote(pageEl: HTMLElement, quote: string): 'found' | 'miss'`** — thin wrapper: `findQuoteRange` on the page's `.textLayer`; on a range, register `CSS.highlights.set('cite', new Highlight(range))` and `range.startContainer.parentElement?.scrollIntoView({ block: 'center' })`, return `'found'`; else clear the `'cite'` highlight and return `'miss'`. Guards `typeof CSS !== 'undefined' && CSS.highlights` (absent in jsdom / unsupported browsers → behaves as miss-without-throw; the bar still shows the quote).
- A `::highlight(cite)` style rule (yellow: `background: #fff2a8`) added to the app stylesheet / panel scope.

### `docPanel` controller (`docPanel.svelte.ts`) — extensions

- `DocTab` gains `cite: Citation` (so the bar renders the verification chip via existing `citeState`/`tooltipFor`) and `highlightStatus: 'pending' | 'found' | 'miss'` (default `'pending'`).
- `open(citation)` stores the whole citation on the tab (keeps `page`/`quote` derivations); on dedupe it updates `cite`/`page`/`quote` and resets `highlightStatus` to `'pending'`.
- New method `setHighlightStatus(fileId: string, status: 'found' | 'miss')` — the viewer reports the outcome; the bar reads `activeTab.highlightStatus`. Per-tab, so it survives tab switches (P3-3-ready).

### `PdfViewer.svelte` — reactive highlight

- Receives the active `{ page, quote }` (props) plus a `report: (status) => void` callback (wired to `docPanel.setHighlightStatus`).
- Tracks a `rendered` flag (set when `renderPdf` resolves). An `$effect` keyed on `{ rendered, page, quote }` runs once rendered: locate `container.querySelector('.pdf-page[data-page-number="' + page + '"] .textLayer')`, call `highlightQuote(pageEl, quote)`, and `report(result)`. Re-runs when `{ page, quote }` change → same-doc re-navigation re-highlights **without** re-fetch/re-render. `highlightQuote` is an injectable prop (default the real one) for unit-testing the wiring.

### `DocumentPanel.svelte` — cited-passage bar

- Renders a sticky bar below the header from `activeTab`:
  - `highlightStatus !== 'miss'`: verification chip (label/colour from `citeState(cite)` + `tooltipFor(cite)`), the quote truncated to one line, and a "Jump to ¶" control that re-scrolls the current `'cite'` highlight into view.
  - `highlightStatus === 'miss'`: amber variant, full quote, "Cited passage on this page — couldn't pinpoint the exact span."
- "Jump to ¶" re-centres the highlight (re-run scroll-into-view on the registered range, or re-call the locate+scroll path).

### `CitationView.svelte` / `CitationPopover.svelte` — pill rework

- Popover becomes **hover/focus-driven**: `pointerenter`/`focusin` on a pill opens the popover (short ~120ms open delay to avoid flicker on pass-through); `pointerleave`/`focusout`/`Escape` closes it. Because it's ephemeral and re-derived from the hovered pill, the P2b "doesn't re-anchor on scroll" bug is gone (the persistent click-anchored popover is removed).
- **Click / Enter / Space** now _only_ calls `onactivate(citation)` (rename of P3-1's `onopen`) → opens the panel. It no longer toggles the popover.
- `CitationPopover` loses the stale disabled footer ("Open in document → / Document panel arrives in P3"); it is now purely the verification read-out.
- `Message.svelte` prop renamed `onopencitation` → `onactivatecitation` (and the chat page callsite) to match, or kept as-is if churn isn't worth it — **decision: rename for clarity** since P3-2 is the moment the semantics settle.

### Data flow

hover pill → ephemeral `CitationPopover` (verification meta). click pill → `onactivate(citation)` → `docPanel.open(citation)` (tab carries `cite`/`page`/`quote`, status `'pending'`) → `DocumentPanel` renders `PdfViewer` + bar → after render the `$effect` calls `highlightQuote` → `CSS.highlights` set + scroll, `setHighlightStatus('found')` → bar shows the verification chip; on miss → `setHighlightStatus('miss')` → amber bar with full quote. Clicking a different citation in the same open doc updates `{page, quote, cite}` and `highlightStatus='pending'` → the keyed `$effect` re-highlights without re-render.

## 4. Slice breakdown (one PR, ordered tasks)

1. **`pdfHighlight.ts` — search core + wrapper.** TDD `findQuoteRange` (synthetic text-layer spans in jsdom: multi-span match, whitespace/ligature/soft-hyphen normalization, genuine miss → null); then `highlightQuote` (guarded `CSS.highlights` + scroll). Unit-tested.
2. **Controller — carry citation + highlight status.** `DocTab` gains `cite` + `highlightStatus`; `open` stores the citation and resets status on dedupe; add `setHighlightStatus`. Unit-tested.
3. **`PdfViewer` — reactive highlight effect.** Active `{page, quote}` + `report` callback; `$effect` keyed on `{rendered, page, quote}`; injectable `highlightQuote`. Unit-test the wiring (effect calls the highlighter with the right page element + quote and reports the result; re-runs on quote change).
4. **`DocumentPanel` — cited-passage bar.** Found (chip + truncated quote + Jump) and miss (amber + full quote) variants from `activeTab`; "Jump to ¶" re-scrolls. Unit-tested both states.
5. **`CitationView`/`CitationPopover` rework.** Hover/focus popover; click → `onactivate` only; remove the stale footer; rename the callback through `Message` + chat page. Unit-test: hover → popover shown; click → `onactivate` fires and the popover does not open on click.
6. **Live e2e.** Click a citation → panel opens, cited-passage bar shows the **found** state, and `CSS.highlights.get('cite')` has ≥1 range (asserted via `page.evaluate`); hover a pill → metadata popover appears. Seed via the `citation-live` pattern; re-run once if embeddings haven't settled.

**Sequencing:** the search core (1) is the riskiest logic and fully unit-testable first. The popover rework (5) is independent — if P3-2 grows, it can split into its own PR — but it's small enough to ride along.

## 5. Testing

- **Unit (vitest + @testing-library/svelte):** `findQuoteRange` against synthetic span structures (the bulk of the risk); controller status transitions; `PdfViewer` effect wiring with an injected fake highlighter; `DocumentPanel` bar found/miss; `CitationView` hover-vs-click. Annotate fixtures to avoid widening literal-union types; keep `npm run check` 0/0.
- **`CSS.highlights` / `scrollIntoView`** are absent in jsdom — `highlightQuote` guards them; assertions about actual highlight rendering live in the e2e (`page.evaluate(() => CSS.highlights.get('cite')?.size)`).
- **Live e2e (Playwright):** as task 6, against the real backend.

## 6. Out of scope / follow-ups

- **Multi-tab strip UI + non-PDF `UnsupportedFileCard`** — P3-3.
- **`content-disposition` hardening** on `/files/[id]/content` — fold into P3-3's first commit (decide inline vs attachment with the fallback-card download UX).
- **Fuzzy/approximate matching** when normalized verbatim search misses — explicitly deferred; the amber callout is the miss UX.
- **Keyboard-driven panel resize** + `role="separator"` on the resize handle — P3 polish backlog (noted in P3-1 review).
- **Per-pointermove `localStorage` write** on resize — known Minor from P3-1; revisit if it causes jank.
