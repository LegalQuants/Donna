# Composer skill-input form (P1.1)

**Date:** 2026-06-02 · **Branch:** `feat/composer-skill-inputs` · **Pin:** `vendor/lq-ai` @ `945ad31`

## Why

Skills can declare typed inputs in their frontmatter. The backend already accepts
`MessageCreate.skill_inputs` (`{ [skillName]: { [inputVar]: value } }`) and forwards them to
the model (DE-328), and exposes the declared inputs at `GET /api/v1/skills/{name}/inputs`
(returns `SkillInputs { name, required: SkillInputDef[], optional: SkillInputDef[] }`). Today
Donna's composer attaches skills by slug only and never collects their inputs, so inputs that a
skill declares are dropped. This slice adds an inline form in the composer to collect them and
threads `skill_inputs` through both send paths.

## Decisions (settled in brainstorming)

- **Placement:** inline expander under the skill chips (no modal/popover); same on both composers.
- **Inputs shown:** required (prominent) + optional (collapsed "Optional (n)" group).
- **Send gating:** block + highlight unfilled required inputs client-side; surface the backend
  `skill_input_missing` 400 as a fallback.
- **Both composers:** carry `skill_inputs` through the landing flow via a new
  `donna_draft_skill_inputs` cookie parallel to `donna_draft_skills`.

## Input types (this slice)

`enum` → `<select>` (options from `def.enum`); `boolean` → checkbox; `integer` → `<input
type=number>` (value coerced to `number`); everything else (`text`/`string`/`structured`/unknown)
→ `<input type=text>`. **`file`-type inputs are skipped** (file context is P1.2's `file_ids`).
Each input pre-fills from `def.default` when present.

## Contracts

- `SkillInputDef`: `{ name: string; type?: string | null; required: boolean; description?: string
  | null; enum?: string[] | null; default?: unknown }` (generated, `backend.d.ts`).
- `SkillInputs`: `{ name: string; required: SkillInputDef[]; optional: SkillInputDef[] }`.
- `MessageCreate.skill_inputs`: `{ [skillSlug: string]: { [inputName: string]: unknown } }` —
  keyed by skill slug; only skills with at least one provided value appear; empty optional values
  are omitted.

**"Provided" (for gating + serialization):** string → non-empty after trim; integer → a finite
number (0 counts); boolean → always provided (true/false); enum → a non-empty selected option;
`undefined` → not provided.

## File structure

**New:**
- `src/lib/skills/SkillInputForm.svelte` — renders **one** skill's inputs: required fields, then a
  collapsible "Optional (n)" group. Props: `{ skillTitle: string; required: SkillInputDef[];
  optional: SkillInputDef[]; values: Record<string, unknown>; onchange: (name: string, value:
  unknown) => void }`. Type→widget dispatch above; `file`-type defs are filtered out. Required
  fields with no provided value get an `⚠ required` marker. Svelte 5 (runes) port of the vendor
  `SkillInputForm.svelte`.
- `src/routes/(app)/skills/[id]/inputs/+server.ts` — BFF `GET` proxy → `/api/v1/skills/{id}/inputs`
  (param `id` carries the slug; mirrors `skills/autocomplete/+server.ts`: pass 503/504 through,
  else map to 502). Returns the `SkillInputs` JSON.
- `src/routes/(app)/chats/[id]/draftSkillInputs.ts` — `parseDraftSkillInputs(raw): Record<string,
  Record<string, unknown>>` (mirror of `parseDraftSkills`; tolerant of missing/malformed JSON,
  returns `{}` on failure, keeps only object-of-object entries).

**Modified:**
- `src/lib/skills/types.ts` — re-export `SkillInputDef`, `SkillInputs` from the generated types;
  extend `AttachedSkill` to `{ slug; title; inputsLoading: boolean; inputsError: boolean;
  required: SkillInputDef[]; optional: SkillInputDef[]; values: Record<string, unknown> }`.
- `src/lib/skills/attach.svelte.ts` (`createSkillAttach`):
  - `attach(s, fetchFn = fetch)` becomes async — pushes the entry with `inputsLoading: true`,
    `required/optional: []`, `values: {}`, then fetches `/skills/{slug}/inputs`; on success fills
    `required`/`optional` and seeds `values` from each def's `default`; on failure sets
    `inputsError: true`. (`open`/`search` unchanged.)
  - New `setInputValue(slug, name, value)`.
  - New getter `.skillInputs` → `{ [slug]: {…provided, coerced values} }` (skills with no provided
    value omitted).
  - New getter `.allRequiredFilled` → every attached skill's every required def is "provided"
    (a skill whose inputs failed to load does NOT block — the backend validates).
  - `.names` and `remove(slug)` unchanged in contract (`remove` drops the whole entry).
- `src/lib/components/Composer.svelte`:
  - `onsubmit` signature → `(text, model, skills: string[], skillInputs: Record<string,
    Record<string, unknown>>) => void`.
  - Under the chips row, render a `SkillInputForm` for each attached skill with
    `required.length + optional.length > 0`, wired to `skillAttach.setInputValue`. Skills with
    unfilled required inputs render expanded; others collapsed. Show a small "Couldn't load
    inputs" note when `inputsError`.
  - Send button (and Enter-to-send) gated on `value.trim() && (skillAttach?.allRequiredFilled ??
    true)`. `submit()` calls `onsubmit?.(text, model, skillAttach?.names ?? [], skillAttach?.
    skillInputs ?? {})`.
- `src/lib/chat/chatStream.svelte.ts`:
  - `send(content, model, skills, skillInputs = {})` and `runStream(idx, content, model, skills,
    skillInputs)` add `skill_inputs` to the POST body when non-empty. `retry()` reuses a stored
    `lastSkillInputs`.
  - On a non-OK response, attempt to read the JSON error envelope; if it carries a
    `skill_input_missing` code / detail, surface that message via `setError` instead of the
    generic "Could not reach the model".
- `src/routes/(app)/chats/[id]/messages/+server.ts` — read `body.skill_inputs` (validate it is a
  plain object of objects), include it in the upstream `MessageCreate` payload when non-empty.
- `src/routes/(app)/chats/[id]/+page.svelte` — `submit(text, model, skills, skillInputs = {})` →
  `chat.send(text, model, skills, skillInputs)`; `onMount` replay passes `data.draftSkillInputs ??
  {}`.
- `src/routes/(app)/chats/[id]/+page.server.ts` — read + delete `donna_draft_skill_inputs`,
  parse via `parseDraftSkillInputs`, return `draftSkillInputs`.
- `src/routes/(app)/+page.svelte` — add a hidden field `<input type="hidden" name="skill_inputs"
  value={JSON.stringify(skillAttach.skillInputs)} />` inside the `?/start` form (the landing
  composer's `onsubmit` already just `requestSubmit()`s the form, reading controller state).
- `src/routes/(app)/+page.server.ts` (`?/start`) — read the `skill_inputs` form field, parse it
  (reuse `parseDraftSkillInputs`), and when non-empty set the `donna_draft_skill_inputs` cookie
  (same opts/maxAge as `donna_draft_skills`).

## Data flow

- **Chat composer:** `Composer.onsubmit` → `submit` → `chat.send(text, model, skills,
  skillInputs)` → `chatStream` body `skill_inputs` → BFF forwards in `MessageCreate` → backend.
- **Landing composer:** form `?/start` reads `skill_inputs` hidden field → sets
  `donna_draft_skill_inputs` cookie → chat `load` parses → `onMount` replay sends it on the first
  message.

## Error handling

- Required-input gating client-side normally prevents the missing case; unfilled required inputs
  are visually flagged.
- A `400 skill_input_missing` from the backend surfaces the backend message inline (chatStream).
- `/inputs` fetch failure: the skill still attaches; the form area shows "Couldn't load inputs"
  and does not block send (backend validates). The landing flow only carries values the user
  actually entered.

## Testing

- **Component** `SkillInputForm.svelte.test.ts`: each widget type renders for its `type`; required
  vs optional grouping; optional group collapsed by default; `default` pre-fill; `onchange` emits
  coerced values (number for integer, boolean for checkbox); a `file`-type def is not rendered;
  the `⚠ required` marker shows for an empty required field.
- **Controller** `attach.svelte.test.ts` (extend): `attach` fetches `/skills/{slug}/inputs`
  (mocked) and seeds defaults; `inputsError` on fetch failure (and such a skill does not block
  `allRequiredFilled`); `setInputValue` updates; `.skillInputs` builds the keyed/coerced record
  and omits empty optionals + skills with no values; `.allRequiredFilled` flips; `remove` clears.
- **Proxy** `skills/[id]/inputs/server.test.ts`: forwards to `/api/v1/skills/{id}/inputs`, returns
  JSON on 200, maps 503/504 through and others to 502 (mirror the autocomplete proxy test).
- **BFF** `chats/[id]/messages/server.test.ts` (extend): `skill_inputs` forwarded when present,
  omitted when absent or malformed.
- **chatStream** `chatStream.svelte.test.ts` (extend): `skill_inputs` present in the POST body;
  `400` with `skill_input_missing` surfaces a readable inline error.
- **Landing draft** `draftSkillInputs.test.ts`: parse valid JSON object-of-objects; `{}` for
  missing/malformed/non-object.
- **Live e2e** `tests/skill-inputs.spec.ts` (new): on the chat composer, attach a built-in skill
  that declares inputs, fill the required input(s), send, and assert the turn streams to
  completion. **Planning step:** identify a real built-in skill on the dev fixture that declares
  inputs (query `/api/v1/skills/{name}/inputs` for candidates). If none declares inputs, fall back
  to asserting the composer renders the inputs form against a known skill and cover the send
  round-trip at the integration (chatStream/BFF) level instead — and note the gap. Rebuild
  `donna-web` before the live run.

## Acceptance criteria

- [ ] Attaching a skill that declares inputs shows an inline form (required + collapsible
      optional) under the chips; a no-input skill shows no form.
- [ ] Send is blocked while any attached skill has an unfilled required input; unfilled required
      inputs are flagged; Send enables once filled.
- [ ] Sending includes `skill_inputs` keyed by slug with coerced, non-empty values; empty
      optionals omitted; the BFF forwards it.
- [ ] Inputs entered on the landing composer reach the first message via the draft cookie.
- [ ] A backend `skill_input_missing` 400 surfaces a readable inline error.
- [ ] `/inputs` fetch failure degrades gracefully (skill attaches, no block, note shown).
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`).
- [ ] Component/controller/proxy/BFF/chatStream/draft unit tests green; full vitest green.
- [ ] Live e2e passes (or the documented fallback, with the gap noted).

## Out of scope

`file`-type skill inputs (P1.2), structured/JSON editors (treated as text), editing inputs after
send, and per-input help/validation beyond required/empty + the type coercion above.
