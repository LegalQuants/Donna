# P7-1 — Settings shell + Account & Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `/settings` area and its first section — a read-only Account profile, a link to change password, and two-factor status with a disable action — plus a ⚙ Settings sidebar entry.

**Architecture:** A `/settings` `+layout.svelte` renders a left section rail (`SettingsRail`) + content slot; `/settings` redirects to `/settings/account`. The Account page reads the already-loaded `data.user` (no new fetch) and posts a `disableMfa` form action through `lqFetch`. No new BFF proxies, no backend/contract change.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind `mlq-*` tokens, Lucide icons, Vitest + @testing-library/svelte, Playwright.

---

## Context the implementer needs

- **Spec:** `docs/superpowers/specs/2026-05-31-p7-1-settings-account-design.md`.
- **The user object** is `components['schemas']['User']` (typed in `src/app.d.ts` as `locals.user`). The `(app)` root layout (`+layout.server.ts`) returns `{ user: locals.user }`, and SvelteKit merges it into every child page's `data`, so `/settings/account` reads `data.user` directly — **no page-level fetch**. Fields available: `id`, `email`, `display_name` (nullable), `is_admin`, `role`, `mfa_enabled`, `must_change_password`, `created_at`, `last_login_at`, + 5 preference fields (not used this slice).
- **`lqFetch(event, path, init?)`** (`src/lib/server/lqClient.ts`) — authed BFF fetch; defaults JSON content-type for non-FormData bodies; refreshes once on 401.
- **MFA disable endpoint:** `POST /api/v1/auth/mfa/disable` with body `{ password, code }` → **204** on success; **401** on wrong password/code (identical response either way — do not leak which).
- **`/change-password`** (route `src/routes/(auth)/change-password/`) has only `actions` (no `load`/guard), so it is reachable while authenticated — link to it directly.
- **Server-test pattern** (from `matters/page.server.test.ts`): `const lqFetch = vi.fn(); vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a) => lqFetch(...a) }));` then a `formEvent` helper building a `Request` with a `URLSearchParams` body; assert `lqFetch.mock.calls[0][1]` (path) and `JSON.parse(calls[0][2].body)`.
- **Mutable-pathname `$app/state` mock** (from `Sidebar.svelte.test.ts`): `const h = vi.hoisted(() => ({ pathname: '/' })); vi.mock('$app/state', () => ({ page: { get url() { return new URL('http://localhost' + h.pathname); } } }));`
- **Conventions:** Svelte 5 runes; no `any`; every in-app `<a>`/`goto` gets `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- <reason> -->`; modal a11y mirrors `ReceiptsDrawer` (`role="dialog"`, `aria-modal`, Escape, backdrop); `mlq-*` tokens; quality bar `npm run check` = `0 ERRORS 0 WARNINGS` (the vendor `ERR_MODULE_NOT_FOUND` stderr line is expected/harmless — success is the `COMPLETED … 0 ERRORS 0 WARNINGS` line). Run unit tests `npx vitest run <file>`; e2e `set -a; . ./.env; set +a; npx playwright test <file>`.

## File structure

- **Create** `src/lib/settings/MfaDisableModal.svelte` + `.svelte.test.ts` — self-contained disable-MFA dialog.
- **Create** `src/routes/(app)/settings/account/+page.svelte` + `+page.server.ts` + `page.svelte.test.ts` + `page.server.test.ts` — the Account section.
- **Create** `src/lib/settings/SettingsRail.svelte` + `.svelte.test.ts` — the section rail.
- **Create** `src/routes/(app)/settings/+layout.svelte` — rail + content slot.
- **Create** `src/routes/(app)/settings/+page.server.ts` — redirect `/settings` → `/settings/account`.
- **Modify** `src/lib/components/Sidebar.svelte` + `Sidebar.svelte.test.ts` — add the ⚙ Settings entry.
- **Create** `tests/settings-account.spec.ts` — live e2e.

---

## Task 1: MfaDisableModal

**Files:**
- Create: `src/lib/settings/MfaDisableModal.svelte`
- Test: `src/lib/settings/MfaDisableModal.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/MfaDisableModal.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import MfaDisableModal from './MfaDisableModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

describe('MfaDisableModal', () => {
  it('renders nothing when closed', () => {
    render(MfaDisableModal, { props: { open: false } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders password + code fields and a Disable submit posting ?/disableMfa', () => {
    const { container } = render(MfaDisableModal, { props: { open: true } });
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(container.querySelector('form')).toHaveAttribute('action', '?/disableMfa');
  });

  it('calls onclose on Cancel', async () => {
    const onclose = vi.fn();
    render(MfaDisableModal, { props: { open: true, onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onclose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/settings/MfaDisableModal.svelte.test.ts`
Expected: FAIL — `./MfaDisableModal.svelte` does not exist.

- [ ] **Step 3: Create `MfaDisableModal.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';

  let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();
  let error = $state<string | null>(null);

  // Reset the error each time the modal opens (self-contained — avoids stale-error-on-reopen).
  $effect(() => { if (open) error = null; });

  const submit: SubmitFunction = () => async ({ result, update }) => {
    if (result.type === 'success') {
      await invalidateAll();
      onclose?.();
    } else if (result.type === 'failure') {
      error = (result.data?.mfaError as string | undefined) ?? 'Could not disable two-factor.';
    } else {
      await update();
    }
  };

  function onkeydown(e: KeyboardEvent) { if (e.key === 'Escape') onclose?.(); }
</script>

{#if open}
  <svelte:window onkeydown={onkeydown} />
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => onclose?.()}></div>
  <div role="dialog" aria-modal="true" aria-label="Disable two-factor authentication"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <h2 class="mb-2 text-sm font-medium text-mlq-text">Disable two-factor authentication</h2>
    <p class="mb-3 text-xs text-mlq-muted">Enter your password and a current authentication code to turn off two-factor.</p>
    <form method="POST" action="?/disableMfa" use:enhance={submit}>
      <label class="block text-xs text-mlq-muted" for="mfa-pw">Password</label>
      <input id="mfa-pw" name="password" type="password" autocomplete="current-password" required
        class="mb-2 mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-workflow" />
      <label class="block text-xs text-mlq-muted" for="mfa-code">Authentication code</label>
      <input id="mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" required
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-workflow" />
      {#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick={() => onclose?.()} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Cancel</button>
        <button type="submit" class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Disable</button>
      </div>
    </form>
  </div>
{/if}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/settings/MfaDisableModal.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Check gate**

Run: `npm run check` → expect `COMPLETED … 0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/MfaDisableModal.svelte src/lib/settings/MfaDisableModal.svelte.test.ts
git commit -m "feat(settings): MfaDisableModal — confirm dialog for disabling two-factor"
```

---

## Task 2: Account page + disableMfa action

**Files:**
- Create: `src/routes/(app)/settings/account/+page.server.ts`
- Create: `src/routes/(app)/settings/account/page.server.test.ts`
- Create: `src/routes/(app)/settings/account/+page.svelte`
- Create: `src/routes/(app)/settings/account/page.svelte.test.ts`

- [ ] **Step 1: Write the failing server test**

Create `src/routes/(app)/settings/account/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions } from './+page.server';

const formEvent = (fields: Record<string, string>) =>
  ({ request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;

beforeEach(() => lqFetch.mockReset());

describe('disableMfa action', () => {
  it('rejects empty fields without calling the backend', async () => {
    const r = await actions.disableMfa(formEvent({ password: '', code: '' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('POSTs password+code and returns success on 204', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await actions.disableMfa(formEvent({ password: 'pw', code: '123456' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/auth/mfa/disable');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ password: 'pw', code: '123456' });
    expect(r).toEqual({ success: true });
  });

  it('maps 401 to a generic inline error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 401 }));
    const r = await actions.disableMfa(formEvent({ password: 'pw', code: '000000' }));
    expect(r).toMatchObject({ status: 401, data: { mfaError: expect.stringMatching(/incorrect/i) } });
  });

  it('maps other failures to a generic retry error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.disableMfa(formEvent({ password: 'pw', code: '123456' }));
    expect(r).toMatchObject({ status: 500, data: { mfaError: expect.stringMatching(/could not disable/i) } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/account/page.server.test.ts"`
Expected: FAIL — `./+page.server` does not exist.

- [ ] **Step 3: Create `+page.server.ts`**

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
    return fail(res.status, { mfaError: 'Could not disable two-factor. Please try again.' });
  }
};
```

- [ ] **Step 4: Run the server test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/account/page.server.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing component test**

Create `src/routes/(app)/settings/account/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'ada@firm.com', display_name: 'Ada Counsel', is_admin: true, role: 'admin',
  mfa_enabled: false, must_change_password: false, reasoning_visibility: 'disclosure',
  featured_tools: 'prominent', workspace_layout: 'three_pane', trust_pills: 'labels',
  provenance_pills: 'always', created_at: '2026-01-05T00:00:00Z', last_login_at: '2026-05-30T00:00:00Z', ...over
});
const props = (over: Record<string, unknown> = {}) => ({ data: { user: user(over) }, form: null }) as never;

describe('/settings/account', () => {
  it('renders read-only profile fields + the not-editable note', () => {
    render(Page, props());
    expect(screen.getByText('ada@firm.com')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText(/aren't editable here yet/i)).toBeInTheDocument();
  });

  it('links Change password to /change-password', () => {
    render(Page, props());
    expect(screen.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/change-password');
  });

  it('shows Off and no Disable button when MFA is disabled', () => {
    render(Page, props({ mfa_enabled: false }));
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it('shows a Disable button when MFA is enabled, and clicking it opens the modal', async () => {
    render(Page, props({ mfa_enabled: true }));
    const btn = screen.getByRole('button', { name: 'Disable' });
    expect(btn).toBeInTheDocument();
    await fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: /disable two-factor/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/account/page.svelte.test.ts"`
Expected: FAIL — `./+page.svelte` does not exist.

- [ ] **Step 7: Create `+page.svelte`**

```svelte
<script lang="ts">
  import MfaDisableModal from '$lib/settings/MfaDisableModal.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const user = $derived(data.user);
  let mfaModalOpen = $state(false);

  const fmtMonthYear = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
  const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
</script>

<svelte:head><title>Account — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Account</h1>

<section class="rounded-mlq-control border border-mlq-subtle">
  <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Profile</h2>
  <dl class="divide-y divide-mlq-subtle text-sm">
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Name</dt><dd class="text-mlq-text">{user?.display_name || '—'}</dd></div>
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Email</dt><dd class="text-mlq-text">{user?.email}</dd></div>
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Role</dt><dd class="capitalize text-mlq-text">{user?.role}</dd></div>
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Member since</dt><dd class="text-mlq-text">{fmtMonthYear(user?.created_at)}</dd></div>
    <div class="flex justify-between px-4 py-2"><dt class="text-mlq-muted">Last sign-in</dt><dd class="text-mlq-text">{fmtDate(user?.last_login_at)}</dd></div>
  </dl>
  <p class="px-4 py-2 text-xs text-mlq-muted">Name and email aren't editable here yet.</p>
</section>

<section class="mt-6 rounded-mlq-control border border-mlq-subtle">
  <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Security</h2>
  <div class="flex items-center justify-between px-4 py-3 text-sm">
    <div>
      <div class="text-mlq-text">Password</div>
      <div class="text-xs text-mlq-muted">Changing your password signs you out of other sessions.</div>
    </div>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app change-password link -->
    <a href="/change-password" class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Change</a>
  </div>
  <div class="flex items-center justify-between border-t border-mlq-subtle px-4 py-3 text-sm">
    <div>
      <div class="text-mlq-text">Two-factor authentication</div>
      <div class="text-xs text-mlq-muted">{user?.mfa_enabled ? 'On' : 'Off'}</div>
    </div>
    {#if user?.mfa_enabled}
      <button type="button" onclick={() => (mfaModalOpen = true)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Disable</button>
    {/if}
  </div>
</section>

<MfaDisableModal open={mfaModalOpen} onclose={() => (mfaModalOpen = false)} />
```

- [ ] **Step 8: Run the component test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/account/page.svelte.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 9: Check gate**

Run: `npm run check` → expect `COMPLETED … 0 ERRORS 0 WARNINGS`.

- [ ] **Step 10: Commit**

```bash
git add "src/routes/(app)/settings/account/+page.server.ts" "src/routes/(app)/settings/account/page.server.test.ts" "src/routes/(app)/settings/account/+page.svelte" "src/routes/(app)/settings/account/page.svelte.test.ts"
git commit -m "feat(settings): Account page — read-only profile, password link, MFA status + disable"
```

---

## Task 3: Settings shell (rail + layout + redirect)

**Files:**
- Create: `src/lib/settings/SettingsRail.svelte` + `src/lib/settings/SettingsRail.svelte.test.ts`
- Create: `src/routes/(app)/settings/+layout.svelte`
- Create: `src/routes/(app)/settings/+page.server.ts`

- [ ] **Step 1: Write the failing rail test**

Create `src/lib/settings/SettingsRail.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ pathname: '/settings/account' }));
vi.mock('$app/state', () => ({ page: { get url() { return new URL('http://localhost' + h.pathname); } } }));

import SettingsRail from './SettingsRail.svelte';

describe('SettingsRail', () => {
  it('renders the Account section link', () => {
    h.pathname = '/settings/account';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/settings/account');
  });

  it('marks Account active on /settings/account', () => {
    h.pathname = '/settings/account';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: FAIL — `./SettingsRail.svelte` does not exist.

- [ ] **Step 3: Create `SettingsRail.svelte`**

```svelte
<script lang="ts">
  import { page } from '$app/state';

  // Built sections only (no dead UI); later P7 slices add their entry.
  const sections: { href: string; label: string }[] = [
    { href: '/settings/account', label: 'Account' }
  ];
  const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<nav aria-label="Settings sections" class="flex flex-row gap-1 sm:w-44 sm:flex-col">
  {#each sections as s (s.href)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settings section link -->
    <a href={s.href}
       aria-current={isActive(s.href) ? 'page' : undefined}
       class="rounded-mlq-control px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow
              {isActive(s.href) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">
      {s.label}
    </a>
  {/each}
</nav>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the layout `src/routes/(app)/settings/+layout.svelte`**

```svelte
<script lang="ts">
  import SettingsRail from '$lib/settings/SettingsRail.svelte';
  let { children } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:flex-row">
  <SettingsRail />
  <div class="min-w-0 flex-1">{@render children()}</div>
</div>
```

- [ ] **Step 6: Create the redirect `src/routes/(app)/settings/+page.server.ts`**

```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  throw redirect(307, '/settings/account');
};
```

- [ ] **Step 7: Check gate + targeted run**

Run: `npm run check` → expect `COMPLETED … 0 ERRORS 0 WARNINGS`.
Run: `npx vitest run src/lib/settings/` → expect all settings unit tests green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/settings/SettingsRail.svelte src/lib/settings/SettingsRail.svelte.test.ts "src/routes/(app)/settings/+layout.svelte" "src/routes/(app)/settings/+page.server.ts"
git commit -m "feat(settings): /settings shell — section rail, layout, redirect to account"
```

---

## Task 4: Sidebar ⚙ Settings entry

**Files:**
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/Sidebar.svelte.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/lib/components/Sidebar.svelte.test.ts` (which already has the `vi.hoisted` `h.pathname` mock + `import Sidebar`), add inside the `describe('Sidebar', …)` block:

```ts
  it('has a Settings entry pointing at /settings, active on /settings/*', () => {
    h.pathname = '/settings/account';
    render(Sidebar, { props: { displayName: 'Admin' } });
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: the new test FAILS (no Settings link yet); existing tests still pass.

- [ ] **Step 3: Edit `Sidebar.svelte`**

(a) Add `Settings` to the Lucide import (line 2):
```ts
  import { MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut, Settings } from '@lucide/svelte';
```

(b) Replace the bottom logout `<form>` block (the `<form method="POST" action="/logout" class="border-t border-mlq-subtle p-2">…</form>`) with a bottom cluster that adds the Settings link above the logout form:
```svelte
  <div class="space-y-1 border-t border-mlq-subtle p-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settings link -->
    <a href="/settings"
       aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
       class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
              {page.url.pathname.startsWith('/settings') ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
      <Settings size={18} />
      {#if open}<span>Settings</span>{/if}
    </a>
    <form method="POST" action="/logout">
      <button type="submit"
              class="flex w-full items-center gap-3 rounded-mlq-control px-3 py-2 text-sm text-mlq-text hover:bg-mlq-subtle">
        <LogOut size={18} />
        {#if open}<span>{displayName} · Sign out</span>{/if}
      </button>
    </form>
  </div>
```

- [ ] **Step 4: Run the Sidebar test to verify it passes**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: PASS (existing tests + the new Settings test).

- [ ] **Step 5: Check gate + full unit suite**

Run: `npm run check` → expect `COMPLETED … 0 ERRORS 0 WARNINGS`.
Run: `npx vitest run` → expect all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/lib/components/Sidebar.svelte.test.ts
git commit -m "feat(settings): add the Settings entry to the sidebar account cluster"
```

---

## Task 5: Live e2e

**Files:**
- Create: `tests/settings-account.spec.ts`

- [ ] **Step 1: Write the e2e**

Create `tests/settings-account.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('settings → account: profile, password link, MFA status (dev fixture is MFA-off)', async ({ page }) => {
  await login(page);

  // Sidebar Settings entry → redirects to the Account section.
  await page.locator('aside a[href="/settings"]').click();
  await page.waitForURL('**/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

  // Profile shows the account email + the read-only note.
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByText(/aren't editable here yet/i)).toBeVisible();

  // Change-password links to the existing flow.
  await expect(page.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/change-password');

  // Two-factor is Off for the dev admin fixture → no Disable button.
  await expect(page.getByText('Off')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable' })).toHaveCount(0);
});
```

- [ ] **Step 2: Rebuild donna-web (serves built code, not live src/) and run**

Run: `docker compose up -d --build donna-web` and wait; confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:13002/` → `303` or `200`.
Run: `set -a; . ./.env; set +a; npx playwright test tests/settings-account.spec.ts`
Expected: `1 passed`. If the admin fixture happens to have MFA enabled, the last two assertions would flip — in that case report it (don't weaken); otherwise it's Off.

- [ ] **Step 3: Commit**

```bash
git add tests/settings-account.spec.ts
git commit -m "test(settings): live e2e for the Account section (profile, password link, MFA status)"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` → `0 ERRORS 0 WARNINGS`.
- [ ] `npx vitest run` → all green (MfaDisableModal, account page+server, SettingsRail, Sidebar).
- [ ] `set -a; . ./.env; set +a; npx playwright test tests/settings-account.spec.ts` → `1 passed`.
- [ ] Manual smoke at http://localhost:13002: ⚙ Settings → `/settings/account`; profile read-only; Change → `/change-password`; MFA status shows.
- [ ] Whole-branch review (opus), then `superpowers:finishing-a-development-branch` → PR into `main`.

## Notes / non-goals (do not implement)

- No profile editing (backend-blocked), no MFA enable/setup, no data export, no account deletion, no preferences, no Trust page — those are later P7 slices.
- The rail shows only built sections (just Account this slice); do not add greyed placeholders.
- Do not add a `load` to `settings/account/+page.server.ts` — the profile comes from `data.user` via the `(app)` layout.
