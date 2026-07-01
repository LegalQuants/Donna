# Design: Fiduciary-Grade Auditability in Donna

> **Status:** approved design (brainstorm complete) — pending spec review, then `writing-plans`.
> **Date:** 2026-07-01
> **Segment:** exposes LQ-AI's fiduciary-grade auditability push (citation ledger, fiduciary gate,
> provenance, caselaw/authority verification, case treatment, autonomous-session ledger, research
> source registry) through Donna's reading-first UI.
> **Authoritative backend contract:** after the pin bump, `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md`
> (verified `file:line` against lq-ai source). This design consumes it; where the two disagree, the
> contract wins and this doc is corrected.

---

## 1. Goal & framing

LQ-AI shipped a fiduciary-grade auditability layer. Donna's job (per CLAUDE.md §1) is to make it
**usable, transparent, and controllable** for a **non-technical legal user** — without inventing any
legal-AI logic and without overclaiming what the backend guarantees.

The organizing product idea: **an honest provenance record on every answer** — "for this answer, what
sources were used, what exactly was quoted from each, was each quote actually found in the real
source, and (for cases) is it still good law" — plus the same trail for autonomous matter sessions,
an exportable copy, a research-source registry, and in-app education/discovery so the features teach
themselves.

## 2. Backend contract — the load-bearing constraints

Pulled from the integration doc; these shape every UI decision.

1. **No cryptographic integrity (§3.1).** No hash-chaining, no signatures, no HMAC — only an unsigned,
   unchained per-message `content_hash` (Merkle layer is "future M2+"). → We build an **honest
   provenance record**, never a "tamper-proof / cryptographically verified / signed" affordance. Safe
   language: *"every source and quote is recorded and independently re-verifiable against the
   original."*
2. **The zero-assertion honesty trap (§2.2).** `total_assertions == 0` also returns
   `gate_status: "fiduciary_grade"` — meaning *"no verifiable claims,"* not *"claims verified."* We
   render this as a **neutral state, never green.**
3. **Owner-scoped, no auditor role, no admin bypass on the ledger (§2.6).** A user sees only their own
   trail. A cross-user compliance/auditor view is **not buildable** → deferred upstream (§8 here).
4. **Treatment is the one eventually-consistent field (§4.2).** `treatment: null` on a caselaw entry
   is the only "not ready" signal; polling `GET /ledger` self-drives derivation. Everything else
   (ledger, gate, quote citations) is written **synchronously** at finalize.
5. **Loosely-typed bodies (§2.1, §2.7).** The ledger + `/messages/{id}/sources` endpoints return
   untyped `dict[str,Any]` (empty OpenAPI schema) → `gen:api` gives no types → **hand-write defensive
   parsers.** Only `/research/sources` and the autonomous receipt are typed. `treatment.citing` and
   `per_class_counts` are the loosest fields.
6. **No cost in chat, cost only in the autonomous receipt (§2.3).** The matter-session view is where
   the cost story lives.
7. **No server-side export, no pagination (§2.5, §3.4).** We assemble any export client-side; the full
   ledger returns in one response (fine for v1).

## 3. Design principles (locked with the user)

- **Positioning = alongside, as a superset.** Inline citations stay as in-context reading markers; a
  new turn-level trust pill opens the fiduciary ledger (the audit superset). The existing "sources
  consulted" panel folds in as the lighter provenance group.
- **The four trust states** (owned by one vocabulary module):

  | Backend | Donna label | Tone | Meaning |
  |---|---|---|---|
  | `fiduciary_grade` (assertions > 0, all pass) | **Fiduciary-grade** | sage/green | every quoted claim matched its source |
  | `supported_only` | **Supported** | amber | backed in substance, verified by meaning |
  | `flagged` | **Needs review** | red | a quote couldn't be confirmed in its source |
  | `fiduciary_grade` **but `total_assertions == 0`** | **No sourced claims** | neutral grey | nothing to verify — **never green** |

- **Derive, don't assert (treatment).** Never color a case "good/bad law"; show derived signals with
  justifications, labelled "derived, not editorial."
- **Honest degradation** (CLAUDE.md §7): each sub-fetch degrades to `null` independently; live pollers
  keep last-known-good.

## 4. Shared substrate (built once in `src/lib/fiduciary/`)

- **`ledger.ts`** — defensive parsers on the `findings.ts`/`artifacts.ts` template (local `str`/`obj`
  guards, drop malformed rows, never throw): `parseLedger(raw) → { chat_id, entries[], gates[] }`,
  `parseEntry`, `parseGate`, `parseTreatment`, `parseSourceRow`. `entry.source` is **polymorphic —
  branch on `source.kind`** (`kb_document` | `caselaw` | authority `content_kind` | tool source).
  Treat `source_kind` / `verification_status` / authority `content_kind` as **open enums** (handle
  unknown, incl. literal `"unknown"`). `treatment.citing` and `per_class_counts` parsed extra-
  tolerantly. Test fixtures = the integration doc's §2.4 real payloads.
- **`trust.ts`** — `gateVerdict(gate) → { tone, label, explanation }` encoding the four-state table
  above, including the **`total_assertions === 0 → neutral`** rule. Single owner of the honesty logic.
  Switch on **`gate_status`** (⚠ there is no `verdict` field).
- **Reuse** the existing `citations/types.ts:citeState()` vocabulary for per-entry verification chips
  so it stays consistent with today's inline citations.

BFF proxy routes (auth via `lqFetch`, `!res.ok → 502`, honest-degradation `null` on failure):
- `chats/[id]/ledger/+server.ts` (GET, forwards `?message_id=`) — live turns + treatment polling.
- Autonomous session ledger — folded into the existing `automations/[id]/+page.server.ts` load and
  `[id]/+server.ts` poll proxy.
- `/research/sources` — typed, fetched directly in the Research page load (no hand-parser).
- Export — assembled **client-side** from the already-fetched ledger (no new route).

## 5. Slices

### Slice 0 — Research sources card
A read-only `<section>` card (the `ProviderKeysCard`/settings-card shape) on the **existing Research
page** (`routes/(app)/research/`), fetched in its `+page.server.ts` load. One row per source: name,
jurisdiction, coverage, content-kind tags, and an **enabled / unavailable** badge. Registered-but-
unconfigured sources render as "unavailable," never hidden (`enabled: false`). Doubles as the pin /
`gen:api` smoke test (the one typed endpoint).

### Slice 1 — Per-turn fiduciary receipt (centerpiece)
In `Message.svelte`'s assistant footer (`~L169-215`):
- The **trust pill** (`trust.ts`) as the leading footer pill. **Shown by default** on every assistant
  turn that has a gate (green/amber/red/grey), *unless* the user has disabled trust pills via the
  existing **`trust_pills`** preference (master on/off — verify its exact values at plan time); the
  *other* footer pills keep obeying the separate `provenance_pills` collapse preference independently.
- Clicking expands **`FiduciaryReceipt.svelte`** (structured like `ToolSourcesPanel.svelte`): a gate
  summary line, then one row per ledger `entry` — source identity (branched on `source.kind`) + quoted
  `passages[].text` + a verification chip (from `verification_status`) + confidence. Provenance / tool-
  source rows go in a lighter **"consulted, not quoted"** group (excluded from the gate).
- **Data:** initial ledger fetched in `chats/[id]/+page.server.ts` (per-turn via `?message_id`); live
  turns fetch the `ledger/+server.ts` proxy after the SSE `complete` frame (like `loadCitations`).
- **Click-through:** KB entry → `docPanel.open(...)` at the passage; caselaw → `docPanel.openOpinion(...)`;
  authority/statute → external `external_ref` link (no native statute viewer in the doc panel yet).

### Slice 2 — Treatment / validity surfacing
Where a caselaw `entry.treatment` is present: a muted line **"⚖ Cited by N · derived · <strongest
negative signal>"** that discloses `signals[]` (classification + justification, linked to the citing
opinion id). **Never** colored good/bad-law. While `treatment === null` on a caselaw entry, show a
subtle **"checking treatment…"** state and poll `chats/[id]/ledger?message_id=` via a small poller
rune (mirroring `pollSession.svelte.ts` last-known-good: only overwrite on non-null). Poll on panel-
open + interval, **capped** (default ~6 polls over ~60s, then stop and leave a manual "re-check" affordance);
the poll itself self-drives derivation (DE-363).

### Slice 3 — Autonomous matter audit timeline
- Session-level **gate verdict as a headline trust pill in `SessionReceiptHeader.svelte`**, beside the
  existing cost / cost-cap chips.
- The session ledger renders as a **"Fiduciary receipt" block in `SessionDetail.svelte`**, **reusing
  the same `FiduciaryReceipt.svelte`** from Slice 1, alongside the existing chronological
  `SessionTimeline` and `RunResults`.
- **Data:** `GET /autonomous/sessions/{id}/ledger` (identical `{entries[], gates[]}` shape; `gates[]`
  has exactly one element) folded into the existing session load + poll proxy, degrading to `null`
  independently. This is where the "who did what, on whose behalf, at what cost, is it fiduciary-grade"
  story is strongest, because cost already lives in the receipt here.

### Slice 4 — Provenance export
An **"Export provenance record"** affordance (chat turn and autonomous session) that serializes the
ledger **client-side** to **structured JSON + a printable/markdown rendering** (doc panel already
renders markdown). Honestly labelled: *"a faithful copy of the sourcing trail — not a cryptographically
signed attestation."* No bespoke PDF. The affordance is designed so it can later point at a real
signed-export endpoint (progressive enhancement) with no rework.

### Slice 5 — Documentation & education
- **`/about` guide:** new prose page `routes/(app)/about/fiduciary/+page.svelte` (canonical template =
  `about/overview`) + a rail entry in `about/AboutRail.svelte`. Explains the fiduciary receipt, the four
  trust states, the citation ledger, and treatment.
- **Educational visualizations:** new self-contained playground(s) in `static/learn/playgrounds/`
  (e.g. `trust-states.html`, `quote-verification.html`), embedded via `LqLearnSection` / iframe — a
  live "trust-pill states" explorer and a "how a quote gets verified" walkthrough. (The mockups already
  prototyped in brainstorming are the seed.)
- **Repo/user docs:** refresh `README`, `docs/GUIDE.md`, `docs/PRODUCT.md`, `CHANGELOG.md`; regenerate
  the About PDF for the new capabilities.

### Slice 6-lean — Contextual capability discovery (fiduciary-scoped)
Greenfield (no existing coachmark system). **Client-side only**, no backend dependency:
- **Dismissable hints / coachmarks** tied to the new features, dismissal persisted in **localStorage**
  (mirror `components/sidebar.ts`; a `dismissedHints` set keyed by hint id). First appearance of a
  "Needs review" pill explains it; a nudge to expand the ledger or export a provenance record; a hint
  pointing at the research-sources card.
- **Suggested tasks** following the existing `*Starters.svelte` convention (static array + `onpick`) —
  fiduciary-relevant starters that expose the capability at sensible empty-states.
- A tiny reusable `fiduciary/Hint.svelte` (built on the bits-ui `Tooltip` / a small dismissable
  callout) is the one new primitive.
- **Deferred to 6-full (separate later brainstorm):** a general, app-wide, dynamic capability-discovery
  engine that regularly surfaces contextually-relevant suggested tasks across all of Donna, and any
  cross-device server-persisted "seen" flag (would require extending the `/users/me/preferences`
  `ALLOWED` set + backend support — upstream).

## 6. Testing strategy (CLAUDE.md gates)

- **Unit:** every parser in `ledger.ts` against the integration-doc §2.4 real payloads (incl. graph-
  only treatment, `null` treatment, authority variant, `flagged` gate, empty `[]`); `trust.ts`
  `gateVerdict` for all four states **including `total_assertions === 0`**.
- **Component:** the four trust-pill states; the receipt panel's polymorphic-source branches; the
  "checking treatment…" → populated transition.
- **Server:** proxy/load tests mock `lqFetch`, assert honest-degradation `null` on non-ok / non-JSON.
- **Live e2e (Playwright):** self-cleaning; because caselaw/treatment is model-discretionary,
  **SQL-seed** `citation_ledger_entry` + `work_product_fiduciary_gate` marker rows the way
  `automations-*.spec.ts` seeds markers (creds `lq_ai`/`lq_ai`). Rebuild `donna-web` before e2e.
- Gates every slice: `npm run check` 0/0, `npm run lint` green, `npx vitest run` passing.

## 7. Ops (bookend tasks)

- **First task — pin bump:** `vendor/lq-ai` → **`3659360`** (main HEAD incl. #251 `3e3230c` + the #252
  docs merge, so the integration doc lands in-tree). `npm run gen:api`; rebuild `api` + `arq-worker` +
  `ingest-worker` + `donna-web`; **verify the contract in `src/lib/api/backend.d.ts`** (`SourcesResponse`,
  autonomous receipt types; confirm ledger bodies are untyped as expected); log in
  `docs/decisions/lq-ai-pin.md`.
- **Config to enable features** (§5.3 of the contract): CourtListener (`COURTLISTENER_API_TOKEN`) for
  caselaw + treatment graph; GovInfo (`GOVINFO_API_KEY`) for statute/regulation authority; a judge
  model for paraphrase + treatment (degrades to graph-only if unresolved). Document in the README/env.

## 8. Deferred / upstream (filed as asks, not built here)

Both are genuinely not buildable client-side today; file per CLAUDE.md §8 as the final tasks:
- `docs/upstream-requests/lq-ai-cross-user-auditor-role.md` — a compliance/auditor role + re-scoped
  authz so a reviewer can read another user's ledger (today: owner-scoped, 404, no admin bypass).
- `docs/upstream-requests/lq-ai-signed-attestation-export.md` — a server-side **signed** export /
  hash-chained attestation (today: only an unsigned `content_hash`; Merkle is "future M2+"). Donna's
  Slice 4 export is the unsigned precursor.

## 9. Release tail (post-merge, existing pipeline)

Not a design slice: cut pin-bump-aware **Docker images** (`release.yml`) and a fresh **signed/notarized
macOS DMG** (`desktop-release.yml`) per `docs/BUILD-AND-RELEASE.md`, to ease onboarding for non-
technical users. Captured here so it isn't forgotten.

## 10. Sequencing

**pin bump → Slice 0 → 1 → 2 → 3 → 4 → 5 → 6-lean → file 2 upstream asks → release cut.**

Each slice is its own light brainstorm → `writing-plans` → subagent-driven TDD → two-stage review →
PR **with a merge commit** (never squash — CLAUDE.md §2). Slice 0 validates the pin/`gen:api`;
Slices 1 & 3 share `FiduciaryReceipt.svelte`; Slice 2 depends on Slice 1's ledger render.

## 11. Decisions locked in brainstorming

1. Positioning: **alongside, as a superset** (not absorb/replace, not receipts-drawer-only).
2. Trust vocabulary: the four states above; **"Needs review"** (softened from "flagged"); zero-
   assertion → **neutral grey, never green**.
3. Slice 0 lives on the **Research page** (accessibility over settings-backwater).
4. Scope = **Slices 0–4** plus **5 (docs/education)** and **6-lean (fiduciary-scoped discovery)**;
   **6-full** and the two backend features are deferred.
5. Discovery dismissal = **localStorage** (no upstream preference-key dependency for 6-lean).
6. Export = **JSON + printable**, honestly labelled, no bespoke PDF, signed-export-ready.
