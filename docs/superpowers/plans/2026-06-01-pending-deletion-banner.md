# Pending Deletion Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-visible "Cancel scheduled deletion" link on `/settings/data` with a conditional "Pending deletion" banner driven by the new `data.user.deletion_scheduled_at` field.

**Architecture:** One Svelte 5 (runes) page component gains a `data` prop and renders one of three mutually-exclusive states — in-session-just-deleted (unchanged), server-pending-deletion (new banner + cancel), normal (export + delete button). Cancel reuses the existing `?/cancelDeletion` server action and calls `invalidateAll()` on success so the banner clears.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind (`mlq-*` design tokens), Vitest + @testing-library/svelte (component tests), Playwright (live e2e).

---

## File Structure

- **Modify:** `src/routes/(app)/settings/data/+page.svelte` — add `data` prop, three-state render, `invalidateAll()` on cancel success, remove always-on cancel link.
- **Modify:** `src/routes/(app)/settings/data/page.svelte.test.ts` — pass `data` props; cover not-pending + pending states.
- **Modify:** `tests/data-privacy.spec.ts` — replace the cancel-nothing-pending step with not-pending assertions.
- **Modify:** `docs/upstream-requests/lq-ai-backend-asks-for-donna.md` — mark P1.4 landed.
- **Unchanged:** `+page.server.ts` (the `cancelDeletion` action already exists), `DeleteAccountModal.svelte`, `DataExportCard.svelte`, `dataPrivacy.ts`.

Reference shape (already in the codebase) — the sibling Account page consumes `user` the same way this plan does:

```svelte
import type {PageProps} from './$types'; let {data}: PageProps = $props(); const user =
$derived(data.user);
```

---

## Task 1: Conditional banner on the data page (component + tests)

**Files:**

- Modify: `src/routes/(app)/settings/data/+page.svelte`
- Test: `src/routes/(app)/settings/data/page.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/routes/(app)/settings/data/page.svelte.test.ts` with:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
import Page from './+page.svelte';

// Only `deletion_scheduled_at` is read by the page; cast to `never` like the Account test.
const props = (deletion_scheduled_at: string | null = null) =>
	({ data: { user: { deletion_scheduled_at } }, form: null }) as never;

describe('/settings/data page', () => {
	it('not-pending: renders heading, export card, delete button, and no banner or cancel control', () => {
		render(Page, props(null));
		expect(screen.getByRole('heading', { level: 1, name: /data & privacy/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
		expect(screen.queryByText(/pending deletion/i)).toBeNull();
		expect(screen.queryByRole('button', { name: /cancel scheduled deletion/i })).toBeNull();
	});

	it('opens the delete modal when Delete my account is clicked', async () => {
		const { getByRole } = render(Page, props(null));
		await getByRole('button', { name: /delete my account/i }).click();
		expect(screen.getByRole('dialog', { name: /delete your account/i })).toBeInTheDocument();
	});

	it('pending: shows the banner with the scheduled date and a cancel control, and hides delete', () => {
		const iso = '2026-07-01T12:00:00Z';
		// Compute the expected string the same way the component does, so the assertion is timezone-agnostic.
		const expectedDate = new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		render(Page, props(iso));
		expect(screen.getByText(/pending deletion/i)).toBeInTheDocument();
		expect(screen.getByText(expectedDate)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /cancel scheduled deletion/i })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /delete my account/i })).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/routes/\(app\)/settings/data/page.svelte.test.ts`
Expected: FAIL — the old component takes no `data` prop and has no "Pending deletion" branch (the pending test fails; the not-pending test fails on the still-present always-on cancel control).

- [ ] **Step 3: Implement the component changes**

Replace the entire contents of `src/routes/(app)/settings/data/+page.svelte` with:

```svelte
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';
	import DataExportCard from '$lib/settings/DataExportCard.svelte';
	import DeleteAccountModal from '$lib/settings/DeleteAccountModal.svelte';
	import type { DeletionSchedule } from '$lib/settings/dataPrivacy';

	let { data }: PageProps = $props();

	let deleteOpen = $state(false);
	let scheduled = $state<DeletionSchedule | null>(null);
	let cancelMsg = $state<string | null>(null);

	// Server truth (P1.4, GET /users/me): non-null while a deletion is pending, else null.
	const pendingDeletionAt = $derived(data.user?.deletion_scheduled_at ?? null);

	const fmtDate = (s: string) =>
		new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	const cancelSubmit: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type === 'success') {
				cancelMsg = 'Scheduled deletion cancelled.';
				// Refresh data.user so the banner clears and the page falls back to the normal state.
				await invalidateAll();
			} else if (result.type === 'failure')
				cancelMsg =
					(result.data?.cancelMessage as string | undefined) ??
					(result.data?.cancelError as string | undefined) ??
					'Could not cancel.';
		};

	function onDeleted(info: DeletionSchedule) {
		deleteOpen = false;
		scheduled = info;
	}

	function returnToLogin() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- post-delete sign-out
		goto('/login');
	}
</script>

<svelte:head><title>Data & privacy — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Data & privacy</h1>

{#if scheduled}
	<section class="rounded-mlq-control border border-mlq-subtle p-4 text-sm">
		<h2 class="text-mlq-text">Account scheduled for deletion</h2>
		<p class="mt-1 text-mlq-muted">
			Your account is scheduled for permanent deletion on <strong
				>{fmtDate(scheduled.scheduled_deletion_at)}</strong
			>. You can cancel by signing back in within {scheduled.grace_period_days} days.
		</p>
		<button
			type="button"
			onclick={returnToLogin}
			class="mt-4 rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
			>Return to sign in</button
		>
	</section>
{:else if pendingDeletionAt}
	<DataExportCard />

	<section class="mt-6 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 p-4 text-sm">
		<h2 class="font-medium text-mlq-error">Pending deletion</h2>
		<p class="mt-1 text-mlq-muted">
			Scheduled for <strong>{fmtDate(pendingDeletionAt)}</strong>; cancel to keep your account.
		</p>
		<form method="POST" action="?/cancelDeletion" use:enhance={cancelSubmit} class="mt-3">
			<button type="submit" class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
				>Cancel scheduled deletion</button
			>
		</form>
		{#if cancelMsg}<p class="mt-2 text-mlq-text">{cancelMsg}</p>{/if}
	</section>
{:else}
	<DataExportCard />

	<section class="mt-6 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5">
		<h2
			class="border-b border-mlq-error/30 px-4 py-2 text-xs font-medium tracking-wide text-mlq-error uppercase"
		>
			Danger zone
		</h2>
		<div class="px-4 py-3 text-sm">
			<div class="text-mlq-text">Delete account</div>
			<p class="mt-0.5 mb-3 text-xs text-mlq-muted">
				Schedules your account for permanent deletion after a grace period. You'll be signed out on
				all devices.
			</p>
			<button
				type="button"
				onclick={() => (deleteOpen = true)}
				class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white"
				>Delete my account</button
			>
		</div>
	</section>

	<DeleteAccountModal
		open={deleteOpen}
		onclose={() => (deleteOpen = false)}
		ondeleted={onDeleted}
	/>
{/if}
```

Notes for the implementer:

- The in-session `scheduled` branch is **unchanged** from the original; it is checked first so the post-delete "Return to sign in" screen still wins while the session is being torn down.
- The new `{:else if pendingDeletionAt}` branch hides the Delete button entirely; export stays available.
- The normal `{:else}` branch no longer contains the always-on "Already scheduled a deletion?" cancel form.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/routes/\(app\)/settings/data/page.svelte.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Verify the project gate is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings" (a vendor `ERR_MODULE_NOT_FOUND` line on stderr is harmless). No `any`/`!` introduced.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/settings/data/+page.svelte" "src/routes/(app)/settings/data/page.svelte.test.ts"
git commit -m "feat(settings): conditional pending-deletion banner on /settings/data"
```

---

## Task 2: Rework the live e2e for the not-pending state

**Files:**

- Modify: `tests/data-privacy.spec.ts`

- [ ] **Step 1: Replace the cancel-nothing-pending block with not-pending assertions**

In `tests/data-privacy.spec.ts`, find this block (the last step of the test):

```ts
// --- Cancel-with-nothing-pending (safe; admin fixture has no pending deletion) ---
await page.getByRole('button', { name: /cancel scheduled deletion/i }).click();
await expect(page.getByText(/no scheduled deletion to cancel/i)).toBeVisible({ timeout: 15_000 });
```

Replace it with:

```ts
// --- Not-pending state (admin fixture has no pending deletion; never POST a real deletion) ---
// The banner and its cancel control only exist when data.user.deletion_scheduled_at is non-null.
await expect(page.getByText(/pending deletion/i)).toHaveCount(0);
await expect(page.getByRole('button', { name: /cancel scheduled deletion/i })).toHaveCount(0);
await expect(page.getByRole('button', { name: /delete my account/i })).toBeVisible();
```

Also update the test title on the `test(...)` line from:

```ts
test('Data & privacy — export end-to-end, delete-confirm UI (no submit), cancel-nothing-pending', async ({ page }) => {
```

to:

```ts
test('Data & privacy — export end-to-end, delete-confirm UI (no submit), not-pending state', async ({ page }) => {
```

- [ ] **Step 2: Rebuild donna-web so the live server serves the updated component**

The running `donna-web` container serves _built_ code, so `src/` changes must be rebuilt before a live e2e.

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` rebuilds and reports healthy.

- [ ] **Step 3: Run the live e2e**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test tests/data-privacy.spec.ts
```

Expected: PASS — export completes, delete modal gates then cancels out, not-pending assertions hold. No real deletion is POSTed.

- [ ] **Step 4: Commit**

```bash
git add tests/data-privacy.spec.ts
git commit -m "test(settings): cover not-pending data page state; drop unsafe cancel-nothing-pending step"
```

---

## Task 3: Mark the P1.4 upstream ask as landed

**Files:**

- Modify: `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`

- [ ] **Step 1: Update the header status line**

In `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`, change the metadata line:

```
**From:** Donna frontend session · **To:** the LQ_AI backend session · **Date:** 2026-05-31 (status updated 2026-06-01) · **Pin Donna is on:** `badf83d` (v0.4.0)
```

to:

```
**From:** Donna frontend session · **To:** the LQ_AI backend session · **Date:** 2026-05-31 (status updated 2026-06-01) · **Pin Donna is on:** `945ad31`
```

Then change the status paragraph:

```
**Status (2026-06-01): P1.1, P1.2, and P1.3 all landed** and Donna is pinned at `badf83d` (v0.4.0) —
see *Already landed* below. **Only P1.4 remains open.** The P1.1–P1.3 sections are kept below for
reference. (The bigger "autonomous workflows" item is **not** here — Donna tracks it in its own future
roadmap: `/Users/kevinkeller/Code/Donna/docs/roadmap/donna-future-roadmap.md`. You're building that
backend; the consumer-side requirements Donna will need are captured there for later.)
```

to:

```
**Status (2026-06-01): P1.1–P1.4 all landed** and Donna is pinned at `945ad31` —
see *Already landed* below. **No open asks remain.** The P1.1–P1.4 sections are kept below for
reference. (The bigger "autonomous workflows" item is **not** here — Donna tracks it in its own future
roadmap: `/Users/kevinkeller/Code/Donna/docs/roadmap/donna-future-roadmap.md`. You're building that
backend; the consumer-side requirements Donna will need are captured there for later.)
```

- [ ] **Step 2: Add the landed entry**

In the same file, in the _Already landed_ list, after the line:

```
- DE-329 filed + DE-328 marked resolved — lq-ai **#119** `badf83d`
```

add:

```
- **P1.4** `deletion_scheduled_at` on `GET /users/me` — lq-ai `945ad31` (Donna pin PR #42); resolves `lq-ai-expose-deletion-status-on-users-me.md`. Consumed by the conditional pending-deletion banner on `/settings/data`.
```

Then update the summary line below that list:

```
All five merged to lq-ai main; **Donna pinned at `badf83d` (v0.4.0)** as of 2026-06-01 (see `docs/decisions/lq-ai-pin.md`).
```

to:

```
All merged to lq-ai main; **Donna pinned at `945ad31`** as of 2026-06-01 (see `docs/decisions/lq-ai-pin.md`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/upstream-requests/lq-ai-backend-asks-for-donna.md
git commit -m "docs(upstream): mark P1.4 (deletion_scheduled_at on /users/me) landed"
```

---

## Final Verification (run after all tasks)

- [ ] `npm run check` → "0 errors and 0 warnings".
- [ ] `npx vitest run` → full suite green (~760 tests).
- [ ] `set -a; . ./.env; set +a; npx playwright test tests/data-privacy.spec.ts` → green, no real deletion POSTed.
- [ ] Manual sanity: on `/settings/data` (admin, not pending) the Delete button shows and there is no banner or cancel control.

## Acceptance criteria (from the spec)

- [ ] Banner shows with formatted date + cancel control when `deletion_scheduled_at` is non-null; Delete button hidden.
- [ ] When null/absent: Delete button + modal show; no banner; no always-on cancel control.
- [ ] Cancel calls `invalidateAll()`; on success the banner clears.
- [ ] In-session post-delete "Return to sign in" screen unchanged.
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`).
- [ ] Component tests cover pending + not-pending; vitest green.
- [ ] Live e2e passes and POSTs no real deletion.
