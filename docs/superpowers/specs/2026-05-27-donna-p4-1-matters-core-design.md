# P4-1 — Matters core + chat scoping (design)

**Date:** 2026-05-27 · **Phase:** P4-1 (first slice of P4 — Projects/Matters) · **Branch off:** `main` (`cb6d457`, pin `438198c`)

## 1. Goal

Give Donna a first-class **Matters** surface (the backend calls them _projects_; the UI calls them
_matters_) and let a chat be **scoped to a matter**. Scoping is the keystone: a chat with a
`project_id` whose matter has a knowledge base auto-retrieves and produces verified citations — so
P4-1 makes the citation/document-panel work (P2b–P3) reachable for normal UI chats, not just
API-seeded ones.

## 2. Scope (confirmed)

In:

- **Matters list** (`/matters`) — active matters as a scannable **row list** + a **Create-matter** modal.
- **Matter detail** (`/matters/[id]`) — **single-column** header + the matter's chats as openable rows + "New chat in this matter".
- **Rename + archive** on the detail page.
- **Composer matter-picker** — a searchable control in the landing/new-chat composer control row; "No matter" default.
- **Read-only matter badge** in an existing chat's header.

Out (deferred — see §9): privileged toggle + tier-floor (P4-2); matter documents/KBs/skills + `context_md` (P4-3); KB document upload, chat file upload, skills authoring, playbooks; folder tree / file versions / sharing (upstream-blocked).

## 3. Backend reality (verified against the generated types Donna consumes)

- `GET /api/v1/projects` (list, excludes archived by default) · `POST /projects` · `GET /projects/{id}` · `PATCH /projects/{id}` · `DELETE /projects/{id}` (soft-delete via `archived_at`) — all READY.
- `Project`: `id, name, slug, description, context_md, owner_id, privileged, minimum_inference_tier, attached_skill_names[], attached_file_ids[], is_sandbox, archived_at, created_at, updated_at`.
- `GET /api/v1/chats?project_id={id}` filters a matter's chats. `Chat.project_id` is nullable.
- `ChatCreate` accepts `project_id`; **`ChatUpdate` only allows `title`/`archived`** → **a chat's matter is fixed at creation and cannot be re-scoped.** `GET /chats/{id}` returns the chat (for reading `project_id`).
- A per-user `__sandbox__` matter / `is_sandbox` projects exist; P4-1 **filters them out** (treats "No matter" as the unscoped/general case).

## 4. Architecture — idiomatic SvelteKit (pages + form actions; no client store)

Mutations use SvelteKit **form actions**, not new BFF endpoints — a route can't host both a page and a
GET endpoint, and actions are the natural fit. The picker reads its matter list from SSR `load` data.

- **`/matters`** — `+page.server.ts`: `load` → `GET /projects` (filter out `is_sandbox`); action `create` (`POST /projects {name, description}` → redirect to the new `/matters/[id]`). `+page.svelte`: row list + `CreateMatterModal`. Empty state when no matters.
- **`/matters/[id]`** — `+page.server.ts`: `load` → `GET /projects/{id}` + `GET /chats?project_id={id}`; actions `rename` (`PATCH /projects/{id} {name, description}`), `archive` (`DELETE /projects/{id}` → redirect `/matters`), `newChat` (`POST /chats {project_id}` → redirect `/chats/[id]`). `+page.svelte`: single-column header (name, description, "New chat in this matter", Rename, ⋯→Archive) + the matter's chats as openable rows (empty state when none).
- **`/` (landing)** — add `load` → `GET /projects` (for the picker); the existing `start` action gains `project_id` from a hidden input (omitted/null = "No matter", unchanged behavior otherwise).
- **`/chats/[id]`** — `load` additionally `GET /chats/{id}` → `project_id`; if set, `GET /projects/{id}` for the name (parallelized with the existing messages fetch) → returns `matter: {id, name} | null`.

## 5. Components (`src/lib/matters/`, presentational, plain props)

- **`MatterPicker.svelte`** — searchable popover for the composer control row. Props: `matters: {id,name}[]`, `bind:selectedId: string|null`. "No matter (general)" default at top + type-to-filter list. Mounted **only on the landing**: `Composer.svelte` gains an optional `matterPicker` prop (inverse of how skill/enhance are gated to in-chat); in-chat composers omit it (matter is fixed at create).
- **`MatterBadge.svelte`** — read-only. Props: `matter: {id,name}|null`. Renders the name as a chip linking to `/matters/[id]`, or a muted "No matter" when null. Sits at the left of the existing chat-header bar (Receipts stays right).
- **`MatterForm.svelte`** (used by create modal + rename) — `name` (required, trimmed non-empty) + `description` (optional); submits via `use:enhance`. Create mode posts `create`; edit mode seeds current values and posts `rename`.

## 6. Data flow — new-chat-with-matter

- **Landing:** `MatterPicker` sets `selectedId` → hidden `<input name="project_id">` in the landing form → `start` action passes `project_id` (or omits when null) to `POST /chats`. Draft-cookie + redirect flow unchanged.
- **Detail "New chat in this matter":** `newChat` action `POST /chats {project_id:id}` → redirect to `/chats/[id]`.
- **Existing chat:** header `MatterBadge` reflects the loaded `matter` — display only; no re-pick (matter fixed at create).

## 7. CRUD behaviors & edge cases

- **Create:** "New matter" opens `CreateMatterModal` (name required, description optional). `create` → `POST /projects` (privileged omitted → backend default `false`; no tier). Success → redirect to the new detail page; failure → `fail(4xx)` shown inline.
- **Rename:** detail "Rename" opens `MatterForm` seeded with current values → `PATCH /projects/{id}`.
- **Archive:** ⋯ menu → "Archive" with a confirm step → `DELETE /projects/{id}` → redirect `/matters`. List shows active only. Archived-view / unarchive **deferred** (no simple restore endpoint).
- **Empty states:** no matters → quiet "No matters yet — create one to organize chats and documents"; matter with no chats → "No chats in this matter yet"; matter-less chat → muted "No matter" badge.
- **Sandbox:** `is_sandbox` projects filtered from list + picker.

## 8. Testing

**Unit / component (vitest + jsdom, `@testing-library/svelte`):**

- `MatterPicker`: renders matters + "No matter" default; type-to-filter narrows; selecting writes `selectedId`; "No matter" clears it; keyboard/focus paths.
- `MatterBadge`: name + link to `/matters/[id]`; muted "No matter" when null.
- `MatterForm`: name-required validation (blocks empty/whitespace); submits name+description; edit mode seeds values.
- **Form-action server tests** (mock `lqFetch`, mirror existing `server.test.ts`): `create` → `POST /projects` body + redirect; `rename` → `PATCH`; `archive` → `DELETE` + redirect; `newChat` → `POST /chats {project_id}` + redirect; landing `start` threads `project_id` (present + omitted); chat `load` resolves `matter` (set + null); list/detail `load` shape + sandbox filtering.

**Live e2e (`tests/matters.spec.ts`):**

1. Create a matter in the UI → appears in `/matters` → open detail.
2. "New chat in this matter" → chat opens with the **matter badge** showing the name; assert the created chat's `project_id` is set.
3. Rename → reflected in badge/list; archive → leaves the list.
4. **Citation payoff (seeded):** seed a KB+PDF into a matter via API (file attach is P4-3), then from the **landing picker** select that matter, send the cross-topic question, and assert a citation pill appears — proving matter-scoping lights up RAG for a normal UI chat.

Rebuild `donna-web` before the live run; assert on unique controls (strict-mode). Quality bar: `npm run check` 0/0, eslint clean, no new lint violations.

## 9. Out of scope for P4-1 → P4+ capability backlog

P4-1 ships matters core + scoping only. The following are **named future work**, each to be built in
**Donna's design language — minimal chrome, plain-language, task-focused; the opposite of the LQ_AI
developer frontend's menu-dense, capability-showcase UX.** Donna's job is to expose the full lq-ai
backend power through a friendly, easy-to-understand surface.

| Slice                                   | Capability                                                                                                                                                                                                 | Backend                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **P4-2 Privilege & tier-floor**         | `privileged` toggle + `minimum_inference_tier` on create/edit, coupled validation (`privileged ⇒ tier`), reserved privileged visual token, tier-floor surfaced in the model/picker UI                      | READY (matches LQ_AI new-matter modal)                                                |
| **P4-3 Matter documents, KBs & skills** | Attach files to a matter, edit `context_md`, attach/link a KB to a matter, attach skills to a matter — as **sections** in the single-column detail (Donna's friendlier take on LQ_AI's matter rail)        | READY (`POST /projects/{id}/files`, KB link via `project_id`, `attached_skill_names`) |
| **Knowledge management**                | Upload documents into a KB (with ingestion-status feedback) + create KBs                                                                                                                                   | READY (`POST /files`, `POST /knowledge-bases/{id}/files`)                             |
| **Chat-level attach**                   | Upload a file directly to a chat from the composer (skill-attach already shipped in P2c-B2)                                                                                                                | READY                                                                                 |
| **Skills authoring (P5 Workflows)**     | Create/update skills (with version history)                                                                                                                                                                | READY (`/user-skills`, `/user-skills/{id}/versions`)                                  |
| **Playbooks (P5 Workflows)**            | Create playbooks (incl. **generate from prior agreements**) and **apply** them in a workflow or in chat (like skills); the executor walks each standard position, classifies the contract, drafts redlines | per LQ_AI Playbooks — confirm exact endpoints at slice time                           |
| **Upstream-blocked**                    | Folder tree · file versions · project sharing/ACL                                                                                                                                                          | ABSENT — need an upstream lq-ai request first                                         |

The roadmap's **P5 Workflows** ("Unified Skills + Playbooks + Saved Prompts") is the natural home for
skills authoring + playbooks; P4-2/P4-3 extend the Matters surface; Knowledge management + chat file
upload are nearer-term documents-UX work that can slot after P4-3.

## 10. Key files

- New: `src/routes/(app)/matters/+page.server.ts` + `+page.svelte`; `src/routes/(app)/matters/[id]/+page.server.ts` + `+page.svelte`; `src/lib/matters/MatterPicker.svelte`, `MatterBadge.svelte`, `MatterForm.svelte` (+ `CreateMatterModal` wrapper if needed) + tests; `tests/matters.spec.ts`.
- Modified: `src/routes/(app)/+page.server.ts` (load matters + thread `project_id` in `start`), `src/routes/(app)/+page.svelte` (picker in landing form), `src/lib/components/Composer.svelte` (optional `matterPicker` prop), `src/routes/(app)/chats/[id]/+page.server.ts` (resolve `matter`), `src/routes/(app)/chats/[id]/+page.svelte` (header badge).
- The sidebar already links "Projects" → `/matters` (no change needed).

## 11. Quality bar (unchanged)

`npm run check` → **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` stderr harmless). No new
eslint violations on touched files; single-targeted ignores only where a rule genuinely fires. One PR
into `main` via brainstorm → spec → plan → subagent-execute (two-stage review) → live e2e →
finishing-a-development-branch.
