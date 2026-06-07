# Donna — Saved Prompts (P5-3) — design

**Date:** 2026-05-31 · **Branch:** `saved-prompts` · **Phase:** P5 Workflows, third leg (after Skills authoring + Playbooks A–D).

## 1. Goal

Let users save reusable blocks of prompt text and drop them into the composer. Three surfaces, one loop:

1. **Manage** — a `/prompts` page to list / create / edit / delete saved prompts.
2. **Insert** — a composer "Prompts" popover that inserts a saved prompt's text into the message box at the cursor.
3. **Save-from-composer** — capture the current draft as a new saved prompt without leaving the composer.

User-scoped. **Out of scope (backend doesn't model these):** variables/placeholders (it's plain text, unlike skills' `{{tokens}}`), folders, sharing/ACL, versioning.

## 2. Backend contract (verified against `src/lib/api/backend.d.ts`, pin `438198c`)

- `GET /api/v1/saved-prompts` → `SavedPrompt[]` (the caller's prompts).
- `POST /api/v1/saved-prompts` body `{ name: string; prompt_text: string; tags?: string[] }` → **201** `SavedPrompt`.
- `GET /api/v1/saved-prompts/{prompt_id}` → `SavedPrompt` (404 if missing).
- `PATCH /api/v1/saved-prompts/{prompt_id}` body `{ name?: string; prompt_text?: string; tags?: string[] }` → **200** `SavedPrompt`.
- `DELETE /api/v1/saved-prompts/{prompt_id}` → **204**.
- `SavedPrompt = { id, user_id, name, prompt_text, tags?, created_at, updated_at? }`. There is no named `SavedPromptCreate`/`Update` schema — the POST/PATCH bodies are inline object types.

All endpoints are user-scoped server-side (the backend keys off the caller's identity); there is no ownership/admin nuance to model in the UI.

## 3. Architecture

**BFF proxies + a shared `promptLibrary` client controller.** Both _save-from-composer_ and a live-updating list require client-side mutation, so all CRUD flows through one rune controller backed by thin JSON proxies. The composer popover and the `/prompts` management page share that single data path. (Alternative considered: SSR `load` + form actions for the management page while only the composer uses proxies — rejected as two paths to the same CRUD for marginal gain.)

### 3.1 Files / units

| File                                               | C/M | Responsibility                                                                   |
| -------------------------------------------------- | --- | -------------------------------------------------------------------------------- |
| `src/lib/prompts/types.ts`                         | C   | `SavedPrompt` re-export + inline `SavedPromptCreate`/`SavedPromptUpdate` aliases |
| `src/routes/(app)/prompts/+server.ts` (+test)      | C   | BFF proxy: `GET` list, `POST` create                                             |
| `src/routes/(app)/prompts/[id]/+server.ts` (+test) | C   | BFF proxy: `PATCH`, `DELETE`                                                     |
| `src/lib/prompts/promptLibrary.svelte.ts` (+test)  | C   | client controller over the proxies                                               |
| `src/lib/prompts/PromptPicker.svelte` (+test)      | C   | composer popover: search + insert-at-cursor + save-current-draft                 |
| `src/lib/prompts/PromptRow.svelte` (+test)         | C   | management list row (name + tags + preview + Edit/Delete)                        |
| `src/lib/prompts/PromptModal.svelte` (+test)       | C   | create/edit modal (name + prompt_text + TagInput)                                |
| `src/routes/(app)/prompts/+page.server.ts` (+test) | C   | SSR `load` (GET list) for instant paint                                          |
| `src/routes/(app)/prompts/+page.svelte` (+test)    | C   | management page (rows + create/edit modal + delete-confirm)                      |
| `src/lib/components/Composer.svelte`               | M   | `insertAtCursor(text)` helper + `promptLibrary` prop + Prompts control           |
| landing `+page.svelte` + chat `[id]/+page.svelte`  | M   | instantiate `promptLibrary`, pass to Composer                                    |
| sidebar nav component                              | M   | add "Prompts" entry (lucide icon)                                                |
| `tests/saved-prompts.spec.ts`                      | C   | live e2e                                                                         |

### 3.2 `promptLibrary.svelte.ts` (client controller)

- State: `prompts: SavedPrompt[]`, `loaded: boolean`, `error: string | null`.
- `seed(list)` — set `prompts` from an SSR `load` (management page), marks `loaded`.
- `ensureLoaded()` — if not `loaded`, `GET /prompts` (proxy) and cache; called on first composer-popover open.
- `create({name, prompt_text, tags})` — `POST /prompts`; on 201 prepend to `prompts`; returns the created prompt (or sets `error`).
- `update(id, patch)` — `PATCH /prompts/{id}`; on 200 replace in `prompts`.
- `remove(id)` — `DELETE /prompts/{id}`; on 204 drop from `prompts`.
- Mutation failures set `error` (a short message) and leave state unchanged; the caller (popover/modal) surfaces it.

### 3.3 Composer integration

- Composer gains `insertAtCursor(text: string)`: uses its existing `textarea` ref + `textarea.setRangeText(text, selectionStart, selectionEnd, 'end')`, syncing the `value` bindable; falls back to appending (newline-joined if non-empty) when no textarea/selection is available. Re-focuses the textarea after insert.
- New **Prompts** control (lucide icon, e.g. `BookMarked`/`MessageSquareText`) in the control row opens `PromptPicker`. Rendered on **landing + in-chat both** (gated by the `promptLibrary` prop being present). No cookie threading is needed — inserting only fills the message text; the normal send flow carries it (contrast skills, which thread metadata through the landing→chat hop).
- `PromptPicker` popover: a search box (filters by name + tags, client-side), a scrollable list (click a prompt → `insertAtCursor(prompt.prompt_text)` + close), and a footer **"Save current draft as a prompt"** that reveals an inline name input (+ optional `TagInput`) seeded from the current `value`; submit → `promptLibrary.create(...)` → the new prompt appears in the list. The draft is never discarded on a failed save.

### 3.4 Management page (`/prompts`)

- SSR `load` (GET via `lqFetch`) returns `{ prompts }` for instant paint; the page seeds the controller from it.
- Rows (`PromptRow`): name + tag chips + a truncated `prompt_text` preview, with **Edit** and **Delete**. Empty state with a "+ New prompt" CTA in the header.
- **Create/Edit** via one `PromptModal` (two modes): name input + `prompt_text` textarea + `TagInput`. **Delete** → confirm modal (ReceiptsDrawer a11y: `role="dialog"` + Escape).
- Sidebar gains a "Prompts" entry.

### 3.5 Tags

Reuse the existing `TagInput` (`src/lib/skills/authoring/TagInput.svelte`) — saved-prompt tags are genuine short labels, the same shape skills tags use. (This is the appropriate use of TagInput; slice-D's free-text `detection_keywords` correctly avoided it because TagInput slugifies, but tag labels are fine slugified.)

## 4. Error handling

- Proxies map non-ok backend responses to a clean status (404 passthrough on GET `[id]`; otherwise 502) and never forward the backend body. POST→201, PATCH→200, DELETE→204 are the success contracts.
- Controller mutation failures set `error`; the composer save-form and the management modal display it inline and preserve user input.
- The composer "Save as prompt" requires a non-empty name and non-empty `prompt_text` (the current draft); the button is disabled otherwise.

## 5. Testing

- **Unit:** `promptLibrary` (seed; ensureLoaded fetches once + caches; create prepends; update replaces; remove drops; error path leaves state intact). `PromptPicker` (search filters; clicking a prompt calls the insert callback with its text; save-current-draft creates + lists it; disabled save when empty). `PromptModal` (create vs edit mode emits the right payload). `PromptRow` (renders name/tags/preview; Edit/Delete fire). Composer `insertAtCursor` (splices at cursor; appends when empty/no selection).
- **Server:** the two proxy files (GET/POST/PATCH/DELETE paths + status mapping, mocked `lqFetch`); the management `+page.server.ts` `load`.
- **Live e2e** (`tests/saved-prompts.spec.ts`, self-cleaning): in the composer, open Prompts → **save** the current draft as a prompt → it appears in the list → **insert** it → send → assert it reached the message; then `/prompts` → **edit** the name → **delete** → gone. Teardown DELETEs any leftover via the proxy. No `arq-worker`/LLM needed (pure CRUD + send).

## 6. Conventions

TDD; commit per task; `npm run check` 0 errors/0 warnings; eslint clean (no `any`); in-app `<a>`/`goto` need the `svelte/no-navigation-without-resolve` disable comment; server-test pattern `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`; component tests `@testing-library/svelte`; modal a11y mirrors `ReceiptsDrawer`/skills. Subagent-driven execution with two-stage (spec then quality) review per task; whole-branch review → PR into `main`.

## 7. Follow-ups (after this slice)

Unified Workflows IA (tie Skills + Playbooks + Saved Prompts under one nav/area with shared transparency surfaces) — the remaining P5 integration item; insert-prompt-into-an-existing-chat-message edge cases; prompt usage analytics. None block this slice.
