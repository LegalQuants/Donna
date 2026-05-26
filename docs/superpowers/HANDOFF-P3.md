# Donna — Handoff for the next session (start P3: Document panel + highlighting)

**Date:** 2026-05-26 · **Branch state:** `main` has P0+P1 (#1), P2a (#2), P2b (#3), P2c-A provenance (#4), and all of **P2c-B composer power** — B1 model picker (#5) + pin/type cleanup (#6), B2 skill-attach (#7), B3 enhance-prompt (**#8 — merge this before starting**). `vendor/lq-ai` pinned at **`438198c`**. Start P3 off `main` once #8 is merged.

> **First thing:** confirm #8 is merged, then `git checkout main && git pull`. The pin should read `438198c` (`git -C vendor/lq-ai rev-parse --short HEAD`).

## 1. What Donna is

A standalone, MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. The browser talks only to Donna's SvelteKit server (a **backend-for-frontend**) which holds the lq-ai JWT in **httpOnly cookies** and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule), brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays.

Orient with: `README.md`, the specs in `docs/superpowers/specs/` (foundation+roadmap has the full P0–P8 table; then P2a, P2b citations, P2c-A provenance, P2c-B1/B2/B3 composer), `docs/decisions/lq-ai-pin.md` (submodule pin + bump log + compose mechanism), and project memory (`MEMORY.md` index — see `donna-phase-status`, `donna-workflow`, `donna-dev-stack`, `donna-citation-contract`).

## 2. Phase status

| Phase | Status |
|---|---|
| P0 Foundation, P1 Auth+Landing | ✅ merged (#1) |
| P2a Core streaming chat | ✅ merged (#2) |
| P2b Verified citation pills | ✅ merged (#3) |
| P2c-A Provenance (Receipts drawer + anonymization) | ✅ merged (#4) |
| P2c-B Composer power (B1 model · B2 skills · B3 enhance) | ✅ merged (#5, #6, #7, #8) |
| **P3 — Document panel + highlighting** | ⬅️ **NEXT** |
| P4 Projects/Matters · P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline | pending |

P2c-B was split into three PR-sized slices during brainstorming (B1→B2→B3). **Continue the pattern:** decompose a large phase into PR-sized slices; if P3 is large, sub-slice it.

## 3. How to build a phase (the established loop — follow it)

Per **slice**, one PR: **brainstorming** (offer the visual companion for UI questions; **spike the live backend contract early**; decompose if large) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks) → **subagent-driven-development** (fresh implementer per task + two-stage review: spec-compliance then code-quality; commit per task) → **live e2e** against the running stack → final whole-branch review → **finishing-a-development-branch** (open PR into `main`). Feature-branch-in-place (no worktrees). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal). Verify against the **real backend**, not just unit tests. See memory `donna-workflow`.

**Patterns that worked across P2c-B (reuse them):** thin BFF proxy route per backend endpoint (mirror `src/routes/(app)/models/+server.ts`); a per-feature rune controller in `src/lib/<feature>/*.svelte.ts` created by the page (methods take an injectable `fetchFn = fetch` for unit tests; derive types from the generated `paths`/`components` in `src/lib/api/backend.d.ts`); a presentational `.svelte` component with plain props (testable like `ModelPicker.svelte`); wire into the page, gated by an optional prop for in-chat-only features. The reviewers repeatedly caught: untyped test fixtures widening literal-union types (fail `npm run check` though vitest passes — annotate fixtures), dead `svelte-ignore` comments (only keep ones that suppress a real warning), and fragile tests passing for the wrong reason (verify the actual call sequence).

## 4. Running / verifying the stack

Compose project `donna` on **shifted ports** (app at **http://localhost:13002**, lq-ai api at `127.0.0.1:18000`, gateway `18001`). `.env` is gitignored but **currently present and populated** (`ANTHROPIC_API_KEY` for generation, `OPENAI_API_KEY` for embeddings→RAG/citations, plus `DONNA_BASE_URL=http://localhost:13002`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`). Suggest the user rotate any key pasted in chat.

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web        # after editing src/
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
npm run check && npx vitest run && npx playwright test
```

**Stack notes (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach (the `citation-live` e2e seeds a project+KB+PDF and is timing-sensitive — passes on retry once embeddings settle). The gateway has anonymization **ENABLED** (so the P2c-A indicator shows). Donna creates **project-less** chats (no project picker until P4).

## 5. P3 scope — Document panel + highlighting

Roadmap deliverable: **"Tabbed resizable PDF.js/DOCX viewer, character-exact citation highlight."** A side/overlay panel that renders a document and highlights the exact span a verified citation points to.

**Backend contracts to verify first (spike live):**
- `GET /api/v1/files` (list), `GET /api/v1/files/{file_id}` (metadata + `ingestion_status`), `GET /api/v1/files/{file_id}/content` (bytes — confirm whether it returns the original PDF/DOCX or extracted text; this dictates PDF.js vs a text renderer).
- The **`Citation`** shape (`src/lib/citations/types.ts` → `components['schemas']['Citation']`) is what drives highlighting — verify which fields locate the span in the source (document/file id, page, char offsets, quoted `source_text`). The P2b pills already fetch citations per message (`/chats/[id]/messages/[id]/citations`).

**Likely open questions for the brainstorm (resolve before designing):**
- **How does a document get into view at all?** Donna makes project-less chats and has no file/document attach yet (that's P4 territory; B2 deferred document-typed skill inputs for the same reason). Citations only appear on **project-backed chats** (seeded via API in the `citation-live` e2e). So P3 may need a seeded project+file to demonstrate, or P3 may precede a "view this document" affordance. **Spike whether `/files/{id}/content` gives renderable bytes and whether a citation carries enough to locate+highlight a span**, then decide scope (full PDF.js viewer vs. a focused "source viewer" that shows the cited passage). This is the key sequencing decision — don't design the viewer before confirming what data is available.
- PDF.js vs DOCX rendering (different renderers); character-exact highlight mapping from citation offsets to rendered text.
- Panel UX: tabbed + resizable, where it docks relative to the chat (the composer + Receipts drawer already occupy the chat page). **Use the visual companion.**
- Carried-forward from P2b: the citation **popover doesn't re-anchor on scroll** — P3 is where citation→document anchoring gets reworked.

This is **viewer-UI-heavy + has a real data-availability question** → spike the backend first, then use the visual companion for the panel/highlight UX.

## 6. Upstream lq-ai fixes (the workflow that recurred)

The user runs a **separate Claude Code on `LegalQuants/lq-ai`**. If a P3 slice needs a backend change or hits a backend bug, **do not edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test; scope it **docs-only / no-behavior-change** when that's all that's needed — see the #105 `/models` example), hand it to the user to relay, and when they report the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit. Done 3× so far (#102 `4df3b9b` receipts fields; #103 `7c7ce14` streamed inference log; #105 `438198c` documented `/models` alias fields). Three reports exist in `docs/upstream-requests/` as examples.

## 7. Key files

- `src/lib/citations/types.ts` — `Citation` type + `citeState`/`tooltipFor` (P2b). The highlight source of truth.
- `src/lib/components/CitationView.svelte` / `CitationPopover.svelte` — P2b pill + popover (the click target that should open/scroll the P3 panel).
- `src/routes/(app)/chats/[id]/+page.svelte` — chat page; hosts the composer, Receipts drawer, and per-chat controllers (`createChatStream`, `createSkillAttach`, `createEnhance`). The document panel likely mounts here.
- `src/lib/components/Composer.svelte` — the composer (B1 model picker + B2 skill chips/button + B3 enhance), for layout context.
- `src/lib/api/backend.d.ts` — generated types (`npm run gen:api`); `/files`, `/files/{id}`, `/files/{id}/content`, `Citation`.
- New BFF routes for `/files`(+content) — mirror the thin-proxy pattern (`src/routes/(app)/models/+server.ts`); note `/files/{id}/content` returns **bytes**, not JSON, so the proxy streams/passes the body through (like the SSE messages route) rather than `json()`.

## 8. Gotchas

- Icons: `@lucide/svelte` (`<Icon size={14} />`). Route state in Svelte 5: `$app/state`'s `page`. Reading server-loaded `data.*` at component init → wrap in `untrack(() => …)` to avoid `state_referenced_locally` (see the chat page).
- `vendor/` is excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api` (sanitizes an upstream YAML backtick bug via `scripts/sanitize-openapi.js`).
- Svelte-check a11y on `{@html}`/static-element handlers — use a **single targeted** `<!-- svelte-ignore <exact_rule> -->` only where a real warning fires (reviewers flagged dead ignores twice).
- Vitest is a single jsdom project; component tests use `@testing-library/svelte` + `userEvent` (use `fireEvent` + fake timers for debounce-style tests); `expect: { requireAssertions: true }`. Live e2e in `tests/*.spec.ts` (Playwright, `DONNA_BASE_URL`), asserts against the real backend — prefer asserting outgoing request bodies / unique controls over ambiguous text (a strict-mode multi-match bit the B2 e2e).
- PDF.js will be a **new dependency** — justify it (the lq-ai project is SBOM-conscious; Donna is separate but keep the bar). Check licensing/bundle size; SvelteKit SSR needs the worker configured carefully.

## 9. Open follow-ups (not P3 blockers unless P3 touches them)

- **P2b:** citation popover doesn't re-anchor on scroll — **P3 reworks anchoring** (in scope).
- **P4** adds a project picker → citations + retrieval light up for normal UI chats automatically (today only project-backed/seeded chats have citations, which P3 highlighting depends on).
- Optional DRY: three BFF proxies now share the `503/504-passthrough-else-502` mapping (`models`, `skills/autocomplete`, `enhance-prompt`) — a shared `gatewayError(res)` helper could consolidate (reviewer suggestion; cosmetic).
- Reliability (from earlier reviews, in `docs/decisions/lq-ai-pin.md`): distinguish backend-down (503) from logged-out; refresh-cookie TTL vs lq-ai default; TLS for non-localhost deploys.
- B3 deferred `edited_before_use` enhance telemetry (used-only today); B2 deferred structured `skill_inputs` forms (revisit when doc/file attach lands — possibly alongside P3/P4).
