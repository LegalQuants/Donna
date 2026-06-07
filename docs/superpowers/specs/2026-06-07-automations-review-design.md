# Automations slices D + E — Review (memory · precedents · proposals) design

**Date:** 2026-06-07 · **Status:** approved by user (brainstorm session)
**Pin:** `vendor/lq-ai @ 0097b01` — all endpoints below verified fully typed in
`src/lib/api/backend.d.ts` (no pin bump, no `gen:api` needed).

## Goal

Close out the Automations segment's last two slices: a place to **review what the agent
learned** — proposed memories (keep / edit-on-keep / dismiss / delete), recurring precedents
(dismiss / promote), and project-context proposals (accept = the one authorized write into a
matter's `context_md`, per upstream ADR 0013 D5).

## Shape: two sequential PRs, one Review home

|          | Branch                                                    | Contents                                                                                     |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **PR D** | `feat/automations-memory-review`                          | `/automations/review` page + 5th nav tab + Memory queue + the three banked receipt leftovers |
| **PR E** | `feat/automations-precedents` (off `main` after D merges) | Precedents + Proposals sections on the same page                                             |

User decisions (2026-06-07): two PRs · one combined **Review** tab (not per-surface tabs) ·
all three D leftovers included · proposals surface in Automations only (matter page untouched).
Approach: **SSR page + form actions** (house pattern; no BFF proxies, no client poll — review is
a deliberate activity, not a live view).

## Backend contract (verified at `0097b01`)

- `GET /api/v1/autonomous/memory?state=proposed|kept|dismissed&limit=&offset=` →
  `AutonomousMemoryListResponse { entries: AutonomousMemoryRead[], total_count, limit, offset }`
  (non-deleted, newest first). `AutonomousMemoryRead.state` is a TYPED enum; `category` is
  free-text (render defensively). `?source_session_id=` also supported (used by the receipt).
- `POST /memory/{id}/keep` body `MemoryKeepRequest { content?: string|null }` — **edit-on-keep**:
  content provided ⇒ text overwritten. → `AutonomousMemoryRead`.
- `POST /memory/{id}/dismiss` → `AutonomousMemoryRead`. `DELETE /memory/{id}` → **200** (not 204).
- `GET /precedents?pattern_kind=&limit=&offset=` → `PrecedentEntryListResponse` (non-dismissed,
  newest first). `pattern_kind` free-text; `observed_count` int; `source_session_id` nullable.
- `POST /precedents/{id}/dismiss` → `PrecedentEntryRead`.
- `POST /precedents/{id}/promote` body `PromotePrecedentRequest { project_id }` (caller must own
  the project) → `ProjectContextProposalRead` (creates a **proposal**; no project write).
- `GET /project-context-proposals?state=&project_id=` → `ProjectContextProposalListResponse`.
  `state` TYPED enum proposed|accepted|rejected; `suggested_md` is the markdown to append.
- `POST /project-context-proposals/{id}/accept` → appends `suggested_md` to the project's
  `context_md` (the only write into Projects). `POST /{id}/reject`.

## PR D — Memory review

### Route & nav

- `/automations/review` (`+page.svelte` + `+page.server.ts`), wrapped in the existing
  `AutomationsGate` like its siblings.
- `src/lib/automations/AutomationsNav.svelte`: 5th tab `{ id: 'review', label: 'Review',
href: '/automations/review' }` (order: Sessions · Schedules · Watches · Notifications · Review).

### Queue UI

- Segmented state filter **Proposed | Kept | Dismissed** — SSR via `?state=` (default
  `proposed`), reusing the `SegmentedControl` pattern; linkable/bookmarkable.
- `MemoryRow.svelte` per entry: state chip (reuse the receipt's `stateChipClass`), free-text-safe
  `category` badge, `content`, created date, and — when `source_session_id` is set — a "From run"
  link to `/automations/{source_session_id}`.
- Pagination: `total_count` line + plain SSR **Prev / Next** `?offset=` links (page replacement,
  no client accumulation — the queue is small in practice; "load more" UX is explicitly not v1).
- Actions by state, all `use:enhance` form actions with row-scoped errors + `invalidateAll`:
  - **proposed:** Keep (`?/keep`, no body content) · Edit & keep (expands an inline textarea
    seeded with the current content; submit sends `content` → edit-on-keep) · Dismiss
    (`?/dismiss`).
  - **kept / dismissed:** Delete via the house two-step confirm (`?/delete`; backend returns 200).
- Errors: action 404 (entry gone) → row-scoped "This memory no longer exists." + refresh;
  422 → inline message; non-JSON/5xx → generic row error. Load failure → page-level error state
  (NOT a silent empty list).

### Receipt-page integration (the three banked leftovers)

1. **Keep/Dismiss on the receipt:** `RunResults.svelte`'s "Memories this run proposed" rows gain
   inline Keep + Dismiss buttons for `state === 'proposed'` entries, posting to new
   `?/keepMemory` / `?/dismissMemory` actions on the session page's existing
   `automations/[id]/+page.server.ts`. (No edit-on-keep on the receipt — full editing lives in
   the Review queue.) On success the existing poll/invalidate refreshes the state chip in place.
2. **Memories overflow note:** thread the memory list's `total_count` through
   `$lib/automations/runOutput.server.ts` (it already fetches with `limit=200`); when
   `total_count > memories.length`, render "+N more — review all in Automations → Review" linking
   `/automations/review`.
3. **Last-known-good retention:** the 2s poll currently degrades the whole Results section to
   "Results unavailable right now." on any transient fetch failure. Change: retain and keep
   rendering the last successful payload; show the unavailable state only when there has never
   been a successful payload in this page visit.

### New/changed files (D)

- New: `src/routes/(app)/automations/review/{+page.svelte,+page.server.ts}` (+ server test),
  `src/lib/automations/{memory.ts,memory.test.ts,MemoryRow.svelte,MemoryRow.svelte.test.ts}`.
- Modified: `AutomationsNav.svelte` (+test), `RunResults.svelte` (+test),
  `runOutput.server.ts` (+test), `automations/[id]/+page.server.ts` (+test, 2 new actions),
  `pollSession.svelte.ts` or the page's poll wiring for last-known-good (+test).
- `$lib/automations/memory.ts`: types from the generated contract + defensive `parseMemoryList`
  mirroring `findings.ts` (free-text category; drop malformed rows, never throw).

### Verification (D)

`npm run check` 0/0 · vitest (new suites + updated) · `npm run lint` stays fully green · live
e2e `tests/automations-memory-review.spec.ts`: drive a proposed memory through
keep-with-edit → (filter Kept) → delete; and dismiss → delete a second one; receipt
keep/dismiss exercised on a session that has proposed memories. Seeding: prefer existing dev-DB
proposed memories; if none, the spec'd fallback is a run-now session (slow path — plan decides
after checking the dev DB). Self-cleaning via delete.

## PR E — Precedents + proposals

### UI (same Review page, two sections appended)

- **Precedents** section: rows show free-text-safe `pattern_kind` chip, `summary`,
  "seen {observed_count}×", created date, "From run" link when `source_session_id` set.
  Actions: **Dismiss** (two-step confirm; row leaves the list) · **Promote…** — opens the shared
  `MatterPicker` (placement `'down'`) to choose an owned matter, then `?/promote` posts
  `{ project_id }`; success shows "Proposal created below" and the Proposals section refreshes.
  No `pattern_kind` filter in v1 (YAGNI — free-text with unknown cardinality).
- **Proposals** section: default `state=proposed` rows — target matter name (resolved from the
  matters list fetched in `load`; fall back to the raw id if the matter is gone), `suggested_md`
  shown in a bordered monospace/prose-lite block, created date. Actions: **Accept** (two-step
  confirm — it writes the matter's context) · **Reject**. Accepted/rejected rows drop from view.
  Accept success → inline confirmation linking the matter (`/matters/{project_id}`).

### Server (E)

- Extend `review/+page.server.ts` load: parallel `Promise.all` of memory + precedents +
  proposals (+ the matters list for name resolution); each section degrades independently
  (a failed precedents fetch shows a section-scoped error, not a dead page).
- 4 new actions: `?/dismissPrecedent`, `?/promote`, `?/acceptProposal`, `?/rejectProposal`.
  Errors row-scoped: 404 → "no longer exists" (also covers promote-to-deleted-project);
  422/4xx body `detail` surfaced via the `errorDetail` helper where it adds precision.
- New: `src/lib/automations/{precedents.ts,precedents.test.ts,PrecedentRow.svelte,
ProposalRow.svelte}` (+tests).

### Verification (E)

Same gates; live e2e `tests/automations-precedents.spec.ts`: against a scratch matter —
promote an existing precedent → proposal appears → accept → assert the matter's Context now
contains `suggested_md` → clean up (delete the matter; reject/dismiss leftovers). If the dev DB
has no precedents, the plan must first verify what creates them (recurrence-aggregated across
runs) and may need a seeded pair of runs — resolve at plan time, before tasks are written.

## Out of scope

- Precedent `pattern_kind` filtering, proposal history views beyond the default lists.
- Surfacing proposals on the matter page (explicitly declined).
- Email/webhook notification channels; any `vendor/lq-ai` change (none needed — contract is live).

## Risks / notes

- **E2e seeding** is the main unknown for both e2es (memories need a run that proposed some;
  precedents need recurrence). Plans must verify dev-DB state first and write the seed path
  explicitly.
- The receipt's memories section and the Review queue mutate the same rows — both go through
  `invalidateAll`, so no cache coherence work is needed.
- `category` and `pattern_kind` are free-text: chips must render unknown values neutrally
  (same rule as finding severity).
