# Donna P3 — Document panel + citation highlighting (design)

**Date:** 2026-05-26 · **Phase:** P3 · **Branch base:** `main` (P0–P2c-B merged; `vendor/lq-ai` @ `438198c`)

Roadmap deliverable: *"Tabbed resizable PDF.js/DOCX viewer, character-exact citation highlight."* A right-docked panel that renders a source document and highlights the exact span a verified citation points to.

## 1. Backend spike findings (verified live against the running stack)

Logged into lq-ai, pulled a real verified citation from the seeded "E2E cited chat", and fetched the referenced file. Confirmed:

- **`GET /files/{id}/content` returns the original document bytes**, renderable as-is: `content-type: application/pdf`, valid `%PDF-1.7`. For PDFs the path is PDF.js over the original bytes (not extracted text). DOCX would stream original `.docx` bytes — a different renderer.
- **A real `Citation` carries enough to *locate* a span:**
  ```json
  { "source_file_id": "…", "source_page": 1,
    "source_offset_start": 59, "source_offset_end": 166,
    "source_text": "This Agreement may be terminated by either party for convenience upon thirty (30) days prior written notice",
    "verified": true, "verification_method": "exact_match", "verification_confidence": 1.0 }
  ```
  - `source_page` → which page to show. `source_text` → the **verbatim** quote (offset span = exactly `len(source_text)`, confirmed).
  - **Catch:** `source_offset_start/end` index into the backend's PyMuPDF-extracted text, and **no endpoint returns that extracted text**. PDF.js does its own extraction with its own offsets, so citation offsets will **not** map to the PDF.js text layer.
- **Metadata is thinner than the schema advertises:** on a `ready` file, `page_count` and `character_count` came back `null`. We get page count from PDF.js directly instead. A citation gives only `source_file_id`, so we fetch `/files/{id}` metadata for `filename` + `mime_type`.

**Design consequence:** "character-exact highlight" = jump to `source_page`, **verbatim string-search `source_text` in PDF.js's text layer**, highlight the matching run. Offsets are not trustworthy against the rendered layer and are not used.

## 2. Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Entry point | What opens the viewer | **Citation-driven only** — clicking a verified citation pill is the only door. No file-browse/attach UI (that stays P4). |
| Renderers | PDF vs DOCX | **PDF now (full render + highlight); non-PDF gets a graceful "open / download" fallback card.** DOCX renderer deferred to its own slice once a DOCX-cited case exists. |
| Highlight miss | When verbatim span can't be located | **Jump to `source_page` + show the quote in a non-blocking callout** ("Cited passage on this page — couldn't pinpoint exact span"). Never feels broken. |
| Layout | Where the panel docks | **Right-docked, resizable split** — chat reflows left, document beside it, draggable divider. Tabbed (several cited docs open at once). |
| Pill behavior | Popover vs panel | **Hover/focus = ephemeral verification popover; click/Enter = open/focus the panel** on that span. Making the popover ephemeral also fixes the carried-forward P2b "popover doesn't re-anchor on scroll" bug. |
| PDF.js integration | How to embed | **`pdfjs-dist` directly, client-only, lazy-loaded; render canvas + text layer.** (Wrapper libs hide the text layer we need; canvas-only can't locate the quote.) |

## 3. Architecture

### BFF proxy routes (thin; mirror `src/routes/(app)/models/+server.ts`)
- `GET /files/[id]/+server.ts` — proxies file **metadata** JSON (for `filename` + `mime_type`). Reuses the `503/504-passthrough-else-502` gateway-error mapping.
- `GET /files/[id]/content/+server.ts` — **streams bytes through** (passes `res.body` and `Content-Type`/`Content-Disposition` along — like the SSE messages route, not `json()`).

### Feature controller — `src/lib/docpanel/docPanel.svelte.ts`
Rune controller created by the chat page; methods take an injectable `fetchFn = fetch` for unit tests. State and methods:
- State: `open: boolean`, `tabs: { fileId, filename, mime, status }[]`, `activeId`, `width` (persisted to `localStorage`), and a per-tab **pending highlight** `{ page, quote }`.
- `open(citation)` — dedupe by `source_file_id`; add or focus a tab; set pending highlight from `source_page` + `source_text`; fetch metadata to fill `filename`/`mime`.
- `setActive(id)`, `close(id)`, `closePanel()`.

### Components
- `DocumentPanel.svelte` — docked-right shell: tab strip, draggable resize divider (width → `localStorage`), close button; hosts the active renderer. Renders `PdfViewer` for `application/pdf`, else `UnsupportedFileCard`.
- `PdfViewer.svelte` — **client-only** (`{#if browser}` + dynamic `import('pdfjs-dist')`); configures the worker via Vite (`pdf.worker.min.mjs?url`); renders canvas + text layer. Given `{ page, quote }`: jumps to the page, verbatim-searches the text layer, wraps the matching run in a highlight; emits `found` / `missed`.
- `HighlightCallout.svelte` — miss-case affordance: shows the quote with "Cited passage on this page" copy.
- `UnsupportedFileCard.svelte` — non-PDF fallback: filename + download link to `/files/[id]/content`.

### Chat-page wiring (`src/routes/(app)/chats/[id]/+page.svelte`)
Mounts `DocumentPanel` as the right half of a resizable split; the message column reflows into the left half. The chat page creates the `docPanel` controller (alongside the existing `createChatStream` / `createSkillAttach` / `createEnhance`). `CitationView`/`CitationPopover` are reworked so hover/focus shows the popover and click/Enter calls `docPanel.open(citation)`.

### Data flow
click pill → `docPanel.open(citation)` → panel opens, tab activates, `/files/[id]` metadata fetched → `PdfViewer` fetches `/content`, renders, applies pending highlight → **found** highlights the span / **missed** shows `HighlightCallout`. Hover/focus pill → ephemeral `CitationPopover` (verification metadata), anchored transiently so the scroll-reanchor bug disappears.

## 4. Slice breakdown (PR-sized; mirrors the B1→B2→B3 cadence)

Each slice ends in a live e2e against the seeded cited chat.

**P3-1 — Panel shell + PDF rendering + plumbing.**
BFF proxies (`/files/[id]`, `/files/[id]/content`); add `pdfjs-dist` with worker configured; `PdfViewer.svelte` renders a PDF by `fileId` (canvas + text layer, **no highlight yet**); `DocumentPanel.svelte` docked-right with resize divider + close (single doc, no tabs yet); `docPanel` controller (`open` one doc, persist width). Interim wiring: **pill click → `docPanel.open` (panel renders)**, leaving today's popover as-is; P3-2 finalizes the hover-popover/click-panel split.
*Live e2e:* clicking the seeded citation renders `spike.pdf` in the panel.

**P3-2 — Citation-driven highlight + pill-interaction rework.**
`docPanel.open(citation)` carries `{ page, quote }`; `PdfViewer` jumps to `source_page`, verbatim-searches the text layer, highlights the run; miss → `HighlightCallout`. Rework `CitationPopover` to hover/focus (ephemeral → fixes re-anchor-on-scroll); add keyboard/focus equivalents (focus shows meta, Enter/click opens panel).
*Live e2e:* click pill → panel highlights the termination clause.

**P3-3 — Tabs + unsupported-file fallback.**
Tab strip in the panel (open several cited docs, switch, close); `UnsupportedFileCard` for non-PDF mime types.
*Live e2e:* two distinct citations → two tabs; unit-test the mime branch + card (no DOCX citation to e2e against yet).

**Sequencing rationale:** P3-1 proves the hardest unknown (PDF.js-in-SvelteKit) end-to-end first, so any worker/SSR friction is contained to the first PR; P3-2 delivers the headline character-exact highlight; P3-3 is additive.

## 5. Dependency justification (`pdfjs-dist`)
Apache-2.0, Mozilla-maintained, the de-facto standard PDF renderer; no runtime transitive deps of concern. **Lazy-loaded** via dynamic `import()` only when the panel first opens, so the ~1 MB worker stays off the chat page's critical path. `vendor/` is excluded from lint/check; the new dep lives in Donna's own `package.json`. Worker config under SvelteKit SSR is the known risk — addressed by client-only mounting and Vite `?url` worker resolution, validated by the P3-1 live e2e.

## 6. Testing
- **Unit (vitest + @testing-library/svelte):** `docPanel` controller (open/dedupe/close/active, pending-highlight wiring) with injected `fetchFn`; `DocumentPanel` tab/resize/close behavior with plain props; `UnsupportedFileCard` and the PDF-vs-fallback mime branch; BFF route tests mirroring `models/server.test.ts` (incl. byte-stream passthrough + gateway-error mapping). Annotate fixtures to avoid widening literal-union types (`npm run check` must stay 0/0).
- **Live e2e (Playwright, real backend):** per slice as above; seed via the `citation-live` pattern (project + KB + PDF + project-backed chat). Assert on unique controls / outgoing requests rather than ambiguous text (strict-mode multi-match has bitten before).
- **Quality bar:** `npm run check` = 0 errors, 0 warnings; only targeted `<!-- svelte-ignore <exact_rule> -->` where a real warning fires.

## 7. Out of scope / follow-ups
- **DOCX rendering** (a second renderer + its own highlight mapping) — deferred until a DOCX-cited case exists.
- **File-browse / attach UI** — P4 (projects/matters). Today citations only exist on project-backed chats; P3 is reachable via the seeded cited chat until P4 lands a project picker.
- **`edited_before_use` enhance telemetry / structured `skill_inputs` forms** — unrelated P2c follow-ups.
- Optional DRY: a shared `gatewayError(res)` helper across BFF proxies (now 3, soon 5) — cosmetic; fold in if convenient during P3-1.
