# Design: Fiduciary Slice 6-lean — Contextual Capability Discovery

> **Status:** approved design (brainstorm complete) — pending spec review, then `writing-plans`.
> **Date:** 2026-07-02
> **Segment:** the fiduciary-grade auditability segment. **Slice 6-lean** of
> `docs/superpowers/specs/2026-07-01-fiduciary-auditability-design.md` (§5 Slice 6-lean). Slices 0–5
> are shipped. This is the final build slice of the segment.

---

## 1. Goal

Help the non-technical user **discover** the fiduciary features they might otherwise miss, with a couple
of small, one-time, dismissable in-context hints. Client-side only, greenfield, no backend dependency.
Ruthlessly lean: one reusable primitive + a tiny persistence store + two wired hints.

## 2. Grounding (what the codebase already gives us)

- **No coachmark/hint/tour system exists** — confirmed greenfield.
- **Popovers/callouts are hand-rolled** `$state` + Tailwind everywhere; there are **zero** `bits-ui`
  usages in `src` (the `Tooltip` re-export in `$lib/design/primitives.ts` has never been consumed). The
  visual language for a callout is `src/lib/chat/ConnectedBanner.svelte`
  (`rounded-mlq-control border border-mlq-*/40 bg-mlq-*/5 px-3 py-2 text-xs`); the dismiss-toggle idiom
  is the `FiduciaryReceipt` Export menu (`let open = $state(false)`).
- **localStorage + runes** has a clean template: `src/lib/models/store.svelte.ts` — a `createXxx()`
  factory holding `$state` initialized from a `readStored()` helper, persisting on mutation, all guarded
  by `hasStorage()` (`typeof localStorage !== 'undefined'`) + `try/catch` (private-mode safe), with an
  exported app-global singleton. (No existing `Set`/array serialization precedent — we establish it.)
- **Starters** are `string[]` + `onpick` pill components (`ComposerStarters`, `ResearchStarters`); the
  landing composer already surfaces a citation-producing prompt.

## 3. Decisions (locked in this brainstorm)

1. **Primitive = a hand-rolled dismissable callout** (`fiduciary/Hint.svelte`), not a bits-ui Tooltip —
   matches the codebase (zero bits-ui usage), simpler, testable, no positioning complexity.
2. **Persistence = a rune-store singleton** (`fiduciary/hints.svelte.ts`) mirroring `models/store.svelte.ts`,
   holding a `Set<string>` of dismissed hint ids, serialized to `localStorage['donna.dismissedHints']`.
3. **Two hints** this slice: the trust-pill discoverability nudge + the research authoritative-sources
   nudge. The provenance-export nudge is **dropped** (marginal — the Export menu is self-explanatory).
4. **No standalone suggested-task starters this slice** (a refinement to §5's mention): the existing
   `ComposerStarters` already surfaces a citation-producing prompt that yields a fiduciary receipt, so a
   separate fiduciary starter set would largely duplicate it. Ship the hints — that is the real
   discoverability gap. (Revisitable; the `*Starters` convention is available if we later want one.)
5. **Deferred to 6-full** (separate later brainstorm): a general, app-wide dynamic capability-discovery
   engine, and any cross-device server-persisted "seen" flag (would need a `/users/me/preferences` key —
   upstream). This slice stays fiduciary-scoped and localStorage-only.

## 4. Components

### 4.1 `src/lib/fiduciary/hints.svelte.ts` — the dismissal store (new)

A rune-store factory + app-global singleton, mirroring `models/store.svelte.ts`:

```ts
export const DISMISSED_HINTS_KEY = 'donna.dismissedHints';

export function createHintStore() { … }        // testable per-instance
export const hintStore = createHintStore();     // app-global singleton
```

- Holds `let dismissed = $state<Set<string>>(readStored())` where `readStored()` parses the localStorage
  JSON array into a `Set` (guarded by `hasStorage()` + `try/catch`, defaulting to an empty `Set`).
- `isDismissed(id: string): boolean` — reactive read (`dismissed.has(id)`).
- `dismiss(id: string): void` — adds the id, reassigns the `$state` (`dismissed = new Set(dismissed).add(id)`
  so Svelte tracks it), and persists `JSON.stringify([...dismissed])` (guarded + try/catch).
- Malformed/absent storage → empty set (honest degradation; a hint simply shows again — never throws).

### 4.2 `src/lib/fiduciary/Hint.svelte` — the reusable callout primitive (new)

The one new UI primitive. Props: `{ id: string; children: Snippet }` (Svelte 5 snippet children).

- Reads the singleton: renders **nothing** when `hintStore.isDismissed(id)`.
- Otherwise a callout styled after `ConnectedBanner` — `role="note"`, a small `ℹ`/info lucide icon, the
  `{@render children()}` content, and a trailing **`×` dismiss button** (`aria-label="Dismiss hint"`)
  that calls `hintStore.dismiss(id)`.
- No positioning/floating logic — it renders inline at its mount site. Fully unit-testable.

### 4.3 Wired hints (two mount sites)

- **`fiduciary-trust-pill`** — rendered **once** in the chat page `routes/(app)/chats/[id]/+page.svelte`
  (not inside `Message.svelte`, to avoid one-per-message duplication), gated on
  `messages.some((m) => m.ledgerGate)` (i.e. the conversation has at least one answer with a receipt) and
  not-dismissed. Placed at the top of the message thread. Copy: _"New — every answer now carries a
  **trust pill** in its footer. Click it to open the receipt and trace each claim back to its source."_
  with a `Learn more →` link to `/about/fiduciary`.
- **`fiduciary-research-sources`** — rendered once in `routes/(app)/research/+page.svelte` near the
  `ResearchSourcesCard`, gated only on not-dismissed. Copy: _"The **Authoritative sources** card below
  shows which primary-law sources this instance can reach right now."_

Single render site per hint ⇒ each shows at most once (until dismissed), no multiplication.

## 5. Testing strategy (CLAUDE.md gates)

- **Unit — `hints.svelte.ts`:** `createHintStore()` against a fresh instance — `isDismissed` false by
  default; `dismiss(id)` flips it and writes `localStorage['donna.dismissedHints']` = `["id"]`; a second
  `createHintStore()` reads the persisted set back (round-trip); malformed JSON / absent storage → empty
  set, never throws; the `hasStorage()` guard path.
- **Component — `Hint.svelte`:** renders its children + a dismiss button when not dismissed; renders
  nothing when the id is already dismissed; clicking `×` calls `hintStore.dismiss(id)` and the callout
  disappears. (Use a distinct `id` per test + `localStorage.clear()` in `beforeEach` to isolate the
  singleton.)
- **Component — wirings:** the chat page renders the trust-pill hint when a message has a `ledgerGate`
  and not otherwise; the research page renders the sources hint. (Light — assert presence at the mount
  site.)
- **Live e2e (`fiduciary-hint.spec.ts`):** on the Research page (no DB seed needed — the sources card
  always renders), the `fiduciary-research-sources` hint is visible; dismiss it; reload the page; assert
  it stays gone (proves the localStorage persistence end-to-end). Self-contained.
- **Gates every task:** `npm run check` 0/0, `npm run lint` green, `npx vitest run` passing.

## 6. Out of scope / deferred

- No bits-ui, no floating/positioned coachmark, no arrow/spotlight overlay.
- No standalone suggested-task starters (§3.4).
- No app-wide discovery engine, no cross-device "seen" flag (6-full / upstream).
- No backend change, no pin bump.

## 7. Sequencing

Within the segment: **Slice 6-lean (this) → file 2 upstream asks (`lq-ai-cross-user-auditor-role.md`,
`lq-ai-signed-attestation-export.md`) → release cut** (images + macOS DMG + About PDF regen). This slice:
light `writing-plans` → subagent-driven TDD → two-stage review per task → whole-branch review → PR **with
a merge commit** (never squash) → mirror `main` to `tucuxi`.

## 8. Decisions locked

1. Hand-rolled dismissable callout `fiduciary/Hint.svelte` (no bits-ui).
2. `fiduciary/hints.svelte.ts` rune-store singleton; `Set<string>` in `localStorage['donna.dismissedHints']`.
3. Two hints: `fiduciary-trust-pill` (chat page, once, gated on a receipt existing) + `fiduciary-research-sources` (research page).
4. No standalone starters this slice.
5. Persistence is localStorage-only; honest degradation (never throws; a lost dismissal just re-shows).
