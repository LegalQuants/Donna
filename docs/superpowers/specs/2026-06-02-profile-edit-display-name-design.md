# Profile editing (P1.3) — editable display name

**Date:** 2026-06-02 · **Branch:** `feat/profile-edit-display-name` · **Pin:** `vendor/lq-ai` @ `945ad31`

## Why

The P7-1 Account page shows `display_name` read-only with a "Name and email aren't editable
here yet." note, because there was no self-service profile edit endpoint. The `945ad31` pin
(P1.3) added `PATCH /api/v1/users/me` taking `UserProfileUpdate` (`{ display_name? }`):
trimmed server-side, must be non-empty after trimming, length-capped at 200 chars, returns the
updated `User` (200) or a validation error (422). This slice flips the Name field to editable.

This also retires the `rebrandName()` workaround in practice: once a user saves a real
`display_name`, the `LQ.AI → Donna` display transform becomes a no-op for them.

## Decisions (settled in brainstorming)

- **Edit affordance:** inline edit toggle on the Name row (read mode shows name + "Edit"; click
  swaps the row for an input + Save/Cancel). Not an always-editable field.
- **Editor pre-fill:** the **rebranded** value (what the user sees). Saving the unchanged
  pre-fill persists the rebranded name, making the transform permanently a no-op — no
  display/editor mismatch.
- **Live e2e mutates the shared admin fixture** (name only), captured up front and restored in a
  `finally`. Benign and reversible, so a real PATCH round-trip is verified against the backend.

## Scope & file structure

Following the codebase pattern — settings sub-features are components under `src/lib/settings/`
(`DataExportCard.svelte`, `DeleteAccountModal.svelte`, `MfaDisableModal.svelte`).

- **Create:** `src/lib/settings/EditableDisplayName.svelte` — owns the Name row in both modes.
- **Modify:** `src/routes/(app)/settings/account/+page.svelte` — use the new component; update the note.
- **Modify:** `src/routes/(app)/settings/account/+page.server.ts` — add the `updateProfile` action.
- **Create:** `src/lib/settings/EditableDisplayName.svelte.test.ts` — component tests.
- **Modify:** `src/routes/(app)/settings/account/page.server.test.ts` — add `updateProfile` tests.
- **Modify:** `src/routes/(app)/settings/account/page.svelte.test.ts` — update the note assertion.
- **Modify:** `tests/settings-account.spec.ts` — update the note assertion + add the edit round-trip.

## Component: `EditableDisplayName.svelte`

**Prop:** `name: string | null | undefined` — the raw stored `display_name` (i.e. `user.display_name`).

**State:** `editing` (boolean), `nameInput` (string), `msg` (string|null for inline feedback).

**Derived:** `canSave` = `nameInput.trim()` has length 1–200 **and** `nameInput.trim() !== (name ?? '')`.
Comparing the trimmed input against the **raw** stored `name` (not the rebranded pre-fill) is what
lets the admin persist `LQ.AI Admin → Donna Admin` while disabling Save on a true no-op.

**Read mode:** the Name row renders `{rebrandName(name) || '—'}` and an **Edit** button.
Clicking Edit sets `editing = true`, `nameInput = rebrandName(name)`, clears `msg`.

**Edit mode:** `<form method="POST" action="?/updateProfile" use:enhance={onSubmit}>` containing:

- `<input name="display_name" maxlength={200} bind:value={nameInput}>`
- **Save** (`type="submit"`, disabled unless `canSave`)
- **Cancel** (`type="button"` → `editing = false`, clears `msg`)

`onSubmit` enhance callback:

- `result.type === 'success'`: `msg = 'Name updated.'`, `editing = false`, `await invalidateAll()`.
  (The read-mode re-render with the new name is the primary confirmation; the message is a brief
  extra.) Render `msg` in a `<p role="status" aria-live="polite">` so it is announced.
- `result.type === 'failure'`: `msg = result.data?.profileError ?? 'Could not update your name.'`,
  stay in edit mode.

`rebrandName` is imported from `$lib/brand`; `invalidateAll` from `$app/navigation`; `enhance`
from `$app/forms`; `SubmitFunction` type from `@sveltejs/kit`.

The form posts to `?/updateProfile`, which SvelteKit resolves relative to the current page
(`/settings/account`), so the action can live in the account route's `+page.server.ts` even though
the form markup is in a `$lib` component.

## Server action: `updateProfile` (account `+page.server.ts`)

Mirrors the existing `disableMfa` action style (read formData, `lqFetch`, map statuses):

```
updateProfile: async (event) => {
  const form = await event.request.formData();
  const display_name = String(form.get('display_name') ?? '').trim();
  if (!display_name) return fail(400, { profileError: 'Enter a name (1–200 characters).' });

  const res = await lqFetch(event, '/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ display_name })
  });
  if (res.ok) return { profileSaved: true };
  if (res.status === 422) return fail(400, { profileError: 'Enter a name (1–200 characters).' });
  return fail(502, { profileError: 'Could not update your name. Please try again.' });
}
```

(Server trims before the empty check so a whitespace-only submit is rejected without a backend
call. The backend re-validates and length-caps; the client also caps via `maxlength`.)

## Data flow

The Account page already receives `data.user` from the `(app)` layout (`locals.user`); no `load`
is added. Edit → submit → server PATCH → success → `invalidateAll()` re-runs the layout load →
`data.user.display_name` updates → `EditableDisplayName` re-renders read mode with the new value.

## Account page changes

- Replace the Name `<div class="flex justify-between px-4 py-2">…</div>` row inside the Profile
  `<dl>` with `<EditableDisplayName name={user?.display_name} />`. The component renders the same
  row shape (label + value) so the surrounding `<dl>`/divider styling is preserved.
- Change the footer note text from `Name and email aren't editable here yet.` to
  `Your email isn't editable here yet.`

## Error handling

- Client: Save disabled for empty / >200 / unchanged; `maxlength` caps input.
- Server: whitespace-only rejected without a backend call (400); backend 422 → inline 400 error;
  any other non-OK → 502 retry message.
- Network/enhance failure surfaces the inline `profileError`; the user stays in edit mode.

## Testing

### Component — `src/lib/settings/EditableDisplayName.svelte.test.ts`

Mock `$app/forms` (`enhance`) and `$app/navigation` (`invalidateAll`). Cases:

- Read mode: renders the rebranded name and an "Edit" button; no input.
- Click Edit: shows an input pre-filled with the rebranded value, plus Save and Cancel.
- Save disabled when the input is cleared (empty) and when it equals the raw stored name
  (no-op); enabled after a real change.
- For a raw name containing `LQ.AI`: the input pre-fills with the rebranded value and Save is
  **enabled** (because rebranded ≠ raw stored), proving the admin can persist the rebrand.
- Cancel returns to read mode (input gone, Edit button back).

### Server — `src/routes/(app)/settings/account/page.server.test.ts`

Add an `updateProfile action` describe block (mirror the `disableMfa` mock setup):

- Empty/whitespace `display_name` → `{ status: 400 }`, `lqFetch` not called.
- 200 → PATCHes `/api/v1/users/me` with body `{ display_name: '<trimmed>' }` (method PATCH) and
  returns `{ profileSaved: true }`.
- Backend 422 → `{ status: 400, data: { profileError: /name/i } }`.
- Backend 500 → `{ status: 502, data: { profileError: /could not update/i } }`.

### Existing tests updated

- `account/page.svelte.test.ts`: the "renders read-only profile fields + the not-editable note"
  test asserts `/aren't editable here yet/i` → change to `/email isn't editable/i`. (The name still
  renders via the component, so the email/role assertions stand.)
- `tests/settings-account.spec.ts`: the `/aren't editable here yet/i` assertion → `/email isn't
editable/i`.

### Live e2e — `tests/settings-account.spec.ts` (round-trip, self-cleaning)

In the existing account test (or a new one in the same file), after the read-only checks:

1. Capture the current name (read the Edit input's value after clicking Edit, or the read-mode text).
2. Click Edit, set the input to a sentinel (e.g. `Donna Admin E2E`), click Save.
3. Assert read mode shows the sentinel and the "Name updated." status appears.
4. In a `finally`, restore the captured original value (Edit → set → Save) so the shared admin
   fixture is left as found.

Rebuild `donna-web` before the live run (`docker compose up -d --build donna-web`) so the built
server serves the new component.

## Acceptance criteria

- [ ] Account page Name row is inline-editable; Edit reveals an input pre-filled with the
      rebranded value + Save/Cancel; Cancel restores read mode.
- [ ] Save is disabled for empty/over-200/unchanged input; enabled for a real change (including
      the rebranded-admin case).
- [ ] Saving PATCHes `/api/v1/users/me` and, on success, refreshes the displayed name via
      `invalidateAll()` and shows an announced confirmation.
- [ ] Server action rejects whitespace-only without a backend call; maps 422 → inline error and
      other failures → retry error.
- [ ] Footer note reads "Your email isn't editable here yet."
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`).
- [ ] Component + server tests green; `npx vitest run` full suite green.
- [ ] Live e2e passes and restores the admin fixture name in `finally`.

## Follow-up bookkeeping (after merge)

- Mark **P1.3** consumed / the editable-profile note retired in the upstream relay doc if it still
  references the read-only workaround (the ask itself is already in _Already landed_).
