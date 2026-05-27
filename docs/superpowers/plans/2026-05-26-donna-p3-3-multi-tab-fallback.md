# P3-3 Multi-tab strip + non-PDF fallback card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-tab strip and a non-PDF fallback card to the document panel, completing the P3 "tabbed resizable viewer" deliverable.

**Architecture:** The rune controller (`docPanel.svelte.ts`) is already multi-tab-ready (`tabs[]`, `activeId`, `setActive`, `close`, per-tab `cite/page/quote/highlightStatus`; `open()` dedupes by `source_file_id`). This slice is mostly presentation in `DocumentPanel.svelte` (layout A: the filename header becomes a horizontally-scrolling tab strip; the page number moves into the cited-passage bar), a new presentational `UnsupportedFileCard.svelte` for non-PDF mimes, a `content-disposition: attachment` hardening on the byte proxy, and two small highlight-cleanup fixes so the single global `'cite'` highlight never bleeds across tabs.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind (`mlq-*` tokens), `@lucide/svelte` icons, Vitest + `@testing-library/svelte` (jsdom), Playwright (live e2e against the docker stack).

**Spec:** `docs/superpowers/specs/2026-05-26-donna-p3-3-multi-tab-fallback-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/(app)/files/[id]/content/+server.ts` | byte proxy — add `content-disposition: attachment` |
| `src/routes/(app)/files/[id]/content/server.test.ts` | assert the new header |
| `src/lib/docpanel/docPanel.svelte.ts` | `close()` clears the `'cite'` highlight when it empties the panel |
| `src/lib/docpanel/docPanel.svelte.test.ts` | assert close-empties-clears-highlight |
| `src/lib/docpanel/UnsupportedFileCard.svelte` | **new** presentational fallback card (filename + type + download) |
| `src/lib/docpanel/UnsupportedFileCard.svelte.test.ts` | **new** card unit tests |
| `src/lib/docpanel/DocumentPanel.svelte` | tab strip (layout A); page# into cite bar; non-PDF → card; clear-highlight `$effect` |
| `src/lib/docpanel/DocumentPanel.svelte.test.ts` | tab-strip + branch-routing tests; update the non-PDF test |
| `src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts` | **new** clear-highlight-on-non-PDF-active test (isolated mock) |
| `tests/multi-tab.spec.ts` | **new** live multi-tab e2e |

Work top-to-bottom: each task is an atomic commit. Tasks 1–3 are independent leaves; Task 4 then 5 both edit `DocumentPanel.svelte` (4 = strip, 5 = card+effect) and must run in order; Task 6 is the live e2e.

---

## Task 1: Harden the byte proxy with `content-disposition: attachment`

**Files:**
- Modify: `src/routes/(app)/files/[id]/content/+server.ts:10-17`
- Test: `src/routes/(app)/files/[id]/content/server.test.ts`

- [ ] **Step 1: Add the failing assertions**

In `server.test.ts`, add `content-disposition` to the existing "streams the upstream bytes" test and add a dedicated test. Replace the first `it(...)` block (lines 12-23) and append the new test:

```ts
  it('streams the upstream bytes through with the upstream content-type', async () => {
    const upstream = new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': '4' }
    });
    lqFetch.mockResolvedValue(upstream);
    const res = await GET(event('f1'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files/f1/content');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it('forces attachment disposition so non-PDF bytes never render inline in our origin', async () => {
    lqFetch.mockResolvedValue(new Response(new Uint8Array([0x25]), { status: 200, headers: { 'content-type': 'text/html' } }));
    const res = await GET(event('f1'));
    expect(res.headers.get('content-disposition')).toBe('attachment');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run "src/routes/(app)/files/[id]/content/server.test.ts"`
Expected: FAIL — `expected null to be 'attachment'` on the new test.

- [ ] **Step 3: Add the header**

In `+server.ts`, add the `content-disposition` line to the response headers:

```ts
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': 'attachment',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/files/[id]/content/server.test.ts"`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/files/[id]/content/+server.ts" "src/routes/(app)/files/[id]/content/server.test.ts"
git commit -m "$(cat <<'EOF'
feat(p3-3): force content-disposition attachment on the file byte proxy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `close()` clears the `'cite'` highlight when it empties the panel

The per-tab ✕ on the last tab closes the panel; unlike `closePanel()` it currently leaves the global `'cite'` highlight registered. Mirror `closePanel()`'s `clearHighlight()`.

**Files:**
- Modify: `src/lib/docpanel/docPanel.svelte.ts:72-76`
- Test: `src/lib/docpanel/docPanel.svelte.test.ts`

- [ ] **Step 1: Add the failing test**

At the top of `docPanel.svelte.test.ts`, add a module mock for `./pdfHighlight` (the controller imports `clearHighlight` from it). Insert directly after the existing imports (after line 3):

```ts
vi.mock('./pdfHighlight', () => ({ clearHighlight: vi.fn() }));
import { clearHighlight } from './pdfHighlight';
```

Add `beforeEach(() => vi.mocked(clearHighlight).mockClear());` next to the existing `beforeEach` (keep both), then add this test inside the `describe`:

```ts
  it('clears the cite highlight when closing the last tab empties the panel', async () => {
    const fetchFn = vi.fn().mockResolvedValue(meta());
    const dp = createDocPanel();
    await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
    expect(clearHighlight).not.toHaveBeenCalled();
    dp.close('f1');
    expect(dp.open_).toBe(false);
    expect(clearHighlight).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts -t "clears the cite highlight"`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Implement**

In `docPanel.svelte.ts`, update `close()`:

```ts
  function close(id: string) {
    tabs = tabs.filter((t) => t.fileId !== id);
    if (activeId === id) activeId = tabs.at(-1)?.fileId ?? null;
    if (tabs.length === 0) {
      open_ = false;
      clearHighlight();
    }
  }
```

- [ ] **Step 4: Run the full controller suite to verify green**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts`
Expected: PASS (all tests, including the existing "closes a tab; closing the last tab closes the panel").

- [ ] **Step 5: Commit**

```bash
git add src/lib/docpanel/docPanel.svelte.ts src/lib/docpanel/docPanel.svelte.test.ts
git commit -m "$(cat <<'EOF'
fix(p3-3): clear cite highlight when the last tab closes the panel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `UnsupportedFileCard.svelte` (non-PDF fallback card)

A presentational card with plain props — no controller dependency. Download styling mirrors the Receipts button in the chat page (`border border-mlq-subtle … text-mlq-text`) for codebase consistency.

**Files:**
- Create: `src/lib/docpanel/UnsupportedFileCard.svelte`
- Test: `src/lib/docpanel/UnsupportedFileCard.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/docpanel/UnsupportedFileCard.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import UnsupportedFileCard from './UnsupportedFileCard.svelte';

describe('UnsupportedFileCard', () => {
  it('renders the filename and a download link to the content route', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'terms.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } });
    expect(screen.getByText('terms.docx')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', '/files/f9/content');
    expect(link).toHaveAttribute('download', 'terms.docx');
  });

  it('shows the exact mime type for transparency', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'terms.docx', mime: 'application/vnd.ms-excel' } });
    expect(screen.getByText(/application\/vnd\.ms-excel/)).toBeInTheDocument();
  });

  it('derives the extension badge from the filename', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: 'report.final.csv', mime: 'text/csv' } });
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('falls back gracefully when filename is empty', () => {
    render(UnsupportedFileCard, { props: { fileId: 'f9', filename: '', mime: 'application/octet-stream' } });
    expect(screen.getByText('Document')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).not.toHaveAttribute('download'); // no name to suggest
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/docpanel/UnsupportedFileCard.svelte.test.ts`
Expected: FAIL — cannot resolve `./UnsupportedFileCard.svelte`.

- [ ] **Step 3: Implement the component**

Create `src/lib/docpanel/UnsupportedFileCard.svelte`:

```svelte
<script lang="ts">
  import { FileText, Download } from '@lucide/svelte';

  let { fileId, filename, mime }: { fileId: string; filename: string; mime: string } = $props();

  // Extension badge from the filename (last dot segment), capped; empty when none.
  const ext = $derived((filename.includes('.') ? (filename.split('.').pop() ?? '') : '').toUpperCase().slice(0, 5));
</script>

<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
  <div class="relative text-mlq-muted">
    <FileText size={44} strokeWidth={1.25} />
    {#if ext}
      <span class="absolute inset-x-0 bottom-1 text-[8px] font-semibold tracking-wide text-mlq-muted">{ext}</span>
    {/if}
  </div>
  <p class="max-w-full break-words text-sm font-medium text-mlq-text">{filename || 'Document'}</p>
  <p class="text-xs text-mlq-muted">
    Preview isn't available for this file type{mime ? ` (${mime})` : ''}.
  </p>
  <a
    href="/files/{fileId}/content"
    download={filename || undefined}
    class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
  >
    <Download size={14} /> Download
  </a>
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/UnsupportedFileCard.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docpanel/UnsupportedFileCard.svelte src/lib/docpanel/UnsupportedFileCard.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p3-3): UnsupportedFileCard for non-PDF document tabs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tab strip in `DocumentPanel.svelte` (layout A)

Replace the single-filename header row with a horizontally-scrolling tab strip: one tab per open doc (filename button + always-visible per-tab ✕), the panel-close ✕ pinned far right, and the resize handle kept on the left edge. Move `p.N` from the (removed) header into the cited-passage bar. The non-PDF branch and PdfViewer branch are untouched in this task (Task 5 handles them).

**Files:**
- Modify: `src/lib/docpanel/DocumentPanel.svelte:40-58` (header → strip) and `:60-87` (add `p.N` to cite bar)
- Test: `src/lib/docpanel/DocumentPanel.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `DocumentPanel.svelte.test.ts` (inside the `describe`). These use the existing `stub()`/`DocTab` helpers:

```ts
  it('renders a tab button per open document, marking the active one', () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    render(DocumentPanel, { props: { docPanel: stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 }) } });
    expect(screen.getByRole('button', { name: 'msa.pdf' })).toBeInTheDocument();
    const active = screen.getByRole('button', { name: 'nda.pdf' });
    expect(active).toHaveAttribute('aria-current', 'true');
  });

  it('clicking an inactive tab calls setActive with its fileId', async () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    const dp = stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 });
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: 'msa.pdf' }));
    expect(dp.setActive).toHaveBeenCalledWith('f1');
  });

  it('clicking a tab close button calls close (not setActive)', async () => {
    const t1: DocTab = { fileId: 'f1', filename: 'msa.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: STUB_CITE, highlightStatus: 'pending' };
    const t2: DocTab = { fileId: 'f2', filename: 'nda.pdf', mime: 'application/pdf', status: 'ready', page: 2, quote: 'y', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' };
    const dp = stub({ tabs: [t1, t2], activeId: 'f2', activeTab: t2 });
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: 'Close msa.pdf' }));
    expect(dp.close).toHaveBeenCalledWith('f1');
    expect(dp.setActive).not.toHaveBeenCalled();
  });

  it('shows the active page number in the cited-passage bar', () => {
    render(DocumentPanel, { props: { docPanel: stub() } }); // default activeTab: spike.pdf, page 1, pdf, ready
    expect(screen.getByText('p.1')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: FAIL — `Unable to find role="button" name="Close msa.pdf"` / `name="msa.pdf"` (tabs not rendered yet); the `p.1` test fails because the page number is still in the header, not the cite bar (header still renders it, so it may pass — the failing signal is the tab tests).

- [ ] **Step 3: Replace the header with the tab strip**

In `DocumentPanel.svelte`, replace the header `<div>` block (current lines 40-58) with:

```svelte
  <div class="relative flex items-center gap-1 border-b border-mlq-subtle py-1.5 pl-2 pr-1">
    <div
      class="absolute left-0 top-0 h-full w-1 cursor-col-resize"
      onpointerdown={startResize}
      aria-hidden="true"
    ></div>
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {#each docPanel.tabs as tab (tab.fileId)}
        <div
          class="flex max-w-[140px] shrink-0 items-center gap-0.5 rounded-mlq-control pl-2 pr-0.5 py-1 text-xs {tab.fileId === docPanel.activeId ? 'bg-mlq-surface-alt font-medium text-mlq-text' : 'text-mlq-muted hover:text-mlq-text'}"
        >
          <button
            type="button"
            aria-current={tab.fileId === docPanel.activeId ? 'true' : undefined}
            onclick={() => docPanel.setActive(tab.fileId)}
            class="min-w-0 truncate"
            title={tab.filename || 'Document'}
          >{tab.filename || 'Document'}</button>
          <button
            type="button"
            onclick={() => docPanel.close(tab.fileId)}
            aria-label="Close {tab.filename || 'document'}"
            class="shrink-0 rounded-mlq-control p-0.5 text-mlq-muted hover:text-mlq-text"
          >
            <X size={12} />
          </button>
        </div>
      {/each}
    </div>
    <button
      type="button"
      onclick={() => docPanel.closePanel()}
      aria-label="Close document panel"
      class="shrink-0 rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"
    >
      <X size={14} />
    </button>
  </div>
```

Note: the tab filename button and the per-tab ✕ are **sibling** buttons (not nested), so clicking ✕ does not also activate the tab — no `stopPropagation` needed.

- [ ] **Step 4: Move `p.N` into the cited-passage bar**

In the cited-passage bar block, insert the page number as the first child inside the bar `<div>` (immediately before the verification-chip `<span>`):

```svelte
      {#if tab.page}
        <span class="shrink-0 text-[10px] text-mlq-muted">p.{tab.page}</span>
      {/if}
      <span
        class="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold {cs === 'verified' ? 'bg-mlq-success/15 text-mlq-success' : cs === 'caveats' ? 'bg-mlq-caveats/15 text-mlq-caveats' : 'bg-mlq-error/15 text-mlq-error'}"
        title={tooltipFor(tab.cite)}
      >
```

(The existing chip/quote/Jump markup below it is unchanged.)

- [ ] **Step 5: Run the panel tests to verify green**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: PASS — including the existing "renders the active tab filename" (now the tab button), "calls closePanel when the close button is clicked", and the four new tests.

- [ ] **Step 6: Lint the touched component**

Run: `npx eslint src/lib/docpanel/DocumentPanel.svelte`
Expected: no errors/warnings. (If an a11y warning fires, add a single targeted `<!-- svelte-ignore <exact_rule> -->` on the offending line only — do not blanket-disable.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/DocumentPanel.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p3-3): multi-tab strip in the document panel (layout A)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire the fallback card + clear-highlight-on-non-PDF `$effect`

Replace the bare "Preview not available" paragraph with `UnsupportedFileCard`, and add a `$effect` that clears the `'cite'` highlight whenever the active tab is not a rendered PDF (no `PdfViewer` mounts to clear it otherwise).

**Files:**
- Modify: `src/lib/docpanel/DocumentPanel.svelte` (imports, body non-PDF branch, add `$effect`)
- Test: `src/lib/docpanel/DocumentPanel.svelte.test.ts` (update the non-PDF test)
- Create: `src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts`

- [ ] **Step 1: Update the existing non-PDF test to expect the card**

In `DocumentPanel.svelte.test.ts`, replace the "shows a preview-not-available message for a ready non-PDF file" test with:

```ts
  it('renders the fallback card with a download link for a ready non-PDF file', () => {
    render(DocumentPanel, {
      props: { docPanel: stub({ activeTab: { fileId: 'f2', filename: 'memo.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'ready', page: null, quote: '', cite: { ...STUB_CITE, source_file_id: 'f2' }, highlightStatus: 'pending' } }) }
    });
    expect(screen.getByText('memo.docx')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', '/files/f2/content');
  });
```

- [ ] **Step 2: Write the failing clear-highlight test (isolated mock)**

Create `src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import DocumentPanel from './DocumentPanel.svelte';
import type { DocPanel } from './docPanel.svelte';
import type { DocTab } from './types';

// Mock the highlight module so we can observe clearHighlight without a real
// CSS Custom Highlight API (absent in jsdom). highlightQuote is mocked because
// PdfViewer imports it; scrollCitedIntoView because the cite bar imports it.
vi.mock('./pdfHighlight', () => ({
  clearHighlight: vi.fn(),
  scrollCitedIntoView: vi.fn(),
  highlightQuote: vi.fn(() => 'miss')
}));
import { clearHighlight } from './pdfHighlight';

const CITE = { id: 'c1', source_file_id: 'f1', source_page: 1, source_text: 'x', verified: true, partial: false };
const tab = (over: Partial<DocTab>): DocTab => ({ fileId: 'f1', filename: 'a.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x', cite: CITE, highlightStatus: 'pending', ...over });
function stub(active: DocTab): DocPanel {
  return { open_: true, tabs: [active], activeId: active.fileId, activeTab: active, width: 480, open: vi.fn(), setActive: vi.fn(), close: vi.fn(), closePanel: vi.fn(), setWidth: vi.fn(), setHighlightStatus: vi.fn() } as unknown as DocPanel;
}

beforeEach(() => vi.mocked(clearHighlight).mockClear());

describe('DocumentPanel highlight cleanup', () => {
  it('clears the cite highlight when the active tab is a non-PDF', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ mime: 'text/plain' })) } });
    expect(clearHighlight).toHaveBeenCalled();
  });

  it('clears the cite highlight when the active tab errored', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ status: 'error' })) } });
    expect(clearHighlight).toHaveBeenCalled();
  });

  it('does NOT clear for a ready PDF active tab (PdfViewer owns the highlight)', () => {
    render(DocumentPanel, { props: { docPanel: stub(tab({ mime: 'application/pdf', status: 'ready' })) } });
    expect(clearHighlight).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run both test files to verify failures**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts`
Expected: FAIL — the card test can't find `memo.docx`/download link (still the old `<p>`); the highlight tests fail (`clearHighlight` not called / called when it shouldn't be).

- [ ] **Step 4: Implement — import the card + clearHighlight, add the effect, swap the branch**

In `DocumentPanel.svelte` `<script>`, update imports:

```ts
  import { onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import PdfViewer from './PdfViewer.svelte';
  import UnsupportedFileCard from './UnsupportedFileCard.svelte';
  import type { DocPanel } from './docPanel.svelte';
  import { citeState, tooltipFor } from '$lib/citations/types';
  import { scrollCitedIntoView, clearHighlight } from './pdfHighlight';
```

Add the effect after the `onDestroy(stopResize);` line:

```ts
  // The 'cite' highlight is a single global registration owned by the active PDF's
  // PdfViewer. When the active tab is not a rendered PDF (non-PDF mime or load
  // error), no PdfViewer is mounted to clear it — do it here so a previous tab's
  // highlight never lingers after switching.
  $effect(() => {
    const t = docPanel.activeTab;
    if (!t || t.mime !== 'application/pdf' || t.status === 'error') clearHighlight();
  });
```

Replace the body's non-PDF branch (current lines 103-106) with the card:

```svelte
      {:else if docPanel.activeTab.status === 'ready'}
        {@const tab = docPanel.activeTab}
        <UnsupportedFileCard fileId={tab.fileId} filename={tab.filename} mime={tab.mime} />
      {/if}
```

- [ ] **Step 5: Run both test files to verify green**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `npx eslint src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/UnsupportedFileCard.svelte`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/DocumentPanel.svelte.test.ts src/lib/docpanel/DocumentPanel.highlight.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p3-3): non-PDF fallback card + clear highlight when active tab isn't a PDF

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Live multi-tab e2e

Seed a project + KB with **two** distinct PDFs and a single cross-topic question that cites both (proven by the spike). Drive the UI: click each pill to open two tabs, verify the highlight tracks the active tab across a switch, and close a tab.

**Files:**
- Create: `tests/multi-tab.spec.ts`
- Fixtures: `/tmp/spike.pdf` (exists) and `/tmp/spike2.pdf` (generated in Step 2)

- [ ] **Step 1: Write the e2e spec**

Create `tests/multi-tab.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF_A = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';
const PDF_B = process.env.DONNA_SPIKE_PDF2 ?? '/tmp/spike2.pdf';

async function api(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}
const j = (token: string, path: string, init?: RequestInit) => api(token, path, init).then((r) => r.json());

async function uploadAndIngest(token: string, name: string, path: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(path)], { type: 'application/pdf' }), name);
  const fid = (await api(token, '/files', { method: 'POST', body: fd }).then((r) => r.json())).id;
  for (let i = 0; i < 60; i++) {
    const st = (await j(token, `/files/${fid}`)).ingestion_status;
    if (st === 'ready') break;
    if (st === 'failed') throw new Error(`ingestion failed for ${name}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return fid;
}

async function seedTwoFileChat(): Promise<string> {
  const tok = (await j('', '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).access_token;

  const pid = (await j(tok, '/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E Multi-tab Matter' }) })).id;
  const kid = (await j(tok, '/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E Multi-tab KB' }) })).id;
  await api(tok, `/projects/${pid}/knowledge-bases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: kid }) });

  const fidA = await uploadAndIngest(tok, 'msa.pdf', PDF_A);
  const fidB = await uploadAndIngest(tok, 'nda.pdf', PDF_B);
  await api(tok, `/knowledge-bases/${kid}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fidA }) });
  await api(tok, `/knowledge-bases/${kid}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fidB }) });

  // Wait until both topics retrieve (embeddings settled for both files).
  for (let i = 0; i < 60; i++) {
    const a = (await j(tok, `/knowledge-bases/${kid}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'termination for convenience notice', top_k: 3 }) })).results ?? [];
    const b = (await j(tok, `/knowledge-bases/${kid}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'limitation of liability cap', top_k: 3 }) })).results ?? [];
    if (a.length && b.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const cid = (await j(tok, '/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'E2E multi-tab chat', project_id: pid }) })).id;
  const q = 'Summarize this contract set: state the termination-for-convenience notice period AND the limitation-of-liability cap. Quote the operative clause for each.';
  const msg = await j(tok, `/chats/${cid}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: q, model: 'smart', stream: false }) });
  const mid = msg.id ?? msg.message?.id;
  const cites = await j(tok, `/chats/${cid}/messages/${mid}/citations`);
  const distinct = new Set((Array.isArray(cites) ? cites : (cites.citations ?? [])).map((c: { source_file_id: string }) => c.source_file_id));
  if (distinct.size < 2) throw new Error(`seed produced ${distinct.size} distinct cited files; need 2 (model variance — re-run)`);
  return cid;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

const highlightSize = (page: Page) =>
  page.evaluate(() => (globalThis.CSS?.highlights?.get('cite') as { size?: number } | undefined)?.size ?? 0);

test('opening two distinct cited files yields two tabs; the highlight tracks the active tab', async ({ page }) => {
  test.setTimeout(240_000);
  const cid = await seedTwoFileChat();
  await login(page);
  await page.goto(`/chats/${cid}`);
  await page.waitForLoadState('networkidle');

  const pills = page.locator('.cite-tab');
  await expect(pills.nth(1)).toBeVisible({ timeout: 20000 }); // at least 2 pills

  const panel = page.getByRole('complementary', { name: /document panel/i });

  // Open the first cited file.
  await pills.nth(0).click();
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

  // Open the second cited file → a second tab appears and becomes active.
  await pills.nth(1).click();
  const closeTabs = panel.getByRole('button', { name: /^Close (?!document panel).+/ });
  await expect(closeTabs).toHaveCount(2, { timeout: 15000 });
  await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

  // Switch back to the first tab (msa.pdf) → highlight re-registers for that doc.
  await panel.getByRole('button', { name: 'msa.pdf' }).click();
  await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

  // Close the nda.pdf tab → one tab remains.
  await panel.getByRole('button', { name: 'Close nda.pdf' }).click();
  await expect(closeTabs).toHaveCount(1, { timeout: 15000 });
});
```

- [ ] **Step 2: Ensure both fixtures exist, then rebuild the web container**

```bash
# spike.pdf (termination/indemnification) — recreate if missing:
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
d.save("/tmp/spike.pdf"); print("ok spike.pdf")
PY
docker compose cp api:/tmp/spike.pdf /tmp/spike.pdf

# spike2.pdf (confidentiality/limitation-of-liability) — the second distinct file:
docker compose exec -T api python - <<'PY'
import fitz
d=fitz.open(); p=d.new_page()
p.insert_text((72,100),
  "MUTUAL NONDISCLOSURE AGREEMENT\n\nSection 4. Confidentiality.\n"
  "Each party shall hold the other party's Confidential Information in strict "
  "confidence and shall not disclose it to any third party for a period of "
  "five (5) years following the date of disclosure.\n\n"
  "Section 7. Limitation of Liability.\nIn no event shall either party's aggregate "
  "liability under this Agreement exceed the total fees paid in the twelve (12) "
  "months preceding the claim.\n", fontsize=11)
d.save("/tmp/spike2.pdf"); print("ok spike2.pdf")
PY
docker compose cp api:/tmp/spike2.pdf /tmp/spike2.pdf

# Rebuild the web image so it serves the new src (REQUIRED before live e2e):
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/multi-tab.spec.ts`
Expected: PASS. (If the seed throws "produced 1 distinct cited file", the model declined to quote both — re-run; assertion logic is about structure, per the established live-citation guidance. RAG/embedding is async — pass on retry once embeddings settle.)

- [ ] **Step 4: Commit**

```bash
git add tests/multi-tab.spec.ts
git commit -m "$(cat <<'EOF'
test(p3-3): live e2e — two cited files open two tabs; highlight tracks active tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Whole-branch verification + PR

- [ ] **Step 1: Full type/lint/test sweep**

```bash
npm run check          # expect: exit 0 + "0 errors and 0 warnings" (vendor ERR_MODULE_NOT_FOUND stderr is harmless)
npx eslint src/lib/docpanel src/routes tests/multi-tab.spec.ts
npx vitest run         # full unit/component suite green
```

- [ ] **Step 2: Confirm the live e2e suite still passes end-to-end**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/document-panel.spec.ts tests/citation-highlight.spec.ts tests/multi-tab.spec.ts
```
Expected: PASS (multi-tab plus the prior panel/highlight e2e — no regressions in the single-tab flows).

- [ ] **Step 3: Open the PR** via the `superpowers:finishing-a-development-branch` skill (branch `p3-3-multi-tab-fallback` → `main`). PR body: summary, the layout-A + fallback-card decisions, the content-disposition hardening, the two highlight fixes, and the e2e evidence.

---

## Self-Review

**Spec coverage:** tab strip layout A (Task 4) ✓; non-PDF fallback card treatment A (Task 3, wired Task 5) ✓; `content-disposition: attachment` first commit (Task 1) ✓; highlight-on-tab-switch — PDF→PDF verified by e2e (Task 6), non-PDF/error clear `$effect` (Task 5), close-empties clear (Task 2) ✓; page# into cited bar (Task 4) ✓; unit + live e2e testing (all tasks + Task 6) ✓; out-of-scope items untouched ✓.

**Placeholder scan:** none — every step has concrete code/commands.

**Type/name consistency:** `setActive(id)`, `close(id)`, `closePanel()`, `clearHighlight()`, `activeTab`, `tabs`, `activeId`, `DocTab` fields (`fileId/filename/mime/status/page/quote/cite/highlightStatus`) match `docPanel.svelte.ts`/`types.ts`. Card props `{ fileId, filename, mime }` match between Task 3 component, Task 3 tests, and the Task 5 call site. The byte-proxy route `/files/{fileId}/content` matches the card link and the existing `PdfViewer` fetch path.
