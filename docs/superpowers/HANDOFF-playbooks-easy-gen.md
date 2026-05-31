# Donna — Handoff: finish Playbooks Easy-Gen wizard (P5-2 slice C)

**Date:** 2026-05-30 · **Branch:** `playbooks-easy-gen` (pushed to origin; **NOT yet a PR** — mid-flight).

## Where we are

Slice C (the "generate a playbook from prior agreements" wizard) is **7 of 10 tasks done** via the usual subagent-driven loop (each task spec+quality reviewed; branch is green: `npm run check` 0/0, **584/584** unit tests). Plan + spec are committed on the branch:
- Spec: `docs/superpowers/specs/2026-05-30-donna-playbooks-easy-gen-design.md`
- Plan: `docs/superpowers/plans/2026-05-30-playbooks-easy-gen.md` (the 10 tasks)

**Done (T1–T7), committed on the branch:**
- T1 `41cb5fd` — types (`PlaybookCreate`/`PositionCreate`/`EasyPlaybookGeneration`/`DraftPlaybook`) + widened `PositionCard` to render a `PositionCreate`.
- T2 `667591a` — BFF proxies `(app)/playbooks/easy/+server.ts` POST + `(app)/playbooks/easy/[generation_id]/+server.ts` GET.
- T3 `d3f3da5`+`9985757` — `src/lib/playbooks/genFlow.svelte.ts` (prepare uploads→generate→poll→review; `stuck`; `resume`).
- T4 `f91212f`+`8ea2f73` — `GenDocumentPicker.svelte` (multi-select; exports `Selected = DocSelection & {filename}`).
- T5 `718b27c` — `GenProgress.svelte`.
- T6 `045e1e9` — `DraftReview.svelte` (edit name/contract_type/description + per-position keep checkbox → emits `PlaybookCreate` via `onchange`).
- T7 `45a970f` — `(app)/playbooks/new/+page.server.ts` (`load`: matters + `?matter` ingested files + `?generation` resume; `?/save` action → `POST /playbooks` → redirect).

## What's left (T8 → T10) — follow the plan verbatim

1. **T8 — `(app)/playbooks/new/+page.svelte`** (wizard composition). Full code is in the plan §"Task 8". Wires `createGenFlow` (with `onGenerationStarted` → `replaceState(?generation=)`), a contract-type input + `<GenDocumentPicker bind:selected>` + Generate button (idle), `<GenProgress>` (non-review phases), and `<DraftReview onchange={v=>edited=v}>` + a `<form action="?/save" use:enhance>` with a hidden `draft` = `JSON.stringify(edited)`. **Note:** until T8 lands, `/playbooks/new` has a load+action but no page to render — expected.
2. **T9 — "+ New playbook" entry** on `(app)/playbooks/+page.svelte` (link to `/playbooks/new`) + a tiny `page.svelte.test.ts`. Plan §"Task 9".
3. **T10 — live e2e** `tests/playbooks-easy-gen.spec.ts`. Plan §"Task 10". **Requires `arq-worker` running** (`docker compose up -d arq-worker`) + rebuild `donna-web`. The run is slow (~1–3 min real generation); `test.setTimeout(240_000)`.

Then: final whole-branch review (opus) → `finishing-a-development-branch` → PR into `main`.

## Cold start

1. `git checkout playbooks-easy-gen && git pull` (it's pushed). `git log --oneline main..HEAD` should show the 9 commits above + spec/plan.
2. Ensure stack up **incl. arq-worker**: `set -a; . ./.env; set +a; docker compose up -d postgres redis minio gateway api donna-web ingest-worker arq-worker`.
3. Resume subagent-driven execution at **T8** (use the plan's exact code per task; spec+quality review each; commit per task; rebuild `donna-web` before the T10 e2e).

## Gotchas / things proven this slice (don't re-learn)

- **`arq-worker` is REQUIRED for easy-gen** — without it, `POST /playbooks/easy` jobs sit in `pending` forever (recorded in `donna-dev-stack` memory). Execute (slice B) didn't need it; easy-gen does.
- **Easy-gen flow (live-verified):** `POST /playbooks/easy {document_ids[], contract_type, name?, persist_documents_after_generation:true}` → poll `GET /playbooks/easy/{id}` (pending→running→completed, **~112 s / 2 NDAs → 15 positions**) → `draft_playbook` is a full `PlaybookCreate` (positions = full `PositionCreate`). `document_ids` = File `document_id`s. Save = `POST /playbooks` (NOT admin-gated; created_by=caller → caller can then Apply it).
- **Bare `while(true)` is fine** (ESLint 10 `allExceptWhileTrue`) — no disable comment (it'd be an unused directive). genFlow poll loops follow this.
- **`?matter` URL-sync `$effect`** must guard `if (selectedMatter === current) return;` to avoid a redundant nav on mount (slice-B lesson; GenDocumentPicker already does this).
- **Controller stuck test:** use `.mockImplementation(() => Promise.resolve(jsonResp(...)))` for repeated polls (fresh Response each call), NOT `.mockResolvedValue(...)` (single Response → "Body is unusable" on 2nd `.json()`).
- **`PositionCard`** now accepts `Position | PositionCreate` (renders no `id`) — reused by `DraftReview`.

## After slice C → slice D

**D = full per-position editor + manual authoring** (edit every position field + add/remove; create-from-scratch `POST /playbooks`; `PATCH`/`DELETE` existing). The Step-3 prune-only review in C upgrades to full editing when D's editor lands. See spec §9.
