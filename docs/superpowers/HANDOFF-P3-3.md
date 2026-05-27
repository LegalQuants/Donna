# Donna — Handoff for the next session (start P3-3: multi-tab strip + non-PDF fallback)

**Date:** 2026-05-26 · **Branch state:** `main` has everything through **P3-2** — P0/P1 (#1), P2a (#2), P2b (#3), P2c-A (#4), P2c-B (#5–#8), **P3-1 document panel (#9)**, **P3-2 citation highlight (#10)**. `vendor/lq-ai` pinned at **`438198c`**. You are on `main`; start P3-3 off `main`.

> **First thing:** `git checkout main && git pull` (confirm HEAD is the #10 merge `33bc01d` or later). Pin check: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`. The dev stack is up and `.env` is populated (see §4).

## 1. What Donna is

Standalone MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. Browser talks only to Donna's SvelteKit server (a **BFF**) which holds the lq-ai JWT in httpOnly cookies and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule), brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays. Orient with `README.md`, the specs in `docs/superpowers/specs/`, `docs/decisions/lq-ai-pin.md`, and project memory (`MEMORY.md` index — esp. `donna-phase-status`, `donna-workflow`, `donna-dev-stack`).

## 2. Phase status

| Phase | Status |
|---|---|
| P0–P2c-B | ✅ merged (#1–#8) |
| **P3 — Document panel + highlighting** | P3-1 ✅ (#9), P3-2 ✅ (#10), **P3-3 ⬅️ NEXT** |
| P4 Projects/Matters · P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline | pending |

P3 was sliced into three PR-sized slices (P3-1 shell+render, P3-2 highlight+pill-rework, **P3-3 multi-tab + non-PDF fallback**). **P3-3 is the last P3 slice.** Continue the pattern: brainstorm → spec → plan → subagent-execute → review → PR.

## 3. How to build a slice (the established loop — follow it)

Per slice, one PR into `main`: **brainstorming** (offer the visual companion for UI questions; spike the live backend contract early; decompose if large) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks, complete code in every step) → **subagent-driven-development** (fresh implementer per task + two-stage review: spec-compliance then code-quality; controller verifies reviewer findings before acting; commit per task; final whole-branch review) → **live e2e** against the running stack → **finishing-a-development-branch** (open PR). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal). Also keep **eslint** clean (`npx eslint <touched files>`) — the P3-2 final review caught a `svelte/no-at-html-tags` disable-comment that drifted off its `{@html}` line when a div went multiline. Verify against the **real backend**, not just unit tests; **rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`) — the container serves a built image, not live `src/`.

**Patterns that worked across P3-1/P3-2 (reuse them):** thin BFF proxy per backend endpoint (mirror `src/routes/(app)/models/+server.ts`; byte routes stream `res.body` like `files/[id]/content`); a per-feature rune controller in `src/lib/<feature>/*.svelte.ts` (closure factory, getters + methods, injectable `fetchFn`/deps for unit tests — see `docPanel.svelte.ts`); presentational `.svelte` components with plain props + injectable collaborators (e.g. `PdfViewer`'s injectable `renderPdf`/`highlightQuote`). Reviewers repeatedly caught real issues — Svelte-5 reactivity from mutating a pre-proxy object (mutate the element via `tabs.find` so the `$state` proxy fires), resource leaks (destroy the pdf doc; clear timers in `onDestroy`), and untyped test fixtures widening literal-union types. Fix what's real, push back on what isn't (use receiving-code-review judgment).

## 4. Running / verifying the stack

Compose project `donna` on shifted ports (app **http://localhost:13002**, lq-ai api `127.0.0.1:18000`, gateway `18001`). `.env` is gitignored but present and populated (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` for embeddings→RAG/citations, `DONNA_BASE_URL=http://localhost:13002`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`). Suggest the user rotate any key pasted in chat.

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web   # after editing src/ (REQUIRED before live e2e)
npm run check && npx vitest run && npx playwright test
```

**Stack notes (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach (the citation/highlight e2e seed a project+KB+PDF and are timing-sensitive — pass on retry once embeddings settle). Gateway anonymization is ENABLED. Donna creates **project-less** chats (no project picker until P4), so citations only appear on **project-backed chats** seeded via API (the e2e do this). `/tmp/spike.pdf` is the seed fixture.

## 5. P3-3 scope — multi-tab strip + non-PDF fallback card

Roadmap deliverable wording: *"Tabbed resizable PDF.js/DOCX viewer."* P3-1/P3-2 delivered a single-doc resizable viewer with citation highlight. P3-3 adds:
1. **Multi-tab strip UI** — open several cited documents at once, switch between them, close individual tabs. **The controller is already multi-tab-ready:** `docPanel` (`src/lib/docpanel/docPanel.svelte.ts`) holds `tabs: DocTab[]`, `activeId`, `setActive(id)`, `close(id)`, and each `DocTab` carries its own `cite`/`page`/`quote`/`highlightStatus`. `open()` already dedupes by `source_file_id` and adds/focuses tabs. So P3-3 is mostly the **tab-strip presentation** in `DocumentPanel.svelte` (currently shows only the active tab's filename in the header) + wiring clicks to `setActive`/`close`.
2. **Non-PDF fallback card** — `DocumentPanel` currently renders a bare "Preview not available for this file type." line for non-`application/pdf` mime. Replace with a real `UnsupportedFileCard.svelte` (filename, mime, a download link to `/files/[id]/content`).

**Carried-forward threads to fold in (from P3-1/P3-2 reviews):**
- **First commit: `content-disposition` hardening** on `src/routes/(app)/files/[id]/content/+server.ts`. The byte proxy currently sets `content-type` + `nosniff` but no `content-disposition`. Decide **inline vs attachment** alongside the fallback card's download UX (attachment is safer against a non-PDF, e.g. `text/html`, rendering inline in the app origin; the PDF viewer fetches via `arrayBuffer()` so disposition doesn't affect it). The non-PDF card's "download" link is the natural consumer.
- **Highlight on tab-switch:** the CSS Custom Highlight API uses a **single global `'cite'` highlight** (`src/lib/docpanel/pdfHighlight.ts`). Today only one doc is active at a time; `closePanel()` clears it. With multiple tabs, switching the active tab must **clear/replace** the `'cite'` highlight so a previous doc's yellow box doesn't bleed onto the new tab. The per-tab `highlightStatus` is already stored; on `setActive`, the newly-active PDF's `PdfViewer` `$effect` should re-run (it's keyed on `{page,quote}` and remounts via `{#key fileId}` when the active fileId changes) — **verify** this actually re-highlights/clears correctly when switching tabs, since P3-1/P3-2 only ever had one tab.

**Likely open questions for the brainstorm:**
- Tab-strip placement/visual (above the cited-passage bar? where the filename header is now?) — **use the visual companion.** Overflow behavior with many tabs (scroll? truncate?). Close affordance per tab.
- Does P3-3 need the citation→panel flow to support multiple *distinct* files? Today the seeded chat cites one file (`spike.pdf`). To demonstrate/e2e multi-tab you need **2+ distinct cited files** — seed a project with two PDFs and either a query that retrieves both or two grounding messages citing different files. Spike this before designing the e2e.
- Non-PDF: there is **no DOCX/non-PDF citation in the backend today** (all citations are PDF). So the fallback card can't be e2e'd against a real non-PDF citation — unit-test the mime branch + the card; reaching it live would need an uploaded non-PDF file opened directly (no UI path until P4). Scope accordingly (the card is the deliverable; live coverage is limited).

This is viewer-UI-heavy → spike the seeding reality (can you get 2 distinct cited files?), then use the visual companion for the tab-strip UX.

## 6. Upstream lq-ai fixes (workflow that recurs)

The user runs a separate Claude Code on `LegalQuants/lq-ai`. If a slice needs a backend change/bug fix, **don't edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test; scope docs-only / no-behavior-change when that's all that's needed), hand to the user to relay, and on the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit. Done 3× so far (#102/#103/#105). P3 needed no backend changes.

## 7. Key files

- `src/lib/docpanel/docPanel.svelte.ts` — the rune controller (tabs/activeId/width/setActive/close/closePanel/setHighlightStatus). Multi-tab-ready.
- `src/lib/docpanel/types.ts` — `DocTab` (fileId, filename, mime, status, page, quote, **cite**, **highlightStatus**).
- `src/lib/docpanel/DocumentPanel.svelte` — docked shell: header (filename + page + close + resize handle), cited-passage bar, body (PdfViewer / "preview not available" / error). **P3-3 adds the tab strip here and the fallback card.**
- `src/lib/docpanel/PdfViewer.svelte` — fetch+render+highlight (`$effect` on `{page,quote}`, `{#key fileId}` remount).
- `src/lib/docpanel/pdfHighlight.ts` — verbatim search + CSS Custom Highlight (`highlightQuote`, `scrollCitedIntoView`, `clearHighlight`). Single global `'cite'` highlight.
- `src/routes/(app)/files/[id]/content/+server.ts` — byte proxy (the `content-disposition` first-commit target).
- `tests/document-panel.spec.ts`, `tests/citation-highlight.spec.ts` — the e2e seeding pattern to copy for a multi-tab e2e.

## 8. Gotchas

- Icons `@lucide/svelte` (`<Icon size={14} />`). Route state via `$app/state`'s `page`. Reading server-loaded `data.*` at init → wrap in `untrack`.
- `vendor/` excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api`.
- Svelte-check a11y on `{@html}`/static-element handlers — use a **single targeted** `<!-- svelte-ignore <exact_rule> -->`/`eslint-disable-next-line` ONLY where a real warning fires, and keep it on the line it suppresses (the P3-2 review caught a drifted `{@html}` disable). Reviewers flag dead ignores.
- Vitest jsdom; component tests use `@testing-library/svelte` + `userEvent` (use `fireEvent` for focus/keyboard/timer paths); `expect: { requireAssertions: true }`. CSS Custom Highlight API + `scrollIntoView` are **absent in jsdom** — `pdfHighlight` guards them; assert real highlight behavior in the Playwright e2e via `page.evaluate(() => CSS.highlights.get('cite')?.size)`.
- Live e2e: assert unique controls / outgoing request bodies over ambiguous text (strict-mode multi-match bites). Rebuild `donna-web` before running.

## 9. Open follow-ups (not P3-3 blockers unless touched)

- **P4** adds a project picker → citations/retrieval light up for normal UI chats (today only seeded project-backed chats have citations). A non-PDF/file-attach UI path is P4 territory — P3-3's fallback card is reachable in the UI only via citations (all PDF today).
- Reliability (from `docs/decisions/lq-ai-pin.md`): distinguish backend-down (503) from logged-out; refresh-cookie TTL; TLS for non-localhost.
- Keyboard-driven panel resize (`role="separator"` + arrow keys) and the per-pointermove `localStorage` write on resize — P3 polish backlog from the P3-1 review.
- B2 deferred structured `skill_inputs` forms; B3 deferred `edited_before_use` enhance telemetry — unrelated P2c follow-ups.
