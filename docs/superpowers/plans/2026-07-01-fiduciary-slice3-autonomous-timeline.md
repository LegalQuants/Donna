# Fiduciary Slice 3 — Autonomous Matter Audit Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the autonomous-session citation ledger + fiduciary gate in Donna's Automations session view — a session-level trust pill in the receipt header and a reused `FiduciaryReceipt` block in the session detail — so a reviewer sees "who did what, on whose behalf, at what cost, and is it fiduciary-grade."

**Architecture:** The backend exposes `GET /api/v1/autonomous/sessions/{session_id}/ledger`, which returns the **identical** `{chat_id, entries[], gates[]}` shape as the chat ledger (`gates[]` has exactly one element for a session). We reuse the entire Slice 1/2 substrate unchanged — `parseLedger` (ledger.ts), `gateVerdict` (trust.ts), `FiduciaryReceipt.svelte`, `FiduciaryPill`/verdict vocabulary. New work is a defensive server loader (`loadSessionLedger`), threading it through the existing `[id]` SSR load + `[id]/+server.ts` poll proxy, extending `pollSession` with a last-known-good `ledger` field, a gate pill in `SessionReceiptHeader`, the receipt block in `SessionDetail`, and a shared click-through helper reused by both the chat page and the session page.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright (live e2e against the Docker stack).

## Global Constraints

- **Never edit `vendor/lq-ai`.** It is a pinned submodule (currently pin `5aa9135`).
- **Backend contract is authoritative:** `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` §2.2, §6.2, §6.3. The endpoint returns `{chat_id, entries, gates}`; for a session `gates` has exactly one element; returns **404** (not 403) for another user's session **or** when the hidden backing chat has not yet been manufactured — honest-degrade to `null`, never error the page.
- **Ledger bodies are runtime `dict[str,Any]`** (no OpenAPI schema) → always go through the existing defensive `parseLedger`; never hand-index raw JSON.
- **No new component or parser.** Reuse `src/lib/fiduciary/{ledger.ts, trust.ts, FiduciaryReceipt.svelte}` exactly. `FiduciaryReceipt` is already treatment- and click-through-capable.
- **Honest degradation (CLAUDE.md §7):** each sub-fetch degrades to `null` independently; live pollers keep **last-known-good** (only overwrite state on non-null incoming).
- **Never color a case good/bad law.** Treatment display is "derived, not editorial" — this is already handled inside `FiduciaryReceipt`; do not add new treatment UI.
- **Svelte 5 runes** throughout (`$props`, `$state`, `$derived`, `$effect`); **tabs** for indentation (prettier-enforced); match neighboring files.
- **Gates every task:** `npm run check` = 0 errors / 0 warnings · `npm run lint` fully green (prettier + eslint) · `npx vitest run` passing. Run all three before marking a task complete.
- **Commit per task**; PR to `main` with a **merge commit** (never squash); mirror `main` to remote `tucuxi`.
- The fiduciary pill here is unrelated to `preferences/TrustPill.svelte` / `trust_pills` (model-provenance) — do **not** reconcile them.

---

### Task 1: `loadSessionLedger` server loader, threaded through the SSR load + poll proxy

Adds a defensive, honest-degrading server loader for the autonomous-session ledger and exposes it as `data.ledger` (SSR) and the `ledger` field on the poll-proxy JSON. Kept a **sibling** of `loadRunOutput` (leaves that function and its 6 tests untouched) because the audit ledger is a distinct concern from the work-product bundle.

**Files:**

- Modify: `src/lib/automations/runOutput.server.ts` (add `loadSessionLedger`)
- Modify: `src/routes/(app)/automations/[id]/+page.server.ts:7-20` (add to `Promise.all`, return `ledger`)
- Modify: `src/routes/(app)/automations/[id]/+server.ts:6-20` (add to `Promise.all`, include `ledger` in JSON)
- Test: `src/lib/automations/runOutput.server.test.ts` (new `describe` for `loadSessionLedger`)
- Test: `src/routes/(app)/automations/[id]/page.server.test.ts` (extend `mockOutput` helper + one assertion)
- Test: `src/routes/(app)/automations/[id]/server.test.ts` (queue the ledger response + one assertion)

**Interfaces:**

- Consumes: `parseLedger`, `type Ledger` from `$lib/fiduciary/ledger`; `lqFetch` from `$lib/server/lqClient`.
- Produces: `loadSessionLedger(event: RequestEvent, sessionId: string): Promise<Ledger | null>`. `data.ledger: Ledger | null` on the page; `ledger: Ledger | null` field on `GET /automations/[id]` JSON.

- [ ] **Step 1: Write the failing test for `loadSessionLedger`**

Append to `src/lib/automations/runOutput.server.test.ts` (the file already mocks `lqFetch`):

```ts
import { loadSessionLedger } from './runOutput.server';

describe('loadSessionLedger', () => {
	const ledgerBody = {
		chat_id: 'hidden-chat',
		entries: [
			{
				id: 'le1',
				message_id: 'm1',
				source_kind: 'kb_document',
				verification_status: 'exact_match',
				confidence: 1,
				source: { kind: 'kb_document', label: 'Master Agreement', passages: [] }
			}
		],
		gates: [{ message_id: 'm1', gate_status: 'fiduciary_grade', total_assertions: 1 }]
	};

	it('fetches the session ledger and returns the parsed Ledger', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(ledgerBody), { status: 200 }));
		const out = await loadSessionLedger(ev, 's1');
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1/ledger');
		expect(out?.entries).toHaveLength(1);
		expect(out?.gates[0].gate_status).toBe('fiduciary_grade');
	});

	it('degrades a 404 (hidden chat not yet manufactured) to null', async () => {
		lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
		expect(await loadSessionLedger(ev, 's1')).toBeNull();
	});

	it('degrades a 502 to null', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 502 }));
		expect(await loadSessionLedger(ev, 's1')).toBeNull();
	});

	it('degrades a non-JSON body to null', async () => {
		lqFetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
		expect(await loadSessionLedger(ev, 's1')).toBeNull();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/automations/runOutput.server.test.ts`
Expected: FAIL — `loadSessionLedger` is not exported.

- [ ] **Step 3: Implement `loadSessionLedger`**

In `src/lib/automations/runOutput.server.ts`, add the import and the function (leave `loadRunOutput` and `RunOutput` untouched):

```ts
import { parseLedger, type Ledger } from '$lib/fiduciary/ledger';
```

```ts
/** The autonomous-session citation ledger + fiduciary gate (WS-D). Identical
 *  shape to the chat ledger. Degrades to null on any failure — a 404 means the
 *  session's hidden backing chat has not been manufactured yet, or the session
 *  is not the caller's; either way the receipt page must never fail because of it. */
export async function loadSessionLedger(
	event: RequestEvent,
	sessionId: string
): Promise<Ledger | null> {
	const res = await lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/ledger`);
	if (!res.ok) return null;
	try {
		return parseLedger(await res.json());
	} catch {
		// non-JSON body → ledger unavailable
		return null;
	}
}
```

- [ ] **Step 4: Run the loader tests to verify they pass**

Run: `npx vitest run src/lib/automations/runOutput.server.test.ts`
Expected: PASS (all `loadSessionLedger` cases + the untouched `loadRunOutput` cases).

- [ ] **Step 5: Thread it into the SSR load**

In `src/routes/(app)/automations/[id]/+page.server.ts`, add the import and extend the `Promise.all` + return:

```ts
import { loadRunOutput, loadSessionLedger } from '$lib/automations/runOutput.server';
```

```ts
const [res, output, ledger] = await Promise.all([
	lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
	loadRunOutput(event, event.params.id),
	loadSessionLedger(event, event.params.id)
]);
if (!res.ok) {
	if (res.status === 404) throw error(404, 'Session not found.');
	throw error(502, 'Could not load the session.');
}
const body = (await res.json()) as { session?: unknown; receipt?: unknown };
const session = parseSessionSummary(body.session);
if (!session) throw error(502, 'Malformed session response.');
return { session, receipt: parseReceipt(body.receipt), ...output, ledger };
```

- [ ] **Step 6: Thread it into the poll proxy**

In `src/routes/(app)/automations/[id]/+server.ts`, add the import and extend the `Promise.all` + JSON:

```ts
import { loadRunOutput, loadSessionLedger } from '$lib/automations/runOutput.server';
```

```ts
const [res, output, ledger] = await Promise.all([
	lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
	loadRunOutput(event, event.params.id),
	loadSessionLedger(event, event.params.id)
]);
if (!res.ok) {
	if (res.status === 404) throw error(404, 'Session not found.');
	throw error(
		res.status === 503 || res.status === 504 ? res.status : 502,
		'Could not load the session.'
	);
}
const body = (await res.json()) as Record<string, unknown>;
return json({ ...body, ...output, ledger });
```

- [ ] **Step 7: Update the route tests for the new (5th) fetch**

Both the load and the proxy now fire, in order: `[session, findings, memory, artifacts, ledger]`.

In `src/routes/(app)/automations/[id]/page.server.test.ts`, extend the shared `mockOutput` helper to queue the ledger response (this covers every test that calls it):

```ts
/** Queue the findings+memories+artifacts+ledger responses that follow the session response. */
function mockOutput(
	findingsBody: unknown = { findings: [], total_count: 0 },
	memoriesBody: unknown = { entries: [], total_count: 0 },
	artifactsBody: unknown = { artifacts: [], total_count: 0 },
	ledgerBody: unknown = { chat_id: 'c', entries: [], gates: [] }
) {
	lqFetch
		.mockResolvedValueOnce(okJson(findingsBody))
		.mockResolvedValueOnce(okJson(memoriesBody))
		.mockResolvedValueOnce(okJson(artifactsBody))
		.mockResolvedValueOnce(okJson(ledgerBody));
}
```

Then add one assertion to the first load test (the `returns the parsed session summary and receipt` case), after its existing assertions, and widen its result type:

```ts
const out = (await load(ev())) as {
	session: { id: string };
	receipt: { terminal_reason: string } | null;
	ledger: { gates: { gate_status: string }[] } | null;
};
```

```ts
expect(lqFetch.mock.calls[4][1]).toBe('/api/v1/autonomous/sessions/s1/ledger');
```

Add a focused ledger case at the end of the `describe('/automations/[id] load')` block:

```ts
it('degrades a 404 session ledger to a null data.ledger without failing the page', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				session: {
					id: 's1',
					status: 'completed',
					trigger_kind: 'manual',
					current_phase: 'delivery',
					cost_total_usd: '0.1',
					created_at: 'x'
				},
				receipt: null
			}),
			{ status: 200 }
		)
	);
	lqFetch
		.mockResolvedValueOnce(okJson({ findings: [], total_count: 0 }))
		.mockResolvedValueOnce(okJson({ entries: [], total_count: 0 }))
		.mockResolvedValueOnce(okJson({ artifacts: [], total_count: 0 }))
		.mockResolvedValueOnce(new Response('nope', { status: 404 }));
	const out = (await load(ev())) as { session: { id: string }; ledger: unknown };
	expect(out.session.id).toBe('s1');
	expect(out.ledger).toBeNull();
});
```

One load test queues its sub-fetch responses **manually** (not via `mockOutput`): `degrades findings/memories failures to null without failing the page` (currently three `mockResolvedValueOnce(new Response('boom', { status: 500 }))`). It now fires a 4th sub-fetch (the ledger) — add a matching 4th response so it degrades cleanly instead of hitting an unqueued (undefined) mock:

```ts
lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
const out = (await load(ev())) as { findings: null; memories: null; ledger: null };
expect(out.findings).toBeNull();
expect(out.memories).toBeNull();
expect(out.ledger).toBeNull();
```

(The `throws 404 for a missing/cross-user session` test uses a `mockResolvedValue` fallback, so its extra ledger fetch returns 404 → null and the session still 404s — no change needed.)

In `src/routes/(app)/automations/[id]/server.test.ts`, add the ledger response to the passthrough test and assert it flows through:

```ts
lqFetch.mockResolvedValueOnce(okJson({ artifacts: [], total_count: 0 }));
lqFetch.mockResolvedValueOnce(okJson({ chat_id: 'c', entries: [], gates: [] }));
const res = await GET(ev());
expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
const body = await res.json();
expect(body.session.status).toBe('running');
expect(body.findings).toEqual([]);
expect(body.findings_total).toBe(0);
expect(body.memories).toEqual([]);
expect(body.ledger).toEqual({ entries: [], gates: [] });
```

(The `maps a 404 to 404 and a 500 to 502` test already uses a `mockResolvedValue` fallback, so the extra ledger fetch returns 404 and degrades to null — no change needed there.)

- [ ] **Step 8: Run all Task 1 tests to verify they pass**

Run: `npx vitest run src/lib/automations/runOutput.server.test.ts "src/routes/(app)/automations/[id]"`
Expected: PASS.

- [ ] **Step 9: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0 (ignore the harmless `ERR_MODULE_NOT_FOUND` referencing `vendor/lq-ai/...`), lint green, full suite passing.

- [ ] **Step 10: Commit**

```bash
git add src/lib/automations/runOutput.server.ts src/lib/automations/runOutput.server.test.ts "src/routes/(app)/automations/[id]/+page.server.ts" "src/routes/(app)/automations/[id]/+server.ts" "src/routes/(app)/automations/[id]/page.server.test.ts" "src/routes/(app)/automations/[id]/server.test.ts"
git commit -m "feat(fiduciary): loadSessionLedger threaded through the automations load + poll proxy"
```

---

### Task 2: `pollSession` exposes the session ledger with last-known-good retention

Extends the live poller so a running session's ledger updates each tick without a degraded tick blanking a previously-received ledger.

**Files:**

- Modify: `src/lib/automations/pollSession.svelte.ts:27-142`
- Test: `src/lib/automations/pollSession.svelte.test.ts`

**Interfaces:**

- Consumes: the `ledger` field on the `GET /automations/[id]` JSON (Task 1); `type Ledger` from `$lib/fiduciary/ledger`.
- Produces: `poll.ledger: Ledger | null` getter on the `createSessionPoll` return.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/automations/pollSession.svelte.test.ts` inside the `describe('createSessionPoll', ...)` block:

```ts
it('threads the session ledger with last-known-good retention', async () => {
	const bodies = [
		{
			session: {
				id: 's1',
				status: 'running',
				trigger_kind: 'manual',
				current_phase: 'analysis',
				cost_total_usd: '0.1',
				created_at: 'x'
			},
			receipt: null,
			ledger: { entries: [{ id: 'le1' }], gates: [{ gate_status: 'fiduciary_grade' }] }
		},
		// degraded tick: a null ledger must NOT blank the earlier one
		{
			session: {
				id: 's1',
				status: 'completed',
				trigger_kind: 'manual',
				current_phase: 'delivery',
				cost_total_usd: '0.2',
				created_at: 'x'
			},
			receipt: null,
			ledger: null
		}
	];
	let i = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(bodies[Math.min(i++, bodies.length - 1)])))
	);
	const poll = createSessionPoll('s1', { pollMs: 1 });
	const p = poll.start();
	await vi.advanceTimersByTimeAsync(10);
	await p;
	expect(poll.ledger?.entries).toHaveLength(1);
	expect(poll.ledger?.gates[0].gate_status).toBe('fiduciary_grade');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts`
Expected: FAIL — `poll.ledger` is undefined.

- [ ] **Step 3: Implement the ledger state + getter**

In `src/lib/automations/pollSession.svelte.ts`:

Add the type import (extend the existing import block near the top):

```ts
import type { Ledger } from '$lib/fiduciary/ledger';
```

Add the state declaration alongside the others (after `artifactsTotal`, before `done`):

```ts
let ledger = $state<Ledger | null>(null);
```

Add `ledger` to the `tick()` body destructure type (inside the `body` object type) and apply last-known-good after the artifacts block, before `return TERMINAL.has(parsed.status);`:

```ts
const incomingLedger =
	body.ledger && typeof body.ledger === 'object' ? (body.ledger as Ledger) : null;
if (incomingLedger !== null) ledger = incomingLedger;
```

(Add `ledger?: unknown;` to the inline `body` type in `tick()`.)

Add the getter to the returned object (after the `artifactsTotal` getter):

```ts
		get ledger() {
			return ledger;
		},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/pollSession.svelte.ts src/lib/automations/pollSession.svelte.test.ts
git commit -m "feat(fiduciary): pollSession exposes the session ledger (last-known-good)"
```

---

### Task 3: Session-level gate trust pill in `SessionReceiptHeader`

Renders the session's single gate verdict as a non-interactive pill in the header chip row, beside the cost / cost-cap chips. Non-interactive (a `<span>`, not the chat's toggling `FiduciaryPill` button) because the receipt block below is always visible, not expand/collapse.

**Files:**

- Modify: `src/lib/automations/SessionReceiptHeader.svelte`
- Test: `src/lib/automations/SessionReceiptView.svelte.test.ts`

**Interfaces:**

- Consumes: `gateVerdict` from `$lib/fiduciary/trust`; `type LedgerGate` from `$lib/fiduciary/ledger`.
- Produces: `SessionReceiptHeader` accepts an **optional** prop `gate?: LedgerGate | null` (defaults to `null` so the existing/`SessionDetail` call sites compile until Task 5 supplies it). Renders nothing when there is no verdict.

- [ ] **Step 1: Write the failing tests**

Edit `src/lib/automations/SessionReceiptView.svelte.test.ts`. Add a gate fixture near the top (after the `receipt` fixture) and two header assertions:

```ts
import type { LedgerGate } from '$lib/fiduciary/ledger';

const gradeGate: LedgerGate = {
	message_id: null,
	gate_status: 'fiduciary_grade',
	pass_count: 2,
	supported_count: 0,
	fail_count: 0,
	total_assertions: 2,
	confidence: 0.99,
	created_at: null
};
```

In `describe('Session receipt view', ...)`:

```ts
it('header renders the session gate trust pill', () => {
	render(SessionReceiptHeader, { props: { session, receipt, gate: gradeGate } });
	expect(screen.getByText('Fiduciary-grade')).toBeInTheDocument();
});
it('header renders no gate pill when the gate is null', () => {
	render(SessionReceiptHeader, { props: { session, receipt, gate: null } });
	expect(screen.queryByText('Fiduciary-grade')).not.toBeInTheDocument();
	expect(screen.queryByText('No sourced claims')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/automations/SessionReceiptView.svelte.test.ts`
Expected: FAIL — no "Fiduciary-grade" text (prop not consumed / pill not rendered).

- [ ] **Step 3: Implement the pill**

In `src/lib/automations/SessionReceiptHeader.svelte`, extend the script and markup:

```svelte
<script lang="ts">
	import type { SessionSummary, SessionReceipt } from './types';
	import type { LedgerGate } from '$lib/fiduciary/ledger';
	import { gateVerdict } from '$lib/fiduciary/trust';
	import { formatUsd, formatWhen, statusTone, terminalReasonLabel, triggerLabel } from './display';
	let {
		session,
		receipt,
		gate = null
	}: {
		session: SessionSummary;
		receipt: SessionReceipt | null;
		gate?: LedgerGate | null;
	} = $props();
	const capLabel = $derived(
		session.max_cost_usd === null ? 'no cap' : `${formatUsd(session.max_cost_usd)} cap`
	);
	const verdict = $derived(gateVerdict(gate));
</script>
```

Insert the pill in the chip row, after the `cost cap reached` chip (line 20) and before the `{#if receipt}` terminal-reason chip (which uses `ml-auto` to stay right-aligned):

```svelte
		{#if session.cost_cap_reached}<span class="text-xs text-mlq-caveats">cost cap reached</span
			>{/if}
		{#if verdict}
			<span
				title={verdict.explanation}
				class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold {verdict.pillClass}"
			>
				<span class="inline-block h-1.5 w-1.5 rounded-full {verdict.dotClass}"></span>
				{verdict.label}
			</span>
		{/if}
		{#if receipt}<span class="ml-auto text-xs text-mlq-muted"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/automations/SessionReceiptView.svelte.test.ts`
Expected: PASS (including the pre-existing status/cost/timeline tests, which pass no `gate` and rely on the `null` default).

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/SessionReceiptHeader.svelte src/lib/automations/SessionReceiptView.svelte.test.ts
git commit -m "feat(fiduciary): session gate trust pill in SessionReceiptHeader"
```

---

### Task 4: Shared `openLedgerSource` click-through helper, reused by the chat page

Extracts the chat page's inline ledger-source open closure into a shared helper so the session page can reuse the exact same routing (KB doc → doc panel · caselaw → opinion · external → new tab) without drift.

**Files:**

- Create: `src/lib/fiduciary/openSource.ts`
- Create: `src/lib/fiduciary/openSource.test.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.svelte:138-152` (replace the inline closure body with a call to the helper)

**Interfaces:**

- Consumes: `type DocPanel` from `$lib/docpanel/docPanel.svelte` (exported as `ReturnType<typeof createDocPanel>`); `type LedgerEntry` from `$lib/fiduciary/ledger`.
- Produces: `openLedgerSource(docPanel: DocPanel, entry: LedgerEntry): void`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/fiduciary/openSource.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openLedgerSource } from './openSource';
import type { LedgerEntry } from './ledger';
import type { DocPanel } from '$lib/docpanel/docPanel.svelte';

function entry(source: LedgerEntry['source']): LedgerEntry {
	return {
		id: 'e',
		message_id: 'm',
		source_kind: source?.kind ?? 'unknown',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at: null,
		source
	};
}
function src(
	over: Partial<NonNullable<LedgerEntry['source']>>
): NonNullable<LedgerEntry['source']> {
	return {
		kind: 'kb_document',
		source_file_id: null,
		opinion_id: null,
		cluster_id: null,
		external_ref: null,
		provider: null,
		label: null,
		subtitle: null,
		url: null,
		tool: null,
		passages: [],
		...over
	};
}
function mockPanel() {
	return { open: vi.fn(), openOpinion: vi.fn() } as unknown as DocPanel;
}

afterEach(() => vi.restoreAllMocks());

describe('openLedgerSource', () => {
	it('opens a KB document by file id in the doc panel', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(src({ kind: 'kb_document', source_file_id: 'f1' })));
		expect(p.open).toHaveBeenCalledWith({ source_file_id: 'f1', verificationApplicable: false });
	});
	it('opens a caselaw opinion by opinion id', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(src({ kind: 'caselaw', opinion_id: 42, label: 'Roe v. Doe' })));
		expect(p.openOpinion).toHaveBeenCalledWith({ opinionId: 42, caseName: 'Roe v. Doe' });
	});
	it('opens an external url in a new tab', () => {
		const p = mockPanel();
		const openSpy = vi.fn();
		vi.stubGlobal('window', { open: openSpy });
		openLedgerSource(p, entry(src({ kind: 'authority', url: 'https://example.gov/x' })));
		expect(openSpy).toHaveBeenCalledWith('https://example.gov/x', '_blank', 'noopener');
	});
	it('does nothing for a null source', () => {
		const p = mockPanel();
		openLedgerSource(p, entry(null));
		expect(p.open).not.toHaveBeenCalled();
		expect(p.openOpinion).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/fiduciary/openSource.test.ts`
Expected: FAIL — module `./openSource` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/fiduciary/openSource.ts` (logic copied verbatim from the chat page's closure so behavior is identical):

```ts
// src/lib/fiduciary/openSource.ts
// Shared click-through for a ledger entry's source, reused by the chat receipt
// (chats/[id]/+page.svelte) and the autonomous-session receipt
// (automations/[id]/+page.svelte). KB document → doc panel at the file; caselaw
// → opinion viewer; anything with an external url → a new tab. No statute viewer
// in the doc panel yet, so authority/statute falls through to the url.
import type { LedgerEntry } from './ledger';
import type { Citation } from '$lib/citations/types';
import type { DocPanel } from '$lib/docpanel/docPanel.svelte';

export function openLedgerSource(docPanel: DocPanel, entry: LedgerEntry): void {
	const s = entry.source;
	if (!s) return;
	if (s.source_file_id) {
		docPanel.open({
			source_file_id: s.source_file_id,
			verificationApplicable: false
		} as Citation);
	} else if (s.opinion_id) {
		docPanel.openOpinion({
			opinionId: s.opinion_id,
			caseName: s.label ?? `Opinion #${s.opinion_id}`
		});
	} else if (s.url) {
		window.open(s.url, '_blank', 'noopener');
	}
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npx vitest run src/lib/fiduciary/openSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the chat page to use the helper**

In `src/routes/(app)/chats/[id]/+page.svelte`, add the import (near the other `$lib` imports at the top of the `<script>`):

```ts
import { openLedgerSource } from '$lib/fiduciary/openSource';
```

Replace the inline `onopensource` closure (lines 138-152) with:

```svelte
onopensource={(e) => openLedgerSource(docPanel, e)}
```

- [ ] **Step 6: Run the chat page's existing tests + gates to verify no regression**

Run: `npx vitest run "src/routes/(app)/chats" && npm run check && npm run lint`
Expected: PASS / check 0/0 / lint green. (The chat page's behavior is unchanged; the existing chat receipt e2e still covers it live.)

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: full suite passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fiduciary/openSource.ts src/lib/fiduciary/openSource.test.ts "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "refactor(fiduciary): extract shared openLedgerSource click-through helper"
```

---

### Task 5: Render the `FiduciaryReceipt` block in `SessionDetail` + wire the page

Adds the session ledger to `SessionDetail` (last-known-good via the existing `pick`), passes the single gate to the header, renders the reused `FiduciaryReceipt` between `RunResults` and `SessionTimeline`, and wires click-through on the page using the docPanel that already exists there.

**Files:**

- Modify: `src/lib/automations/SessionDetail.svelte`
- Modify: `src/routes/(app)/automations/[id]/+page.svelte`
- Test: `src/lib/automations/SessionDetail.svelte.test.ts`

**Interfaces:**

- Consumes: `poll.ledger` (Task 2); `SessionReceiptHeader` `gate` prop (Task 3); `openLedgerSource` (Task 4); `data.ledger` (Task 1); `FiduciaryReceipt.svelte`, `type Ledger`, `type LedgerEntry`, `type LedgerGate` from `$lib/fiduciary/*`.
- Produces: `SessionDetail` accepts optional `initialLedger?: Ledger | null` and optional `onopensource?: (e: LedgerEntry) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/automations/SessionDetail.svelte.test.ts` inside `describe('SessionDetail', ...)`. Add a ledger fixture near the top-level `session` fixture:

```ts
import type { Ledger } from '$lib/fiduciary/ledger';

const ledger: Ledger = {
	entries: [
		{
			id: 'le1',
			message_id: 'm1',
			source_kind: 'kb_document',
			verification_status: 'exact_match',
			confidence: 1,
			provider: null,
			retrieved_at: null,
			treatment_id: null,
			treatment: null,
			created_at: null,
			source: {
				kind: 'kb_document',
				source_file_id: 'f1',
				opinion_id: null,
				cluster_id: null,
				external_ref: null,
				provider: null,
				label: 'Master Services Agreement',
				subtitle: null,
				url: null,
				tool: null,
				passages: [
					{
						text: 'limitation of liability',
						offset_start: 0,
						offset_end: 5,
						page: null,
						verified: true,
						method: 'exact_match'
					}
				]
			}
		}
	],
	gates: [
		{
			message_id: 'm1',
			gate_status: 'fiduciary_grade',
			pass_count: 1,
			supported_count: 0,
			fail_count: 0,
			total_assertions: 1,
			confidence: 0.99,
			created_at: null
		}
	]
};
```

Tests:

```ts
it('renders the fiduciary receipt block from the initial ledger', () => {
	render(SessionDetail, {
		props: {
			initialSession: session,
			initialReceipt: null,
			initialFindings: [],
			initialFindingsTotal: 0,
			initialMemories: [],
			initialLedger: ledger
		}
	});
	expect(screen.getByText('Fiduciary receipt')).toBeInTheDocument();
	expect(screen.getByText('Master Services Agreement')).toBeInTheDocument();
	// the gate pill shows in the header
	expect(screen.getByText('Fiduciary-grade')).toBeInTheDocument();
});
it('omits the fiduciary receipt block when there is no ledger', () => {
	render(SessionDetail, {
		props: {
			initialSession: session,
			initialReceipt: null,
			initialFindings: [],
			initialFindingsTotal: 0,
			initialMemories: [],
			initialLedger: null
		}
	});
	expect(screen.queryByText('Fiduciary receipt')).not.toBeInTheDocument();
});
it('fires onopensource when a ledger source is clicked', async () => {
	const onopensource = vi.fn();
	render(SessionDetail, {
		props: {
			initialSession: session,
			initialReceipt: null,
			initialFindings: [],
			initialFindingsTotal: 0,
			initialMemories: [],
			initialLedger: ledger,
			onopensource
		}
	});
	await fireEvent.click(screen.getByText('Master Services Agreement'));
	expect(onopensource).toHaveBeenCalledTimes(1);
	expect(onopensource.mock.calls[0][0].id).toBe('le1');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/automations/SessionDetail.svelte.test.ts`
Expected: FAIL — no "Fiduciary receipt" text.

- [ ] **Step 3: Implement the `SessionDetail` changes**

In `src/lib/automations/SessionDetail.svelte`:

Add imports:

```ts
import FiduciaryReceipt from '$lib/fiduciary/FiduciaryReceipt.svelte';
import type { Ledger, LedgerEntry } from '$lib/fiduciary/ledger';
```

Add the two new props to the `$props()` destructure and type block (both optional, defaulting to keep existing call sites valid):

```ts
		initialArtifacts = null,
		initialArtifactsTotal = null,
		initialLedger = null,
		onopenartifact,
		onopensource
	}: {
		initialSession: SessionSummary;
		initialReceipt: SessionReceipt | null;
		initialFindings: FindingItem[] | null;
		initialFindingsTotal: number | null;
		initialMemories: RunMemoryItem[] | null;
		initialMemoriesTotal?: number | null;
		initialArtifacts?: ArtifactItem[] | null;
		initialArtifactsTotal?: number | null;
		initialLedger?: Ledger | null;
		onopenartifact?: (artifact: ArtifactItem) => void;
		onopensource?: (entry: LedgerEntry) => void;
	} = $props();
```

Add the derived ledger + gate alongside the other `$derived` lines (using the same `pick` helper so a degraded live tick keeps last-known-good):

```ts
const ledger = $derived(pick(live.ledger, initialLedger));
const gate = $derived(ledger?.gates[0] ?? null);
```

Update the markup: pass `gate` to the header, and add the receipt block between `RunResults` and `SessionTimeline`:

```svelte
<div class="flex flex-col gap-4">
	<SessionReceiptHeader {session} {receipt} {gate} />
	{#if session.status === 'running'}
		<p class="text-xs text-mlq-workflow">Running — live updating…</p>
	{/if}
	<RunResults
		{findings}
		{findingsTotal}
		{memories}
		{memoriesTotal}
		{artifacts}
		{artifactsTotal}
		{onopenartifact}
		running={session.status === 'running'}
	/>
	{#if ledger}
		<FiduciaryReceipt entries={ledger.entries} {gate} {onopensource} />
	{/if}
	<SessionTimeline {receipt} />
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/automations/SessionDetail.svelte.test.ts`
Expected: PASS (including the pre-existing Results/timeline order tests, which pass no `initialLedger` and rely on the `null` default so the block is absent).

- [ ] **Step 5: Wire the page**

In `src/routes/(app)/automations/[id]/+page.svelte`, add the import and pass the two new props (the page already creates `docPanel`):

```ts
import { openLedgerSource } from '$lib/fiduciary/openSource';
```

Inside the `<SessionDetail ... />` in the `{#key data.session.id}` block, add:

```svelte
initialArtifactsTotal={data.artifacts_total}
initialLedger={data.ledger}
onopenartifact={openArtifact}
onopensource={(e) => openLedgerSource(docPanel, e)}
```

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/automations/SessionDetail.svelte src/lib/automations/SessionDetail.svelte.test.ts "src/routes/(app)/automations/[id]/+page.svelte"
git commit -m "feat(fiduciary): fiduciary receipt block + gate pill in the automations session view"
```

---

### Task 6: Live e2e — SQL-seeded session ledger renders on `/automations/[id]`

A self-cleaning Playwright test that SQL-seeds an autonomous session, its hidden backing chat (linked via `chats.autonomous_session_id`), a caselaw citation, and a citation ledger entry, then asserts the session view renders the fiduciary receipt + gate pill + the seeded source.

**Files:**

- Create: `tests/fiduciary-session-ledger.spec.ts`

**Interfaces:**

- Consumes: the full slice (Tasks 1–5) rendered by the running stack.
- Produces: a passing live e2e run.

**Preconditions (do these first, they are the evidence step):**

- Rebuild the app container so it serves this branch's code: `docker compose up -d --build donna-web`.
- The stack is up at pin `5aa9135`; the admin fixture exists (`admin@lq.ai`). `DONNA_E2E_PASSWORD` is set in the environment.
- Read `tests/fiduciary-receipt.spec.ts` (the `sql()` helper + the caselaw-citation seed) and this task's SQL below — mirror the `sql()`/`login()` helpers exactly (creds `lq_ai`/`lq_ai` via `docker compose exec -T postgres psql`).

- [ ] **Step 1: Write the e2e test**

Create `tests/fiduciary-session-ledger.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf8', env: { ...process.env, POSTGRES_USER: 'lq_ai', POSTGRES_DB: 'lq_ai' } }
	).trim();
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// The autonomous-session ledger endpoint reads the hidden backing chat linked by
// chats.autonomous_session_id (migration 0063) and manufactures a single gate.
// Seed: a completed session + its hidden chat + an assistant message + a caselaw
// citation + a citation_ledger_entry (needs exactly one source FK — the caselaw
// citation id, mirroring the chat-receipt seed which needs no file FK).
test('automations session view renders the fiduciary receipt + gate pill', async ({ page }) => {
	const sessionId = randomUUID();
	const chatId = randomUUID();
	const asstMsgId = randomUUID();
	const citeId = randomUUID();
	const ownerId = sql(`SELECT id FROM users WHERE email = '${EMAIL}'`);

	sql(
		`INSERT INTO autonomous_sessions (id, user_id, trigger_kind, current_phase, status, cost_total_usd, max_cost_usd, completed_at)` +
			` VALUES ('${sessionId}','${ownerId}','manual','delivery','completed',0.12,2.00, now())`
	);
	sql(
		`INSERT INTO chats (id, owner_id, title, autonomous_session_id) VALUES ('${chatId}','${ownerId}','e2e-session-ledger chat','${sessionId}')`
	);
	sql(
		`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Under California law the non-compete is unenforceable.','ai')`
	);
	sql(
		`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
			` VALUES ('${citeId}','${asstMsgId}',100,200,0,20,'Edwards v. Arthur Andersen',true,'exact_match')`
	);
	sql(
		`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
			` VALUES ('${chatId}','${asstMsgId}','caselaw','${citeId}','exact_match',0.98,'courtlistener')`
	);

	try {
		await login(page);
		await page.goto(`/automations/${sessionId}`);

		// The fiduciary receipt block renders, with the seeded caselaw source.
		await expect(page.getByText('Fiduciary receipt')).toBeVisible();
		await expect(page.getByText(/Opinion #100|Edwards/)).toBeVisible();

		// A session gate trust pill renders in the header (tone is manufactured
		// server-side; assert one of the four known verdict labels is present).
		await expect(
			page.getByText(/Fiduciary-grade|Supported|Needs review|No sourced claims/).first()
		).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM autonomous_sessions WHERE id='${sessionId}'`);
	}
});
```

- [ ] **Step 2: Verify the seeded ledger actually loads before trusting the UI assertions**

Before running Playwright, confirm the endpoint returns entries for the seeded session (evidence-first — if the backend's `build_session_ledger` needs a column this plan didn't seed, catch it here, not in a flaky UI assertion). Seed the rows manually with the SQL above (substituting a fresh session/chat/message/cite UUID and the real owner id), then:

Run (from the app, authenticated) or inspect the proxy: `docker compose exec -T postgres psql -U lq_ai -d lq_ai -At -c "SELECT count(*) FROM citation_ledger_entry WHERE chat_id='<chatId>'"` → expect `1`, and confirm `chats.autonomous_session_id` is set. If the live `GET /api/v1/autonomous/sessions/<sessionId>/ledger` (via the BFF proxy while logged in) returns 404, the hidden-chat link or a required column is missing — fix the seed before proceeding. Clean up the manual rows.

- [ ] **Step 3: Run the e2e**

Run: `npx playwright test tests/fiduciary-session-ledger.spec.ts`
Expected: PASS (self-cleaning — the `finally` deletes the chat + session; `message_caselaw_citations` and `citation_ledger_entry` cascade from the chat/message delete, matching the Slice 1 spec's teardown).

- [ ] **Step 4: Run the full gates one more time**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full unit suite passing.

- [ ] **Step 5: Commit**

```bash
git add tests/fiduciary-session-ledger.spec.ts
git commit -m "test(fiduciary): live e2e for the autonomous-session fiduciary receipt"
```

---

### Task 7: Whole-branch review, PR, merge, mirror

- [ ] **Step 1: Opus whole-branch review**

Dispatch an Opus review of the full branch diff against `main` per `superpowers:requesting-code-review`, focused on: honest-degradation correctness (404 → null, page never breaks), last-known-good in `pollSession`, no accidental coupling to `preferences/TrustPill`, and that no new parser/component duplicates the shared substrate. Address any blocking findings with follow-up commits.

- [ ] **Step 2: Update the pin-decision / segment docs if needed**

No pin bump this slice (still `5aa9135`). Confirm `docs/decisions/lq-ai-pin.md` top entry already reflects `5aa9135`; no change expected.

- [ ] **Step 3: Open the PR with a merge commit**

```bash
git push -u origin feat/fiduciary-slice3-autonomous-timeline
gh pr create --base main --title "feat(fiduciary): Slice 3 — autonomous matter audit timeline" --body "<summary + test evidence>"
```

- [ ] **Step 4: Merge with a merge commit (never squash), then mirror `main` to tucuxi**

```bash
gh pr merge --merge
git checkout main && git pull
git push tucuxi main
```

---

## Self-Review

**Spec coverage (design §5 Slice 3):**

- Session-level gate verdict as a headline pill in `SessionReceiptHeader` → Task 3. ✅
- Session ledger as a "Fiduciary receipt" block in `SessionDetail`, reusing `FiduciaryReceipt.svelte`, alongside `SessionTimeline` + `RunResults` → Task 5. ✅
- Data via `GET /autonomous/sessions/{id}/ledger`, folded into the existing session load + poll proxy, degrading to `null` independently → Tasks 1 + 2. ✅
- Reuses the shared substrate (no new parser/component); click-through reused via a shared helper → Task 4. ✅
- Live e2e SQL-seeding the ledger keyed to the hidden chat (`chats.autonomous_session_id`) → Task 6. ✅

**Placeholder scan:** every code and test step contains complete code; no TBD/TODO/"similar to". ✅

**Type consistency:** `loadSessionLedger(event, sessionId): Promise<Ledger | null>` (T1) → `data.ledger` (T1 return) / poll-proxy `ledger` field (T1) → `poll.ledger` getter (T2) → `initialLedger`/derived `ledger` + `gate = ledger?.gates[0] ?? null` (T5). `SessionReceiptHeader` `gate?: LedgerGate | null` (T3) consumed by T5. `FiduciaryReceipt` props `entries: LedgerEntry[]`, `gate: LedgerGate | null`, `onopensource?: (e: LedgerEntry) => void` (existing) match T5's usage. `openLedgerSource(docPanel: DocPanel, entry: LedgerEntry)` (T4) matches both page call sites. ✅
