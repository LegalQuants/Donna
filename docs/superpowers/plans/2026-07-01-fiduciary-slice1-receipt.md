# Fiduciary Auditability — Slice 1 (Per-Turn Fiduciary Receipt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a per-assistant-turn **trust pill** to the chat footer that expands a **citation-ledger panel** — the honest provenance superset (gate verdict + each quoted source with a verification chip), driven by `GET /chats/{id}/ledger`.

**Architecture:** A shared substrate under `src/lib/fiduciary/` — defensive `ledger.ts` parsers (the ledger response is shape-typed but the runtime returns `dict[str,Any]`, and `entry.source` is opaque/polymorphic, so hand-parse) and a `trust.ts` vocabulary module (the four-state gate verdict + per-entry verification-chip mapping). Two presentational components (`FiduciaryPill.svelte`, `FiduciaryReceipt.svelte`) reused later by Slice 3. Data reaches the chat view-model by mirroring the existing `loadSources`/`loadCitations` pattern (a new `chats/[id]/ledger/+server.ts` proxy + `loadLedger` in the stream store + one-shot hydration on page load).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest, Playwright, the generated `backend.d.ts` types.

## Global Constraints

- **Never edit `vendor/lq-ai`.** Gates: `npm run check` 0/0, `npm run lint` clean, `npx vitest run` green.
- **Tabs** for indentation. **Svelte 5 runes** (`$props`, `$state`, `$derived`).
- **Defensive parsers at the boundary** — local `str`/`num`/`obj` guards, drop malformed rows, never throw (template: `src/lib/research/sources.ts`, `src/lib/automations/findings.ts`).
- **Honest degradation** — a failed ledger fetch leaves the pill/panel absent; never breaks the message. Live fetch keeps last-known-good (only overwrite the view-model field on a non-empty result), mirroring `loadSources`.
- **Route-server test files are named `page.server.test.ts` / `*.server.test.ts` (NO `+` prefix)** — the repo convention.
- **The four trust states** (owned by `trust.ts`; switch on `gate_status`, there is NO `verdict` field). Map to the approved colors:
  | Gate condition | Label | Token / class |
  |---|---|---|
  | `fiduciary_grade` & `total_assertions > 0` | **Fiduciary-grade** | `mlq-verified` (green) |
  | `supported_only` | **Supported** | `mlq-caveats` (amber) |
  | `flagged` | **Needs review** | `mlq-unverified` / `mlq-error` (red) |
  | `fiduciary_grade` & `total_assertions === 0` | **No sourced claims** | `mlq-muted` (neutral grey) — **never green** |
- **Design correction (supersedes spec §5 Slice 1):** the fiduciary pill is a **distinct** component, **always visible** on any assistant turn that has a gate (mirroring the always-shown "N sources consulted" pill at `Message.svelte:177-188`). It is **NOT** gated by `trust_pills` (that is a `labels`/`dots` format enum for the unrelated model-provenance `preferences/TrustPill.svelte`) and needs **no new preference key**. A master on/off is a deferred follow-up.
- **The ledger contract** (verified in `src/lib/api/backend.d.ts`):
  - `GET /api/v1/chats/{chat_id}/ledger?message_id={uuid}` → `{ chat_id?, entries?: LedgerEntry[], gates?: Gate[] }` (omit `message_id` for the whole chat).
  - `Gate` (typed inline): `{ message_id?, gate_status?: "fiduciary_grade"|"supported_only"|"flagged", pass_count?, supported_count?, fail_count?, total_assertions?, confidence?: number|null, created_at? }`.
  - `LedgerEntry` scalars typed: `{ id?, message_id?, source_kind?: string (OPEN — the generated enum lists only kb_document|caselaw|mcp; treat as open), verification_status?: string, confidence?: number|null, provider?: string|null, retrieved_at?, treatment_id?, created_at? }`. **`source` is opaque** — hand-parse, branching on `source.kind`:
    - `kb_document`: `{ kind, source_file_id, passages: [{ text, offset_start, offset_end, page }] }`
    - `caselaw`: `{ kind, opinion_id, cluster_id, passages: [{ text, offset_start, offset_end }] }`
    - authority (`kind` = a content-kind like `statute`/`regulation`): `{ kind, external_ref, provider, passages: [{ text, offset_start, offset_end, verified, method }] }`
    - tool source (provenance): `{ kind, label, subtitle, url, external_ref, tool }` — **no `passages`**
  - `verification_status` values: verification method (`exact_match`,`tolerant_match`,`paraphrase_judge`,`ensemble_strict`,`ensemble_majority`,`llm_judge`,`failed`) OR the derived `"unverified"` / `"provenance"`. Provenance/tool rows are excluded from the gate and shown in a lighter group.
  - **Treatment is Slice 2** — parse `treatment_id` only here; ignore the `treatment` object.

## File Structure

- Create `src/lib/fiduciary/ledger.ts` — types + `parseLedger`, `parseGate`, `parseEntry`, `parseSource`.
- Create `src/lib/fiduciary/ledger.test.ts`.
- Create `src/lib/fiduciary/trust.ts` — `gateVerdict`, `entryVerification`.
- Create `src/lib/fiduciary/trust.test.ts`.
- Create `src/lib/fiduciary/FiduciaryReceipt.svelte` + `.test.ts`.
- Create `src/lib/fiduciary/FiduciaryPill.svelte` + `.test.ts`.
- Create `src/routes/(app)/chats/[id]/ledger/+server.ts` + `ledger/server.test.ts`.
- Modify `src/lib/chat/chatStream.svelte.ts` — `LedgerEntry`/`LedgerGate` on `ChatMessage`, `loadLedger`, call in `consumeStream`.
- Modify `src/routes/(app)/chats/[id]/+page.server.ts` — one-shot ledger hydration grouped by `message_id`.
- Modify `src/lib/components/Message.svelte` — `showLedger` toggle, leading pill, panel render.
- Create `tests/fiduciary-receipt.spec.ts` — live e2e (SQL-seeded).

---

### Task 1: `ledger.ts` view-model + defensive parsers

**Files:** Create `src/lib/fiduciary/ledger.ts`, `src/lib/fiduciary/ledger.test.ts`.

**Interfaces — Produces:**

```ts
export interface LedgerPassage {
	text: string;
	offset_start: number | null;
	offset_end: number | null;
	page: number | null;
	verified: boolean | null;
	method: string | null;
}
export interface LedgerSource {
	kind: string;
	source_file_id: string | null;
	opinion_id: number | null;
	cluster_id: number | null;
	external_ref: string | null;
	provider: string | null;
	label: string | null;
	subtitle: string | null;
	url: string | null;
	tool: string | null;
	passages: LedgerPassage[];
}
export interface LedgerEntry {
	id: string;
	message_id: string | null;
	source_kind: string;
	verification_status: string;
	confidence: number | null;
	provider: string | null;
	retrieved_at: string | null;
	treatment_id: string | null;
	created_at: string | null;
	source: LedgerSource | null;
}
export interface LedgerGate {
	message_id: string | null;
	gate_status: string;
	pass_count: number;
	supported_count: number;
	fail_count: number;
	total_assertions: number;
	confidence: number | null;
	created_at: string | null;
}
export interface Ledger {
	entries: LedgerEntry[];
	gates: LedgerGate[];
}
export function parseLedger(raw: unknown): Ledger;
export function gateForMessage(ledger: Ledger, messageId: string): LedgerGate | null;
export function entriesForMessage(ledger: Ledger, messageId: string): LedgerEntry[];
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fiduciary/ledger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLedger, gateForMessage, entriesForMessage } from './ledger';

// Real payload shapes from the integration doc §2.4.
const RAW = {
	chat_id: '6f1c2a90-1111-4aaa-bbbb-000000000001',
	entries: [
		{
			id: 'a1000000-0000-4000-8000-000000000001',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'kb_document',
			verification_status: 'exact_match',
			confidence: 1.0,
			provider: null,
			retrieved_at: null,
			treatment_id: null,
			created_at: '2026-06-30T12:00:00+00:00',
			source: {
				kind: 'kb_document',
				source_file_id: 'c3000000-0000-4000-8000-000000000003',
				passages: [
					{
						text: 'This Agreement shall be governed by',
						offset_start: 0,
						offset_end: 35,
						page: null
					}
				]
			}
		},
		{
			id: 'a1000000-0000-4000-8000-000000000004',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'caselaw',
			verification_status: 'tolerant_match',
			confidence: 0.9,
			provider: 'courtlistener',
			retrieved_at: '2026-06-30T11:59:00+00:00',
			treatment_id: 'd4000000-0000-4000-8000-000000000005',
			created_at: '2026-06-30T12:00:01+00:00',
			source: {
				kind: 'caselaw',
				opinion_id: 2812209,
				cluster_id: 654321,
				passages: [{ text: 'The court held that...', offset_start: 40, offset_end: 120 }]
			}
		},
		{
			id: 'a1000000-0000-4000-8000-000000000006',
			message_id: 'b2000000-0000-4000-8000-000000000002',
			source_kind: 'caselaw',
			verification_status: 'provenance',
			confidence: null,
			source: {
				kind: 'caselaw',
				label: 'Miranda v. Arizona',
				subtitle: 'U.S. Supreme Court',
				url: 'https://x',
				external_ref: '10648',
				tool: 'search_case_law'
			}
		}
	],
	gates: [
		{
			message_id: 'b2000000-0000-4000-8000-000000000002',
			gate_status: 'supported_only',
			pass_count: 1,
			supported_count: 0,
			fail_count: 0,
			total_assertions: 1,
			confidence: 0.95,
			created_at: '2026-06-30T12:00:02+00:00'
		}
	]
};

describe('parseLedger', () => {
	it('parses entries, gates, and branches source by kind', () => {
		const l = parseLedger(RAW);
		expect(l.entries).toHaveLength(3);
		expect(l.gates).toHaveLength(1);
		const kb = l.entries[0];
		expect(kb.source_kind).toBe('kb_document');
		expect(kb.source?.source_file_id).toBe('c3000000-0000-4000-8000-000000000003');
		expect(kb.source?.passages[0].text).toBe('This Agreement shall be governed by');
		const cl = l.entries[1];
		expect(cl.source?.opinion_id).toBe(2812209);
		expect(cl.treatment_id).toBe('d4000000-0000-4000-8000-000000000005');
		const tool = l.entries[2];
		expect(tool.verification_status).toBe('provenance');
		expect(tool.source?.label).toBe('Miranda v. Arizona');
		expect(tool.source?.passages).toEqual([]);
	});

	it('parses the gate scalars', () => {
		const g = parseLedger(RAW).gates[0];
		expect(g.gate_status).toBe('supported_only');
		expect(g.total_assertions).toBe(1);
		expect(g.confidence).toBe(0.95);
	});

	it('drops entries with no id and tolerates a malformed envelope', () => {
		expect(parseLedger(null)).toEqual({ entries: [], gates: [] });
		expect(parseLedger({ entries: 'no', gates: 5 })).toEqual({ entries: [], gates: [] });
		const l = parseLedger({
			entries: [{ source_kind: 'kb_document' }, { id: 'x', source_kind: 'caselaw' }]
		});
		expect(l.entries).toHaveLength(1);
		expect(l.entries[0].id).toBe('x');
		expect(l.entries[0].source).toBeNull();
	});

	it('groups by message_id', () => {
		const l = parseLedger(RAW);
		const mid = 'b2000000-0000-4000-8000-000000000002';
		expect(entriesForMessage(l, mid)).toHaveLength(3);
		expect(gateForMessage(l, mid)?.gate_status).toBe('supported_only');
		expect(gateForMessage(l, 'nope')).toBeNull();
	});
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/fiduciary/ledger.test.ts` → "Failed to resolve import './ledger'").

- [ ] **Step 3: Implement** `src/lib/fiduciary/ledger.ts`:

```ts
// src/lib/fiduciary/ledger.ts
// Defensive view model for GET /api/v1/chats/{id}/ledger and the identical
// autonomous-session ledger. The response is shape-typed in backend.d.ts but the
// runtime returns dict[str,Any] and `entry.source` is opaque/polymorphic — so we
// hand-parse here (house style of research.ts / findings.ts), dropping malformed
// rows rather than throwing. Treatment (Slice 2) is not parsed here beyond treatment_id.

export interface LedgerPassage {
	text: string;
	offset_start: number | null;
	offset_end: number | null;
	page: number | null;
	verified: boolean | null;
	method: string | null;
}
export interface LedgerSource {
	kind: string;
	source_file_id: string | null;
	opinion_id: number | null;
	cluster_id: number | null;
	external_ref: string | null;
	provider: string | null;
	label: string | null;
	subtitle: string | null;
	url: string | null;
	tool: string | null;
	passages: LedgerPassage[];
}
export interface LedgerEntry {
	id: string;
	message_id: string | null;
	source_kind: string;
	verification_status: string;
	confidence: number | null;
	provider: string | null;
	retrieved_at: string | null;
	treatment_id: string | null;
	created_at: string | null;
	source: LedgerSource | null;
}
export interface LedgerGate {
	message_id: string | null;
	gate_status: string;
	pass_count: number;
	supported_count: number;
	fail_count: number;
	total_assertions: number;
	confidence: number | null;
	created_at: string | null;
}
export interface Ledger {
	entries: LedgerEntry[];
	gates: LedgerGate[];
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function bool(v: unknown): boolean | null {
	return typeof v === 'boolean' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parsePassage(raw: unknown): LedgerPassage {
	const r = obj(raw);
	return {
		text: str(r.text) ?? '',
		offset_start: num(r.offset_start),
		offset_end: num(r.offset_end),
		page: num(r.page),
		verified: bool(r.verified),
		method: str(r.method)
	};
}

function parseSource(raw: unknown): LedgerSource | null {
	const r = obj(raw);
	const kind = str(r.kind);
	if (!kind) return null;
	const passages = Array.isArray(r.passages) ? r.passages.map(parsePassage) : [];
	return {
		kind,
		source_file_id: str(r.source_file_id),
		opinion_id: num(r.opinion_id),
		cluster_id: num(r.cluster_id),
		external_ref: str(r.external_ref),
		provider: str(r.provider),
		label: str(r.label),
		subtitle: str(r.subtitle),
		url: str(r.url),
		tool: str(r.tool),
		passages
	};
}

function parseEntry(raw: unknown): LedgerEntry | null {
	const r = obj(raw);
	const id = str(r.id);
	if (!id) return null;
	return {
		id,
		message_id: str(r.message_id),
		source_kind: str(r.source_kind) ?? 'unknown',
		verification_status: str(r.verification_status) ?? 'unverified',
		confidence: num(r.confidence),
		provider: str(r.provider),
		retrieved_at: str(r.retrieved_at),
		treatment_id: str(r.treatment_id),
		created_at: str(r.created_at),
		source: parseSource(r.source)
	};
}

function parseGate(raw: unknown): LedgerGate | null {
	const r = obj(raw);
	const gate_status = str(r.gate_status);
	if (!gate_status) return null;
	return {
		message_id: str(r.message_id),
		gate_status,
		pass_count: num(r.pass_count) ?? 0,
		supported_count: num(r.supported_count) ?? 0,
		fail_count: num(r.fail_count) ?? 0,
		total_assertions: num(r.total_assertions) ?? 0,
		confidence: num(r.confidence),
		created_at: str(r.created_at)
	};
}

export function parseLedger(raw: unknown): Ledger {
	const r = obj(raw);
	const entries = (Array.isArray(r.entries) ? r.entries : [])
		.map(parseEntry)
		.filter((e): e is LedgerEntry => e !== null);
	const gates = (Array.isArray(r.gates) ? r.gates : [])
		.map(parseGate)
		.filter((g): g is LedgerGate => g !== null);
	return { entries, gates };
}

export function entriesForMessage(ledger: Ledger, messageId: string): LedgerEntry[] {
	return ledger.entries.filter((e) => e.message_id === messageId);
}
export function gateForMessage(ledger: Ledger, messageId: string): LedgerGate | null {
	return ledger.gates.find((g) => g.message_id === messageId) ?? null;
}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/lib/fiduciary/ledger.test.ts`).
- [ ] **Step 5: Commit** — `git add src/lib/fiduciary/ledger.ts src/lib/fiduciary/ledger.test.ts && git commit -m "feat(fiduciary): defensive ledger parsers"` (add the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer).

---

### Task 2: `trust.ts` — gate verdict + entry verification vocabulary

**Files:** Create `src/lib/fiduciary/trust.ts`, `src/lib/fiduciary/trust.test.ts`.

**Interfaces — Consumes:** `LedgerGate` (Task 1). **Produces:**

```ts
export type TrustTone = 'grade' | 'supported' | 'review' | 'none';
export interface GateVerdict {
	tone: TrustTone;
	label: string;
	explanation: string;
	pillClass: string;
	dotClass: string;
}
export function gateVerdict(gate: LedgerGate | null): GateVerdict | null; // null when no gate
export type EntryState = 'verified' | 'caveats' | 'unverified' | 'provenance';
export interface EntryChip {
	state: EntryState;
	label: string;
	cls: string;
}
export function entryVerification(status: string): EntryChip;
export function isProvenance(status: string): boolean;
```

- [ ] **Step 1: Write the failing tests** — `src/lib/fiduciary/trust.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gateVerdict, entryVerification, isProvenance } from './trust';
import type { LedgerGate } from './ledger';

function gate(p: Partial<LedgerGate>): LedgerGate {
	return {
		message_id: 'm',
		gate_status: 'fiduciary_grade',
		pass_count: 0,
		supported_count: 0,
		fail_count: 0,
		total_assertions: 0,
		confidence: null,
		created_at: null,
		...p
	};
}

describe('gateVerdict', () => {
	it('fiduciary_grade with assertions → green grade', () => {
		const v = gateVerdict(
			gate({ gate_status: 'fiduciary_grade', total_assertions: 3, pass_count: 3 })
		)!;
		expect(v.tone).toBe('grade');
		expect(v.label).toBe('Fiduciary-grade');
		expect(v.pillClass).toContain('mlq-verified');
	});
	it('fiduciary_grade with ZERO assertions → neutral, never green', () => {
		const v = gateVerdict(gate({ gate_status: 'fiduciary_grade', total_assertions: 0 }))!;
		expect(v.tone).toBe('none');
		expect(v.label).toBe('No sourced claims');
		expect(v.pillClass).toContain('mlq-muted');
		expect(v.pillClass).not.toContain('mlq-verified');
	});
	it('supported_only → amber', () => {
		const v = gateVerdict(
			gate({ gate_status: 'supported_only', total_assertions: 2, supported_count: 2 })
		)!;
		expect(v.tone).toBe('supported');
		expect(v.label).toBe('Supported');
		expect(v.pillClass).toContain('mlq-caveats');
	});
	it('flagged → red "Needs review"', () => {
		const v = gateVerdict(gate({ gate_status: 'flagged', total_assertions: 2, fail_count: 1 }))!;
		expect(v.tone).toBe('review');
		expect(v.label).toBe('Needs review');
		expect(v.pillClass).toContain('mlq-unverified');
	});
	it('null gate → null (no pill)', () => {
		expect(gateVerdict(null)).toBeNull();
	});
	it('unknown gate_status → treated as review (fail-safe)', () => {
		expect(gateVerdict(gate({ gate_status: 'weird', total_assertions: 1 }))!.tone).toBe('review');
	});
});

describe('entryVerification', () => {
	it('exact/tolerant/ensemble → verified green', () => {
		for (const s of ['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']) {
			expect(entryVerification(s).state).toBe('verified');
		}
	});
	it('paraphrase/llm judge → caveats amber', () => {
		expect(entryVerification('paraphrase_judge').state).toBe('caveats');
		expect(entryVerification('llm_judge').state).toBe('caveats');
	});
	it('unverified/failed → unverified red', () => {
		expect(entryVerification('unverified').state).toBe('unverified');
		expect(entryVerification('failed').state).toBe('unverified');
	});
	it('provenance → provenance', () => {
		expect(entryVerification('provenance').state).toBe('provenance');
		expect(isProvenance('provenance')).toBe(true);
		expect(isProvenance('exact_match')).toBe(false);
	});
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `src/lib/fiduciary/trust.ts`:

```ts
// src/lib/fiduciary/trust.ts
// The single owner of the fiduciary trust vocabulary: the per-turn gate verdict
// (4 states, incl. the total_assertions===0 → neutral honesty rule) and the
// per-entry verification chip. Colors use the citation-domain mlq tokens so the
// pill stays consistent with inline citations. Switch on gate_status (there is no
// `verdict` field).
import type { LedgerGate } from './ledger';

export type TrustTone = 'grade' | 'supported' | 'review' | 'none';
export interface GateVerdict {
	tone: TrustTone;
	label: string;
	explanation: string;
	pillClass: string;
	dotClass: string;
}

export function gateVerdict(gate: LedgerGate | null): GateVerdict | null {
	if (!gate) return null;
	// Honesty rule: fiduciary_grade with zero assertions means "nothing to verify",
	// NOT "verified" — render neutral, never green.
	if (gate.gate_status === 'fiduciary_grade' && gate.total_assertions === 0) {
		return {
			tone: 'none',
			label: 'No sourced claims',
			explanation: 'This answer did not quote or rely on a specific source.',
			pillClass: 'border-mlq-subtle bg-mlq-surface-alt text-mlq-muted',
			dotClass: 'bg-mlq-muted'
		};
	}
	if (gate.gate_status === 'fiduciary_grade') {
		return {
			tone: 'grade',
			label: 'Fiduciary-grade',
			explanation: 'Every quoted claim was matched against its original source.',
			pillClass: 'border-mlq-verified/40 bg-mlq-verified/10 text-mlq-verified',
			dotClass: 'bg-mlq-verified'
		};
	}
	if (gate.gate_status === 'supported_only') {
		return {
			tone: 'supported',
			label: 'Supported',
			explanation: 'Claims are backed by the sources in substance, verified by meaning.',
			pillClass: 'border-mlq-caveats/40 bg-mlq-caveats/15 text-mlq-caveats',
			dotClass: 'bg-mlq-caveats'
		};
	}
	// flagged, or any unknown status → fail-safe to the cautious "needs review".
	return {
		tone: 'review',
		label: 'Needs review',
		explanation: 'At least one quoted claim could not be confirmed in its source.',
		pillClass: 'border-mlq-unverified/40 bg-mlq-unverified/10 text-mlq-unverified',
		dotClass: 'bg-mlq-unverified'
	};
}

export type EntryState = 'verified' | 'caveats' | 'unverified' | 'provenance';
export interface EntryChip {
	state: EntryState;
	label: string;
	cls: string;
}

const GREEN = new Set(['exact_match', 'tolerant_match', 'ensemble_strict', 'ensemble_majority']);
const AMBER = new Set(['paraphrase_judge', 'llm_judge']);

export function isProvenance(status: string): boolean {
	return status === 'provenance';
}

export function entryVerification(status: string): EntryChip {
	if (status === 'provenance') {
		return { state: 'provenance', label: 'consulted', cls: 'bg-mlq-surface-alt text-mlq-muted' };
	}
	if (GREEN.has(status)) {
		return { state: 'verified', label: 'verified', cls: 'bg-mlq-verified/15 text-mlq-verified' };
	}
	if (AMBER.has(status)) {
		return { state: 'caveats', label: 'supported', cls: 'bg-mlq-caveats/20 text-mlq-caveats' };
	}
	return {
		state: 'unverified',
		label: 'unverified',
		cls: 'bg-mlq-unverified/15 text-mlq-unverified'
	};
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(fiduciary): trust vocabulary (gate verdict + entry chip)`.

---

### Task 3: `FiduciaryReceipt.svelte` panel

**Files:** Create `src/lib/fiduciary/FiduciaryReceipt.svelte`, `src/lib/fiduciary/FiduciaryReceipt.test.ts`.

**Interfaces — Consumes:** `LedgerEntry`, `LedgerGate` (Task 1); `gateVerdict`, `entryVerification`, `isProvenance` (Task 2). **Produces:** `<FiduciaryReceipt {entries} {gate} />` where `entries: LedgerEntry[]`, `gate: LedgerGate | null`.

- [ ] **Step 1: Write the failing test** — `src/lib/fiduciary/FiduciaryReceipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FiduciaryReceipt from './FiduciaryReceipt.svelte';
import type { LedgerEntry, LedgerGate } from './ledger';

const gate: LedgerGate = {
	message_id: 'm',
	gate_status: 'supported_only',
	pass_count: 1,
	supported_count: 0,
	fail_count: 0,
	total_assertions: 1,
	confidence: 0.95,
	created_at: null
};
function entry(p: Partial<LedgerEntry>): LedgerEntry {
	return {
		id: 'e',
		message_id: 'm',
		source_kind: 'kb_document',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		created_at: null,
		source: {
			kind: 'kb_document',
			source_file_id: 'f',
			opinion_id: null,
			cluster_id: null,
			external_ref: null,
			provider: null,
			label: null,
			subtitle: null,
			url: null,
			tool: null,
			passages: [
				{
					text: 'governing law clause',
					offset_start: 0,
					offset_end: 20,
					page: null,
					verified: null,
					method: null
				}
			]
		},
		...p
	};
}

describe('FiduciaryReceipt', () => {
	it('renders the gate summary and a quoted entry with its verification chip', () => {
		render(FiduciaryReceipt, { entries: [entry({})], gate });
		expect(screen.getByText(/1 assertion/i)).toBeInTheDocument();
		expect(screen.getByText(/governing law clause/i)).toBeInTheDocument();
		expect(screen.getByText(/verified/i)).toBeInTheDocument();
	});
	it('separates provenance ("consulted") rows into a lighter group', () => {
		const prov = entry({
			id: 'p',
			verification_status: 'provenance',
			source: {
				kind: 'caselaw',
				source_file_id: null,
				opinion_id: null,
				cluster_id: null,
				external_ref: null,
				provider: null,
				label: 'Miranda v. Arizona',
				subtitle: null,
				url: null,
				tool: 'search_case_law',
				passages: []
			}
		});
		render(FiduciaryReceipt, { entries: [entry({}), prov], gate });
		expect(screen.getByText(/consulted, not quoted/i)).toBeInTheDocument();
		expect(screen.getByText(/Miranda v. Arizona/)).toBeInTheDocument();
	});
	it('shows the honest zero-assertion state', () => {
		render(FiduciaryReceipt, {
			entries: [],
			gate: { ...gate, gate_status: 'fiduciary_grade', total_assertions: 0 }
		});
		expect(screen.getByText(/no sourced claims/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `src/lib/fiduciary/FiduciaryReceipt.svelte` (clone the `ToolSourcesPanel.svelte` card shape; split provenance vs quoted entries; per-entry chip via `entryVerification`; source title branches on `source.kind`):

```svelte
<!-- src/lib/fiduciary/FiduciaryReceipt.svelte -->
<!-- The per-turn fiduciary receipt: gate summary + one row per ledger entry
     (source identity + quoted passage + verification chip), with provenance
     ("consulted, not quoted") rows in a lighter group. Reused by Slice 3. -->
<script lang="ts">
	import type { LedgerEntry, LedgerGate } from './ledger';
	import { gateVerdict, entryVerification, isProvenance } from './trust';

	let { entries, gate }: { entries: LedgerEntry[]; gate: LedgerGate | null } = $props();

	const verdict = $derived(gateVerdict(gate));
	const quoted = $derived(entries.filter((e) => !isProvenance(e.verification_status)));
	const consulted = $derived(entries.filter((e) => isProvenance(e.verification_status)));

	function sourceTitle(e: LedgerEntry): string {
		const s = e.source;
		if (!s) return e.source_kind;
		if (s.label) return s.label;
		if (s.kind === 'kb_document') return 'Knowledge-base document';
		if (s.kind === 'caselaw') return s.opinion_id ? `Opinion #${s.opinion_id}` : 'Case law';
		if (s.external_ref) return s.external_ref;
		return s.kind;
	}
</script>

<div class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs">
	<p class="mb-1 font-medium text-mlq-text">Fiduciary receipt</p>
	{#if verdict}
		<p class="mb-2 text-mlq-muted">
			{verdict.explanation}
			{#if gate && gate.total_assertions > 0}
				· {gate.total_assertions} assertion{gate.total_assertions === 1 ? '' : 's'}
			{/if}
		</p>
	{/if}

	{#if quoted.length > 0}
		<ul class="space-y-2">
			{#each quoted as e (e.id)}
				{@const chip = entryVerification(e.verification_status)}
				<li>
					<span class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-mlq-text">{sourceTitle(e)}</span>
						<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase {chip.cls}">
							{chip.label}{#if e.confidence !== null}
								· {Math.round(e.confidence * 100)}%{/if}
						</span>
					</span>
					{#each e.source?.passages ?? [] as p (p.text)}
						<span class="mt-0.5 block border-l-2 border-mlq-subtle pl-2 text-mlq-muted italic"
							>“{p.text}”</span
						>
					{/each}
				</li>
			{/each}
		</ul>
	{/if}

	{#if consulted.length > 0}
		<p class="mt-3 mb-1 text-[10px] font-semibold tracking-wide text-mlq-muted uppercase">
			Consulted, not quoted
		</p>
		<ul class="space-y-1">
			{#each consulted as e (e.id)}
				<li class="text-mlq-muted">
					{e.source?.label ?? sourceTitle(e)}{#if e.source?.subtitle}
						— {e.source.subtitle}{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
```

- [ ] **Step 4: Run — expect PASS.** Then `npm run check` (0/0), `npm run lint` (clean; `npx prettier --write` the two files if needed).
- [ ] **Step 5: Commit** — `feat(fiduciary): FiduciaryReceipt ledger panel`.

---

### Task 4: `FiduciaryPill.svelte`

**Files:** Create `src/lib/fiduciary/FiduciaryPill.svelte`, `src/lib/fiduciary/FiduciaryPill.test.ts`.

**Interfaces — Consumes:** `LedgerGate` (Task 1), `gateVerdict` (Task 2). **Produces:** `<FiduciaryPill {gate} expanded onclick />` — a button.

- [ ] **Step 1: Write the failing test** — `src/lib/fiduciary/FiduciaryPill.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FiduciaryPill from './FiduciaryPill.svelte';
import type { LedgerGate } from './ledger';

const gate: LedgerGate = {
	message_id: 'm',
	gate_status: 'flagged',
	pass_count: 1,
	supported_count: 0,
	fail_count: 1,
	total_assertions: 2,
	confidence: 1,
	created_at: null
};

describe('FiduciaryPill', () => {
	it('renders the verdict label as a button with aria-expanded', () => {
		render(FiduciaryPill, { gate, expanded: false, onclick: () => {} });
		const btn = screen.getByRole('button', { name: /needs review/i });
		expect(btn).toBeInTheDocument();
		expect(btn.getAttribute('aria-expanded')).toBe('false');
	});
	it('renders nothing when gate is null', () => {
		const { container } = render(FiduciaryPill, { gate: null, expanded: false, onclick: () => {} });
		expect(container.querySelector('button')).toBeNull();
	});
	it('fires onclick', async () => {
		const onclick = vi.fn();
		const { default: userEvent } = await import('@testing-library/user-event');
		render(FiduciaryPill, { gate, expanded: false, onclick });
		await userEvent.click(screen.getByRole('button', { name: /needs review/i }));
		expect(onclick).toHaveBeenCalled();
	});
});
```

> If `@testing-library/user-event` is not a dependency, use `fireEvent.click` from `@testing-library/svelte` instead (grep an existing `*.svelte.test.ts` to confirm which is used) — do not add a dependency.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `src/lib/fiduciary/FiduciaryPill.svelte`:

```svelte
<!-- src/lib/fiduciary/FiduciaryPill.svelte -->
<!-- The always-visible per-turn trust pill. Distinct from the model-provenance
     preferences/TrustPill.svelte. Renders nothing when there is no gate. -->
<script lang="ts">
	import type { LedgerGate } from './ledger';
	import { gateVerdict } from './trust';

	let {
		gate,
		expanded,
		onclick
	}: { gate: LedgerGate | null; expanded: boolean; onclick: () => void } = $props();

	const verdict = $derived(gateVerdict(gate));
</script>

{#if verdict}
	<button
		type="button"
		{onclick}
		aria-expanded={expanded}
		title={verdict.explanation}
		class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold {verdict.pillClass}"
	>
		<span class="inline-block h-1.5 w-1.5 rounded-full {verdict.dotClass}"></span>
		{verdict.label}
	</button>
{/if}
```

- [ ] **Step 4: Run — expect PASS**, then `npm run check` + `npm run lint`.
- [ ] **Step 5: Commit** — `feat(fiduciary): FiduciaryPill trust badge`.

---

### Task 5: Ledger BFF proxy + client `loadLedger`

**Files:** Create `src/routes/(app)/chats/[id]/ledger/+server.ts`, `src/routes/(app)/chats/[id]/ledger/server.test.ts`. Modify `src/lib/chat/chatStream.svelte.ts`.

**Interfaces — Consumes:** `parseLedger`, `LedgerEntry`, `LedgerGate`, `gateForMessage`, `entriesForMessage` (Task 1). **Produces:** the GET proxy at `/chats/{id}/ledger?message_id=`; `ChatMessage` gains `ledgerEntries?: LedgerEntry[]` and `ledgerGate?: LedgerGate | null`; `loadLedger(idx)` populates them.

- [ ] **Step 1: Write the failing proxy test** — `src/routes/(app)/chats/[id]/ledger/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

function ev(messageId?: string) {
	const url = new URL(`http://x/chats/c1/ledger${messageId ? `?message_id=${messageId}` : ''}`);
	return { params: { id: 'c1' }, url } as never;
}

describe('ledger proxy', () => {
	beforeEach(() => lqFetch.mockReset());
	it('forwards message_id and returns the json', async () => {
		lqFetch.mockImplementationOnce(async (_e: unknown, path: string) => {
			expect(path).toBe('/api/v1/chats/c1/ledger?message_id=m1');
			return { ok: true, json: async () => ({ entries: [], gates: [] }) } as unknown as Response;
		});
		const res = await GET(ev('m1'));
		expect(await res.json()).toEqual({ entries: [], gates: [] });
	});
	it('omits the query param when no message_id', async () => {
		lqFetch.mockImplementationOnce(async (_e: unknown, path: string) => {
			expect(path).toBe('/api/v1/chats/c1/ledger');
			return { ok: true, json: async () => ({ entries: [], gates: [] }) } as unknown as Response;
		});
		await GET(ev());
	});
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement the proxy** `src/routes/(app)/chats/[id]/ledger/+server.ts` (mirror `messages/[message_id]/citations/+server.ts`):

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const messageId = event.url.searchParams.get('message_id');
	const q = messageId ? `?message_id=${encodeURIComponent(messageId)}` : '';
	const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/ledger${q}`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load the ledger.');
	return json(await res.json());
};
```

- [ ] **Step 4: Run the proxy test — expect PASS.**

- [ ] **Step 5: Wire `loadLedger` into `chatStream.svelte.ts`.** (a) Import at the top: `import { parseLedger, gateForMessage, entriesForMessage, type LedgerEntry, type LedgerGate } from '$lib/fiduciary/ledger';`. (b) Add to the `ChatMessage` interface (beside `sources?`): `ledgerEntries?: LedgerEntry[]; ledgerGate?: LedgerGate | null;`. (c) Add the loader (clone `loadSources`, last-known-good):

```ts
async function loadLedger(idx: number) {
	const id = messages[idx].id;
	if (!id || id === 'pending') return;
	try {
		const res = await fetch(`/chats/${chatId}/ledger?message_id=${id}`);
		if (!res.ok) return;
		const ledger = parseLedger(await res.json());
		const entries = entriesForMessage(ledger, id);
		if (entries.length > 0) messages[idx].ledgerEntries = entries;
		const gate = gateForMessage(ledger, id);
		if (gate) messages[idx].ledgerGate = gate;
	} catch {
		/* non-blocking */
	}
}
```

(d) Call it in `consumeStream` beside the others (after `loadSources(idx)`): `await loadLedger(idx);`.

- [ ] **Step 6: Run** `npx vitest run src/lib/chat "src/routes/(app)/chats/[id]/ledger"` and `npm run check` — expect green (the added optional fields don't break existing chat tests).
- [ ] **Step 7: Commit** — `feat(fiduciary): ledger proxy + loadLedger on live turns`.

---

### Task 6: One-shot ledger hydration on chat page load

**Files:** Modify `src/routes/(app)/chats/[id]/+page.server.ts`. Add/extend `src/routes/(app)/chats/[id]/page.server.test.ts` (create if absent).

**Interfaces — Consumes:** `parseLedger`, `entriesForMessage`, `gateForMessage` (Task 1). **Produces:** existing assistant messages in `data` carry `ledgerEntries` / `ledgerGate`.

- [ ] **Step 1: Write the failing test** covering: when the chat has assistant messages, the load fetches `/api/v1/chats/{id}/ledger` ONCE (no per-message calls) and attaches `ledgerEntries`/`ledgerGate` grouped by message id; a failed ledger fetch degrades to messages without ledger fields (page still loads). (Mirror the mock style of `research/page.server.test.ts`: `vi.mock('$lib/server/lqClient')`, sequential `mockImplementationOnce` for the throw case.) Assert on the returned `data`'s messages.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — after the existing per-message citation hydration block, add a single ledger fetch and distribute it:

```ts
// One-shot ledger hydration: fetch the whole chat ledger once, group by message_id.
try {
	const res = await lqFetch(event, `/api/v1/chats/${id}/ledger`);
	if (res.ok) {
		const ledger = parseLedger(await res.json());
		for (const m of messages) {
			if (m.role !== 'assistant') continue;
			const entries = entriesForMessage(ledger, m.id);
			if (entries.length > 0) m.ledgerEntries = entries;
			const gate = gateForMessage(ledger, m.id);
			if (gate) m.ledgerGate = gate;
		}
	}
} catch {
	/* ledger is optional — never break the page */
}
```

Add the import: `import { parseLedger, entriesForMessage, gateForMessage } from '$lib/fiduciary/ledger';` and, if the message view-model is a typed local, widen it to carry the optional `ledgerEntries`/`ledgerGate` (match how `citations`/`sources` are attached). Grep the file first to place this beside the existing hydration and use the actual `messages`/`id` variable names.

- [ ] **Step 4: Run — expect PASS**, then `npm run check`.
- [ ] **Step 5: Commit** — `feat(fiduciary): hydrate ledger on chat page load`.

---

### Task 7: Wire the pill + panel into `Message.svelte`

**Files:** Modify `src/lib/components/Message.svelte`. Add `src/lib/components/Message.fiduciary.test.ts` (or extend an existing Message test — grep for one first).

**Interfaces — Consumes:** `FiduciaryPill`, `FiduciaryReceipt` (Tasks 3–4); the `ledgerEntries` / `ledgerGate` fields on `message` (Tasks 5–6).

- [ ] **Step 1: Write the failing component test** — render `Message` with an assistant `message` carrying a `ledgerGate` (status `flagged`) + `ledgerEntries`; assert the "Needs review" pill button is present (always visible, independent of `provenance_pills`); clicking it reveals the receipt panel (the quoted passage text). Render with a mocked `page.data.user` if needed (grep an existing `Message` test for the `$app/state` mock pattern).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the wiring in `Message.svelte`:
      (a) Imports: `import FiduciaryPill from '$lib/fiduciary/FiduciaryPill.svelte';` and `import FiduciaryReceipt from '$lib/fiduciary/FiduciaryReceipt.svelte';`.
      (b) Add `let showLedger = $state(false);` beside `showSources` (~line 27).
      (c) Render the panel alongside `ToolSourcesPanel` (~line 162), gated on the toggle + a gate being present:

```svelte
{#if message.status === 'done' && message.ledgerGate && showLedger}
	<FiduciaryReceipt entries={message.ledgerEntries ?? []} gate={message.ledgerGate} />
{/if}
```

(d) Add the pill as the **leading** item of the footer flex row (before the Copy button at ~line 171), always visible when a gate exists:

```svelte
{#if message.ledgerGate}
	<FiduciaryPill
		gate={message.ledgerGate}
		expanded={showLedger}
		onclick={() => (showLedger = !showLedger)}
	/>
{/if}
```

Match surrounding indentation (tabs) and the existing footer markup exactly.

- [ ] **Step 4: Run — expect PASS.** Then the FULL gates: `npm run check` (0/0), `npm run lint` (clean), `npx vitest run` (full suite green — confirm no existing `Message`/chat test regressed, the way the Slice-0 nullish-prop regression was caught).
- [ ] **Step 5: Commit** — `feat(fiduciary): trust pill + receipt in the chat message footer`.

---

### Task 8: Live e2e (SQL-seeded ledger + gate)

**Files:** Create `tests/fiduciary-receipt.spec.ts`.

**Interfaces — Consumes:** the running stack + admin fixture. Self-cleaning (seed + teardown its own rows).

- [ ] **Step 1: Write the e2e.** Because the ledger is model-discretionary, **SQL-seed** a chat + assistant message + a `citation_ledger_entry` + a `work_product_fiduciary_gate` row via `docker compose exec -T postgres psql -U lq_ai -d lq_ai` (creds `lq_ai`/`lq_ai`), the way `tests/automations-artifacts.spec.ts` seeds markers. Then: `login`, open the chat, assert the trust pill (e.g. "Fiduciary-grade" or "Needs review" per the seeded gate) is visible on the assistant turn, click it, assert the receipt panel shows the seeded quoted passage. Teardown in `finally` (delete the seeded rows/chat). First **read `tests/automations-artifacts.spec.ts`** for the exact seed/login/teardown helpers and the real table columns (autonomous tables key on `session_id`; `files` key on `owner_id` — inspect the actual `citation_ledger_entry` / `work_product_fiduciary_gate` columns with `\d` before writing INSERTs).

- [ ] **Step 2: Run** `docker compose up -d --build donna-web` then `npx playwright test tests/fiduciary-receipt.spec.ts` (with `.env` loaded) — expect PASS. Debug selectors/seed against the live stack until green.
- [ ] **Step 3: Commit** — `test(fiduciary): e2e for the per-turn receipt`.

---

## Definition of done

- The shared substrate (`fiduciary/{ledger.ts,trust.ts}`) + both components exist and are unit-tested; the ledger flows into the chat view-model on both live turns and page load; the always-visible trust pill + expandable receipt render in the message footer; live e2e passes.
- `npm run check` 0/0, `npm run lint` clean, full `npx vitest run` green.
- PR to `main` with a **merge commit**. Next: Slice 2 (treatment/validity surfacing) reuses `FiduciaryReceipt.svelte`.

## Self-review notes

- **Spec coverage:** trust pill (four states incl. zero-assertion neutral) → Tasks 2/4/7; ledger panel (source-branched rows + verification chips + provenance group) → Tasks 1/3; data flow (proxy + live + load) → Tasks 5/6; honest degradation → parsers (Task 1) + null-guarded loaders (5/6); testing (unit + component + live SQL-seeded e2e) → each task + Task 8.
- **Design correction recorded:** the `trust_pills` gating from spec §5 is dropped (wrong lever — it's a model-pill format enum); the fiduciary pill is always-visible and needs no new preference key. Colors use `mlq-verified/caveats/unverified/muted` per the approved mockup.
- **Deferred to Slice 2:** the `treatment` object (only `treatment_id` is parsed here); the "checking treatment…" poll.
- **Type consistency:** `LedgerEntry`/`LedgerGate`/`Ledger` defined in Task 1 are imported unchanged by Tasks 2–7; `ledgerEntries`/`ledgerGate` field names are identical across the stream store (Task 5), the page load (Task 6), and `Message.svelte` (Task 7).

```

```
