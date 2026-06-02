# Profile Edit — Editable Display Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Account page's `display_name` editable via `PATCH /api/v1/users/me`, using an inline edit toggle that pre-fills the rebranded value.

**Architecture:** A new `$lib/settings/EditableDisplayName.svelte` component owns the Name row in read/edit modes and posts to a new `?/updateProfile` action on the account route; on success it calls `invalidateAll()` so the refreshed `data.user` re-renders. Follows the existing `$lib/settings/*` component pattern and the `disableMfa` server-action pattern.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind (`mlq-*` tokens), Vitest + @testing-library/svelte (component + node server tests), Playwright (live e2e).

---

## File Structure

- **Create:** `src/lib/settings/EditableDisplayName.svelte` — the Name row (read + edit modes), the cancel/save logic, `invalidateAll()` on success.
- **Create:** `src/lib/settings/EditableDisplayName.svelte.test.ts` — component tests.
- **Modify:** `src/routes/(app)/settings/account/+page.server.ts` — add the `updateProfile` action.
- **Modify:** `src/routes/(app)/settings/account/page.server.test.ts` — add `updateProfile` tests.
- **Modify:** `src/routes/(app)/settings/account/+page.svelte` — use the component; drop the now-unused `rebrandName` import; update the footer note.
- **Modify:** `src/routes/(app)/settings/account/page.svelte.test.ts` — update the note assertion.
- **Modify:** `tests/settings-account.spec.ts` — update the note assertion; add the edit round-trip e2e.

Reference patterns already in the repo:
- Server action style: the `disableMfa` action in `src/routes/(app)/settings/account/+page.server.ts` (read formData, `lqFetch`, map statuses with `fail`).
- Server test style: the `disableMfa action` describe block in `account/page.server.test.ts` (mocks `lqFetch`, asserts `lqFetch.mock.calls[0]`).
- Component test style: `account/page.svelte.test.ts` (mocks `$app/forms` + `$app/navigation`, uses `fireEvent`).

---

## Task 1: `EditableDisplayName` component (TDD)

**Files:**
- Create: `src/lib/settings/EditableDisplayName.svelte`
- Test: `src/lib/settings/EditableDisplayName.svelte.test.ts`

- [ ] **Step 1: Write the failing component tests**

Create `src/lib/settings/EditableDisplayName.svelte.test.ts` with:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
import EditableDisplayName from './EditableDisplayName.svelte';

const input = () => screen.getByRole('textbox', { name: /display name/i }) as HTMLInputElement;

describe('EditableDisplayName', () => {
  it('read mode: shows the rebranded name and an Edit button, no input', () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    expect(screen.getByText('Jane Counsel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /display name/i })).toBeNull();
  });

  it('rebrands the displayed name (LQ.AI → Donna)', () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    expect(screen.getByText('Donna Admin')).toBeInTheDocument();
  });

  it('Edit reveals an input pre-filled with the rebranded value plus Save and Cancel', async () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(input().value).toBe('Donna Admin');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Save is ENABLED for the rebranded-admin case (rebranded pre-fill differs from raw stored)', async () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Save is DISABLED for a no-op (input equals raw stored) and when cleared', async () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // Pre-fill equals raw stored (no LQ.AI token) → no-op → disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Whitespace only → empty after trim → disabled.
    await fireEvent.input(input(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Real change → enabled.
    await fireEvent.input(input(), { target: { value: 'Jane New' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Cancel returns to read mode', async () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: /display name/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `npx vitest run src/lib/settings/EditableDisplayName.svelte.test.ts`
Expected: FAIL — the component file does not exist yet.

- [ ] **Step 3: Implement the component**

Create `src/lib/settings/EditableDisplayName.svelte` with:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { rebrandName } from '$lib/brand';

  // The raw stored display_name (i.e. user.display_name). May carry the "LQ.AI" brand.
  let { name }: { name: string | null | undefined } = $props();

  let editing = $state(false);
  let nameInput = $state('');
  let msg = $state<string | null>(null);

  const trimmed = $derived(nameInput.trim());
  // Compare against the RAW stored name (not the rebranded pre-fill): saving the rebranded
  // value over an "LQ.AI" name is a real change, while re-saving the true stored value is a no-op.
  const canSave = $derived(trimmed.length > 0 && trimmed.length <= 200 && trimmed !== (name ?? ''));

  function startEdit() {
    nameInput = rebrandName(name);
    msg = null;
    editing = true;
  }

  function cancel() {
    editing = false;
    msg = null;
  }

  const onSubmit: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'success') {
      editing = false;
      msg = 'Name updated.';
      await invalidateAll();
    } else if (result.type === 'failure') {
      msg = (result.data?.profileError as string | undefined) ?? 'Could not update your name.';
    }
  };
</script>

<div class="flex items-start justify-between px-4 py-2">
  <dt class="text-mlq-muted">Name</dt>
  <dd class="m-0 flex flex-col items-end gap-1 text-mlq-text">
    {#if editing}
      <form method="POST" action="?/updateProfile" use:enhance={onSubmit} class="flex items-center gap-2">
        <input
          name="display_name"
          bind:value={nameInput}
          maxlength={200}
          aria-label="Display name"
          class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text"
        />
        <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white disabled:opacity-50">Save</button>
        <button type="button" onclick={cancel} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Cancel</button>
      </form>
    {:else}
      <span class="flex items-center gap-2">
        {rebrandName(name) || '—'}
        <button type="button" onclick={startEdit} class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50">Edit</button>
      </span>
    {/if}
    {#if msg}<p role="status" aria-live="polite" class="text-xs text-mlq-muted">{msg}</p>{/if}
  </dd>
</div>
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `npx vitest run src/lib/settings/EditableDisplayName.svelte.test.ts`
Expected: PASS — all six tests.

- [ ] **Step 5: Verify the project gate is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings" (the vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless). No `any`/`!`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/EditableDisplayName.svelte src/lib/settings/EditableDisplayName.svelte.test.ts
git commit -m "feat(settings): EditableDisplayName component for inline name editing"
```

---

## Task 2: `updateProfile` server action (TDD)

**Files:**
- Modify: `src/routes/(app)/settings/account/+page.server.ts`
- Test: `src/routes/(app)/settings/account/page.server.test.ts`

- [ ] **Step 1: Write the failing server tests**

Append this describe block to `src/routes/(app)/settings/account/page.server.test.ts` (the file already defines `actions`, `formEvent`, the `lqFetch` mock, and `beforeEach(() => lqFetch.mockReset())` — reuse them; do not redeclare):

```ts
describe('updateProfile action', () => {
  it('rejects empty/whitespace display_name without calling the backend', async () => {
    const r = await actions.updateProfile(formEvent({ display_name: '   ' }));
    expect(r).toMatchObject({ status: 400, data: { profileError: expect.stringMatching(/name/i) } });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('PATCHes /users/me with the trimmed name and returns profileSaved on 200', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'u1', display_name: 'New Name' }), { status: 200 }));
    const r = await actions.updateProfile(formEvent({ display_name: '  New Name  ' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ display_name: 'New Name' });
    expect(r).toEqual({ profileSaved: true });
  });

  it('maps backend 422 to an inline validation error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 422 }));
    const r = await actions.updateProfile(formEvent({ display_name: 'x' }));
    expect(r).toMatchObject({ status: 400, data: { profileError: expect.stringMatching(/name/i) } });
  });

  it('maps other (5xx) failures to a generic retry error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.updateProfile(formEvent({ display_name: 'x' }));
    expect(r).toMatchObject({ status: 502, data: { profileError: expect.stringMatching(/could not update/i) } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `npx vitest run "src/routes/(app)/settings/account/page.server.test.ts"`
Expected: FAIL — `actions.updateProfile` is undefined.

- [ ] **Step 3: Implement the action**

In `src/routes/(app)/settings/account/+page.server.ts`, add a comma after the existing `disableMfa` action's closing brace and append this action inside the `actions` object (the file already imports `fail` and `lqFetch`):

```ts
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

For reference, the resulting file should look like:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

// No `load`: the profile comes from `data.user` (merged from the (app) layout).
export const actions: Actions = {
  disableMfa: async (event) => {
    const form = await event.request.formData();
    const password = String(form.get('password') ?? '');
    const code = String(form.get('code') ?? '');
    if (!password || !code) return fail(400, { mfaError: 'Enter your password and a current code.' });

    const res = await lqFetch(event, '/api/v1/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code })
    });
    if (res.status === 204 || res.ok) return { success: true };
    if (res.status === 401) return fail(401, { mfaError: 'That password or code was incorrect.' });
    return fail(502, { mfaError: 'Could not disable two-factor. Please try again.' });
  },

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
};
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `npx vitest run "src/routes/(app)/settings/account/page.server.test.ts"`
Expected: PASS — the existing `disableMfa` tests plus the four new `updateProfile` tests.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/account/+page.server.ts" "src/routes/(app)/settings/account/page.server.test.ts"
git commit -m "feat(settings): updateProfile action — PATCH /users/me display_name"
```

---

## Task 3: Wire the component into the Account page

**Files:**
- Modify: `src/routes/(app)/settings/account/+page.svelte`
- Test: `src/routes/(app)/settings/account/page.svelte.test.ts`

- [ ] **Step 1: Update the existing component test for the new note text**

In `src/routes/(app)/settings/account/page.svelte.test.ts`, the first test asserts the old note. Change this line:

```ts
    expect(screen.getByText(/aren't editable here yet/i)).toBeInTheDocument();
```
to:
```ts
    expect(screen.getByText(/email isn't editable/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run that test to verify it FAILS**

Run: `npx vitest run "src/routes/(app)/settings/account/page.svelte.test.ts"`
Expected: FAIL — the page still renders the old note ("Name and email aren't editable here yet.").

- [ ] **Step 3: Wire the component and update the note**

In `src/routes/(app)/settings/account/+page.svelte`:

(a) Add the import (with the other imports at the top of `<script>`):
```ts
  import EditableDisplayName from '$lib/settings/EditableDisplayName.svelte';
```

(b) Remove the now-unused `rebrandName` import line (it was only used by the Name row, which the component now owns):
```ts
  import { rebrandName } from '$lib/brand';
```

(c) Replace the Name row:
```svelte
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Name</dt><dd class="text-mlq-text">{rebrandName(user?.display_name) || '—'}</dd></div>
```
with:
```svelte
    <EditableDisplayName name={user?.display_name} />
```

(d) Change the footer note:
```svelte
  <p class="px-4 py-2 text-xs text-mlq-muted">Name and email aren't editable here yet.</p>
```
to:
```svelte
  <p class="px-4 py-2 text-xs text-mlq-muted">Your email isn't editable here yet.</p>
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run "src/routes/(app)/settings/account/page.svelte.test.ts"`
Expected: PASS — all existing account page tests (the name now renders via the component; email/role/MFA assertions are unaffected).

- [ ] **Step 5: Verify the gate is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings". In particular, confirm there is no "unused import" warning for `rebrandName` (it must be removed from `+page.svelte`).

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/settings/account/+page.svelte" "src/routes/(app)/settings/account/page.svelte.test.ts"
git commit -m "feat(settings): use EditableDisplayName on the Account page; email-only not-editable note"
```

---

## Task 4: Live e2e — edit round-trip (self-cleaning)

**Files:**
- Modify: `tests/settings-account.spec.ts`

- [ ] **Step 1: Update the note assertion in the existing test**

In `tests/settings-account.spec.ts`, change:
```ts
  await expect(page.getByText(/aren't editable here yet/i)).toBeVisible();
```
to:
```ts
  await expect(page.getByText(/email isn't editable/i)).toBeVisible();
```

- [ ] **Step 2: Add the edit round-trip test**

Append this test to `tests/settings-account.spec.ts` (it reuses the existing `login` helper and `EMAIL`/`PASSWORD` constants at the top of the file):

```ts
test('settings → account: edit display name round-trip (restores fixture)', async ({ page }) => {
  await login(page);
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

  // Capture the current name from the Edit input (this is the rebranded value we restore to).
  await page.getByRole('button', { name: 'Edit' }).click();
  const original = await page.getByRole('textbox', { name: /display name/i }).inputValue();

  try {
    const sentinel = 'Donna Admin E2E';
    await page.getByRole('textbox', { name: /display name/i }).fill(sentinel);
    await page.getByRole('button', { name: 'Save' }).click();
    // Read mode returns with the new name + the announced confirmation.
    await expect(page.getByText(sentinel)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/name updated/i)).toBeVisible();
  } finally {
    // Restore the fixture name so the shared admin is left as found.
    await page.goto('/settings/account');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('textbox', { name: /display name/i }).fill(original);
    const saveBtn = page.getByRole('button', { name: 'Save' });
    if (await saveBtn.isEnabled()) await saveBtn.click();
    await expect(page.getByText(original)).toBeVisible({ timeout: 10_000 });
  }
});
```

- [ ] **Step 3: Rebuild donna-web so the live server serves the new component**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```
Wait for `docker compose ps donna-web` to report healthy.

- [ ] **Step 4: Run the live e2e**

```bash
set -a; . ./.env; set +a
npx playwright test tests/settings-account.spec.ts
```
Expected: PASS — both the existing account test and the new round-trip test. The round-trip restores the admin name in its `finally`. If it FAILS, read the failure and report it — do NOT loosen assertions to force a pass.

- [ ] **Step 5: Commit**

```bash
git add tests/settings-account.spec.ts
git commit -m "test(settings): live e2e for editable display name (round-trip, restores fixture)"
```

---

## Final Verification (run after all tasks)

- [ ] `npm run check` → "0 errors and 0 warnings".
- [ ] `npx vitest run` → full suite green (the new component + server tests added; the rest unaffected).
- [ ] `set -a; . ./.env; set +a; npx playwright test tests/settings-account.spec.ts` → green; admin fixture name restored.
- [ ] Manual sanity: on `/settings/account`, Edit reveals the pre-filled input; Save persists and the displayed name updates; Cancel restores read mode; the note reads "Your email isn't editable here yet."

## Acceptance criteria (from the spec)

- [ ] Name row is inline-editable; Edit pre-fills the rebranded value; Cancel restores read mode.
- [ ] Save disabled for empty/over-200/unchanged; enabled for a real change (including rebranded-admin).
- [ ] Saving PATCHes `/api/v1/users/me`; on success refreshes the name via `invalidateAll()` and announces a confirmation.
- [ ] Server rejects whitespace-only without a backend call; 422 → inline error; other failures → retry error.
- [ ] Footer note reads "Your email isn't editable here yet."
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`).
- [ ] Component + server tests green; full vitest green.
- [ ] Live e2e passes and restores the admin fixture name.
