# Unified Workflows IA — design spec

**Date:** 2026-05-31 · **Phase:** P5 Workflows (final slice) · **Status:** approved, ready to plan

## Goal

P5's roadmap deliverable is a **unified** Skills + Playbooks + Saved Prompts area. Those three
shipped as their own top-level sidebar entries + routes (`/skills`, `/playbooks`, `/prompts`); the
`/workflows` route is still a stub ("Coming in a later phase"). This slice ties them together under
one **Workflows** area: a hub landing page, a shared segmented sub-nav, and a consolidated sidebar —
without relocating any merged, tested routes.

## Decisions (settled in brainstorming, with the visual companion)

1. **Hub model (IA option A).** One "Workflows" sidebar entry. `/workflows` becomes a real hub.
   The three tools keep their current top-level routes (`/skills`, `/playbooks`, `/prompts`) — they
   are _reached through_ the area, not relocated. Chosen over a light-touch index (barely unifies)
   and full `/workflows/*` consolidation (high churn: redirects + every in-app link + tests, against
   Donna's restraint thesis).
2. **Segmented sub-nav (navigation option B).** A small "Skills · Playbooks · Prompts" segmented
   control sits atop the hub and the three index pages. One click to switch tools, always visible.
   Chosen over breadcrumb-only (switching means a hub round-trip) and sidebar-expands-to-sub-items
   (re-bloats the sidebar we just trimmed).
3. **Pure nav hub — transparency deferred.** No counts, recent-activity, or usage surfaces in this
   slice. Donna already has transparency primitives elsewhere (the applied-skills footer from #24,
   citations, the tier badge). The roadmap's "transparency surfaces" are a later concern; don't
   over-build. See Future work.

## Scope

One PR-sized slice. **In scope:**

- New shared `WorkflowsNav` segmented control component.
- `/workflows` hub page (replaces the stub).
- Wire the sub-nav into the three existing index pages.
- Sidebar consolidation (4 area-related entries → 1) + active-state fix.
- Unit/component tests + one live e2e.

**Out of scope (non-goals):**

- Transparency surfaces (counts, recently-used/edited, usage, "what's in play" cross-links).
- Relocating routes under `/workflows/*` or any redirects.
- The sub-nav on deep sub-pages (skill editor, playbook `new`/`run`, prompt modal flows) — those
  keep their existing navigation untouched.
- Any change to Skills / Playbooks / Prompts _functionality_ (lists, "+ New" buttons, modals,
  controllers, BFF proxies all stay exactly as they are).

## Components

### `src/lib/workflows/WorkflowsNav.svelte` (new)

Shared, purely presentational segmented control — no `load`, no I/O.

- Props: `active: 'skills' | 'playbooks' | 'prompts' | null`.
- Renders exactly three `<a>` segments → `/skills`, `/playbooks`, `/prompts`. It renders **only**
  the segmented control — no page heading or area title (each page supplies its own `<h1>`). This
  keeps the component a single-purpose control reusable across the hub and all three index pages.
- The active segment gets `aria-current="page"` and the highlighted token style; `active={null}`
  (the hub) highlights none.
- In-app links carry the `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->`
  comment, matching the `Sidebar.svelte` convention.
- Styling mirrors the existing tokens (`rounded-mlq-control`, `bg-mlq-subtle` for the active
  segment, `text-mlq-muted`/`text-mlq-text`). Container is `inline-flex` with a subtle border, like
  a standard segmented control.

### `src/routes/(app)/workflows/+page.svelte` (replaces the stub)

- `max-w-3xl px-4 py-6` container (matches the three index pages for visual continuity).
- `<h1>` "Workflows" styled to match the three sibling index pages (`text-xl font-medium
text-mlq-text`), not the old stub's serif — so the hub and its tools read as one cohesive area.
- `<WorkflowsNav active={null} />`.
- Three cards (a simple responsive grid; `flex`/`grid` of equal cards), each: a Lucide icon
  (Skills = `ScrollText`, Playbooks = `Library`, Prompts = `BookMarked` — the icons already used in
  the sidebar), the tool name, and a one-line plain-language description:
  - **Skills** — "Reusable instructions you attach to a chat to shape how Donna responds. Author
    your own or fork a built-in."
  - **Playbooks** — "Standard negotiation positions Donna applies to a contract — verdicts and
    redlines, position by position."
  - **Prompts** — "Saved prompt snippets you drop into the composer to reuse wording you rely on."
  - Each card is a link (`<a>`) to its route (whole card clickable), with the navigation-resolve
    disable comment.
- No `+page.ts`/`+page.server.ts` `load` — the hub is static.

### Three index pages (edit, minimal)

`src/routes/(app)/skills/+page.svelte`, `…/playbooks/+page.svelte`, `…/prompts/+page.svelte`:
add `<WorkflowsNav active="skills|playbooks|prompts" />` at the top of the existing container, above
the current title+button header row. **No other change.** Their `load` functions, lists, "+ New"
buttons, modals, and controllers are untouched.

### `src/lib/components/Sidebar.svelte` (edit)

- Remove the `Skills`, `Playbooks`, `Prompts` entries from the `nav` array. Keep the single
  **Workflows** entry (`Workflow` icon → `/workflows`). Drop the now-unused icon imports
  (`ScrollText`, `Library`, `BookMarked`).
- **Active-state fix:** the Workflows entry must show `aria-current="page"` + active style for
  `/workflows` **and** its children `/skills`, `/playbooks`, `/prompts`. Generalize `isActive` so a
  nav entry can declare extra match-prefixes — e.g. give the Workflows entry
  `match: ['/workflows', '/skills', '/playbooks', '/prompts']` and have `isActive` test any of them
  (falling back to the existing `href`/exact-`/` logic for the others). Pure function change; keep
  Assistant's exact-match for `/`.
- Net sidebar: Assistant, Projects, Workflows, Tabular (+ the logout/account row). 7 nav entries → 4.

## Data flow

None new. The hub and `WorkflowsNav` are static/presentational. The three index pages keep their
existing SSR `load` + controllers verbatim. No new BFF proxies, no backend calls, no contract
changes.

## Error handling

Nothing to handle — no I/O introduced. Existing per-page error handling is unchanged.

## Testing (TDD)

Unit/component (`@testing-library/svelte`, `render(C, { props })`):

- **`WorkflowsNav.svelte.test.ts`** — renders three links with the correct `href`s; for each
  `active` value the right segment carries `aria-current="page"` and the others don't;
  `active={null}` highlights none.
- **Hub page** (`workflows/+page` component test) — renders the "Workflows" `<h1>`, the nav, and
  three cards whose links point at `/skills`, `/playbooks`, `/prompts`.
- **Sidebar** (`Sidebar.svelte.test.ts`, update) — the standalone Skills/Prompts link assertions
  (lines 9–23) change: assert a single **Workflows** entry → `/workflows`, and assert the
  Skills/Playbooks/Prompts top-level entries are **gone**. Add active-state coverage: with
  `$app/state` `page.url.pathname` mocked to each of `/workflows`, `/skills`, `/playbooks`,
  `/prompts`, the Workflows entry is `aria-current="page"`; on an unrelated path (`/matters`) it is
  not. (Mock `$app/state` the way other component tests in the repo do.)
- Add an index-page assertion (in each existing page test, or a focused one) that `WorkflowsNav`
  renders with the correct active segment. Keep it light — the WorkflowsNav behaviour itself is
  covered by its own test.

Live e2e (`tests/workflows-ia.spec.ts`, against the running stack, read-only/self-cleaning):

- Log in; go to `/workflows`; assert the hub heading + three cards.
- Click each sub-nav segment → lands on `/skills`, `/playbooks`, `/prompts` with that segment
  `aria-current="page"`.
- The sidebar **Workflows** entry stays highlighted across all four paths.
- The three removed sidebar entries (Skills/Playbooks/Prompts as _top-level_ sidebar links) are
  absent. (Scope the selector to the sidebar `<nav>` so the sub-nav links don't false-match.)

## Quality bar

`npm run check` 0 errors / 0 warnings; eslint clean (no `any`); in-app `<a>`/`goto` carry the
`svelte/no-navigation-without-resolve` disable comment; component tests via
`@testing-library/svelte`. Per the established loop: TDD, fresh implementer per task with two-stage
review (spec compliance, then code quality), commit per task, whole-branch review, PR into `main`.

## Future work (fast-follow, not this slice)

- **Autonomous workflows surface.** The LQ*AI backend is expected to land \_autonomous workflows*
  (multi-step agentic flows) soon. The unified Workflows area built here is the natural home for a
  future surface that exposes them — likely a fourth tool/segment ("Workflows" proper, or
  "Automations") once the backend contract exists. Confirm endpoints at slice time via the upstream
  workflow; not buildable until the backend ships. This is precisely why a clean, extensible area
  (shared sub-nav + hub) is worth establishing now.
- **Transparency surfaces.** At-a-glance counts, recently-edited/used, and "what's in play"
  cross-links to the applied-skills/playbooks data — revisit once there's product demand and the
  backend exposes the needed usage data.
- **Route consolidation** under `/workflows/*` with redirects — only if the flat top-level routes
  prove confusing; deliberately avoided here to dodge churn.
