# Upstream follow-ups — WS5 transparency (post-PR6, pre-PR6e)

**To:** LQ-AI maintainer. **From:** Donna (Slice D — transparency / external-source citations).
**Pin reviewed:** `658fdbc` (PR6a/b/c/d). **Date:** 2026-06-20.

Donna's Slice D consumes PR6's contract — chat external-source (case-law) citations
(`GET /api/v1/chats/{chat_id}/messages/{message_id}/sources` → `ToolSource[]`) and the skill
`tool_usage` / `unavailable_tool_usage` fields — and ships them: a provenance pill + "Sources
consulted" panel under chat turns, and a read-only built-in skill inspector with a "Uses: …" note.
**This is shipped and live-verified** (a real case-law chat turn rendered "Sources consulted (30)"
with CourtListener links, backed by `message_tool_sources` rows). **No new contract is required to
complete Donna's implementation of PR6's features.**

The items below are **enhancements / known limits, none of which block PR6e** (the image-packaging
slice). They are surfaced so you can decide whether to fold any into PR6e or track them as DEs first.

## 1. Per-case source detail in _autonomous_ receipts (enhancement)

The autonomous receipt already surfaces tool intents — `tool_call.tool` is written as `str(intent)`
(`guard.py`), so Donna's receipt timeline already renders `retrieve_caselaw` / `call_mcp_tool` with
outcome + cost. What it does **not** carry is _which cases_ an autonomous `retrieve_caselaw` pulled
in — the autonomous analog of PR6c's chat `message_tool_sources`. If autonomous runs should show the
same "sources consulted" provenance Donna now shows for chat, the receipt's `tool_call` entries (or a
sibling endpoint) would need to carry the per-case source rows (label / url / external_ref), the way
`extract_tool_sources` already produces them for the chat tool-loop. Low priority; Donna will wire a
"Documents/Sources" block into the receipt view if the data appears.

## 2. Optional chat complete-frame echo: `has_tool_sources` (minor optimization)

PR6c adds no SSE signal, and external sources have no in-text marker (unlike citations, which gate on
`hasCitationMarkers`). So Donna fetches `GET …/sources` **unconditionally** on every completed
assistant turn — the endpoint returns `[]` cheaply for the common no-tool turn, but it is one extra
request per turn. A single boolean on the existing SSE `complete` frame (e.g. `has_tool_sources: true`,
echoed alongside `applied_skills`/`applied_file_ids`) would let Donna skip the fetch on turns that
consulted no tools. Purely an optimization — current behavior is correct.

## 3. `oauth_discover` 502 → api 500 for an unregistered OAuth MCP client (re-flag, DE-342 area)

Carried over from Slice C: when an OAuth MCP server is configured without a _registered_
`oauth_client_id`, the gateway's `oauth_discover` returns 502 and the api surfaces a 500 rather than a
typed "not configured" error. It blocks exercising connect-on-demand end-to-end in dev. Re-flagging in
case it's quick to fold in while WS5 is fresh.

## 4. Confirm DE-350 (generic MCP `source_kind='mcp'`) is tracked

PR6c's `message_tool_sources` is case-law-only (`source_kind='caselaw'`); the design spec notes
DE-350 to extend it to generic MCP tool results (`source_kind='mcp'`). Donna's `parseToolSources` +
`ToolSourcesPanel` already tolerate other `source_kind` values (they key off `label`/`url`), so when
DE-350 lands Donna will surface MCP sources with minimal change. Just confirming it's on your list.

## 5. Small local models return empty content in the governed tool-loop (reliability)

**Observed (dev, pin `658fdbc`):** with a small self-hosted local model (`ollama-local`,
`qwen3.5:4b`, tier 1), a case-law chat turn **intermittently returns empty assistant content**. Same
prompt ("Find a landmark U.S. Supreme Court case on free speech and cite it"), same model: two
consecutive turns persisted `messages.content` length **0** with **no `message_tool_sources` rows**,
while a later turn produced a full ~1200-char cited answer. The gateway logged
`POST /v1/tools/courtlistener-dev/search_case_law 200 OK` for the empty turns — so the model _did_
emit a tool call and the tool ran, but the model failed to synthesize a final answer (and the loop
captured no sources). The same prompt is 100% reliable on the cloud `anthropic-prod` (tier 4) model.

**Why it matters:** the governed tool-loop (PR5b/6c) assumes the model can do the
call-tool-then-synthesize round. Small local models often can't reliably, producing a silent empty
turn — a poor first impression for a self-hosted deployment.

**Donna already mitigates the UX** (an "empty response — try again or switch models" fallback + a
note steering research to a capable model). But the underlying reliability is backend/model-config:

- Options worth considering upstream: a **per-turn tier floor when a tool intent is involved** (route
  tool-using chat turns to a minimum-capable model), and/or **detect an empty post-tool completion and
  surface a typed signal** (e.g. a `finish_reason`/warning in the SSE complete frame) rather than an
  empty string, so clients can message it precisely; and/or **guidance on a minimum tool-capable local
  model** in the gateway docs. Not blocking; raising for the self-hosted story.

---

Still independently **upstream-blocked** (unchanged, not part of PR6): **A2** — an in-app
CourtListener key surface — needs the runtime tool-provider key API in
`docs/upstream-requests/lq-ai-runtime-tool-provider-keys.md`.
