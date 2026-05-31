# Donna — Playbooks apply + results (P5-2 slice B)

**Date:** 2026-05-30 · **Branch:** `playbooks-apply` · **PR target:** `main` · **Backend pin:** `438198c` (no backend change)

## 1. Background & spike (live, pin `438198c`, 2026-05-30)

Slice A (PR #25, merged) shipped the read-only Playbooks library. Slice B is the **apply** payoff: run a playbook against a contract and show per-position results + redlines. The full flow was verified live:

1. **Upload** a PDF → `POST /api/v1/files` (multipart, field `file`) → poll `GET /api/v1/files/{id}` until `ingestion_status='ready'` and `document_id` non-null (~6 s for a sample NDA).
2. **Execute** → `POST /api/v1/playbooks/{id}/execute { target_document_id, project_id? }` → `202` with a `PlaybookExecution` at `status='pending'`. `target_document_id` is the File's **`document_id`** (the parsed Document UUID), not the File id.
3. **Poll** `GET /api/v1/playbook-executions/{id}` until `status` is `completed`/`error` (~20–40 s — a 4-node LLM graph).

**`results` shape (schema `m3-a2-v1`, hand-typed locally — the generated contract types it loosely as `{[k]: unknown}`):**
- `summary: { matches_standard: number; matches_fallback: number; deviates: number; missing: number }` — verdict counts.
- `positions: PositionResult[]`, one per playbook position:
  - `issue: string`, `position_id: string (uuid)`, `severity_if_missing: 'critical'|'high'|'medium'|'low'`
  - `verdict: 'matches_standard'|'matches_fallback'|'deviates'|'missing'`
  - `confidence: number` (0–1)
  - `matched_text: string | null` — the contract clause that matched
  - `matched_fallback_rank: number | null` — which fallback tier matched (when `matches_fallback`)
  - `justification: string` — the model's reasoning
  - `redline: { new_text: string; old_text: string; justification: string } | null` — suggested edit (present for `deviates`/`missing`)
  - `cited_chunk_ids: string[]` — source chunks (not surfaced in this slice)

**Constraints (verified):**
- **Execute requires admin OR playbook ownership.** Non-admins get `404` on built-ins. Only built-ins exist until slices C/D, so **execution is effectively admin-only in v1.** Donna's session exposes `user.is_admin` (the full `User` schema via `(app)/+layout.server.ts`).
- **No list-files endpoint** (`GET /api/v1/files` → 405). A target document must come from an upload or from a matter's `attached_file_ids` (a `Project` carries `attached_file_ids`; each is fetched via `GET /files/{id}` — the matter detail already does this).

## 2. Goal

From a playbook's detail page, an admin runs the playbook against a contract — uploaded fresh or chosen from a matter's files — and sees a verdict scorecard plus per-position results with suggested redlines, on a dedicated, reload-safe run page.

## 3. Scope (decisions confirmed in brainstorm)

- **One PR**, full results including redline rendering.
- **Document source: both** — Upload a new PDF, or Choose from a matter's ingested files.
- **Admin-gated** — the Apply affordance and the run route are gated on `user.is_admin`; non-admins see a short explanatory note. (Revisit when C/D add user-authored playbooks, which non-admins can run.)
- **Redline treatment: stacked old→new blocks** (struck-through removed text, green added text) — no diff library.
- **Results ordering: worst-first** (`missing` → `deviates` → `matches_fallback` → `matches_standard`).
- **Dedicated run page** `/playbooks/[id]/run` hosting choose → progress → results in one reload-safe page.

**Out of scope:** run history / a list of past executions (no list endpoint; each run is reached right after running or via its `?execution=` URL); KB-file source (matters only for "choose existing"); `cited_chunk_ids` → citation linking; non-admin execution; editing/exporting the redline.

## 4. Architecture & data flow

**Route `src/routes/(app)/playbooks/[id]/run/`** — SSR `load` + form actions + client-orchestrated polling.

- **`+page.server.ts` `load(event)`** — read `locals.user`; if **not `is_admin`** throw `error(403, …)`. Then:
  - `GET /api/v1/playbooks/${params.id}` → playbook (404→`error(404)`, other non-OK→502) — header + position count.
  - `GET /api/v1/projects` → the user's matters (for the matter picker).
  - If `url.searchParams.get('matter')`: `GET /api/v1/projects/{matter}` → `attached_file_ids` → `GET /files/{id}` each → keep only ingested (`ingestion_status==='ready'` && `document_id`) → the picker's file list.
  - If `url.searchParams.get('execution')`: `GET /api/v1/playbook-executions/{execution}` → the execution (resume polling if pending/running; render if completed).
  - Returns `{ playbook, matters, matterFiles, execution }`.
- **Form actions:**
  - `?/upload` — multipart passthrough → `POST /api/v1/files` (reuse `lqClient`'s FormData handling from P4-3a) → `{ fileId }` on success; map 413 to a size message.
  - `?/execute` — `{ target_document_id, project_id? }` → `POST /api/v1/playbooks/${params.id}/execute` → `redirect(303, '?execution=' + execution.id)` so the run URL is shareable and `load` picks the execution up.
- **New BFF proxy `src/routes/(app)/playbook-executions/[id]/+server.ts`** — `GET` → `lqFetch('/api/v1/playbook-executions/{id}')`; 503/504 passthrough, else 502 (mirror `skills/autocomplete/+server.ts`). Used for client-side execution polling.
- **`GET /files/[id]`** BFF proxy already exists (P3) — reused for ingestion polling.

**Client orchestration — `src/lib/playbooks/runFlow.svelte.ts`** (a rune controller; mirrors the P4-3b client-polling pattern):
- *Upload path:* submit `?/upload` → `fileId` → poll `/files/{fileId}` every 2 s (visibility-aware) until `ready` (→ `document_id`) or `failed` → submit `?/execute` with `document_id`.
- *Pick path:* user selects an ingested matter file → submit `?/execute` with its `document_id` (skips upload/ingest steps).
- After `?/execute` redirects to `?execution=<id>`, poll `/playbook-executions/{id}` every 2 s until `completed`/`error`. A 5-min stuck threshold surfaces a "still running — refresh" affordance (P4-3b precedent). Render results on completion; render the backend `error` on failure.

**Detail page `/playbooks/[id]/+page.svelte`** — add an **Apply to a document** action. Read admin status from layout data (`page.data.user?.is_admin` via `$app/state`). Admin → a link to `/playbooks/[id]/run`; non-admin → a muted note: "Running built-in playbooks requires an admin account in this version."

## 5. Components (`src/lib/playbooks/`) — reuse slice A where possible

| Unit | Responsibility | Notes / reuse |
|---|---|---|
| `types.ts` (extend) | Add `PlaybookExecution` (from contract) + hand-typed `ExecutionResults`, `PositionResult`, `Redline`, `ResultSummary` for the `m3-a2-v1` shape | contract types `results` loosely |
| `verdict.ts` | Pure: `VERDICTS` (ordered worst-first), `verdictMeta(v) → { label, badgeClass }`, `compareByVerdict`, summary helpers | unit-tested |
| `VerdictBadge.svelte` | verdict → colored chip (standard green / fallback blue / deviates amber / missing red) | sibling to `SeverityBadge` |
| `ResultSummary.svelte` | The scorecard — verdict count chips | takes `ResultSummary` |
| `RedlineBlocks.svelte` | `redline` → struck-through `old_text` block + green `new_text` block + optional justification | the chosen stacked treatment |
| `ResultCard.svelte` | One `PositionResult`: `VerdictBadge` + issue + `SeverityBadge` (reused) + confidence + matched_text clause + justification + `RedlineBlocks` when `redline` present | reuses A's `SeverityBadge` |
| `ExecutionResults.svelte` | `ResultSummary` + worst-first `ResultCard` list | composition |
| `DocumentChooser.svelte` | Tabs: **Upload** (reuse `matters/files/Dropzone`) \| **Choose from a matter** (reuse `MatterPicker` → `?matter=` → ingested file list; non-ingested greyed out, unselectable) | reuses P4-1/P4-3a |
| `RunProgress.svelte` | Stepper: Uploaded → Ingested → Analysing → Results (upload/ingest steps skipped on the pick path) | pure presentational |
| `runFlow.svelte.ts` | The async state-machine controller (above) | new |

## 6. Visual language

Donna serif/gray. Run page: playbook header, then the chooser (Step 1), then the progress stepper (Step 2), then results in place. Results: a header with the scorecard chips, then worst-first `ResultCard`s. Verdict colors — standard green, fallback blue, deviates amber, missing red (soft fills, dark text for AA contrast). Redline: red struck-through `old_text` over green `new_text`. `SeverityBadge` (from A) still marks each position's `severity_if_missing`.

## 7. Error & edge handling

- Non-admin reaching `/playbooks/[id]/run` → `error(403)` (defence-in-depth; the Apply link is already hidden).
- Upload of a non-PDF / oversize → surfaced from the action (`ingestion_status='failed'` with `ingestion_error`, or 413 → size message).
- Ingestion `failed` → stop polling, show the `ingestion_error`.
- Execution `error` → show the backend `error` string; offer to retry.
- A matter with no ingested files → "No ingested documents in this matter yet."
- `?execution=<id>` that is still `pending`/`running` on load → resume polling; `completed` → render immediately (reload-safe).

## 8. Testing

**Unit (vitest)**
- `verdict.ts` — worst-first ordering, labels, badge classes, summary totals.
- `VerdictBadge`, `ResultSummary`, `RedlineBlocks` (old/new/justification; absent when null), `ResultCard` (verdict + matched_text + justification + redline-when-present + severity), `ExecutionResults` (worst-first order; summary).
- `DocumentChooser` — tab switch; only ingested matter files selectable; emits the right `document_id`; upload hands a file to the flow.
- `runFlow.svelte.ts` — state machine: upload→ingest-poll→execute→exec-poll→results; pick path skips upload/ingest; ingestion-failed and execution-error branches; poll uses mocked fetch.
- `run/+page.server.ts` — `load`: admin-gate 403; playbook 404/502; `?matter` file filtering (ingested only); `?execution` fetch. Actions: `?/upload` (FormData → file_id; 413 message), `?/execute` (redirects to `?execution=`). (Mock `lqFetch`, the matters/skills server-test pattern.)
- `playbook-executions/[id]/+server.ts` — 200 passthrough, 502/503/504.
- Detail page — Apply link shown for admin, note shown for non-admin.

**Live e2e (`tests/playbooks-apply.spec.ts`)** — admin logs in → `/playbooks/[id]` for NDA — Mutual → Apply → run page → **upload** `vendor/lq-ai/docs/quickstart/sample-ndas/nda-1-acme-beta.pdf` → progress → results render: the scorecard and at least one `ResultCard` with a verdict badge; assert the `deviates` position shows a redline (old + new). Real LLM run (~20–40 s; precedent: `citation-live.spec.ts` does live ingest+chat). Read-only-ish: leaves an uploaded file + execution (harmless; no list endpoint) — matches the `citation-live`/`skill-attach` precedent.

**Quality bar:** `npm run check` 0/0 (vendor `ERR_MODULE_NOT_FOUND` harmless); eslint clean (no `any`; in-app `<a>` links carry the disable comment); rebuild `donna-web` before the e2e.

## 9. Follow-ups (committed)

- **C — Easy-gen wizard** (`POST /playbooks/easy`): document selection → generation polling → draft positions editor → save. Reuses `DocumentChooser`, the polling controller, and A's `PositionCard`. **D — manual authoring** likely folds into C.
- Later: run history, KB-file source, `cited_chunk_ids` → document-panel citations, redline export.
