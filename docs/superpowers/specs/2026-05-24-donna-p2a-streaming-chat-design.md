# Donna P2a — Core Streaming Chat Design

> **Status:** Approved design (brainstorming output). Implementation contract for the first slice of Phase P2.
> **Date:** 2026-05-24
> **Builds on:** P0+P1 (merged to `main`, PR #1) — BFF auth/session, app shell, Composer, the assistant landing that creates a chat and stashes a draft.
> **Scope of this spec:** **P2a only** — the working chat conversation surface (history, streaming send, serif markdown, tier badge). The verified **citation pills are P2b**; receipts/anonymization/composer power-features are **P2c**. Both are out of scope here.

---

## 1. Context

P2 is the chat hero — the surface that proves Donna's thesis. P2a delivers the _functional_ conversation: it replaces the P1 placeholder at `/chats/[id]` with a real, streaming chat against the lq-ai backend, in the document-forward MikeOSS visual language. P2b then layers the verified citation pills on top.

**Visual direction (decided via mockups):**

- **Document-forward layout** — assistant answers render as full-width **serif prose** (like a legal memo), user turns are a quiet right-aligned chip. No bright chat bubbles.
- **Streaming** — a small **pulsing mark** appears immediately, then tokens stream in with a blinking caret; the **Inference Tier** chip reads "Tier…" until the gateway resolves it, then locks to the number. **Shimmer skeletons** are used only when loading existing history.
- **Complete** state shows a **Copy** action; **error** state shows an inline **Retry**.

### 1.1 Verified backend contract

- **History:** `GET /api/v1/chats/{id}/messages` → `{ items: Message[], next_cursor }` (cursor-paginated, oldest-first).
- **Send:** `POST /api/v1/chats/{id}/messages` with `MessageCreate { content, model (default "smart"), stream }`.
  - `stream: true` → `text/event-stream`. Each SSE `data:` line is a JSON frame discriminated by `type`, OpenAI-style, terminated by `data: [DONE]`:
    - `MessageStart { type:"start", lq_ai_message_id, chat_id }`
    - `MessageDelta { type:"delta", delta, lq_ai_message_id, routed_inference_tier?, applied_skills? }`
    - `MessageComplete { type:"complete", lq_ai_message_id, message: Message, citations?, routed_inference_tier?, routed_provider? }`
    - On mid-stream failure: an `Error { detail: { code, message, details? } }` frame (no `complete`).
  - Tier is also on the `X-LQ-AI-Routed-Inference-Tier` response header.
  - Error statuses: `400` (bad/empty), `401`, `403` (tier-floor / password-change gate), `502/503/504` (gateway).
- **Message:** `{ id, chat_id, role, content, applied_skills?, routed_inference_tier?, routed_provider?, routed_model?, prompt_tokens?, completion_tokens?, cost_estimate?, created_at }`.
- **Inline citations:** the model emits `"<quote>" (Source: [N])` pairs; `[N]` maps to `citations[N-1]`. **P2a renders message content verbatim (markers as plain text); P2b transforms them into interactive pills.**

---

## 2. Architecture — streaming through the BFF

`EventSource` is GET-only, but sending requires a POST body, so streaming uses `fetch` + a stream reader, proxied through SvelteKit so the JWT never leaves the server.

```
Composer ──POST /chats/[id]/messages (SvelteKit +server)──▶ lqStream ──▶ lq-ai api (stream:true)
   ▲                                                                          │ text/event-stream
   └── client reads response.body.getReader() ◀── piped through, unbuffered ──┘
        → SSE parser → chatStream state machine → <Message> renders live
```

- **BFF endpoint** `src/routes/(app)/chats/[id]/messages/+server.ts` (`POST`): reads the JSON body, calls `lqStream(event, '/api/v1/chats/{id}/messages', { method:'POST', body })`, and returns a `Response` whose body is the **upstream SSE stream piped straight through** (set `content-type: text/event-stream`, no buffering). Non-2xx upstream → forward the status + `Error` body.
- **Auth:** `lqStream` attaches the Bearer from cookies (single attempt — the preceding page `load` keeps the session fresh). A mid-stream `401`/`403` is surfaced to the client as an error (re-login for 401).
- **Why not refresh inside the stream:** refresh-on-401 mutates cookies, which can't be done once streaming headers are sent. The page `load` (which uses `lqFetch`, with refresh) runs immediately before, so the access token is fresh at send time. This is acceptable for P2a.

---

## 3. Components (small, focused, testable)

| File                                                               | Responsibility                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/(app)/chats/[id]/+page.server.ts`                      | `load`: fetch history via `lqFetch(GET /messages)`; read+clear `donna_draft` cookie → `autoSend` string                                      |
| `src/routes/(app)/chats/[id]/messages/+server.ts`                  | `POST` BFF SSE proxy (via `lqStream`)                                                                                                        |
| `src/lib/chat/sse.ts`                                              | Pure SSE frame parser: bytes/string chunks → typed frames; handles frames split across chunks and `[DONE]`                                   |
| `src/lib/chat/chatStream.svelte.ts`                                | Client streaming state machine (runes): `messages` state, `send(content)`, `stop()` (AbortController), `status` (idle/streaming/error), tier |
| `src/lib/components/Message.svelte`                                | One message: user chip vs assistant serif prose, tier chip, Copy action, streaming caret                                                     |
| `src/lib/components/Markdown.svelte`                               | Serif markdown renderer (GFM + math), sanitized                                                                                              |
| `src/lib/components/Composer.svelte` _(modify)_                    | Add a send↔stop toggle driven by streaming status                                                                                            |
| `src/routes/(app)/chats/[id]/+page.svelte` _(replace placeholder)_ | Message list (scroll, auto-scroll-to-latest), shimmer on history load, composer, wires `chatStream`                                          |

### 3.1 Markdown rendering

Use **`svelte-exmarkdown`** with `remark-gfm`, `remark-math`, `rehype-katex`, and **`rehype-sanitize`** (model output is untrusted — sanitize). Serif styling via the existing tokens (`font-serif`, prose-like spacing). KaTeX CSS imported once. (Library is overridable — `markdown-it` + `DOMPurify` + `katex` is an acceptable substitute if `svelte-exmarkdown` fights Svelte 5; the sanitize requirement is not.)

---

## 4. Data flow

1. **Land → stream (the P1→P2a join):** the landing creates a chat, stashes the first message in `donna_draft`, redirects to `/chats/{id}`. P2a `load` returns history + the draft. On mount, if a draft is present and history is empty, `chatStream.send(draft)` fires automatically.
2. **Send:** append an optimistic `user` message → `POST` to the BFF stream endpoint → on `start`, create a live `assistant` message (status streaming) → on each `delta`, append `delta` text and set tier → on `complete`, replace the live content with `message.content` (canonical), lock tier/provider, stash `citations` on the message (unused until P2b), status idle.
3. **Stop:** `AbortController.abort()` cancels the fetch; the partial assistant text remains visible; status idle. (Backend persists the partial row with `error_code` per its contract.)
4. **History load:** `load` returns oldest-first messages; render with shimmer placeholders until resolved; auto-scroll to the latest.

---

## 5. Error handling

- **`Error` frame / non-2xx:** set status error; render the assistant turn's inline error with a **Retry** that re-sends the same user content.
- **`401` mid-stream:** surface "session expired" → redirect to `/login?next=/chats/{id}`.
- **`403` tier-floor / password-change:** show the backend `detail.message` inline (no retry).
- **Empty content:** already prevented by the Composer (disabled send).
- **Network drop mid-stream:** reader throws → treated as an `Error` (Retry available).

---

## 6. Testing

**Unit (Vitest):**

- `sse.ts`: parses `start`/`delta`/`complete`; an `Error` frame; `[DONE]` termination; a single JSON frame **split across two chunks**; multiple frames in one chunk.
- `chatStream.svelte.ts`: `send` appends an optimistic user msg + a streaming assistant msg; deltas accumulate; `complete` finalizes content + tier; `stop()` aborts and leaves partial text; an `Error` frame sets error status.

**Component (Vitest + @testing-library/svelte):**

- `Message.svelte`: renders a user chip vs assistant prose; tier chip shows "Tier 3"; streaming caret present iff streaming; Copy action present on complete.
- `Markdown.svelte`: renders GFM (a table/list); **strips a `<script>`** (sanitization assertion).

**E2E (Playwright, against the live stack):**

- **Provider:** **Anthropic**. `ANTHROPIC_API_KEY` is set in `.env` (gitignored — never committed) and the gateway's alias config maps `smart` → an Anthropic model. (Dependency to confirm at execution: the seeded `gateway.yaml` maps `smart` → a Claude model.)
- Send a message → assert assistant tokens appear (content grows) → the tier chip resolves to "Tier N" → on reload the assistant message persists (history `load`).
- Click **Stop** during a stream → streaming halts, partial text remains.
- The landing draft auto-sends on first load of a new chat.

---

## 7. Out of scope (P2a)

- Interactive **citation pills** + hover/click (P2b) — markers render as plain text here; `citations` from `complete` are stored but not rendered.
- **Receipts** drawer, **anonymization** indicator, **composer power features** (skill-attach, Enhance Prompt, model/tier _picker_) — P2c. P2a hardcodes `model: "smart"`.
- **Document side panel** + citation highlighting — P3.
- Chat list/sidebar recents population, rename, archive — later.

---

## 8. Decisions log

| #     | Decision                                                                                | Rationale                                                          |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D2a-1 | Document-forward message layout (serif prose, no assistant bubbles)                     | Mockup choice; the legal-memo feel is Donna's identity             |
| D2a-2 | Streaming = live tokens + pulsing mark; shimmer only for history load                   | Mockup choice; immediate feedback                                  |
| D2a-3 | Stream via `fetch`+reader through a SvelteKit `+server` BFF proxy (not `EventSource`)   | POST body required; keeps JWT server-side; no CORS                 |
| D2a-4 | No token refresh mid-stream; rely on the preceding `load`                               | Can't mutate cookies after stream headers sent; acceptable for P2a |
| D2a-5 | `svelte-exmarkdown` + GFM/math + **rehype-sanitize**                                    | Svelte-native; model output must be sanitized                      |
| D2a-6 | Markers render as plain text in P2a; pills are P2b                                      | Keep P2a focused on the streaming spine                            |
| D2a-7 | E2E uses a real **Anthropic** key in gitignored `.env` (gateway alias `smart` → Claude) | User choice; lightest path to verify real streaming                |

---

## 9. Open questions / assumptions to confirm during planning

1. **Gateway alias config:** confirm the seeded `gateway.yaml` (from `gateway.yaml.example`) maps `model: "smart"` → a Claude model so a `stream` request routes to Anthropic with `ANTHROPIC_API_KEY`. If not, set the alias in the gateway config.
2. **SSE frame envelope:** confirm whether frames arrive as bare `data: {json}` lines (OpenAI-style) vs named `event:` lines — the parser targets `data:`-line JSON with a `type` discriminator + the `detail`-wrapped error shape; adjust the parser if the wire format differs (verify with a one-shot `curl -N` against the live api during T1).
3. **`svelte-exmarkdown` + Svelte 5** compatibility at the pinned versions — fall back to `markdown-it` + `DOMPurify` + `katex` if it fights the toolchain (sanitization is non-negotiable either way).
