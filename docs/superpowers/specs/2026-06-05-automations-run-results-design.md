# Automations — run output surfacing: the "Results" section (design)

**Date:** 2026-06-05 · **Slice:** the user-priority "surface a run's work-product, not just the receipt"
follow-up, unblocked by lq-ai **#135** (`0097b01`) · **Branch:** `feat/automations-run-results`,
stacked on `feat/automations-editable-matter` (#63; PR retargets `main` when #63 merges).

## Problem

A run's deliverable is **findings** (plus proposed memories) — but until lq-ai #135 they were
transient: the receipt showed only the transparency timeline, and the user saw just a
`finding_count` in the notification. Donna's upstream ask
(`docs/upstream-requests/lq-ai-autonomous-run-output.md`) is now **resolved upstream**: findings
are persisted and readable, and memories are filterable per run.

## Upstream contract (verified against vendored source @ `0097b01`)

- **`GET /api/v1/autonomous/sessions/{id}/findings`** → `AutonomousFindingListResponse`:
  `{ findings: [{ id, session_id, severity, title, content, created_at }], total_count, limit, offset }`.
  - Owner-gated via the parent session; another user's/missing id → **404** (id-probing-safe).
  - `?limit=` clamped **[1, 200]**, `?offset=` ≥ 0.
  - Ordered **`created_at` ASC = emission order** (the run's output sequence — intentionally not
    newest-first; the UI must preserve this order).
  - `severity` is **free-text**: intended `info|warn|critical`, but the backend stores whatever the
    model emits — unknown values must render as a neutral badge, never crash or filter out.
- **`GET /api/v1/autonomous/memory?source_session_id=<uuid>`** → `AutonomousMemoryListResponse`:
  `{ entries: [AutonomousMemoryRead], total_count, limit, offset }` (note: **`entries`**, not
  `memories`). Non-deleted only, **`created_at` DESC**, user-scoped, all states unless `?state=`
  also passed. `AutonomousMemoryRead = { id, user_id, state: proposed|kept|dismissed, category,
content, source_session_id?, kept_at?, deleted_at?, created_at, updated_at }`.
- **Precedents are NOT session-filterable** (recurrence-aggregated across sessions) — deliberately
  out of this slice and out of this design.
- No backfill: pre-#135 sessions return zero findings (expected). Findings cascade-delete with
  their session. Both new schemas are typed OpenAPI components → `gen:api` emits real types.

## Decisions (user-confirmed)

- **Scope:** findings + **read-only** "memories this run proposed". Keep/dismiss interaction stays
  in future slice D.
- **Data flow (approach A):** fold findings + memories into the existing receipt payload — no new
  routes, live results while running for free.
- **Placement:** Results section **between the receipt header and the timeline** — the
  work-product is the headline; the timeline is the transparency artifact.
- **Ordering:** findings render in emission order with per-card severity badges + a summary count
  line; NOT grouped by severity (grouping would destroy the intentional run-sequence narrative).

## Changes

### 1. Pin bump + upstream-ask resolution

- `vendor/lq-ai` `fc832ca → 0097b01`; `npm run gen:api` (expect additive: the two finding schemas,
  the findings path, `source_session_id` query param on `/memory`); pin-doc header + bump-log entry.
- `docs/upstream-requests/lq-ai-autonomous-run-output.md`: prepend a **RESOLVED** banner — ask #1
  shipped as `autonomous_findings` table + paginated `GET /sessions/{id}/findings`; ask #2 shipped
  scoped to memories (`?source_session_id=`); precedents flagged recurrence-aggregated → deferred
  (lq-ai #135, pin `0097b01`).

### 2. Data layer — new `src/lib/automations/findings.ts`

House style (mirrors `schedules.ts`/`types.ts` defensive parsing even over typed responses):

- `FindingItem = { id, severity, title, content, created_at }` (drop `session_id` — implicit).
- `RunMemoryItem = { id, state, category, content, created_at }`.
- `parseFindingList(raw): { findings: FindingItem[], total: number }` — reads the `findings`
  envelope + `total_count`; malformed rows dropped.
- `parseRunMemories(raw): RunMemoryItem[]` — reads the **`entries`** envelope; malformed rows
  dropped; unknown `state` → kept as-is string (chip renders it verbatim).
- `severityKind(s: string): 'critical' | 'warn' | 'info' | 'other'` — case-insensitive match on
  the three intended values; anything else → `'other'`.

### 3. Server — widen the receipt payload

Both `[id]/+page.server.ts` (SSR) and `[id]/+server.ts` (poll proxy) fetch **in parallel**:

1. `GET /autonomous/sessions/{id}` (existing — still the gate: its 404/error semantics unchanged)
2. `GET /autonomous/sessions/{id}/findings?limit=200`
3. `GET /autonomous/memory?source_session_id={id}&limit=200`

Payload becomes `{ session, receipt, findings, findings_total, memories }`. **Findings/memories
fetch failures degrade**: the corresponding key is `null` → UI shows "Results unavailable right
now." for findings-null; memories-null just hides the sub-section. The receipt page never fails
because of the new fetches.

### 4. Poll controller — `pollSession.svelte.ts`

`tick()` parses the widened body; exposes `findings`, `findingsTotal`, `memories` rune state
alongside `session`/`receipt`. While running, new findings live-append (ASC ordering makes this a
pure re-render — no client-side merging).

### 5. UI — `RunResults.svelte` + `FindingCard.svelte`, mounted in `SessionDetail.svelte`

`SessionDetail` threads `initialFindings`/`initialFindingsTotal`/`initialMemories` (SSR) and the
live-poll equivalents, derived the same way as `session`/`receipt`, into `<RunResults>` rendered
between `<SessionReceiptHeader>` and `<SessionTimeline>`.

`RunResults` renders:

- Heading: **"Results"** with sub-copy "What this run produced." Running session → "Results so
  far — the run is still working."
- Summary line when findings exist: severity counts in fixed order, e.g.
  `2 critical · 1 warning · 4 info` (only non-zero kinds shown; `other` shown as `N other`).
- Findings list in **emission order**: each `FindingCard` = severity badge + `title` (text-sm
  medium) + `content` (text-sm, `whitespace-pre-wrap`) + `created_at` via existing `formatWhen`.
  Badge colors: critical=`mlq-error`, warn=`mlq-caveats`, info=muted, other=outline/subtle —
  free-text severity beyond the three renders as the neutral `other` badge **showing the raw
  value** (lowercased, truncated to 24 chars).
- `findings_total > findings.length` → quiet note "+N more findings not shown."
- Empty states: terminal + zero findings → "This run recorded no findings."; running + zero →
  "No findings yet."; findings fetch failed (`null`) → "Results unavailable right now."
- **"Memories this run proposed"** sub-section (only when ≥1): compact rows — `category`
  (text-xs muted) · `content` (text-sm) · state chip (`proposed`=workflow tint, `kept`=green
  tint, `dismissed`=muted; unknown state → outline chip with raw text). Read-only; no actions.

### 6. Out of scope

- Keep/dismiss memory actions (slice D), precedents (upstream-deferred), pagination UI beyond the
  "+N more" note, finding counts on session-list/notification rows (avoids N+1 fetches — the
  notification already deep-links to the receipt where Results is the first thing below the header).

## Error handling summary

| Failure                      | Behavior                                            |
| ---------------------------- | --------------------------------------------------- |
| Session fetch fails          | unchanged (404 page / 502)                          |
| Findings fetch fails         | `findings: null` → "Results unavailable right now." |
| Memories fetch fails         | `memories: null` → sub-section hidden               |
| Unknown severity / state     | neutral badge / outline chip with raw text          |
| Malformed finding/memory row | dropped by parser                                   |

## Testing

- **Unit:** `findings.ts` parsers (envelopes, malformed rows, unknown severity/state, totals);
  `severityKind` table; `RunResults` states (populated incl. emission-order assertion, running,
  empty-terminal, unavailable, overflow note, memories shown/hidden, badge variants);
  `FindingCard`; `SessionDetail` threading (initial vs live); both server files (parallel fetch,
  degraded nulls, payload shape); `pollSession` widened parsing.
- **Live e2e:** extend/add an automations spec — trigger a run-now (cost-capped), wait to
  terminal, assert the Results section renders (findings list or the no-findings empty state) on
  the receipt page; assert the memories sub-section is absent when the run proposed none (the
  typical run-now case) — its populated rendering is covered by unit tests.

## Verification

`npm run check` 0/0 · `npx vitest run` green · no new eslint errors · live e2e green on the dev
stack (rebuild `donna-web`; `arq-worker` must be up for runs).
