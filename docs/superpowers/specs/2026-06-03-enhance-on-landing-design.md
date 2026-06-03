# Enhance-on-landing — Design Spec

**Date:** 2026-06-03 · **Slice 1** of the post-#51 handoff · **Pin:** `vendor/lq-ai` @ `c22360a`

## Goal

Bring the existing `✦ Enhance` prompt-enhancement affordance — today wired only into the
in-chat composer — to the **landing / Assistant first-message composer** (`/`), reusing all
existing machinery. No backend change; the spike below confirmed standalone enhance works.

## Background

Enhance shipped in-chat (P2c-B3): `src/lib/enhance/enhance.svelte.ts` (`createEnhance`
controller), the `enhance` prop + `✦ Enhance` button + `EnhancePreview` UI in
`src/lib/components/Composer.svelte`, and the BFF proxies under `(app)/enhance-prompt/`.

The only reason enhance is absent on landing is a **frontend** gap, not a backend one:
- The landing page `src/routes/(app)/+page.svelte` never passes an `enhance` controller to
  `<Composer>` (Composer renders enhance UI only under `{#if enhance}`).
- `createEnhance(chatId: string, …)` requires a non-null `chatId`, but landing has no chat yet.

**Spike confirmed (2026-06-03):** `POST /api/v1/enhance-prompt {"raw_input":"…"}` with **no
`chat_id`** → HTTP 200, `expansion_applied: true`, `expanded_prompt` + `interaction_id` present.
Backend contract: `EnhancePromptRequest.chat_id: uuid | None = None`
(`vendor/lq-ai/api/app/api/enhance_prompt.py`); the null path is the documented
"standalone draft a fresh prompt" surface.

## Changes

### 1. `src/lib/enhance/enhance.svelte.ts` — relax the chatId type

- Signature: `createEnhance(chatId: string, getSkills)` → `createEnhance(chatId: string | null, getSkills)`.
- **No body-logic change.** The POST body already interpolates `chat_id: chatId`; when `chatId`
  is `null`, `JSON.stringify` emits `"chat_id": null`, which the backend accepts. **Decision
  (user-confirmed 2026-06-03): send explicit `chat_id: null`, do not omit the field** — smallest
  diff, keeps the in-chat and landing code paths identical.
- `run` / `accept` / `discard` / `cancel` and the PATCH `/enhance-prompt/{id}` telemetry are
  unchanged (telemetry is keyed on `interaction_id`, independent of chat).

### 2. `src/routes/(app)/+page.svelte` — wire enhance into the landing composer

Mirror the in-chat page (`src/routes/(app)/chats/[id]/+page.svelte:28`):
- Import `createEnhance` from `$lib/enhance/enhance.svelte`.
- `const enhance = createEnhance(null, () => skillAttach.names);` — reuse the landing's
  already-present `skillAttach.names` (same source the in-chat page uses) so enhance forwards
  the attached draft skills.
- Pass `{enhance}` to `<Composer>` (line 33). No other markup change — Composer's `{#if enhance}`
  block renders the `✦ Enhance` button, loading/cancel, `EnhancePreview`, and skipped/error states.

> Note: the in-chat page wraps `createEnhance` in `untrack(...)` because it reads `data.chatId`
> at init. Landing passes a literal `null`, so `untrack` is unnecessary; a plain `const` is fine.

## Out of scope

- No change to Composer.svelte (enhance UI already complete and prop-gated).
- No change to the BFF enhance proxies.
- No backend / pin change.
- The pending upstream SHAs (ensemble verification, provider keys) are unrelated.

## Testing

- **Unit (`src/lib/enhance/enhance.svelte.test.ts`):** add a case that `createEnhance(null, …)`
  POSTs a body with `chat_id: null` (assert on the captured fetch body). Existing cases
  (string chatId, skills mapping, accept/discard, abort) remain.
- **Live e2e (landing):** on `/`, type a prompt → `✦ Enhance` appears → click → preview renders
  → accept replaces the draft text → attached landing skills are included in the request.
  (Rebuild `donna-web` before live e2e — it serves built code.)

## Success criteria

1. On `/`, typing a non-empty prompt surfaces the `✦ Enhance` button.
2. Clicking it previews an expanded prompt; accept replaces the landing draft; discard clears the preview.
3. Landing-attached skills are forwarded in the enhance request.
4. `npm run check` = 0 errors / 0 warnings; no new lint errors; `npx vitest run` green.
