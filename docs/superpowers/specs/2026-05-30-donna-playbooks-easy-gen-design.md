# Donna — Playbooks Easy-Gen wizard (P5-2 slice C)

**Date:** 2026-05-30 · **Branch:** `playbooks-easy-gen` · **PR target:** `main` · **Backend pin:** `438198c` (no backend change)

## 1. Background & spike (live, pin `438198c`, 2026-05-30)

Slices A (browse, #25) and B (apply, #26) are merged. Slice C is **"generate a playbook from prior agreements"** — the Easy-Gen wizard. Verified live end-to-end:

1. **Generate:** `POST /api/v1/playbooks/easy { document_ids[], contract_type, name?, persist_documents_after_generation }` → `202` `EasyPlaybookGeneration` at `status='pending'`. `document_ids` are **File `document_id`s** (parsed Document UUIDs — same as B's `target_document_id`); the caller must own every document.
2. **Poll:** `GET /api/v1/playbooks/easy/{generation_id}` → `status` pending→running→completed (**~112 s for 2 NDAs → 15 positions**; can take minutes).
3. **Draft:** on `completed`, `draft_playbook` is **exactly a `PlaybookCreate` shape** — `{ name, contract_type, version, description, positions: PositionCreate[] }`, where each position has the full 9 fields (`issue, description, standard_language, fallback_tiers[], redline_strategy, severity_if_missing, detection_keywords[], detection_examples[], position_order`) — i.e. what slice-A's `PositionCard` already renders. The draft `name` defaults to `"Generated {contract_type} Playbook"` regardless of the create-time `name`, so the wizard's review step owns the final name.
4. **Save:** `POST /api/v1/playbooks` with the (edited) `PlaybookCreate` → `201` `Playbook` (`created_by = caller`).

**Auth (verified):** `POST /playbooks/easy` and `POST /playbooks` are **NOT admin-only** — any authenticated user generates + saves a playbook they own (easy-gen requires owning the source documents). Since execute permits the owner, a user who saves their own playbook can then Apply it (slice B) — closing the loop for non-admins.

**Dev-stack (verified):** Easy-Gen requires the **`arq-worker`** service (consumes the `arq:m3a6` queue) running alongside `ingest-worker` — without it, generations hang in `pending`. (Recorded in `donna-dev-stack` memory.)

## 2. Goal

A wizard that turns a set of prior agreements into a saved playbook: pick documents + a contract type → generate (async, polled) → review & prune the draft → save. Any authenticated user; no backend change.

## 3. Scope (decisions confirmed in brainstorm)

- **3-step wizard** at `/playbooks/new`, entered from a **"+ New playbook → Generate from documents"** action on `/playbooks` (not admin-gated).
- **Step 1 — multi-select documents + contract type.** A multi-select picker (the Apply two-tab pattern — Upload / Choose from a matter — but each file is a checkbox and uploads accumulate into a running selection). A free-text `contract_type` input (with a datalist of common types). "Generate" enabled when ≥1 document selected + a contract type.
- **Step 2 — generate + poll** (`POST /playbooks/easy` → poll). Reload-safe via `?generation=<id>`. A 5-min stuck hint (generations are long).
- **Step 3 — review & prune, then save.** Editable **name, contract_type, description**; positions listed via the read-only `PositionCard` each with a **keep/drop checkbox**; Save (≥1 kept) → `POST /playbooks` with the kept positions → redirect to the new playbook's detail page.
- **Edit depth: light.** Top-level fields + position pruning only. **Per-position field editing (rewrite standard_language, tweak fallback tiers, add positions) is slice D** (the full positions editor, reused here + standalone manual authoring).

**Out of scope (slice D / later):** per-position field editing & add-position; standalone manual authoring & `PATCH`/`DELETE` of playbooks; run history; KB-file source for the picker.

## 4. Architecture & data flow

**Route `src/routes/(app)/playbooks/new/`** — SSR `load` + a `?/save` form action + client-orchestrated generation.

- **`+page.server.ts` `load(event)`** (not admin-gated):
  - `GET /api/v1/projects` → the user's matters (for the picker's matter tab).
  - If `?matter=<id>`: `GET /projects/{id}` → `attached_file_ids` → `GET /files/{id}` each → ingested only (`ready` && `document_id`) — same fan-out as B's run load.
  - If `?generation=<id>`: `GET /api/v1/playbooks/easy/{id}` → the generation (resume polling / show draft). Reload-safe.
  - Returns `{ matters, matterFiles, generation }`.
- **`?/save` action:** reads a JSON `draft` field (the edited `PlaybookCreate`: `{ name, contract_type, description?, version, positions: PositionCreate[] }`), validates name + contract_type + ≥1 position, `POST /api/v1/playbooks` → `redirect(303, '/playbooks/' + created.id)`; map 422 → an inline error.
- **BFF JSON proxies** (client generation flow):
  - **New** `src/routes/(app)/playbooks/easy/+server.ts` `POST` — body passthrough → `POST /api/v1/playbooks/easy` → the generation. (Static `easy` segment doesn't collide with `/playbooks/[id]`.)
  - **New** `src/routes/(app)/playbooks/easy/[generation_id]/+server.ts` `GET` → `lqFetch('/api/v1/playbooks/easy/{id}')`; 503/504 passthrough else 502.
  - **Existing** `POST /files` + `GET /files/[id]` (slice B) — reused to upload+ingest the picker's uploaded documents.

**Client controller — `src/lib/playbooks/genFlow.svelte.ts`** (rune controller; mirrors B's `runFlow`):
- `generate(selections, contractType)` where each selection is `{ kind: 'matter'; documentId }` or `{ kind: 'upload'; file: File }`:
  - phase `preparing`: for each upload → `POST /files` → poll `GET /files/{id}` until `ready` (→ `document_id`) or `failed`; matter selections already carry a `document_id`. Collect all `document_ids`.
  - phase `generating`: `POST /playbooks/easy { document_ids, contract_type, persist_documents_after_generation: true }` → `generation.id`; push `?generation=<id>` (replaceState); poll `GET /playbooks/easy/{id}` every 2 s until `completed` (→ `draft`) / `error`; 5-min `stuck` flag.
  - phase `review`: expose `draft` (the `PlaybookCreate`); the page binds an editable copy.
- `resume(generation)` from SSR `?generation=` (running → poll; completed → review).
- State: `idle → preparing → generating → review → error`. Reset on a new run.

**Step-3 save** is the page's `?/save` form action (not the controller) — the page serializes the edited draft (name/contract_type/description + kept positions) into a hidden `draft` JSON field and submits; the action redirects on success.

## 5. Components (`src/lib/playbooks/`) — reuse A/B

| Unit | Responsibility | Reuse |
|---|---|---|
| `types.ts` (extend) | Add `PlaybookCreate`, `PositionCreate`, `EasyPlaybookGeneration` (from contract) + a hand-typed `DraftPlaybook` = the `draft_playbook` shape (`PlaybookCreate`-equivalent; contract types it as `{[k]:unknown}`) | — |
| `GenDocumentPicker.svelte` | Multi-select doc picker: Upload tab (`Dropzone`, accumulating) + matter tab (`MatterPicker` + ingested file checklist), maintains a selection list (`{kind,...}[]` + remove), emits it | reuses `Dropzone`, `MatterPicker`; sibling to B's single-select `DocumentChooser` (kept separate — different selection semantics) |
| `genFlow.svelte.ts` | The generation state-machine (prepare → generate → poll → review), stuck flag, resume | mirrors B's `runFlow` |
| `GenProgress.svelte` | Step-2 progress (preparing N docs → generating → done) + stuck hint | mirrors B's `RunProgress` |
| `DraftReview.svelte` | Step-3 editable name/contract_type/description + position keep-list (each row a `PositionCard` + keep checkbox); emits the final `PlaybookCreate` (or binds it) | reuses A's `PositionCard` |
| `new/+page.svelte` | Wizard composition (Step1 picker → Step2 progress → Step3 review), wires `genFlow` + the `?/save` form | — |

A "+ New playbook" entry is added to `/playbooks/+page.svelte` (links to `/playbooks/new`).

## 6. Visual language

Donna serif/gray. `/playbooks/new`: a single scrolling page that advances Step 1 → 2 → 3 in place. Step 1: contract-type text input + the multi-select picker with a "N selected" line. Step 2: a quiet progress line + stuck hint. Step 3: editable header fields, then the position keep-list (read-only `PositionCard`s with a leading keep checkbox; dropped rows dimmed/struck), a Save button (disabled until name + contract_type + ≥1 kept position). Save lands on the new playbook's detail page.

## 7. Error & edge handling

- Upload of a non-PDF / oversize in the picker → surfaced per-file (`ingestion_status='failed'` with `ingestion_error`, or 413).
- A selected upload that fails ingestion → flagged in the selection list; excluded from `document_ids`; the user can remove it and proceed with the rest (block Generate only if zero usable docs).
- Generation `error` → show `error_message`; offer to retry.
- Generation stuck > 5 min → "still generating — you can reload to resume" (reload-safe via `?generation=`).
- Save 422 (e.g. empty positions / bad field) → inline error on the review step; don't lose the edited draft.
- `?generation=<id>` still running on load → resume polling; completed → straight to review.
- Empty draft (0 positions generated) → show a notice; Save disabled until ≥1 position exists (can't add in C — user retries generation or proceeds is blocked).

## 8. Testing

**Unit (vitest)**
- `genFlow.svelte.ts` — prepare (upload→ingest-poll→document_id; matter selection passes through), generate+poll→review with draft, generation-error branch, stuck flag, resume(running/completed). Mock fetch + fake timers (B's `runFlow` test is the template).
- `GenDocumentPicker.svelte` — tab switch; checkbox multi-select of matter files; accumulating uploads; remove from selection; emits the selection list; "N selected" count.
- `GenProgress.svelte` — preparing/generating/done labels; stuck hint; error message.
- `DraftReview.svelte` — renders name/contract_type/description inputs + a `PositionCard` per position with a keep checkbox; unchecking drops a position from the emitted `PlaybookCreate`; Save disabled until name + contract_type + ≥1 kept.
- `new/+page.server.ts` — `load` (matters; `?matter` ingested-only filter; `?generation` fetch); `?/save` action (parses `draft` JSON → POST /playbooks → redirect; 422 → fail with message; rejects empty name/positions).
- BFF proxies — `playbooks/easy/+server.ts` POST (passthrough → generation), `playbooks/easy/[generation_id]/+server.ts` GET (200 passthrough; 502/503/504).

**Live e2e (`tests/playbooks-easy-gen.spec.ts`)** — log in → `/playbooks` → New playbook → upload an NDA (`nda-1-acme-beta.pdf`) → set contract type "NDA" → Generate → wait for review (real worker, ~60–180 s) → assert the draft shows a name + ≥1 position → prune one → Save → land on `/playbooks/{id}` showing the saved playbook. Requires `arq-worker` running. Leaves a saved playbook (no delete endpoint surfaced in Donna; harmless — matches prior precedents). `test.setTimeout(240_000)`.

**Quality bar:** `npm run check` 0/0 (vendor `ERR_MODULE_NOT_FOUND` harmless); eslint clean (no `any`; in-app links/goto carry the disable comment); rebuild `donna-web` + ensure `arq-worker` up before the e2e.

## 9. Follow-ups (committed)

- **D — full positions editor + manual authoring:** edit every position field + add/remove positions (reused in this wizard's Step 3 to upgrade "prune-only" to full editing), plus create-from-scratch (`POST /playbooks`) and edit existing (`PATCH /playbooks/{id}`, `DELETE`).
- Later: run history; KB-file source for pickers; `cited_chunk_ids` → document-panel citations.
