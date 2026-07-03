# Fiduciary Auditor Reviewer View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only `/audit` surface where an `auditor`- or `admin`-role user verifies the citation ledger + fiduciary gate of **another user's** chat or autonomous session.

**Architecture:** A new top-level `/(app)/audit` route group. A `canAudit(user)` gate (role `auditor` or `is_admin`) guards both the landing form and the `/audit/[kind]/[id]` detail loader. The detail loader fetches the chat- or session-ledger via the BFF (`lqFetch`, which attaches the bearer and — on the backend — writes the audit-the-auditor row) and renders the **already-shipped** `FiduciaryPill` + `FiduciaryReceipt` from the parsed ledger. No backend calls beyond the ledger endpoints (nothing else is cross-user readable).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, Tailwind (`mlq-*` design tokens), Lucide icons.

## Global Constraints

- Backend pin `e40b98c`; contract in `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` §2.6a. **Never edit `vendor/lq-ai`.**
- Privileged reader = `is_admin || role === 'auditor'`. Cross-user readable endpoints: **only** `GET /api/v1/chats/{id}/ledger` and `GET /api/v1/autonomous/sessions/{id}/ledger` are used here. The messages list, session summary/findings/artifacts, and any user directory are **not** cross-user readable — do not call them.
- `404` from a ledger fetch is **existence-safe** (missing id and permission-miss are indistinguishable by design) — surface as "not found, or not accessible to your role", never distinguish.
- The UI **labels the target by id and never asserts ownership** (no owner-identity lookup exists for an auditor). It states the honest rule: "cross-user reads are recorded in the audit log."
- Reuse `FiduciaryReceipt.svelte`, `FiduciaryPill.svelte`, `ledger.ts`, `openSource.ts` **verbatim** — do not modify them.
- Server-only imports (`$lib/server/*`) never reach client code. Tabs for indentation. Svelte 5 runes throughout.
- Gates before "done": `npm run check` 0/0, `npm run lint` green, `npx vitest run` green, the e2e passing. Commit per task.

---

### Task 1: `canAudit` role gate helper

**Files:**

- Create: `src/lib/audit/gate.ts`
- Test: `src/lib/audit/gate.test.ts`

**Interfaces:**

- Produces: `canAudit(user: { role?: string | null; is_admin?: boolean } | null | undefined): boolean` — the single source of truth for "may use the compliance-review surface". Consumed by both route loaders (Tasks 3, 4) and the layout wiring (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audit/gate.test.ts
import { describe, it, expect } from 'vitest';
import { canAudit } from './gate';

describe('canAudit', () => {
	it('is true for an auditor', () => {
		expect(canAudit({ role: 'auditor', is_admin: false })).toBe(true);
	});
	it('is true for an admin regardless of role string', () => {
		expect(canAudit({ role: 'member', is_admin: true })).toBe(true);
	});
	it('is false for member and viewer', () => {
		expect(canAudit({ role: 'member', is_admin: false })).toBe(false);
		expect(canAudit({ role: 'viewer', is_admin: false })).toBe(false);
	});
	it('is false for null/undefined', () => {
		expect(canAudit(null)).toBe(false);
		expect(canAudit(undefined)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/audit/gate.test.ts`
Expected: FAIL — cannot find module `./gate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/audit/gate.ts
// Single source of truth for "may use the compliance-review surface".
// Privileged reader set = {admin, auditor} (integration doc §2.6a).
export function canAudit(
	user: { role?: string | null; is_admin?: boolean } | null | undefined
): boolean {
	return !!user && (user.is_admin === true || user.role === 'auditor');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/audit/gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit/gate.ts src/lib/audit/gate.test.ts
git commit -m "feat(audit): canAudit role gate helper"
```

---

### Task 2: `groupChatLedger` — per-turn grouping for chat review

**Files:**

- Create: `src/lib/audit/reviewGroups.ts`
- Test: `src/lib/audit/reviewGroups.test.ts`

**Interfaces:**

- Consumes: `Ledger`, `LedgerEntry`, `LedgerGate` from `$lib/fiduciary/ledger`; `gateForMessage` from the same module.
- Produces: `interface ReviewGroup { messageId: string | null; entries: LedgerEntry[]; gate: LedgerGate | null }` and `groupChatLedger(ledger: Ledger): ReviewGroup[]`. Groups a chat ledger by `message_id`, ordered by each group's earliest `created_at` (nulls last); entries whose `message_id` is null collapse into a single trailing group with `messageId: null` and `gate: null`. Consumed by the chat detail view (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audit/reviewGroups.test.ts
import { describe, it, expect } from 'vitest';
import { groupChatLedger } from './reviewGroups';
import type { Ledger, LedgerEntry, LedgerGate } from '$lib/fiduciary/ledger';

function entry(id: string, message_id: string | null, created_at: string | null): LedgerEntry {
	return {
		id,
		message_id,
		source_kind: 'caselaw',
		verification_status: 'exact_match',
		confidence: 1,
		provider: 'courtlistener',
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at,
		source: null
	};
}
function gate(message_id: string | null): LedgerGate {
	return {
		message_id,
		gate_status: 'fiduciary_grade',
		pass_count: 1,
		supported_count: 0,
		fail_count: 0,
		total_assertions: 1,
		confidence: 1,
		created_at: null
	};
}

describe('groupChatLedger', () => {
	it('groups by message_id and associates each gate', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', 'mA', '2026-07-03T10:00:00Z'),
				entry('e2', 'mA', '2026-07-03T10:00:01Z')
			],
			gates: [gate('mA')]
		};
		const groups = groupChatLedger(ledger);
		expect(groups).toHaveLength(1);
		expect(groups[0].messageId).toBe('mA');
		expect(groups[0].entries.map((e) => e.id)).toEqual(['e1', 'e2']);
		expect(groups[0].gate?.gate_status).toBe('fiduciary_grade');
	});

	it('orders groups by earliest created_at', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', 'mLate', '2026-07-03T12:00:00Z'),
				entry('e2', 'mEarly', '2026-07-03T09:00:00Z')
			],
			gates: []
		};
		const groups = groupChatLedger(ledger);
		expect(groups.map((g) => g.messageId)).toEqual(['mEarly', 'mLate']);
	});

	it('collapses null-message entries into a single trailing group with no gate', () => {
		const ledger: Ledger = {
			entries: [
				entry('e1', null, null),
				entry('e2', 'mA', '2026-07-03T09:00:00Z'),
				entry('e3', null, null)
			],
			gates: [gate('mA')]
		};
		const groups = groupChatLedger(ledger);
		expect(groups.map((g) => g.messageId)).toEqual(['mA', null]);
		const trailing = groups[groups.length - 1];
		expect(trailing.entries.map((e) => e.id)).toEqual(['e1', 'e3']);
		expect(trailing.gate).toBeNull();
	});

	it('returns [] for an empty ledger', () => {
		expect(groupChatLedger({ entries: [], gates: [] })).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/audit/reviewGroups.test.ts`
Expected: FAIL — cannot find module `./reviewGroups`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/audit/reviewGroups.ts
// Pure grouping of a chat ledger into per-turn review groups. A chat reviewer
// renders one FiduciaryReceipt + gate pill per message_id. Entries with a null
// message_id (rare/malformed) collapse into a single trailing "unattributed"
// group so nothing is silently dropped.
import type { Ledger, LedgerEntry, LedgerGate } from '$lib/fiduciary/ledger';
import { gateForMessage } from '$lib/fiduciary/ledger';

export interface ReviewGroup {
	messageId: string | null;
	entries: LedgerEntry[];
	gate: LedgerGate | null;
}

function earliest(entries: LedgerEntry[]): string | null {
	let min: string | null = null;
	for (const e of entries) {
		if (e.created_at === null) continue;
		if (min === null || e.created_at < min) min = e.created_at;
	}
	return min;
}

export function groupChatLedger(ledger: Ledger): ReviewGroup[] {
	const byMessage = new Map<string, LedgerEntry[]>();
	const unattributed: LedgerEntry[] = [];
	for (const e of ledger.entries) {
		if (e.message_id === null) {
			unattributed.push(e);
			continue;
		}
		const list = byMessage.get(e.message_id) ?? [];
		list.push(e);
		byMessage.set(e.message_id, list);
	}

	const attributed: ReviewGroup[] = [...byMessage.entries()].map(([messageId, entries]) => ({
		messageId,
		entries,
		gate: gateForMessage(ledger, messageId)
	}));

	// Order by each group's earliest created_at; groups with no timestamp sort last.
	attributed.sort((a, b) => {
		const ea = earliest(a.entries);
		const eb = earliest(b.entries);
		if (ea === null && eb === null) return 0;
		if (ea === null) return 1;
		if (eb === null) return -1;
		return ea < eb ? -1 : ea > eb ? 1 : 0;
	});

	if (unattributed.length > 0) {
		attributed.push({ messageId: null, entries: unattributed, gate: null });
	}
	return attributed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/audit/reviewGroups.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit/reviewGroups.ts src/lib/audit/reviewGroups.test.ts
git commit -m "feat(audit): groupChatLedger per-turn grouping"
```

---

### Task 3: `/audit` landing route (gate + open-by-id form)

**Files:**

- Create: `src/routes/(app)/audit/+page.server.ts`
- Create: `src/routes/(app)/audit/+page.svelte`
- Test: `src/routes/(app)/audit/page.server.test.ts`

**Interfaces:**

- Consumes: `canAudit` from `$lib/audit/gate`.
- Produces: the `/audit` page. Loader throws `error(403, …)` for non-privileged callers; otherwise returns `{}`. The page renders an explainer + a form (kind selector + id field) that navigates to `/audit/{kind}/{id}` on submit.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/audit/page.server.test.ts
import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

function ev(user: unknown) {
	return { locals: { user } } as never;
}

describe('/audit landing loader', () => {
	it('allows an auditor', async () => {
		await expect(load(ev({ role: 'auditor', is_admin: false }))).resolves.toEqual({});
	});
	it('allows an admin', async () => {
		await expect(load(ev({ role: 'member', is_admin: true }))).resolves.toEqual({});
	});
	it('403s a member', async () => {
		await expect(load(ev({ role: 'member', is_admin: false }))).rejects.toMatchObject({
			status: 403
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/audit/page.server.test.ts"`
Expected: FAIL — cannot find module `./+page.server`.

- [ ] **Step 3: Write the loader**

```ts
// src/routes/(app)/audit/+page.server.ts
import { error } from '@sveltejs/kit';
import { canAudit } from '$lib/audit/gate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canAudit(locals.user)) {
		throw error(403, 'Compliance review is available to auditor and admin roles only.');
	}
	return {};
};
```

- [ ] **Step 4: Write the page**

```svelte
<!-- src/routes/(app)/audit/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';

	let kind = $state<'chat' | 'session'>('chat');
	let id = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = id.trim();
		if (!trimmed) return;
		goto(`/audit/${kind}/${encodeURIComponent(trimmed)}`);
	}
</script>

<svelte:head><title>Compliance review — Donna</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="mb-1 text-xl font-medium text-mlq-text">Compliance review</h1>
	<p class="mb-4 text-sm text-mlq-muted">
		Read-only. Open a chat or autonomous session by its id to verify its citation ledger and
		fiduciary gate. There is no browse — you review by known id. Cross-user reads are recorded in
		the deployment audit log.
	</p>

	<form
		onsubmit={submit}
		class="flex flex-col gap-3 rounded-mlq-control border border-mlq-subtle p-4"
	>
		<div class="flex gap-4 text-sm">
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="kind"
					value="chat"
					checked={kind === 'chat'}
					onchange={() => (kind = 'chat')}
				/>
				Chat
			</label>
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="kind"
					value="session"
					checked={kind === 'session'}
					onchange={() => (kind = 'session')}
				/>
				Autonomous session
			</label>
		</div>
		<input
			type="text"
			bind:value={id}
			placeholder={kind === 'chat' ? 'chat id (uuid)' : 'session id (uuid)'}
			aria-label="Target id"
			class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
		/>
		<button
			type="submit"
			class="self-start rounded-mlq-control bg-mlq-workflow px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
			disabled={!id.trim()}
		>
			Open review
		</button>
	</form>
</div>
```

- [ ] **Step 5: Run tests + check**

Run: `npx vitest run "src/routes/(app)/audit/page.server.test.ts" && npm run check`
Expected: tests PASS (3); check 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/audit/+page.server.ts" "src/routes/(app)/audit/+page.svelte" "src/routes/(app)/audit/page.server.test.ts"
git commit -m "feat(audit): /audit landing — role gate + open-by-id form"
```

---

### Task 4: `/audit/[kind]/[id]` detail loader

**Files:**

- Create: `src/routes/(app)/audit/[kind]/[id]/+page.server.ts`
- Test: `src/routes/(app)/audit/[kind]/[id]/page.server.test.ts`

**Interfaces:**

- Consumes: `canAudit` from `$lib/audit/gate`; `lqFetch` from `$lib/server/lqClient`; `parseLedger` from `$lib/fiduciary/ledger`.
- Produces: loader returning `{ kind: 'chat' | 'session'; id: string; ledger: Ledger; role: string }`. `403` for non-privileged; `404` for unknown `kind` or a `404` ledger fetch; `502` for other non-ok. The endpoint is `/api/v1/chats/{id}/ledger` for `chat`, `/api/v1/autonomous/sessions/{id}/ledger` for `session`.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/audit/[kind]/[id]/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { load } from './+page.server';

const LEDGER = {
	entries: [
		{
			id: 'e1',
			message_id: 'm1',
			source_kind: 'caselaw',
			verification_status: 'exact_match',
			created_at: '2026-07-03T10:00:00Z'
		}
	],
	gates: [
		{
			message_id: 'm1',
			gate_status: 'fiduciary_grade',
			pass_count: 1,
			supported_count: 0,
			fail_count: 0,
			total_assertions: 1
		}
	]
};

function ev(user: unknown, kind: string, id: string) {
	return { locals: { user }, params: { kind, id } } as never;
}

beforeEach(() => lqFetch.mockReset());

describe('/audit/[kind]/[id] loader', () => {
	it('loads a chat ledger for a privileged caller and hits the chat endpoint', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => LEDGER });
		const out = (await load(ev({ role: 'auditor' }, 'chat', 'c1'))) as {
			kind: string;
			ledger: { entries: unknown[] };
		};
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/chats/c1/ledger');
		expect(out.kind).toBe('chat');
		expect(out.ledger.entries).toHaveLength(1);
	});

	it('loads a session ledger and hits the session endpoint', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => LEDGER });
		await load(ev({ is_admin: true }, 'session', 's1'));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/autonomous/sessions/s1/ledger'
		);
	});

	it('403s a non-privileged caller (no fetch)', async () => {
		await expect(load(ev({ role: 'member' }, 'chat', 'c1'))).rejects.toMatchObject({ status: 403 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('404s an unknown kind', async () => {
		await expect(load(ev({ role: 'auditor' }, 'widget', 'c1'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('404s an existence-safe ledger 404', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
		await expect(load(ev({ role: 'auditor' }, 'chat', 'c1'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('502s other non-ok responses', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
		await expect(load(ev({ role: 'auditor' }, 'chat', 'c1'))).rejects.toMatchObject({
			status: 502
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/audit/[kind]/[id]/page.server.test.ts"`
Expected: FAIL — cannot find module `./+page.server`.

- [ ] **Step 3: Write the loader**

```ts
// src/routes/(app)/audit/[kind]/[id]/+page.server.ts
import { error } from '@sveltejs/kit';
import { canAudit } from '$lib/audit/gate';
import { lqFetch } from '$lib/server/lqClient';
import { parseLedger } from '$lib/fiduciary/ledger';
import type { PageServerLoad } from './$types';

const ENDPOINT: Record<string, (id: string) => string> = {
	chat: (id) => `/api/v1/chats/${id}/ledger`,
	session: (id) => `/api/v1/autonomous/sessions/${id}/ledger`
};

export const load: PageServerLoad = async (event) => {
	const { locals, params } = event;
	if (!canAudit(locals.user)) {
		throw error(403, 'Compliance review is available to auditor and admin roles only.');
	}
	const build = ENDPOINT[params.kind];
	if (!build) throw error(404, 'Unknown review target.');

	const res = await lqFetch(event, build(params.id));
	if (res.status === 404) throw error(404, 'Not found, or not accessible to your role.');
	if (!res.ok) throw error(502, 'Could not load the ledger.');

	const ledger = parseLedger(await res.json());
	return {
		kind: params.kind as 'chat' | 'session',
		id: params.id,
		ledger,
		role: locals.user?.role ?? 'auditor'
	};
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/audit/[kind]/[id]/page.server.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/audit/[kind]/[id]/+page.server.ts" "src/routes/(app)/audit/[kind]/[id]/page.server.test.ts"
git commit -m "feat(audit): /audit/[kind]/[id] ledger loader (chat + session)"
```

---

### Task 5: `/audit/[kind]/[id]` detail page (render receipts + doc panel)

**Files:**

- Create: `src/routes/(app)/audit/[kind]/[id]/+page.svelte`
- Test: `src/routes/(app)/audit/[kind]/[id]/page.svelte.test.ts`

**Interfaces:**

- Consumes: `PageData` from Task 4 (`{ kind, id, ledger, role }`); `groupChatLedger` from `$lib/audit/reviewGroups`; `FiduciaryPill`, `FiduciaryReceipt` from `$lib/fiduciary/*`; `openLedgerSource` from `$lib/fiduciary/openSource`; `createDocPanel` + `DocumentPanel` from `$lib/docpanel/*`.
- Produces: the detail page. Chat → one `FiduciaryPill` + `FiduciaryReceipt` per review group; session → one pill + one receipt over the whole ledger. Honest header; empty-state when the ledger has no entries.

- [ ] **Step 1: Write the failing component test**

```ts
// src/routes/(app)/audit/[kind]/[id]/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { Ledger } from '$lib/fiduciary/ledger';

function chatLedger(): Ledger {
	return {
		entries: [
			{
				id: 'e1',
				message_id: 'm1',
				source_kind: 'caselaw',
				verification_status: 'exact_match',
				confidence: 1,
				provider: 'courtlistener',
				retrieved_at: null,
				treatment_id: null,
				treatment: null,
				created_at: '2026-07-03T10:00:00Z',
				source: {
					kind: 'caselaw',
					source_file_id: null,
					opinion_id: 111,
					cluster_id: null,
					external_ref: null,
					provider: 'courtlistener',
					label: 'Edwards v. Arthur Andersen',
					subtitle: null,
					url: null,
					tool: null,
					passages: [
						{
							text: 'noncompetes are void',
							offset_start: null,
							offset_end: null,
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
				confidence: 1,
				created_at: null
			}
		]
	};
}

describe('/audit/[kind]/[id] page', () => {
	it('renders the honest header and a gate pill + receipt for a chat', () => {
		render(Page, {
			props: { data: { kind: 'chat', id: 'c1', role: 'auditor', ledger: chatLedger() } }
		});
		expect(screen.getByRole('heading', { name: /compliance review/i })).toBeInTheDocument();
		expect(screen.getByText(/recorded in the audit log/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /fiduciary-grade/i })).toBeInTheDocument();
		expect(screen.getByText(/Edwards v\. Arthur Andersen/i)).toBeInTheDocument();
	});

	it('renders an honest empty state for an empty ledger', () => {
		render(Page, {
			props: {
				data: { kind: 'session', id: 's1', role: 'admin', ledger: { entries: [], gates: [] } }
			}
		});
		expect(screen.getByText(/no ledger entries/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/audit/[kind]/[id]/page.svelte.test.ts"`
Expected: FAIL — cannot find module `./+page.svelte`.

- [ ] **Step 3: Write the page**

```svelte
<!-- src/routes/(app)/audit/[kind]/[id]/+page.svelte -->
<script lang="ts">
	import FiduciaryPill from '$lib/fiduciary/FiduciaryPill.svelte';
	import FiduciaryReceipt from '$lib/fiduciary/FiduciaryReceipt.svelte';
	import { openLedgerSource } from '$lib/fiduciary/openSource';
	import { groupChatLedger } from '$lib/audit/reviewGroups';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
	import type { ProvenanceSource } from '$lib/fiduciary/provenanceExport';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const docPanel = createDocPanel();
	// Per-turn collapse for the chat view (default open — a reviewer wants to see
	// everything, but can fold long chats). Keyed by the group key; a key absent
	// from the map means open.
	let collapsed = $state<Record<string, boolean>>({});
	const isOpen = (key: string) => collapsed[key] !== true;
	const toggle = (key: string) => (collapsed = { ...collapsed, [key]: isOpen(key) });

	const groups = $derived(data.kind === 'chat' ? groupChatLedger(data.ledger) : []);
	const sessionGate = $derived(data.ledger.gates[0] ?? null);
	const isEmpty = $derived(data.ledger.entries.length === 0);

	function chatExportMeta(messageId: string | null): ProvenanceSource | undefined {
		return messageId ? { type: 'chat_turn', chat_id: data.id, message_id: messageId } : undefined;
	}
</script>

<svelte:head><title>Compliance review — Donna</title></svelte:head>

<div class="flex h-full min-h-0">
	<div class="min-w-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-4 py-6">
			<a href="/audit" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
				>← Review</a
			>
			<h1 class="text-xl font-medium text-mlq-text">Compliance review</h1>
			<p class="mt-1 text-sm text-mlq-muted">
				{data.kind === 'chat' ? 'Chat' : 'Autonomous session'}
				<code class="rounded bg-mlq-surface-alt px-1 py-0.5 text-xs">{data.id}</code>
				· viewing as {data.role} · cross-user reads are recorded in the audit log.
			</p>

			{#if isEmpty}
				<p class="mt-6 text-sm text-mlq-muted">
					No ledger entries recorded for this {data.kind === 'chat' ? 'chat' : 'session'}.
				</p>
			{:else if data.kind === 'chat'}
				<div class="mt-4 space-y-4">
					{#each groups as g (g.messageId ?? 'unattributed')}
						{@const key = g.messageId ?? 'unattributed'}
						<section class="rounded-mlq-control border border-mlq-subtle p-3">
							<div class="mb-1">
								<FiduciaryPill gate={g.gate} expanded={isOpen(key)} onclick={() => toggle(key)} />
							</div>
							{#if isOpen(key)}
								<FiduciaryReceipt
									entries={g.entries}
									gate={g.gate}
									onopensource={(e) => openLedgerSource(docPanel, e)}
									exportMeta={chatExportMeta(g.messageId)}
								/>
							{/if}
						</section>
					{/each}
				</div>
			{:else}
				<div class="mt-4">
					<FiduciaryPill gate={sessionGate} expanded={true} onclick={() => {}} />
					<FiduciaryReceipt
						entries={data.ledger.entries}
						gate={sessionGate}
						onopensource={(e) => openLedgerSource(docPanel, e)}
						exportMeta={{ type: 'autonomous_session', session_id: data.id }}
					/>
				</div>
			{/if}
		</div>
	</div>
	{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
</div>
```

- [ ] **Step 4: Run test + check**

Run: `npx vitest run "src/routes/(app)/audit/[kind]/[id]/page.svelte.test.ts" && npm run check`
Expected: tests PASS (2); check 0/0. (If `FiduciaryReceipt` renders quoted passages only inside its own markup, the test asserts the source label + pill, which are always visible.)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/audit/[kind]/[id]/+page.svelte" "src/routes/(app)/audit/[kind]/[id]/page.svelte.test.ts"
git commit -m "feat(audit): reviewer detail page — per-turn receipts + doc panel"
```

---

### Task 6: Sidebar "Review" entry, gated on `canAudit`

**Files:**

- Modify: `src/lib/components/Sidebar.svelte` (add `canAudit` prop; conditionally include the nav item)
- Modify: `src/routes/(app)/+layout.svelte` (pass `canAudit`)
- Test: `src/lib/components/Sidebar.svelte.test.ts` (add cases)

**Interfaces:**

- Consumes: `canAudit` is computed in the layout from `data.user` and passed as a boolean prop `canAudit` (default `false`).
- Produces: a "Review" nav link (`href="/audit"`) present iff `canAudit`.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/components/Sidebar.svelte.test.ts` inside the `describe('Sidebar', …)` block:

```ts
it('shows a Review entry when canAudit is true', () => {
	render(Sidebar, { props: { displayName: 'Admin', canAudit: true } });
	expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/audit');
});

it('hides the Review entry by default (non-privileged)', () => {
	render(Sidebar, { props: { displayName: 'Member' } });
	expect(screen.queryByRole('link', { name: 'Review' })).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: FAIL — the "Review" link is not rendered.

- [ ] **Step 3: Add the prop + conditional nav item in `Sidebar.svelte`**

Change the props line and add `ShieldCheck` to the icon import, then build the nav array conditionally.

Replace the import block's icon list to include `ShieldCheck`:

```ts
import {
	MessageSquare,
	FolderKanban,
	Workflow,
	Table,
	Scale,
	ShieldCheck,
	PanelLeft,
	LogOut,
	Settings,
	Info
} from '@lucide/svelte';
```

Replace the props + nav declaration:

```ts
let { displayName = 'Account', canAudit = false }: { displayName?: string; canAudit?: boolean } =
	$props();
let open = $state(loadSidebar());

type NavItem = { href: string; label: string; icon: typeof MessageSquare; match?: string[] };
const nav: NavItem[] = [
	{ href: '/', label: 'Assistant', icon: MessageSquare },
	{ href: '/matters', label: 'Projects', icon: FolderKanban },
	{
		href: '/workflows',
		label: 'Workflows',
		icon: Workflow,
		match: ['/workflows', '/skills', '/playbooks', '/prompts', '/automations']
	},
	{ href: '/tabular', label: 'Tabular', icon: Table },
	{ href: '/research', label: 'Research', icon: Scale },
	...(canAudit ? [{ href: '/audit', label: 'Review', icon: ShieldCheck, match: ['/audit'] }] : [])
];
```

- [ ] **Step 4: Pass `canAudit` from the layout**

In `src/routes/(app)/+layout.svelte`, add the derived flag and pass it:

```svelte
<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { rebrandName } from '$lib/brand';
	import { canAudit } from '$lib/audit/gate';
	let { data, children } = $props();
	const displayName = $derived(
		rebrandName(data.user?.display_name) || data.user?.email?.split('@')[0] || 'Account'
	);
	const showAudit = $derived(canAudit(data.user));
</script>

<div class="flex h-screen overflow-hidden">
	<Sidebar {displayName} canAudit={showAudit} />
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
```

- [ ] **Step 5: Run tests + check + lint**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts && npm run check && npm run lint`
Expected: Sidebar tests PASS (existing + 2 new); check 0/0; lint green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Sidebar.svelte "src/routes/(app)/+layout.svelte" src/lib/components/Sidebar.svelte.test.ts
git commit -m "feat(audit): gated Review nav entry for auditor/admin"
```

---

### Task 7: Live e2e — cross-user chat review as a privileged reader

**Files:**

- Create: `tests/audit-review.spec.ts`

**Interfaces:**

- Consumes: the running stack (rebuild `donna-web` first), the admin fixture (`admin@lq.ai` — a privileged reader), and direct Postgres seeding (creds `lq_ai`/`lq_ai`).
- Produces: a self-cleaning e2e proving a privileged reader renders **another user's** chat receipt at `/audit/chat/{id}`, and that the "Review" nav entry is visible.

- [ ] **Step 1: Write the e2e**

```ts
// tests/audit-review.spec.ts
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// Cross-user auditor review (lq-ai #266). We SQL-seed a chat owned by a SECOND
// (foreign) user + an ai turn + a caselaw citation + a citation_ledger_entry +
// a fiduciary gate, then log in as the admin (a privileged reader) and assert
// /audit/chat/{id} renders the foreign user's receipt — proving the cross-user
// ledger read. Self-cleaning: the chat + foreign user are deleted in `finally`.

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

test("privileged reader reviews another user's chat ledger", async ({ page }) => {
	const adminId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!adminId, 'no e2e admin in the dev DB');

	const foreignUserId = randomUUID();
	const foreignEmail = `e2e-foreign-${foreignUserId.slice(0, 8)}@example.test`;
	const chatId = randomUUID();
	const userMsgId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		// A foreign owner (never logs in) — id/email/hashed_password are the only required cols.
		sql(
			`INSERT INTO users (id, email, hashed_password, role) VALUES ('${foreignUserId}','${foreignEmail}','x','member')`
		);
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${foreignUserId}','e2e-foreign chat')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${userMsgId}','${chatId}','user','Is our non-compete enforceable','user')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Generally no under California law.','ai')`
		);
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}', 2812209, 654321, 0, ${QUOTE.length}, '${QUOTE}', true, 'exact_match')`
		);
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match', 1.0, 'courtlistener')`
		);
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade', 1, 0, 0, 1, 1.0)`
		);

		await login(page);

		// The Review nav entry is visible to the privileged admin.
		await expect(page.getByRole('link', { name: 'Review' })).toBeVisible();

		// Open the foreign chat's review — the gate pill + quoted passage render.
		await page.goto(`/audit/chat/${chatId}`);
		await expect(page.getByRole('button', { name: /fiduciary-grade/i }).first()).toBeVisible();
		await expect(page.getByText(new RegExp(QUOTE.slice(0, 24), 'i'))).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM users WHERE id='${foreignUserId}'`);
	}
});
```

- [ ] **Step 2: Rebuild the web container (serves built code, not the working tree)**

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` rebuilds and reports healthy.

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/audit-review.spec.ts`
Expected: 1 passed. (Per-turn receipts default to **open**, so the quoted passage is visible without clicking the pill.)

- [ ] **Step 4: Commit**

```bash
git add tests/audit-review.spec.ts
git commit -m "test(audit): live e2e — cross-user chat review as a privileged reader"
```

---

## Final verification (before PR)

- [ ] `npm run check` → 0 errors / 0 warnings
- [ ] `npm run lint` → prettier + eslint fully green
- [ ] `npx vitest run` → whole suite green (1570 prior + the new unit/component tests)
- [ ] `npx playwright test tests/audit-review.spec.ts tests/fiduciary-receipt.spec.ts tests/research-sources.spec.ts` → green (regression + new)
- [ ] Whole-branch Opus review (superpowers:requesting-code-review), then open the PR to `main` with a **merge commit**, then `git push tucuxi feat/fiduciary-auditor-reviewer` and mirror `main` after merge.

## Self-review notes (author)

- **Spec coverage:** §2 boundary → Tasks 4/5 use only ledger endpoints; §3.1 landing → Task 3; §3.1 detail → Tasks 4/5; §3.2 nav → Task 6; §4 modules → Tasks 1/2 + reuse; §5 error handling → Task 4 (403/404/502) + Task 5 empty-state; §6 testing → unit (1–6) + e2e (7); §7 out-of-scope respected (no receipts bundle, no owner lookup, no session findings). Covered.
- **Owner identity:** never fetched or displayed — labelled by id only (Task 5 header). Matches the contract.
- **Type consistency:** `canAudit`, `groupChatLedger`/`ReviewGroup`, `PageData {kind,id,ledger,role}`, `ProvenanceSource` (`chat_turn`/`autonomous_session`), `FiduciaryPill` props (`gate`,`expanded`,`onclick`), `FiduciaryReceipt` props (`entries`,`gate`,`onopensource`,`exportMeta`) all match the shipped signatures verified in the source.
