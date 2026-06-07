# Automations — document-grade run artifacts: the "Documents" block (design)

**Date:** 2026-06-07 · **Slice:** incorporate lq-ai **#138** (Donna ask #8, document-grade
artifacts) + verify lq-ai **#139** (Donna ask #9, arq-worker skill-registry init — no Donna code) ·
**Branch:** `feat/automations-artifacts` (pin bump `0097b01` → `c4d4482` is the branch's first
commit) · **Goal:** a user opens a workflow run's receipt, sees the documents the run produced,
opens them rendered inline, or downloads them.

## Problem

A run's document-grade work-product (markdown memos) was previously discarded — findings/memories
shipped in #64/#66/#71/#72, but nothing carried a *document*. lq-ai #138 resolves our ask
(`docs/upstream-requests/lq-ai-autonomous-run-artifacts.md`, storage shape (a)): artifacts persist
as **real Documents in the run's `target_kb_id`** (doc-panel / download / RAG for free), with
artifact *references* on the session read surface. Donna must now surface them on the receipt —
and expose the **opt-in flag** upstream added (without a toggle, users can't turn artifacts on).

## Upstream contract (verified against generated types @ `c4d4482`)

- **`GET /api/v1/autonomous/sessions/{session_id}/artifacts`** → `AutonomousArtifactListResponse`:
  `{ artifacts: [AutonomousArtifactRead], total_count, limit, offset }`.
  - `AutonomousArtifactRead = { id, name, mime, size_bytes, file_id?: uuid|null,
    document_id?: uuid|null, created_at }`.
  - Owner-gated via the parent session, 404 id-probing-safe, `?limit=` clamped **[1, 200]**.
  - Ordered **`created_at` ASC, id ASC** — stable/repeatable, **NOT** emission sequence (all of a
    run's artifacts share a transaction-stable `created_at`; deliberate upstream deviation from
    our ask).
  - `mime` is pinned **`text/markdown`** server-side in the integrated flow (not LLM-controlled).
  - `file_id` is SET-NULL on hard file-delete (name/size metadata survives for the receipt);
    `document_id` is read-time-enriched from the 1:1 `documents.file_id` — null when `file_id` is
    null or no documents row exists.
- **`emit_artifacts: boolean`** (default **false** — existing automations unchanged) on 7 schemas:
  `AutonomousScheduleCreate/Update/Read`, `AutonomousWatchCreate/Update/Read`,
  `AutonomousManualRunRequest`. **Required (non-optional) in the create/run-now bodies.** PATCH
  semantics: explicit `false` persists; explicit `null` is a documented no-op. A manual run has no
  schedule/watch row to inherit from — the run-now body IS the opt-in source.
- **Notification payload** now always carries `artifact_count` next to `finding_count` (0 is
  honest); the backend-authored `body` says e.g. *"Session completed with 2 finding(s) and 1
  document(s) saved to the knowledge base."*
- **Honest fallbacks arrive as ordinary findings** (no special Donna handling): opted-in-but-no-KB
  → one `info` finding ("Artifact not persisted — no target knowledge base"); storage failure →
  one `warn` finding per failed artifact.
- **Deletion:** session delete CASCADEs only the references; the KB documents outlive the session.
- Out of scope upstream (confirmed): PDF/DOCX artifact rendering (DE-332), artifact
  editing/versioning, interactive chat/playbook paths.
- **#139 (registry fix):** bootstrap shared by API lifespan + arq-worker `on_startup`; worker
  fails loudly at startup if the skills dir can't load. Vendor `docker-compose.yml` now mounts
  `./skills:/skills:ro` + sets `LQ_AI_SKILLS_DIR` on `arq-worker` (**required** — Donna's compose
  `include`s the vendor file, so it ships with the pin bump; verified present). Upstream
  corrections: never a regression (worker-side `skill_ref` never worked on any image; our 06-05
  "completed" tick was a `first_tick_no_baseline` tick that skips inference), and the API now also
  fails at startup on a missing/unreadable skills dir.

## Decisions (user-confirmed)

- **Open = inline markdown viewer** (user-picked over download-only v1): extend the doc panel
  with a text renderer. Artifacts are always `text/markdown`; today the panel renders **PDF only**
  and everything else falls to `UnsupportedFileCard`. A `TextViewer` upgrades every KB text doc,
  not just artifacts.
- **Threading mirrors the `memories_total` chain from #71** exactly — no new routes; live runs
  pick up artifacts via the existing poll.
- **Documents block renders only when non-empty.** The feature is opt-in and most runs produce
  zero artifacts; null (fetch degraded) and empty both hide the block (the memories pattern, not
  the findings pattern with its explicit empty copy).
- **Run-now toggle ships with hint text, not a disabled state**, when no KB is selected — the
  backend's honest-fallback info finding covers the gap; don't over-build.
- **Notifications need zero Donna code** — `NotificationRow` renders the backend-authored `body`
  verbatim and nothing in Donna composes copy from `payload.finding_count`; the upgraded body
  flows through. Verify live, change nothing.

## Design

### 1. Doc panel: inline text rendering (`src/lib/docpanel/`)

- New **`TextViewer.svelte`**: given `fileId` + `mime` (+ `filename`), fetches
  `/files/{fileId}/content` as text on mount; renders `text/markdown` through the existing
  `$lib/components/Markdown.svelte`, `text/plain` through `<pre>`; loading state; error state
  keeps a Download link (`UnsupportedFileCard`-grade degradation, never a crash).
- **`DocumentPanel.svelte`**: new branch — `mime === 'text/markdown' || mime === 'text/plain'` →
  `TextViewer`; `application/pdf` → `PdfViewer` (unchanged); everything else →
  `UnsupportedFileCard` (unchanged).

### 2. Data: `$lib/automations/artifacts.ts` + `loadRunOutput` extension

- New hand-parser module (the `findings.ts` pattern): `ArtifactItem { id, name, mime, size_bytes,
  file_id: string | null, document_id: string | null, created_at }`; `parseArtifactList` tolerant
  of unknown shapes (throw → caller degrades to null).
- `runOutput.server.ts`: `RunOutput` gains `artifacts: ArtifactItem[] | null` +
  `artifacts_total: number | null`; third parallel `lqFetch` to
  `/api/v1/autonomous/sessions/{id}/artifacts?limit=200`; same null-degradation — **the receipt
  page must never fail because of Results**.

### 3. Threading (mirror `memories_total`, #71)

`loadRunOutput` → `[id]/+page.server.ts` SSR load AND `[id]/+server.ts` poll proxy →
`pollSession.svelte.ts` (new `artifacts`/`artifactsTotal` state, last-known-good: only overwrite
on non-null incoming) → `SessionDetail.svelte` (derive live-over-initial) → `RunResults` props.

### 4. RunResults "Documents" block (above findings)

- Section heading "Documents" rendered **only when `artifacts?.length > 0`**.
- Per-artifact row: **name** + human-readable **size** (new `formatBytes` helper in
  `$lib/automations/display.ts`) + **Open** + **Download**:
  - **Open** — shown when `file_id` is non-null: calls an `onopenartifact(artifact)` callback;
    the receipt page (`/automations/[id]/+page.svelte`) hosts `createDocPanel()` +
    `<DocumentPanel>` (the tabular-page hosting pattern) and maps the callback to
    `docPanel.open({ source_file_id: file_id })`.
  - **Download** — `<a href="/files/{file_id}/content" download>` (existing proxy).
  - `file_id` null → muted metadata-only row (name + size + "file deleted"); no actions.
- Overflow note when `artifacts_total > artifacts.length` (the findings pattern).

### 5. Opt-in toggles (`emit_artifacts`)

- Checkbox **"Save run documents to the knowledge base"** (+ one-line helper copy) on:
  - **`ScheduleForm.svelte`** (create + edit; prefill from `AutonomousScheduleRead.emit_artifacts`),
  - **`WatchForm.svelte`** (create + edit; prefill from read model),
  - **`RunNowForm.svelte`** (+ hint "documents need a target knowledge base" near the toggle when
    no KB is selected).
- Body builders (`schedules.ts` / `watches.ts` / `runNow.ts`): always include the explicit
  boolean (create AND update — PATCH `false` persists per contract; never send `null`).

### 6. Tiny pieces

- **About:** `/about/automations` Results section gains a sentence on documents (opt-in, saved to
  the target KB, openable from the receipt).
- **Notifications:** no code (decision above).

## Verification

- **Unit (vitest):** `parseArtifactList` (happy/empty/garbage) · `loadRunOutput` artifacts
  degradation · `RunResults` Documents block (hidden when null/empty; rows; deleted-file row;
  overflow) · form toggles + body builders (`emit_artifacts` always explicit) · `TextViewer`
  (markdown/plain/error) · `DocumentPanel` mime branch · `pollSession` artifact threading ·
  `formatBytes`.
- **Live e2e (Playwright):** extend/add next to `tests/automations-run-results.spec.ts` — receipt
  shows the Documents block, Open renders the markdown in the panel, Download serves bytes.
  **Primary path = SQL-seed** (artifact emission is model-discretionary, not reliable in CI):
  seed the KB document + `autonomous_artifacts` reference rows via
  `docker compose exec postgres psql` (creds `lq_ai`/`lq_ai`; marker-row helper pattern from
  `tests/automations-memory-review.spec.ts` / `tests/automations-precedents.spec.ts`). A real
  opted-in run-now is exercised manually (below), not asserted in CI.
- **Manual live:** run-now with `emit_artifacts: true` + a target KB → artifact appears on the
  receipt (or the honest-fallback finding does); notification body mentions document(s).
- **Ask #9 acceptance (no Donna code):** with the rebuilt `arq-worker`, a run-now with a
  **skill** source (`dpa-checklist-review`) completes — the `/automations` sessions list shows it
  `completed`, receipt free of `skill registry not initialised`.
- **Gates:** `npm run check` 0/0 · `npm run lint` fully green · vitest baseline 1285 + new ·
  merge-commit on PR.

## Out of scope

- Rendering artifact PDFs/DOCX (upstream DE-332), artifact editing/versioning.
- Surfacing `emit_artifacts` state on ScheduleRow/WatchRow list rows (forms only).
- Composing notification copy from `payload` counts (body flows through).
- The unfiled source-switch dual-key upstream ask (PATCH doesn't null the other source key) —
  pre-existing, noted in the handoff's open ends.
