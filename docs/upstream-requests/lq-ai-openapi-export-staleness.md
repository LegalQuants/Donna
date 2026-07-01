# Upstream request: regenerate the OpenAPI export (missing WS-E / WS-D routes)

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-01 · **Status:** OPEN — Donna is **blocked on this** before building the
> fiduciary segment against generated types (we chose to build on a correct, typed contract rather
> than hand-parse around the gap).

## TL;DR (the ask)

Please **regenerate and commit the OpenAPI export** — `docs/api/backend-openapi.yaml` (and
`docs/api/gateway-openapi.yaml`) — at current `main`. The committed export is **stale**: it was last
regenerated before the most recent WS-E / WS-D endpoints landed, so two merged, shipping routes are
**absent from the export** even though they exist in the code. Then reply with the **commit SHA** so
Donna can bump its pin to it.

## Why this matters to Donna

Donna's `npm run gen:api` reads the **vendored static file** `vendor/lq-ai/docs/api/backend-openapi.yaml`
(not a live/running API). So any route missing from that committed export is **invisible to Donna's
type generation** — we get no `components['schemas']` type and no path entry for it. The endpoints work
fine at runtime; they're just not in the published contract, which every API consumer relies on.

## The gap (verified against lq-ai source at pin `3659360`)

| Route | Exists in code | In `backend-openapi.yaml`? |
|---|---|---|
| `GET /api/v1/research/sources` | ✅ `api/app/api/research.py:116` — `@router.get("/sources", response_model=SourcesResponse)` (`SourcesResponse` defined `research.py:54`) | ❌ **absent** |
| `GET /api/v1/autonomous/sessions/{session_id}/ledger` | ✅ `api/app/api/autonomous.py:660` — `get_session_ledger` | ❌ **absent** |
| `GET /api/v1/chats/{chat_id}/ledger` | ✅ `api/app/api/chats.py:1796` | ✅ present (typed, `LedgerEntry`) |

**Root cause (hypothesis):** the export is not intentionally excluding these — their routers are
otherwise exported (`/api/v1/research/capabilities`, `/api/v1/research/search`,
`/api/v1/autonomous/sessions`, etc. all appear in the yaml). The chat ledger (`P1-A3`) is present, but
the newer `/research/sources` (**WS-E PR1a**) and `/autonomous/sessions/{id}/ledger` (**WS-D PR2**) are
not — consistent with the export having been regenerated at a point **after** the chat ledger but
**before** those two merged. i.e. the artifact is simply stale relative to `main`.

## What we need in the regenerated export

1. `GET /api/v1/research/sources` present, carrying its `SourcesResponse` schema (it has a
   `response_model`, so this should type cleanly — `{ sources: [{ name, type, jurisdiction, coverage,
   content_kinds[], enabled, egress_tier }] }`).
2. `GET /api/v1/autonomous/sessions/{session_id}/ledger` present. (Its handler returns
   `dict[str, Any]`, so an empty/loose body schema is expected — that's fine; we hand-parse the ledger
   body regardless. We just need the **path** to appear so it's part of the contract.)
3. A quick sanity pass that no other WS-E / WS-D routes are missing (authority-citation additions, etc.).

## Optional but appreciated — reconcile the integration doc's typing table

The handoff doc `docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` (§2.1) states
the chat/session **ledger bodies are untyped `dict[str,Any]` with empty `{}` schema**. In the committed
export, the **chat ledger is actually typed** (`LedgerEntry`). Not a blocker for us (we hand-parse the
loose/polymorphic parts — `source`, `treatment.citing`, `per_class_counts` — either way), but if the
ledger is meant to be typed going forward, updating that table would keep the doc and the export in
agreement.

## What Donna does on delivery

Bump `vendor/lq-ai` to the new SHA → `npm run gen:api` → confirm `/research/sources` +
`/autonomous/sessions/{id}/ledger` now appear in `src/lib/api/backend.d.ts` → build Slice 0 (research
source registry) and Slice 3 (autonomous audit timeline) against the generated types. No code changes
needed on your side beyond regenerating + committing the export.
