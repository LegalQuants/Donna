# P7-2 follow-up — conditional "Pending deletion" banner

**Date:** 2026-06-01 · **Branch:** `feat/pending-deletion-banner` · **Pin:** `vendor/lq-ai` @ `945ad31`

## Why

P7-2 shipped `/settings/data` with an **always-visible** "Cancel scheduled deletion" link
because the frontend had no way to know whether a deletion was actually pending. The
`945ad31` pin (P1.4) added a nullable `deletion_scheduled_at` to the `User` object served by
`GET /users/me`, which reaches the page as `data.user.deletion_scheduled_at` via
`(app)/+layout.server.ts` → `locals.user`. We can now replace the always-on link with a
conditional banner — the clean version P7-2 deferred (decision "c").

## Scope

One component changes: `src/routes/(app)/settings/data/+page.svelte` (plus its two test files).
No backend changes. No change to the delete modal or the in-session post-delete screen.

## Render states (three, mutually exclusive)

The page gains `let { data } = $props()` and reads `data?.user?.deletion_scheduled_at`
(optional chaining throughout, so the component renders safely with no `data` prop in tests).

1. **Just deleted in this session** — local `scheduled` state (set by `onDeleted` from the
   delete modal) is non-null → existing "Account scheduled for deletion / Return to sign in"
   screen. **Unchanged.** Checked first; the session is being torn down so the server field is
   moot here.

2. **Pending deletion from server** — `data.user.deletion_scheduled_at` is non-null and no
   in-session delete happened → **NEW banner**:

   > **Pending deletion** — scheduled for `<date>`; cancel to keep your account.

   Rendered with the cancel control beside/under it. The **danger-zone Delete button is
   hidden** in this state. `DataExportCard` **stays visible** — a user may still want to export
   their data while a deletion is pending.

3. **Normal** — field is null/absent → `DataExportCard` + danger-zone Delete button & modal.
   The always-on **"Cancel scheduled deletion" link is removed.**

Precedence: state 1 (local `scheduled`) > state 2 (server field) > state 3.

## Cancel behavior

Reuse the existing `?/cancelDeletion` action (`src/routes/(app)/settings/data/+page.server.ts`,
returns success / `fail(400)` / `fail(502)`). In the `use:enhance` callback:

- On `result.type === 'success'`: call `invalidateAll()` so the `(app)` layout load re-runs,
  `data.user.deletion_scheduled_at` refreshes to null, and the page falls through to the Normal
  state (banner disappears).
- On `result.type === 'failure'`: keep the existing message handling
  (`cancelMessage` / `cancelError`).

`invalidateAll` is imported from `$app/navigation` (alongside the existing `goto`).

## Date formatting

Reuse the existing `fmtDate` helper on the `deletion_scheduled_at` ISO string. The server field
carries no `grace_period_days`, so the banner copy omits the grace-days sentence that the
in-session screen (state 1) shows. This matches the agreed copy.

## Testing

Approach: **component test for the banner-visible state (mocked `data.user`) + reworked live
e2e for the not-pending state.** No real deletion is ever POSTed — scheduling a real deletion on
the admin fixture revokes its sessions (banked safety lesson).

### Component test — `src/routes/(app)/settings/data/page.svelte.test.ts`

- **New case — pending state:** `render(Page, { props: { data: { user: { deletion_scheduled_at:
  '<iso>' } } } })` → asserts the banner text (`/pending deletion/i`) and the cancel control are
  present, and the "Delete my account" button is **absent**.
- **Update existing case — not-pending state:** render with no `data` (or `data.user.
  deletion_scheduled_at: null`) → assert heading, export button, and "Delete my account" button
  are present, and **no** cancel control is present (the old assertion that a "cancel scheduled
  deletion" control is always present is removed).
- Existing "opens the delete modal" case stays (renders in the not-pending state).

### Live e2e — `tests/data-privacy.spec.ts`

- Keep: login → reach page via rail → export end-to-end → delete-modal gate-then-cancel-out
  (never submit).
- **Replace** the cancel-nothing-pending step (which clicked an always-on link that no longer
  exists) with **not-pending assertions**: the pending-deletion banner is **absent**, the cancel
  control is **absent**, and the "Delete my account" button is **present**. The admin fixture has
  no pending deletion, so this is the not-pending state — safe, no deletion POSTed.

## Acceptance criteria

- [ ] On `/settings/data`, when `data.user.deletion_scheduled_at` is non-null: the banner shows
      with the formatted date and a cancel control; the Delete button is hidden.
- [ ] When `deletion_scheduled_at` is null/absent: the Delete button + modal show; no banner; no
      always-on cancel control.
- [ ] Cancelling a pending deletion calls `invalidateAll()`; on success the banner clears.
- [ ] The in-session post-delete "Return to sign in" screen is unchanged.
- [ ] `npm run check` → 0 errors / 0 warnings; eslint clean (no `any`/`!`).
- [ ] Component tests cover both pending and not-pending states; `npx vitest run` green.
- [ ] Live e2e passes and POSTs no real deletion.

## Out of scope

- Backend changes (pin already at `945ad31`).
- The delete confirmation modal and the in-session post-delete screen.
- The remaining roadmap items (profile editing, skill-input form, chat file-attach, P6).

## Follow-up bookkeeping (after merge)

- Mark **P1.4 landed** in `docs/upstream-requests/lq-ai-backend-asks-for-donna.md` (move to
  *Already landed*); note `lq-ai-expose-deletion-status-on-users-me.md` is resolved.
