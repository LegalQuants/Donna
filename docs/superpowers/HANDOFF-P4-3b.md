# Donna — Handoff for the next session (continue P4: P4-3b KB upload + KB creation)

**Date:** 2026-05-28 · **Branch state:** `main` has everything through **P4-3a** — P0/P1 (#1), P2a (#2), P2b (#3), P2c-A (#4), P2c-B (#5–#8), P3-1 (#9), P3-2 (#10), P3-3 (#12), **P4-1 matters core (#13)**, **P4-2 privilege/tier (#15)**, **P3-polish auto-scroll-on-open (#16)**, **P4-3a matter docs/skills/context/KB-linking (#17)**. `vendor/lq-ai` pinned at **`438198c`** (unchanged since P2c-B2). You are on `main`; start the next slice off `main`.

> **First thing:** `git checkout main && git pull` (confirm HEAD is the #17 merge `ab65d7d` or later). Pin check: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`. The dev stack is up and `.env` is populated (see §4). Read project memory first (`MEMORY.md` index — esp. `donna-phase-status`, `donna-product-direction`, `donna-workflow`, `donna-dev-stack`, `donna-citation-contract`).

## 1. What Donna is

Standalone MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. Browser talks only to Donna's SvelteKit server (a **BFF**) which holds the lq-ai JWT in httpOnly cookies and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule), brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays. **Product thesis (important — see memory `donna-product-direction`):** Donna exposes the lq-ai backend's power through a **friendly, minimal-chrome, plain-language UX** — the _opposite_ of the LQ_AI developer frontend's menu-dense, capability-showcase style. When porting an LQ_AI capability, re-imagine it the Donna way.

## 2. Phase status

| Phase                                                      | Status                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P0–P2c-B                                                   | ✅ merged (#1–#8)                                                              |
| P3 — Document panel + highlighting                         | ✅ P3-1 (#9), P3-2 (#10), P3-3 (#12), polish-auto-scroll (#16)                 |
| **P4 — Projects / Matters**                                | **P4-1 ✅ (#13)** · **P4-2 ✅ (#15)** · **P4-3a ✅ (#17)** · **P4-3b ⬅️ NEXT** |
| P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline | pending                                                                        |

**P4-3a shipped (#17, 2026-05-28):** Four new sections on the matter detail page — **Files** (upload + attach + list + remove via SvelteKit form action with multipart drop zone), **Knowledge** (link/unlink existing KBs via searchable `KbPicker`), **Skills** (reuses composer's `SkillAttach.svelte` driven by a new matter-scoped `createMatterSkillAttach` controller), **Context** (Markdown textarea + UTF-8 byte counter + 422 fallback). All wired via 7 new form actions on `[id]/+page.server.ts` (10 total now: rename / archive / newChat / uploadFile / detachFile / linkKb / unlinkKb / attachSkill / detachSkill / saveContext). Code lives in `src/lib/matters/sections/`, `src/lib/matters/files/`, `src/lib/matters/knowledge/`, `src/lib/matters/skills/`. **Two real production bugs were caught by the live e2e and fixed:** `lqClient.raw()` was unconditionally setting `content-type: application/json` (clobbering FormData's multipart boundary → 422); `Dropzone.svelte` nested inside a parent form duplicated the `file` field (both inputs were named `name="file"` → every upload happened twice). Both have regression tests. 353 unit + 4 matter live e2es green.

## 3. How to build a slice (the established loop — follow it)

Per slice, one PR into `main`: **brainstorming** (use the visual companion for UI layout questions; spike the live backend contract early; decompose if the phase is multi-subsystem) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks, complete code in every step) → **subagent-driven-development** (fresh implementer per task + **two-stage review: spec-compliance then code-quality**; the controller verifies each reviewer finding before acting; commit per task; final whole-branch review) → **live e2e** against the running stack → **finishing-a-development-branch** (open PR). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; the signal is exit 0 + the "0 errors and 0 warnings" line). Keep **eslint clean on touched files** (`npx eslint <files>`); single-targeted ignores only where a rule genuinely fires. Verify against the **real backend**, not just unit tests; **rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`) — the container serves a built image, not live `src/`.

**Patterns proven through P4-3a (reuse them):** thin BFF proxy per backend endpoint **OR** SvelteKit **form actions** for mutations on page routes (P4-1 established this; P4-3a extended it with multipart upload via form action — see §8 gotcha on FormData + lqClient); SSR `load` for page data with parallel `Promise.all` fan-out for per-id metadata (the matter detail load fetches matter + chats + N file metadata fetches + 2 KB list fetches in two waves); presentational components with plain props in a per-feature `src/lib/<feature>/` folder (P4-3a established `src/lib/matters/sections/` + per-feature subfolders `files/`, `knowledge/`, `skills/`); searchable popovers mirror `ModelPicker` / `MatterPicker` / `SkillAttach` (root div + `open` state + outside-click `$effect` + Escape); modals mirror `ReceiptsDrawer` (`role="dialog"` + `aria-modal` + `aria-label` on the panel, backdrop `role="presentation"` click-to-close, a capture-phase Escape `$effect`); **picker-driven form submission** uses a hidden form + `$state`-backed pending value + `queueMicrotask(form.requestSubmit())` (used in `KnowledgeSection` and `SkillsSection` for linkKb/attachSkill).

## 4. Running / verifying the stack

Compose project `donna` on shifted ports (app **http://localhost:13002**, lq-ai api `127.0.0.1:18000`, gateway `18001`). `.env` is gitignored but present and populated (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` for embeddings→RAG/citations, `DONNA_BASE_URL=http://localhost:13002`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`).

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web   # after editing src/ (REQUIRED before live e2e)
npm run check && npx vitest run && npx playwright test
```

**Stack notes (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach (citation/scoping e2e seed a project+KB+PDF and are timing-sensitive — pass on retry once embeddings settle). Gateway anonymization is ENABLED. `/tmp/spike.pdf` is the seed fixture (the matters e2e regenerates it via the `api` container). **Live-e2e gotcha:** seeds accumulate in the shared admin account across runs — use unique `Date.now()` names, **exact-name** Playwright locators, and DELETE seeded projects/KBs at end-of-test via `try/finally` (the P4-3a `tests/matter-files.spec.ts` is the pattern reference; both matter + KB are cleaned up). When a button name substring-collides with another visible button (e.g., the rename modal's "Save" vs. ContextSection's "Save context"), use `{ name: 'Save', exact: true }` — `tests/matters.spec.ts:46` is the live example.

## 5. Next slice — P4-3b (KB creation + KB upload with ingestion polling)

P4-3a deliberately deferred KB **creation** AND KB **upload** to this slice — they travel together because:

- Creation alone is half-baked (you make an empty KB; can't put files in it).
- Upload alone needs a KB to upload into, which means the user needs to either bring one from LQ_AI's dev frontend (poor UX) or this slice has to create it.

So P4-3b is the cohesive KB management surface that makes the P4-3a Knowledge section's "Creating a KB lands in a follow-up slice." disclaimer go away.

### Backend reality (verified 2026-05-27 against `src/lib/api/backend.d.ts` at pin `438198c`)

| Surface                   | Endpoint                                                        | Notes                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- | ----------------------------------------------------------------------------------- |
| Create KB                 | `POST /api/v1/knowledge-bases` (`KnowledgeBaseCreate`)          | Body: `{ name, description?, project_id?, hybrid_alpha (default 0.5) }`. Returns 201 + `KnowledgeBase`. 404 if `project_id` provided but missing.                               |
| Upload a file             | `POST /api/v1/files` (multipart)                                | Same endpoint P4-3a uses for matter files. 100 MB cap → 413 with `details.limit_bytes`/`received_bytes`. Returns 201 + `File` with `ingestion_status='pending'`.                |
| **Attach a file to a KB** | `POST /api/v1/knowledge-bases/{kb_id}/files` body `{ file_id }` | **Requires `ingestion_status='ready'`** — distinct from the matter-files attach which has no such requirement. This is the big difference and the source of polling complexity. |
| Poll file status          | `GET /api/v1/files/{file_id}`                                   | Returns `File` with `ingestion_status` ∈ `pending                                                                                                                               | processing | ready | failed`. `ingestion_error`set on failure (e.g.,`unsupported_type`, `parse_failed`). |
| List KB files             | `GET /api/v1/knowledge-bases/{kb_id}/files`                     | Returns `KBFile[]` (= `File` + `attached_at`).                                                                                                                                  |
| Detach file from KB       | `DELETE /api/v1/knowledge-bases/{kb_id}/files/{file_id}`        | Removes the join row only.                                                                                                                                                      |
| Patch KB                  | `PATCH /api/v1/knowledge-bases/{kb_id}` (`KnowledgeBaseUpdate`) | Already used by P4-3a's linkKb/unlinkKb. Same endpoint supports name/description/hybrid_alpha/archived edits.                                                                   |
| Soft-delete KB            | `DELETE /api/v1/knowledge-bases/{kb_id}`                        | Returns 204.                                                                                                                                                                    |

### Scope for P4-3b (suggested decomposition — confirm in brainstorm)

The cleanest split is probably one PR with all of it, but if it grows large, two sub-slices is reasonable:

1. **KB creation (small)** — Add "Create new KB" to the `KbPicker` empty state (and as a secondary action when there are available KBs to link). Simple modal-style form (name + optional description); calls `POST /knowledge-bases` then auto-links to the matter via the existing `linkKb` action OR by passing `project_id` directly in the create body. Removes the deferred-create copy from the picker.

2. **KB upload (large)** — A dedicated UX inside each linked-KB row. Could be:
   - Click-to-expand-into-KB-details mode on the matter detail page, OR
   - A dedicated `/knowledge/{kb_id}` route (probably cleaner; mirrors `/matters/{id}` shape).
     The latter feels right since KB management is genuinely a separate surface (a KB can outlive a matter; the KB has its own file list, hybrid alpha tuning, etc.).
   - Upload UX itself: same drop zone + Add file pattern as `FilesSection` (reuse `Dropzone.svelte` and the form-action multipart upload), but the **attach-to-KB step requires `ingestion_status='ready'`**, so the action either: (a) blocks until ingestion completes (poll loop in the action, simple but slow on UX), or (b) returns immediately after upload and lets the client poll separately via a refresh button or auto-poll `$effect`.
   - Per-row ingestion status badge (reuse `statusBadge` from `src/lib/matters/files/uploadFile.ts`).
   - Failure surfacing: `ingestion_error` should be visible on `Failed` rows.

### Brainstorm questions to surface early

- **KB management surface location:** `/knowledge/{kb_id}` route (dedicated, mirrors `/matters/{id}`) vs. inline expand-in-matter-detail vs. modal-style overlay. The dedicated route is most consistent with Donna's other patterns but introduces a new top-level surface.
- **Ingestion polling strategy:** server-side poll-and-block in the form action (simple, slow; matches form-action style but is a long-running request) vs. client-side `$effect`-driven poll after upload (more code, better UX; user sees the "Pending → Processing → Ready" transitions live).
- **Non-PDF handling:** ingestion fails with `unsupported_type` for non-PDF MIMEs (M1 backend limitation per the contract docstring). Surface the failure clearly. The P3-3 `UnsupportedFileCard` is for the doc panel, not KB rows — KB rows just need a "Failed: unsupported_type" badge.
- **KB list location:** P4-3a has Knowledge section on the matter detail; a top-level `/knowledge` index of all the user's KBs (linked or not) might be valuable but is separate scope — confirm whether in scope.
- **Hybrid alpha tuning:** the `hybrid_alpha` slider (per-KB default for vector-vs-FTS score blend) is on the KB schema. Worth a small UI control in the KB detail page, or defer to a future "advanced settings" slice?

### Capability backlog after P4-3b (memory `donna-product-direction`)

Chat-level **file upload** in the composer (skill-attach already exists from P2c-B2). **Skills authoring** + **playbooks** (create incl. "generate from prior agreements", apply in workflow/chat) → **P5 Workflows**. **Upstream-blocked** (need an lq-ai request first): folder tree for matter files, file versions, project sharing/ACL.

## 6. Key files (the P4-3a artifacts to consult or reuse)

- `src/lib/matters/files/uploadFile.ts` — `formatBytes` + `statusBadge` (label/tone pair from `ingestion_status`). **Reuse these in KB-row rendering.**
- `src/lib/matters/files/Dropzone.svelte` — drop target + native picker; emits `onfiles(File[])`. No `name` on its internal input (the bug-fix `ebb7752` is critical context). **Reuse for KB upload.**
- `src/lib/matters/files/FileRow.svelte` — filename + size + status badge + download link + Remove form. **Adapt for `KBFileRow.svelte` (KB rows need `attached_at` + per-row Detach to `?/detachKbFile`).**
- `src/lib/matters/knowledge/KbPicker.svelte` — searchable popover with the deferred-create copy. **Add a "Create new KB" affordance here in P4-3b.**
- `src/lib/matters/sections/FilesSection.svelte` — the canonical "form + hidden input + drop zone empty state + populated list + Add-file button + DataTransfer→FileList assign + form.requestSubmit()" pattern. **Same shape for KB-upload section.**
- `src/lib/matters/sections/KnowledgeSection.svelte` — the link/unlink section. **P4-3b will rework the empty-state copy to mention the new Create flow.**
- `src/routes/(app)/matters/[id]/+page.server.ts` — all 10 form actions are here. **Add new KB-create / KB-upload-to-this-KB / KB-detach-file actions OR put them on a new `/knowledge/[id]/+page.server.ts` if you go with the dedicated route.**
- `src/lib/server/lqClient.ts` — the `instanceof FormData` guard in `raw()` is what makes multipart work. **Don't undo it.**
- `tests/matter-files.spec.ts` — the self-cleaning live e2e pattern (try/finally archives both the seeded matter AND the seeded KB via the API). **Mirror this for the KB-upload e2e.**

## 7. Upstream lq-ai fixes (workflow that recurs)

The user runs a separate Claude Code on `LegalQuants/lq-ai`. If a slice needs a backend change/bug fix, **don't edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test), hand to the user to relay, and on the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit. P3 and P4 have needed no backend changes so far. P4-3b might (e.g., bulk-upload, ingestion-status webhooks, or non-PDF support) — flag the moment a backend gap blocks the design.

## 8. Gotchas

- **`lqClient` content-type override on FormData (now fixed; don't undo).** `lqClient.raw()` defaults `content-type: application/json` for non-empty bodies — but only when the body is NOT `instanceof FormData`. Removing the guard re-introduces the bug where backend gets `application/json` on multipart and rejects with 422 `Field required: body.file`. Two regression tests in `src/lib/server/lqClient.test.ts` pin the behavior in both directions.
- **Dropzone's internal input has NO `name` attribute (now fixed; don't add one).** Dropzone is a UI handle for opening the native file picker; its `<input>` is not a form field. When Dropzone is nested inside a parent `<form>` (as in `FilesSection`), giving its input `name="file"` duplicates the file entry in the multipart submission (Dropzone's onchange clears the value, but only AFTER the parent's synchronous `form.requestSubmit()` reads it). The parent owns the canonical `<input name="file">`.
- **`File` global vs schema-`File` type alias.** In `[id]/+page.server.ts` the schema type is aliased as `ProjectFile` (not `File`) so the multipart upload action can use the global `File` constructor (`v instanceof File`). Same convention in `FilesSection.svelte`. Don't shadow `File`.
- **Picker-driven form submission needs `queueMicrotask`.** When a picker (`KbPicker`, `SkillAttach`) selects an option, the consumer sets a `$state`-backed pending value and then calls `queueMicrotask(() => form.requestSubmit())`. The microtask gives Svelte's reactivity time to flush the value into the DOM before `requestSubmit()` reads it. Pattern lives in `KnowledgeSection.svelte` (linkKb) and `SkillsSection.svelte` (attachSkill).
- **Button-name substring collisions in Playwright.** `getByRole('button', { name: 'Save' })` will match "Save" AND "Save context" — use `{ name: 'Save', exact: true }`. `tests/matters.spec.ts:46` is the live fix.
- **`use:enhance` POST is async; tests racing with `page.reload()` will see stale state.** The cleanest deterministic signal that an enhance POST has landed and invalidated is observing a UI state that depends on the post-invalidate prop — e.g., `await expect(saveButton).toBeDisabled()` after Save (because `dirty` becomes false once `initial` reflects the saved value). See `tests/matter-files.spec.ts` context-save flow.
- **Form-action server tests (P4-3a pattern):** mock `lqFetch`, build a `Request` with a `URLSearchParams` body for simple actions OR a `FormData` body for multipart (`fileEvent` helper in `page.server.test.ts`). For multipart tests, **add `// @vitest-environment node` to the top of the test file** — jsdom's `File` is not the same constructor as Node's global, so `v instanceof File` returns false after the multipart roundtrips through undici. `redirect()` throws `{status, location}` (assert with `.rejects.toMatchObject`); `fail()` returns `{status, data}`.
- **Pre-existing P3 test debt (still red on `main`).** `tests/citation-pills.spec.ts` and `tests/citation-live.spec.ts` fail because P3-2 changed `.cite-tab` click semantics from "open popover" to "open doc panel" (popover became hover-only), but those P2b-era tests still click expecting a `role="dialog"` popover. Verified directly on `origin/main` during P4-2 verification. Out of scope for P4-3b; a P3-polish slice can revisit them alongside the deferred `role="tablist"` keyboard nav.
- Icons `@lucide/svelte` (`<Icon size={n} />`). Route state via `$app/state`'s `page`. `vendor/` excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api`. Vitest jsdom; component tests use `@testing-library/svelte` + `userEvent`/`fireEvent`; `expect: { requireAssertions: true }`; mock `$app/forms` (`enhance`) for form-component unit tests.

## 9. Open follow-ups (not blockers unless touched)

- **Doc-panel auto-scroll** shipped via #16; if Knowledge KB upload eventually allows opening a KB file in the doc panel, that path will benefit automatically.
- **N+1 file-metadata fetches in matter `load`** is acceptable today (small N per matter). Track if it becomes painful.
- **No ingestion polling on matter files** — P4-3a's spec deferred it; users refresh to see new statuses. P4-3b will need polling for the KB-upload UX though, so the pattern will land there and matter-files could adopt it later.
- **KB-row `attached_at` display** isn't wired in P4-3a (KbPicker only shows `file_count`); P4-3b should surface it in the KB detail view.
- Reliability follow-ups from `docs/decisions/lq-ai-pin.md`: distinguish backend-down (503) from logged-out; refresh-cookie TTL; TLS for non-localhost. Pre-existing `res.json()`-on-malformed-ok unguarded across all loaders (infra-failure edge).
- P3 polish backlog: keyboard-driven panel resize (`role="separator"` + arrow keys); full `role="tablist"` + keyboard nav for the doc-panel tab strip (deferred with aria-current).

## 10. Quick orientation for the next session

When the next session starts, point it here. The minimum cold-start:

1. `git checkout main && git pull` → confirm HEAD is `ab65d7d` or later.
2. `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
3. Read `MEMORY.md` (auto-loaded) + this handoff (§1–§9).
4. Decide P4-3b scope at the brainstorm/decompose step: single PR (create + upload + KB detail view together) vs. split into P4-3b-i (create) + P4-3b-ii (upload). The handoff recommendation (§5) leans toward a single PR with a dedicated `/knowledge/[id]` route, but confirm with the user.
5. Make sure the docker stack is up before any live e2e: `docker compose up -d --build donna-web` (the rest should still be up; quick `docker compose ps` will confirm).
