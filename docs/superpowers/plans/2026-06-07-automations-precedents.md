# Automations Slice E — Precedents + Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Precedents (dismiss / promote-to-matter) and project-context Proposals (accept = the one authorized write into a matter's `context_md` / reject) as two new sections on `/automations/review`, plus the three ride-alongs banked from PR #71.

**Architecture:** Extends slice D's SSR page + form actions. New pure parse module `$lib/automations/precedents.ts` + `PrecedentRow.svelte` / `ProposalRow.svelte`; the review server load becomes a parallel 4-fetch (memory · precedents · proposals · matters-for-names) where each new section degrades independently. E2e seeds precedents via SQL (marker `pattern_kind`), then exercises the REAL promote→proposal→accept flow against a scratch matter.

**Tech Stack:** Svelte 5 runes, SvelteKit form actions + `use:enhance`, vitest + @testing-library/svelte, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-07-automations-review-design.md` (PR E half). Branch: `feat/automations-precedents` (current). Pin `0097b01` — NO pin bump. Commit + push per task. Gates per task: `npm run check` 0/0 (vendor stderr harmless), suite-scoped vitest, `npm run lint` fully green.

**⚠️ Interrupt protocol:** the upstream artifacts SHA may arrive mid-execution — the controller will pause at a task boundary; just finish your task cleanly.

**Contract (verified at pin):**
- `GET /api/v1/autonomous/precedents?limit=&offset=` → `{ entries: PrecedentEntryRead[], total_count, limit, offset }` (non-dismissed, newest first; `pattern_kind` free-text; `observed_count` int; `source_session_id` nullable).
- `POST /api/v1/autonomous/precedents/{id}/dismiss` → row. `POST .../promote` body `{ project_id }` (caller must own the project) → `ProjectContextProposalRead` (creates a proposal; NO project write).
- `GET /api/v1/autonomous/project-context-proposals?state=proposed` → `{ proposals: ProjectContextProposalRead[], total_count, limit, offset }` — NOTE the key is `proposals`, NOT `entries`. Fields: `id, user_id, precedent_id, project_id, suggested_md, state (proposed|accepted|rejected), …`.
- `POST .../project-context-proposals/{id}/accept` → appends `suggested_md` to the project's `context_md`. `POST .../{id}/reject`.
- Matters for name resolution: `GET /api/v1/projects` → array with `{ id, name }` (see `automations/new/+page.server.ts:17,32` for the exact fetch+map idiom).
- E2e seeding: `precedent_entries` table = `(id default, user_id, pattern_kind, summary, observed_count default 1, source_session_id nullable, dismissed_at, created_at/updated_at default)`.

---

### Task 1: `$lib/automations/precedents.ts` — types + defensive parses

**Files:**
- Create: `src/lib/automations/precedents.ts`
- Test: `src/lib/automations/precedents.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/precedents.test.ts
import { describe, it, expect } from 'vitest';
import { parsePrecedentList, parseProposalList } from './precedents';

const precedent = (over: Record<string, unknown> = {}) => ({
	id: 'p1',
	user_id: 'u1',
	pattern_kind: 'recurring-clause',
	summary: 'Vendor repeatedly accepts 30-day termination.',
	observed_count: 3,
	source_session_id: 's1',
	dismissed_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

const proposal = (over: Record<string, unknown> = {}) => ({
	id: 'pr1',
	user_id: 'u1',
	precedent_id: 'p1',
	project_id: 'proj1',
	suggested_md: '## Precedent\nVendor accepts 30-day termination.',
	state: 'proposed',
	accepted_at: null,
	rejected_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

describe('parsePrecedentList', () => {
	it('parses entries + total', () => {
		const out = parsePrecedentList({ entries: [precedent()], total_count: 5 });
		expect(out.total).toBe(5);
		expect(out.entries[0]).toMatchObject({
			id: 'p1',
			pattern_kind: 'recurring-clause',
			summary: 'Vendor repeatedly accepts 30-day termination.',
			observed_count: 3,
			source_session_id: 's1'
		});
	});

	it('drops malformed rows; defaults observed_count to 1 when non-numeric', () => {
		const out = parsePrecedentList({
			entries: [precedent(), { id: 1 }, precedent({ id: 'p2', observed_count: 'x' })],
			total_count: 3
		});
		expect(out.entries.map((p) => p.id)).toEqual(['p1', 'p2']);
		expect(out.entries[1].observed_count).toBe(1);
	});

	it('garbage → empty', () => {
		expect(parsePrecedentList(null)).toEqual({ entries: [], total: 0 });
	});
});

describe('parseProposalList', () => {
	it('parses the `proposals` key (not entries) + total', () => {
		const out = parseProposalList({ proposals: [proposal()], total_count: 2 });
		expect(out.total).toBe(2);
		expect(out.proposals[0]).toMatchObject({
			id: 'pr1',
			precedent_id: 'p1',
			project_id: 'proj1',
			state: 'proposed'
		});
		expect(out.proposals[0].suggested_md).toContain('30-day termination');
	});

	it('drops malformed rows, never throws; garbage → empty', () => {
		const out = parseProposalList({ proposals: [proposal(), { nope: 1 }], total_count: 2 });
		expect(out.proposals).toHaveLength(1);
		expect(parseProposalList(undefined)).toEqual({ proposals: [], total: 0 });
	});
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run src/lib/automations/precedents.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// src/lib/automations/precedents.ts
// Defensively-parsed view models for the Review page's Precedents + Proposals
// sections (GET /api/v1/autonomous/{precedents,project-context-proposals}).
// Mirrors memory.ts: drop malformed rows, never throw; free-text fields render
// neutrally downstream.

export interface PrecedentEntry {
	id: string;
	pattern_kind: string;
	summary: string;
	observed_count: number;
	source_session_id: string | null;
	created_at: string | null;
}

export interface PrecedentList {
	entries: PrecedentEntry[];
	total: number;
}

export interface ProposalEntry {
	id: string;
	precedent_id: string;
	project_id: string;
	suggested_md: string;
	state: string;
	created_at: string | null;
}

export interface ProposalList {
	proposals: ProposalEntry[];
	total: number;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parsePrecedentList(raw: unknown): PrecedentList {
	const r = obj(raw);
	const arr = Array.isArray(r.entries) ? r.entries : [];
	const entries = arr
		.map((e): PrecedentEntry | null => {
			const p = obj(e);
			const id = str(p.id);
			const pattern_kind = str(p.pattern_kind);
			const summary = str(p.summary);
			if (!id || !pattern_kind || summary === null) return null;
			return {
				id,
				pattern_kind,
				summary,
				observed_count: typeof p.observed_count === 'number' ? p.observed_count : 1,
				source_session_id: str(p.source_session_id),
				created_at: str(p.created_at)
			};
		})
		.filter((p): p is PrecedentEntry => p !== null);
	return { entries, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}

export function parseProposalList(raw: unknown): ProposalList {
	const r = obj(raw);
	const arr = Array.isArray(r.proposals) ? r.proposals : [];
	const proposals = arr
		.map((e): ProposalEntry | null => {
			const p = obj(e);
			const id = str(p.id);
			const precedent_id = str(p.precedent_id);
			const project_id = str(p.project_id);
			const suggested_md = str(p.suggested_md);
			const state = str(p.state);
			if (!id || !precedent_id || !project_id || suggested_md === null || !state) return null;
			return { id, precedent_id, project_id, suggested_md, state, created_at: str(p.created_at) };
		})
		.filter((p): p is ProposalEntry => p !== null);
	return { proposals, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}
```

- [ ] **Step 4: Verify pass** → 5 passed. **Step 5: Commit**

```bash
npx prettier --write src/lib/automations/precedents.ts src/lib/automations/precedents.test.ts
git add src/lib/automations/precedents.ts src/lib/automations/precedents.test.ts
git commit -m "feat(automations): precedent + proposal types and defensive parses"
git push
```

---

### Task 2: `PrecedentRow.svelte` + `ProposalRow.svelte`

**Files:**
- Create: `src/lib/automations/PrecedentRow.svelte` + `.test.ts`
- Create: `src/lib/automations/ProposalRow.svelte` + `.test.ts`

READ first: `src/lib/automations/MemoryRow.svelte` (+test) — mirror its card structure, two-step confirm, shared `submitFn` enhance-with-invalidate-on-failure pattern, `formatWhen`/`stateChipClass` imports from `display.ts`; `src/lib/automations/ScheduleForm.svelte:147` for the MatterPicker embed (`<MatterPicker {matters} bind:selectedId={projectId} placement="down" />`); `src/lib/matters/MatterPicker.svelte` props.

**PrecedentRow contract** (props: `precedent: PrecedentEntry`, `matters: { id: string; name: string }[]`, `error?: string | null`):
- Renders: neutral `pattern_kind` chip (use `stateChipClass`'s neutral branch — call it with the pattern_kind; unknown strings get the neutral style by design), `summary`, `seen {observed_count}×`, date via `formatWhen`, "From run" link when `source_session_id`.
- **Dismiss**: two-step ("Dismiss precedent?" → Confirm dismiss / Cancel; form → `?/dismissPrecedent`, hidden `id`).
- **Promote…**: toggle button expands a promote panel: `<MatterPicker {matters} bind:selectedId placement="down" />` + a form → `?/promote` with hidden `id` + hidden `project_id` bound to the picked matter; the "Create proposal" submit is `disabled` until a matter is selected; Cancel collapses.
- `error` → `role="alert"`.

Tests (mirror MemoryRow test style; matters fixture `[{ id: 'proj1', name: 'Acme MSA' }]`):
1. renders chip/summary/"seen 3×"/run-link; Dismiss + Promote… visible.
2. two-step dismiss confirm shows/cancels.
3. Promote… expands: MatterPicker trigger present (`getByRole('button', { name: 'Choose matter' })`), "Create proposal" disabled; pick Acme MSA (open picker → click option) → enabled; hidden `project_id` input value is `proj1`. Cancel collapses.
4. error alert renders.

**ProposalRow contract** (props: `proposal: ProposalEntry`, `matterName: string | null`, `error?: string | null`):
- Renders: "For matter: {matterName ?? proposal.project_id}", `suggested_md` inside a bordered `<pre class="... whitespace-pre-wrap ...">` block, date.
- **Accept**: two-step ("Add this to the matter's context?" → Confirm accept / Cancel; form → `?/acceptProposal`, hidden `id`). **Reject**: single-step (form → `?/rejectProposal`, hidden `id`).
- `error` → `role="alert"`.

Tests: renders name + md + Accept/Reject; falls back to project_id when matterName null; two-step accept; error alert. (4 cases.)

- [ ] Steps: failing tests → verify fail → implement both → `npx vitest run src/lib/automations/PrecedentRow.svelte.test.ts src/lib/automations/ProposalRow.svelte.test.ts` green → `npm run check` 0/0 → commit:

```bash
npx prettier --write src/lib/automations/PrecedentRow.svelte src/lib/automations/PrecedentRow.svelte.test.ts src/lib/automations/ProposalRow.svelte src/lib/automations/ProposalRow.svelte.test.ts
git add src/lib/automations/PrecedentRow.svelte src/lib/automations/PrecedentRow.svelte.test.ts src/lib/automations/ProposalRow.svelte src/lib/automations/ProposalRow.svelte.test.ts
git commit -m "feat(automations): PrecedentRow (dismiss/promote via MatterPicker) + ProposalRow (accept/reject)"
git push
```

---

### Task 3: Review server — 4-fetch load + 4 new actions + ride-alongs

**Files:**
- Modify: `src/routes/(app)/automations/review/+page.server.ts`
- Modify: `src/lib/automations/memory.ts` (export `REVIEW_PAGE_SIZE = 50`)
- Test: `src/routes/(app)/automations/review/page.server.test.ts` (extend)

READ the current server file + test harness first. Changes:

1. **Ride-along (page-size constant):** `export const REVIEW_PAGE_SIZE = 50;` in `memory.ts`; server imports it (replacing `const LIMIT = 50`).
2. **Ride-along (stale offset):** in `load`, after parsing the memory list: `if (offset > 0 && offset >= total) throw redirect(303, `?state=${state}&offset=${Math.max(0, Math.floor(Math.max(total - 1, 0) / REVIEW_PAGE_SIZE) * REVIEW_PAGE_SIZE)}`);` (import `redirect` from `@sveltejs/kit`).
3. **Load widening:** the opted-in branch becomes a `Promise.all` of: `unreadCount`, memory fetch (unchanged), `lqFetch(event, '/api/v1/autonomous/precedents?limit=50&offset=0')`, `lqFetch(event, '/api/v1/autonomous/project-context-proposals?state=proposed')`, `lqFetch(event, '/api/v1/projects')`. Each NEW section degrades independently: return keys `precedents: PrecedentList | null` (null on !ok/parse-fail), `proposals: ProposalList | null` (same), `matters: { id, name }[]` (empty on failure — map via the `new/+page.server.ts:32` idiom). Memory keys keep their exact current shape (`error: true` etc. — do NOT restructure; D's page tests must keep passing untouched except where this task's new assertions extend them).
4. **Actions:** add `dismissPrecedent` (POST `/api/v1/autonomous/precedents/{id}/dismiss`, body `{}`), `promote` (reads `id` + `project_id`, both required else `fail(400, { error: 'Pick a matter first.', id })`; POST `.../precedents/{id}/promote` body `{ project_id }`), `acceptProposal` (POST `/api/v1/autonomous/project-context-proposals/{id}/accept`, body `{}`), `rejectProposal` (`.../reject`, body `{}`). Shared mapping (same as the memory actions): 403 → 'Automations are turned off.'; 404 → `fail(404, { error: 'This item no longer exists.', id })`; **422/400 → ride-along: `const detail = await errorDetail(res); return fail(res.status, { error: detail || 'Could not apply the change.', id });`** (import `errorDetail` from `$lib/server/loadJson`); other → 502 'Could not apply the change.' with `id`. Success: `promote` returns `{ ok: true, promoted: true }` (the page shows "Proposal created below"); others `{ ok: true }`.
5. **Ride-along (422 on memory actions):** apply the same `errorDetail` 422 branch to the existing keep/dismiss/delete actions.

Test extensions (mirror the existing harness): precedents+proposals+matters parsed into the load shape; each new fetch failing independently nulls only its key; stale-offset redirect (offset 50, total 10 → 303 to offset 0); promote missing project_id → 400 with id; promote success body `{ project_id }`; accept 422 with `{"detail":"context document is full"}` → fail 422 surfacing the detail; dismissPrecedent/rejectProposal happy paths; memory keep 422 surfaces detail. (~10 new cases.)

- [ ] Steps: failing tests → fail → implement → suite green (`npx vitest run "src/routes/(app)/automations/review/page.server.test.ts"`) → check 0/0 → commit:

```bash
git add src/lib/automations/memory.ts "src/routes/(app)/automations/review/+page.server.ts" "src/routes/(app)/automations/review/page.server.test.ts"
git commit -m "feat(automations): review server — precedents/proposals/matters load, promote/accept actions, offset clamp + 422 detail"
git push
```

---

### Task 4: Review page — Precedents + Proposals sections

**Files:**
- Modify: `src/routes/(app)/automations/review/+page.svelte`
- Test: `src/routes/(app)/automations/review/page.svelte.test.ts` (extend)
- Modify: `src/routes/(app)/about/automations/+page.svelte` (one sentence)

Page changes (READ the current file; keep the Memory section untouched apart from the pagination literals):

1. Replace the two hardcoded `50`s in the pagination block with `REVIEW_PAGE_SIZE` (import from `$lib/automations/memory`), and the `total > 50` guard likewise.
2. After the Memory section (inside the gate), append:

```svelte
<h2 class="mt-8 mb-3 text-base font-medium text-mlq-text">Precedents</h2>
{#if data.precedents === null}
	<p role="alert" class="text-sm text-mlq-error">Couldn't load precedents — reload to retry.</p>
{:else if data.precedents.entries.length === 0}
	<p class="text-sm text-mlq-muted">No precedents yet. Recurring patterns across runs appear here.</p>
{:else}
	<div class="flex flex-col gap-3">
		{#each data.precedents.entries as p (p.id)}
			<PrecedentRow precedent={p} matters={data.matters} error={rowError(p.id)} />
		{/each}
	</div>
{/if}

<h2 class="mt-8 mb-3 text-base font-medium text-mlq-text">Proposals</h2>
{#if form && 'promoted' in form && form.promoted}
	<p class="mb-2 text-sm text-mlq-success">Proposal created below.</p>
{/if}
{#if data.proposals === null}
	<p role="alert" class="text-sm text-mlq-error">Couldn't load proposals — reload to retry.</p>
{:else if data.proposals.proposals.length === 0}
	<p class="text-sm text-mlq-muted">No pending proposals. Promote a precedent to create one.</p>
{:else}
	<div class="flex flex-col gap-3">
		{#each data.proposals.proposals as pr (pr.id)}
			<ProposalRow proposal={pr} matterName={matterName(pr.project_id)} error={rowError(pr.id)} />
		{/each}
	</div>
{/if}
```

with `const matterName = (id: string) => data.matters.find((m) => m.id === id)?.name ?? null;` in the script (plus the two imports).
3. **About touch:** in `src/routes/(app)/about/automations/+page.svelte`, extend the Review sentence (added in PR #71: "Proposed memories can be kept or dismissed right on the receipt, or managed in the **Review** view.") with: " The Review view also lists <strong>precedents</strong> — recurring patterns the agent noticed — which you can dismiss or promote into a matter's context (you approve the final write)."

Test extensions (~6 cases): precedents section renders rows; precedents null → section alert (memory section unaffected); proposals empty copy; proposal row gets resolved matter name; promote success note renders on `form.promoted`; pagination uses REVIEW_PAGE_SIZE (sanity: existing pagination tests still pass after the constant swap).

- [ ] Steps: failing tests → fail → implement → `npx vitest run "src/routes/(app)/automations/review/page.svelte.test.ts"` + check 0/0 + lint green → commit:

```bash
git add "src/routes/(app)/automations/review/+page.svelte" "src/routes/(app)/automations/review/page.svelte.test.ts" "src/routes/(app)/about/automations/+page.svelte"
git commit -m "feat(automations): Precedents + Proposals sections on Review; About mention"
git push
```

---

### Task 5: Live e2e — `tests/automations-precedents.spec.ts`

**Files:**
- Create: `tests/automations-precedents.spec.ts`

READ `tests/automations-memory-review.spec.ts` first — reuse its `sql()` helper shape (env names verified there: `POSTGRES_USER=lq_ai`, `POSTGRES_DB=lq_ai`), login helper, and row-scoping idioms. Marker: `pattern_kind = 'e2e-precedent'`.

Helpers:

```ts
function seedPrecedent(summary: string): void {
	sql(
		`INSERT INTO precedent_entries (user_id, pattern_kind, summary, observed_count)
		 SELECT id, 'e2e-precedent', '${summary}', 3 FROM users WHERE email = '${process.env.DONNA_E2E_EMAIL}'`
	);
}
function cleanupSeeds(): void {
	// proposals cascade from their precedent? VERIFY: read 0041's FK ondelete for precedent_id.
	// If not CASCADE, delete proposals whose precedent_id is in the marker set FIRST, then precedents.
	sql(
		`DELETE FROM project_context_proposals WHERE precedent_id IN (SELECT id FROM precedent_entries WHERE pattern_kind = 'e2e-precedent')`
	);
	sql(`DELETE FROM precedent_entries WHERE pattern_kind = 'e2e-precedent'`);
}
```

Scratch matter: create via Playwright `request` against the BFF or directly against the api with a token — SIMPLEST: drive the existing matters UI? No — use the api: POST `http://localhost:18000/api/v1/projects` with a bearer token obtained via `/api/v1/auth/login` in a `test.beforeAll` `request` call (this pattern may already exist in a spec — grep `auth/login` in tests/; reuse if so). Name it `E2E Precedents ${Date.now()}`. Delete it in `finally` via `DELETE /api/v1/projects/{id}`.

Tests (all `try/finally → cleanupSeeds()` + matter deletion):
1. **Dismiss:** seed precedent A (unique summary) → `/automations/review` → Precedents section shows A (chip `e2e-precedent`, "seen 3×") → two-step Dismiss → A leaves the list.
2. **Promote → proposal → accept writes context:** seed precedent B → Promote… → pick the scratch matter in the MatterPicker → Create proposal → "Proposal created below." + Proposals section shows a row "For matter: E2E Precedents …" → capture the rendered `suggested_md` text → two-step Accept → row leaves the list. Then fetch the matter via the api (`GET /api/v1/projects/{id}` with the token) and assert its `context_md` contains a distinctive substring of the captured suggested_md (pick ~20 chars from its middle; normalize whitespace).
3. **Reject:** seed precedent C → promote to the scratch matter → Reject on the proposal row → row leaves; matter `context_md` unchanged (assert the substring from C's summary is absent).

- [ ] **Step 0:** verify the FK `ondelete` for `project_context_proposals.precedent_id` in `vendor/lq-ai/api/alembic/versions/0041_project_context_proposals.py` (read-only) and adjust `cleanupSeeds()` ordering/comment accordingly.
- [ ] **Step 1:** stack up + rebuild web (`set -a; . ./.env; set +a; docker compose up -d --build donna-web`); verify healthy.
- [ ] **Step 2:** write the spec; run `npx playwright test tests/automations-precedents.spec.ts` → 3 passed. Real frontend bugs flushed → fix minimally + report; never paper over.
- [ ] **Step 3:** `npm run check` 0/0; `npm run lint` green; commit:

```bash
npx prettier --write tests/automations-precedents.spec.ts
git add tests/automations-precedents.spec.ts
git commit -m "test(automations): live e2e — precedent dismiss/promote, proposal accept writes matter context"
git push
```

---

### Task 6: Full verification

- [ ] `npm run check` → 0/0 · `npx vitest run` → all pass (report count; baseline 1247) · `npm run lint` → fully green.
- [ ] Stack up; `npx playwright test tests/automations-precedents.spec.ts tests/automations-memory-review.spec.ts tests/about.spec.ts` → all pass.
- [ ] Live browse `/automations/review`: three sections render; promote flow by hand once.
- [ ] Commit any fixes; push.

## After the plan completes

Outer loop: whole-branch Opus review → PR → user merges → **Automations segment COMPLETE (A–G + D/E)**. Pending upstream SHAs (artifacts, skill-registry) slot in per the interrupt protocol.
