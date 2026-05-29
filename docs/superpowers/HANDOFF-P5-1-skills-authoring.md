# Donna — Handoff for the next session (start P5: P5-1 skills authoring)

**Date:** 2026-05-28 · **Branch state:** `main` has everything through **P4-3b** — P0/P1 (#1), P2a (#2), P2b (#3), P2c-A (#4), P2c-B (#5–#8), P3-1 (#9), P3-2 (#10), P3-3 (#12), P4-1 (#13), P4-2 (#15), P3-polish auto-scroll-on-open (#16), P4-3a (#17), **P4-3b matter docs / KB management (#19)**. `vendor/lq-ai` pinned at **`438198c`** (unchanged since P2c-B2). You are on `main`; start the next slice off `main`.

> **First thing:** `git checkout main && git pull` (confirm HEAD is the #19 merge `ec5f56e` or later). Pin check: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`. The dev stack is up and `.env` is populated (see §4). Read project memory first (`MEMORY.md` index — esp. `donna-phase-status`, `donna-product-direction`, `donna-workflow`, `donna-dev-stack`, `donna-reviewer-remote-hygiene`).

## 1. What Donna is

Standalone MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. Browser talks only to Donna's SvelteKit server (a **BFF**) which holds the lq-ai JWT in httpOnly cookies and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule), brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays. **Product thesis (important — see memory `donna-product-direction`):** Donna exposes the lq-ai backend's power through a **friendly, minimal-chrome, plain-language UX** — the *opposite* of the LQ_AI developer frontend's menu-dense, capability-showcase style. When porting an LQ_AI capability, re-imagine it the Donna way.

## 2. Phase status

| Phase | Status |
|---|---|
| P0–P2c-B | ✅ merged (#1–#8) |
| P3 — Document panel + highlighting | ✅ P3-1 (#9), P3-2 (#10), P3-3 (#12), polish-auto-scroll (#16) |
| **P4 — Projects / Matters** | ✅ **COMPLETE** · P4-1 (#13), P4-2 (#15), P4-3a (#17), P4-3b (#19) |
| **P5 — Workflows (skills authoring + playbooks)** | **P5-1 ⬅️ NEXT** |
| P6 Tabular · P7 Settings/Trust · P8 Redline | pending |

**P4-3b shipped (#19, 2026-05-28):** Cohesive KB management surface. Dedicated `/knowledge/[id]` route (KbHeader + KbFilesSection + HybridAlphaControl) + top-level `/knowledge` index. KB create from the matter Knowledge section's KbPicker via `CreateKbForm.svelte` — single-call create-and-link by passing `project_id` in the `POST /knowledge-bases` body. **Client-side polling + auto-attach** the novel piece: `KbFileRow.svelte` polls `/files/[id]` every 2 s (visibility-paused), watches `ingestion_status` transition pending → processing → ready, fires a hidden `?/attachFile` form exactly once on `ready` (double-attach guard via `attaching` boolean + 409-idempotent backend). 5-min stuck threshold → "Refresh to check"; failed status surfaces `ingestion_error` inline. Rename modal mirrors ReceiptsDrawer a11y. Hybrid α slider debounces 400 ms. KnowledgeSection rows linkify + add Manage link. **While-here bug fix:** `FileRow.svelte` download URL `/api/v1/files/{id}/content` → `/files/{id}/content` (no `/api/v1` route group in Donna; the old URL silently 404'd). **Three bugs flushed by the live e2e author:** `CreateKbForm` `{onsubmit}` shadowed `use:enhance` (fixed: moved into the success callback); `/knowledge/[id]/+page.svelte` had self-referential `$effect` cycles that silently blocked `pendingUploads` updates (fixed: `untrack(() => pendingUploads)` in both effects); the spec used a per-tick `performance.now()` for the stuck timeout but that exhausted the fake-timer test budget (implementer switched to a `setTimeout` cleared in the effect cleanup — semantically identical). 423/423 unit + green live e2e (`tests/kb-management.spec.ts`).

## 3. How to build a slice (the established loop — follow it)

Per slice, one PR into `main`: **brainstorming** (use the visual companion for UI layout questions; spike the live backend contract early; decompose if the phase is multi-subsystem) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks, complete code in every step) → **subagent-driven-development** (fresh implementer per task + **two-stage review: spec-compliance then code-quality**; the controller verifies each reviewer finding before acting; commit per task; final whole-branch review) → **live e2e** against the running stack → **finishing-a-development-branch** (open PR). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; the signal is exit 0 + the "0 errors and 0 warnings" line). Keep **eslint clean on touched files** (`npx eslint <files>`); single-targeted ignores only where a rule genuinely fires. Verify against the **real backend**, not just unit tests; **rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`) — the container serves a built image, not live `src/`.

**Patterns proven through P4-3b (reuse them):** dedicated section route per resource (`/matters/[id]`, `/knowledge/[id]`, now `/skills/[slug]`); top-level index route per resource (`/matters`, `/knowledge`, now `/skills`); presentational components in `src/lib/<feature>/` mirroring `src/lib/matters/`+`src/lib/knowledge/`; per-action form actions on the `+page.server.ts`; `use:enhance` for inline updates without full navigation; modal idiom (`role="dialog"` + `aria-modal` + backdrop `role="presentation"` + capture-phase Escape `$effect`); searchable popovers (KbPicker style); `untrack(() => ...)` for one-time `$state` seeds from props; debounced PATCH for slider/text controls (`queueMicrotask` flush before `requestSubmit`); use **exact-string** test queries (not regex) — Task 11 of P4-3b proved that `getByLabelText(/name/i)` collides with `aria-label="Rename..."` because "rename" contains "name". Form actions that need invalidate-without-navigate use `use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') onsubmit(); }}` so the parent stays mounted (KbFilesSection #19 has the matter-files counterpart).

## 4. Running / verifying the stack

Compose project `donna` on shifted ports (app **http://localhost:13002**, lq-ai api `127.0.0.1:18000`, gateway `18001`). `.env` is gitignored but present and populated (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` for embeddings→RAG/citations, `DONNA_BASE_URL=http://localhost:13002`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`).

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web   # after editing src/ (REQUIRED before live e2e)
npm run check && npx vitest run && npx playwright test
```

**Stack notes (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach. Gateway anonymization is ENABLED. `/tmp/spike.pdf` is the seed fixture. **Live-e2e gotcha:** seeds accumulate in the shared admin account across runs — use unique `Date.now()` names, **exact-name** Playwright locators, and DELETE seeded skills (and matters/KBs/projects) at end-of-test via `try/finally` (the P4-3b `tests/kb-management.spec.ts` is the pattern reference). When a button-name substring-collides with another visible button, use `{ name: 'Save', exact: true }` — `tests/matters.spec.ts:46` is the live example.

## 5. Why P5-1 next (and not chat-level file upload)

The two top items on the post-P4-3b capability backlog (memory `donna-product-direction`) were:

1. **Chat-level file upload** in the composer — UPSTREAM-BLOCKED. Verified 2026-05-28 against `src/lib/api/backend.d.ts` at pin `438198c`: `MessageCreate` has `content` / `model` / `stream` / `skills?` / `skill_inputs?` only — there is no `file_ids` field. There is no `POST /api/v1/chats/{id}/files` either. Implementing chat-level attach requires a backend change first (write a `docs/upstream-requests/<name>.md`, hand to the user to relay, bump the pin once merged — see §7). When that lands, this becomes the natural next slice.
2. **Skills authoring** — backend is READY. `POST /api/v1/user-skills` with `UserSkillCreate`, `PATCH /api/v1/user-skills/{slug}` with `UserSkillUpdate`, `POST /api/v1/skills/{slug}/fork`, `GET /api/v1/user-skills?scope=user|team|all`, `GET /api/v1/skills/{slug}` for the full body. Today the user can *attach* a skill via `SkillAttach` (P2c-B2) but must use the LQ_AI dev frontend to *create* one — exactly the kind of "friendly frontend exposing backend power" gap the product thesis flags. This is the smallest meaningful next slice that doesn't need backend work.

## 6. Next slice — P5-1 (skills authoring: list + create + edit)

The skill management surface mirrors `/matters` and `/knowledge`. Open scope decisions go to the brainstorm (confirm in `gsd-discuss-phase` / `superpowers:brainstorming`):

- **`/skills` top-level index** of the user's editable skills (`GET /api/v1/user-skills?scope=all` → `UserSkill[]`)
- **`/skills/[slug]` detail/edit page** — body markdown editor + frontmatter fields (display_name, description, tags, slash_alias) + Save / Archive
- **Create new skill** entry point — likely `+ New skill` on `/skills` (same modal idiom as matter rename / KB rename). Open scope: should the user start from a blank skill, or fork an existing built-in? Forking is one extra POST (`POST /api/v1/skills/{slug}/fork`) and is product-relevant ("clone the contract-review skill and tweak it for me"). Probably both — `+ New skill` + a Fork button on the built-in detail view.
- **Composer reach-through:** once a skill is created, the existing `SkillAttach` popover (`src/lib/skills/`) already lists user skills via `GET /api/v1/skills?scope=all`. No composer change needed for P5-1 — the round-trip closes automatically.

### Backend contract (verified 2026-05-28 against `src/lib/api/backend.d.ts` at pin `438198c`)

| Surface | Endpoint | Notes |
|---|---|---|
| List picker skills | `GET /api/v1/skills?scope=builtin\|user\|team\|all&tag=<tag>` | `SkillSummary[]`. Used by `SkillAttach` today; P5-1 does not change this. |
| Full skill (frontmatter + body) | `GET /api/v1/skills/{slug}` | `Skill`. 404 if unknown / cross-user. |
| Full skill (inspector) | `GET /api/v1/skills/{slug}/contents` | Same payload as the base GET. Drives the "view this skill" affordance. |
| Declared inputs (form schema) | `GET /api/v1/skills/{slug}/inputs` | `SkillInputs`. Used by the playbook wizard (deferred). |
| List the caller's editable skills | `GET /api/v1/user-skills?scope=user\|team\|all` | `UserSkill[]`. Drives the P5-1 `/skills` index. |
| Create a user/team skill | `POST /api/v1/user-skills` body `UserSkillCreate` | `{ slug, display_name, description, body, version=1.0.0, tags?, frontmatter_extra?, scope='user'\|'team', owner_team_id?, slash_alias?, forked_from? }`. 201 → `UserSkill`. 409 on slug collision within scope. 422 on bad scope/team combination. |
| Update a user/team skill | `PATCH /api/v1/user-skills/{slug}` body `UserSkillUpdate` | All fields optional; `display_name`, `description`, `body`, `version`, `tags`, `frontmatter_extra`, `slash_alias`. 422 on slash_alias collision. |
| Fork a built-in into user scope | `POST /api/v1/skills/{slug}/fork` body `{ new_name?, scope='user' }` | Copies the built-in's frontmatter + body into a new user-scope row. 201 → `Skill`. 409 if a same-slug user row exists. `scope='team'` is reserved (returns 400). |
| Delete a user/team skill | (verify — likely `DELETE /api/v1/user-skills/{slug}`) | Spike the live endpoint in brainstorm; the picker treats archived skills as removed from the user surface. |

The `UserSkillCreate` / `UserSkillUpdate` schemas are at `src/lib/api/backend.d.ts` lines 8187 and 8226 respectively.

### Brainstorm questions to surface early

- **Body editor depth:** plain `<textarea>` + monospace + character counter (matches P4-3a `ContextSection`) vs a real markdown editor (CodeMirror? MikeOSS-flavored). The product thesis (friendly-not-developer-y) leans toward "good textarea"; the implementation effort heavily favors plain `<textarea>` for P5-1. CodeMirror could land in a polish slice.
- **Frontmatter UX:** structured form fields (display_name, description, tags chip-input, slash_alias) above the body editor — vs raw YAML editor like LQ_AI's. Structured wins on the product thesis.
- **Slug picking:** auto-derive from `display_name` (kebab-case, max 32 chars) with manual override, vs require the user to type slug explicitly. Auto-derive is friendlier; surface the slug in the create modal so the user can adjust if needed.
- **Fork flow:** New `/skills` index has two affordances? (a) `+ New skill` (blank) + (b) a "browse + fork" entry that opens the existing `SkillAttach` popover in "fork mode" pointing at built-in scope. Or fork lands as a button on the skill detail page when viewing a built-in (probably the cleanest).
- **Team-scope skills:** `UserSkillCreate.scope='team'` requires `owner_team_id`. Team scope is in scope for P5-1 only if the brainstorm confirms — teams add a member/admin gate that's its own subsystem. Default: USER SCOPE ONLY for P5-1; team scope deferred.
- **Slash alias UX:** the `slash_alias` field is optional and gated `/[a-z0-9-]{1,32}/`. The Composer's `SkillAttach` will pick up the alias automatically (it already does via `GET /api/v1/skills?scope=all`). Expose the field in the edit form; surface validation inline; 422 on collision.
- **Archive flow:** `UserSkillUpdate` doesn't expose an `archived` field in the schema — verify whether DELETE soft-deletes vs hard-deletes. Same pattern as `archive` on `/knowledge/[id]`?

### Capability backlog after P5-1 (memory `donna-product-direction`)

**Playbooks** (P5-2 or P5-3) — the "skills are reusable prompts; playbooks chain them" arc. Backend has `POST /api/v1/playbooks/easy` per the M3-A6 docstring (the Easy Playbook wizard polls `GET /files/{id}` until `document_id` flips non-null, then passes `document_ids` to the easy endpoint). Likely scope: a `/playbooks` index + a wizard that walks "pick a skill → pick documents → run". Spike the backend in brainstorm — the backend reality may differ from the docstring.

**Chat-level file upload** — UPSTREAM-BLOCKED. Write `docs/upstream-requests/chat-message-file-attach.md` describing the gap (MessageCreate has no `file_ids`; no `POST /chats/{id}/files`); hand to the user to relay to the LQ_AI Claude Code session. When the backend ships, this becomes a natural slice: composer file picker + drop zone + per-message attach.

**Upstream-blocked** (need lq-ai requests first): folder tree for matter files, file versions, project sharing/ACL.

## 7. Key files (the P4-3b artifacts to consult or reuse)

- `src/lib/knowledge/` — the model for `src/lib/skills/<authoring>/` (note: existing `src/lib/skills/` is the attach machinery from P2c-B2; consider `src/lib/skills/authoring/` or expand the folder). The `KbHeader` / `KbRenameModal` / `KbFilesSection` / `CreateKbForm` shapes all transfer.
- `src/routes/(app)/knowledge/[id]/+page.server.ts` — actions pattern with `use:enhance`, redirect-on-archive, untrack-on-state-seeds, debounce-on-slider (HybridAlphaControl).
- `src/lib/matters/files/uploadFile.ts` — `formatBytes` + status badge helpers (reused; not needed in P5-1 unless skills reference files become in-scope).
- `src/lib/matters/sections/ContextSection.svelte` — the Markdown textarea + UTF-8 byte counter pattern (closest analog for a skill body editor).
- `src/lib/skills/SkillAttach.svelte` (P2c-B2) — read-only reference; the picker already lists user skills and will auto-pick up new ones.
- `tests/matter-files.spec.ts` and `tests/kb-management.spec.ts` — the self-cleaning live e2e pattern (try/finally archives via API; `Date.now()` names; exact-match locators).

## 8. Upstream lq-ai fixes (workflow that recurs)

The user runs a separate Claude Code on `LegalQuants/lq-ai`. If a slice needs a backend change/bug fix, **don't edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test), hand to the user to relay, and on the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit. P3 and P4 needed no backend changes. **P5-1 shouldn't need any** (skills CRUD is mature). If you discover a backend gap (e.g., the delete endpoint isn't where you expect), flag it the moment it blocks the design.

## 9. Gotchas

- **`use:enhance` is required on forms whose parent owns client `$state` that must survive the action.** P4-3b Task 10's `KbFilesSection` originally omitted it; without it, the form does a full-page navigation, the parent remounts, and `$state.pendingUploads` resets. For P5-1: the body-editor `$state` in the skill detail page MUST survive Save; ensure the Save form uses `use:enhance`.
- **`$effect` self-referential cycles silently break Svelte 5 reactivity.** Both effects in `KbFileRow`'s pendingUploads filter / append at one point read and wrote to the same `$state` — Svelte 5 detected the cycle and silently didn't re-run the effect. Fix: `untrack(() => state)` when reading inside an effect that also writes to `state`. Live regression in `/knowledge/[id]/+page.svelte`.
- **`CreateKbForm` `{onsubmit}` shadow.** Setting `{onsubmit}` on a `<form>` element binds a native DOM submit handler that fires synchronously and competes with `use:enhance`. Put the onsubmit callback INSIDE the enhance success callback instead (`use:enhance={() => async ({result, update}) => { await update(); if (result.type==='success') onsubmit(); }}`).
- **`use:enhance` shape with parent close-on-success.** Same pattern as `KbRenameModal`: `use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') onclose(); }}`. Reuse this exactly for the P5-1 skill create / edit / delete modals.
- **Exact-string test queries.** `getByLabelText('Name')` not `getByLabelText(/name/i)`. The regex `/name/i` matches `aria-label="Rename knowledge base"` because the substring "name" appears inside "rename". Task 11 of P4-3b proved this; the lesson generalizes.
- **Reviewer remote hygiene** (memory `donna-reviewer-remote-hygiene`). When dispatching review subagents, include an explicit `git rev-parse HEAD origin/<feature-branch>` step — otherwise reviewers default to checking `origin/docs/handoff-*` and report "not yet pushed" even when the feature branch is in sync.
- **Pre-existing P3 test debt (still red on `main`).** `tests/citation-pills.spec.ts` and `tests/citation-live.spec.ts` fail because P3-2 changed `.cite-tab` click semantics; the P2b-era tests still click expecting a `role="dialog"` popover. Out of scope for P5-1.
- **Live-e2e gotcha (P4-3b discovery, may bite again):** after `page.reload()` post-hydration, the first SPA action's `invalidateAll()` doesn't always propagate to `data` (looks like a SvelteKit 2 + Svelte 5 upstream quirk). The `tests/kb-management.spec.ts` works around it with SPA nav. For P5-1: prefer SPA-link navigation over `page.reload()` to verify persistence; if you need a reload, watch for stale `data`.
- Icons `@lucide/svelte` (`<Icon size={n} />`). Route state via `$app/state`'s `page`. `vendor/` excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api`. Vitest jsdom; component tests use `@testing-library/svelte` + `userEvent`/`fireEvent`; `expect: { requireAssertions: true }`; mock `$app/forms` (`enhance`) for form-component unit tests.

## 10. Open follow-ups (not blockers unless touched)

- **Composer file upload** — upstream-blocked; write `docs/upstream-requests/chat-message-file-attach.md` as a separate task if P5-1 is touching the composer surface for any reason.
- **Markdown editor** — if a polished body editor matters for adoption, CodeMirror v6 is the standard; punt to a polish slice if P5-1's `<textarea>` proves rough.
- **Playbooks** — P5-2 candidate; backend `POST /api/v1/playbooks/easy` exists per the M3-A6 docstring. Spike before scoping.
- **Skill body referenced-files / examples** — `Skill` schema includes references and examples beyond the body. P5-1 may treat body-only and defer references to a polish slice.
- **Teams scope** — `UserSkillCreate.scope='team'` exists; the team-admin gate is its own subsystem (D8.1). Default-defer for P5-1.
- **N+1 file-metadata fetches in matter `load`** (carried from P4-3a) — still acceptable.
- Reliability follow-ups from `docs/decisions/lq-ai-pin.md`: distinguish backend-down (503) from logged-out; refresh-cookie TTL; TLS for non-localhost.
- P3 polish backlog: keyboard-driven panel resize (`role="separator"` + arrow keys); full `role="tablist"` + keyboard nav for the doc-panel tab strip.

## 11. Quick orientation for the next session

When the next session starts, point it here. The minimum cold-start:

1. `git checkout main && git pull` → confirm HEAD is `ec5f56e` (the #19 merge) or later.
2. `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
3. Read `MEMORY.md` (auto-loaded) + this handoff (§1–§10).
4. Confirm P5-1 scope at the brainstorm/decompose step — the recommendation here (§6) is **/skills index + /skills/[slug] detail with `<textarea>` body editor + frontmatter fields + Save/Archive + Fork-from-built-in**, **user scope only**, team scope deferred. The next session should confirm with the user before writing the spec.
5. Make sure the docker stack is up before any live e2e: `docker compose up -d --build donna-web` (the rest should still be up; quick `docker compose ps` will confirm).
