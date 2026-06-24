# Sticky skills — per-chat "Keep skills on" toggle

**Date:** 2026-06-23 · **Status:** approved, ready to plan

## 1. What this adds

An opt-in, **per-chat** toggle so a skill applied in a chat keeps applying to follow-up turns
instead of dropping the moment the composer stops re-sending it. The UI is a **"Keep skills on"
switch** in the in-chat composer toolbar, plus a quiet **"Keeping _N_ on"** indicator (skill names
on hover) when it's active.

This ports LQ-AI's sticky-skills feature (lq-ai commit `5ad9f9e`, "feat(chat): opt-in sticky-skills
toggle", #211) to Donna's frontend. Donna implements no legal-AI logic — the snapshot/union/clear
semantics live in the backend; Donna drives them through the published contract.

## 2. Design decisions (the transparency posture — keep these)

- **Off by default.** A brand-new chat never inherits stickiness (fail-restrictive).
- **Per-chat scope.** State lives on the chat row (`chats.sticky_skills text[]`). Opening/switching
  a chat re-syncs the toggle from that chat; a new chat starts off.
- **Snapshot on toggle-on.** Turning it on captures the turn's full **effective** skills as the
  chat's sticky set.
- **Union for the turn / set unchanged.** An explicit per-turn skill is added for that turn only; it
  does not silently mutate the sticky set. **The toggle is the only thing that changes the set.**
- **Audit stays honest.** Every turn still records its own `applied_skills`; the sticky set merely
  feeds each turn's effective skills.

## 3. Backend contract (already merged upstream)

lq-ai `5ad9f9e` adds, verified against the source checkout:

- Migration `0056_chat_sticky_skills.py` — `chats.sticky_skills text[] NOT NULL DEFAULT '{}'`
  (empty array = toggle off; the array *is* the state).
- Message-create request schema: `set_sticky: bool | None = None`
  - `true` = snapshot this turn's effective skills as the sticky set
  - `false` = clear the set (this turn applies only explicit skills)
  - `null` / omitted = unchanged (union the existing set into this turn)
- Chat response schema: `sticky_skills: list[str]` — so the client can reflect the toggle on load.
- Send handler unions the sticky set into the turn's effective skills (forwarded + recorded) and
  mutates the set only on an explicit `set_sticky`.

**Implementation prerequisite (plan Task 1):** bump the pin `658fdbc → 5ad9f9e`, `npm run gen:api`,
rebuild `api + arq-worker + ingest-worker + donna-web` (migration runs on `api` boot), record in
`docs/decisions/lq-ai-pin.md`. **Then verify the generated shape in `src/lib/api/backend.d.ts`** —
the merged shape wins over this spec: confirm `Chat.sticky_skills: string[]` and message-create
`set_sticky?: boolean | null`. If a field is typed loosely (`additionalProperties`), hand-type it in
the relevant parser per the `parseXList` precedent.

## 4. Architecture

The browser → Donna BFF → lq-ai path is unchanged; we thread one new request field and read one new
response field.

### 4.1 Reading state on load — `routes/(app)/chats/[id]/+page.server.ts`

The chat `load` currently fetches only messages. Add a `GET /api/v1/chats/{id}` sub-fetch, parsed by
a new defensive `parseChat(raw: unknown)` (local `str`/`obj`/`strArray` guards; typed off
`backend.d.ts` `Chat`) that returns `{ stickySkills: string[] }`. Return `stickySkills` in page data.

**Honest degradation:** the sub-fetch degrades to `stickySkills: []` (= off) independently — a failed
Chat fetch never breaks the page or fabricates a sticky state. (Mirrors the loader-degrades-each-
sub-fetch-to-null precedent.)

### 4.2 Sticky controller — `src/lib/skills/sticky.svelte.ts`

A focused Svelte-5 rune controller, sibling to `createSkillAttach`. Pure state + small methods, no
I/O (the page does the fetch; the controller is fed):

- `enabled: boolean` (`$state`) — the displayed switch state. **Independent** state (NOT derived from
  `set`): seeded from `stickySkills.length > 0` on sync, then flipped by `toggle()`. Keeping it
  independent is what lets the switch reflect user intent before the next send reconciles the set, and
  mirrors the LQ-AI reference's `stickyEnabled`.
- `set: string[]` (`$state`) — the kept set; drives the **"Keeping _N_ on"** indicator. The indicator
  shows a count only when `enabled && set.length > 0`; when `enabled && set.length === 0` (just toggled
  on, not yet snapshotted) the switch simply reads on, no count.
- `dirty: boolean` (`$state`) — the user flipped the toggle since the last send.
- `syncFromChat(chatId: string, stickySkills: string[])` — re-seed `enabled = stickySkills.length > 0`,
  `set = stickySkills`, and reset `dirty = false`, **only when `chatId` differs from the last synced
  id** (tracked internally; guarded with `untrack`). This is what makes switching chats re-sync, a new
  chat start off, and an in-progress toggle never get clobbered by a reactive re-run.
- `toggle(currentTurnSkills: string[])` — `enabled = !enabled; dirty = true;` and optimistically update
  the indicator `set` (turning on → `union(currentTurnSkills, set)`; turning off → `[]`). The optimistic
  `set` is a display hint only; the next chat load reconciles it (server is authoritative). The
  Composer passes `currentTurnSkills = skillAttach?.names ?? []` (the per-turn attached skills).
- `sendValue(): boolean | undefined` — returns `dirty ? enabled : undefined`.
- `markSent(): void` — clears `dirty` (called on send success).

Seeded once from `data` via `untrack` in the chat page (the established pattern to avoid
`state_referenced_locally`).

### 4.3 Composer — toggle + indicator — `src/lib/components/Composer.svelte`

In the toolbar control row, gated to **in-chat only** (rendered only when a `sticky` controller prop
is provided, mirroring how `skillAttach` gates the Skill control — the landing composer passes
neither):

- A `role="switch"` button labelled **"Keep skills on"** with `aria-checked={sticky.enabled}`.
- When `sticky.enabled`, an inline quiet indicator **"· Keeping _N_ on"** whose `title` lists the
  skill names (prettified via the existing `prettifySkillSlug`).
- `onsubmit` gains a 6th positional arg `setSticky?: boolean` (consistent with the existing positional
  signature) = `sticky.sendValue()`, passed straight through to `chat.send`.

Placed adjacent to the Skill control (conceptually related). Exact pixel placement is a review-time
detail; the contract is: a labelled switch + the on-state indicator, in-chat only.

### 4.4 Send threading — `src/lib/chat/chatStream.svelte.ts`

`send(content, model, skills, skillInputs, fileIds, setSticky?)` adds to the POST body:

```
if (setSticky !== undefined) body.set_sticky = setSticky;
```

**The critical rule:** `set_sticky` is included **only when the toggle was flipped this turn**
(`sendValue()` returns `undefined` otherwise). Sending it every turn would re-snapshot and break
"union, set unchanged." On send **success**, call `sticky.markSent()` to clear `dirty`.

**Retries omit `set_sticky`** — a retry re-sends the captured `lastSkills` etc. but must pass
`setSticky = undefined` (the sticky set is already updated server-side; re-snapshotting on a retry is
wrong). The retry path does not capture or replay a `set_sticky`.

### 4.5 BFF passthrough — `routes/(app)/chats/[id]/messages/+server.ts`

Parse `set_sticky` from the incoming body, validate it's a boolean, and forward it into the upstream
payload when present:

```
if (typeof body.set_sticky === 'boolean') payload.set_sticky = body.set_sticky;
```

Absent / non-boolean → omitted (the backend treats omitted as "unchanged").

## 5. Data flow (one full cycle)

1. Open chat → `load` fetches messages + `GET /chats/{id}` → `stickySkills`. Page seeds the sticky
   controller via `syncFromChat(chatId, stickySkills)`. Toggle reflects the chat's state.
2. User attaches skill `X` for this turn (per-turn attach) and sends. `set_sticky` omitted (toggle not
   flipped) → backend records `applied_skills: [X]`, sticky set unchanged (still off).
3. User flips **"Keep skills on"** (dirty=true, optimistic `set = [X]`) and sends a follow-up with no
   per-turn skill. Body carries `set_sticky: true` → backend snapshots the effective set `[X]` onto
   the chat and applies it; the follow-up's `applied_skills` includes `X`. `markSent()` clears dirty.
4. Further follow-ups (no flip) send `set_sticky` omitted → backend unions `[X]` in each turn;
   `applied_skills` keeps showing `X`; the set is unchanged.
5. User flips the switch **off** and sends → `set_sticky: false` → backend clears the set; this and
   later turns apply only explicit skills.

## 6. Edge cases

- **New chat** (landing → first message): the toggle isn't shown on landing (no chat row). After the
  first message creates the chat and we land on `/chats/[id]`, the chat loads with `sticky_skills: []`
  → off. Correct.
- **Switching chats:** a `chatId`-keyed `$effect` on the chat page calls `syncFromChat`; because the
  controller re-seeds only on id change, the toggle reflects the newly-opened chat and `dirty` resets.
- **Send failure:** `markSent()` is called only on success, so `dirty` persists and the user's intent
  is carried into the next successful send. The toggle is not silently lost.
- **GET-chat failure:** `stickySkills` degrades to `[]` (off); the toggle remains usable (turning it on
  will snapshot on the next send).

## 7. Testing

- **Unit (vitest)** — `sticky.svelte.ts`: `toggle` sets dirty + optimistic set (on=union, off=empty);
  `sendValue` returns `dirty ? enabled : undefined`; `syncFromChat` re-seeds + resets dirty **only on
  id change** (same-id call is a no-op that preserves an in-progress toggle); `markSent` clears dirty.
- **Unit** — `parseChat`: extracts `sticky_skills`, drops malformed rows → `[]`, tolerates missing.
- **Server (vitest)** — `messages/+server.ts`: forwards `set_sticky` when boolean, omits when absent /
  non-boolean (mock `lqStream`, assert the upstream payload). Chat `load`: parses `sticky_skills` and
  degrades to `[]` on a failed Chat fetch.
- **Live e2e (Playwright)** — `tests/sticky-skills.spec.ts`: create a chat, attach a user-skill, send
  (assert `applied_skills` includes it), flip **"Keep skills on"**, send a follow-up **without
  re-attaching** (assert the follow-up's `applied_skills` still includes the skill), flip off, send
  (assert it no longer applies). Self-cleaning via `try/finally`. Use a user-skill that reliably
  forwards; if `applied_skills` proves model-influenced in practice, fall back to asserting the
  `set_sticky` body reaches the API (mirrors the model-discretionary-output e2e guidance).

## 8. File inventory

**New**
- `src/lib/skills/sticky.svelte.ts` + `sticky.svelte.test.ts`
- `parseChat` (in a small `src/lib/chat/chat.ts` or alongside the chat load) + test
- `tests/sticky-skills.spec.ts`

**Changed**
- `vendor/lq-ai` pin → `5ad9f9e`; regenerated `src/lib/api/backend.d.ts`; `docs/decisions/lq-ai-pin.md`
- `routes/(app)/chats/[id]/+page.server.ts` (+ test) — load Chat, return `stickySkills`
- `routes/(app)/chats/[id]/+page.svelte` — wire the sticky controller, `chatId`-keyed re-sync, pass to
  Composer, thread `setSticky` into `send`
- `src/lib/components/Composer.svelte` — switch + indicator + 6th `onsubmit` arg
- `src/lib/chat/chatStream.svelte.ts` — `send` gains `setSticky`; body field; retry omits it; `markSent`
- `routes/(app)/chats/[id]/messages/+server.ts` (+ test) — forward `set_sticky`

## 9. Out of scope (YAGNI)

- A landing-page toggle (no chat row exists yet).
- Direct editing of the sticky set (on re-snapshots, off clears — the toggle is the only mutator).
- Surfacing the sticky set in the per-message receipt (each turn's `applied_skills` already records it).
- Echoing `sticky_skills` on the SSE complete frame (the next chat load reconciles the set; the
  optimistic client set covers the in-session case).
