# Fiduciary Auditability — Slice 2 (Treatment / Validity + deferred click-through) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface derived case **treatment** (validity) on caselaw ledger entries — a muted "⚖ Cited by N · derived · <strongest signal>" line + a `signals[]` disclosure, self-refreshing while it's still deriving — and make ledger entries **click-through** to their source (the capability deferred from Slice 1). Never assert good/bad-law: derived, not editorial.

**Architecture:** Extend the `src/lib/fiduciary/` substrate: hand-parse the `treatment` object in `ledger.ts` (it is NOT in the generated `LedgerEntry` type — runtime `dict`), display it in `FiduciaryReceipt.svelte` (which also gains an optional `onopensource` click-through callback + the Slice-1 Minor cleanups), add a capped last-known-good `createTreatmentPoll` rune, and wire both the poller and the click-through dispatch into `Message.svelte` + the chat page. Builds on merged Slices 0+1 (pin `5aa9135`, unchanged).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest, Playwright.

## Global Constraints

- **Never edit `vendor/lq-ai`.** Gates: `npm run check` 0/0, `npm run lint` **fully green** (run the FULL command each task — a prior slice had repo-wide prettier debt that scoped checks missed), `npx vitest run` green.
- **Tabs**; **Svelte 5 runes**; defensive parsers (drop malformed, never throw); honest degradation (last-known-good, never break the message).
- **Derived, not editorial:** the treatment UI is **muted/neutral** — NEVER color a case good/bad-law (no green/red on the treatment line). Absence of a negative signal is not an endorsement.
- **`treatment` is runtime-only** (not in the generated type) — hand-parse from the ledger `dict`. Shape (integration doc §2.4):
  ```
  treatment: {
    cited_by_count: number|null, as_of: string|null, derived_method: string|null,
    citing: [{opinion_id?, cluster_id?, case_name?, court?, date_filed?}],   // LOOSEST — parse very defensively
    strongest_negative_class: string|null, judged_count: number|null, judge_as_of: string|null,
    per_class_counts: { <class>: number },                                   // dynamic string keys
    case_confidence: number|null,
    signals: [{citing_opinion_id?, classification, confidence?, justification?}]
  }
  ```
  Graph-only (pre-judge): `signals: []`, `strongest_negative_class: null`, `judged_count: null`. Before ANY derivation: the whole `treatment` field is **`null`** (the only "not ready" signal).
- **Reuse discipline:** `FiduciaryReceipt.svelte` is shared with Slice 3 (autonomous). Keep the treatment poll OUT of the component (it's chat-specific) — the component only _displays_ treatment (or a "checking…" state) and _emits_ `onopensource`. The poll + dispatch live in the chat layer.
- **Click-through mapping** (in the chat-page handler, which owns `docPanel`): `kb_document` (has `source.source_file_id`) → `docPanel.open({ source_file_id, verificationApplicable: false } as Citation)`; `caselaw` (has `source.opinion_id`) → `docPanel.openOpinion({ opinionId, caseName })`; authority/other with `source.url` → `window.open(url, '_blank', 'noopener')`; otherwise no-op.

## File Structure

- Modify `src/lib/fiduciary/ledger.ts` (+ `ledger.test.ts`) — treatment types + `parseTreatment`.
- Modify `src/lib/fiduciary/FiduciaryReceipt.svelte` (+ `FiduciaryReceipt.test.ts`) — treatment display, `onopensource` prop, Minor cleanups.
- Create `src/lib/fiduciary/treatmentPoll.svelte.ts` (+ `treatmentPoll.test.ts`) — the capped poll rune.
- Modify `src/lib/components/Message.svelte` (+ its test) — wire `onopensource` + the treatment poll.
- Modify `src/routes/(app)/chats/[id]/+page.svelte` — the `onopensource` dispatch.
- Fix `src/routes/(app)/chats/[id]/page.server.test.ts` fixture enum values (Minor).
- Modify `tests/fiduciary-receipt.spec.ts` — e2e for treatment + click-through (seed `citation_treatment` + signals).

---

### Task 1: Parse `treatment` in `ledger.ts`

**Files:** Modify `src/lib/fiduciary/ledger.ts`, `src/lib/fiduciary/ledger.test.ts`.

**Interfaces — Produces (additive; existing exports unchanged):**

```ts
export interface TreatmentSignal {
	citing_opinion_id: number | null;
	classification: string;
	confidence: number | null;
	justification: string | null;
}
export interface TreatmentCiting {
	opinion_id: number | null;
	cluster_id: number | null;
	case_name: string | null;
	court: string | null;
	date_filed: string | null;
}
export interface LedgerTreatment {
	cited_by_count: number | null;
	as_of: string | null;
	derived_method: string | null;
	citing: TreatmentCiting[];
	strongest_negative_class: string | null;
	judged_count: number | null;
	judge_as_of: string | null;
	per_class_counts: Record<string, number>;
	case_confidence: number | null;
	signals: TreatmentSignal[];
}
// LedgerEntry gains:  treatment: LedgerTreatment | null
```

- [ ] **Step 1: Write failing tests** — add to `ledger.test.ts`: a full treatment (from §2.4: cited_by_count 214, strongest_negative_class 'overruled', 2 signals, per_class_counts populated); a graph-only treatment (empty signals, null strongest_negative_class); `treatment: null` before derivation; and defensive cases (`citing` with a non-object row dropped; `per_class_counts` with a non-number value dropped; `signals` row missing `classification` dropped). Assert `parseLedger(RAW).entries[1].treatment?.cited_by_count === 214`, `.signals` length, `.per_class_counts.overruled === 1`, and that a caselaw entry with no `treatment` key parses to `treatment: null`.

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/fiduciary/ledger.test.ts`).

- [ ] **Step 3: Implement.** Add the interfaces above; add `treatment: LedgerTreatment | null;` to `LedgerEntry` (after `treatment_id`). Add the parser and call it in `parseEntry`:

```ts
function parseSignal(raw: unknown): TreatmentSignal | null {
	const r = obj(raw);
	const classification = str(r.classification);
	if (!classification) return null;
	return {
		citing_opinion_id: num(r.citing_opinion_id),
		classification,
		confidence: num(r.confidence),
		justification: str(r.justification)
	};
}

function parseCiting(raw: unknown): TreatmentCiting {
	const r = obj(raw);
	return {
		opinion_id: num(r.opinion_id),
		cluster_id: num(r.cluster_id),
		case_name: str(r.case_name),
		court: str(r.court),
		date_filed: str(r.date_filed)
	};
}

function parsePerClassCounts(raw: unknown): Record<string, number> {
	const r = obj(raw);
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(r)) {
		if (typeof v === 'number') out[k] = v;
	}
	return out;
}

function parseTreatment(raw: unknown): LedgerTreatment | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	return {
		cited_by_count: num(r.cited_by_count),
		as_of: str(r.as_of),
		derived_method: str(r.derived_method),
		citing: Array.isArray(r.citing) ? r.citing.map(parseCiting) : [],
		strongest_negative_class: str(r.strongest_negative_class),
		judged_count: num(r.judged_count),
		judge_as_of: str(r.judge_as_of),
		per_class_counts: parsePerClassCounts(r.per_class_counts),
		case_confidence: num(r.case_confidence),
		signals: (Array.isArray(r.signals) ? r.signals : [])
			.map(parseSignal)
			.filter((s): s is TreatmentSignal => s !== null)
	};
}
```

In `parseEntry`, add `treatment: parseTreatment(r.treatment),` beside `treatment_id`. Update the file-header comment (drop the "Treatment … is not parsed here" note).

- [ ] **Step 4: Run — expect PASS.** Then `npm run check` (0/0), `npm run lint` (full, green).
- [ ] **Step 5: Commit** — `feat(fiduciary): parse case-treatment on ledger entries` (+ `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).

---

### Task 2: Treatment display + click-through prop + Minor cleanups in `FiduciaryReceipt.svelte`

**Files:** Modify `src/lib/fiduciary/FiduciaryReceipt.svelte`, `src/lib/fiduciary/FiduciaryReceipt.test.ts`.

**Interfaces — Consumes:** `LedgerEntry` (now with `treatment`), `LedgerTreatment` (Task 1). **Produces:** `<FiduciaryReceipt {entries} {gate} onopensource? />` where `onopensource?: (e: LedgerEntry) => void`.

- [ ] **Step 1: Write failing tests** — extend `FiduciaryReceipt.test.ts`:
  - A caselaw entry WITH treatment (cited_by_count 214, strongest_negative_class 'overruled', a signal with justification) → the panel shows `/cited by 214/i`, `/derived/i`, the strongest-negative class text, and (after the signals disclosure is open, or inline) the signal's justification. Assert the treatment line does NOT carry a good/bad color class (no `text-mlq-verified`/`text-mlq-error` on the treatment element — it's `text-mlq-muted`).
  - A caselaw entry with `treatment: null` → shows `/checking treatment/i`.
  - With `onopensource` provided, a quoted entry's source title is a `<button>`; clicking it calls `onopensource` with that entry. Without `onopensource`, the title is plain text (no button).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** In `FiduciaryReceipt.svelte`:
  - Add to props: `onopensource?: (e: LedgerEntry) => void` (optional).
  - **Minor cleanup A** — the gate-summary header currently renders a full verdict _pill_ duplicating the footer `FiduciaryPill`. Replace it with a plain-text label (keep the words, drop the pill chrome): render `verdict.label` in a `font-medium text-mlq-text` span (with `title={verdict.explanation}`) + the assertion count. (Keeps the `getByText(label)` behavior; removes the redundant colored pill.)
  - **Minor cleanup B** — change the passages loop key from `(p.text)` to an index: `{#each e.source?.passages ?? [] as p, i (i)}`.
  - **Click-through** — when `onopensource` is provided, render each quoted entry's `sourceTitle(e)` as a `<button type="button" onclick={() => onopensource(e)} class="text-left font-medium text-mlq-workflow hover:underline">`; otherwise the current `<span class="font-medium text-mlq-text">`. (Use `{#if onopensource}…{:else}…{/if}`.)
  - **Treatment block** — for each quoted entry where `e.source?.kind === 'caselaw'`, render below its passages:
    - if `e.treatment` is present: a muted line
      `⚖ Cited by {treatment.cited_by_count ?? '—'} · derived{#if treatment.strongest_negative_class} · strongest signal: {treatment.strongest_negative_class}{/if}` in `text-[11px] text-mlq-muted`, followed by a small disclosure (`<details>`), listing each `signals[]` entry as `{classification} — {justification}` (muted). Never apply a good/bad color.
    - else (`e.treatment === null`): a muted `<span class="text-[11px] text-mlq-muted">checking treatment…</span>`.
      Keep everything else (provenance group, gate summary) intact.

- [ ] **Step 4: Run — expect PASS.** Then `npm run check` (0/0), `npm run lint` (full, green; `npx prettier --write` if flagged).
- [ ] **Step 5: Commit** — `feat(fiduciary): treatment display + click-through + panel cleanups`.

---

### Task 3: `createTreatmentPoll` rune

**Files:** Create `src/lib/fiduciary/treatmentPoll.svelte.ts`, `src/lib/fiduciary/treatmentPoll.test.ts`.

**Interfaces — Consumes:** `parseLedger`, `entriesForMessage`, `LedgerEntry` (Task 1). **Produces:**

```ts
export function createTreatmentPoll(
	chatId: string,
	messageId: string,
	opts?: { intervalMs?: number; maxAttempts?: number; fetchFn?: typeof fetch }
): { readonly entries: LedgerEntry[] | null; readonly done: boolean; start(): void; stop(): void };
```

Mirrors `automations/pollSession.svelte.ts`: `$state` for `entries`/`done`, a `running` re-entrancy guard, a capped loop (`maxAttempts` default 6, `intervalMs` default 5000), last-known-good (only assign `entries` when the fetch returns a non-empty array), and a terminal condition: **stop once no caselaw entry has `treatment === null`** (or on transport error, or at the cap).

- [ ] **Step 1: Write failing tests** — `treatmentPoll.test.ts`: (a) `stop()`s once a poll returns caselaw entries all with non-null `treatment` (mock `fetchFn` to return null-treatment first, then populated); assert `done` true and `entries` reflect the populated result. (b) caps at `maxAttempts` when treatment never populates (assert `fetchFn` call count ≤ maxAttempts, `done` true). (c) last-known-good: a transport failure mid-run doesn't wipe prior `entries`. Use a fake `fetchFn` returning crafted `Response`-likes; drive the loop with a tiny `intervalMs` (e.g. 1) and `await`/flush.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (mirror `pollSession.svelte.ts`; inject `fetchFn` for testability):

```ts
// src/lib/fiduciary/treatmentPoll.svelte.ts
// Capped, last-known-good poller that re-fetches a chat turn's ledger while any
// caselaw entry's treatment is still deriving (treatment === null). Chat-specific
// (kept out of the shared FiduciaryReceipt component). Mirrors pollSession.svelte.ts.
import { parseLedger, entriesForMessage, type LedgerEntry } from './ledger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stillDeriving(entries: LedgerEntry[]): boolean {
	return entries.some((e) => e.source?.kind === 'caselaw' && e.treatment === null);
}

export function createTreatmentPoll(
	chatId: string,
	messageId: string,
	opts: { intervalMs?: number; maxAttempts?: number; fetchFn?: typeof fetch } = {}
) {
	const intervalMs = opts.intervalMs ?? 5000;
	const maxAttempts = opts.maxAttempts ?? 6;
	const doFetch = opts.fetchFn ?? fetch;
	let entries = $state<LedgerEntry[] | null>(null);
	let done = $state(false);
	let running = false;

	async function tick(): Promise<boolean> {
		try {
			const res = await doFetch(`/chats/${chatId}/ledger?message_id=${messageId}`);
			if (!res.ok) return true;
			const next = entriesForMessage(parseLedger(await res.json()), messageId);
			if (next.length > 0) entries = next; // last-known-good
			return !stillDeriving(next);
		} catch {
			return true;
		}
	}

	async function start() {
		if (running) return;
		running = true;
		done = false;
		let attempts = 0;
		while (running && attempts < maxAttempts) {
			const finished = await tick();
			if (finished) break;
			attempts++;
			await sleep(intervalMs);
		}
		running = false;
		done = true;
	}
	function stop() {
		running = false;
	}

	return {
		get entries() {
			return entries;
		},
		get done() {
			return done;
		},
		start,
		stop
	};
}
```

- [ ] **Step 4: Run — expect PASS.** Then `npm run check`, `npm run lint` (full).
- [ ] **Step 5: Commit** — `feat(fiduciary): capped treatment poller`.

---

### Task 4: Wire click-through + treatment poll into `Message.svelte` + chat page (+ fixture Minor)

**Files:** Modify `src/lib/components/Message.svelte`, `src/routes/(app)/chats/[id]/+page.svelte`, `src/routes/(app)/chats/[id]/page.server.test.ts`, and `Message.svelte.test.ts`.

**Interfaces — Consumes:** `FiduciaryReceipt` `onopensource` (Task 2), `createTreatmentPoll` (Task 3), the `docPanel` + `Citation` types.

- [ ] **Step 1: Write failing tests** — extend `Message.svelte.test.ts`: (a) when the panel is open and a caselaw entry has `treatment === null`, the treatment poll is started (inject/stub via the same `$app/state`/fetch mock pattern already used — assert a fetch to `/chats/{id}/ledger?message_id=` occurs, OR assert the "checking treatment…" state renders); (b) clicking a source title in the open panel fires the wired handler (assert `onopensource`/`docPanel` dispatch — a spy passed as the prop). Keep it to what's unit-testable; the full dispatch-to-docPanel is covered by the e2e (Task 5).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - **`Message.svelte`**: add `onopensource?: (e: LedgerEntry) => void` to `$props()` (mirror `onactivatecitation`); pass it to `<FiduciaryReceipt … onopensource={onopensource} />`. Add the treatment poll: `const treatmentPoll = createTreatmentPoll(chatId ?? '', message.id);` guarded so it only runs for real turns; in an `$effect`, when `showLedger && (message.ledgerEntries ?? []).some(e => e.source?.kind === 'caselaw' && e.treatment === null)`, call `treatmentPoll.start()` and return `() => treatmentPoll.stop()`; when `treatmentPoll.entries` is non-null, reflect it into the rendered entries (e.g. render `treatmentPoll.entries ?? message.ledgerEntries ?? []` into the panel, and also update `message.ledgerEntries` so it persists). Read `chatId`/`message.id` via `untrack` when seeding the poll to avoid `state_referenced_locally`.
  - **`chats/[id]/+page.svelte`**: add the dispatch handler next to `onactivatecitation`:

```svelte
	onopensource={(e) => {
		const s = e.source;
		if (!s) return;
		if (s.source_file_id) docPanel.open({ source_file_id: s.source_file_id, verificationApplicable: false } as Citation);
		else if (s.opinion_id) docPanel.openOpinion({ opinionId: s.opinion_id, caseName: s.label ?? `Opinion #${s.opinion_id}` });
		else if (s.url) window.open(s.url, '_blank', 'noopener');
	}}
```

Import `Citation` type there if not already (`import type { Citation } from '$lib/citations/types'`).

- **`page.server.test.ts` Minor fix**: change the fixture's non-contract enum values to real ones — `source_kind: 'case_law'` → `'caselaw'`, `gate_status: 'pass'` → `'fiduciary_grade'` (grouping assertions unchanged).

- [ ] **Step 4: Run — expect PASS.** Then the FULL gates: `npm run check` (0/0), `npm run lint` (full green), `npx vitest run` (WHOLE suite — confirm no Message/chat regression, as the Slice-1 nullish-prop regression taught).
- [ ] **Step 5: Commit** — `feat(fiduciary): wire click-through + treatment poll in chat`.

---

### Task 5: Live e2e — treatment line + click-through (SQL-seeded)

**Files:** Modify `tests/fiduciary-receipt.spec.ts` (add a test; keep the existing one).

- [ ] **Step 1: Inspect + write.** Treatment renders from `citation_treatment` (+ `citation_treatment_signal`) rows linked to the caselaw citation / entry. **Before writing INSERTs, inspect the real columns**: `docker compose exec -T postgres psql -U lq_ai -d lq_ai -c "\d citation_treatment" -c "\d citation_treatment_signal"` and how `citation_ledger_entry.treatment_id` links to them. Then add an e2e that seeds (on top of the existing chat/message/caselaw-citation/ledger-entry/gate) a `citation_treatment` (+ a signal) row, opens the chat, expands the receipt, and asserts the `⚖ Cited by N` treatment line + the strongest-signal text render. Also assert click-through: clicking the caselaw source title opens the opinion in the doc panel (assert the doc-panel/opinion tab appears). Self-clean in `finally` (the seeded chat cascades; delete any treatment rows not covered by cascade).
- [ ] **Step 2: Run** `docker compose up -d --build donna-web` then `npx playwright test tests/fiduciary-receipt.spec.ts` (`.env` loaded) — debug against the live stack until green.
- [ ] **Step 3: Commit** — `test(fiduciary): e2e for treatment + click-through`.

---

## Definition of done

- Treatment parsed defensively; caselaw entries show the muted derived-treatment line + signals disclosure (never good/bad-colored) and a "checking treatment…" state that self-resolves via the capped poller; ledger entries are click-through (KB→doc panel, caselaw→opinion, authority→external). Slice-1 Minors cleared.
- `npm run check` 0/0, `npm run lint` fully green, full `npx vitest run` green, live e2e passes.
- PR to `main` with a **merge commit**. Next: Slice 3 (autonomous matter audit timeline — reuses `FiduciaryReceipt.svelte`, now treatment- and click-through-capable).

## Self-review notes

- **Spec coverage:** treatment surfacing (§5 Slice 2) → Tasks 1/2; the poll (§5 Slice 2, "checking treatment…", capped, last-known-good) → Tasks 3/4; click-through (spec §5 Slice 1, deferred) → Tasks 2/4; the three Slice-1 Minors → Task 2 (header pill, each-key) + Task 4 (fixture enums).
- **Reuse discipline:** poll kept out of the shared `FiduciaryReceipt` (chat-specific); the component only displays treatment + emits `onopensource`, so Slice 3 can reuse it unchanged.
- **Derived-not-editorial** enforced by the muted-only treatment styling + a test asserting no good/bad color on the treatment line.
- **Type consistency:** `LedgerTreatment`/`treatment` field defined in Task 1, consumed unchanged by Tasks 2–5; `onopensource: (e: LedgerEntry) => void` identical across FiduciaryReceipt (Task 2), Message (Task 4), and the chat page (Task 4).
