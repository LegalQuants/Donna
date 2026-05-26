# Donna — P2c Slice B1: Model / inference-tier picker

**Date:** 2026-05-25 · **Branch:** `p2c-composer-power` · **PR target:** `main` · **lq-ai pin:** `7c7ce14`

## Context: P2c-B decomposition

P2c Slice B ("composer power") covers three independent pre-send composer features. During brainstorming we split it into **three sub-slices, each its own PR**:

1. **B1 — Model / inference-tier picker** ← *this spec*
2. **B2 — Skill-attach** (search/attach skills + per-skill inputs) — own spec later
3. **B3 — Enhance Prompt** (rewrite draft before sending) — own spec later

B1 first because it establishes the model-threading pattern through the SSE BFF that B3 reuses, and it's the smallest surface. B2/B3 are out of scope here.

## Goal

Replace the hardcoded `model: 'smart'` in the chat SSE BFF with a composer control that lets the user pick a model alias per message, defaulting to `smart`, remembered across reloads. The composer control row introduced here is also the host for B2 (skill chips) and B3 (enhance) later.

## Live contract findings (spiked against the running stack, 2026-05-25)

`GET /api/v1/models` (authenticated proxy to the gateway's `/v1/models`) returned **142 entries** on the dev stack:

- **135 are `lq_ai_kind: "provider_native"`** — the raw provider catalog (whisper, tts, embeddings, image, moderation, sora, dozens of dated GPT/Claude snapshots). Unsuitable for a picker.
- **7 are `lq_ai_kind: "alias"`** — the curated set:

  | alias | `routed_inference_tier` | `lq_ai_resolves_to` |
  |---|---|---|
  | `smart` | 4 | `anthropic-prod/claude-opus-4-7` |
  | `fast` | 4 | `anthropic-prod/claude-sonnet-4-6` |
  | `budget` | 4 | `anthropic-prod/claude-haiku-4-5` |
  | `local` | 1 | `ollama-local/qwen3.5:9b` |
  | `local-fast` | 1 | `ollama-local/qwen3.5:4b-nvfp4` |
  | `local-thinking` | 1 | `ollama-local/qwen3.5:9b` |
  | `embedding` | 4 | `openai-prod/text-embedding-3-small` |

**Key consequences:**

- **`routed_inference_tier` does NOT rank the cloud aliases** — `smart`/`fast`/`budget` are all tier 4; only the local aliases are tier 1. The tier value distinguishes **cloud (4) vs local (1)**, not quality among cloud models. The picker therefore conveys cloud-vs-local via a **group label**, not a per-item tier number. The existing per-message tier badge (driven by the SSE `routed_inference_tier`) is unchanged and still meaningful as a cloud/local signal.
- **`embedding` is an alias but not a chat model** — it must be filtered out.
- The live response carries **`lq_ai_resolves_to`** and **`lq_ai_fallback_count`**, which are **absent from the pinned `src/lib/api/backend.d.ts`** (`/api/v1/models` 200 schema lists only `routed_inference_tier`/`provider_type`). The OpenAPI source omits them, so `npm run gen:api` will not produce them — B1 defines them in a **local type**. See "Follow-up" below.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Picker contents | **All 6 chat aliases** (`smart`/`fast`/`budget` + `local`/`local-fast`/`local-thinking`), grouped **Cloud / Local**. Filter out `embedding` and all `provider_native`. |
| Persistence | **Sticky + remembered** — selection synced to `localStorage['donna.model']`, survives reload and applies to new chats. Default `smart` on first use. |
| Placement | **Control row beneath the textarea**, picker left-aligned, menu opens **upward**. Designed to also host B2/B3 controls. |
| Trigger label | **Alias + resolved model**, e.g. `smart · Opus 4.7` (derived from `lq_ai_resolves_to`). |
| Architecture | **Thin BFF proxy + client fetch + rune store** (Approach 1). |

## Architecture & data flow

```
ModelPicker.svelte ──reads/writes──► model store (rune + localStorage)
      ▲ (in Composer control row)         │ selectedModel
      │                                    ▼
Composer.onsubmit(text, model) ─► page ─► chat.send(text, model)
                                            │ POST { content, model }
                                            ▼
            /chats/[id]/messages/+server.ts (reads model, default 'smart')
                                            ▼
                                  lq-ai POST …/messages
```

The **store is the single source of truth** for the selection; `ModelPicker` reads/writes it. The Composer passes the current model up through `onsubmit(text, model)` at submit time, so `chatStream` carries `model` as an explicit argument and does not import global state.

## New / changed files

**New**

- `src/routes/(app)/models/+server.ts` — `GET` thin proxy: `lqFetch(event, '/api/v1/models')`. Pass through `503`/`504` as-is (gateway unreachable/timeout per the endpoint's documented errors), map any other non-2xx to `502`. Return the JSON body verbatim. Mirrors the receipts proxy pattern.
- `src/lib/models/types.ts` — local types:
  - `RawModelEntry` = generated `/models` data item **extended** with optional `lq_ai_resolves_to?: string` and `lq_ai_fallback_count?: number`.
  - `ChatModelOption = { id: string; label: string; resolvedModel: string | null; group: 'cloud' | 'local'; tier: number | null }`.
- `src/lib/models/normalize.ts` — **pure** functions (unit-tested):
  - `toChatOptions(raw: RawModelEntry[]): ChatModelOption[]` — keep `lq_ai_kind === 'alias'`; drop `id === 'embedding'` and any entry whose `lq_ai_resolves_to` matches a **non-chat denylist** (`text-embedding`, `whisper`, `tts`, `dall-e`, `gpt-image`, `image-`, `moderation`, `realtime`, `sora`, `audio`, `transcribe`); compute `group` (`local` when `lq_ai_resolves_to` starts with `ollama` **or** `tier === 1`, else `cloud`); compute `label` via `prettifyModel`.
  - `prettifyModel(resolvesTo: string | null): string` — take the segment after `/`, strip a known vendor prefix, title-case the family (`claude-opus-4-7` → `Opus 4.7`); fall back to the raw tail (`qwen3.5:9b` → `qwen3.5:9b`); empty/null → `''`.
- `src/lib/models/store.svelte.ts` — rune-backed store:
  - `selectedModel` getter/`setModel(id)` setter; init from `localStorage['donna.model']`, fallback `'smart'`; setter persists (guard for unavailable storage).
  - `loadModels()` — `fetch('/models')` → `toChatOptions` → exposes `options`, `loading`, `error`. On error, `options` is the **fallback** (`[{ id:'smart', label:'smart', resolvedModel:null, group:'cloud', tier:null }]`) and `error` is set.
  - On load, if the persisted `selectedModel` is **not** among `options`, reset it to `'smart'`.
- `src/lib/components/ModelPicker.svelte` — dropdown:
  - Trigger button shows `{id} · {label}` (label omitted when empty); `aria-haspopup="listbox"`, `aria-expanded`.
  - Menu opens upward, grouped `Cloud` / `Local` with small uppercase group labels; each item is a `role="option"`; current selection marked. Keyboard: Enter/Space to open, Arrow keys to move, Enter to select, Escape to close; click-outside closes.
  - When `error` (list unavailable), render only the static `smart` item plus a muted "model list unavailable" note.

**Changed**

- `src/lib/components/Composer.svelte` — restructure to a vertical layout: the textarea on top, then a **control row** beneath it (separated by a top border) holding `<ModelPicker>` left-aligned and the existing **send/stop button right-aligned** (matches approved mockup A). Change the submit contract to `onsubmit?(text: string, model: string)`, reading `selectedModel` from the store at submit time. Enter-to-send and the streaming/stop toggle behavior are preserved.
- `src/lib/chat/chatStream.svelte.ts` — `send(content, model)` and `runStream(idx, content, model)`; include `model` in the POST body. Persist `lastModel` alongside `lastUserContent` so `retry()` re-runs with the same model.
- `src/routes/(app)/chats/[id]/messages/+server.ts` — read `body.model` (string); default `'smart'` when absent/blank; pass through to lq-ai. Drop the hardcoded literal.
- `src/routes/(app)/chats/[id]/+page.svelte` — wire the `model` arg from Composer's `onsubmit` into `chat.send(text, model)`.

## Error handling & edge cases

- **`/models` fails** (502/503/504) → picker degrades to the single static `smart` option + muted note; **sending is never blocked** (BFF defaults to `'smart'`).
- **localStorage unavailable** (private mode / disabled) → in-memory default `'smart'`; setter no-ops on write failure.
- **Persisted model no longer offered** (operator removed an alias) → reset to `'smart'` on load.
- **Unknown `model` posted** → backend owns validation; BFF forwards as-is (only defaulting when blank).
- **Tier badge** unchanged — reflects the routed tier from the SSE stream, independent of the picker.

## Testing & verification

- **Unit (vitest):** `normalize.ts` — drops `embedding` + provider-native; cloud/local grouping (ollama/tier-1 → local); `prettifyModel` cases (claude family, qwen tail, null); `toChatOptions` keeps the 6 expected aliases from a captured live fixture.
- **Store/component:** selecting an option updates the store and `localStorage`; persisted-but-absent id resets to `smart`; empty/error options render the fallback + note.
- **BFF:** `messages/+server.ts` forwards `body.model` and defaults to `'smart'` when absent; `models/+server.ts` maps 503/504 pass-through and other errors to 502.
- **Live e2e (Playwright vs running stack):** open a chat → picker shows 6 aliases grouped Cloud/Local → select `fast` → send → **assert the outgoing `POST /chats/[id]/messages` body carries `model:'fast'`** (tier badge can't distinguish cloud aliases, all tier 4, so assert the request body) → reload → selection persists.
- **Gate:** `npm run check` = 0 errors / 0 warnings; `npx vitest run`; `npx playwright test`. Verify against the real backend, not just unit tests.

## Out of scope

- Provider-native model selection / searchable full catalog (rejected for B1; possible future "advanced" affordance).
- Per-chat server-side model memory (no backend field; `MessageCreate.model` is per-message).
- B2 skill-attach and B3 enhance-prompt (separate slices).

## Follow-up (non-blocking)

File a `docs/upstream-requests/` note asking lq-ai to document `lq_ai_resolves_to` and `lq_ai_fallback_count` in the `/api/v1/models` 200 response schema so `npm run gen:api` emits them and B1 can drop its local type extension. Not required to ship B1.
