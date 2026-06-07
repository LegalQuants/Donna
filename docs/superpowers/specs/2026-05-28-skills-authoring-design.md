# P5-1 — Skills Authoring (design spec)

**Date:** 2026-05-28 · **Phase:** P5-1 (first slice of P5 "Workflows") · **Branch:** off `main` (HEAD `f54e356`+) · **lq-ai pin:** `438198c`

## 1. Goal & scope

Give the user a friendly, minimal-chrome surface to **create, edit, fork, and archive their own (user-scope) skills** inside Donna. Today the user can _attach_ a skill in the composer (`SkillAttach`, P2c-B2) but must use the LQ*AI developer frontend to \_author* one — exactly the "friendly frontend exposing backend power" gap the product thesis flags (memory `donna-product-direction`). The backend skills CRUD is mature; **no upstream lq-ai change is required**.

The composer's existing `SkillAttach` popover lists user skills via the autocomplete endpoint and picks up new/forked skills automatically — so creating a skill closes the round-trip with **no composer change** in P5-1.

### In scope

- `/skills` index of the user's editable (non-archived) skills.
- `+ New skill` — blank-create modal.
- `/skills/[id]` detail/edit page — frontmatter fields + `<textarea>` body editor + Save + Archive.
- `Browse & fork` — searchable popover of built-in skills → fork into user scope.

### Out of scope (deferred)

- **Team-scope skills** (`scope='team'` + `owner_team_id` + team-admin gate, D8.1) — user scope only.
- **CodeMirror / rich markdown editor** — plain `<textarea>` for P5-1; CodeMirror is a possible polish slice.
- **`frontmatter_extra` editor** (jurisdiction, output_format, etc.) — standard fields only.
- **Skill references / examples** (the `Skill` schema has more than `body`) — body-only.
- **Playbooks** — P5-2/P5-3.
- **Chat-level file upload** — upstream-blocked, unrelated.

## 2. Backend contract (verified 2026-05-28 against `src/lib/api/backend.d.ts` at pin `438198c`)

| Action                  | Endpoint                                                                    | Notes                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| List my editable skills | `GET /api/v1/user-skills?scope=user`                                        | → `UserSkill[]` (rich view: includes `body` + `frontmatter_extra`). Enough to render the index without per-row fetches.                        |
| Create                  | `POST /api/v1/user-skills` body `UserSkillCreate`                           | 201 → `UserSkill`. **409** slug collision within the caller's non-archived rows. **422** inconsistent `scope`/`owner_team_id`.                 |
| Load one                | `GET /api/v1/user-skills/{skill_id}`                                        | → `UserSkill`. Keyed by **UUID `skill_id`**, owner-only. **404** if not found / not owner (id-probing-safe).                                   |
| Save edits              | `PATCH /api/v1/user-skills/{skill_id}` body `UserSkillUpdate`               | 200 → `UserSkill`. **422** on `slash_alias` collision. 404 if gone.                                                                            |
| Archive                 | `DELETE /api/v1/user-skills/{skill_id}`                                     | **204** deleted (soft-delete: sets `archived_at`). **409** already archived. **404** if gone.                                                  |
| List built-ins to fork  | `GET /api/v1/skills?scope=builtin`                                          | → `SkillSummary[]`.                                                                                                                            |
| Fork a built-in         | `POST /api/v1/skills/{skill_name}/fork` body `{ new_name?, scope: 'user' }` | Copies frontmatter + body into a new user-scope row. **201** → `Skill`. **409** if a same-slug user row exists. `scope='team'` reserved (400). |

### Contract consequences that shape the design

- **Detail route keys off `[id]` (UUID), not `[slug]`** — matches `/knowledge/[id]` and `/matters/[id]`. (The P5-1 handoff said `{slug}`; the generated contract uses `{skill_id}`.)
- **`slug` is immutable after create** — it is in `UserSkillCreate` but **not** in `UserSkillUpdate`. So we auto-derive the slug at create time with a manual override field, then display it read-only on the detail page.
- **Archive is terminal** — there is no `archived` field in `UserSkillUpdate` and no documented un-archive endpoint (`DELETE` returns 409 "already archived"). This mirrors the `/knowledge` archive idiom: archive → redirect to index → row disappears.
- **`UserSkill` schema fields** (`backend.d.ts`): `scope`, `owner_user_id`, `owner_team_id`, `slug`, `display_name`, `description`, `version`, `tags?`, `frontmatter_extra?`, `body`, `slash_alias?`, `forked_from?`, `archived_at?`, `created_at`, `updated_at`.
- **`slash_alias`** is optional, validated `/` + 1–32 of `[a-z0-9-]`, unique per owner among non-archived rows (422 on collision).

> **Spike to confirm during execution (cheap, non-blocking):** whether `GET /api/v1/user-skills?scope=user` already excludes `archived_at != null` rows. Either way the index filters defensively (`archived_at == null`).

## 3. Information architecture

Top-level `/skills` with a **new sidebar "Skills" entry** (the existing "Workflows" sidebar item stays a placeholder for playbooks, P5-2). Mirrors the `/matters` and `/knowledge` resource-route pattern.

### Routes

- **`/skills`** — `+page.server.ts` (load + `?/create`, `?/fork` actions) + `+page.svelte`.
- **`/skills/[id]`** — `+page.server.ts` (load + `?/save`, `?/archive` actions) + `+page.svelte`.
- **`/skills/builtins`** — `+server.ts` (GET) proxying `GET /api/v1/skills?scope=builtin`; the fork popover fetches it on open (mirrors how `SkillAttach` uses `/skills/autocomplete`).

### `/skills` index page

- **Load:** `GET /api/v1/user-skills?scope=user` → `UserSkill[]`; filter `archived_at == null`; sort by `updated_at DESC`.
- **Header:** title "Skills" + `+ New skill` button + `Browse & fork` button.
- **Body:** list of `SkillRow` (empty state when none: a short "Create your first skill" prompt with the `+ New skill` affordance).
- **`+ New skill`** → `CreateSkillModal`.
- **`Browse & fork`** → `ForkBrowser` popover.

### `/skills/[id]` detail/edit page

- **Load:** `GET /api/v1/user-skills/{id}` → `UserSkill` (404 → SvelteKit 404; other → 502).
- **Breadcrumb:** `Skills › {display_name}` (matches `/matters/[id]`).
- **Read-only header info:** slug (monospace), version, `scope` badge, and a "Forked from `{forked_from}`" note when `forked_from` is set.
- **Editable frontmatter** (one `?/save` form): `display_name`, `description`, `version`, `tags` (`TagInput`), `slash_alias`.
- **Body editor:** monospace `<textarea>` + UTF-8 byte counter (ContextSection pattern).
- **Save** (primary) + **Archive** (destructive, behind a confirm modal).

### Fork flow (lean — the edit page is the preview)

`Browse & fork` → searchable built-in popover (KbPicker idiom; fetches `/skills/builtins` on open, client-side filter) → pick a built-in → `ForkModal` with optional `new_name` override (default = the built-in's display name) → submit `?/fork` → **201** → `redirect(303, /skills/{new_id})`, where the user sees and edits the forked body. No separate read-only built-in route is needed.

## 4. Components — `src/lib/skills/authoring/`

The existing `src/lib/skills/` (attach machinery: `attach.svelte.ts`, `types.ts`, autocomplete) is **untouched**. Authoring components live in a new `authoring/` subfolder, mirroring `src/lib/knowledge/`.

| File                      | Responsibility                                                                                                                                                                                                                                                                                        | Depends on                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `deriveSlug.ts`           | Pure: `display_name` → kebab-case, strip to `[a-z0-9-]`, collapse repeated dashes, trim leading/trailing dash, clamp to 32 chars.                                                                                                                                                                     | —                                 |
| `types.ts`                | Re-export `UserSkill`, `UserSkillCreate`, `UserSkillUpdate`, `SkillSummary` from `$lib/api/backend` (single source of truth).                                                                                                                                                                         | `backend.d.ts`                    |
| `TagInput.svelte`         | Chip input for `tags`: add on Enter/comma, remove on click/Backspace, kebab-normalize, dedupe. Emits `string[]` via `bind:tags`.                                                                                                                                                                      | —                                 |
| `SkillRow.svelte`         | Index row: `display_name`, truncated `description`, tags, `slash_alias` badge, `updated_at`; whole row links → `/skills/[id]`.                                                                                                                                                                        | `types`                           |
| `CreateSkillModal.svelte` | Blank-create modal. Fields: `display_name` (→ live `deriveSlug`, editable override), `description`, `body` (textarea seeded with a starter scaffold so `body` is non-empty per contract), `tags` (`TagInput`), `slash_alias`. `use:enhance` close-on-success; inline 409 (slug) / 422 (alias) errors. | `deriveSlug`, `TagInput`, `types` |
| `ForkBrowser.svelte`      | Searchable popover (KbPicker idiom): fetch `/skills/builtins` on open, client-side filter, per-row **Fork** → opens `ForkModal`.                                                                                                                                                                      | `types`                           |
| `ForkModal.svelte`        | Confirm-fork modal: optional `new_name` (default = built-in display name); submits the `?/fork` form. `use:enhance` (redirect handled server-side).                                                                                                                                                   | —                                 |

Reusable idioms from P4-3b (reuse exactly):

- **Modal:** `role="dialog"` + `aria-modal` + backdrop `role="presentation"` + capture-phase Escape `$effect`.
- **Close-on-success enhance:** `use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') onclose(); }}`.
- **One-time `$state` seed from props:** `untrack(() => ...)`.

## 5. Server actions (`+page.server.ts`)

All proxy through `lqFetch(event, path, init)` (`$lib/server/lqClient`), which attaches the Bearer cookie and refreshes once on 401. JSON bodies are auto-content-typed by `lqFetch`.

### `/skills/+page.server.ts`

- **`load`** → `lqFetch(event, '/api/v1/user-skills?scope=user')`; 502 on non-ok; filter `archived_at == null`; return `{ skills }`.
- **`?/create`** → build `UserSkillCreate` from form (`display_name`, `slug` derived/overridden, `description`, `body`, `tags`, `slash_alias`, `version: '1.0.0'`, `scope: 'user'`). `POST /api/v1/user-skills`.
  - 201 → `redirect(303, /skills/{id})`.
  - 409 → `fail(409, { field: 'slug', error: 'A skill with that name already exists.' })`.
  - 422 → `fail(422, { field: 'slash_alias', error: '<message from body>' })`.
  - else → `fail(502, ...)`.
- **`?/fork`** → read `skill_name` + optional `new_name`. `POST /api/v1/skills/{skill_name}/fork` body `{ new_name?, scope: 'user' }`.
  - 201 → `redirect(303, /skills/{id})`.
  - 409 → `fail(409, { error: 'You already have a skill forked from this one.' })`.
  - else → `fail(502, ...)`.

### `/skills/[id]/+page.server.ts`

- **`load`** → `GET /api/v1/user-skills/{id}`; 404 → `error(404)`; other non-ok → `error(502)`; return `{ skill }`.
- **`?/save`** → build `UserSkillUpdate` (only the editable fields). `PATCH /api/v1/user-skills/{id}`.
  - 200 → `{ success: true }`.
  - 422 → `fail(422, { field: 'slash_alias', error: '<message>' })`.
  - 404 → `fail(404, { error: 'This skill no longer exists.' })`.
  - else → `fail(502, ...)`.
- **`?/archive`** → `DELETE /api/v1/user-skills/{id}`. 204 (or 409 already-archived, treated as success) → `redirect(303, '/skills')`; else `fail(502, ...)`.

### `/skills/builtins/+server.ts`

- **`GET`** → `lqFetch(event, '/api/v1/skills?scope=builtin')`; pass through JSON; 502 on non-ok. Returns `SkillSummary[]`.

## 6. Edit-page reactivity (gotchas to honor)

- **`use:enhance` is required on the Save form** — the page owns the body `$state`; without `enhance` the form does a full-page navigation and the parent remounts, discarding unsaved edits. Use the shape that calls `await update()` without remount (P4-3b gotcha #9 / #107).
- **No self-referential `$effect` cycles** — if any effect both reads and writes the same `$state`, wrap the read in `untrack(() => ...)` (P4-3b gotcha).
- **Slug field is shown read-only on the detail page** — it cannot change after create.

## 7. Navigation

Add a `Skills` item to the sidebar `nav` array in `src/lib/components/Sidebar.svelte` (`href: '/skills'`, a `@lucide/svelte` icon — e.g. `Sparkles` or `ScrollText`). Place it after `Workflows`. Update `src/lib/components/sidebar.test.ts` if it asserts the nav set. The existing `/workflows` placeholder is left as-is for playbooks (P5-2).

## 8. Error handling summary

| Surface       | Status | UX                                                             |
| ------------- | ------ | -------------------------------------------------------------- |
| Create        | 409    | Inline on slug field: "A skill with that name already exists." |
| Create / Save | 422    | Inline on slash_alias field: backend message.                  |
| Save / load   | 404    | "This skill no longer exists." / SvelteKit 404 page.           |
| Fork          | 409    | "You already have a skill forked from this one."               |
| Any           | 502    | Generic "Could not …" message; no partial state.               |

## 9. Testing

**Quality bar:** `npm run check` = **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; signal is exit 0 + "0 errors and 0 warnings"). eslint clean on touched files. Verify against the **real backend** — rebuild `donna-web` before any live e2e (`docker compose up -d --build donna-web`).

### Unit (vitest jsdom + `@testing-library/svelte`, `expect: { requireAssertions: true }`, mock `$app/forms` `enhance`)

- `deriveSlug` — table of inputs (spaces, punctuation, unicode, >32 chars, leading/trailing dashes).
- `TagInput` — add (Enter/comma), remove (click/Backspace), normalize, dedupe.
- `CreateSkillModal` — slug derives live from display_name; manual override sticks; enhance-success calls `onclose`; 409 renders inline on slug; 422 on slash_alias.
- `ForkBrowser` — fetches `/skills/builtins` on open, filters client-side, Fork submits the right `skill_name`.
- `/skills/[id]/+page.svelte` — body `$state` survives a save (no remount); Archive opens confirm; tags round-trip.
- Server tests for both `+page.server.ts` — load shapes; each action's success + each documented failure status maps to the right `fail`/`redirect`.
- **Exact-string test queries** (`getByLabelText('Name')`, not `/name/i`) and `{ name: 'Save', exact: true }` to avoid substring collisions (P4-3b lesson).

### Live e2e — `tests/skills-authoring.spec.ts` (self-cleaning)

Pattern reference: `tests/kb-management.spec.ts`, `tests/matter-files.spec.ts`.

1. Create a skill (unique `Date.now()` name) → assert it appears in `/skills` index (exact-name locator).
2. Open `/skills/[id]` → edit the body + set a `slash_alias` → Save → SPA-nav back and assert persistence (prefer SPA-link nav over `page.reload()` — P4-3b SvelteKit-2/Svelte-5 stale-`data` gotcha).
3. `Browse & fork` a built-in → assert redirect to the new skill's edit page with the forked body present.
4. Archive a skill → assert it disappears from the index.
5. **Teardown (`try/finally`):** DELETE-archive every skill this run created, via the API.

## 10. Implementation order (for the plan)

Bite-sized TDD tasks, each with complete code and an atomic commit:

1. `deriveSlug.ts` + tests.
2. `authoring/types.ts` re-exports.
3. `TagInput.svelte` + tests.
4. `/skills/builtins/+server.ts` + server test.
5. `/skills/+page.server.ts` load + `?/create` + `?/fork` + server tests.
6. `SkillRow.svelte` + `/skills/+page.svelte` (index render + empty state) + tests.
7. `CreateSkillModal.svelte` + wire into index + tests.
8. `ForkBrowser.svelte` + `ForkModal.svelte` + wire into index + tests.
9. `/skills/[id]/+page.server.ts` load + `?/save` + `?/archive` + server tests.
10. `/skills/[id]/+page.svelte` (header + frontmatter fields + body editor + Save + Archive confirm) + tests.
11. Sidebar `Skills` nav entry + `sidebar.test.ts` update.
12. Live e2e `tests/skills-authoring.spec.ts`; rebuild `donna-web`; full-branch review; open PR.

## 11. Open follow-ups (not blockers)

- **CodeMirror body editor** — polish slice if the `<textarea>` proves rough.
- **`frontmatter_extra` editor** — when a domain need (jurisdiction/output_format) surfaces.
- **Team-scope skills** — needs the team-admin gate subsystem (D8.1).
- **Skill references / examples** — the `Skill` schema carries more than `body`.
- **Playbooks** — P5-2 (`POST /api/v1/playbooks/easy` per the M3-A6 docstring; spike first).
