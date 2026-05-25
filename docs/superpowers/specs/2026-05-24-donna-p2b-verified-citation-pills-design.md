# Donna P2b — Verified Citation Pills (design)

**Date:** 2026-05-24 · **Phase:** P2b · **Branch:** off `main` (P0+P1, P2a merged)

Layer interactive, verification-stated **citation pills** onto the P2a chat surface.
In P2a the model's `(Source: [N])` markers render as plain text; P2b makes them live:
the quoted span is underlined and color-coded by verification state, with a numbered
tab that opens a popover showing the verified source quote, page, file, and method.

This is the flagship transparency differentiator: *a wrong answer the lawyer can see
is wrong is more useful than a wrong answer that looks right* (lq-ai PRD §1.3).

---

## 1. Backend contract — verified by spike (supersedes the handoff)

A spike (`.superpowers/brainstorm/citation-spike.sh`) drove the live pinned backend
end-to-end and **corrected two assumptions in the handoff**. The full working chain:

> create project → create KB → upload PDF → **ingest-worker** chunks it → attach file
> to KB → chat (with `project_id`) auto-retrieves from the project's KBs and injects a
> `(Source: [N])` context block → model quotes verbatim → citation engine verifies →
> persists to `message_citations` → served by the per-message citations endpoint.

### 1.1 Citations are NOT on the SSE `complete` frame (corrected)

The pinned backend is at **M2-A2**, which relationalized citations into a
`message_citations` table. They are served **only** by:

```
GET /api/v1/chats/{chat_id}/messages/{message_id}/citations  →  Citation[]
```

The SSE `complete` frame's `citations` field is **empty** even when citations exist
(P2a has been storing empties into `ChatMessage.citations`). Therefore **both freshly
streamed and history-loaded messages fetch citations by `message_id`** — fresh ones
right after the stream completes (the `start`/`complete` frame carries the assistant
`message_id`), history ones during the page `load`. This *unifies* the fetch path.

### 1.2 Citation payload (richer than the generated type)

The live endpoint returns more than the OpenAPI-generated `Citation` type documents.
Observed payload (verified citation):

```json
{
  "id": "…", "source_file_id": "…",
  "source_offset_start": 59, "source_offset_end": 166, "source_page": 1,
  "source_text": "This Agreement may be terminated … thirty (30) days prior written notice",
  "verified": true,
  "verification_method": "exact_match",      // NOT in generated type
  "verification_confidence": 1.0,            // NOT in generated type
  "partial": false
}
```

`verification_method ∈ {exact_match, tolerant_match, paraphrase_judge,
ensemble_strict, ensemble_majority}`. We extend our app-side `Citation` type with the
two optional fields (`verification_method?`, `verification_confidence?`).

### 1.3 Marker format

The retrieval context block instructs the model to ground each claim as
`"<verbatim quote>" (Source: [N])`, where `[N]` is the 1-indexed bracketed chunk
number. `[N]` maps to `citations[N-1]`. The quote is in **straight double quotes**
immediately preceding the marker (the backend disables smart-quote conversion in this
path). A claim the model fails to quote-and-cite simply has no marker.

### 1.4 Stack requirements (confirmed by spike — see runbook §10)

- **`ingest-worker`** must run (it was missing from the prior compose up list) or
  uploads never reach `ingestion_status='ready'` and nothing can be cited.
- **`OPENAI_API_KEY`** must be set (gitignored `.env`): the gateway `embedding` alias →
  `openai-prod/text-embedding-3-small` (1536-dim, matches `document_chunks.embedding`).
  Generation stays on Anthropic (`smart`); only embeddings use OpenAI. Without it the
  gateway returns 503 on `/v1/embeddings`, chunks never embed, and retrieval is empty
  (FTS-only fallback via `plainto_tsquery` ANDs every query lexeme — too brittle to
  match natural questions).
- Embedding is **async** (enqueued on KB-attach). E2E must **wait for chunks to embed**
  before the chat turn, else the chat path (`embedding IS NOT NULL`) retrieves nothing.

---

## 2. State derivation & tooltip mapping

State follows the citation-engine doc's UI table — **method drives green-vs-yellow**,
not just `verified`/`partial`. Single derivation function is the only place state is
decided:

| State (UI) | Color | When |
|---|---|---|
| `verified` | green | `verified===true` and `method ∈ {exact_match, tolerant_match}` |
| `caveats` | yellow | `verified===true` and (`method ∈ {paraphrase_judge, ensemble_strict, ensemble_majority}` **or** `partial===true`) |
| `unverified` | red (dashed underline) | citation missing (out-of-range `[N]`) **or** `verified!==true` |

Defensive fallback when `verification_method` is absent: `verified && !partial → verified`,
`verified && partial → caveats`, else `unverified`.

Tooltip label by method (confidence appended when present, e.g. " (100%)"):

| method | label |
|---|---|
| `exact_match` | "Verified — exact match in source" |
| `tolerant_match` | "Verified — matches source (normalized)" |
| `paraphrase_judge` | "Verified by judge — source supports this claim" |
| `ensemble_strict` | "Verified by ensemble — all judges agreed" |
| `ensemble_majority` | "Verified by ensemble — majority of judges agreed" |
| (partial appends) | "… (source partially supports)" |
| unverified | "Unverified — could not confirm against the source" |

---

## 3. Visual design (validated in the visual companion)

**Treatment C — underlined quote + numbered tab.** The quoted text is underlined in the
state color (dashed for unverified); the `(Source: [N])` marker is replaced by a small
raised numbered tab in the state color. This colors the *span*, the strongest provenance
cue, and sets up P3's document highlighting.

**Interaction — click to open, one popover at a time.** The tab is a button
(`role="button"`, keyboard-activatable with Enter/Space). Click opens a popover anchored
to the tab; Esc or click-away closes; opening another closes the first. (Hover is not the
trigger — accessible + touch-friendly.)

**Popover content:**
- State header (green/yellow/red) with the method-derived label (§2).
- `source_text` as a blockquote (the verbatim text the engine matched).
- `Page {source_page}` when present, and the **filename** (lazily resolved, §6).
- A disabled **"Open in document →"** affordance with a "Document panel arrives in P3" note.

Palette (document-forward, restrained): green `#3a8f57`, yellow `#c9a227`, red `#c0473b`
on tinted backgrounds; serif body preserved. Final tokens align to existing `mlq-*`
Tailwind theme during implementation.

---

## 4. Rendering architecture — Approach A (post-sanitize transform)

Keep `Markdown.svelte`'s `markdown-it → DOMPurify` pipeline **authoritative and
unchanged**. Layer pills on top of the sanitized HTML:

1. **Extract the pipeline** into `$lib/markdown.ts` (`renderMarkdown(content): string`)
   so it's defined once; `Markdown.svelte` calls it (no behavior change).
2. **Transform the sanitized HTML** (`$lib/citations/transform.ts`,
   `transformCitations(sanitizedHtml, citations): string`): split on tags
   (`/(<[^>]+>)/`) and run the marker regex **only on text segments** (never on tags/
   attributes). Primary regex `"([^"]+)"\s*\(Source:\s*\[(\d+)\]\)` wraps the quoted text
   in `<span class="cite-quote cite-{state}">` (quotation marks preserved) and replaces
   the marker with
   `<span class="cite-tab cite-{state}" data-cite-index="N" role="button" tabindex="0" aria-label="Citation N, {state}">N</span>`.
   A fallback regex `\(Source:\s*\[(\d+)\]\)` converts any leftover bare marker (quote
   split by inline markup, or no quote) into a tab only. Only static markup + an
   integer index enter the HTML — **no citation text is interpolated into HTML** (the
   popover reads `source_text`/filename from the typed object). DOMPurify stays the sole
   sanitizer of model content; our post-sanitize insertions are trusted and static.
3. **Interactivity by event delegation.** `{@html}` can't mount Svelte components, so the
   container handles delegated `click`/`keydown`: `event.target.closest('[data-cite-index]')`
   → open one shared `CitationPopover` bound to `citations[N-1]`.

Rejected: a markdown-it plugin (more moving parts inside the security-critical pipeline)
and splitting content into Svelte segments (shatters markdown block structure and the
underline-the-preceding-quote requirement straddles split boundaries).

---

## 5. Components & files

**New**
- `src/lib/markdown.ts` — extracted `renderMarkdown()` (markdown-it + KaTeX + DOMPurify).
- `src/lib/citations/types.ts` — `Citation` (extends generated type with optional
  `verification_method`, `verification_confidence`), `CiteState`, `citeState(c)`,
  `tooltipFor(c)`.
- `src/lib/citations/transform.ts` — pure `transformCitations(html, citations)`.
- `src/lib/citations/files.ts` — module-level `Map<fileId, Promise<{filename}>>` cache;
  `fileName(id)` (one BFF fetch per id).
- `src/lib/components/CitationView.svelte` — `renderMarkdown` → `transformCitations` →
  `{@html}` in a delegated container; owns the single `CitationPopover` open-state.
- `src/lib/components/CitationPopover.svelte` — anchored panel (§3).
- `src/routes/(app)/chats/[id]/messages/[message_id]/citations/+server.ts` — BFF GET
  proxy to `/api/v1/chats/{id}/messages/{mid}/citations` via `lqFetch` (client-callable,
  for the fresh-stream fetch).
- `src/routes/(app)/files/[id]/+server.ts` — BFF GET proxy to `/api/v1/files/{id}`,
  returns `{ filename }`.

**Modified**
- `src/lib/components/Markdown.svelte` — call `renderMarkdown()` (no behavior change).
- `src/lib/components/Message.svelte` — assistant branch: when `status==='done'` and
  `message.citations?.length`, render `<CitationView>`, else `<Markdown>` (streaming
  shows plain markers; pills appear after the post-completion fetch resolves).
- `src/lib/chat/chatStream.svelte.ts` — type `ChatMessage.citations` as `Citation[]`;
  **stop** trusting `complete.citations`; on `done`, fetch citations for the assistant
  `message.id` via the BFF route and assign (with a short retry if empty, covering the
  persist/fetch race). `retry()` clears citations before re-streaming.
- `src/lib/chat/sse.ts` — drop the now-empty `complete.citations` reliance (leave the
  field typed but unused).
- `src/routes/(app)/chats/[id]/+page.server.ts` — after loading messages, for every
  assistant message whose content contains `(Source: [`, fetch its citations via
  `lqFetch` in parallel (`Promise.all`); attach to `message.citations`. Per-message
  failure → `[]` (that message degrades to plain markers; page still loads).

---

## 6. Filename resolution

`Citation` carries only `source_file_id`. The popover resolves the human filename
lazily on open via the `/files/[id]` BFF route, cached per id in `files.ts`
(`GET /api/v1/files/{id}` → `{ filename, page_count }`; we use `filename`). Fetch failure
→ popover still shows state + quote + page, filename omitted. No N+1 on load (resolved
only on interaction).

---

## 7. Error handling & edge cases

- **No citations / no markers** → behaves exactly like P2a (plain sanitized markdown).
- **Marker without a contiguous quote** (quote split by inline markup, or model omitted
  quotes) → fallback marker-only tab, no underline.
- **Out-of-range `[N]`** (`citations[N-1]` undefined) → red `unverified` tab; popover says
  it couldn't be confirmed, no source block.
- **Persist/fetch race** on fresh stream → if the citations fetch returns `[]` immediately
  after `done`, retry once after a short delay before concluding "no citations".
- **Filename fetch fails** → popover renders without the filename.
- **History citations fetch fails** for a message → that message shows plain markers; the
  page still loads.
- **Sanitization** is untouched; the transform runs post-sanitize and inserts only static
  markup with an integer index (no XSS surface).

---

## 8. Out of scope (later phases)

- Document side-panel + offset highlighting using `source_offset_*` (**P3**).
- Per-message "Sources" footer list (decided out; inline pills only).
- Receipts, anonymization indicator, skill-attach, Enhance Prompt, model/tier picker (**P2c**).
- Configuring a production embeddings provider / dimension migration (ops concern).

---

## 9. Testing

- **Unit (vitest)** — `transform.ts`: all three states; out-of-range index; no-quote
  fallback; **tag-aware** (a `(Source: [1])` literal inside an `href`/attribute is NOT
  converted); markdown-in-quote → fallback; multiple markers (incl. repeated index);
  no-marker passthrough; sanitization preserved. `citeState`/`tooltipFor`: every method
  + partial. `files.ts`: one fetch per id (cache).
- **Deterministic Playwright** — intercept the BFF citations route with a crafted payload
  exercising all three states + an out-of-range marker; assert underline colors, the tab,
  popover content (state label, source_text, page, lazily-fetched filename), and keyboard
  (Enter opens, Esc closes). The only reliable way to cover yellow/red (live engine output
  is nondeterministic).
- **Live-stack Playwright smoke (real backend)** — the spike chain is now reproducible:
  seed a KB-attached PDF, **wait for embedding**, ask a grounding question, assert ≥1
  `cite-tab` renders, the popover opens, `source_text` is non-empty, and the filename
  resolves. Assert structural invariants, not exact engine text.
- Quality bar (per workflow): `npm run check` = **0 errors, 0 warnings**; `npx vitest run`;
  `npx playwright test`. (Harmless vendor `ERR_MODULE_NOT_FOUND` stderr is not a failure.)

---

## 10. Runbook delta (record in README / lq-ai-pin.md)

```bash
set -a; . ./.env; set +a
# NOTE: ingest-worker is now required for any citation work.
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
# OPENAI_API_KEY must be in .env for embeddings; recreate gateway after editing .env:
docker compose up -d --force-recreate gateway
```

Citations only appear for chats whose **project has a KB with embedded files**; embedding
is async after KB-attach.

---

## 11. Open follow-ups

- The OpenAI key was pasted in chat → **rotate it** after the phase; it lives only in the
  gitignored `.env`. Consider documenting an embeddings-provider requirement in
  `.env.example`.
- The OpenAPI-generated `Citation` type lags the live payload (missing
  `verification_method`/`verification_confidence`) — worth an upstream schema fix; until
  then we extend the type app-side.
- Spike fixtures (projects/KBs/files/chats) remain in the dev DB — harmless; clean when
  convenient.
