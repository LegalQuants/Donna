# Upstream request: navigable provenance on tabular cell citations

**For:** lq-ai backend · **From:** Donna (frontend) · **Filed:** 2026-06-02 · **Status:** dispatched (awaiting SHA)
**Relates to:** DE-309 (tabular citations are display-only) · Donna P6-B (Tabular Slice B)

## Problem

Donna wants a tabular grid cell's citations to **open the cited source in its document panel** — the
same UX as chat citations. The doc panel opens a source from a citation shaped like chat's: it needs
**`source_file_id`** (a `files.id`), **`source_page`**, and **`source_text`**.

A serialized tabular cell exposes **none** of these. It carries:

- `cited_chunk_ids: string[]` — real `document_chunks.id` UUIDs,
- a synthetic, display-only `citation_id` (`uuid5(NS, chunk_id)`, DE-309),
- `document_id` — a **`documents.id`**, _not_ a `files.id`.

There is no backend path from there to a navigable source: no `documents` API, no `GET /documents/{id}`,
no chunk-resolve route. So tabular cell→source navigation is impossible without a backend change. (DE-309
intentionally left the tabular citation "display-only and never resolves.")

## Ask — read-side enrichment (NOT full Citation-Engine minting)

This is the _lightweight_ version of DE-309's deferred enhancement, not the full executor-mints-real-
Citation-Engine-rows work. Extend the **existing read-time synthesis**
(`api/app/schemas/tabular.py`, `_synthesize_cell_citations` / `_TABULAR_CITATION_NAMESPACE`, ~lines
145–182, which already turns `cited_chunk_ids` into `Citation` objects) so each synthesized `Citation`
is **navigable**.

For each `chunk_id` in a cell's `cited_chunk_ids`, resolve:

- `document_chunks WHERE id = chunk_id` → `page_start`, `content`, `char_offset_start/end`, `document_id`
- `documents WHERE id = chunk.document_id` → `file_id`

Populate on the cell's `Citation` model (`schemas/tabular.py`, ~lines 77–95), adding fields if absent:

- `source_file_id: uuid` ← `documents.file_id` ← **the critical missing piece**
- `source_page: int | null` ← `document_chunks.page_start`
- `source_text: str` ← `document_chunks.content` (full chunk text is fine; the frontend locates/
  highlights within it)
- keep existing `document_id`, `chunk_id`, `confidence`, synthetic `citation_id`

**Why read-side:** `cited_chunk_ids` are already real `document_chunks` UUIDs, so resolving at
serialization time means **existing executions become navigable too** — no migration, no backfill, no
re-runs. Batch the lookups (one `IN` over all chunk ids per execution, one over the resulting document
ids) to avoid N+1. The only serialization site that needs this is the execution-detail endpoint.

## Surface

Enriched `Citation`s appear in `CellResult.citations` on the existing
`GET /api/v1/tabular/executions/{id}` response. **No new endpoint required.**

_Acceptable alternative_ if you'd rather not enrich every cell inline: a per-execution
`GET /api/v1/tabular/executions/{id}/citations` mirroring the chat
`GET /api/v1/chats/{id}/messages/{message_id}/citations` endpoint. Inline-on-cell is simpler for the
grid; either works for the frontend.

## Acceptance

For a completed execution with ≥1 cell that has non-empty `cited_chunk_ids`, each entry in
`cell.citations` carries:

- a non-null `source_file_id` that exists in `files`,
- a `source_page`,
- `source_text` equal to the chunk's `content`.

Verify against an **existing, pre-change** execution to prove the read-side path needs no backfill.
Leave `cost_actual_usd` semantics untouched (DE-310 is unrelated).

## Handoff

Push to `main` and return the **commit SHA**. Donna will pin `vendor/lq-ai` to it, regenerate
`backend.d.ts`, and wire `CellDetail → docPanel.open({ source_file_id, source_page, source_text })`.
