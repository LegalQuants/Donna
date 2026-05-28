# Donna P4-3a — Matter docs / skills / context / KB linking (design)

**Date:** 2026-05-28 · **Status:** approved (brainstorm) · **Branch base:** `main` @ `fe6ae6c` · **Vendor pin:** `vendor/lq-ai` @ `438198c` · **Follows:** P4-2 privilege/tier (#15) and P3-polish auto-scroll-on-open (#16).

## 1. Goal

Expand the matter detail page (`/matters/{id}`) with **four new sections** that let a user manage everything the lq-ai backend already supports at the matter (project) level: **Files** (attach existing/uploaded files), **Knowledge** (link existing KBs to the matter), **Skills** (attach skills to the matter), and **Context** (edit the matter's free-form Markdown context). Net delivery is the document-attach UX the user emphasized in the product direction, plus three small attach/edit surfaces that fit on the same page.

**Out of scope (deferred to P4-3b):** uploading documents *into* a KB with ingestion-status polling, and KB *creation* — both ride together in the next slice so the KB section can grow without churn here.

**Out of scope (further future):** chat-level file upload (composer attach), skills authoring (P5), playbooks (P5), folder tree / file versions / project sharing (upstream-blocked).

## 2. Backend contract (verified 2026-05-28 against `src/lib/api/backend.d.ts` at pin `438198c`)

| Surface | Endpoint | Notes |
|---|---|---|
| Upload a file | `POST /api/v1/files` (multipart, streaming) | 100 MB cap → 413 with `details.limit_bytes`/`received_bytes`. Returns 201 + `File` with `ingestion_status='pending'`. `project_id` in the multipart body is accepted but currently ignored — attach is a separate explicit call. |
| Attach a file to a matter | `POST /api/v1/projects/{project_id}/files` body `{ file_id }` | 204 success. 404 if project or file missing. 409 if already attached. No ingestion-ready requirement. |
| Detach a file from a matter | `DELETE /api/v1/projects/{project_id}/files/{file_id}` | 204 success. 404 if not attached / project missing. File row itself is not deleted. |
| Get file metadata | `GET /api/v1/files/{file_id}` | Returns `File` (filename, size_bytes, mime_type, ingestion_status, etc.). |
| Download file | `GET /api/v1/files/{file_id}/content` | Returns the raw bytes (P3-3 set `content-disposition: attachment`). |
| List the user's KBs | `GET /api/v1/knowledge-bases` | Optionally `?project_id=<id>` to filter to a matter's KBs. |
| Patch a KB | `PATCH /api/v1/knowledge-bases/{kb_id}` `{ project_id }` | KB↔matter link lives on the KB (`KnowledgeBase.project_id`), not on the project. Set to `null` to unlink. |
| Attach a skill | `POST /api/v1/projects/{project_id}/skills` body `{ skill_name }` | Working assumption; exact body shape re-checked at plan time. |
| Detach a skill | `DELETE /api/v1/projects/{project_id}/skills/{skill_name}` | Working assumption. |
| Edit context_md | `PATCH /api/v1/projects/{id}` `{ context_md }` | Already used by the P4-2 `rename` action. ≤100 KiB UTF-8 bytes → 422 over cap. `null` clears. |

**Handoff drift correction (2026-05-27):** the original P4 handoff mentioned `POST /projects/{id}/knowledge-bases` for KB linking; that endpoint **does not exist**. KB↔matter linkage is a property of the KB row itself, set via `PATCH /knowledge-bases/{kb_id}`. This spec uses the correct mechanism.

## 3. Decisions log

| # | Decision | Choice | Why |
|---|---|---|---|
| Q1 | Decomposition | P4-3a = Files + Knowledge linking + Skills + Context · P4-3b = KB upload (incl. KB create) | First slice ships the matter-level UX surfaces in one PR; KB upload is the large net-new flow and stands alone. |
| Q2 | File upload affordance | Drop zone replaces the section when empty; populated state shows file list + small "Add file" button | Most document-forward affordance for an empty matter; minimal chrome once populated. |
| Q3 | Skills attach UI | Reuse composer `SkillAttach.svelte`'s popover idiom; new matter-scoped controller | Consistent with chat-level skill UX; lowest effort. |
| Q4 | Context editor depth | Plain textarea + byte counter + 422 fallback | Field is machine-consumed by the backend; preview adds no real value. Matches Donna's restrained design. |
| Q5 | KB section in P4-3a | Link-only (no create, no upload) | KB creation + upload travel together in P4-3b. Picker explicitly surfaces "no other KBs to link" so the deferred state is visible, not silently broken. |

## 4. Architecture (Approach A — Section subcomponents + per-section form actions)

The matter detail page becomes a thin orchestrator. New top-level structure on `/matters/[id]` from top to bottom:

```
breadcrumb
heading + PrivilegedChip
description
[ + New chat in this matter ] [ Rename ] [ Archive ]
────────────────────────────────────────────────────
FilesSection
KnowledgeSection
SkillsSection
ContextSection
────────────────────────────────────────────────────
Chats · N
chat list
```

Section ordering reflects the user's emphasis (files first, knowledge adjacent, skills + context settings-flavored), and keeps the chats list at the bottom so it doesn't compete for attention with the new attach/edit affordances.

### 4.1 New files

**`src/lib/matters/sections/`** (one .svelte per section, presentational, plain props):
- `FilesSection.svelte`
- `KnowledgeSection.svelte`
- `SkillsSection.svelte`
- `ContextSection.svelte`

**`src/lib/matters/files/`** (the only sub-folder with non-trivial helpers):
- `Dropzone.svelte` — empty-state drop target (also used as a populated-state secondary target); emits `files: File[]`
- `FileRow.svelte` — single attached-file row
- `uploadFile.ts` — pure helpers (byte formatter, status-badge label/tone resolver)
- `uploadFile.test.ts`

**`src/lib/matters/knowledge/`**:
- `KbPicker.svelte` — searchable popover, mirrors `MatterPicker.svelte`'s idiom

**`src/lib/matters/skills/`**:
- `createMatterSkillAttach.svelte.ts` — matter-scoped controller mirroring the composer's `createSkillAttach()` but driving the persistent form actions instead of in-memory state

Plus per-component test files alongside (`*.svelte.test.ts` / `*.test.ts`).

### 4.2 Modified files

- `src/routes/(app)/matters/[id]/+page.server.ts` — gains 7 new form actions; `load` fans out to file-metadata + KB fetches in parallel with the existing matter + chats fetches
- `src/routes/(app)/matters/[id]/page.server.test.ts` — extends with the new-action coverage
- `src/routes/(app)/matters/[id]/+page.svelte` — renders the four new `<*Section>` components between the existing buttons row and the chats list; passes load data through unchanged

## 5. Files section (load, upload, list, remove)

### 5.1 Load

After fetching `matter` (existing) and `chats` (existing), the load function fans out:

```ts
const files = await Promise.all(
  (matter.attached_file_ids ?? []).map((id) =>
    lqFetch(event, `/api/v1/files/${id}`).then(async (r) => r.ok ? (await r.json()) as File : null)
  )
).then((arr) => arr.filter((f): f is File => f !== null));
```

N+1 calls per page load is acceptable for early use (files-per-matter is small; the calls parallelize). A 404 on one file is filtered out so a stale id doesn't break the page.

### 5.2 Upload (form action `uploadFile`)

Form posts `multipart/form-data` via `use:enhance`. Server reads `event.request.formData()`, iterates every entry named `file` (one per selected file, regardless of whether the input was a multi-select picker or a drag-drop), and for each:

1. `POST /api/v1/files` via `lqFetch(event, '/api/v1/files', { method: 'POST', body: <new FormData with the blob> })`. Returns 201 + `{ id }`.
2. `POST /api/v1/projects/{matter_id}/files` with body `{ file_id: <id from step 1> }`. Returns 204.

On success: return `{ uploaded: <n> }`. The SvelteKit `enhance` action's default behavior re-runs the load function and updates the page (no manual redirect needed).

**Error mapping:**
- **413** on the upload step → `fail(413, { error: 'File "{filename}" is too large — max {limit_mb} MB.' })`. `limit_mb` derived from the 413 body's `details.limit_bytes` (parsed via `Math.round(limit_bytes / 1024 / 1024)`); if the body can't be parsed, fall back to "max 100 MB".
- **409** on the attach step → silent no-op (treat as success; the file is attached either way).
- Any other 4xx/5xx on either step → `fail(502, { error: 'Could not upload "{filename}".' })`.
- For multi-file upload, **abort on first error and report which file failed**; previously-successful files in the same batch stay attached (no rollback). The user sees the error inline and can retry the failing file individually.

### 5.3 Detach (form action `detachFile`)

Body `{ file_id }`. Calls `DELETE /api/v1/projects/{matter_id}/files/{file_id}`. 204 + 404 → success (idempotent from the user's POV — 404 means it's already gone). Other → `fail(502, { error: 'Could not remove the file.' })`.

### 5.4 Section UI

- **Empty state:** the Dropzone fills the section with a large prompt — *"Drag PDFs or contracts here, or click to browse"*. Click or keyboard activation opens a hidden `<input type="file" multiple>`.
- **Populated state:** vertical list of `FileRow`s + a trailing small "Add file" button (clicks open the same hidden input). The whole list area remains a drop target with the same handlers so drag-drop works regardless of state — the button is an alternate entry point, not the only one.
- **File row:** filename · formatted size (B / KB / MB via `uploadFile.ts`) · status badge (Pending / Processing / **Ready** / Failed; colors `text-mlq-muted` / `text-mlq-muted` / `text-mlq-success` / `text-mlq-error`) · Download link (`/api/v1/files/{id}/content` via the BFF, opens in new tab) · Remove button (submits `detachFile`).
- **No polling in P4-3a.** Ingestion status reflects the most recent SSR fetch; users can refresh to see updates. Polling is a follow-up if real-world latency becomes painful.

### 5.5 Dropzone a11y

The Dropzone is a `<button type="button">` (so keyboard Enter / Space opens the file picker via the hidden input's `.click()`). Drag-over toggles a `dragging` `$state` for the visual highlight (`ring-2 ring-mlq-workflow` or similar). `dragenter` / `dragover` / `dragleave` / `drop` use standard listeners. A11y label: `aria-label="Upload files to this matter"`.

## 6. Knowledge section (link-only)

### 6.1 Load

In the same `load` function, fan out two KB fetches in parallel with files:

```ts
const [linkedRes, availableRes] = await Promise.all([
  lqFetch(event, `/api/v1/knowledge-bases?project_id=${matter.id}`),
  lqFetch(event, '/api/v1/knowledge-bases')
]);
const linked: KnowledgeBase[] = linkedRes.ok ? await linkedRes.json() : [];
const allKbs: KnowledgeBase[] = availableRes.ok ? await availableRes.json() : [];
const linkedIds = new Set(linked.map((k) => k.id));
const available = allKbs.filter((k) => !linkedIds.has(k.id));
return { ..., kbs: { linked, available } };
```

Either failure degrades gracefully (empty array, section renders with an inline message). Both calls are owner-scoped server-side.

### 6.2 Section UI

- **Empty linked state:** one helper line *"No knowledge bases linked. Linking a KB makes its documents available to chats in this matter."* + a "Link a knowledge base" button (opens the picker).
- **Linked state:** a list of rows: KB name · `{file_count} files` · Unlink button. Plus a small "Add" affordance at the bottom (same treatment as the Files section's "Add file").
- **Picker (`KbPicker`):** popover mirroring `MatterPicker`'s idiom — root div + `open` state + outside-click `$effect` + Escape capture. Search input filters `kbs.available` by case-insensitive substring match on `name`. Selecting a row submits the `linkKb` form. When `kbs.available.length === 0` the popover shows *"No other knowledge bases to link. (Creating a KB lands in a follow-up slice.)"* — making the deferred-create state explicit instead of silently empty.

### 6.3 Form actions

- **`linkKb`** — body `{ kb_id }`. `PATCH /api/v1/knowledge-bases/{kb_id}` with `{ project_id: <matter_id> }`. 200 → `{ success: true }`. 404 → `fail(404, { error: 'Knowledge base no longer exists.' })`. Other → `fail(502, { error: 'Could not link the knowledge base.' })`.
- **`unlinkKb`** — body `{ kb_id }`. `PATCH /api/v1/knowledge-bases/{kb_id}` with `{ project_id: null }`. 200 → success. 404 → silent (already gone). Other → `fail(502, { error: 'Could not unlink the knowledge base.' })`.

### 6.4 Forward-compat note

When P4-3b adds KB create + upload, this section gains *"Create new KB"* alongside *"Link existing"* in the picker and *"Upload to KB"* inside each linked row. The structure here leaves room without restructuring.

## 7. Skills section (attach via the SkillAttach idiom)

### 7.1 Load

`matter.attached_skill_names: string[]` is already on the loaded project — no additional fetch for currently-attached skills. The skills *catalog* (the picker's source list) is fetched the same way the composer's `SkillAttach` already does; the exact endpoint will be confirmed at plan time by re-reading `src/lib/skills/attach.svelte.ts`. The catalog returns to the page data as `skills: { attached: string[]; catalog: Skill[] }`.

### 7.2 Section UI

- **Empty state:** "No skills attached." + ⊕ Skill button.
- **Populated state:** horizontal row of skill chips (matching the composer's `SkillAttach.svelte` chip styling — `border border-mlq-subtle rounded-full px-2 py-0.5 text-xs` with per-chip X remove). Trailing ⊕ Skill button opens the popover. Clicking a result in the popover attaches the skill (chip appears, popover closes).

### 7.3 Reuse the composer's SkillAttach.svelte

`SkillAttach.svelte` (P2c-B2) is the popover presentational shell. It currently couples to `createSkillAttach()` — a chat-scoped in-memory controller. For matter-level attach we need persistent server-side state, so create a new controller:

**`src/lib/matters/skills/createMatterSkillAttach.svelte.ts`** — mirrors the composer controller's shape (the `results` / `loading` / `error` / `attached` reactive surface that `SkillAttach.svelte` consumes) but drives `attached`/`detached` through the matter form actions instead of writing to a local rune. If at plan time `SkillAttach.svelte` turns out to bake in composer-specific concerns that prevent clean reuse, split out a tiny `SkillPickerPopover.svelte` presentational sub-component first and consume that — but the working assumption is direct reuse.

### 7.4 Form actions

- **`attachSkill`** — body `{ skill_name }`. `POST /api/v1/projects/{id}/skills` with `{ skill_name }`. 204 success → `{ success: true }`. 404 → `fail(404, { error: 'Skill no longer exists.' })`. 409 (already attached) → silent. Other → `fail(502, { error: 'Could not attach the skill.' })`.
- **`detachSkill`** — body `{ skill_name }`. `DELETE /api/v1/projects/{id}/skills/{skill_name}`. 204 success → `{ success: true }`. 404 → silent. Other → `fail(502, { error: 'Could not detach the skill.' })`.

**Contract recheck at plan time:** the schema dump shows `/api/v1/projects/{project_id}/skills` (POST) + `/skills/{skill_name}` (DELETE). The POST request body shape needs to be re-verified during planning (literal `{ skill_name }` vs. `{ slug }` vs. multipart). Working assumption is the shape above; tests will be adjusted to match the real schema.

## 8. Context section (`context_md`)

### 8.1 Section UI

- Small heading *"Context"* + one-line helper *"Markdown notes the assistant sees on every chat in this matter. Optional, max 100 KiB."*
- `<textarea name="context_md">` seeded with `data.matter.context_md ?? ''`, `rows="4"` minimum, capped via `max-h-96` and the existing `autogrow` pattern from `Composer.svelte`'s textarea.
- Byte counter under the textarea: `"{bytes(value)} / 102400 bytes"`. Goes `text-mlq-error` when over the cap. Bytes counted via `new TextEncoder().encode(value).length` so non-ASCII content (which the user might paste) is measured correctly against the backend's UTF-8 byte limit.
- "Save context" button. **Disabled** when (a) value equals the seeded value (nothing to save) **or** (b) value exceeds 102400 bytes.

### 8.2 Form action `saveContext`

- Body: `{ context_md: string }` (HTML form field; empty string is the "clear" case).
- **Pre-check:** `if (new TextEncoder().encode(value).length > 102400) return fail(422, { error: 'Context exceeds the 100 KiB limit.' })`. Defense-in-depth — the client also disables submit, but a bypassed form is still rejected before reaching the backend.
- `PATCH /api/v1/projects/{id}` with `{ context_md: value === '' ? null : value }` (using the existing project PATCH endpoint; `context_md: null` clears).
- **Error mapping:** backend 422 (oversize on the wire) → same friendly message as the pre-check. Other failures → `fail(502, { error: 'Could not save the context.' })`. Success → `{ success: true }`.

### 8.3 Reuse note

This is a second form action that hits `PATCH /api/v1/projects/{id}` — distinct from the existing `rename` action, which patches `name`/`description`/`privileged`/`minimum_inference_tier`. Splitting keeps each action's test surface focused and avoids coupling the rename modal to context editing.

## 9. File-level change map

**New files**

```
src/lib/matters/sections/FilesSection.svelte
src/lib/matters/sections/FilesSection.svelte.test.ts
src/lib/matters/sections/KnowledgeSection.svelte
src/lib/matters/sections/KnowledgeSection.svelte.test.ts
src/lib/matters/sections/SkillsSection.svelte
src/lib/matters/sections/SkillsSection.svelte.test.ts
src/lib/matters/sections/ContextSection.svelte
src/lib/matters/sections/ContextSection.svelte.test.ts
src/lib/matters/files/Dropzone.svelte
src/lib/matters/files/Dropzone.svelte.test.ts
src/lib/matters/files/FileRow.svelte
src/lib/matters/files/FileRow.svelte.test.ts
src/lib/matters/files/uploadFile.ts
src/lib/matters/files/uploadFile.test.ts
src/lib/matters/knowledge/KbPicker.svelte
src/lib/matters/knowledge/KbPicker.svelte.test.ts
src/lib/matters/skills/createMatterSkillAttach.svelte.ts
src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts
tests/matter-files.spec.ts
```

**Modified files**

```
src/routes/(app)/matters/[id]/+page.server.ts       (load fan-out + 7 new form actions)
src/routes/(app)/matters/[id]/page.server.test.ts   (extend with new-action coverage)
src/routes/(app)/matters/[id]/+page.svelte          (render the 4 new sections)
```

## 10. Testing strategy

### 10.1 Unit (vitest + @testing-library/svelte + userEvent / fireEvent; mock `$app/forms` `enhance`)

**Section components:**
- **`FilesSection`** — empty state renders Dropzone with the "Drag PDFs or contracts here" prompt; populated state renders one `FileRow` per file + the "Add file" button; the Dropzone files callback wires through to the form submission.
- **`FileRow`** — shows filename + formatted size + status badge per `ingestion_status` (Pending / Processing / **Ready** / Failed); the download link points at `/api/v1/files/{id}/content`; the Remove button submits `?/detachFile` with the right `file_id`.
- **`KnowledgeSection`** — empty linked state shows the helper line + Link button; non-empty shows rows with KB name + `file_count` + Unlink; `KbPicker` opened against `available: []` shows "No other KBs to link" with the deferred-create copy.
- **`KbPicker`** — substring search filters; click submits with the kb_id; outside-click and Escape close (mirrors the established picker idiom).
- **`SkillsSection`** — driven via a `createMatterSkillAttach` stub: attached chips render, X removes (calls detach), the ⊕ Skill popover invokes attach with the selected slug.
- **`ContextSection`** — byte counter updates on input and goes red over the cap; Save button disabled when value equals initial or over cap; form posts to `?/saveContext`.
- **`Dropzone`** — keyboard activation (Enter / Space) opens the picker; dragover sets the visual state; `drop` with a `DataTransfer` stub emits the files.
- **`uploadFile.ts`** — byte-formatter cases (`0 B`, `< 1024 B`, `KB`, `MB`); status-badge label/tone resolver.
- **`createMatterSkillAttach`** — controller unit tests: `attach(slug)` calls the form submitter with the right body; `detach(slug)` likewise; `attached` reflects the current matter state.

**Form-action server tests** (`page.server.test.ts`, extending the P4-1 pattern — mock `lqFetch`, `Request` with `FormData` (multipart) or `URLSearchParams` (simple key/value) body):

- **`uploadFile`** — multi-file happy path: two `POST /files` + two `POST /projects/{id}/files`, returns `{ uploaded: 2 }`. 413 mapping (backend returns 413 with `details.limit_bytes` → action returns 413 with the formatted MB error). Partial failure (file 1 ok, file 2 fails on `POST /files`) → action returns 502 with the failed filename; file 1 stays attached. 409 on attach → silent success.
- **`detachFile`** — happy + 404 silent + 502 fallback.
- **`linkKb`** / **`unlinkKb`** — happy + 404 (friendly on link / silent on unlink) + 502.
- **`attachSkill`** / **`detachSkill`** — happy + 404 (friendly on attach / silent on detach) + 409 silent (attach already-attached) + 502.
- **`saveContext`** — happy + pre-check 422 (oversize text) + backend-422 mapping + 502 fallback + null-when-empty body shape.

**Load test** — extend the existing `[id]` load test: with `attached_file_ids: ['a','b']`, asserts the per-file `GET /files/{id}` fan-out happens in parallel with the chats and KB fetches; a 404 from one file is filtered out (page still renders with the remaining files); both `?project_id=` and unfiltered KB fetches happen; on either KB-fetch failure the page still renders with `linked: []` or `available: []`.

### 10.2 Live e2e (`tests/matter-files.spec.ts`, rebuild `donna-web` first, self-cleaning)

- Create a fresh matter via the API (unique `Date.now()` name).
- Visit `/matters/{id}`. Assert all four sections render in their empty states.
- Upload `spike.pdf` via the file input. Assert a `FileRow` appears with the filename and a status badge.
- Click Remove on the file row. Assert the row disappears and the Dropzone returns.
- Edit `context_md` to a short Markdown string. Assert Save enables, click Save, navigate away and back. Assert the textarea retains the value.
- Link an existing KB via the picker (seed one via the API at test start). Assert the row appears. Click Unlink. Assert it's gone.
- Attach a skill via the picker. Assert the chip appears. Detach. Assert the chip is gone.
- **Cleanup** in `try/finally`: archive the seeded matter and the seeded KB via API (mirrors the P4-2 e2e cleanup pattern).

### 10.3 Quality bar

- `npm run check` — **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless).
- `npx eslint <touched files>` — clean on every touched file.
- `npx vitest run` — green.
- `npx playwright test tests/matter-files.spec.ts` — green against the rebuilt container.

## 11. Risks & edges

- **N+1 file metadata fetches per page load.** Acceptable for early use (small N, parallelized). Track for follow-up if matter-files-per-matter grows past ~20.
- **No ingestion polling.** Status is whatever the SSR fetch returned. Users can refresh. Polling is a follow-up if backend ingestion latency proves painful in real use.
- **Skills POST body shape is a working assumption.** Plan-phase reads `src/lib/skills/attach.svelte.ts` + the schema to confirm `{ skill_name }` literal; tests adapt to whatever the real shape is.
- **KB linking without create.** Explicit "No other KBs to link" copy in the picker surfaces the deferred state instead of silently breaking.
- **Drag-drop a11y.** Keyboard equivalent via Enter / Space on the Dropzone `<button>` ensures the feature isn't pointer-only.
- **Multi-file partial-failure model.** Abort-on-first-error keeps semantics simple and predictable; previously-successful files in the batch stay attached (no rollback). The user retries the failed file individually.
- **Multipart memory.** Up to 100 MB buffers briefly in the SvelteKit Node process per upload while the action proxies to lq-ai. Acceptable; if it becomes a problem, future slice converts to a client-direct upload or streamed BFF route.

## 12. Out-of-scope follow-ups (do not slip in)

- KB upload + ingestion polling — **P4-3b**.
- KB creation — **P4-3b** (folded with upload).
- Chat-level file upload (composer attach) — future slice.
- Skills authoring — **P5 Workflows**.
- Playbooks — **P5 Workflows**.
- Folder tree / file versions / project sharing — **upstream-blocked**.
- File preview in the matter detail page (reusing the doc panel from P3) — future polish.
