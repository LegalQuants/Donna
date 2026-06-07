# Donna — P2c Slice B2: Skill-attach (composer)

**Date:** 2026-05-25 · **Branch:** `p2c-b2-skill-attach` · **PR target:** `main` · **lq-ai pin:** `438198c`

## Context: P2c-B decomposition

Second of the three P2c-B ("composer power") sub-slices, each its own PR:

1. **B1 — Model / tier picker** ✅ merged (PR #5, type cleanup PR #6)
2. **B2 — Skill-attach** ← _this spec_
3. **B3 — Enhance Prompt** — own spec later

## Goal

Let the user search and attach lq-ai **skills** to a chat, threading the chosen skill names through the message as `MessageCreate.skills`. Attaching applies the skill's methodology to the conversation; the picker is a `⊕ Skill` button in the composer control row (beside the B1 model picker) backed by the `/skills/autocomplete` typeahead, producing removable chips.

## Live contract findings (spiked against the running stack, 2026-05-25)

- **14 builtin skills.** `GET /api/v1/skills/autocomplete` returns the caller's recents on empty `q` and ranked matches on non-empty `q` (clamped to `limit ≤ 25`); each result is `{ slug, slash_alias?, title, description?, scope, icon? }`.
- **Attaching a skill with no `skill_inputs` returns HTTP 200, not the `400 skill_input_missing` the schema implies.** The skill is applied and the model asks for any missing context conversationally (observed: attaching `comms-improver` to a partial clause → the model replied asking for the full text and the audience). So **attach-by-name alone is functional**; `skill_inputs` bindings are an optional enhancement.
- **8 of 14 skills declare a `document`-typed required input** (the reviews, extracts, `contract-qa`, `dpa-checklist`, `action-items`, `vendor-privacy`) — not satisfiable from Donna today (no file/doc attach until P3/P4). 3 declare no inputs (the snapshots); `comms-improver` is the only text-only one.

**Consequence:** structured `skill_inputs` forms are premature now (mostly document-gated, and the model already handles missing inputs conversationally). B2 ships **attach-only**; forms are revisited when document attach lands.

## Decisions (from brainstorming)

| Decision      | Choice                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | **Attach-only** — search/autocomplete + removable skill chips threading `skills[]` (names). **No `skill_inputs` forms.**                                                                           |
| Affordance    | **`⊕ Skill` button** in the composer control row (beside the model picker) → search popover backed by `/skills/autocomplete`.                                                                      |
| Persistence   | **Sticky until removed, in-memory.** Chips persist across sends within the chat session; cleared on remove or reload. **Not** localStorage (skills are task-contextual, unlike the model default). |
| Landing scope | **In-chat only.** The skill affordance is hidden on the landing composer (the chat page owns the controller; landing doesn't pass it).                                                             |
| Architecture  | **Dedicated per-chat rune controller** (`createSkillAttach`) + thin autocomplete proxy + presentational `SkillAttach.svelte`; thread `skills[]` through `chat.send` like B1's `model`.             |

## Architecture & data flow

```
SkillAttach.svelte (⊕ Skill button + search popover + chips)
   ▲ controller prop
createSkillAttach()  — rune: attached[] (sticky), results[], loading, error;
                       open()→recents, search(q)→debounced /skills/autocomplete,
                       attach(s) (dedupe by slug), remove(slug)
   ▲ created by chat +page.svelte (per-chat, in-memory)
Composer (reads modelStore + skillAttach) ─ onsubmit(text, model, skills[]) ─► page
   ► chat.send(text, model, skills) ─► runStream ─► POST {content, model, skills?} ─► messages BFF ─► lq-ai
```

The chat page owns one `createSkillAttach()` instance and passes it to the Composer. The Composer reads `skillAttach.names` at submit and includes them in `onsubmit`. The landing composer is rendered **without** the `skillAttach` prop, so the skill UI does not appear and `skills` is `[]`.

## New / changed files

**New**

- `src/routes/(app)/skills/autocomplete/+server.ts` — `GET` thin proxy: forwards `q` and `limit` query params to `/api/v1/skills/autocomplete`. Pass through `503`/`504`; map any other non-2xx to `502`. Returns the JSON body verbatim. Mirrors `src/routes/(app)/models/+server.ts`.
- `src/lib/skills/types.ts` — `SkillSuggestion` derived from the generated contract:
  `paths['/api/v1/skills/autocomplete']['get']['responses']['200']['content']['application/json']['results'][number]`; and `AttachedSkill = { slug: string; title: string }`.
- `src/lib/skills/attach.svelte.ts` — `createSkillAttach()` rune controller:
  - State: `attached: AttachedSkill[]`, `results: SkillSuggestion[]`, `loading: boolean`, `error: boolean`.
  - `open(fetchFn = fetch)` — fetch recents (`q=''`, `limit=8`); populates `results`.
  - `search(q, fetchFn = fetch)` — **debounced ~200ms**; fetch `/skills/autocomplete?q=<q>&limit=8`; on `!ok`, set `error = true` and `results = []`.
  - `attach(s: SkillSuggestion)` — append `{ slug: s.slug, title: s.title }` if `slug` not already attached (dedupe).
  - `remove(slug: string)` — drop by slug.
  - Getters: `attached`, `results`, `loading`, `error`, and `names` (`attached.map(s => s.slug)`).
- `src/lib/components/SkillAttach.svelte` — **presentational** (plain props, like `ModelPicker.svelte`; the controller wiring lives in `Composer`). Props: `attached: AttachedSkill[]`, `results: SkillSuggestion[]`, `loading: boolean`, `error: boolean`, `onopen: () => void`, `onsearch: (q: string) => void`, `onattach: (s: SkillSuggestion) => void`, `onremove: (slug: string) => void`. Owns only its local `open` state.
  - Chips row above the textarea: each attached skill as a removable chip (title + ✕ → `onremove`).
  - `⊕ Skill` trigger button (control row): opens a popover (calls `onopen`), with a search `<input>` (`oninput → onsearch`), a results list (title + truncated description; clicking → `onattach`, keeping the popover open for multi-attach), a muted "Couldn't load skills" note when `error`, and an empty state.
  - Escape / outside-click closes the popover; a11y mirrors `ModelPicker.svelte` (targeted `svelte-ignore` only where svelte-check actually warns).

**Changed**

- `src/lib/components/Composer.svelte` — add optional `skillAttach?` prop (the `createSkillAttach` controller). When present, render `<SkillAttach>`, mapping the controller onto its plain props (`attached={skillAttach.attached}`, `results={skillAttach.results}`, `loading`/`error` likewise, `onopen={skillAttach.open}`, `onsearch={skillAttach.search}`, `onattach={skillAttach.attach}`, `onremove={skillAttach.remove}`) — chips above the textarea, `⊕ Skill` button in the control row beside `<ModelPicker>`. When absent (landing), render no skill UI. Change `onsubmit` to `(text: string, model: string, skills: string[]) => void`; `submit()` passes `skillAttach?.names ?? []` as the third arg.
- `src/lib/chat/chatStream.svelte.ts` — `send(content, model, skills: string[] = [])` and `runStream(idx, content, model, skills)`; include `skills` in the POST body **only when non-empty**. Add `lastSkills` beside `lastModel` so `retry()` reuses the same skills.
- `src/routes/(app)/chats/[id]/messages/+server.ts` — read `body.skills` (array of strings); forward it to lq-ai when present and non-empty (omit otherwise).
- `src/routes/(app)/chats/[id]/+page.svelte` — `const skillAttach = createSkillAttach();` pass `{skillAttach}` to the Composer; `submit(text, model, skills) → chat.send(text, model, skills)`. The `onMount` landing-draft auto-send passes `[]` for skills.

## Error handling & edge cases

- **Autocomplete fetch fails** → popover shows a muted "Couldn't load skills" note; existing chips and message sending are unaffected (never blocked).
- **Dedupe** — attaching an already-attached slug is a no-op; multiple distinct skills allowed (no cap in B2).
- **Sticky in-memory** — chips persist across sends until removed or page reload; not persisted to localStorage.
- **No skills attached** → `skills` omitted from the POST body (backend default).
- **No `skill_inputs` sent** → backend returns 200; the model handles missing context conversationally. No client-side input validation or `400 skill_input_missing` handling (out of scope).
- **Post-send display** — applied skills already surface in the Receipts drawer + SSE `applied_skills` (P2c-A); no new surface added here.

## Testing & verification

- **Unit (vitest):** `createSkillAttach` — attach/dedupe/remove, `names` derivation, `search` maps results, fetch error → `error=true` + empty results; `skills/autocomplete` proxy — forwards `q`/`limit`, 503/504 passthrough, else 502.
- **Component:** `SkillAttach` — opening lists results, clicking a result calls `attach`, chip ✕ calls `remove`, error note renders on `error`; `Composer` — skill UI present only when `skillAttach` passed (absent on landing), and submit forwards the attached slugs.
- **chatStream:** `send` includes `skills[]` in the body when present and omits when empty; `retry` reuses `lastSkills`.
- **messages BFF:** forwards `body.skills` when present; omits otherwise.
- **Live e2e (Playwright vs running stack):** in a chat, `⊕ Skill` → type "nda" → attach `nda-review` (chip appears) → send → assert the outgoing `POST /messages` body carries `skills:["nda-review"]` → the chip persists for a second send (sticky) → (bonus) the Receipts drawer lists the applied skill.
- **Gate:** `npm run check` 0 errors / 0 warnings; `npx vitest run`; `npx playwright test`. Verify against the real backend.

## Out of scope (deferred)

- `skill_inputs` forms, required-input validation, and `400 skill_input_missing` handling (revisit when document/file attach exists, P3/P4).
- Skill-attach on the landing composer.
- Slash-command (`/skill`) typeahead in the textarea (the autocomplete endpoint supports `slash_alias`; possible later enhancement).
- Skill detail / inspector view (`/skills/{name}/contents`).
- The full `GET /api/v1/skills` list (autocomplete covers recents + search).
