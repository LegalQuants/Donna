# P7-3 — Preferences + ambient trust pills (Settings slice 3 of 4)

**Date:** 2026-06-01 · **Branch:** `p7-3-preferences` · **Phase:** P7 Settings, slice 3 (Account → Data & privacy → **Preferences** → Trust)

## Goal

Add a `/settings/preferences` page to the existing settings shell that exposes the user preferences Donna **actually honors** — no no-op toggles. Today that means two controls:

1. **Message details** → `provenance_pills` (`always` | `collapsed`) — wires to the existing per-message provenance pill row in `Message.svelte`.
2. **Trust indicator** → `trust_pills` (`labels` | `dots`) — formats a **new ambient "where inference runs" pill** built as part of this slice and mounted in the composer.

Both persist via `PATCH /api/v1/users/me/preferences` and apply app-wide immediately.

## Key context / findings

- **No preference is honored in Donna's UI today.** All six `UserPreferences` fields (`reasoning_visibility`, `featured_tools`, `workspace_layout`, `trust_pills`, `provenance_pills`, `autonomous_enabled`) are "Wave A/B" concepts for the LQ_AI reference UI; none are consumed in `src/`. Shipping toggles for unconsumed fields would repeat the `skill_inputs` no-op trap. **So P7-3 exposes only what it wires up.**
- `provenance_pills` maps to a **real existing element**: `Message.svelte` renders the per-message pill row (Tier badge, `Anonymized` shield, `Applied:` skills footer).
- `trust_pills` has **no existing UI** — this slice builds the ambient trust pill (decided in brainstorming to build it now rather than ship a one-control page).
- `reasoning_visibility`, `featured_tools`, `workspace_layout`, `autonomous_enabled`: **out of scope** — Donna has no UI for them yet (autonomous is a deferred feature; the others would require building new UI modes). They join the page when their consuming UI exists.

## Backend contract (verified @ pin `badf83d`, v0.4.0)

- `GET /api/v1/users/me/preferences` → `UserPreferences` (full slice). Not needed for load — see below.
- `PATCH /api/v1/users/me/preferences` → body `UserPreferencesUpdate` (all fields optional; only supplied keys move; idempotent) → returns updated `UserPreferences`.
- The **full `User`** object (from `GET /users/me`, surfaced as `locals.user` → `data.user` via the `(app)` layout `+layout.server.ts`) already embeds `trust_pills` and `provenance_pills`. So current values are read from `data.user` with **no extra fetch**.
- The composer model picker already normalizes each model to a `ChatModelOption` carrying **`group: 'local' | 'cloud'`** and **`tier`** (`src/lib/models/normalize.ts`). The trust pill derives its posture from the *selected* option — **no new endpoint, no `/inference/current-tier` call, no BFF proxy for the pill.**

## Decisions locked in brainstorming

1. **Scope** — build the trust pill now; expose exactly two controls (`provenance_pills`, `trust_pills`). No no-op toggles.
2. **Trust pill** — lives in the **composer control row** (composer-only; no header mirror). Reflects the **selected model's** routing. `labels` (default): green `● Self-hosted · Local` / amber `● Cloud · {provider} · Tier {n}`. `dots`: colored dot only (green=local, amber=cloud), full detail on hover. Green/amber coloring approved.
3. **Preferences page** — `/settings/preferences`; two segmented controls, each with a small live preview of exactly what it affects.
4. **Save-on-change (optimistic)** — toggling fires `PATCH` for that one field; optimistic local update; `invalidateAll()` on success so all consumers reflect it; revert + inline error on failure. No explicit Save button.

## Architecture

### Route & shell
- **`SettingsRail.svelte`** — append `{ href: '/settings/preferences', label: 'Preferences' }` (3rd entry).
- **`src/routes/(app)/settings/preferences/+page.svelte`** — the two segmented controls + live previews; binds each control to its **own page-load value** (`data.provenancePills` / `data.trustPills`); optimistic toggle handlers call the BFF proxy.
- **`src/routes/(app)/settings/preferences/+page.server.ts`** — SSR `load` returning `{ provenancePills, trustPills }` from `event.locals.user` (reload-safe + unit-testable without the layout). After a successful PATCH the page calls `invalidateAll()`, which re-runs this load, so the controls stay in sync. *(No form actions — saves go through the proxy below for the optimistic client path.)*
- **`src/routes/(app)/settings/preferences/+server.ts`** — `PATCH` BFF proxy → `lqFetch(event, '/api/v1/users/me/preferences', { method: 'PATCH', body })`. Validates the body is a known pref field → value; passes the backend's updated `UserPreferences` back as JSON; maps non-ok to 502 (404/503/504 passthrough), mirroring `files/[id]/+server.ts`.

### Components
- **`src/lib/preferences/SegmentedControl.svelte`** — reusable 2+ option segmented control (`options: {value,label}[]`, `value` bindable, `onchange`). Pure presentational; `role="radiogroup"` + `aria-checked` buttons for a11y.
- **`src/lib/preferences/preferences.ts`** — pure helpers + types: the option lists for each control, and `trustPosture(option: ChatModelOption): { kind: 'local' | 'cloud'; label: string; tone: 'local' | 'cloud' }` deriving the pill content from a selected model option.
- **`src/lib/preferences/TrustPill.svelte`** — props `{ option: ChatModelOption | null; format: 'labels' | 'dots' }`. Renders the pill from `trustPosture(option)`; `labels` shows dot+text, `dots` shows dot only with the text in `title`. Renders nothing if `option` is null.

### Wiring
- **Composer** (`src/lib/components/Composer.svelte`) — mount `<TrustPill option={selectedOption} format={page.data.user?.trust_pills ?? 'labels'} />` in the control row. `selectedOption` is the currently-selected `ChatModelOption` (already available to the picker; thread it or look it up from the options list by `selectedModel`). Read `trust_pills` from `$app/state` `page.data.user`.
- **`Message.svelte`** — gate the existing pill row on `page.data.user?.provenance_pills`. When `'collapsed'`, hide the row behind a small inline disclosure (a compact "details" affordance the user can click to reveal the pills for that message); when `'always'` (default/undefined), render as today. Pills markup itself is unchanged.

### Data flow
`data.user.{trust_pills, provenance_pills}` (from the `(app)` layout) is the single source of truth. The Preferences page mutates a field via the PATCH proxy, optimistically reflects it locally, then `invalidateAll()` re-runs the layout load so `page.data.user` updates everywhere (composer pill + message pills) without a full reload.

## Error handling

- PATCH proxy non-ok → the page reverts the optimistic toggle to its prior value and shows an inline "Couldn't save — try again" message near that control. No partial state persists (each PATCH carries one field).
- Trust pill with no/unknown selected option → renders nothing (composer still usable).

## Testing

- **Unit (vitest + jsdom):**
  - `preferences.ts` — `trustPosture` for local vs cloud options (label/tone), option lists.
  - `SegmentedControl.svelte` — renders options, marks the active one (`aria-checked`), fires `onchange` on click.
  - `TrustPill.svelte` — labels vs dots × local vs cloud (text shown vs dot-only-with-title; green vs amber); renders nothing when option is null.
  - `Message.svelte` — pill row shown when `provenance_pills==='always'`/undefined; collapsed behind the disclosure when `'collapsed'` (mock `page.data.user`).
  - Preferences page — both controls render with values seeded from `data.user`; a toggle calls the proxy (mock `fetch`) and updates optimistically.
- **Server (`// @vitest-environment node`, `vi.mock('$lib/server/lqClient')`):** the PATCH proxy — forwards `/api/v1/users/me/preferences` with the field body, returns updated prefs on 200, maps failure to 502.
- **Live e2e (Playwright, mirrors `settings-account.spec.ts`, self-cleaning):** on `/settings/preferences`, flip **Message details** → assert the page reflects it and (navigating to a chat with an assistant turn) the provenance row is collapsed; flip **Trust indicator** Labels↔Dots → assert the composer pill changes form. **Restore both to defaults at the end** so the shared admin fixture isn't left mutated (set `provenance_pills:'always'`, `trust_pills:'labels'`).

## Scope / guardrails

- Reuse the P7-1/P7-2 settings shell — append the rail entry + add the `/settings/preferences` route.
- **Only two controls** — the four unconsumed prefs are explicitly out of scope (documented above) and are NOT rendered.
- BFF: one small PATCH proxy for the optimistic client path; no form actions needed.
- Quality bar: `npm run check` 0/0; eslint clean (no `any`/`!`); a11y on the segmented control (radiogroup) and the disclosure; in-app nav (none expected) carries the resolve disable comment if added.
- **e2e hygiene:** preferences mutate the shared admin fixture's profile — the live test MUST restore defaults in a `finally`.

## Out of scope

- `reasoning_visibility`, `featured_tools`, `workspace_layout`, `autonomous_enabled` — no consuming UI yet; add to this page when built.
- A full Trust/tier **page** (`/inference/tier-config`, `/inference/current-tier`) — that's **P7-4 Trust** (next slice). The ambient pill here is the lightweight, always-visible companion to that future page.
- Per-message persistence of the collapsed/expanded provenance state — the disclosure is per-render UI state, not a saved preference.
