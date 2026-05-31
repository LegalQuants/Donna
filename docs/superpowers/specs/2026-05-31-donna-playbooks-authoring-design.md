# Donna — Playbooks Manual Authoring + Full Position Editor (P5-2 slice D) — design

**Date:** 2026-05-31 · **Branch:** `playbooks-authoring` · **Predecessors:** P5-2 slices A (browse, #25), B (apply, #26), C (easy-gen wizard, #27 — merged).

## 1. Goal

Let users **author and maintain playbooks by hand**, completing the Playbooks subsystem's CRUD. Slice D delivers a reusable full-position editor and wires it into four flows:

1. **Create from scratch** — start a blank playbook, add positions, `POST /playbooks`.
2. **Duplicate** any playbook (including the read-only built-ins) into a new owned, editable copy.
3. **Edit** a playbook you own — full field editing + add/remove/reorder positions — `PATCH /playbooks/{id}`.
4. **Delete** a playbook you own — `DELETE /playbooks/{id}`.

It also **upgrades the easy-gen wizard's Step 3** from prune-only (`DraftReview`) to the full editor.

**Out of scope (deferred):** unsaved-changes navigation guard; drag-and-drop reorder (↑/↓ buttons only); editing built-ins in place (Duplicate is the customization path); run history; KB-file source for the wizard picker; `cited_chunk_ids` → doc-panel citations; redline export.

## 2. Backend contract (verified against `src/lib/api/backend.d.ts`, pin `438198c`)

- **`POST /api/v1/playbooks`** body = `PlaybookCreate` `{ name, contract_type, description?, version?, positions?: PositionCreate[] }`. Server sets `created_by` to the caller unconditionally; **no HTTP path mints a built-in** (`created_by IS NULL` ships via seed migration only).
- **`PATCH /api/v1/playbooks/{id}`** body = `PlaybookUpdate` `{ name?, contract_type?, description?, version?, positions?: PositionCreate[] | null }`. All fields optional ("missing = leave alone"). **If `positions` is supplied the server atomically replaces the entire positions list**; omit to leave alone, send `[]` to clear. → We always send the full `positions` array on save.
- **`DELETE /api/v1/playbooks/{id}`**.
- **`GET /api/v1/playbooks/{id}`** returns `Playbook` (with `positions: Position[]`, and `created_by?: string | null`).
- **`PositionCreate`** = `{ issue, description?, standard_language, fallback_tiers?: FallbackTier[], redline_strategy?, severity_if_missing: 'critical'|'high'|'medium'|'low', detection_keywords?: string[], detection_examples?: string[], position_order? }`.
- **`FallbackTier`** = `{ rank, description, language }`.
- **There is no `PositionUpdate` and no per-position endpoint** — position editing is always whole-array replace via PATCH (or the create body).
- **There is no playbook fork endpoint** (unlike skills) — Duplicate is implemented client/SSR-side: fetch the source, strip ids, prefill the create form, `POST` as new.

**Research items to confirm during planning (not blocking design):**
- **R1:** `locals.user.id` is exposed for ownership comparison. The run gate (`[id]/run/+page.server.ts`) only reads `locals.user.is_admin`; confirm `id` is present on `locals.user` (check the auth hook / `app.d.ts`). Needed to compute `isOwner = playbook.created_by === locals.user.id`.
- **R2:** PATCH/DELETE authorization — confirm owner-only vs owner-OR-admin. Default design assumption: **owner-only; built-ins (`created_by === null`) are read-only for everyone.** If the backend also lets admins edit built-ins, we still keep built-ins read-only in the UI (Duplicate is the path) to avoid mutating shared seed content. Map a backend `403` to an inline error regardless.

## 3. Architecture

**Shared, mode-agnostic `PlaybookEditor` + thin route consumers.** The editor owns all form state and emits a `PlaybookCreate` via `onchange` (the same contract `DraftReview` uses today). It does **no** I/O and has **no** async controller — unlike easy-gen (`genFlow`), authoring is pure synchronous form state; persistence is a SvelteKit form `?/save` action per route (`POST` for create, `PATCH` for edit), mirroring the wizard's hidden-`draft`-JSON pattern.

Three consumers:
- **Create route** `/playbooks/new/manual` — blank, or `?from={id}` duplicate-prefill.
- **Edit route** `/playbooks/[id]/edit` — owner-gated, PATCH on save.
- **Wizard Step 3** `/playbooks/new` — swaps `DraftReview` → `PlaybookEditor` in place (prune is now "Remove a position").

### 3.1 New components — `src/lib/playbooks/editor/`

| Component | Responsibility | Emits / interface |
|---|---|---|
| `FallbackTierEditor.svelte` | Repeatable rows for `fallback_tiers: {rank, description, language}[]`. Add/remove a tier; **`rank` auto-assigned sequentially** (1,2,3…) on every add/remove so users never hand-number. `description` = text input, `language` = textarea. | `{ tiers, onchange: (tiers: FallbackTier[]) => void }` |
| `PositionEditor.svelte` | All fields of one `PositionCreate`: `issue` (required), `description`, `standard_language` (textarea, required), `severity_if_missing` (`<select>`, required), `redline_strategy` (textarea), `detection_keywords` (reuse `TagInput`), `detection_examples` (one-per-line `<textarea>` ↔ string[]), nested `<FallbackTierEditor>`. | `{ position, onchange: (p: PositionCreate) => void }` |
| `PlaybookEditor.svelte` | Header fields (`name`, `contract_type`, `description`, `version`) + an **accordion** list of positions (collapsed = `issue` + `SeverityBadge`; expand to edit), **↑/↓ reorder** (rewrites `position_order`), **+ Add position** / **Remove**, inline per-position invalid markers, a derived `valid` flag. | `{ initial: PlaybookCreate, onchange: (value: PlaybookCreate) => void }` |

- **`detection_examples` textarea convention:** split on `\n`, trim, drop blank lines → `string[]`; join with `\n` for display. Round-trips losslessly for non-empty single-line examples (examples are short clauses).
- **`DraftReview.svelte` is removed** once the wizard consumes `PlaybookEditor`; its test is replaced by the `PlaybookEditor` tests.
- **Reused as-is:** `TagInput` (`src/lib/skills/authoring/TagInput.svelte`), `SeverityBadge`, `PositionCard` (read-only detail still uses it). `contractFamily` unchanged.

### 3.2 Routes & data flow

- **Chooser:** `/playbooks` "+ New playbook" → a small chooser surface offering **Generate from documents** (`/playbooks/new`, unchanged) and **Start from scratch** (`/playbooks/new/manual`). (Implementation may be a tiny chooser page or a two-button popover from the index header — decided in the plan; both keep `/playbooks/new` as the easy-gen wizard.)
- **Create** `/playbooks/new/manual` (`+page.server.ts` + `+page.svelte`):
  - `load`: if `?from={id}`, `GET /api/v1/playbooks/{id}`, strip `id` + per-position `id`/`position_id`, set `name = "Copy of {name}"`, return as the editor's `initial`; else return a blank `PlaybookCreate` (`version: '1.0.0'`, one empty position or none — plan decides starter state).
  - `?/save`: parse hidden `draft` JSON → validate → `POST /api/v1/playbooks` → `redirect(303, /playbooks/{id})`; `422` → `fail(422, {error})`.
- **Edit** `/playbooks/[id]/edit` (`+page.server.ts` + `+page.svelte`):
  - `load`: `GET` the playbook; **403 if `!isOwner`** (`created_by !== locals.user.id`, and built-ins `created_by === null` are never owned); return it as `initial`.
  - `?/save`: parse `draft` → validate → `PATCH /api/v1/playbooks/{id}` with the **full `positions` array** → `redirect(303, /playbooks/{id})`; `422`/`403` mapped to inline `fail`.
- **Detail** `/playbooks/[id]` (modify existing `+page.svelte` + `+page.server.ts`):
  - `load` adds `isOwner` (needs R1).
  - Buttons: **Edit** + **Delete** when `isOwner`; **Duplicate** for everyone (→ `/playbooks/new/manual?from={id}`).
  - **Delete:** confirm modal (ReceiptsDrawer a11y: `role="dialog"` + Escape) → `?/delete` action → `DELETE /api/v1/playbooks/{id}` → `redirect(303, /playbooks)`.
- **Wizard Step 3** `/playbooks/new/+page.svelte`: replace `<DraftReview draft={flow.draft} onchange=…>` with `<PlaybookEditor initial={flow.draft} onchange=…>`; the existing hidden-`draft` + `?/save` POST path is unchanged.

No new BFF proxies — all server-side via `lqFetch` in `load` + form actions (idiomatic SvelteKit, consistent with slices A/C).

## 4. Validation & errors

- Client `valid` mirrors the server minimum: `name` + `contract_type` non-empty **and** ≥1 position **and** every position has `issue` + `standard_language` (+ a `severity_if_missing`, always set via the select default). Save button `disabled={!valid}`; invalid positions get an inline marker in the accordion summary so the offending one is findable when collapsed.
- Server actions re-validate (don't trust the client) and map: `422` → "The backend rejected the playbook. Check the fields and try again."; `403` (edit/delete non-owned) → "You can only edit playbooks you own."; other non-ok → `502` generic. No backend error bodies forwarded to the client.

## 5. File structure

| File | C/M | Responsibility |
|---|---|---|
| `src/lib/playbooks/editor/FallbackTierEditor.svelte` (+test) | C | fallback tiers rows, auto-rank |
| `src/lib/playbooks/editor/PositionEditor.svelte` (+test) | C | one position, all fields |
| `src/lib/playbooks/editor/PlaybookEditor.svelte` (+test) | C | header + accordion + add/remove/reorder; emits `PlaybookCreate` |
| `src/lib/playbooks/editorDraft.ts` (+test) | C | pure helpers: blank-draft factory, duplicate-strip (`id`/`position_order` reseat), examples↔text, validity check |
| `src/routes/(app)/playbooks/new/manual/+page.server.ts` (+test) | C | create load (blank/`?from`) + `?/save` POST |
| `src/routes/(app)/playbooks/new/manual/+page.svelte` | C | create page (e2e-covered) |
| `src/routes/(app)/playbooks/[id]/edit/+page.server.ts` (+test) | C | edit load (owner-gated) + `?/save` PATCH |
| `src/routes/(app)/playbooks/[id]/edit/+page.svelte` | C | edit page (e2e-covered) |
| `src/routes/(app)/playbooks/[id]/+page.server.ts` | M | add `isOwner`; `?/delete` action |
| `src/routes/(app)/playbooks/[id]/+page.svelte` | M | Edit/Delete (owner) + Duplicate (all) buttons; delete-confirm modal |
| `src/routes/(app)/playbooks/+page.svelte` | M | "+ New playbook" → chooser (generate vs scratch) |
| `src/routes/(app)/playbooks/new/+page.svelte` | M | Step 3: `DraftReview` → `PlaybookEditor` |
| `src/lib/playbooks/DraftReview.svelte` (+test) | D | removed (absorbed by `PlaybookEditor`) |
| `tests/playbooks-authoring.spec.ts` | C | live e2e |

Pure logic (draft factory, duplicate-strip, examples↔text, validity) lives in `editorDraft.ts` so it's unit-testable without component mounting and keeps the components thin.

## 6. Testing

**Unit (Vitest + @testing-library/svelte):**
- `editorDraft.ts` — blank factory shape; duplicate-strip removes ids + reseats `position_order` + "Copy of" name; examples↔text round-trip (blank lines dropped); validity true/false cases.
- `FallbackTierEditor` — add → ranks 1,2; remove first → renumber to 1; edit emits updated array.
- `PositionEditor` — each field type emits an updated `PositionCreate`; keywords via `TagInput`; examples textarea ↔ array; nested fallback tiers wired.
- `PlaybookEditor` — header + a card per position; **+ Add** appends blank; **Remove** drops; **↑/↓** reorders + rewrites `position_order`; emits `PlaybookCreate`; `valid` flips with required fields. (Replaces `DraftReview` tests.)

**Server tests (`// @vitest-environment node`, mock `lqFetch`):**
- `new/manual` — `load` blank vs `?from` (strips ids, "Copy of …"); `?/save` POST → 303 `/playbooks/{id}`; 422 → fail.
- `[id]/edit` — `load` owner OK, **403 non-owner / built-in**; `?/save` PATCH (full positions) → 303; 422/403 mapped.
- `[id]` detail — `isOwner` computed in `load`; `?/delete` DELETE → 303 `/playbooks`.

**Live e2e — `tests/playbooks-authoring.spec.ts`** (no `arq-worker` needed; authoring is synchronous). One self-cleaning flow:
1. Open a built-in (e.g. NDA-Mutual) detail → **Duplicate** → manual editor prefilled → **Save** → new owned playbook detail.
2. **Edit** it: change name, edit a position's `standard_language`, add a fallback tier, **+ Add** a position, **↑/↓** reorder, **Save** → assert on detail.
3. **Create from scratch:** chooser → manual → fill header + one position → **Save**.
4. **Delete** an owned playbook → confirm → back on index, gone.
- **Teardown:** `try/finally` `DELETE`s every owned playbook id created during the run (a real `DELETE /playbooks/{id}` exists → this e2e self-cleans, unlike the easy-gen e2e).

## 7. Conventions

TDD; commit per task; `npm run check` 0 errors / 0 warnings; eslint clean (no `any`); in-app `<a>`/`goto`/`replaceState` need the `svelte/no-navigation-without-resolve` disable comment; server-test pattern `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`; component-test `@testing-library/svelte`; modal a11y mirrors `ReceiptsDrawer`. Subagent-driven execution with two-stage (spec then quality) review per task; whole-branch review → PR into `main`.

## 8. Follow-ups (after D)

Run history; KB-file source for the easy-gen picker; `cited_chunk_ids` → document-panel citations; redline export; optional unsaved-changes guard if it proves needed.
