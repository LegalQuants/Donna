# P3-3 — Multi-tab strip + non-PDF fallback card (design)

**Date:** 2026-05-26 · **Phase:** P3-3 (last P3 slice) · **Branch off:** `main` (`d5d67b6`, pin `438198c`)

## 1. Goal

Roadmap deliverable: *"Tabbed resizable PDF.js/DOCX viewer."* P3-1/P3-2 delivered a single-doc
resizable viewer with citation highlight. P3-3 completes P3 by adding:

1. A **multi-tab strip** so several cited documents can be open at once — switch between them, close
   individual tabs.
2. A **non-PDF fallback card** replacing the bare "Preview not available" line.

The controller (`src/lib/docpanel/docPanel.svelte.ts`) is **already multi-tab-ready**
(`tabs: DocTab[]`, `activeId`, `setActive`, `close`, per-tab `cite`/`page`/`quote`/`highlightStatus`;
`open()` dedupes by `source_file_id`). So this slice is mostly **presentation in
`DocumentPanel.svelte`**, plus one byte-proxy hardening commit and a highlight-on-switch
correctness fix.

## 2. De-risk spike (done)

A throwaway spike (`.superpowers/brainstorm/p3-3-multitab-spike.mjs`, gitignored) seeded a
project + KB with **two distinct PDFs** and confirmed the multi-tab flow is e2e-able for real:

- **Single cross-topic answer → 2 citations to 2 distinct files**, both `exact_match` verified
  (`spike.pdf` termination clause + a second `spike2.pdf` limitation-of-liability clause).
- Two separate messages each citing a different file also works (fallback path, not used).

The e2e therefore uses **one cross-topic message** producing two pills that open two tabs.

## 3. Tab strip — layout A ("tabs are the top row")

The filename header row **becomes** the tab strip (no separate panel-title row).

- **Per tab:** a `<button>` showing the truncated filename (`max-width ~130px`, ellipsis) and an
  **always-visible per-tab ✕** (nested `<button aria-label="Close {filename}">`; its handler stops
  propagation so closing a tab does not also activate it). Active tab is visually raised (surface bg,
  bold text, connected to the body).
- **Panel-close ✕** pinned at the far right of the strip → `closePanel()`.
- **Overflow:** horizontal scroll, no wrap (`overflow-x:auto`, `white-space:nowrap` tabs).
- **Page number** (`p.N`) moves out of the (now-removed) header **into the cited-passage bar**, which
  still renders only for the active **PDF** tab (non-error). New bar order: `p.N` → verification chip
  → quote → "Jump to ¶".
- **Resize handle** stays on the panel's left edge (unchanged).

**Wiring:** tab click → `setActive(fileId)`; tab ✕ → `close(fileId)`; panel ✕ → `closePanel()`.
Each tab button has an accessible name (the filename); the active tab is marked
`aria-current="true"` (or equivalent) for the strip's tablist semantics.

## 4. Non-PDF fallback card — treatment A

New presentational component `src/lib/docpanel/UnsupportedFileCard.svelte` with plain props
`{ fileId: string; filename: string; mime: string }`. It replaces the bare
`<p>Preview not available…</p>` in `DocumentPanel`'s `status === 'ready'` non-PDF branch.

Renders, centered:

- a file-type **icon** with the extension overlaid (extension derived from the filename, falling back
  to a short label from the mime);
- the **filename**;
- a friendly **type line** (e.g. "Word document · can't preview here"; generic wording when the type
  is unknown);
- a primary **Download** link → `href="/files/{fileId}/content"` with the `download={filename}`
  attribute (same-origin BFF route, so the attribute names the saved file).

No backend non-PDF citation exists today (all citations are PDF; no UI file-open path until P4), so
this card is **unit-tested**, not live-e2e'd. It is reachable in the UI only once a non-PDF can be
opened (P4 territory).

## 5. content-disposition hardening (first commit)

`src/routes/(app)/files/[id]/content/+server.ts` adds **`content-disposition: attachment`** to the
response headers alongside the existing `content-type` and `x-content-type-options: nosniff`.

Rationale: the PDF viewer fetches bytes via `fetch().arrayBuffer()`, so disposition does not affect
rendering. The only consumer that *navigates* to this URL is the fallback card's download link.
Forcing `attachment` is defense-in-depth: a non-PDF such as `text/html` or SVG cannot render inline in
Donna's own origin. Covered by a server unit test asserting the header.

## 6. Highlight-on-tab-switch correctness

The CSS Custom Highlight API uses a **single global `'cite'` highlight** (`pdfHighlight.ts`). With
multiple tabs it must not bleed across documents:

- **PDF → PDF (already handled, must verify live):** `{#key activeTab.fileId}` remounts `PdfViewer`,
  whose `$effect` calls `highlightQuote`, which **clears then sets** `'cite'`. The previous doc's
  unmounted DOM means its old range is detached and unpainted; the new doc registers its own. P3-1/P3-2
  only ever had one tab, so this is **verified by the live e2e** (switch back to tab A → `'cite'` still
  registered).
- **Active tab becomes non-PDF or errored:** add a `DocumentPanel` `$effect` that calls
  `clearHighlight()` whenever the active tab is **not** a renderable PDF (no `PdfViewer` mounts to clear
  it otherwise).
- **Closing the last tab:** `close()` empties `tabs` and sets `open_ = false`; add `clearHighlight()`
  there (mirroring `closePanel()`) so no stale highlight survives a panel closed via the last per-tab ✕.

Both small fixes are in scope for this slice.

## 7. Files touched

| File | Change |
|---|---|
| `src/routes/(app)/files/[id]/content/+server.ts` | add `content-disposition: attachment` (first commit) |
| `src/lib/docpanel/docPanel.svelte.ts` | `close()` clears highlight when it empties the panel |
| `src/lib/docpanel/DocumentPanel.svelte` | tab strip (layout A); page# into cited bar; non-PDF branch → `UnsupportedFileCard`; `$effect` clears highlight when active tab not a renderable PDF |
| `src/lib/docpanel/UnsupportedFileCard.svelte` | **new** presentational card |
| `src/lib/docpanel/DocumentPanel.svelte.test.ts` | tab-strip + branch-routing tests |
| `src/lib/docpanel/UnsupportedFileCard.svelte.test.ts` | **new** card unit tests |
| `src/lib/docpanel/docPanel.svelte.test.ts` | `close()`-clears-highlight assertion |
| `src/routes/(app)/files/[id]/content/server.test.ts` | assert `content-disposition` header |
| `tests/multi-tab.spec.ts` | **new** live multi-tab e2e |

## 8. Testing

**Unit / component (vitest + jsdom, `@testing-library/svelte`):**

- Tab strip: given a controller with N tabs, renders N tab buttons (truncated filenames) + a per-tab ✕
  each + the panel ✕; the active tab carries active styling/`aria-current`; clicking a tab calls
  `setActive(id)`; clicking a tab ✕ calls `close(id)` **and not** `setActive` (propagation stopped);
  clicking the panel ✕ calls `closePanel()`. Reuse the hand-rolled stub-controller pattern already in
  `DocumentPanel.svelte.test.ts`.
- Branch routing: active tab `mime==='application/pdf'` & not error → `PdfViewer`; `status==='ready'`
  non-PDF → `UnsupportedFileCard`; `status==='error'` → error message.
- `UnsupportedFileCard`: renders filename, a type line, and a download link with
  `href="/files/{id}/content"` and `download` attribute.
- Controller: `close()` on the last tab sets `open_=false` and calls `clearHighlight()`; closing the
  active tab focuses the last remaining tab (existing dedupe/open tests stay green).
- Server: `/files/[id]/content` GET sets `content-disposition: attachment`.

CSS Custom Highlight API + `scrollIntoView` are absent in jsdom (guarded in `pdfHighlight`); assert
highlight behavior only in the live e2e via `page.evaluate(() => CSS.highlights.get('cite')?.size)`.

**Live e2e (`tests/multi-tab.spec.ts`):**

Setup regenerates both fixtures via the api container (established pattern): `/tmp/spike.pdf`
(termination/indemnification) and `/tmp/spike2.pdf` (confidentiality/limitation-of-liability). Seed a
project + KB with both PDFs, wait for ingestion + embeddings, create a project-backed chat, send the
**cross-topic** question, and fetch the assistant message's citations (2 verified pills, 2 distinct
files).

In the UI:
1. Click pill 1 → panel opens, tab for file A active, `CSS.highlights.get('cite').size > 0`.
2. Click pill 2 → a second tab appears and becomes active; highlight re-registers (size > 0).
3. Assert **two** tabs present.
4. Switch back to tab A → highlight still registered (size > 0) — proves no cross-tab bleed and that
   PDF→PDF re-highlights.
5. Close tab B via its per-tab ✕ → one tab remains.

Assert on unique controls / accessible names to avoid Playwright strict-mode multi-match. Rebuild
`donna-web` (`docker compose up -d --build donna-web`) before running — the container serves a built
image, not live `src/`.

## 9. Out of scope

- In-app DOCX/non-PDF rendering (card + download only).
- Live non-PDF citation coverage (no backend path until P4).
- Keyboard tab navigation, drag-to-reorder tabs.
- P3 polish backlog: keyboard-driven panel resize (`role="separator"` + arrow keys), the
  per-pointermove `localStorage` write on resize.

## 10. Quality bar (unchanged)

`npm run check` → **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless;
exit 0 + the "0 errors and 0 warnings" line is the signal). `npx eslint <touched files>` clean. Keep
any `svelte-ignore`/`eslint-disable` **single-targeted and on the line it suppresses**. One PR into
`main`; brainstorm → spec → plan → subagent-execute (two-stage review per task) → live e2e →
finishing-a-development-branch.
