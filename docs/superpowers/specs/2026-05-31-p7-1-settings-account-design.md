# P7-1 — Settings shell + Account & Security — design spec

**Date:** 2026-05-31 · **Phase:** P7 (slice 1 of 4) · **Status:** approved, ready to plan

## Goal

Stand up Donna's **Settings** area and its first section, **Account & Security**: a read-only profile
view, a path to change password, and two-factor (MFA) status with a disable action. This slice builds
the settings IA shell every later P7 slice plugs into.

## P7 decomposition (agreed)

Four PR-sized slices, built in order:
1. **Settings shell + Account & Security** ← this spec.
2. **Data & privacy** — data export (async job + poll + download) + account deletion (+ cancel, grace period).
3. **Preferences** — the backend preference fields, scoped to those that affect Donna's behavior.
4. **Trust** — tier-config + current-tier + anonymization/privacy posture page.

## Decisions (settled in brainstorming, with the visual companion)

1. **IA = left sub-rail + sub-routes** under `/settings` (option A). A `/settings` `+layout.svelte`
   renders a vertical **section rail** + content slot; sections are sub-routes
   (`/settings/account`, and later `/settings/{data,preferences,trust}`). `/settings` redirects to
   `/settings/account`.
2. **Rail is built-as-you-go** — slice 1's rail shows only **Account**; later slices add their entry.
   No greyed/"coming soon" placeholders (minimal-thesis; no dead UI).
3. **Sidebar entry** — a ⚙ **Settings** link in the bottom account cluster, just above the Sign-out
   form; active when the path starts with `/settings`.
4. **Profile is read-only** — editing is deferred (no `PATCH /users/me` yet; upstream ask relayed). A
   small muted note states name/email aren't editable here yet.
5. **Password** reuses the existing `/change-password` flow (link out); fall back to a settings-scoped
   form only if that route isn't reachable while authenticated.
6. **MFA = status + disable only** — enabling/TOTP setup is out of scope (no setup UI). Disable via a
   confirm modal.

## Scope

**In scope:** the `/settings` shell (layout + rail + redirect), the `/settings/account` page (profile
view, password link, MFA status + disable), the sidebar Settings entry, tests, one live e2e.

**Out of scope (later slices / deferred):** profile editing (backend-blocked), MFA enable/setup, data
export, account deletion, preferences, the Trust page.

## Components & files

### Shell
- **`src/routes/(app)/settings/+layout.svelte`** — renders `<SettingsRail />` + `<slot />` in a
  two-column layout (`max-w-…` container consistent with other pages; rail left, content right;
  collapses to stacked on narrow widths).
- **`src/routes/(app)/settings/+page.ts`** — `load` that `redirect(307, '/settings/account')` so
  `/settings` lands on the first section.
- **`src/lib/settings/SettingsRail.svelte`** — the section rail. Data-driven from a small local list
  of built sections (slice 1: `[{ href: '/settings/account', label: 'Account' }]`). Active item via
  `page.url.pathname` (`aria-current="page"`). In-app links carry the
  `svelte/no-navigation-without-resolve` disable comment.

### Account page
- **`src/routes/(app)/settings/account/+page.server.ts`** — provides **only** `actions` (no `load`).
  The page reads the user from `data.user`, which SvelteKit merges in from the `(app)` root layout's
  `load` (`locals.user`, set per-request in `hooks.server.ts`). `invalidateAll` after the MFA action
  re-runs that layout load, so `mfa_enabled` refreshes without a page-level fetch. Do **not** add a
  redundant `GET /users/me` here.
  - `actions.disableMfa`: reads `password` + `code` from the form, calls
    `lqFetch(event, '/api/v1/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) })`.
    `204` → success (return `{ success: true }`); `401` → `fail(401, { mfaError: 'That password or code was incorrect.' })`
    (one generic message — backend returns identical for either wrong field); other non-2xx →
    `fail(status, { mfaError: 'Could not disable two-factor. Please try again.' })`.
- **`src/routes/(app)/settings/account/+page.svelte`** —
  - **Profile section:** read-only rows — display name (`user.display_name` || email local-part),
    email, role, member since (`created_at`, formatted), last sign-in (`last_login_at`, formatted or
    "—"). A muted line: "Name and email aren't editable here yet."
  - **Security section:**
    - **Password:** a "Change password" link → `/change-password` (with the resolve-disable comment),
      plus a muted hint that changing it signs you out of other sessions.
    - **Two-factor:** status from `user.mfa_enabled`. **On** → "On" + a "Disable" button that opens
      `MfaDisableModal`. **Off** → "Off" (no enable affordance this slice).
- **`src/lib/settings/MfaDisableModal.svelte`** — a dialog (a11y mirrors `ReceiptsDrawer`: `role="dialog"`,
  `aria-modal`, Escape to close, labelled) with a `use:enhance` form posting `?/disableMfa`
  (`password` + 6-digit `code` inputs). Shows the action's `mfaError` inline on failure; on success the
  parent `invalidateAll` flips the status to Off and the modal closes. Self-contained error `$state`
  reset on open (the skills-modal pattern, to avoid stale-error-on-reopen).

### Sidebar
- **`src/lib/components/Sidebar.svelte`** — add a ⚙ **Settings** link (`Settings` lucide icon) in the
  bottom cluster, immediately above the existing logout `<form>`. Active styling
  (`bg-mlq-subtle text-mlq-strong` + `aria-current="page"`) when `page.url.pathname` starts with
  `/settings`. Reuse the existing nav-link styling; carry the resolve-disable comment.

## Data flow

The profile fields come from the existing `data.user` (no new fetch). The only write is the MFA-disable
form action → `POST /api/v1/auth/mfa/disable` via `lqFetch`, then `invalidateAll`. No new BFF proxy
routes, no backend/contract change.

## Error handling

- MFA disable: `401` → one generic inline error (no field-level leak); other failures → generic retry
  message. Network/throw → the same generic retry message.
- `/change-password` reachability while authenticated is verified during implementation; if blocked, a
  settings-scoped `?/changePassword` form action hitting `POST /api/v1/auth/change-password` is the
  documented fallback (same backend, same revoke-and-relogin behavior).

## Testing (TDD)

Component (`@testing-library/svelte`):
- **`SettingsRail.svelte.test.ts`** — renders the Account link → `/settings/account`; it carries
  `aria-current="page"` when the mocked `$app/state` path is `/settings/account` (mutable-pathname mock,
  the `vi.hoisted` pattern from `Sidebar.svelte.test.ts`).
- **`MfaDisableModal.svelte.test.ts`** — renders password + code inputs and a submit posting `?/disableMfa`;
  shows an error message when given one.
- **Account page** (`settings/account/page.svelte.test.ts`) — profile rows render from `data.user`
  (email, role, formatted dates) + the read-only note; password link → `/change-password`; with
  `mfa_enabled: true` a "Disable" button shows, with `false` it shows "Off" and no Disable button.
- **`Sidebar`** — Settings entry → `/settings`; active on `/settings/account` (extend the existing
  mutable-pathname Sidebar test).

Server (`// @vitest-environment node`, `vi.mock('$lib/server/lqClient', …)`):
- **`settings/account/page.server.test.ts`** — `disableMfa` action: a `204` from `lqFetch` →
  success; `401` → `fail(401, { mfaError })`; other status → generic `mfaError`. (The established
  mock-`lqFetch` + `Request` with `URLSearchParams` body pattern.)

Live e2e (`tests/settings-account.spec.ts`, against the running stack, read-only):
- Log in (admin fixture) → click the sidebar ⚙ Settings → lands on `/settings/account`.
- Assert the profile shows the account email + role, and the "not editable" note.
- Assert "Change password" links to `/change-password`.
- Assert two-factor shows **Off** (dev fixture is MFA-off) and there is **no** Disable button.

## Quality bar

`npm run check` 0 errors / 0 warnings; eslint clean (no `any`); in-app `<a>`/`goto` carry the
`svelte/no-navigation-without-resolve` disable comment; modal a11y mirrors `ReceiptsDrawer`; server
tests `// @vitest-environment node` + mocked `lqFetch`. Established loop: TDD, fresh implementer per
task with two-stage review, commit per task, whole-branch review, PR into `main`.

## Future work (later P7 slices / deferred)

- **Profile editing** — when `PATCH /api/v1/users/me` lands (upstream ask
  `docs/upstream-requests/lq-ai-patch-users-me-profile.md`): swap the read-only name/email rows for an
  edit form; drop the "not editable" note.
- **MFA enable/setup** — a TOTP setup+verify flow (needs the setup endpoints surfaced).
- **Slices 2–4** — Data & privacy, Preferences, Trust each add a rail entry + sub-route.
