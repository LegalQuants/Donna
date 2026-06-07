# Automations Slice D — Memory Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/automations/review` queue to keep / edit-on-keep / dismiss / delete the agent's proposed memories, plus the three banked receipt-page leftovers (inline keep/dismiss, memories overflow note, last-known-good poll retention).

**Architecture:** SSR page + form actions (house pattern — no BFF proxies; review is not a live view). New pure parse module `$lib/automations/memory.ts` + `MemoryRow.svelte`; the receipt page gains two actions and a widened memories payload. E2e seeds deterministically via SQL (`docker compose exec postgres psql`) because memory creation is run-internal (GET-only API; dev DB verified empty 2026-06-07).

**Tech Stack:** Svelte 5 runes, SvelteKit form actions + `use:enhance`, vitest + @testing-library/svelte, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-07-automations-review-design.md` (PR D half). Branch: `feat/automations-memory-review` (current). Pin `0097b01` — NO pin bump, NO `gen:api`. Commit + push per task. Gates per task: `npm run check` 0/0 (vendor `ERR_MODULE_NOT_FOUND` stderr harmless), suite-scoped vitest; `npm run lint` must stay FULLY green (prettier + eslint 0 — format new files with prettier).

**Contract (verified at pin):** `GET /api/v1/autonomous/memory?state=proposed|kept|dismissed&limit=&offset=` → `{ entries: AutonomousMemoryRead[], total_count, limit, offset }` (newest first; `state` typed enum; `category` free-text). `POST /api/v1/autonomous/memory/{id}/keep` body `{ content?: string|null }` (content ⇒ edit-on-keep) → row. `POST .../dismiss` → row. `DELETE .../{id}` → **200**. 403 = automations opt-in off; 404 = gone.

---

### Task 1: `$lib/automations/memory.ts` — types + defensive parse

**Files:**

- Create: `src/lib/automations/memory.ts`
- Test: `src/lib/automations/memory.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/memory.test.ts
import { describe, it, expect } from 'vitest';
import { parseMemoryList, MEMORY_STATES, type MemoryEntry } from './memory';

const entry = (over: Record<string, unknown> = {}) => ({
	id: 'm1',
	user_id: 'u1',
	state: 'proposed',
	category: 'workflow',
	content: 'Prefers concise summaries.',
	source_session_id: 's1',
	kept_at: null,
	deleted_at: null,
	created_at: '2026-06-07T09:00:00Z',
	updated_at: '2026-06-07T09:00:00Z',
	...over
});

describe('parseMemoryList', () => {
	it('parses a well-formed list with total', () => {
		const out = parseMemoryList({ entries: [entry()], total_count: 7, limit: 50, offset: 0 });
		expect(out.total).toBe(7);
		expect(out.entries).toHaveLength(1);
		const m = out.entries[0] as MemoryEntry;
		expect(m).toMatchObject({
			id: 'm1',
			state: 'proposed',
			category: 'workflow',
			content: 'Prefers concise summaries.',
			source_session_id: 's1'
		});
		expect(m.created_at).toBe('2026-06-07T09:00:00Z');
	});

	it('drops malformed rows, never throws', () => {
		const out = parseMemoryList({
			entries: [entry(), { id: 42 }, 'junk', entry({ id: 'm2', content: 7 })],
			total_count: 4
		});
		expect(out.entries.map((m) => m.id)).toEqual(['m1']);
	});

	it('unknown state strings survive (free-text-safe rendering downstream)', () => {
		const out = parseMemoryList({ entries: [entry({ state: 'weird' })], total_count: 1 });
		expect(out.entries[0].state).toBe('weird');
	});

	it('garbage input → empty result', () => {
		expect(parseMemoryList(null)).toEqual({ entries: [], total: 0 });
		expect(parseMemoryList({ entries: 'no' })).toEqual({ entries: [], total: 0 });
	});

	it('exports the canonical state filter list', () => {
		expect(MEMORY_STATES).toEqual(['proposed', 'kept', 'dismissed']);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/automations/memory.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/automations/memory.ts
// Defensively-parsed view model for the autonomous memory review queue
// (GET /api/v1/autonomous/memory). Mirrors the parsing style of findings.ts:
// drop malformed rows, never throw; `state`/`category` kept as plain strings
// so unknown values render neutrally.

export const MEMORY_STATES = ['proposed', 'kept', 'dismissed'] as const;
export type MemoryState = (typeof MEMORY_STATES)[number];

export interface MemoryEntry {
	id: string;
	state: string;
	category: string;
	content: string;
	source_session_id: string | null;
	created_at: string | null;
}

export interface MemoryList {
	entries: MemoryEntry[];
	total: number;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseMemoryList(raw: unknown): MemoryList {
	const r = obj(raw);
	const arr = Array.isArray(r.entries) ? r.entries : [];
	const entries = arr
		.map((e): MemoryEntry | null => {
			const m = obj(e);
			const id = str(m.id);
			const state = str(m.state);
			const category = str(m.category);
			const content = str(m.content);
			if (!id || !state || !category || content === null) return null;
			return {
				id,
				state,
				category,
				content,
				source_session_id: str(m.source_session_id),
				created_at: str(m.created_at)
			};
		})
		.filter((m): m is MemoryEntry => m !== null);
	return { entries, total: typeof r.total_count === 'number' ? r.total_count : 0 };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/automations/memory.test.ts` → 5 passed.
- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/automations/memory.ts src/lib/automations/memory.test.ts
git add src/lib/automations/memory.ts src/lib/automations/memory.test.ts
git commit -m "feat(automations): memory list types + defensive parse"
git push
```

---

### Task 2: `MemoryRow.svelte` — one queue row with state-dependent actions

**Files:**

- Create: `src/lib/automations/MemoryRow.svelte`
- Test: `src/lib/automations/MemoryRow.svelte.test.ts`

The row renders the entry + actions wired as **page-level form actions** (`?/keep`, `?/dismiss`, `?/delete`) — the component contains the `<form>`s; the page provides the actions. Read `src/lib/automations/ScheduleRow.svelte` first for the house two-step-delete + `use:enhance` idiom and copy its structure.

Behavior contract:

- Always: state chip (copy `stateChipClass` from `RunResults.svelte` — extract it into `memory.ts`? NO — keep duplication out: **move** `stateChipClass` into `$lib/automations/display.ts` and import it in BOTH RunResults and MemoryRow; display.ts already exists for shared formatting), free-text-safe `category` badge, `content`, created date via the existing date helper in `display.ts` (read it; reuse `formatWhen` if exported there or in `NotificationRow`'s source), "From run" link to `/automations/{source_session_id}` when set.
- `state === 'proposed'`: buttons **Keep** (form → `?/keep`, hidden `id`), **Edit & keep** (toggles a textarea seeded with `content`; its form posts `?/keep` with hidden `id` + the textarea named `content`; Cancel collapses), **Dismiss** (form → `?/dismiss`).
- `state === 'kept' | 'dismissed'` (and any unknown state): only **Delete** with two-step confirm ("Delete memory?" → Confirm delete / Cancel; form → `?/delete`).
- `error` prop (string|null) renders a row-scoped `role="alert"`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/MemoryRow.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import MemoryRow from './MemoryRow.svelte';
import type { MemoryEntry } from './memory';

const mem = (over: Partial<MemoryEntry> = {}): MemoryEntry => ({
	id: 'm1',
	state: 'proposed',
	category: 'workflow',
	content: 'Prefers concise summaries.',
	source_session_id: 's1',
	created_at: '2026-06-07T09:00:00Z',
	...over
});

describe('MemoryRow', () => {
	it('proposed: shows chip/category/content, Keep + Edit & keep + Dismiss, and the run link', () => {
		render(MemoryRow, { props: { memory: mem() } });
		expect(screen.getByText('proposed')).toBeInTheDocument();
		expect(screen.getByText('workflow')).toBeInTheDocument();
		expect(screen.getByText('Prefers concise summaries.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Edit & keep' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /from run/i })).toHaveAttribute(
			'href',
			'/automations/s1'
		);
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	it('Edit & keep expands a textarea seeded with the content; Cancel collapses', async () => {
		render(MemoryRow, { props: { memory: mem() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit & keep' }));
		const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
		expect(ta.value).toBe('Prefers concise summaries.');
		expect(ta.name).toBe('content');
		expect(screen.getByRole('button', { name: 'Save & keep' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('textbox')).toBeNull();
	});

	it('kept: two-step delete only', async () => {
		render(MemoryRow, { props: { memory: mem({ state: 'kept' }) } });
		expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(screen.getByText('Delete memory?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Delete memory?')).toBeNull();
	});

	it('unknown state renders neutrally and treats it like kept/dismissed (delete only)', () => {
		render(MemoryRow, { props: { memory: mem({ state: 'weird' }) } });
		expect(screen.getByText('weird')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('row-scoped error renders as alert; no run link when source_session_id null', () => {
		render(MemoryRow, {
			props: { memory: mem({ source_session_id: null }), error: 'This memory no longer exists.' }
		});
		expect(screen.getByRole('alert')).toHaveTextContent('This memory no longer exists.');
		expect(screen.queryByRole('link', { name: /from run/i })).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/automations/MemoryRow.svelte.test.ts` → FAIL.
- [ ] **Step 3: Implement** `MemoryRow.svelte`. Structural sketch (follow ScheduleRow's classes/idioms; forms `method="POST"` + `use:enhance`):

```svelte
<!-- src/lib/automations/MemoryRow.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { stateChipClass } from './display';
	import type { MemoryEntry } from './memory';

	let { memory, error = null }: { memory: MemoryEntry; error?: string | null } = $props();
	let editing = $state(false);
	let confirmingDelete = $state(false);
	const actionable = $derived(memory.state === 'proposed');
</script>

<!-- card: chip + category badge + content + meta row (date · From run link) -->
<!-- proposed: Keep form · Edit & keep toggle (textarea name="content" seeded once on open) · Dismiss form -->
<!-- otherwise: Delete → "Delete memory?" + Confirm delete form / Cancel -->
<!-- {#if error}<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>{/if} -->
```

Also in this task: **move** `stateChipClass` from `RunResults.svelte` into `src/lib/automations/display.ts` (export it; keep the exact class strings), update `RunResults.svelte` to import it, and extend `display.test.ts` with a 2-case test (`proposed` → its class string; unknown → the neutral one). All existing RunResults tests must stay green.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/automations/MemoryRow.svelte.test.ts src/lib/automations/display.test.ts src/lib/automations/RunResults.svelte.test.ts` → all pass.
- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/automations/MemoryRow.svelte src/lib/automations/MemoryRow.svelte.test.ts src/lib/automations/display.ts src/lib/automations/display.test.ts src/lib/automations/RunResults.svelte
git add -A src/lib/automations
git commit -m "feat(automations): MemoryRow with state-dependent actions; share stateChipClass via display.ts"
git push
```

---

### Task 3: Review page server — load + keep/dismiss/delete actions

**Files:**

- Create: `src/routes/(app)/automations/review/+page.server.ts`
- Test: `src/routes/(app)/automations/review/page.server.test.ts`

Read `src/routes/(app)/automations/schedules/+page.server.ts` AND its test first — mirror the load/actions/fail patterns and the test's lqFetch mock harness exactly.

Behavior contract:

- `load`: `state` from `url.searchParams` (must be one of `MEMORY_STATES`, else default `proposed`); `offset` integer ≥ 0 (default 0); fixed `limit = 50`. Fetch `/api/v1/autonomous/memory?state=&limit=50&offset=`; non-OK → return `{ state, offset, error: true, entries: [], total: 0 }` (page-level error rendering — NOT a silent empty list; distinguish from a true empty queue). OK → `parseMemoryList` → `{ state, offset, entries, total }`. Also return `optedIn` the same way the schedules page does (read how it feeds `AutomationsGate` and copy it).
- Actions (`keep`, `dismiss`, `del`): read `id` from the form data (`fail(400)` if missing). `keep` also reads optional `content` — include `{ content }` in the JSON body ONLY when it's a non-empty string after trim. POST (or DELETE for `del`) to the matching endpoint. Map: 403 → `fail(403, { error: 'Automations are turned off.' })`; 404 → `fail(404, { error: 'This memory no longer exists.', id })`; other non-OK → `fail(502, { error: 'Could not update the memory.', id })`. Success → `return { ok: true }`.
- NOTE: name the delete action `del` is NOT house style — schedules uses `delete:` as a key (check the file; `delete` IS valid as an object key). Use `delete` exactly like schedules does.

- [ ] **Step 1: Write the failing tests** — mirror the schedules server-test harness; cover: state defaulting (`?state=junk` → proposed), offset parsing, load error shape, keep WITHOUT content (body has no `content` key), keep WITH content (body `{ content: 'edited' }`), dismiss, delete → DELETE method, 404 mapping with `id` echoed, 403 mapping, missing id → 400. Write the real code in the test file (copy the harness imports/mocks from the schedules test, adapt paths).
- [ ] **Step 2: Run to verify failure** — `npx vitest run "src/routes/(app)/automations/review/page.server.test.ts"` → FAIL.
- [ ] **Step 3: Implement** `+page.server.ts` per the contract (import `parseMemoryList`, `MEMORY_STATES` from `$lib/automations/memory`; `lqFetch` from `$lib/server/lqClient`).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/routes/(app)/automations/review/+page.server.ts" "src/routes/(app)/automations/review/page.server.test.ts"
git add "src/routes/(app)/automations/review"
git commit -m "feat(automations): review queue server — state-filtered load + keep/dismiss/delete actions"
git push
```

---

### Task 4: Review page UI + 5th nav tab

**Files:**

- Create: `src/routes/(app)/automations/review/+page.svelte`
- Test: `src/routes/(app)/automations/review/page.svelte.test.ts`
- Modify: `src/lib/automations/AutomationsNav.svelte` (tabs array)
- Test: `src/lib/automations/AutomationsNav.svelte.test.ts` (extend)

Read `src/routes/(app)/automations/schedules/+page.svelte` (+ its page test if one exists) first; mirror its shell: WorkflowsNav → AutomationsNav → AutomationsGate-wrapped body.

Page contract:

- `AutomationsNav` gains `{ id: 'review', label: 'Review', href: '/automations/review' }` LAST (5 tabs); extend the View type union; nav test gains the new tab case (active state on `/automations/review`).
- Body inside the gate: h2 "Memory"; the `SegmentedControl` (import from `$lib/preferences/SegmentedControl.svelte`, options from `MEMORY_STATES` with capitalized labels, `label="Memory state"`) — `onchange` performs `goto(`?state=${value}`)` (import `goto` from `$app/navigation`; resets offset).
- List: `{#each data.entries as m (m.id)}<MemoryRow memory={m} error={rowError(m.id)} />` where `rowError` reads the page `form` prop (`form?.id === m.id ? form.error : null`).
- Empty states: `data.error` → "Couldn't load memories — reload to retry." (role=alert); else empty entries → state-aware copy ("No proposed memories. Runs propose memories as they work." / "Nothing kept yet." / "Nothing dismissed.").
- Pagination: when `total > limit(50)`: "Showing {offset+1}–{offset+entries.length} of {total}" + Prev/Next as plain `<a href="?state={state}&offset={...}">` links (Prev hidden at 0; Next hidden on last page).
- Page test: render with mocked `$app/state`/`$app/navigation` per house pattern (copy from an existing page.svelte.test.ts in automations), assert: segmented control present, rows render, empty-state copy for proposed, error state, pagination links' hrefs.

- [ ] **Step 1: failing tests** (nav test extension + new page test, real code following the house mock pattern).
- [ ] **Step 2: verify failure.**
- [ ] **Step 3: implement page + nav change.**
- [ ] **Step 4: verify pass** — also run `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`.
- [ ] **Step 5: `npm run check`** → 0/0. **Commit**

```bash
npx prettier --write "src/routes/(app)/automations/review/+page.svelte" "src/routes/(app)/automations/review/page.svelte.test.ts" src/lib/automations/AutomationsNav.svelte src/lib/automations/AutomationsNav.svelte.test.ts
git add "src/routes/(app)/automations/review" src/lib/automations/AutomationsNav.svelte src/lib/automations/AutomationsNav.svelte.test.ts
git commit -m "feat(automations): /automations/review page + Review nav tab"
git push
```

---

### Task 5: Receipt leftover 1+2 — memories total (overflow note) + inline keep/dismiss

**Files:**

- Modify: `src/lib/automations/findings.ts` (`parseRunMemories` → also return total)
- Modify: `src/lib/automations/runOutput.server.ts` (+`memories_total`)
- Modify: `src/lib/automations/RunResults.svelte` (overflow note + inline actions)
- Modify: `src/routes/(app)/automations/[id]/+page.server.ts` (2 new actions)
- Modify: `src/lib/automations/SessionDetail.svelte` + `src/routes/(app)/automations/[id]/+page.svelte` (thread `memoriesTotal`)
- Tests: `src/lib/automations/findings.test.ts`, `runOutput.server.test.ts`, `RunResults.svelte.test.ts`, `src/routes/(app)/automations/[id]/page.server.test.ts`

Sub-changes (TDD each — write the failing assertions first in the respective test file, then implement):

1. **`parseRunMemories(raw)` → `{ memories: RunMemoryItem[], total: number }`** (total from `total_count`, 0 fallback). Update its existing tests + all call sites. `RunMemoryItem` ALSO gains `source_session_id`? NO — not needed on the receipt (the receipt IS the session). Keep the item shape.
2. **`runOutput.server.ts`**: `RunOutput` gains `memories_total: number | null`; set from the parse; null on failure (mirror `findings_total`).
3. **`RunResults.svelte`**: new prop `memoriesTotal: number | null`; when `memoriesTotal !== null && memories && memoriesTotal > memories.length` render `+{memoriesTotal - memories.length} more — review all in <a href="/automations/review">Automations → Review</a>` (match the findings overflow note's classes). Inline actions: for `memory.state === 'proposed'` rows, two small `use:enhance` forms posting to `?/keepMemory` / `?/dismissMemory` with hidden `id` (Keep / Dismiss buttons, `text-xs` like the existing controls). NO edit-on-keep here.
4. **`[id]/+page.server.ts`**: add `export const actions` with `keepMemory` / `dismissMemory` — read `id` (`fail(400)` if missing), POST to `/api/v1/autonomous/memory/{id}/keep` (empty JSON body `{}`) / `.../dismiss`; map 403/404/other exactly as Task 3 does. Success `{ ok: true }`. The page's existing poll/`invalidateAll` refreshes the chip — verify `use:enhance` default behavior calls `update()` (it does) and the SSR load re-fetches memories.
5. **Threading:** `[id]/+page.svelte` passes `initialMemoriesTotal={data.memories_total}`; `SessionDetail.svelte` accepts it, derives like the others, passes `memoriesTotal` to `RunResults`. The poll proxy (find where the 2s poll endpoint builds its payload — `src/routes/(app)/automations/[id]/+server.ts` or similar; locate via `grep -rn "loadRunOutput" src/routes`) already spreads `loadRunOutput` output, so `memories_total` flows once added to `RunOutput`; update `pollSession.svelte.ts` to carry `memoriesTotal` state parsed from the payload (mirror `findingsTotal`).

- [ ] Steps: failing tests → verify fail → implement → `npx vitest run src/lib/automations tests` for the touched suites + `npm run check` 0/0 → commit:

```bash
git add -A src/lib/automations "src/routes/(app)/automations/[id]"
git commit -m "feat(automations): receipt memories — overflow note + inline keep/dismiss"
git push
```

---

### Task 6: Receipt leftover 3 — last-known-good poll retention

**Files:**

- Modify: `src/lib/automations/pollSession.svelte.ts`
- Modify: `src/lib/automations/SessionDetail.svelte` (only if its deriveds need it)
- Test: `src/lib/automations/pollSession.svelte.test.ts` (extend)

Current behavior (read both files first): a tick whose proxy payload degrades (e.g. backend findings fetch failed → `findings: null`) overwrites good state with nulls; and `SessionDetail` switches from `initial*` to `live.*` wholesale once `live.session` is set.

Change in `pollSession.svelte.ts` `tick()`: when applying a successful poll payload, only overwrite `findings`/`findingsTotal`/`memories`/`memoriesTotal` when the incoming value is **non-null**; null incoming + non-null current → keep current (last-known-good). `session`/`receipt` keep existing semantics (they come from the same response and are the poll's whole point). Transport failure semantics (tick stop on `!res.ok`) are NOT in scope to change.

- [ ] **Step 1: failing test** — extend the existing poll test harness (read it; it drives ticks with mocked fetch): tick 1 returns findings+memories; tick 2 returns the session still running but `findings: null, memories: null`; assert `poll.findings`/`poll.memories` still hold tick-1 values. Plus: tick 2 with NEW non-null values replaces them.
- [ ] **Step 2: verify fail.** **Step 3: implement.** **Step 4: suite green** (`npx vitest run src/lib/automations/pollSession.svelte.test.ts src/lib/automations/SessionDetail.svelte.test.ts`).
- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/pollSession.svelte.ts src/lib/automations/pollSession.svelte.test.ts src/lib/automations/SessionDetail.svelte 2>/dev/null
git commit -m "fix(automations): poll retains last-known-good results on degraded payloads"
git push
```

---

### Task 7: Live e2e — `tests/automations-memory-review.spec.ts`

**Files:**

- Create: `tests/automations-memory-review.spec.ts`

**Seeding (resolved at plan time):** the dev DB has ZERO memories and the API is GET-only (runs create memories internally) → seed via SQL. In the spec file use a helper:

```ts
import { execSync } from 'node:child_process';

const SEED_CATEGORY = 'e2e-memory-review';

function sql(q: string): string {
	// -T: no TTY. Credentials: the postgres service trusts local connections with
	// the POSTGRES_USER from .env (verify once with:
	//   docker compose exec postgres env | grep POSTGRES_USER ).
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

function seedMemory(content: string): void {
	sql(
		`INSERT INTO autonomous_memory (user_id, state, category, content)
		 SELECT id, 'proposed', '${SEED_CATEGORY}', '${content}' FROM users WHERE email = '${process.env.DONNA_E2E_EMAIL}'`
	);
}

function cleanupSeeds(): void {
	sql(`DELETE FROM autonomous_memory WHERE category = '${SEED_CATEGORY}'`);
}
```

⚠️ Verify the actual env var names for db user/db (`POSTGRES_USER`/`POSTGRES_DB` in `.env`; if the compose uses different names, adapt). Run the INSERT once manually before writing assertions, then `cleanupSeeds()`.

Tests (login helper copied from `tests/about.spec.ts`; wrap in `try/finally` calling `cleanupSeeds()`):

1. **Queue round-trip:** seed 2 memories (unique `Date.now()`-suffixed contents). Go to `/automations/review` → both visible under Proposed with `e2e-memory-review` category badges. Memory A: **Edit & keep** → textarea → replace content with an `-EDITED` suffix → Save & keep → row leaves the Proposed view; switch filter to **Kept** → A present with the edited content → two-step **Delete** → gone. Memory B: **Dismiss** → leaves Proposed; filter **Dismissed** → present → Delete → gone.
2. **Nav + gate:** the Review tab is active on the page (`aria-current`); (opt-in is already on for the fixture admin — assert the gate is NOT shown).
3. **Receipt integration:** seed memory C **with a `source_session_id`** of an existing completed session (fetch one: `sql("SELECT id FROM autonomous_sessions WHERE status='completed' LIMIT 1")` — the dev DB has several). Open `/automations/{that-id}` → "Memories this run proposed" shows C with **Keep**/**Dismiss** buttons → click Keep → chip flips to `kept` (and buttons disappear). Clean up via SQL.

- [ ] **Step 1: write the spec.** **Step 2: stack up + rebuild web** (`set -a; . ./.env; set +a; docker compose up -d --build donna-web`). **Step 3: run** `npx playwright test tests/automations-memory-review.spec.ts` → all pass (fix the frontend if the e2e flushes real bugs — report them).
- [ ] **Step 4: Commit**

```bash
npx prettier --write tests/automations-memory-review.spec.ts
git add tests/automations-memory-review.spec.ts
git commit -m "test(automations): live e2e for the memory review queue + receipt integration"
git push
```

---

### Task 8: Full verification

- [ ] `npm run check` → 0 ERRORS / 0 WARNINGS.
- [ ] `npx vitest run` → all pass (report count; baseline was 1183 + this slice's new tests).
- [ ] `npm run lint` → fully green (prettier clean + eslint 0).
- [ ] Stack up; `npx playwright test tests/automations-memory-review.spec.ts tests/automations-run-results.spec.ts tests/about.spec.ts` → all pass (run-results re-verified because Task 5/6 touched its surfaces).
- [ ] Live browse: `/automations/review` (all three filters), a receipt with seeded memory, confirm overflow note absent at <200.
- [ ] Commit any fixes; push.

## After the plan completes

Outer loop: whole-branch Opus review → PR → user merges → slice E plan (`feat/automations-precedents` off updated `main`). If the LQ-AI artifacts/registry SHAs arrive mid-execution: pause at the next task boundary per the spec's interrupt protocol.
