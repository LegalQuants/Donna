# Donna — P2c Slice B3: Enhance Prompt (composer)

**Date:** 2026-05-26 · **Branch:** `p2c-b3-enhance-prompt` · **PR target:** `main` · **lq-ai pin:** `438198c`

## Context: P2c-B decomposition

Third and final P2c-B ("composer power") sub-slice, each its own PR:

1. **B1 — Model / tier picker** ✅ merged (#5, #6)
2. **B2 — Skill-attach** ✅ merged (#7)
3. **B3 — Enhance Prompt** ← *this spec*

## Goal

Add a `✦ Enhance` affordance to the in-chat composer that rewrites the user's draft into a stronger legal prompt via `POST /api/v1/enhance-prompt`, shown as a **preview the user accepts or discards** (not a silent replace). Records the outcome via `PATCH /api/v1/enhance-prompt/{interaction_id}`.

## Live contract findings (spiked against the running stack, 2026-05-26)

- `POST /api/v1/enhance-prompt` is a **single-JSON (non-streaming)** call that took **~20s** on the dev stack (default `fast` alias → `claude-sonnet-4-6`, tier 4). The latency is the dominant UX driver: it needs an explicit loading state and should be cancelable.
- Response (`EnhancePromptResponse`, a named schema component): `interaction_id`, `expansion_applied` (bool), `expanded_prompt` (the rewrite — substantial; e.g. "review this nda" → a full structured in-house-counsel prompt), `reasoning[]` ("Added role/perspective/scope/citations: why" bullets), `skip_reason?`, `preview_to_user?` (a pre-formatted render), `routed_*`.
- When `expansion_applied=false` (model declined, or `skip_reason='parse_error'`), `expanded_prompt` **echoes `raw_input`** — so we must not blindly apply it.
- Request (`EnhancePromptRequest`): `raw_input` (required), optional `chat_id`, `attached_skills:[{name,description?}]`, `attached_files?`, `jurisdiction?`, `model?` (default `fast`).
- `PATCH /api/v1/enhance-prompt/{interaction_id}` `{used?, edited_before_use?}` — outcome telemetry, owner-only (404 otherwise), idempotent.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Result UX | **Preview card above the composer** — shows `expanded_prompt` + collapsible `reasoning[]`; original draft stays in the textarea until **Use this** (applies, still editable) or **Discard**. Non-modal, transparent. |
| Context sent | `raw_input` + **`chat_id`** + **`attached_skills`** (the B2 attached skill names → `[{name}]`). |
| Scope | **In-chat only** — the `✦ Enhance` affordance is hidden on the landing composer (chat page owns the controller). |
| Latency UX | Explicit **"Enhancing…"** state with **cancel** (AbortController). |
| Telemetry | `accept` → PATCH `{used:true}`; `discard` → PATCH `{used:false}` (fire-and-forget). `edited_before_use` deferred. |
| Architecture | **Dedicated `createEnhance` rune controller** + two thin proxies + presentational `EnhancePreview.svelte`; mirrors B1/B2. |

## Architecture & data flow

```
EnhancePreview.svelte (card: expanded_prompt + collapsible reasoning + Use this / Discard)
   ▲ props: result, onaccept, ondiscard
createEnhance(chatId, () => skillAttach.names) — rune controller:
   status: idle → loading → (preview | skipped | error); result;
   run(draft), cancel(), accept()→returns expanded_prompt +PATCH{used:true}, discard()+PATCH{used:false}
   ▲ created by chat +page.svelte (closes over chatId + a getter for the B2 attached skill names)
Composer (enhance? prop): ✦ Enhance button (run(value); loading↔cancel) + <EnhancePreview> above textarea;
   accept → value = expanded_prompt (editable, then send normally)
   POST /enhance-prompt {raw_input, chat_id, attached_skills:[{name}]}  ·  PATCH /enhance-prompt/{id} {used}
```

The chat page owns one `createEnhance(data.chatId, () => skillAttach.names)` instance (the getter reuses the B2 skill controller). The Composer renders the button + preview only when the `enhance` prop is present, so the landing composer shows nothing.

## New / changed files

**New**

- `src/routes/(app)/enhance-prompt/+server.ts` — `POST` thin proxy: `lqFetch(event, '/api/v1/enhance-prompt', { method:'POST', body: <forwarded JSON string> })`. Pass through 503/504; map any other non-2xx to 502. Returns the JSON body. Mirrors the `/models` proxy.
- `src/routes/(app)/enhance-prompt/[interaction_id]/+server.ts` — `PATCH` thin proxy: forwards the body to `/api/v1/enhance-prompt/{interaction_id}`. Map 404→404, else non-2xx→502. Returns the JSON body.
- `src/lib/enhance/types.ts` — `export type EnhancePromptResponse = components['schemas']['EnhancePromptResponse'];` (and `EnhancePromptRequest` if useful), imported from `$lib/api/backend`.
- `src/lib/enhance/enhance.svelte.ts` — `createEnhance(chatId: string, getSkills: () => string[])`:
  - State: `status: 'idle' | 'loading' | 'preview' | 'skipped' | 'error'`, `result: EnhancePromptResponse | null`.
  - `run(rawInput: string, fetchFn = fetch)` — return early if `rawInput` is blank or `status === 'loading'`. Set `status='loading'`, create an `AbortController`. POST `/enhance-prompt` with `{ raw_input: rawInput, chat_id: chatId, attached_skills: getSkills().map((name) => ({ name })) }` (signal attached). On `!res.ok` → `status='error'`. On ok → `result = body`; `status = body.expansion_applied ? 'preview' : 'skipped'`. On `AbortError` → `status='idle'`.
  - `cancel()` — abort the in-flight request; `status='idle'`.
  - `accept(): string` — capture `text = result.expanded_prompt`; fire-and-forget `PATCH /enhance-prompt/{result.interaction_id}` `{ used: true }`; reset (`status='idle'`, `result=null`); return `text`.
  - `discard()` — fire-and-forget PATCH `{ used: false }` (when a `result` with `interaction_id` exists); reset.
  - Getters: `status`, `result`.
- `src/lib/components/EnhancePreview.svelte` — **presentational** (plain props, like `ModelPicker`/`SkillAttach`). Props: `result: EnhancePromptResponse`, `onaccept: () => void`, `ondiscard: () => void`. Renders `result.expanded_prompt` (serif), a "Why these changes ({reasoning.length})" toggle (local `showReasoning` state) revealing the `reasoning[]` list, and **Use this** (`onaccept`) / **Discard** (`ondiscard`) buttons. Left-accent card styling above the composer.

**Changed**

- `src/lib/components/Composer.svelte` — add optional `enhance?` prop (the controller). In the control row, add a `✦ Enhance` button beside the model picker / skill button: disabled when `!value.trim()`; on click → `enhance.run(value)`; while `enhance.status === 'loading'` it shows "Enhancing…" + a cancel ✕ (→ `enhance.cancel()`). Above the textarea (alongside the B2 chips): when `enhance.status === 'preview'` render `<EnhancePreview result={enhance.result} onaccept={() => (value = enhance.accept())} ondiscard={enhance.discard} />`; when `'skipped'` a muted "No changes suggested." note; when `'error'` a muted "Couldn't enhance the prompt." note. All gated by `{#if enhance}`.
- `src/routes/(app)/chats/[id]/+page.svelte` — `const enhance = createEnhance(data.chatId, () => skillAttach.names);` and pass `{enhance}` to the Composer (alongside the existing `{skillAttach}`).

## Error handling & edge cases

- **~20s latency** → explicit "Enhancing…" + cancel (AbortController). The rest of the composer (typing, send, model/skill controls) stays usable.
- **`expansion_applied:false` / `skip_reason`** (incl. `parse_error`) → `status='skipped'`, brief note; the **draft is left untouched** (we never apply the echoed `raw_input`).
- **POST failure** (502/503/504) → `status='error'`, muted note; draft untouched; **sending is never blocked**.
- **Empty draft** → Enhance button disabled.
- **Accept** → `expanded_prompt` replaces the textarea value (editable); the user can tweak, then send normally.
- **Cancel mid-flight** → abort → `idle`.
- **PATCH telemetry** is fire-and-forget; failures are ignored (non-blocking). `edited_before_use` is deferred.
- **In-chat only** — no Enhance affordance on the landing composer.

## Testing & verification

- **Unit (vitest):** `createEnhance` — `run` posts `raw_input`+`chat_id`+`attached_skills` and sets `preview`; skip path (`expansion_applied:false` → `skipped`); error path (`!ok` → `error`); `accept` returns `expanded_prompt` and fires PATCH `{used:true}` to `/enhance-prompt/<interaction_id>`; `discard` fires `{used:false}`; `cancel` aborts → `idle`; blank/`loading` guard. Inject `fetchFn`.
- **BFF:** `enhance-prompt` POST proxy (forwards body, 503/504 passthrough else 502); `[interaction_id]` PATCH proxy (forwards body, 404 map).
- **Component:** `EnhancePreview` renders `expanded_prompt`, toggles the reasoning list, fires `onaccept`/`ondiscard`.
- **Composer:** `✦ Enhance` present only when the `enhance` prop is passed (hidden otherwise); clicking runs; preview shown on `preview`; accept sets the textarea `value`; skip/error notes render.
- **Live e2e (Playwright vs running stack):** in a chat, type "review this nda" → `✦ Enhance` → (loading) → the preview card appears with the enhanced text and a reasoning toggle → **Use this** → the textarea now holds the expanded prompt (assert it contains "in-house counsel") → a `PATCH /enhance-prompt/<id>` request fired. Use a generous timeout (~30s) for the enhance call.
- **Gate:** `npm run check` 0 errors / 0 warnings; `npx vitest run`; `npx playwright test`. Verify against the real backend.

## Out of scope (deferred)

- `attached_files` and `jurisdiction` request inputs.
- `edited_before_use` telemetry (used-only for now).
- Enhance on the landing composer.
- Streaming (the endpoint returns a single JSON body).
