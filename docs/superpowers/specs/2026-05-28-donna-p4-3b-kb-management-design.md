# Donna P4-3b — KB creation + KB management (design)

**Date:** 2026-05-28 · **Status:** approved (brainstorm) · **Branch base:** `main` @ `e3026dc` · **Vendor pin:** `vendor/lq-ai` @ `438198c` · **Follows:** P4-3a matter docs / skills / context / KB linking (#17).

## 1. Goal

Make Donna a first-class home for the user's knowledge bases. Today (post-P4-3a) the user can _link_ an existing KB to a matter; KB _creation_ is a "follow-up slice" disclaimer in the picker, and there is no way to put files into a KB from Donna at all. P4-3b removes both gaps: the user can create a KB inline from the matter Knowledge section, navigate to a dedicated KB management surface, upload PDFs to the KB with live ingestion-status feedback, and manage the KB (rename, archive, tune the hybrid-search alpha).

Net delivery is the cohesive KB management surface that turns the P4-3a "Creating a KB lands in a follow-up slice." copy into a real action and removes the "must use the LQ_AI dev frontend to put files in a KB" friction described in memory `donna-product-direction`.

**Out of scope (deferred):**

- Chat-level file upload (composer attach) — separate near-term slice.
- Skills authoring / playbooks — P5.
- Folder tree / file versions / project sharing — upstream-blocked.
- Real-time multi-tab KB sync — M1 ships per-tab state only.
- Retry-ingestion button — backend doesn't expose a retry path.

## 2. Backend contract (verified 2026-05-28 against `src/lib/api/backend.d.ts` at pin `438198c`)

| Surface                   | Endpoint                                                           | Notes                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- | ----------------------------------------------------------------------------------- |
| Create KB                 | `POST /api/v1/knowledge-bases` body `KnowledgeBaseCreate`          | `{ name, description?, project_id?, hybrid_alpha (default 0.5) }`. Passing `project_id` creates **and pre-links** in a single round-trip — no follow-up `linkKb`. 201 + `KnowledgeBase`. 404 if `project_id` provided but the project is missing. |
| List the user's KBs       | `GET /api/v1/knowledge-bases` (optionally `?project_id`)           | Already used by P4-3a. Returns `KnowledgeBase[]`.                                                                                                                                                                                                 |
| Get one KB                | `GET /api/v1/knowledge-bases/{kb_id}`                              | Returns `KnowledgeBase`. 404 cross-user / unknown.                                                                                                                                                                                                |
| Patch a KB                | `PATCH /api/v1/knowledge-bases/{kb_id}` body `KnowledgeBaseUpdate` | Drives `rename` (name+description), `linkKb`/`unlinkKb` (project_id), `setHybridAlpha` (hybrid_alpha), and `archive` (`archived: true`). Same endpoint used by P4-3a's link/unlink.                                                               |
| Soft-delete KB            | `DELETE /api/v1/knowledge-bases/{kb_id}`                           | 204. Used by the Archive action.                                                                                                                                                                                                                  |
| Upload a file             | `POST /api/v1/files` (multipart)                                   | Same endpoint P4-3a uses for matter files. 100 MB cap → 413 with `details.limit_bytes`/`received_bytes`. Returns 201 + `File` with `ingestion_status='pending'`.                                                                                  |
| **Attach a file to a KB** | `POST /api/v1/knowledge-bases/{kb_id}/files` body `{ file_id }`    | **Requires `ingestion_status='ready'`** — 422 otherwise. 204 success. 409 if already attached (idempotent treatment). 404 if KB or file missing.                                                                                                  |
| List KB files             | `GET /api/v1/knowledge-bases/{kb_id}/files`                        | Returns `KBFile[]` (= `File` + `attached_at`, sorted by `attached_at DESC`).                                                                                                                                                                      |
| Detach file from KB       | `DELETE /api/v1/knowledge-bases/{kb_id}/files/{file_id}`           | 204. 404 idempotent treatment.                                                                                                                                                                                                                    |
| Poll file status          | `GET /api/v1/files/{file_id}`                                      | Returns `File` with `ingestion_status` ∈ `pending                                                                                                                                                                                                 | processing | ready | failed`. `ingestion_error`set on failure (e.g.,`unsupported_type`, `parse_failed`). |

**Key consequence:** the KB-files attach is the only surface in Donna that requires a backend state transition (`pending` → `processing` → `ready`) to happen between two client calls. That transition takes 5–30 seconds for an OCR'd PDF; it is the heart of the design.

## 3. Decisions log

| #   | Decision                                | Choice                                                                                     | Why                                                                                                                                                                                                                |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | KB management surface location          | Dedicated route `/knowledge/[id]`                                                          | Mirrors `/matters/[id]`. KBs are first-class surfaces, can be linked from chats/citations later, have room for `hybrid_alpha` + future advanced controls.                                                          |
| Q2  | Ingestion polling                       | Client-side `$effect` poll + auto-attach on `ready`                                        | Form-action server-block holds the HTTP request open 5–30 s/file; client poll gives live Pending → Processing → Ready feedback. Manual-Attach-click was rejected as the worst UX (user expects the drop = upload). |
| Q3  | Top-level `/knowledge` index            | In scope                                                                                   | Without it, an unlinked KB becomes UI-orphaned. Cheap to add — reuses the same KB-row component.                                                                                                                   |
| Q4  | Hybrid α slider on KB detail            | In scope                                                                                   | One PATCH, one slider, debounced; makes the page feel complete and is product-relevant for tuning vector/FTS blend.                                                                                                |
| Q5  | KB rename + archive on KB detail        | In scope                                                                                   | Without it, only the LQ_AI frontend can rename/delete a KB — violates Donna's product thesis (friendly frontend exposing backend power).                                                                           |
| Q6  | KB create from matter Knowledge section | Inline `CreateKbForm` inside `KbPicker`, single round-trip via `project_id` in create body | One round-trip vs create-then-link; user stays on matter detail (no redirect); affordance lives where the picker already is.                                                                                       |
| Q7  | Failed-row recovery                     | Show `ingestion_error` inline; only action is Remove (client-side dismiss)                 | No backend retry-ingest path; a Retry button would be misleading. M1 unsupported types tracked as upstream backlog.                                                                                                |
| Q8  | Polling timeout                         | 5-min hard timeout → "Still processing — refresh to check" + manual Refresh                | Spinner-of-doom is worse than a quiet "check back later."                                                                                                                                                          |
| Q9  | Multi-file upload partial failure       | Bail-on-first failure, report it, stop (matches P4-3a's matter-files behavior)             | Simpler than "continue and report partial success"; consistent with the only existing pattern.                                                                                                                     |
| Q10 | While-here bug fix                      | Fix `FileRow.svelte:26` download URL `/api/v1/files/{id}/content` → `/files/{id}/content`  | Discovered during exploration: the existing URL 404s (no Donna route at `/api/v1/*`; pre-existing P4-3a bug).                                                                                                      |

## 4. Architecture

### 4.1 Route layout

```
src/routes/(app)/
├── knowledge/
│   ├── +page.server.ts          NEW — load: GET /knowledge-bases
│   ├── +page.svelte             NEW — KB index list
│   └── [id]/
│       ├── +page.server.ts      NEW — load + 6 actions
│       └── +page.svelte         NEW — KB detail page
└── matters/
    └── [id]/
        ├── +page.server.ts      MODIFIED — add createKb action
        └── +page.svelte         MODIFIED — KB rows link to /knowledge/[id]
```

**BFF polling endpoint reuse:** the existing `(app)/files/[id]/+server.ts` (P3 / P4-3a) already proxies `GET /api/v1/files/{id}` and returns the JSON. Client polling calls `/files/{id}` directly — no new BFF endpoint needed.

### 4.2 BFF actions

**On `/knowledge/[id]/+page.server.ts` (new — 6 actions):**

| Action           | Method                       | Backend call                                                            | Failure modes                                                                      |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `uploadFile`     | POST multipart               | `POST /api/v1/files` per blob                                           | 413 (size cap); 502; bail-on-first-failure                                         |
| `attachFile`     | POST `{ file_id }`           | `POST /knowledge-bases/{kb_id}/files`                                   | 204; 409 → idempotent success; 422 → `{ retry: true }`; 404; 502                   |
| `detachFile`     | POST `{ file_id }`           | `DELETE /knowledge-bases/{kb_id}/files/{file_id}`                       | 204/404 idempotent; 502                                                            |
| `rename`         | POST `{ name, description }` | `PATCH /knowledge-bases/{kb_id}`                                        | 400 empty name; 404; 502                                                           |
| `archive`        | POST                         | `DELETE /knowledge-bases/{kb_id}` → `throw redirect(303, '/knowledge')` | 502                                                                                |
| `setHybridAlpha` | POST `{ hybrid_alpha }`      | `PATCH /knowledge-bases/{kb_id}`                                        | 422 out-of-range (defensive — slider client-constrains to [0,1] per ADR 0008); 502 |

**On `/matters/[id]/+page.server.ts` (modified — add 1 action):**

| Action     | Method          | Backend call                                                               | Failure modes                        |
| ---------- | --------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| `createKb` | POST `{ name }` | `POST /knowledge-bases { name, project_id: matter_id, hybrid_alpha: 0.5 }` | 400 empty name; 404 matter gone; 502 |

### 4.3 New component library — `src/lib/knowledge/`

Mirrors `src/lib/matters/` shape:

```
src/lib/knowledge/
├── types.ts                       KnowledgeBase + KBFile type aliases
├── KbHeader.svelte                name + counts + Rename + Archive
├── KbRenameModal.svelte           name + description edit (mirrors P4-2 matter rename)
├── KbFilesSection.svelte          drop zone + unified file list (attached + pending)
├── KbFileRow.svelte               file row + polling $effect + auto-attach hidden form
├── HybridAlphaControl.svelte      slider + debounced PATCH
└── CreateKbForm.svelte            inline create form mounted inside KbPicker
```

**Modified:** `src/lib/matters/knowledge/KbPicker.svelte` adds an optional `projectId?: string` prop and a `"+ Create new KB"` entry above the search list that swaps the search input for `CreateKbForm`. `KnowledgeSection.svelte` makes each linked KB name a link to `/knowledge/[id]`.

**Reused unchanged:** `Dropzone.svelte` (drop + native picker), `statusBadge` and `formatBytes` from `src/lib/matters/files/uploadFile.ts`.

### 4.4 Per-component contract

| Component                    | Props                                        | Owns                                                       | Depends on                                                             |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `KbHeader.svelte`            | `kb: KnowledgeBase`                          | `renameOpen: boolean`                                      | `KbRenameModal`; `$app/forms` (archive submit)                         |
| `KbRenameModal.svelte`       | `open, kb, onclose`                          | Backdrop click / Escape close                              | `use:enhance` for `?/rename`                                           |
| `KbFilesSection.svelte`      | `files: KBFile[]`, `error?: string`          | `pendingUploads: PendingUpload[]` state, form ref          | `Dropzone`, `KbFileRow`                                                |
| `KbFileRow.svelte`           | `row: KBFile \| PendingUpload`               | local `status` snapshot, `attaching` guard, polling effect | `statusBadge`, `formatBytes`, `$app/forms`, `document.visibilityState` |
| `HybridAlphaControl.svelte`  | `kb: KnowledgeBase`                          | `value: number`, debounce timer                            | `use:enhance` for `?/setHybridAlpha`                                   |
| `CreateKbForm.svelte`        | `projectId?: string`, `onsubmit: () => void` | `name: string`                                             | `use:enhance` for parent route's `?/createKb`                          |
| `KbPicker.svelte` (extended) | `kbs, onpick, projectId?`                    | `mode: 'list' \| 'create'`, `q: string`, `open`            | `CreateKbForm`                                                         |

Each unit is independently testable: stub `fetch` for polling, mock `$app/forms` for actions, jsdom for component DOM.

## 5. Data flow

### 5.1 Create KB from matter Knowledge section

```
KbPicker (matter detail)
  └─ user clicks "+ Create new KB"
     └─ CreateKbForm swaps in (name input + Create)
        └─ user types name, presses Enter / clicks Create
           └─ form POSTs /matters/[id]?/createKb { name }
              └─ server: POST /knowledge-bases { name, project_id: matter.id, hybrid_alpha: 0.5 }
                 ├─ 201 → load refetches kbs.linked → new row appears
                 ├─ 400 → fail (empty name; pre-call guard)
                 ├─ 404 → fail("Matter no longer exists.")
                 └─ 502 → fail("Could not create the knowledge base.")
```

### 5.2 Upload to KB

```
KbFilesSection
  └─ user drops 1+ files (or clicks Add file)
     └─ form POSTs /knowledge/[id]?/uploadFile (multipart)
        └─ server: per blob → POST /api/v1/files (multipart)
           ├─ 201 → push { file_id, filename, size_bytes, status: 'pending' } to return array
           ├─ 413 → fail(413, { error: '"<name>" is too large — max 100 MB.' }) ← bail
           └─ 502 → fail(502, { error: 'Could not upload "<name>".' }) ← bail
        └─ action returns { uploaded: PendingUpload[] }
     └─ KbFilesSection appends each PendingUpload to client $state.pendingUploads
        └─ KbFileRow renders per pending row; polling $effect kicks in
```

### 5.3 Poll loop (per non-ready row)

```
KbFileRow ($effect runs while status ∈ pending|processing AND visibilityState !== 'hidden')
  └─ every 2000 ms:
     └─ fetch('/files/{id}')
        ├─ 200 → update local status snapshot
        │  ├─ 'processing' → continue
        │  ├─ 'ready' → STOP, fire hidden ?/attachFile { file_id } form once (attaching=true guard)
        │  └─ 'failed' → STOP, render ingestion_error inline + Remove (client dismiss)
        ├─ 404 → drop row from $state.pendingUploads (deleted out from under us)
        └─ 502 → continue (transient; 5-min timeout escalates persistent failure)
  └─ TIMEOUT at 5 min non-ready → STOP, render "Still processing — refresh to check" + manual Refresh
  └─ cleanup on unmount
```

### 5.4 Auto-attach (called by client poll on `ready`)

```
?/attachFile { file_id }
  └─ server: POST /knowledge-bases/{kb_id}/files { file_id }
     ├─ 204 → invalidateAll() → load refetches files → pending row drops, attached KBFile appears
     ├─ 409 → treat as success (race protection; matches P4-3a uploadFile pattern)
     ├─ 422 → fail(422, { retry: true }) → KbFileRow clears `attaching`, resumes polling
     ├─ 404 → fail(404, { error: 'KB or file no longer exists.' }) → row renders error, stops polling
     └─ 502 → fail(502, { error: 'Could not attach "<name>".' })
```

### 5.5 Detach attached file

```
KbFileRow (attached) → user clicks Remove
  └─ form POSTs ?/detachFile { file_id }
     └─ server: DELETE /knowledge-bases/{kb_id}/files/{file_id}
        ├─ 204 / 404 → success (idempotent)
        └─ 502 → fail("Could not remove the file.")
     └─ invalidateAll() → row gone from list
```

Pending-row dismissal is purely client-side (`$state.pendingUploads` filter); orphan `File` stays in user's account (matches existing matter-files behavior).

### 5.6 Rename / Archive / Hybrid alpha

- `?/rename` → `PATCH /knowledge-bases/{id} { name, description }`
- `?/archive` → `DELETE /knowledge-bases/{id}` → `throw redirect(303, '/knowledge')`
- `?/setHybridAlpha` → `PATCH /knowledge-bases/{id} { hybrid_alpha }` — debounced 400 ms in the control; latest-value-wins (no optimistic-locking; simple)

### 5.7 Load functions

- `/knowledge/+page.server.ts`: `GET /knowledge-bases` → `KnowledgeBase[]` (502 → `throw error(502)`)
- `/knowledge/[id]/+page.server.ts`: `Promise.all([GET /knowledge-bases/{id}, GET /knowledge-bases/{id}/files])` → `{ kb, files }` (KB 404 → `throw error(404)`; files 502 with KB ok → empty `files` array, mirror matter-files load tolerance)

## 6. Error handling (non-obvious cases)

Failure-mode coverage beyond the per-endpoint tables above:

- **Inline-vs-toast UI:** action-return `error` strings render inline at the bottom of the relevant section (`KbFilesSection` shows upload errors, `KbHeader` shows rename/archive errors, `HybridAlphaControl` shows save errors). No toasts. Matches the P4-2 / P4-3a matter detail pattern.
- **`status='failed'`:** `KbFileRow` shows `ingestion_error` text (e.g., "Failed: unsupported_type", "Failed: parse_failed"). Remove is client-side dismiss only — no backend retry path.
- **5-min polling timeout:** renders "Still processing — refresh to check" + manual Refresh (calls `invalidateAll()`). Threshold lives in a constant for test override.
- **Polling 502 / transient hiccup:** console log, keep polling on next tick. Only the 5-min timeout escalates UI.
- **Polling 404 / attach 404:** drop the row quietly (file deleted in another tab / admin sweep).
- **Tab visibility:** polling pauses when `document.visibilityState === 'hidden'`, resumes on `visibilitychange`.
- **Multi-tab concurrency:** no real-time sync. Tab B sees tab A's uploads on next `invalidateAll()` (next own action or focus). Acceptable for M1.
- **Double-attach guard:** `KbFileRow.attaching` boolean blocks subsequent `ready` re-fires; backend's 409 idempotency completes the safety net.
- **`?/attachFile` 422 race:** file briefly re-entered non-ready (backend reprocesses) — extremely rare. Action returns `fail(422, { retry: true })`; client clears `attaching`, polling resumes; 5-min timeout still applies.
- **Multi-file upload partial failure:** bail-on-first failure, report it; files after the failure are not attempted. Matches P4-3a.
- **Archive race (tab B still on the KB):** next tab-B load returns 404 → SvelteKit 404 page renders. No special handling.
- **SSR-safe polling:** Svelte 5 `$effect` doesn't fire during SSR — no server timer leaks.
- **Cookie expiry mid-poll:** BFF returns 303 → opaque-redirected client response → row state unchanged, silently. Tracked as P3 reliability follow-up; not in P4-3b scope.

## 7. Testing

### 7.1 Unit tests (vitest)

**Server actions** (mock `lqFetch`; multipart specs get `// @vitest-environment node` per handoff §8):

- `(app)/knowledge/[id]/page.server.test.ts`
  - `uploadFile`: happy multipart; 413 with limit override; 502; bail-on-first
  - `attachFile`: 204; 409 idempotent success; 422 → `fail` carries `retry: true`; 404; 502
  - `detachFile`: 204 / 404 idempotent; 502
  - `rename`: happy; 400 empty name; 404; 502
  - `archive`: assert `.rejects.toMatchObject({ status: 303, location: '/knowledge' })`; 502
  - `setHybridAlpha`: happy; 422 out-of-range; 502
- `(app)/knowledge/page.server.test.ts` — load returns `kbs[]`; 502 → `error(502)`
- `(app)/knowledge/[id]/page.server.test.ts` (load) — parallel fetch returns `{ kb, files }`; KB 404 → `error(404)`; files 502 with KB ok → empty `files` array
- `(app)/matters/[id]/page.server.test.ts` — `createKb`: happy with `project_id` in body; 400 empty name; 404 matter gone; 502

**Components** (`@testing-library/svelte`; mock `$app/forms`):

- `KbFileRow.test.ts` — status badge from prop; polling: stub `fetch` with sequential responses (`pending` → `processing` → `ready`); `vi.useFakeTimers()` to advance 2 s ticks; assert exactly one `?/attachFile` submit on `ready` (double-attach guard); on `failed` → renders `ingestion_error`, no submit; on 5-min stuck → renders Refresh
- `KbFilesSection.test.ts` — drop emits `?/uploadFile`; action result appends to `pendingUploads`; row appears; error prop renders inline; **regression: nested `Dropzone`'s `<input>` has no `name` attribute** (re-pin P4-3a's `ebb7752` invariant)
- `HybridAlphaControl.test.ts` — slider input debounces to a single PATCH (fake timers); initial value reflects prop; rapid input → one settled save
- `CreateKbForm.test.ts` — empty name disables submit; submit fires form with `name`; `onsubmit` callback runs
- `KbRenameModal.test.ts` — Escape closes; backdrop click closes; submit posts `?/rename`
- `KbHeader.test.ts` — Rename button opens modal; Archive button posts `?/archive`
- `KbPicker.test.ts` — extend: "+ Create new KB" entry visible; click swaps to `CreateKbForm`; `projectId` wires into the form. Existing pick/filter tests stay green.
- `KnowledgeSection.test.ts` — extend: KB name renders as a link to `/knowledge/[id]`. Existing link/unlink tests stay green.
- `FileRow.test.ts` — update download-URL expectation `/api/v1/files/...` → `/files/...` (while-here fix)

**Quality bar:** `npm run check` = 0 errors / 0 warnings on touched files; `npx eslint <touched>` clean; full unit suite green.

### 7.2 Live e2e (Playwright) — `tests/kb-management.spec.ts`

Single self-cleaning spec, mirroring `tests/matter-files.spec.ts`:

1. Seed: create matter via API (`Date.now()`-suffixed name).
2. Open `/matters/{id}` → KbPicker → "+ Create new KB" → type name → submit → KB row appears in Knowledge section.
3. Click "Manage" → land on `/knowledge/{kb_id}`.
4. Drop `/tmp/spike.pdf` → expect `Pending` → wait for `Processing` (≤60 s) → wait for `Ready` (≤120 s). Explicit `toBeVisible({ timeout })` waits, not flake-retries.
5. Rename: open modal → change name → Save → header reflects new name.
6. Hybrid α: drag slider → wait for save-settle → reload → value persisted.
7. Detach the attached file → row disappears.
8. Archive KB → redirected to `/knowledge` → KB no longer listed.
9. **`try/finally`**: cleanup. Archive the matter via API. Archive the KB via API as a safety net for test-failure cases. Use Playwright's `request` fixture with the admin cookie.

**Flake guards** (handoff §8):

- `getByRole('button', { name: 'Save', exact: true })` everywhere — KB detail has Save (rename) + α slider save indicator.
- `Date.now()`-suffixed names for matter and KB; exact-name locators.
- After enhance POSTs, wait on a state-derived assertion (e.g., disabled-Save) before any `page.reload()`.

**Known-red P3 tests stay red** (handoff §8): `tests/citation-pills.spec.ts`, `tests/citation-live.spec.ts`. Not in P4-3b scope.

**Pre-flight:** `docker compose up -d --build donna-web` before the e2e (container serves built code).

## 8. TDD order (bites for writing-plans)

Slice for `gsd-planner` / `writing-plans`:

1. `src/lib/knowledge/types.ts` — type aliases. Unblocks everything.
2. `/knowledge/[id]/+page.server.ts` actions — TDD each in this order: `uploadFile` → `attachFile` → `detachFile` → `rename` → `archive` → `setHybridAlpha`.
3. `/knowledge/[id]/+page.server.ts` load function — TDD.
4. `KbFileRow.svelte` — hardest piece. TDD polling, status badge, double-attach guard, 5-min timeout, visibility-pause.
5. `KbFilesSection.svelte` — wires upload form to `KbFileRow` + `pendingUploads` state.
6. `KbHeader.svelte` + `KbRenameModal.svelte`.
7. `HybridAlphaControl.svelte` — debounce + slider.
8. `/knowledge/[id]/+page.svelte` — assembles 4–7.
9. `/knowledge/+page.server.ts` + `+page.svelte` — index list.
10. `CreateKbForm.svelte`; update `KbPicker.svelte` to mount it.
11. `/matters/[id]/+page.server.ts` — `createKb` action. `KnowledgeSection.svelte` — Manage link.
12. While-here: fix `FileRow.svelte:26` download URL + test.
13. Live e2e `tests/kb-management.spec.ts`.

Per slice: per-task commit + push (workflow memory `donna-workflow`); two-stage review (spec-compliance then code-quality) for non-trivial bites; final whole-branch review.

## 9. Open follow-ups (not blockers)

- Real-time multi-tab KB sync — defer to a polish slice if it becomes painful.
- Authz / cookie-expiry mid-poll — currently silent; tracked under P3 reliability follow-ups.
- N+1 file-metadata fetches in matter `load` (carried from P4-3a) — still acceptable.
- Hybrid α tooltip / fine-grained ticks — current slider is 0/0.5/1 ticks; add finer presets later if users ask.
- Rename modal field width / autofocus polish — defer.
- "Folder tree for matter files" / "file versions" / "project sharing/ACL" — upstream-blocked (memory `donna-product-direction`).

## 10. Cross-references

- Handoff doc: `docs/superpowers/HANDOFF-P4-3b.md` (§5 scope, §8 gotchas).
- Predecessor spec: `docs/superpowers/specs/2026-05-28-donna-p4-3a-matter-docs-design.md` (Sections 4 + 5 establish the section subcomponent + per-section form-action pattern).
- Backend pin docs: `docs/decisions/lq-ai-pin.md` (no bump expected for P4-3b).
- Memory (auto-loaded): `donna-workflow`, `donna-dev-stack`, `donna-citation-contract`, `donna-phase-status`, `donna-product-direction`.
