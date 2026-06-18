# Slice A — case-law research workspace (design)

**Date:** 2026-06-17 · **Milestone:** legal research + MCP in Donna
(`2026-06-17-legal-research-mcp-donna-milestone.md`) · **Branch:** `feat/research-workspace` (off
`main`). **Backend gate:** LQ-AI PR3b (`/api/v1/research/*`, branch `feat/research-api`) — must be
merged to lq-ai `main`, the Donna pin bumped, and `gen:api` run **before implementation starts**.

## Problem

Lawyers need case-law research — verify a reporter citation, search case law, read an opinion, find a
passage within it — inside the tool they already use. LQ-AI is building this on its governed gateway
boundary (CourtListener as a tool-provider). Donna should surface it as a clean, reading-first
**Research workspace**: search → read in the doc panel → find-in-case → verify citations.

## Upstream contract (FINAL — pinned `e2cc311`, verified in `src/lib/api/backend.d.ts`)

`/api/v1/research` — a **plain synchronous REST** surface (no SSE in PR3b; "SSE research events" from
the proposal belong to Slice C's chat tool-loop). All routes require an active user. The three Donna
refinement asks shipped (#163/#164) and are reflected in the generated types — see the **bold**
deltas below.

- **`GET /capabilities`** → `{ enabled: boolean, providers: [{ name, type }] }` — **the deterministic
  feature-flag signal** (reads fresh from the gateway). When research is off, the _other_ endpoints
  return **503 `ResearchNotConfigured`**.
- **`POST /verify-citations`** `{ text: str (1..64000) }` → `{ citations: VerifiedCitation[] }`,
  **now fully typed**: `VerifiedCitation = { citation, normalized_citations: string[], status,
error_message, clusters: { id, case_name, absolute_url }[] }`. **No hand-parser needed** — derive
  from `backend.d.ts`.
- **`POST /search`** `{ q: str, court?: str, order_by?: str }` →
  `{ count: int|null, results: SearchResultItem[], next_cursor: str|null }` where
  `SearchResultItem = { cluster_id, case_name, court, date_filed, citation, absolute_url, snippet }`
  (all nullable). Pagination via `next_cursor`.
- **`GET /clusters/{cluster_id}`** → `{ cluster: { cluster_id, case_name, court, date_filed,
absolute_url }, opinions: { opinion_id, text_field_used, char_length }[] }`.
- **`GET /opinions/{opinion_id}`** → `{ opinion_id, cluster_id, text_field_used, text }` — **full
  opinion plaintext** (backend strips HTML → plaintext; read-through object-storage cache + DB
  metadata + live-API fallback, all backend-side).
- **`POST /find-in-case`** `{ opinion_id, query, max_matches: 1..10 (default 3) }` →
  `{ opinion_id, matches: { position: int, snippet: str }[] }`.

**`text_field_used`** (on the clusters' opinion list and on `/opinions/{id}`) is **now a 7-member
enum** — `html_with_citations | html_columbia | html_lawbox | xml_harvard | html_anon_2020 | html |
plain_text | null` — so Donna maps it to honest source labels ("plain text" vs the `html_*`/`xml_*`
family = "HTML/XML-derived, normalized").

**Feature flag:** CourtListener is off until the operator wires a `courtlistener` tool-provider
(`COURTLISTENER_API_TOKEN`). Donna reads **`GET /capabilities`** at page load — `enabled:false` →
the friendly "not enabled" gate (the `AutomationsGate` precedent); a stray **503
`ResearchNotConfigured`** on any action is treated the same way. Deterministic, not heuristic.

## Decisions (user-confirmed during brainstorming)

- **Ephemeral, global workspace.** No persistence, no matter-scoping in v1 — matches the stateless
  backend contract exactly (no `matter_id`, no save endpoint), zero upstream asks. Matter-scoping is
  a deferred future slice.
- **Top-level navigation.** `/research` sits in the app nav alongside Matters / Tabular / Playbooks.
- **Reuse the existing doc panel** for reading opinions (not a new reader): search results + cluster
  metadata in the main pane; the opinion reads in the slide-over doc panel via the existing
  `TextViewer`; find-in-case matches drive the existing highlight path.
- **Verify-citations is in v1** — a small "Verify citations" tool on the Research page (paste text →
  recognized reporter citations linked to their clusters). The 5th endpoint; cheap and coherent.

## Architecture (BFF, §3)

The browser never calls lq-ai. Donna's server proxies each research call with the bearer token
(transparent 401-refresh), exactly like every other feature. Five **thin BFF proxy routes** sit
beside the flat `/research` page — no route collision, since the page has no dynamic children (the
`/prompts` + `/prompts/items` precedent):

- `GET /research/capabilities` · `POST /research/search` · `GET /research/clusters/[id]` ·
  `GET /research/opinions/[id]` · `POST /research/find-in-case` · `POST /research/verify-citations`

The page's SSR `load` calls `GET /research/capabilities` once for the deterministic enabled/gate
signal; everything else is client-interactive (typing, pagination, opening opinions) through the
proxies.

## Changes

### 1. Data layer — `src/lib/research/` (pure, defensive)

- Types derived from the generated `backend.d.ts` — the whole surface is now typed, so **no
  verify-citations hand-parser** (the #163/#164 refinement removed that need). Keep light defensive
  parsers only as a runtime guard at the boundary (the responses are LLM/CourtListener-sourced and
  nullable): `parseSearchResponse`, `parseClusterView`, `parseOpinionText`, `parseFindMatches`,
  `parseCitations` — each drops malformed rows rather than throwing (`str`/`obj` guards; the
  `findings.ts` template). They consume/return the generated types rather than re-declaring shapes.
- `parseCapabilities(raw): { enabled: boolean; providers: {name,type}[] }` for the gate.
- `createResearch()` controller (Svelte 5 runes; `$state`/`$derived`) holding query, results,
  selected cluster, loading/error/not-enabled state, and `next_cursor` paging — seeded via `untrack`.

### 2. Doc panel — bounded generalization to render an external opinion

The one piece of new internal surface. Today `DocTab` keys on `source_file_id` and fetches
`/files/{id}` (`docPanel.svelte.ts:29,60`). Opinions have no Donna file.

- Give `DocTab` an optional source discriminant: `{ kind: 'file', fileId } | { kind: 'opinion',
opinionId }` (default `'file'` — existing callers unchanged).
- Add `docPanel.openOpinion({ opinion_id, cluster_id, case_name })` — parallel to `open()`. Creates a
  tab keyed `opinion:${opinion_id}`, fetches text from `/research/opinions/{opinion_id}`, sets
  `mime = 'text/plain'` and `filename = case_name`, renders via the **existing `TextViewer`**.
- find-in-case matches feed the **existing highlight path** (`pdfHighlight`/TextViewer highlight) so a
  searched passage highlights in the open opinion.
- Keep `open(Citation)` untouched; `openOpinion` is additive and independently unit-tested.

### 3. Research page — `src/routes/(app)/research/+page.svelte` (+ proxy routes)

- Search bar (`q`, optional court / order_by) → results list with pagination.
- Result → cluster fetch → cluster metadata card + opinion list; each opinion has an "Open" action →
  `docPanel.openOpinion(...)`.
- In-panel **find-in-case**: a small search input that calls `/research/find-in-case` and highlights.
- **Verify citations** tool: textarea → `/research/verify-citations` → list of recognized citations,
  each linking to its cluster (opens the cluster view).
- Nav entry added to the app shell.

### 4. Error handling (honest degradation, §7)

- Each proxy degrades independently. Search failure → inline "research unavailable" + retry; the page
  still renders. Opinion fetch failure → the doc panel tab shows its existing `'error'` status.
- **Not-enabled gate (deterministic):** the `load`'s `GET /capabilities` returns `enabled:false` →
  render "Case-law research isn't enabled on this server" with operator guidance (mirrors
  `AutomationsGate`). A **503 `ResearchNotConfigured`** on any subsequent action is mapped to the same
  gate (covers the rare disable-mid-session window).
- Defensive parsers drop malformed rows; never fabricate data.

## Testing

- **Unit:** the parsers (`parseSearchResponse`, `parseCitations`, `parseClusterView`,
  `parseFindMatches`) — malformed-row drop, empty, happy path.
- **Doc panel:** `openOpinion` creates the right tab, fetches the opinion route, renders text,
  dedupes by `opinion:${id}`, error path; `open(Citation)` regression unchanged.
- **Component:** Research page states — empty / loading / results / paginated / error / not-enabled.
- **Server:** each proxy route with `lqFetch` mocked (auth attach, pass-through, error mapping).
- **Live e2e (Playwright):** the not-enabled degradation path runs unconditionally; the full
  search→read→find→verify flow is **gated on `COURTLISTENER_API_TOKEN`** being set in the stack
  (mirrors the backend's `-m provider` gating). Self-cleaning per §7.

## Out of scope for Slice A

Matter-scoping / persistence; in-chat tool-calling and SSE research events (Slice C); external-source
citation provenance through the verification cascade (Slice D); MCP (Slice B). Bulk-data import is
backend-only and not exposed (LQ-AI O3).

## Open items — all RESOLVED before implementation (pin `e2cc311`, #163/#164)

All three asks from `docs/upstream-requests/lq-ai-research-surface-donna-refinements.md` shipped and
are verified in `backend.d.ts`:

- ✅ **Feature-enabled signal** → `GET /capabilities` (deterministic) + 503 `ResearchNotConfigured`.
- ✅ **Typed `verify-citations`** → `VerifiedCitation` — no hand-parser.
- ✅ **`text_field_used`** → 7-member enum (incl. `xml_harvard`) for honest source labels.

Residual notes (non-blocking): multi-CourtListener configs resolve to `providers[0]` (display the
effective provider if surfaced); LQ-AI filed **DE-337** to generate the spec from `app.openapi()` so
it can't drift again.

## Implementation prerequisite

Before runtime/e2e: rebuild the stack so migration **0049** runs —
`docker compose up -d --build api arq-worker ingest-worker donna-web` (§8) — and set
`COURTLISTENER_API_TOKEN` in `.env` for the live (gated) e2e path. Not needed for `gen:api` /
`npm run check` (done at the pin bump).
