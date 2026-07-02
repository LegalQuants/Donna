# Fiduciary Slice 4 — Provenance Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every assistant chat turn and autonomous session that has a fiduciary ledger an "Export provenance record" affordance that serializes the already-fetched ledger, entirely client-side, into a structured JSON envelope and a printable Markdown copy — honestly labelled "not a signed attestation."

**Architecture:** A pure, DOM-free serializer (`provenanceExport.ts`) turns `(entries, gate, meta)` into `{ json, markdown, baseFilename }`; a tiny separate DOM helper (`download.ts`) does the Blob download; the shared `FiduciaryReceipt.svelte` grows an optional `exportMeta`-gated "Export ▾" menu that both the chat turn (`Message.svelte`) and the autonomous session (`SessionDetail.svelte`) wire. The source-title logic is extracted once out of `FiduciaryReceipt` into the serializer so JSON, Markdown, and the on-screen receipt name a source identically.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte (jsdom), Playwright (live e2e against the Docker stack).

## Global Constraints

- **Never edit `vendor/lq-ai`** (pinned submodule, pin `5aa9135`).
- **Client-side assembly, no new backend route.** The ledger is already in the browser; export re-serializes it and never fetches.
- **No cryptographic claim.** The disclaimer is mandatory and appears in **both** outputs and the UI. Exact string (verbatim): `A faithful copy of the sourcing trail — not a cryptographically signed attestation.` Never imply signing, hashing, or tamper-evidence.
- **Reuse the shared substrate unchanged in behavior:** `LedgerEntry`/`LedgerGate` from `$lib/fiduciary/ledger`; `gateVerdict` / `entryVerification` / `isProvenance` from `$lib/fiduciary/trust`. No new parser.
- **JSON = a curated, versioned, self-describing envelope** `{ kind, version, disclaimer, source, exported_at, gate, entries }` — signed-export-ready (a future `signature` block / menu item drops in).
- **Markdown is the "printable" form** — no bespoke PDF, no doc-panel rendering, no server export.
- **The serializer is pure** — no DOM, no `Date` inside; the caller stamps `exported_at`. The DOM download is a **separate** helper.
- **Both surfaces this slice** (chat turn + autonomous session) via one `exportMeta`-gated affordance inside `FiduciaryReceipt`; when `exportMeta` is absent the affordance renders nothing.
- **Svelte 5 runes** (`$props`, `$state`, `$derived`); **tabs** for indentation (prettier-enforced); match neighboring files.
- **Gates every task:** `npm run check` = 0 errors / 0 warnings (ignore the harmless `ERR_MODULE_NOT_FOUND` referencing `vendor/lq-ai/...`); `npm run lint` fully green (prettier + eslint); `npx vitest run` passing. Run all three before marking a task complete.
- **Commit per task**; PR to `main` with a **merge commit** (never squash); mirror `main` to remote `tucuxi`.
- The export affordance is unrelated to `preferences/TrustPill.svelte` / `trust_pills` — do not touch them.

## File Structure

- `src/lib/fiduciary/provenanceExport.ts` (new) — `PROVENANCE_DISCLAIMER`, types, `ledgerSourceTitle`, `buildProvenanceExport`. Pure.
- `src/lib/fiduciary/download.ts` (new) — `downloadTextFile`. DOM-only.
- `src/lib/fiduciary/FiduciaryReceipt.svelte` (modify) — use `ledgerSourceTitle` (Task 1); add the `exportMeta` menu (Task 3).
- `src/lib/components/Message.svelte` (modify) — wire `exportMeta` (Task 3).
- `src/lib/automations/SessionDetail.svelte` (modify) — wire `exportMeta` (Task 3).
- Tests: `provenanceExport.test.ts`, `download.test.ts`, extend `FiduciaryReceipt.test.ts`, `tests/fiduciary-export.spec.ts` (e2e).

---

### Task 1: Pure serializer `provenanceExport.ts` + extract `ledgerSourceTitle`

**Files:**

- Create: `src/lib/fiduciary/provenanceExport.ts`
- Modify: `src/lib/fiduciary/FiduciaryReceipt.svelte` (replace the local `sourceTitle` with the imported `ledgerSourceTitle`)
- Test: `src/lib/fiduciary/provenanceExport.test.ts`

**Interfaces:**

- Consumes: `type LedgerEntry, LedgerGate` from `./ledger`; `gateVerdict, entryVerification, isProvenance` from `./trust`.
- Produces:
  - `PROVENANCE_DISCLAIMER: string`
  - `type ProvenanceSource = { type: 'chat_turn'; chat_id: string; message_id: string } | { type: 'autonomous_session'; session_id: string }`
  - `interface ProvenanceMeta { source: ProvenanceSource; exported_at: string }`
  - `interface ProvenanceExport { json: string; markdown: string; baseFilename: string }`
  - `ledgerSourceTitle(entry: LedgerEntry): string`
  - `buildProvenanceExport(entries: LedgerEntry[], gate: LedgerGate | null, meta: ProvenanceMeta): ProvenanceExport`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fiduciary/provenanceExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	buildProvenanceExport,
	ledgerSourceTitle,
	PROVENANCE_DISCLAIMER,
	type ProvenanceMeta
} from './provenanceExport';
import type { LedgerEntry, LedgerGate, LedgerTreatment } from './ledger';

function source(over: Partial<NonNullable<LedgerEntry['source']>> = {}) {
	return {
		kind: 'kb_document',
		source_file_id: 'f1',
		opinion_id: null,
		cluster_id: null,
		external_ref: null,
		provider: null,
		label: null,
		subtitle: null,
		url: null,
		tool: null,
		passages: [] as NonNullable<LedgerEntry['source']>['passages'],
		...over
	};
}
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
	return {
		id: 'e1',
		message_id: 'm1',
		source_kind: 'kb_document',
		verification_status: 'exact_match',
		confidence: 1,
		provider: null,
		retrieved_at: null,
		treatment_id: null,
		treatment: null,
		created_at: null,
		source: source(),
		...over
	};
}
const gate: LedgerGate = {
	message_id: 'm1',
	gate_status: 'fiduciary_grade',
	pass_count: 1,
	supported_count: 0,
	fail_count: 0,
	total_assertions: 2,
	confidence: 0.99,
	created_at: null
};
const sessionMeta: ProvenanceMeta = {
	source: { type: 'autonomous_session', session_id: 'a1b2c3d4-5555-6666-7777-888899990000' },
	exported_at: '2026-07-02T10:30:00.000Z'
};

describe('buildProvenanceExport — JSON envelope', () => {
	it('wraps entries + gate in a self-describing, disclaimer-bearing envelope', () => {
		const out = buildProvenanceExport(
			[
				entry({
					source: source({
						label: 'Master Agreement',
						passages: [
							{
								text: 'indemnity',
								offset_start: 0,
								offset_end: 9,
								page: null,
								verified: true,
								method: 'exact_match'
							}
						]
					})
				})
			],
			gate,
			sessionMeta
		);
		const env = JSON.parse(out.json);
		expect(env.kind).toBe('provenance_record');
		expect(env.version).toBe(1);
		expect(env.disclaimer).toBe(PROVENANCE_DISCLAIMER);
		expect(env.source).toEqual({
			type: 'autonomous_session',
			session_id: sessionMeta.source.session_id
		});
		expect(env.exported_at).toBe('2026-07-02T10:30:00.000Z');
		expect(env.gate.gate_status).toBe('fiduciary_grade');
		expect(env.entries).toHaveLength(1);
		expect(env.entries[0].source.label).toBe('Master Agreement');
	});
	it('serializes a null gate as null', () => {
		const env = JSON.parse(buildProvenanceExport([entry()], null, sessionMeta).json);
		expect(env.gate).toBeNull();
	});
});

describe('buildProvenanceExport — Markdown', () => {
	it('renders the disclaimer, source, verdict, a quoted source, and its passage', () => {
		const md = buildProvenanceExport(
			[
				entry({
					source: source({
						label: 'Master Agreement',
						passages: [
							{
								text: 'indemnity clause',
								offset_start: 0,
								offset_end: 9,
								page: null,
								verified: true,
								method: 'exact_match'
							}
						]
					})
				})
			],
			gate,
			sessionMeta
		).markdown;
		expect(md).toContain('# Provenance record');
		expect(md).toContain(`> ${PROVENANCE_DISCLAIMER}`);
		expect(md).toContain(`Autonomous session ${sessionMeta.source.session_id}`);
		expect(md).toContain('2026-07-02T10:30:00.000Z');
		expect(md).toContain('Fiduciary-grade');
		expect(md).toContain('## Sources cited');
		expect(md).toContain('Master Agreement');
		expect(md).toContain('> "indemnity clause"');
	});
	it('includes a treatment line for a caselaw entry and a Consulted section for provenance rows', () => {
		const treatment: LedgerTreatment = {
			cited_by_count: 214,
			as_of: null,
			derived_method: 'graph',
			citing: [],
			strongest_negative_class: 'distinguished',
			judged_count: null,
			judge_as_of: null,
			per_class_counts: {},
			case_confidence: null,
			signals: [
				{
					citing_opinion_id: 9,
					classification: 'distinguished',
					confidence: null,
					justification: 'narrow facts'
				}
			]
		};
		const md = buildProvenanceExport(
			[
				entry({
					verification_status: 'exact_match',
					source: source({
						kind: 'caselaw',
						source_file_id: null,
						opinion_id: 42,
						label: 'Roe v. Roe',
						passages: []
					}),
					treatment
				}),
				entry({
					id: 'e2',
					verification_status: 'provenance',
					source: source({ label: 'Consulted doc', subtitle: 'p. 3' })
				})
			],
			gate,
			sessionMeta
		).markdown;
		expect(md).toContain('Cited by 214');
		expect(md).toContain('distinguished');
		expect(md).toContain('## Consulted, not quoted');
		expect(md).toContain('Consulted doc');
	});
});

describe('baseFilename', () => {
	it('derives a session filename with a short id and the export date', () => {
		expect(buildProvenanceExport([entry()], gate, sessionMeta).baseFilename).toBe(
			'provenance-session-a1b2c3d4-2026-07-02'
		);
	});
	it('derives a chat filename from the message id', () => {
		const out = buildProvenanceExport([entry()], gate, {
			source: {
				type: 'chat_turn',
				chat_id: 'chat-9',
				message_id: 'deadbeef-1111-2222-3333-444455556666'
			},
			exported_at: '2026-07-02T09:00:00.000Z'
		});
		expect(out.baseFilename).toBe('provenance-chat-deadbeef-2026-07-02');
	});
});

describe('ledgerSourceTitle', () => {
	it('prefers an explicit label', () => {
		expect(ledgerSourceTitle(entry({ source: source({ label: 'My Doc' }) }))).toBe('My Doc');
	});
	it('names a kb document, a caselaw opinion, an external ref, and a bare kind', () => {
		expect(ledgerSourceTitle(entry({ source: source({ kind: 'kb_document' }) }))).toBe(
			'Knowledge-base document'
		);
		expect(
			ledgerSourceTitle(
				entry({ source: source({ kind: 'caselaw', source_file_id: null, opinion_id: 42 }) })
			)
		).toBe('Opinion #42');
		expect(
			ledgerSourceTitle(
				entry({
					source: source({
						kind: 'authority',
						source_file_id: null,
						external_ref: '17 U.S.C. § 106'
					})
				})
			)
		).toBe('17 U.S.C. § 106');
		expect(
			ledgerSourceTitle(entry({ source: source({ kind: 'tool_result', source_file_id: null }) }))
		).toBe('tool_result');
	});
	it('falls back to source_kind when there is no source', () => {
		expect(ledgerSourceTitle(entry({ source: null, source_kind: 'unknown' }))).toBe('unknown');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/fiduciary/provenanceExport.test.ts`
Expected: FAIL — module `./provenanceExport` does not exist.

- [ ] **Step 3: Implement the serializer**

Create `src/lib/fiduciary/provenanceExport.ts`:

```ts
// src/lib/fiduciary/provenanceExport.ts
// Pure, DOM-free serializer that turns a fiduciary ledger (entries + gate) into
// an honest, self-describing provenance record: a curated JSON envelope and a
// human-readable / printable Markdown copy. Signed-export-ready (a future
// `signature` block drops into the envelope). The caller stamps `exported_at`
// so this module has no time dependency and stays deterministically testable.
import type { LedgerEntry, LedgerGate } from './ledger';
import { gateVerdict, entryVerification, isProvenance } from './trust';

export const PROVENANCE_DISCLAIMER =
	'A faithful copy of the sourcing trail — not a cryptographically signed attestation.';

export type ProvenanceSource =
	| { type: 'chat_turn'; chat_id: string; message_id: string }
	| { type: 'autonomous_session'; session_id: string };

export interface ProvenanceMeta {
	source: ProvenanceSource;
	exported_at: string; // ISO-8601, stamped by the caller
}

export interface ProvenanceExport {
	json: string;
	markdown: string;
	baseFilename: string;
}

// Extracted verbatim from FiduciaryReceipt.svelte so the JSON, the Markdown, and
// the on-screen receipt name a polymorphic source identically.
export function ledgerSourceTitle(e: LedgerEntry): string {
	const s = e.source;
	if (!s) return e.source_kind;
	if (s.label) return s.label;
	if (s.kind === 'kb_document') return 'Knowledge-base document';
	if (s.kind === 'caselaw') return s.opinion_id ? `Opinion #${s.opinion_id}` : 'Case law';
	if (s.external_ref) return s.external_ref;
	return s.kind;
}

function sourceLine(s: ProvenanceSource): string {
	return s.type === 'chat_turn'
		? `Chat turn ${s.message_id} of chat ${s.chat_id}`
		: `Autonomous session ${s.session_id}`;
}

function verdictLine(gate: LedgerGate | null): string {
	const v = gateVerdict(gate);
	if (!v || !gate) return 'No fiduciary gate recorded.';
	const n = gate.total_assertions;
	return `${v.label}${n > 0 ? ` — ${n} assertion${n === 1 ? '' : 's'}` : ''}`;
}

function entryBlock(e: LedgerEntry): string {
	const chip = entryVerification(e.verification_status);
	const conf = e.confidence !== null ? ` · ${Math.round(e.confidence * 100)}%` : '';
	const lines = [`- **${ledgerSourceTitle(e)}** — ${chip.label}${conf}`];
	for (const p of e.source?.passages ?? []) lines.push(`  > "${p.text}"`);
	if (e.source?.kind === 'caselaw' && e.treatment) {
		const t = e.treatment;
		lines.push(
			`  - ⚖ Cited by ${t.cited_by_count ?? '—'} · derived${t.strongest_negative_class ? ` · strongest signal: ${t.strongest_negative_class}` : ''}`
		);
		for (const sig of t.signals)
			lines.push(
				`    - ${sig.classification}${sig.justification ? ` — ${sig.justification}` : ''}`
			);
	}
	return lines.join('\n');
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

export function buildProvenanceExport(
	entries: LedgerEntry[],
	gate: LedgerGate | null,
	meta: ProvenanceMeta
): ProvenanceExport {
	const envelope = {
		kind: 'provenance_record',
		version: 1,
		disclaimer: PROVENANCE_DISCLAIMER,
		source: meta.source,
		exported_at: meta.exported_at,
		gate,
		entries
	};
	const json = JSON.stringify(envelope, null, 2);

	const quoted = entries.filter((e) => !isProvenance(e.verification_status));
	const consulted = entries.filter((e) => isProvenance(e.verification_status));
	const md: string[] = [
		'# Provenance record',
		'',
		`> ${PROVENANCE_DISCLAIMER}`,
		'',
		`**Source:** ${sourceLine(meta.source)}`,
		`**Exported:** ${meta.exported_at}`,
		'',
		`**Verdict:** ${verdictLine(gate)}`,
		''
	];
	if (quoted.length > 0) {
		md.push('## Sources cited', '');
		for (const e of quoted) md.push(entryBlock(e), '');
	}
	if (consulted.length > 0) {
		md.push('## Consulted, not quoted', '');
		for (const e of consulted)
			md.push(
				`- ${e.source?.label ?? ledgerSourceTitle(e)}${e.source?.subtitle ? ` — ${e.source.subtitle}` : ''}`,
				''
			);
	}
	const markdown = md.join('\n');

	const kind = meta.source.type === 'autonomous_session' ? 'session' : 'chat';
	const id =
		meta.source.type === 'autonomous_session' ? meta.source.session_id : meta.source.message_id;
	const baseFilename = `provenance-${kind}-${shortId(id)}-${meta.exported_at.slice(0, 10)}`;

	return { json, markdown, baseFilename };
}
```

- [ ] **Step 4: Run the serializer tests to verify they pass**

Run: `npx vitest run src/lib/fiduciary/provenanceExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the local `sourceTitle` in `FiduciaryReceipt.svelte` with the shared helper**

In `src/lib/fiduciary/FiduciaryReceipt.svelte`, add to the imports:

```ts
import { ledgerSourceTitle } from './provenanceExport';
```

Delete the local `sourceTitle` function (the `function sourceTitle(e: LedgerEntry): string { … }` block) and replace its two call sites in the markup (`{sourceTitle(e)}`) with `{ledgerSourceTitle(e)}`.

- [ ] **Step 6: Run the receipt + serializer tests to verify no regression**

Run: `npx vitest run src/lib/fiduciary/FiduciaryReceipt.test.ts src/lib/fiduciary/provenanceExport.test.ts`
Expected: PASS (the on-screen titles are unchanged — the logic moved, not the behavior).

- [ ] **Step 7: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fiduciary/provenanceExport.ts src/lib/fiduciary/provenanceExport.test.ts src/lib/fiduciary/FiduciaryReceipt.svelte
git commit -m "feat(fiduciary): provenance-record serializer + shared ledgerSourceTitle"
```

---

### Task 2: DOM download helper `download.ts`

**Files:**

- Create: `src/lib/fiduciary/download.ts`
- Test: `src/lib/fiduciary/download.test.ts`

**Interfaces:**

- Produces: `downloadTextFile(filename: string, mimeType: string, content: string): void`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fiduciary/download.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile } from './download';

afterEach(() => vi.restoreAllMocks());

describe('downloadTextFile', () => {
	it('creates an object URL, clicks a download anchor with the given name, and revokes the URL', () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		let clicked: HTMLAnchorElement | null = null;
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		) {
			clicked = this;
		});

		downloadTextFile('record.json', 'application/json', '{"a":1}');

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
		expect(click).toHaveBeenCalledOnce();
		expect(clicked!.download).toBe('record.json');
		expect(clicked!.getAttribute('href')).toBe('blob:mock');
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/fiduciary/download.test.ts`
Expected: FAIL — module `./download` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/fiduciary/download.ts`:

```ts
// src/lib/fiduciary/download.ts
// The client-side text-file download primitive (the codebase's existing exports
// are all server-route + <a href download>). Kept out of the pure serializer.
export function downloadTextFile(filename: string, mimeType: string, content: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/fiduciary/download.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fiduciary/download.ts src/lib/fiduciary/download.test.ts
git commit -m "feat(fiduciary): client-side downloadTextFile helper"
```

---

### Task 3: Export menu in `FiduciaryReceipt` + wire both surfaces

**Files:**

- Modify: `src/lib/fiduciary/FiduciaryReceipt.svelte`
- Modify: `src/lib/components/Message.svelte:195`
- Modify: `src/lib/automations/SessionDetail.svelte` (the `<FiduciaryReceipt>` in the `{#if ledger}` block)
- Test: `src/lib/fiduciary/FiduciaryReceipt.test.ts`

**Interfaces:**

- Consumes: `buildProvenanceExport`, `type ProvenanceSource` (Task 1); `downloadTextFile` (Task 2).
- Produces: `FiduciaryReceipt` accepts an **optional** prop `exportMeta?: ProvenanceSource`; renders the "Export ▾" menu only when it is set.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/fiduciary/FiduciaryReceipt.test.ts`. At the very top of the file, add the module mock (must be before the component import; move it up if the import is higher):

```ts
import { fireEvent } from '@testing-library/svelte';
vi.mock('./download', () => ({ downloadTextFile: vi.fn() }));
import { downloadTextFile } from './download';
import { PROVENANCE_DISCLAIMER } from './provenanceExport';
```

Then add inside `describe('FiduciaryReceipt', …)`:

```ts
it('renders no Export affordance without exportMeta', () => {
	render(FiduciaryReceipt, { entries: [entry({})], gate });
	expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
});

it('exports a JSON provenance record when the menu item is clicked', async () => {
	vi.mocked(downloadTextFile).mockClear();
	render(FiduciaryReceipt, {
		entries: [entry({})],
		gate,
		exportMeta: { type: 'autonomous_session', session_id: 'sess-123' }
	});
	await fireEvent.click(screen.getByRole('button', { name: /export/i }));
	await fireEvent.click(screen.getByRole('button', { name: 'Provenance record (.json)' }));
	expect(downloadTextFile).toHaveBeenCalledTimes(1);
	const [filename, mime, content] = vi.mocked(downloadTextFile).mock.calls[0];
	expect(filename).toMatch(/^provenance-session-sess-123-\d{4}-\d{2}-\d{2}\.json$/);
	expect(mime).toBe('application/json');
	expect(content).toContain(PROVENANCE_DISCLAIMER);
});

it('exports a Markdown provenance record when that item is clicked', async () => {
	vi.mocked(downloadTextFile).mockClear();
	render(FiduciaryReceipt, {
		entries: [entry({})],
		gate,
		exportMeta: { type: 'autonomous_session', session_id: 'sess-123' }
	});
	await fireEvent.click(screen.getByRole('button', { name: /export/i }));
	await fireEvent.click(screen.getByRole('button', { name: 'Provenance record (.md)' }));
	const [filename, mime] = vi.mocked(downloadTextFile).mock.calls[0];
	expect(filename).toMatch(/\.md$/);
	expect(mime).toBe('text/markdown');
});
```

(If the test file does not already import `vi`, add it to the `vitest` import.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/fiduciary/FiduciaryReceipt.test.ts`
Expected: FAIL — no Export button.

- [ ] **Step 3: Add the export menu to `FiduciaryReceipt.svelte`**

Extend the `<script>`: add imports, the `exportMeta` prop, open-state, and the handler.

```ts
import { buildProvenanceExport, type ProvenanceSource } from './provenanceExport';
import { downloadTextFile } from './download';
```

Add `exportMeta` to the `$props()` destructure and its type (optional):

```ts
let {
	entries,
	gate,
	onopensource,
	exportMeta
}: {
	entries: LedgerEntry[];
	gate: LedgerGate | null;
	onopensource?: (e: LedgerEntry) => void;
	exportMeta?: ProvenanceSource;
} = $props();
```

Add state + handler (below the existing `$derived` lines):

```ts
let exportOpen = $state(false);
function doExport(fmt: 'json' | 'md') {
	if (!exportMeta) return;
	const out = buildProvenanceExport(entries, gate, {
		source: exportMeta,
		exported_at: new Date().toISOString()
	});
	if (fmt === 'json') downloadTextFile(`${out.baseFilename}.json`, 'application/json', out.json);
	else downloadTextFile(`${out.baseFilename}.md`, 'text/markdown', out.markdown);
	exportOpen = false;
}
```

Add the menu markup just before the closing `</div>` of the receipt container (after the "Consulted, not quoted" block), so it sits at the foot of the receipt:

```svelte
{#if exportMeta}
	<div class="mt-3 border-t border-mlq-subtle pt-2">
		<div class="relative inline-block">
			<button
				type="button"
				onclick={() => (exportOpen = !exportOpen)}
				aria-expanded={exportOpen}
				class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2 py-1 text-[11px] text-mlq-text"
			>
				Export ▾
			</button>
			{#if exportOpen}
				<div
					class="absolute left-0 z-10 mt-1 w-52 rounded-mlq-control border border-mlq-subtle bg-mlq-surface py-1 shadow-md"
				>
					<button
						type="button"
						onclick={() => doExport('json')}
						class="block w-full px-3 py-1.5 text-left text-xs text-mlq-text hover:bg-mlq-surface-alt"
					>
						Provenance record (.json)
					</button>
					<button
						type="button"
						onclick={() => doExport('md')}
						class="block w-full px-3 py-1.5 text-left text-xs text-mlq-text hover:bg-mlq-surface-alt"
					>
						Provenance record (.md)
					</button>
				</div>
			{/if}
		</div>
		<p class="mt-1 text-[10px] text-mlq-muted">
			A faithful copy of the sourcing trail — not a signed attestation.
		</p>
	</div>
{/if}
```

- [ ] **Step 4: Run the receipt tests to verify they pass**

Run: `npx vitest run src/lib/fiduciary/FiduciaryReceipt.test.ts`
Expected: PASS (existing render tests still pass — they pass no `exportMeta`, so no menu).

- [ ] **Step 5: Wire the chat turn**

In `src/lib/components/Message.svelte`, the `<FiduciaryReceipt>` at line ~195 becomes:

```svelte
<FiduciaryReceipt
	entries={shownEntries}
	gate={message.ledgerGate}
	{onopensource}
	exportMeta={{ type: 'chat_turn', chat_id: chatId, message_id: message.id }}
/>
```

- [ ] **Step 6: Wire the autonomous session**

In `src/lib/automations/SessionDetail.svelte`, the `<FiduciaryReceipt>` inside `{#if ledger}` becomes:

```svelte
<FiduciaryReceipt
	entries={ledger.entries}
	{gate}
	{onopensource}
	exportMeta={{ type: 'autonomous_session', session_id: session.id }}
/>
```

- [ ] **Step 7: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fiduciary/FiduciaryReceipt.svelte src/lib/fiduciary/FiduciaryReceipt.test.ts src/lib/components/Message.svelte src/lib/automations/SessionDetail.svelte
git commit -m "feat(fiduciary): provenance export menu on the chat + session receipts"
```

---

### Task 4: Live e2e — export a session provenance record

**Files:**

- Create: `tests/fiduciary-export.spec.ts`

**Interfaces:**

- Consumes: the full slice rendered by the running stack.
- Produces: a passing live e2e run.

**Preconditions (evidence step):**

- Rebuild the app container so it serves this branch: `docker compose up -d --build donna-web`.
- Stack up at pin `5aa9135`; admin fixture `admin@lq.ai`; `.env` provides `DONNA_BASE_URL`, `DONNA_E2E_EMAIL`, `DONNA_E2E_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`. Source it before running: `set -a; . ./.env; set +a`.
- This reuses the exact Slice 3 seed shape from `tests/fiduciary-session-ledger.spec.ts` (session + hidden chat via `chats.autonomous_session_id` + caselaw citation + `citation_ledger_entry` + `work_product_fiduciary_gate`), then downloads the export.

- [ ] **Step 1: Write the e2e test**

Create `tests/fiduciary-export.spec.ts`:

```ts
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Live e2e for Slice 4 provenance export: seed a session ledger (as Slice 3),
// open the Export menu on /automations/[id], download the JSON provenance
// record via Playwright's download event, and assert its content carries the
// disclaimer + the seeded session_id. Self-cleaning.

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const DISCLAIMER =
	'A faithful copy of the sourcing trail — not a cryptographically signed attestation.';

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('exports a JSON provenance record from the autonomous session receipt', async ({ page }) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const sessionId = randomUUID();
	const chatId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		sql(
			`INSERT INTO autonomous_sessions (id, user_id, trigger_kind, current_phase, status, cost_total_usd, max_cost_usd, completed_at)` +
				` VALUES ('${sessionId}','${ownerId}','manual','delivery','completed',0.12,2.00, now())`
		);
		sql(
			`INSERT INTO chats (id, owner_id, title, autonomous_session_id) VALUES ('${chatId}','${ownerId}','e2e-export chat','${sessionId}')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Under California law the non-compete is unenforceable.','ai')`
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
		await page.goto(`/automations/${sessionId}`);

		await expect(page.getByText('Fiduciary receipt')).toBeVisible();
		await page.getByRole('button', { name: /export/i }).click();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Provenance record (.json)' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/^provenance-session-.+\.json$/);
		const path = await download.path();
		const content = readFileSync(path, 'utf-8');
		expect(content).toContain(DISCLAIMER);
		expect(content).toContain(sessionId);
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM autonomous_sessions WHERE id='${sessionId}'`);
	}
});
```

- [ ] **Step 2: Rebuild the app container**

Run: `docker compose up -d --build donna-web`
Expected: `donna-web` rebuilt and healthy.

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/fiduciary-export.spec.ts`
Expected: PASS. (If the download event never fires, the fix is to defer the `URL.revokeObjectURL` in `download.ts` by one tick — `setTimeout(() => URL.revokeObjectURL(url), 0)` — since revoking synchronously can, in some browsers, cancel the capture; note this in the report and update the Task 2 unit test to await the tick if applied.)

- [ ] **Step 4: Verify self-cleaning**

Run: `set -a; . ./.env; set +a; docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(*) FROM chats WHERE title='e2e-export chat'"`
Expected: `0`.

- [ ] **Step 5: Run the full unit gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full unit suite passing.

- [ ] **Step 6: Commit**

```bash
git add tests/fiduciary-export.spec.ts
git commit -m "test(fiduciary): live e2e for provenance-record export"
```

---

### Task 5: Whole-branch review, PR, merge, mirror

- [ ] **Step 1: Opus whole-branch review**

Dispatch an Opus review of the full branch diff against `main` per `superpowers:requesting-code-review`, focused on: the serializer's purity + honesty (disclaimer present in both outputs, no invented fields), the `ledgerSourceTitle` extraction being behavior-preserving for the on-screen receipt, the `exportMeta`-gated menu not affecting callers that omit it, and no coupling to `preferences/TrustPill`. Address any Critical/Important findings with follow-up commits.

- [ ] **Step 2: Open the PR with a merge commit**

```bash
git push -u origin feat/fiduciary-slice4-export
gh pr create --base main --title "feat(fiduciary): Slice 4 — provenance export" --body "<summary + test evidence>"
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

- Pure serializer (JSON envelope + Markdown + filename) → Task 1. ✅
- `ledgerSourceTitle` extracted once, reused by the receipt → Task 1. ✅
- DOM download helper, separate from the serializer → Task 2. ✅
- `exportMeta`-gated "Export ▾" menu inside `FiduciaryReceipt`, JSON + Markdown items, honest caption → Task 3. ✅
- Wired on both chat turn (`Message.svelte`) and autonomous session (`SessionDetail.svelte`) → Task 3. ✅
- Disclaimer in both outputs + the UI → Tasks 1 (both outputs) + 3 (caption). ✅
- Signed-export-ready envelope shape (`kind`/`version`/`source`) → Task 1. ✅
- Unit (serializer + title branches + download helper), component (menu present/absent + click → download), live e2e (seed → download → assert disclaimer + session_id) → Tasks 1–4. ✅

**Placeholder scan:** every code and test step contains complete code; no TBD/TODO/"similar to". ✅

**Type consistency:** `ProvenanceSource` / `ProvenanceMeta` / `ProvenanceExport` / `buildProvenanceExport` / `ledgerSourceTitle` / `PROVENANCE_DISCLAIMER` (Task 1) are consumed unchanged by `FiduciaryReceipt` (Task 3) and the tests. `downloadTextFile(filename, mimeType, content)` (Task 2) matches the Task 3 call sites (`.json` → `application/json` → `out.json`; `.md` → `text/markdown` → `out.markdown`). `exportMeta?: ProvenanceSource` (Task 3 prop) matches the wiring objects `{ type: 'chat_turn', chat_id, message_id }` / `{ type: 'autonomous_session', session_id }`. ✅
