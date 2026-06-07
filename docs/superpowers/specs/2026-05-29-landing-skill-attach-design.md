# Skill-attach on the landing composer (design spec)

**Date:** 2026-05-29 · **Branch:** `landing-skill-attach` (off `main`) · **lq-ai pin:** `438198c` (no backend change)

## 1. Goal & motivation

Let a user **attach a skill to their first message from the landing/Assistant page**. Today the skill-attach control (`⊕ Skill`, P2c-B2) renders only in the **in-chat** composer — the landing composer is passed only the model + matter pickers. Because the landing flow sends the first message _before_ the user ever reaches the in-chat composer, **a skill can't be applied to the opening question** at all. This is real friction: a user who wants "review this with the contract-QA skill" must send a throwaway message first, then attach on the second turn.

Skill _application_ already works end-to-end (the composer threads `MessageCreate.skills`; the gateway assembles each skill into the prompt). This slice only closes the **discoverability/first-message** gap by surfacing the existing control on landing and threading the chosen skills through the landing → new-chat → first-send hop.

## 2. Current flow (verified)

- **`(app)/+page.svelte`** (landing): binds `message` + `selectedMatterId`; `<Composer matters={data.matters} … />` (no `skillAttach`, no `enhance`). A `?/start` form posts hidden `message` + `project_id`.
- **`(app)/+page.server.ts`** `?/start`: `POST /api/v1/chats` (with `project_id` if set) → stashes `message` in a one-shot **`donna_draft`** cookie (`httpOnly`, `sameSite:lax`, `maxAge:120`) → `redirect(303, /chats/{id})`.
- **`(app)/chats/[id]/+page.server.ts`** `load`: reads `donna_draft`, **deletes** it, returns `{ draft, … }`.
- **`(app)/chats/[id]/+page.svelte`**: `onMount(() => { if (data.draft && messages.length === 0) submit(data.draft, modelStore.selectedModel); })`. So the **model** survives via the persisted `modelStore` (localStorage) and the **message** via the cookie — but the first send passes **`skills = []`**.
- The in-chat composer (`chats/[id]/+page.svelte`) passes `{skillAttach}` + `{enhance}`; `Composer.svelte` renders the `⊕ Skill` control and chips only `{#if skillAttach}` (same gating for `{#if enhance}`).

## 3. Scope decision: Skill only (not Enhance)

Surface **only** the skill-attach control on landing. **Enhance is excluded** because it is constructed as `createEnhance(chatId, …)` and calls a _per-chat_ backend endpoint — it cannot run before a chat exists. Skill-attach collects slugs client-side and needs no chat context, so it ports cleanly. Enhance stays in-chat.

**Also out of scope:** skill _inputs_ (`MessageCreate.skill_inputs` / `GET /skills/{slug}/inputs` — a separate, larger slice), and an applied-skills confirmation UI (`applied_skills` is returned but not surfaced; separate).

## 4. Design — mirror the one-shot draft cookie

The skills ride the same one-shot mechanism as the draft message.

1. **Landing page** (`(app)/+page.svelte`): instantiate `const skillAttach = createSkillAttach();` and pass `{skillAttach}` to `<Composer>`. That alone surfaces the `⊕ Skill` button **and** the selected-skill chips (both already implemented in `Composer.svelte`, gated on the prop). Add hidden inputs carrying the chosen slugs inside the `?/start` form:
   ```svelte
   {#each skillAttach.names as s (s)}<input type="hidden" name="skills" value={s} />{/each}
   ```
2. **`?/start` action** (`(app)/+page.server.ts`): `const skills = data.getAll('skills').map(String).filter(Boolean);` After creating the chat and before redirect, if `message` is set keep the existing `donna_draft` write; additionally, if `skills.length`, set a sibling one-shot cookie:
   ```ts
   event.cookies.set('donna_draft_skills', JSON.stringify(skills), {
   	path: '/',
   	httpOnly: true,
   	sameSite: 'lax',
   	maxAge: 120
   });
   ```
3. **Chat `[id]` `load`** (`chats/[id]/+page.server.ts`): read + delete `donna_draft_skills`, parse defensively to `string[]`, return as `draftSkills`:
   ```ts
   const rawSkills = event.cookies.get('donna_draft_skills');
   if (rawSkills) event.cookies.delete('donna_draft_skills', { path: '/' });
   let draftSkills: string[] = [];
   if (rawSkills) {
   	try {
   		const p = JSON.parse(rawSkills);
   		if (Array.isArray(p)) draftSkills = p.filter((x): x is string => typeof x === 'string');
   	} catch {
   		/* ignore malformed */
   	}
   }
   // …return { …, draft, draftSkills, … }
   ```
4. **Chat `[id]` `onMount`** (`chats/[id]/+page.svelte`): thread the skills into the first send:
   ```ts
   if (data.draft && data.messages.length === 0)
   	submit(data.draft, modelStore.selectedModel, data.draftSkills ?? []);
   ```

**Data flow:** landing `skillAttach.names` → hidden `skills[]` form fields → `?/start` → `donna_draft_skills` cookie → chat `load` → `data.draftSkills` → first `chat.send(content, model, skills)` → `MessageCreate.skills` → gateway. The picker fetches from the existing `/skills/autocomplete` BFF route, which is authed and works on landing.

### Why a cookie, not localStorage

Skills are per-chat-creation and one-shot: the cookie is consumed and deleted on the first chat `load`, exactly like `donna_draft`. localStorage (how the _model_ persists globally) would leak the selection into later chats. The cookie keeps the selection scoped to this one chat start.

### Components touched (no new components)

- `(app)/+page.svelte` — add `skillAttach` controller + hidden inputs (uses existing `createSkillAttach`, `Composer`).
- `(app)/+page.server.ts` — `?/start` reads `skills`, sets `donna_draft_skills`.
- `(app)/chats/[id]/+page.server.ts` — `load` reads/deletes/parses `donna_draft_skills` → `draftSkills`.
- `(app)/chats/[id]/+page.svelte` — `onMount` threads `data.draftSkills` into the first `submit`.

`Composer.svelte` and `SkillAttach.svelte` are **unchanged** (already gate on the prop). `createSkillAttach` is **unchanged**.

## 5. Error handling / edge cases

- **No skills selected:** no hidden inputs → `data.getAll('skills')` empty → no `donna_draft_skills` cookie → `draftSkills = []` → first send unchanged (back-compat).
- **Malformed cookie:** `JSON.parse` guarded in `try/catch`; non-array or non-string entries dropped → `draftSkills = []` (no crash).
- **Message empty but skills selected:** the `onMount` auto-send is gated on `data.draft` (a non-empty message), so skills without a message are simply not sent — consistent with today (no message → no first send). The `donna_draft_skills` cookie still expires in 120s. (Acceptable; the Composer disables submit on empty text anyway.)
- **Matter tier floor:** unaffected — skills don't interact with the model-tier guard that already runs on the chat page.
- **Cookie size:** slugs are short; a handful of `[a-z0-9-]{≤32}` strings as JSON is well under cookie limits.

## 6. Testing

Quality bar: `npm run check` = **0 errors / 0 warnings**; eslint clean on touched files; verify against the real backend.

- **Landing server test** (`(app)/page.server.test.ts` — create if absent): `?/start` with `skills=['contract-qa','nda-review']` → chat created → `donna_draft_skills` cookie set to the JSON array → redirect; and with no skills → no `donna_draft_skills` cookie.
- **Chat `[id]` load test** (extend `chats/[id]/page.server.test.ts`): a `donna_draft_skills` cookie → `load` returns `draftSkills` parsed + deletes the cookie; malformed cookie → `draftSkills: []`; absent → `draftSkills: []`.
- **Landing page test** (`(app)/page.svelte.test.ts` — create if absent): the Composer receives a `skillAttach` prop (the `⊕ Skill` control renders); hidden `skills` inputs render one-per-selected-slug. (Mock `$app/forms`; seed a `skillAttach` with attached skills.)
- **Chat page onMount test** (extend the chat-page test if one exists, else add a focused test): with `data.draft` + `data.draftSkills`, the first `submit`/`chat.send` is called with those skills. Mock `chat.send`.
- **Live e2e** (`tests/landing-skill-attach.spec.ts`, self-cleaning): on landing, open `⊕ Skill`, attach a known built-in (e.g. via the autocomplete), type a question, send → land in the chat → assert the first user turn was sent with the skill applied (assert via the streamed response's applied-skill signal if surfaced, or by asserting the skill chip appeared pre-send and the turn completed). Clean up the created chat in `try/finally` (`DELETE /api/v1/chats/{id}`). Prefer SPA assertions; rebuild `donna-web` first.

## 7. Implementation order (for the plan)

Small slice; bite-sized TDD tasks:

1. Chat `[id]` `load`: read/delete/parse `donna_draft_skills` → `draftSkills` (+ server test).
2. Landing `?/start`: read `skills`, set `donna_draft_skills` cookie (+ server test).
3. Landing page: wire `createSkillAttach` + hidden inputs (+ page test).
4. Chat page `onMount`: thread `data.draftSkills` into the first `submit` (+ test).
5. Live e2e + verify + PR.

## 8. Follow-ups (not in this slice)

- **Skill inputs** application (`skill_inputs` + `/skills/{slug}/inputs`) — the deeper "apply properly" slice.
- **Applied-skills confirmation** in the message UI (`applied_skills` is returned, unused).
- **Enhance on landing** — would require creating the chat before enhancing; deferred.
