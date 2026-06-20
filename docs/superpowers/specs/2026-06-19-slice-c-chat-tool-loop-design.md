# Slice C — governed chat tool-loop: confirm gate + connect-on-demand (design)

**Date:** 2026-06-19 · **Milestone:** legal-research + MCP (slice C) · **Backend:** lq-ai pin
`97ccbc0` (PR5a #181 + PR5b #187, WS4). Read with the milestone map
(`docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`), the pin log top entry,
and the Slice B2 spec (the OAuth connect route this extends).

## Goal

Surface the two user-visible halves of lq-ai's governed chat tool-loop:

1. **Destructive-tool confirmation gate** — when the assistant proposes a destructive /
   `requires_confirmation` tool, the turn pauses; the user **approves or denies**, and the turn
   **resumes** streaming.
2. **Connect-on-demand** — when the assistant calls an OAuth MCP tool the user hasn't connected, an
   inline **Connect** prompt sends them through the per-user OAuth flow (Slice B2) and back to the chat.

## What the backend actually emits (verified at pin `97ccbc0`)

The tool-loop runs **non-streaming, server-side**: there are **no** inline `tool_use` / `tool_result`
/ provenance frames. A successful turn streams exactly as today (`start` → `delta` → `complete`). The
loop's only new user-visible output is **two terminal SSE events** (after either, the backend closes
the stream — no `complete` follows). Source: `api/app/api/chats.py` `_stream_response` /
`resume_tool_call`, `api/app/chat/tool_loop.py`.

```jsonc
// tool_confirmation_required — destructive/requires_confirmation tool gate (terminal)
{ "type": "tool_confirmation_required",
  "lq_ai_message_id": "<uuid>",
  "pending_call_id": "<uuid>",          // → the resume endpoint
  "provider": "files", "tool": "delete_doc",
  "function_name": "mcp__files__delete_doc",
  "args_summary": { "<key>": "<short scalar | '<dict(N keys)>' | '<list(N items)>'>" }, // redacted, never raw
  "tier": 2, "destructive": true }

// mcp_authorization_required — OAuth MCP tool, no valid token (terminal)
{ "type": "mcp_authorization_required",
  "lq_ai_message_id": "<uuid>",
  "server": "context7",
  "authorize_url": "/api/v1/mcp/oauth/context7/authorize" }
```

**Resume endpoint:** `POST /api/v1/chats/{chat_id}/tool-calls/{pending_call_id}` body
`{ "decision": "approve" | "deny" }` → a **new SSE stream** (same `start`/`delta`/`complete` shape, or
another gate) that resumes the turn. Persist-and-resume (DB row, 15-min TTL, single-use). Errors:
**404** (not found / non-owner, id-probing-safe), **409** (already resolved / expired), **400**
(malformed). `ToolCallDecisionRequest = { decision }` and the endpoint are in `backend.d.ts`.

Notes consumed from the contract: only the **first** gated call in a round gates (siblings abandoned;
the model re-plans). The per-turn cap (8) and the cluster cache are backend-internal — invisible to
the client. On `mcp_authorization_required` the backend does **not** auto-resume; the user re-sends
after connecting.

## Donna integration points (verified)

- SSE parse: `src/lib/chat/sse.ts` (`StreamFrame` union + `parseDataPayload` switch; unknown `type` →
  `null`, silently dropped today).
- Stream consumer + store: `src/lib/chat/chatStream.svelte.ts` (`runStream` read loop, `applyFrame`
  switch, `ChatMessage` shape, `send`/`retry`/`stop`).
- Render: `src/lib/components/Message.svelte` (the assistant bubble; non-user branch lines ~72–128).
- BFF stream pattern: `lqStream` (`src/lib/server/lqClient.ts`) + the messages proxy
  `src/routes/(app)/chats/[id]/messages/+server.ts` (pipe `upstream.body` straight back).
- OAuth connect route (Slice B2): `src/routes/(app)/settings/connections/[server]/connect/+server.ts`.

## Design

### 1. SSE layer — `src/lib/chat/sse.ts`

Extend the `StreamFrame` union with two members and add two `parseDataPayload` branches that validate
`lq_ai_message_id` (+ `pending_call_id` / `server` + `authorize_url`) are strings and pass the rest
through with light guards (string/number/boolean; `args_summary` kept as an opaque
`Record<string, unknown>`). Malformed → `null` (existing convention).

### 2. Chat store — `src/lib/chat/chatStream.svelte.ts`

- `ChatMessage.status` gains `'awaiting_confirmation' | 'awaiting_auth'`.
- New optional fields: `confirmation?: { pending_call_id, provider, tool, function_name, args_summary,
tier, destructive }` and `mcpAuth?: { server, authorize_url }`.
- **Refactor:** extract the `reader`/parser read loop from `runStream` into a shared
  `consumeStream(idx, response)` so the initial send and the resume share one code path.
- `applyFrame`: on `tool_confirmation_required` → set `confirmation`, `status='awaiting_confirmation'`;
  on `mcp_authorization_required` → set `mcpAuth`, `status='awaiting_auth'`. Both signal the read loop
  to end (backend closed the stream); neither triggers `loadCitations`/`loadAnonymization`.
- New `decide(idx, decision)`: guards `messages[idx].confirmation`; clears `confirmation`, sets
  `status='streaming'`; `fetch('/chats/{chatId}/tool-calls/{pending_call_id}', {POST, {decision}})` →
  `consumeStream(idx, res)` (the resumed turn streams into the **same** message). On `!res.ok`: set a
  friendly error on the message (`404`/`409` → "This confirmation expired — please re-send."; else the
  generic stream error).
- The `mcpAuth` case needs no store action beyond rendering — the user navigates via the Connect link.
  The SSE's `authorize_url` (the bare api path) is **not** used directly — the browser holds no bearer
  — so the card links to Donna's **BFF connect route** (built from `server`), which attaches auth.

### 3. BFF resume route — `src/routes/(app)/chats/[id]/tool-calls/[pending_call_id]/+server.ts`

A `POST` handler: read `{decision}` from the request, `lqStream(event, '/api/v1/chats/{id}/tool-calls/
{pending_call_id}', {method:'POST', body})`, return `new Response(upstream.body, {status, headers:
{content-type, cache-control:'no-cache'}})`. Mirrors the messages proxy exactly; non-ok status passes
through so the client can react.

### 4. Render — `src/lib/components/Message.svelte`

Two new branches in the non-user content area:

- **`awaiting_confirmation`** → a bordered card: a header "_{tool}_ on _{provider}_"; a **destructive**
  warning row when `destructive`; the `args_summary` rendered as a small key/value list; a tier pill
  (reuse the existing tier styling); **Approve** (primary) and **Deny** (subtle) buttons calling a new
  `ondecide(message, 'approve' | 'deny')` callback prop. While the resume streams, the card is replaced
  by the normal streaming content (status flips back to `'streaming'`).
- **`awaiting_auth`** → a card: "Connect **{server}** to use this tool." with a **Connect** link to
  `/settings/connections/{server}/connect?return=/chats/{chatId}` (a real navigation).

The page (`chats/[id]/+page.svelte`) wires `ondecide` → `chat.decide(idx, decision)`.

### 5. Connect route generalization — `settings/connections/[server]/connect/+server.ts`

Accept an optional `return` query param: a **same-origin relative path** (must start with `/`,
default `/settings/connections`); reject anything else (open-redirect guard) and fall back to the
default. Build `return_url = ${origin}${returnPath}`. The existing B2 callers (no `return`) are
unchanged. Chat passes `?return=/chats/{chatId}`.

### 6. Connect return — chat page

On `chats/[id]` load with `?mcp_connected={server}` in the URL, show an inline banner: "Connected to
**{server}** — re-send your message?" with a **Retry** button that re-sends the last user message
(reuse the store's retry/last-user-content path). Explicit, not auto-resend (avoids surprise
double-sends). `?mcp_error=…` shows a matching "couldn't connect" banner.

## Error handling / degradation

- Resume non-ok: 404/409 → friendly per-message error ("expired — re-send"); other → generic
  stream error (existing pattern). The turn's prior content (none, since the gate is terminal) is not
  lost because no assistant text preceded the gate.
- Unknown/malformed SSE frame → dropped (existing). A gate frame missing `pending_call_id` →
  treated as malformed (dropped), so the turn just ends without a card rather than rendering a broken
  one.
- Connect `return` param validation prevents an open redirect.

## Testing

- **Unit (`sse.test.ts`):** parse both new frames (valid + malformed-dropped).
- **Store (`chatStream.svelte.test.ts`):** send → `tool_confirmation_required` → `status` +
  `confirmation` fields; `decide('approve')` → resume stream → `delta`/`complete` into the same
  message; `decide('deny')` → resume; `mcp_authorization_required` → `status` + `mcpAuth`; resume
  `409` → friendly error. (Mirror the existing `streamResponse(frames)` + `vi.stubGlobal('fetch')`
  harness, including the fetch-call-order convention.)
- **Resume proxy (`tool-calls/[pending_call_id]/server.test.ts`):** forwards the POST + `{decision}`
  body to the right path; pipes the SSE response.
- **Component (`Message.svelte` test):** the confirmation card (tool/provider, destructive warning,
  args summary, Approve/Deny call `ondecide`); the connect card (link href to the connect route with
  the chat `return`).
- **Connect route test:** `?return=/chats/abc` honored; a non-`/` or cross-origin `return` falls back
  to `/settings/connections`.
- **Live e2e (`tests/chat-tool-loop.spec.ts`, gated):** with DeepWiki enabled (its tools are
  un-annotated → `requires_confirmation`), send a message that asks the assistant to use a DeepWiki
  tool → assert a confirmation card appears → **Approve** → the answer streams in; (deny path asserted
  too). Self-skips if no MCP tools are configured. The model-discretionary nature (will it call the
  tool?) is handled by an explicit instruction in the prompt; if the assistant declines to call a
  tool, the test skips that leg honestly rather than failing.

## Live verification (dev)

DeepWiki + Context7 are already wired (Slice B/B2). Enable DeepWiki's tools (admin `/settings/mcp` →
Refresh → toggles on), chat asking to use one → confirm gate; chat asking to use a Context7 tool →
connect-on-demand. The connect round-trip stops at the AS (Context7 placeholder client — the Slice B2
honest limit), which is enough to verify the inline Connect prompt + return banner.

## Out of scope (Slice D / PR6)

Provenance pills ("this answer used tools"), external-source (case-law) citations through the citation
UI, inline tool-call/round rendering, per-chat cumulative cost cap, token-streaming during tool rounds.
All gated on PR6/WS5 (the source-kind citation modeling is net-new backend, not in this pin).
