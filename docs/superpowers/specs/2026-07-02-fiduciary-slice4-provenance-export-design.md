# Design: Fiduciary Slice 4 — Provenance Export

> **Status:** approved design (brainstorm complete) — pending spec review, then `writing-plans`.
> **Date:** 2026-07-02
> **Segment:** the fiduciary-grade auditability segment. This is **Slice 4** of
> `docs/superpowers/specs/2026-07-01-fiduciary-auditability-design.md` (§5 Slice 4), expanded with the
> decisions locked in this brainstorm. Slices 0–3 are shipped.

---

## 1. Goal & framing

Give the user a way to **take the provenance record with them**: for any assistant chat turn and any
autonomous matter session that has a fiduciary ledger, an **"Export provenance record"** affordance that
serializes the already-fetched ledger **entirely client-side** into two files — a structured **JSON**
envelope and a human-readable **Markdown** copy — honestly labelled as _"a faithful copy of the sourcing
trail — not a cryptographically signed attestation."_

Per CLAUDE.md §1, Donna invents no legal-AI logic here: this is a pure re-serialization of data the
backend already returned through the ledger endpoints Slices 1/3 consume. There is **no new backend
route** (segment design §2.7, §4) and **no cryptographic claim** (segment design §2.1, decision "honest
provenance record, never signed/tamper-proof").

## 2. Load-bearing constraints (inherited)

1. **Client-side assembly, no new route.** The ledger is already in the browser: per chat turn as
   `message.ledgerEntries` / `message.ledgerGate` (and, post-Slice-2, the treatment-poll's displayed
   entries), and per session as `SessionDetail`'s derived `ledger`. Export re-serializes that; it never
   fetches.
2. **No cryptographic integrity.** The export is an honest copy. The disclaimer is mandatory and appears
   in **both** outputs. Never imply signing, hashing, or tamper-evidence.
3. **Reuse the shared substrate.** `LedgerEntry`/`LedgerGate` types and `gateVerdict` / `entryVerification`
   vocabulary (`trust.ts`) are reused unchanged. The one shared-component touch is a pure refactor
   (extracting the source-title helper) so the JSON, Markdown, and on-screen receipt name sources
   identically — no drift.
4. **Signed-export-ready (progressive enhancement).** The JSON envelope shape and the export menu are
   designed so a future server-side **signed** attestation drops in without rework (segment §8, the
   deferred `lq-ai-signed-attestation-export.md` ask). This slice is the honest unsigned precursor.

## 3. Confirmed decisions (this brainstorm)

- **Outputs = JSON + Markdown downloads.** The Markdown _is_ the "printable" form (opens/prints in any
  viewer); no bespoke PDF, no doc-panel integration (the doc panel only renders file-backed content by
  `source_file_id`, not ad-hoc client content).
- **JSON = a curated, self-describing envelope** (not raw ledger passthrough), carrying the disclaimer +
  source descriptor + timestamp.
- **Both surfaces this slice** — chat turn and autonomous session — via one affordance inside the shared
  `FiduciaryReceipt.svelte`, gated on an optional prop so existing callers are unaffected.

## 4. Components

### 4.1 Pure serializer — `src/lib/fiduciary/provenanceExport.ts` (no DOM)

The testable core. No DOM, no `Date.now()` inside (caller stamps the time), never throws on partial data.

```ts
export const PROVENANCE_DISCLAIMER =
	'A faithful copy of the sourcing trail — not a cryptographically signed attestation.';

export type ProvenanceSource =
	| { type: 'chat_turn'; chat_id: string; message_id: string }
	| { type: 'autonomous_session'; session_id: string };

export interface ProvenanceMeta {
	source: ProvenanceSource;
	exported_at: string; // ISO-8601, stamped by the caller (keeps this module pure)
}

export interface ProvenanceExport {
	json: string; // pretty-printed envelope
	markdown: string; // human-readable / printable
	baseFilename: string; // no extension; caller appends .json / .md
}

// Shared source-title logic, extracted verbatim from FiduciaryReceipt.svelte so
// the JSON, the Markdown, and the on-screen receipt all name a source identically.
export function ledgerSourceTitle(entry: LedgerEntry): string;

export function buildProvenanceExport(
	entries: LedgerEntry[],
	gate: LedgerGate | null,
	meta: ProvenanceMeta
): ProvenanceExport;
```

- **JSON envelope** (`JSON.stringify(env, null, 2)`):
  ```jsonc
  {
    "kind": "provenance_record",
    "version": 1,
    "disclaimer": "<PROVENANCE_DISCLAIMER>",
    "source": { "type": "autonomous_session", "session_id": "…" },
    "exported_at": "2026-07-02T…Z",
    "gate": { … } | null,       // the LedgerGate as-is (or null)
    "entries": [ … ]            // the full LedgerEntry[] as-is (quoted + consulted)
  }
  ```
  `gate` and `entries` are serialized as their parsed view-model shapes (already plain data). No field
  is invented; treatment, passages, confidence, etc. pass through as present.
- **Markdown** renders, in order: an `# Provenance record` title; a `>` blockquote with the disclaimer;
  a source line (`Chat turn <message_id> of chat <chat_id>` or `Autonomous session <session_id>`) and
  `Exported <exported_at>`; a **Verdict** line using `gateVerdict(gate)?.label` + assertion count (or
  "No fiduciary gate recorded" when `gate` is null); a `## Sources cited` section with one bullet block
  per **quoted** entry (title via `ledgerSourceTitle`, `entryVerification(status).label` + confidence,
  each quoted passage as a `> "…"` line, and — for caselaw with `treatment` — a "Cited by N · derived"
  line + signal classifications); and a `## Consulted, not quoted` section listing provenance entries.
  Mirrors the on-screen `FiduciaryReceipt` grouping (`isProvenance`).
- **`baseFilename`**: `provenance-<kind>-<shortId>-<yyyy-mm-dd>` where `kind` = `session` | `chat`,
  `shortId` = first 8 chars of the session_id / message_id, and the date is derived from `exported_at`
  (string slice, no `Date` needed). e.g. `provenance-session-a1b2c3d4-2026-07-02`.

### 4.2 DOM helper — `src/lib/fiduciary/download.ts`

A tiny browser-only helper kept out of the pure serializer:

```ts
export function downloadTextFile(filename: string, mimeType: string, content: string): void;
```

Creates a `Blob`, an object URL via `URL.createObjectURL`, a transient `<a download>` element, clicks
it, then revokes the URL. This is the client-side download primitive the codebase currently lacks (all
existing exports are server-route + `<a href download>`).

### 4.3 Export affordance in `FiduciaryReceipt.svelte`

Add an **optional** prop `exportMeta?: ProvenanceSource`. When present, render a small **"Export ▾"**
disclosure (styled like `tabular/ExportMenu.svelte`) inside the receipt with two items: **"Provenance
record (.json)"** and **"Provenance record (.md)"**. On a click:

```ts
const meta = { source: exportMeta, exported_at: new Date().toISOString() };
const out = buildProvenanceExport(entries, gate, meta);
// .json → downloadTextFile(out.baseFilename + '.json', 'application/json', out.json)
// .md   → downloadTextFile(out.baseFilename + '.md', 'text/markdown', out.markdown)
```

When `exportMeta` is absent the affordance renders nothing (keeps any caller that doesn't wire it
unaffected). Export always uses the component's **full** `entries` prop (both quoted and consulted). A
one-line honest caption near the menu reinforces the "not a signed attestation" framing.

### 4.4 Wiring

- **`Message.svelte`** (chat turn) → `exportMeta={{ type: 'chat_turn', chat_id: chatId, message_id: message.id }}`
  on the `<FiduciaryReceipt>` it already renders.
- **`SessionDetail.svelte`** (autonomous session) → `exportMeta={{ type: 'autonomous_session', session_id: session.id }}`
  on the `<FiduciaryReceipt>` added in Slice 3.

## 5. Testing strategy (CLAUDE.md gates)

- **Unit — serializer (`provenanceExport.test.ts`):** JSON envelope shape (kind/version/disclaimer, both
  `source` variants, `gate` present + `null`, entries pass-through); Markdown contains the disclaimer,
  the verdict label, a `ledgerSourceTitle` for each source kind (kb / caselaw / authority-external),
  a quoted passage, a treatment line when `treatment` present, and the "Consulted, not quoted" section;
  `baseFilename` format; edge cases — empty `entries`, `null` gate, an entry with no passages. Fixtures =
  the same `LedgerEntry`/`LedgerGate` shapes used in `FiduciaryReceipt.test.ts`.
- **Unit — `ledgerSourceTitle`:** each polymorphic-source branch (label / kb / caselaw opinion / external
  ref / bare kind), asserting parity with the strings the receipt previously produced.
- **Component — `FiduciaryReceipt`:** the Export menu is absent without `exportMeta` and present with it;
  clicking each item calls a mocked `downloadTextFile` with the right filename suffix, MIME, and a
  content string containing the disclaimer. (Mock the `download.ts` module.)
- **Unit — `download.ts` (jsdom):** `downloadTextFile` creates an object URL and clicks an anchor with
  the given `download` name (mock `URL.createObjectURL`/`revokeObjectURL`, spy the anchor click).
- **Live e2e (`fiduciary-export.spec.ts`):** reuse the Slice 3 session SQL-seed (session + hidden chat +
  caselaw citation + ledger entry + gate); on `/automations/[id]`, open the Export menu, click
  "Provenance record (.json)", capture the download via Playwright `page.waitForEvent('download')`, read
  the file, and assert its JSON contains the disclaimer and the seeded `session_id`. Self-cleaning.
- **Gates every task:** `npm run check` 0/0, `npm run lint` green, `npx vitest run` passing.

## 6. Out of scope (YAGNI / deferred)

- **No bespoke PDF**, no doc-panel rendering of the export, no server-side export route.
- **No signed/hash-chained attestation** — deferred upstream (`lq-ai-signed-attestation-export.md`); this
  slice is its unsigned precursor, shaped to accept it later.
- **No bulk / whole-chat export** (per-turn + per-session only); no export history or persistence.

## 7. Sequencing

Within the segment: **Slice 4 (this) → Slice 5 (docs/education) → 6-lean → file 2 upstream asks →
release cut.** This slice: light `writing-plans` → subagent-driven TDD → two-stage review per task →
whole-branch review → PR **with a merge commit** (never squash) → mirror `main` to `tucuxi`.

## 8. Decisions locked

1. Outputs = **JSON + Markdown downloads** (Markdown is the printable form; no PDF, no doc-panel).
2. JSON = **curated, versioned, self-describing envelope** with the disclaimer + source + timestamp.
3. Affordance lives **inside the shared `FiduciaryReceipt`**, gated on optional `exportMeta`; **both**
   chat-turn and autonomous-session surfaces this slice.
4. Serializer is **pure** (caller stamps `exported_at`); DOM download is a **separate** helper.
5. `sourceTitle` is **extracted once** into the serializer module and reused by the receipt (no drift).
6. **Honest labelling** in both outputs and the UI; **signed-export-ready** envelope + menu.
