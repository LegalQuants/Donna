# Donna — Playbooks browse + detail (P5-2 slice A, read-only)

**Date:** 2026-05-30 · **Branch:** `playbooks-browse` · **PR target:** `main` · **Backend pin:** `438198c` (no backend change)

## 1. Background

P5 Workflows = Skills (shipped: authoring + attach + applied-skills confirmation) + **Playbooks**. A playbook is a structured negotiation-position library plus an executor that compares a contract against it and drafts redlines. This is the first Playbooks slice.

**Spike findings (live, pin `438198c`, 2026-05-30):**

- `Playbook = { id, name, contract_type, description?, version, positions: Position[] }`.
- `Position = { id, issue, description?, standard_language, fallback_tiers: FallbackTier[], redline_strategy?, severity_if_missing: 'critical'|'high'|'medium'|'low', detection_keywords: string[], detection_examples: string[], position_order }`.
- **5 built-in playbooks** are seeded (`created_by: null`): DPA-GDPR (8 positions), MSA-Commercial-Purchase, MSA-SaaS, NDA-Mutual, NDA-Unilateral. `standard_language` per position is long (~1.7k chars).
- Endpoints: `GET /api/v1/playbooks` (list; positions NOT inlined), `GET /api/v1/playbooks/{id}` (with positions). Visibility: admins see all; non-admins see own + built-ins (`created_by IS NULL`). (Write/execute/easy-gen endpoints exist but are out of scope here.)

## 2. Decomposition (agreed)

P5-2 Playbooks ships as PR-sized slices, in order:

- **A — Browse + detail (THIS slice, read-only).** The `/playbooks` library + `/playbooks/[id]` positions view.
- **B — Apply (execute) a playbook against a document + results.** `POST /playbooks/{id}/execute {target_document_id, project_id?}` → poll `GET /playbook-executions/{id}` → per-position results + redlines. (Carries the admin-only-execute constraint + a live results-shape spike.)
- **C — Easy generation wizard ("generate from prior agreements").** `POST /playbooks/easy {document_ids[], contract_type}` → poll `GET /playbooks/easy/{generation_id}` → edit the `draft_playbook` → save via `POST /playbooks`.
- **D — Manual authoring/edit** (positions editor; likely folds into C).

**A is groundwork.** The components it introduces are explicitly built for reuse downstream (see §6). B/C/D are committed follow-ups, not hypotheticals.

## 3. Goal

Give the 5 built-in playbooks a home in Donna's restrained, document-forward design language: a browsable `/playbooks` index grouped by contract family, and a `/playbooks/[id]` detail page that renders each negotiation position primary-first (substance shown, matcher internals collapsed).

## 4. Scope

**In scope**

- `/playbooks` route — SSR `load` → `GET /api/v1/playbooks`; grouped-by-contract-family list (built-ins only).
- `/playbooks/[id]` route — SSR `load` → `GET /api/v1/playbooks/{id}`; header + positions rendered primary-first with collapsible matcher internals.
- Sidebar "Playbooks" entry.
- Reusable components under `src/lib/playbooks/` (types, grouping helper, `PlaybookRow`, `SeverityBadge`, `PositionCard`).

**Out of scope (later slices)**

- Any write path; execute/apply + results (B); easy-generation wizard, positions editor, manual authoring (C/D); a "Your playbooks" section (no user playbooks until creation lands in C); an "Apply" affordance on the detail page (ships in B — A adds no dead control).

## 5. Routes & data flow (no new BFF proxy)

Idiomatic SvelteKit SSR, mirroring `/matters` and `/skills` (server `load` calls `lqFetch` directly — no client-fetch proxy endpoints).

- **`src/routes/(app)/playbooks/+page.server.ts`** — `load`: `lqFetch(event, '/api/v1/playbooks')`; on non-OK throw `error(502, …)`; return `{ playbooks }` (typed `Playbook[]`; positions absent in the list — that's expected).
- **`src/routes/(app)/playbooks/+page.svelte`** — group via `groupByContractFamily`, render a section per family with `PlaybookRow`s. Empty list → "No playbooks available."
- **`src/routes/(app)/playbooks/[id]/+page.server.ts`** — `load`: `lqFetch(event, '/api/v1/playbooks/${params.id}')`; 404 → `error(404, 'Playbook not found.')`, other non-OK → `error(502, …)`; return `{ playbook }` (with `positions`).
- **`src/routes/(app)/playbooks/[id]/+page.svelte`** — header (name, contract_type, version, description, position count) + positions sorted by `position_order`, each a `PositionCard`. Zero positions → "No positions defined."
- **Sidebar:** add a "Playbooks" link (lucide `Library`) near Skills/Knowledge/Matters in the existing nav component.

## 6. Components (`src/lib/playbooks/`) — built for reuse

| Unit                   | Responsibility                                                                                                                                                                                                                                                                | Reused by                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `types.ts`             | Re-export `Playbook`, `Position`, `FallbackTier` from the generated `backend.d.ts` (`components['schemas'][...]`); no hand-typing.                                                                                                                                            | B (execution targets a playbook+positions), C (draft_playbook is a PlaybookCreate shape) |
| `contractFamily.ts`    | Pure `groupByContractFamily(playbooks: Playbook[])` → ordered `{ family, playbooks }[]`. Family = the segment before the first `-` in `contract_type` (`NDA`, `MSA`, `DPA`), else the raw value; stable ordering.                                                             | the index; C's "pick a contract type" affordance can reuse the family mapping            |
| `SeverityBadge.svelte` | `severity_if_missing` → a colored pill. critical → red, high → amber, medium → muted, low → subtle, via P0 `mlq` tokens (introduce a minimal severity token only if none fits).                                                                                               | B's results (per-position outcome severity), C/D editor                                  |
| `PositionCard.svelte`  | Render one `Position` primary-first: issue + `SeverityBadge` + description + standard-language block always visible; a local `expanded` boolean toggles a "Show matching details" region (fallback tiers, redline strategy, detection keywords as chips, detection examples). | B's results view (position + matched evidence), C/D draft editor (read view)             |
| `PlaybookRow.svelte`   | One index row: name + position count; links to `/playbooks/[id]`.                                                                                                                                                                                                             | the index; possibly C's generated-playbook list                                          |

Each is small, single-responsibility, and independently testable.

## 7. Visual language

Donna serif/gray, minimal chrome. Index: a section header per contract family (small uppercase label) over bordered rows. Detail: a document-style header, then a vertical stack of `PositionCard`s. `SeverityBadge` is the only color accent (critical red is the strongest). Matcher internals are visually secondary (muted, system-font, behind the toggle) so the page reads as substance-first.

## 8. Testing

**Unit (vitest)**

- `contractFamily.test.ts` — family extraction (`NDA-unilateral` → `NDA`, `MSA-SaaS` → `MSA`, `DPA-GDPR` → `DPA`), grouping, stable order, unknown/edge `contract_type`.
- `SeverityBadge.svelte.test.ts` — each of the four levels renders its label + the right token class.
- `PositionCard.svelte.test.ts` — primary fields (issue, severity, standard language) shown by default; matcher internals hidden until the toggle is clicked, then visible (fallback tiers, redline strategy, keyword chips, examples); positions with no internals don't show an empty toggle region.
- `PlaybookRow.svelte.test.ts` — renders name + position count; links to the correct `/playbooks/{id}`.
- `+page.server.ts` loads (index + detail) — mock `lqFetch` (the matters/skills server-test pattern): index returns the list; detail returns the playbook; detail 404 throws `error(404)`; non-OK throws 502.

**Live e2e (`tests/playbooks-browse.spec.ts`)**

- Log in → go to `/playbooks` → assert the grouped built-ins are present (e.g. a "DPA" group with "DPA — GDPR (controller-to-processor)").
- Click into "DPA — GDPR" → detail shows 8 positions with severity badges; the first position's standard language is visible; expanding "Show matching details" reveals keywords/fallback tiers.
- **Read-only ⇒ no teardown** (creates no data; safe on the shared admin account).

**Quality bar:** `npm run check` = 0 errors, 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless); eslint clean on touched files (no `any`); rebuild `donna-web` before the live e2e.

## 9. Follow-ups (committed, not hypothetical)

- **B — apply + results:** reuses `types`, `SeverityBadge`, `PositionCard`. Spike the live `PlaybookExecution.results` shape (run one real execution) before scoping. Handle the admin-only-execute constraint (built-ins not executable by non-admins in v0.3) — surface honestly (e.g. gate the Apply affordance to permitted playbooks, or fork-to-own first). Document picker draws on matter docs / KB files (P4-3a/P4-3b).
- **C — easy-gen wizard:** document selection → generation polling (like KB ingestion polling, P4-3b) → draft `PositionCard`/editor → save. **D** (manual authoring) likely folds in here.
