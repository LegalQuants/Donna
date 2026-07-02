# Fiduciary Slice 6-lean — Contextual Capability Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help users discover the fiduciary features with two small, one-time, dismissable in-context hints — a reusable hand-rolled callout primitive backed by a localStorage-persisted dismissal store.

**Architecture:** A rune-store singleton (`fiduciary/hints.svelte.ts`, mirroring `models/store.svelte.ts`) holds a `Set<string>` of dismissed hint ids in `localStorage['donna.dismissedHints']`. A tiny `fiduciary/Hint.svelte` callout (styled like `ConnectedBanner`, with a `×`) renders its children unless the id is dismissed. Two hints are wired at single mount sites: a trust-pill nudge in the chat page (gated on a receipt existing) and an authoritative-sources nudge on the research page.

**Tech Stack:** SvelteKit (Svelte 5 runes + snippets), Tailwind, Vitest + @testing-library/svelte (jsdom), Playwright (live e2e).

## Global Constraints

- **Never edit `vendor/lq-ai`.** No backend change, no pin bump, client-side only.
- **No bits-ui / no floating tooltip / no positioned coachmark.** The primitive is a hand-rolled inline dismissable callout (the repo has zero bits-ui usages). Mirror `src/lib/chat/ConnectedBanner.svelte`'s callout markup + the `$state`-toggle idiom.
- **Persistence = localStorage, honest degradation:** guard every access with `hasStorage()` (`typeof localStorage !== 'undefined'`) + `try/catch`; a malformed/absent value degrades to an empty set and **never throws** (a lost dismissal simply re-shows the hint). Key: `donna.dismissedHints` (a JSON string array of ids). Mirror `src/lib/models/store.svelte.ts`.
- **Two hints, single render site each** (so each shows at most once until dismissed): `fiduciary-trust-pill` (chat page, gated on `messages.some((m) => m.ledgerGate)`) and `fiduciary-research-sources` (research page).
- **No standalone suggested-task starters** this slice (spec §3.4); **no export-nudge hint** (dropped).
- **Svelte 5 runes** (`$state`, `$props`, snippet `children`); **tabs** for indentation; match neighboring files. Use `mlq-*` design tokens.
- **Gates every task:** `npm run check` 0/0 (ignore the harmless vendor `ERR_MODULE_NOT_FOUND`); `npm run lint` fully green; `npx vitest run` passing. Commit per task; PR with a **merge commit** (never squash); mirror `main` to `tucuxi`.

## File Structure

- `src/lib/fiduciary/hints.svelte.ts` (new) — the dismissal rune-store factory + singleton.
- `src/lib/fiduciary/Hint.svelte` (new) — the reusable dismissable callout primitive.
- `src/routes/(app)/chats/[id]/+page.svelte` (modify) — wire the trust-pill hint.
- `src/routes/(app)/research/+page.svelte` (modify) — wire the sources hint.
- Tests: `hints.svelte.test.ts` (new), `Hint.svelte.test.ts` (new), `tests/fiduciary-hint.spec.ts` (new e2e).

---

### Task 1: The dismissal store `hints.svelte.ts`

**Files:**

- Create: `src/lib/fiduciary/hints.svelte.ts`
- Test: `src/lib/fiduciary/hints.svelte.test.ts`

**Interfaces:**

- Produces: `DISMISSED_HINTS_KEY = 'donna.dismissedHints'`; `createHintStore()` → `{ isDismissed(id: string): boolean; dismiss(id: string): void }`; the app-global singleton `hintStore`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/fiduciary/hints.svelte.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createHintStore, DISMISSED_HINTS_KEY } from './hints.svelte';

beforeEach(() => localStorage.clear());

describe('createHintStore', () => {
	it('reports nothing dismissed by default', () => {
		expect(createHintStore().isDismissed('h1')).toBe(false);
	});
	it('dismiss(id) marks it and persists a JSON array to localStorage', () => {
		const s = createHintStore();
		s.dismiss('h1');
		expect(s.isDismissed('h1')).toBe(true);
		expect(JSON.parse(localStorage.getItem(DISMISSED_HINTS_KEY)!)).toEqual(['h1']);
	});
	it('a fresh store reads the persisted set back (round-trip)', () => {
		createHintStore().dismiss('h1');
		const s2 = createHintStore();
		expect(s2.isDismissed('h1')).toBe(true);
		expect(s2.isDismissed('other')).toBe(false);
	});
	it('dismiss is idempotent — no duplicate persistence', () => {
		const s = createHintStore();
		s.dismiss('h1');
		s.dismiss('h1');
		expect(JSON.parse(localStorage.getItem(DISMISSED_HINTS_KEY)!)).toEqual(['h1']);
	});
	it('degrades a malformed stored value to an empty set without throwing', () => {
		localStorage.setItem(DISMISSED_HINTS_KEY, '{not json');
		expect(() => createHintStore().isDismissed('h1')).not.toThrow();
		expect(createHintStore().isDismissed('h1')).toBe(false);
	});
	it('ignores non-string members in a stored array', () => {
		localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify(['ok', 3, null]));
		const s = createHintStore();
		expect(s.isDismissed('ok')).toBe(true);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/fiduciary/hints.svelte.test.ts`
Expected: FAIL — module `./hints.svelte` does not exist.

- [ ] **Step 3: Implement the store**

Create `src/lib/fiduciary/hints.svelte.ts`:

```ts
// src/lib/fiduciary/hints.svelte.ts
// Dismissal state for the fiduciary discovery hints (Slice 6-lean). A Set of
// dismissed hint ids persisted to localStorage. Mirrors models/store.svelte.ts:
// hasStorage() SSR guard + try/catch (private-mode safe); honest degradation —
// a malformed/absent value yields an empty set and never throws (a lost
// dismissal simply re-shows the hint). No backend dependency.
export const DISMISSED_HINTS_KEY = 'donna.dismissedHints';

const hasStorage = () => typeof localStorage !== 'undefined';

function readStored(): Set<string> {
	if (!hasStorage()) return new Set();
	try {
		const raw = localStorage.getItem(DISMISSED_HINTS_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? new Set(parsed.filter((v): v is string => typeof v === 'string'))
			: new Set();
	} catch {
		return new Set();
	}
}

export function createHintStore() {
	let dismissed = $state<Set<string>>(readStored());

	function isDismissed(id: string): boolean {
		return dismissed.has(id);
	}
	function dismiss(id: string): void {
		if (dismissed.has(id)) return;
		// Reassign (not mutate) so Svelte tracks the change.
		dismissed = new Set(dismissed).add(id);
		if (!hasStorage()) return;
		try {
			localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify([...dismissed]));
		} catch {
			/* private mode / storage disabled — dismissal stays in memory only */
		}
	}

	return { isDismissed, dismiss };
}

/** App-global singleton: which discovery hints the user has dismissed. */
export const hintStore = createHintStore();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/fiduciary/hints.svelte.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fiduciary/hints.svelte.ts src/lib/fiduciary/hints.svelte.test.ts
git commit -m "feat(fiduciary): localStorage-backed hint dismissal store"
```

---

### Task 2: The `Hint.svelte` callout primitive

**Files:**

- Create: `src/lib/fiduciary/Hint.svelte`
- Test: `src/lib/fiduciary/Hint.svelte.test.ts`

**Interfaces:**

- Consumes: the `hintStore` singleton (Task 1).
- Produces: `<Hint id="..">…children…</Hint>` — renders a dismissable callout unless `hintStore.isDismissed(id)`; the `×` button calls `hintStore.dismiss(id)`. Props: `{ id: string; children: Snippet }`. No hardcoded width (the parent container sets it).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fiduciary/Hint.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Hint from './Hint.svelte';
import { hintStore } from './hints.svelte';

beforeEach(() => localStorage.clear());

// A snippet that renders static text (single root element, per createRawSnippet).
const body = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

describe('Hint', () => {
	it('renders its children and a dismiss button when not dismissed', () => {
		render(Hint, { props: { id: 'hint-render', children: body('trace the sources') } });
		expect(screen.getByText('trace the sources')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dismiss hint' })).toBeInTheDocument();
	});
	it('dismissing hides the callout and marks the id dismissed', async () => {
		render(Hint, { props: { id: 'hint-dismiss', children: body('dismiss me') } });
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));
		expect(screen.queryByText('dismiss me')).not.toBeInTheDocument();
		expect(hintStore.isDismissed('hint-dismiss')).toBe(true);
	});
	it('renders nothing when the id is already dismissed', () => {
		hintStore.dismiss('hint-pre');
		render(Hint, { props: { id: 'hint-pre', children: body('should not show') } });
		expect(screen.queryByText('should not show')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/fiduciary/Hint.svelte.test.ts`
Expected: FAIL — `Hint.svelte` does not exist.

- [ ] **Step 3: Implement the primitive**

Create `src/lib/fiduciary/Hint.svelte`:

```svelte
<!-- src/lib/fiduciary/Hint.svelte -->
<!-- A small, one-time, dismissable in-context discovery hint (Slice 6-lean).
     Hand-rolled callout (mirrors ConnectedBanner) — no bits-ui. Renders nothing
     once its id is dismissed (persisted via the hintStore). Width is set by the
     parent container, not hardcoded. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Info, X } from '@lucide/svelte';
	import { hintStore } from './hints.svelte';

	let { id, children }: { id: string; children: Snippet } = $props();
</script>

{#if !hintStore.isDismissed(id)}
	<div
		role="note"
		class="mb-3 flex items-start justify-between gap-3 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 px-3 py-2 text-xs text-mlq-text"
	>
		<span class="flex items-start gap-2">
			<Info size={14} class="mt-0.5 shrink-0 text-mlq-workflow" aria-hidden="true" />
			<span>{@render children()}</span>
		</span>
		<button
			type="button"
			onclick={() => hintStore.dismiss(id)}
			aria-label="Dismiss hint"
			class="shrink-0 rounded p-0.5 text-mlq-muted hover:text-mlq-text"
		>
			<X size={14} aria-hidden="true" />
		</button>
	</div>
{/if}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/fiduciary/Hint.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fiduciary/Hint.svelte src/lib/fiduciary/Hint.svelte.test.ts
git commit -m "feat(fiduciary): dismissable Hint callout primitive"
```

---

### Task 3: Wire the two hints (chat + research pages)

**Files:**

- Modify: `src/routes/(app)/chats/[id]/+page.svelte` (after the `<ConnectedBanner>` at ~L130)
- Modify: `src/routes/(app)/research/+page.svelte` (above the `<ResearchSourcesCard>` at ~L27-29)

**Interfaces:**

- Consumes: `Hint` (Task 2). The chat page reads `chat.messages` (each message may have `ledgerGate`); the research page renders the hint unconditionally (the `Hint` self-gates on dismissal).

**Note:** this task has no unit test — rendering these full pages in isolation is impractical (heavy `data`/store deps). Its behavior is verified by the Task 4 live e2e; its gate here is `npm run check` (svelte-check validates the wiring + the `messages.some(...)` typing) + lint + the existing suite.

- [ ] **Step 1: Wire the trust-pill hint in the chat page**

In `src/routes/(app)/chats/[id]/+page.svelte`, add the import alongside the other `$lib` imports at the top of the `<script>`:

```ts
import Hint from '$lib/fiduciary/Hint.svelte';
```

Then, immediately after the `<ConnectedBanner ... />` line inside `<div class="mx-auto max-w-2xl px-6 py-8">`, add:

```svelte
<ConnectedBanner server={connectedServer} error={connectError} onretry={resendLastUser} />
{#if chat.messages.some((m) => m.ledgerGate)}
	<Hint id="fiduciary-trust-pill">
		New — every answer now carries a <strong>trust pill</strong> in its footer. Click it to open the
		receipt and trace each claim back to its source.
		<a href="/about/fiduciary" class="font-medium text-mlq-workflow hover:underline">Learn more →</a
		>
	</Hint>
{/if}
```

- [ ] **Step 2: Wire the sources hint in the research page**

In `src/routes/(app)/research/+page.svelte`, add the import alongside the other imports:

```ts
import Hint from '$lib/fiduciary/Hint.svelte';
```

Then, inside `<div class="mx-auto max-w-5xl p-6">`, between the `<h1>` (line 25) and the `<div class="mt-4"><ResearchSourcesCard … /></div>` (lines 27-29), add:

```svelte
<h1 class="text-lg font-semibold text-mlq-text">Case-law research</h1>

<div class="mt-4">
	<Hint id="fiduciary-research-sources">
		The <strong>Authoritative sources</strong> card below shows which primary-law sources this instance
		can reach right now.
	</Hint>
	<ResearchSourcesCard sources={data.sources} />
</div>
```

- [ ] **Step 3: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0 (the wiring type-checks; `chat.messages` is the message array and `m.ledgerGate` is a valid optional field), lint green, full suite passing.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte" "src/routes/(app)/research/+page.svelte"
git commit -m "feat(fiduciary): wire the trust-pill and authoritative-sources discovery hints"
```

---

### Task 4: Live e2e — the hints render, dismiss, and stay dismissed

**Files:**

- Create: `tests/fiduciary-hint.spec.ts`

**Interfaces:**

- Consumes: the wired pages (Task 3) + the persistence store (Task 1), served by the running stack.

**Preconditions (evidence step):**

- Rebuild the app container so it serves this branch: `docker compose up -d --build donna-web`.
- Stack up at pin `5aa9135`; admin fixture `admin@lq.ai`; `.env` provides `DONNA_BASE_URL`, `DONNA_E2E_EMAIL`, `DONNA_E2E_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`. Source it: `set -a; . ./.env; set +a`.
- The chat scenario SQL-seeds a receipt exactly as `tests/fiduciary-receipt.spec.ts` (chat + assistant turn + caselaw citation + ledger entry + gate), so the trust-pill hint's `messages.some((m) => m.ledgerGate)` gate is satisfied.

- [ ] **Step 1: Write the e2e**

Create `tests/fiduciary-hint.spec.ts`:

```ts
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('research authoritative-sources hint dismisses and stays dismissed across a reload', async ({
	page
}) => {
	await login(page);
	await page.goto('/research');

	const hint = page.getByRole('note').filter({ hasText: 'Authoritative sources card below' });
	await expect(hint).toBeVisible();
	await hint.getByRole('button', { name: 'Dismiss hint' }).click();
	await expect(hint).toHaveCount(0);

	// Persisted: reload → still gone.
	await page.reload();
	await expect(page.getByText('Authoritative sources card below')).toHaveCount(0);
});

test('trust-pill hint shows once a chat has a fiduciary receipt, then dismisses', async ({
	page
}) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const chatId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${ownerId}','e2e-hint chat')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Generally no under California law.','ai')`
		);
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}',100,200,0,${QUOTE.length},'${QUOTE}',true,'exact_match')`
		);
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match',0.98,'courtlistener')`
		);
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade',1,0,0,1,0.98)`
		);

		await login(page);
		await page.goto(`/chats/${chatId}`);

		const hint = page.getByRole('note').filter({ hasText: 'every answer now carries a' });
		await expect(hint).toBeVisible();
		await hint.getByRole('button', { name: 'Dismiss hint' }).click();
		await expect(hint).toHaveCount(0);
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
	}
});
```

- [ ] **Step 2: Rebuild the app container**

Run: `docker compose up -d --build donna-web`
Expected: `donna-web` rebuilt and healthy.

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/fiduciary-hint.spec.ts`
Expected: PASS (both tests; each Playwright test gets an isolated context, so the research dismissal doesn't affect the chat test).

- [ ] **Step 4: Verify self-cleaning**

Run: `set -a; . ./.env; set +a; docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(*) FROM chats WHERE title='e2e-hint chat'"`
Expected: `0`.

- [ ] **Step 5: Run the full unit gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add tests/fiduciary-hint.spec.ts
git commit -m "test(fiduciary): live e2e for the discovery hints (render, dismiss, persist)"
```

---

### Task 5: Whole-branch review, PR, merge, mirror

- [ ] **Step 1: Opus whole-branch review**

Dispatch an Opus review of the full branch diff against `main` per `superpowers:requesting-code-review`, focused on: the store's honest degradation (malformed/absent → empty, never throws) and Svelte reactivity (reassign-not-mutate so the Hint re-renders on dismiss), the single-render-site guarantee (each hint shows at most once), no bits-ui, and the copy being accurate/non-overclaiming. Address any Critical/Important findings with follow-up commits.

- [ ] **Step 2: Open the PR with a merge commit**

```bash
git push -u origin feat/fiduciary-slice6-lean-discovery
gh pr create --base main --title "feat(fiduciary): Slice 6-lean — contextual capability discovery" --body "<summary + test evidence>"
```

- [ ] **Step 3: Merge with a merge commit (never squash), then mirror `main` to tucuxi**

```bash
gh pr merge --merge
git checkout main && git pull
git push tucuxi main
```

---

## Self-Review

**Spec coverage (design §4/§5):**

- `fiduciary/hints.svelte.ts` rune-store singleton, `Set<string>` in `localStorage['donna.dismissedHints']`, honest degradation → Task 1. ✅
- `fiduciary/Hint.svelte` hand-rolled dismissable callout (no bits-ui, parent-set width) → Task 2. ✅
- Two hints at single render sites: `fiduciary-trust-pill` (chat, gated on a receipt) + `fiduciary-research-sources` (research) → Task 3. ✅
- Unit (store), component (Hint shows/hides/dismiss), live e2e (render + dismiss + persist across reload, both hints) → Tasks 1/2/4. ✅
- No starters, no export nudge, no bits-ui, no backend/pin change → Global Constraints + omission. ✅

**Placeholder scan:** every code/test step contains complete code; no TBD/TODO. ✅

**Type/hook consistency:** `createHintStore()`/`hintStore`/`isDismissed`/`dismiss`/`DISMISSED_HINTS_KEY` (Task 1) are consumed unchanged by `Hint.svelte` (Task 2) and the store test; `Hint`'s props `{ id, children }` match both wirings (Task 3) and its own test; the e2e's `role="note"` + "Dismiss hint" button name + the two copy substrings ("Authoritative sources card below", "every answer now carries a") match the exact strings rendered by `Hint.svelte` (Task 2) and the wired copy (Task 3). The chat gate `chat.messages.some((m) => m.ledgerGate)` matches the seeded receipt in Task 4. ✅
