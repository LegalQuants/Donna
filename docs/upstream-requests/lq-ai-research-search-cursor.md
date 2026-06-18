# LQ-AI ask — make `/research/search` pagination consumable (accept a `cursor`)

**Filed:** 2026-06-17 · **From:** Donna (consumer) · **For:** Slice A search pagination ("load more").
The LQ-AI session works in `/Users/kevinkeller/Code/lq-ai` (absolute paths below). Verified against
pin `e2cc311` / `origin/main`.

## The gap

`/api/v1/research/search` **returns** `next_cursor` but provides **no way to send it back**, so a client
can't fetch page 2. Concretely:

- `SearchRequest` (`/Users/kevinkeller/Code/lq-ai/api/app/schemas/research.py`) is
  `{ q, court?, order_by? }` with `model_config = ConfigDict(extra="forbid")` — a `cursor` field is
  rejected, not ignored.
- The CL adapter `_search_case_law` (`/Users/kevinkeller/Code/lq-ai/gateway/app/providers/tool/courtlistener.py`)
  builds CourtListener params from `q`/`court`/`order_by` only and computes
  `next_cursor: _cursor_from(data.get("next"))` on the way out — but never accepts an inbound cursor.

So `SearchResponse.next_cursor` is currently dead weight on the client side: Donna shows it but cannot
act on it. CourtListener's `/search/` API itself is cursor-paginated (`?cursor=`), so the plumbing is
small.

## Ask

Thread a cursor through, end to end:

1. **`SearchRequest`** — add `cursor: str | None = None` (keep `extra="forbid"`).
2. **Search service** (`api/app/research/service.py::search_case_law`) — pass `cursor` through in the
   `args` dict to the gateway tool call (it already forwards `args` verbatim).
3. **CL adapter** (`_search_case_law`) — when `args.get("cursor")` is a non-empty string, set
   `params["cursor"] = args["cursor"]` before the `GET /search/` (CourtListener's native cursor param).
4. **OpenAPI** — reflect the new `cursor` request field in `docs/api/backend-openapi.yaml` (so Donna's
   `gen:api` picks it up — same drift caution as #163/#164; ideally generate from `app.openapi()`,
   DE-337).

`next_cursor` already returns the right value; this just lets a client send it back to page forward.

## Donna side (ready to wire on the bump)

Donna already parses + holds `next_cursor`/`count`; once the request accepts `cursor`, Donna adds a
"Load more" control that re-calls search with the cursor and appends results. Until then, Slice A
ships search capped at the first page (documented), with the **court/order_by filters and find-in-case
delivered**.
