# P7-2 Data & privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings/data` "danger zone" to the existing P7-1 settings shell: export your data (background job + poll + download) and delete your account (type-to-confirm, soft-scheduled, always-available cancel).

**Architecture:** A new `/settings/data` SvelteKit route in the `(app)` group. The two state-changing operations (`POST /users/me/export`, `POST /users/me/delete`) and the cancel (`POST /users/me/delete/cancel`) run through `+page.server.ts` **form actions** via `lqFetch`. The export job is polled client-side through one BFF GET proxy (`/settings/data/export/[job_id]/+server.ts`), mirroring the P4-3b `KbFileRow` ingest-poll pattern. Two new components (`DataExportCard`, `DeleteAccountModal`) live under `src/lib/settings/`, alongside a shared types module.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), Tailwind (mlq design tokens), vitest + @testing-library/svelte (component/server), Playwright (live e2e). Server tests use `// @vitest-environment node` + `vi.mock('$lib/server/lqClient')`.

---

## Backend contract (verified @ pin `438198c`)

- `POST /api/v1/users/me/export` → `202 { job_id, status: "queued"|"processing"|"completed"|"failed", download_url?: string|null }` (no request body).
- `GET /api/v1/users/me/export/{job_id}` → `200 { job_id, status, download_url? }`; `404` if missing/not-yours. `download_url` is a presigned URL valid 24h once `status==="completed"`. **Needs the `ingest-worker` running.**
- `POST /api/v1/users/me/delete` → `202 { scheduled_deletion_at, grace_period_days }` (no body). Revokes all sessions.
- `POST /api/v1/users/me/delete/cancel` → `204` cancelled / `400` nothing pending.

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/settings/dataPrivacy.ts` | Shared TS types (`ExportStatus`, `ExportJob`, `DeletionSchedule`) | Create |
| `src/lib/settings/SettingsRail.svelte` | Add the "Data & privacy" rail entry | Modify |
| `src/lib/settings/SettingsRail.svelte.test.ts` | Cover the new entry | Modify |
| `src/routes/(app)/settings/data/export/[job_id]/+server.ts` | BFF GET proxy for the client poll | Create |
| `src/routes/(app)/settings/data/export/[job_id]/server.test.ts` | Proxy unit test | Create |
| `src/routes/(app)/settings/data/+page.server.ts` | Form actions: `requestExport`, `requestDeletion`, `cancelDeletion` | Create |
| `src/routes/(app)/settings/data/page.server.test.ts` | Action unit tests | Create |
| `src/lib/settings/DataExportCard.svelte` | Export state machine + poll controller | Create |
| `src/lib/settings/DataExportCard.svelte.test.ts` | Card state transitions | Create |
| `src/lib/settings/DeleteAccountModal.svelte` | Type-`DELETE`-to-confirm modal | Create |
| `src/lib/settings/DeleteAccountModal.svelte.test.ts` | Gating + a11y | Create |
| `src/routes/(app)/settings/data/+page.svelte` | Composes the page: export card, danger zone, cancel, post-delete confirmation | Create |
| `src/routes/(app)/settings/data/page.svelte.test.ts` | Light render test | Create |
| `docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md` | Detailed upstream ask | Create |
| `docs/upstream-requests/lq-ai-backend-asks-for-donna.md` | Add ask P1.4 to the relay index | Modify |
| `tests/data-privacy.spec.ts` | Live e2e | Create |

---

### Task 1: Add the "Data & privacy" rail entry

**Files:**
- Modify: `src/lib/settings/SettingsRail.svelte:4-7`
- Test: `src/lib/settings/SettingsRail.svelte.test.ts`

- [ ] **Step 1: Add failing tests for the new entry**

Append these two `it` blocks inside the `describe('SettingsRail', …)` in `src/lib/settings/SettingsRail.svelte.test.ts`:

```ts
  it('renders the Data & privacy section link', () => {
    h.pathname = '/settings/account';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute('href', '/settings/data');
  });

  it('marks Data & privacy active on /settings/data', () => {
    h.pathname = '/settings/data';
    render(SettingsRail);
    expect(screen.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute('aria-current', 'page');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: FAIL — the two new tests can't find a "Data & privacy" link.

- [ ] **Step 3: Add the entry to the sections array**

In `src/lib/settings/SettingsRail.svelte`, replace the `sections` array (lines 5-7):

```svelte
  const sections: { href: string; label: string }[] = [
    { href: '/settings/account', label: 'Account' },
    { href: '/settings/data', label: 'Data & privacy' }
  ];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/SettingsRail.svelte src/lib/settings/SettingsRail.svelte.test.ts
git commit -m "feat(settings): add Data & privacy entry to the settings rail"
```

---

### Task 2: Shared types module

**Files:**
- Create: `src/lib/settings/dataPrivacy.ts`

(Types only — no behavior to test. Consumed by the proxy, the page server, and both components.)

- [ ] **Step 1: Create the module**

```ts
// Shared shapes for the P7-2 Data & privacy flows. The backend returns these
// inline (they are not named schemas in backend.d.ts), so we mirror them here.

export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJob {
  job_id: string;
  status: ExportStatus;
  download_url?: string | null;
}

export interface DeletionSchedule {
  scheduled_deletion_at: string;
  grace_period_days: number;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors and 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless).

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings/dataPrivacy.ts
git commit -m "feat(settings): shared types for the Data & privacy flows"
```

---

### Task 3: BFF poll proxy

**Files:**
- Create: `src/routes/(app)/settings/data/export/[job_id]/+server.ts`
- Test: `src/routes/(app)/settings/data/export/[job_id]/server.test.ts`

Mirrors `src/routes/(app)/files/[id]/+server.ts` exactly (passes through 404/503/504, everything else → 502).

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/settings/data/export/[job_id]/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (job_id: string) => ({ params: { job_id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET /settings/data/export/[job_id] proxy', () => {
  it('proxies the job status on success', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'j1', status: 'processing', download_url: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    const res = await GET(event('j1'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/export/j1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job_id: 'j1', status: 'processing', download_url: null });
  });

  it('passes a 404 through', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(GET(event('missing'))).rejects.toMatchObject({ status: 404 });
  });

  it('maps a 500 to 502', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(GET(event('j1'))).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/data/export/[job_id]/server.test.ts"`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write the proxy**

Create `src/routes/(app)/settings/data/export/[job_id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

// Client-poll proxy for the export job. The card fetches this on an interval;
// the POSTs go through the page form actions. Mirrors files/[id]/+server.ts.
export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/users/me/export/${event.params.job_id}`);
  if (!res.ok) {
    const status = res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
    throw error(status, 'Could not load export status.');
  }
  return json(await res.json());
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/data/export/[job_id]/server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/data/export/[job_id]/+server.ts" "src/routes/(app)/settings/data/export/[job_id]/server.test.ts"
git commit -m "feat(settings): BFF proxy for export-job polling"
```

---

### Task 4: Page server form actions

**Files:**
- Create: `src/routes/(app)/settings/data/+page.server.ts`
- Test: `src/routes/(app)/settings/data/page.server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/settings/data/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
const clearSessionCookies = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
vi.mock('$lib/server/session', () => ({ clearSessionCookies: (...a: unknown[]) => clearSessionCookies(...a) }));
import { actions } from './+page.server';

const event = () => ({}) as never;

beforeEach(() => {
  lqFetch.mockReset();
  clearSessionCookies.mockReset();
});

describe('requestExport action', () => {
  it('POSTs and returns the job on 202', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'j1', status: 'queued', download_url: null }), { status: 202 })
    );
    const r = await actions.requestExport(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/export');
    expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'POST' });
    expect(r).toEqual({ export: { job_id: 'j1', status: 'queued', download_url: null } });
  });

  it('maps a failure to a 502 inline error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.requestExport(event());
    expect(r).toMatchObject({ status: 502, data: { exportError: expect.stringMatching(/could not start/i) } });
  });
});

describe('requestDeletion action', () => {
  it('POSTs, clears session cookies, and returns the schedule on 202', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify({ scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 }), { status: 202 })
    );
    const r = await actions.requestDeletion(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/delete');
    expect(clearSessionCookies).toHaveBeenCalledOnce();
    expect(r).toEqual({ deletion: { scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 } });
  });

  it('maps a failure to a 502 and does NOT clear cookies', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.requestDeletion(event());
    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 502, data: { deleteError: expect.stringMatching(/could not schedule/i) } });
  });
});

describe('cancelDeletion action', () => {
  it('returns cancelled on 204', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await actions.cancelDeletion(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/delete/cancel');
    expect(r).toEqual({ cancelled: true });
  });

  it('maps 400 (nothing pending) to a friendly message', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 400 }));
    const r = await actions.cancelDeletion(event());
    expect(r).toMatchObject({ status: 400, data: { cancelMessage: expect.stringMatching(/no scheduled deletion/i) } });
  });

  it('maps other failures to a 502 retry error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.cancelDeletion(event());
    expect(r).toMatchObject({ status: 502, data: { cancelError: expect.stringMatching(/could not cancel/i) } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/data/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Write the actions**

Create `src/routes/(app)/settings/data/+page.server.ts`:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { clearSessionCookies } from '$lib/server/session';
import type { ExportJob, DeletionSchedule } from '$lib/settings/dataPrivacy';

export const actions: Actions = {
  requestExport: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/export', { method: 'POST' });
    if (!res.ok) return fail(502, { exportError: 'Could not start the export. Please try again.' });
    const job = (await res.json()) as ExportJob;
    return { export: job };
  },

  requestDeletion: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/delete', { method: 'POST' });
    if (!res.ok) return fail(502, { deleteError: 'Could not schedule deletion. Please try again.' });
    const schedule = (await res.json()) as DeletionSchedule;
    // The backend revokes all sessions on delete; drop our now-stale cookies so
    // the next navigation lands cleanly on /login instead of bouncing via a 401.
    clearSessionCookies(event);
    return { deletion: schedule };
  },

  cancelDeletion: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/delete/cancel', { method: 'POST' });
    if (res.status === 204 || res.ok) return { cancelled: true };
    if (res.status === 400) return fail(400, { cancelMessage: 'No scheduled deletion to cancel.' });
    return fail(502, { cancelError: 'Could not cancel. Please try again.' });
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/data/page.server.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/data/+page.server.ts" "src/routes/(app)/settings/data/page.server.test.ts"
git commit -m "feat(settings): form actions for export, delete, and cancel-delete"
```

---

### Task 5: DataExportCard component

**Files:**
- Create: `src/lib/settings/DataExportCard.svelte`
- Test: `src/lib/settings/DataExportCard.svelte.test.ts`

State machine: `idle` → (`queued`|`processing`, polling) → `completed` (download link) | `failed` (try again). Polls the BFF proxy; **pauses while the tab is hidden**; stops on terminal states.

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/DataExportCard.svelte.test.ts`. It captures the `use:enhance` submit (like `MfaDisableModal.svelte.test.ts`) to drive results, and mocks `fetch` for the poll:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DataExportCard from './DataExportCard.svelte';
import type { ExportJob } from './dataPrivacy';

type Result = { type: string; data?: Record<string, unknown> };
type PostCb = (args: { result: Result; update: () => Promise<void> }) => Promise<void>;
type SubmitFn = () => PostCb;

const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
  enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
    hoisted.submit = submit;
    return {};
  }
}));

async function deliver(result: Result) {
  const post = hoisted.submit!();
  await post({ result, update: async () => {} });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('DataExportCard', () => {
  it('shows the Export button when idle', () => {
    render(DataExportCard);
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
  });

  it('shows progress after a queued job and disables the button', async () => {
    render(DataExportCard);
    await deliver({ type: 'success', data: { export: { job_id: 'j1', status: 'queued', download_url: null } as ExportJob } });
    expect(screen.getByText(/preparing your export/i)).toBeInTheDocument();
  });

  it('shows the download link when polling reports completed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'j1', status: 'completed', download_url: 'https://minio/x.zip' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(DataExportCard);
    await deliver({ type: 'success', data: { export: { job_id: 'j1', status: 'processing', download_url: null } as ExportJob } });
    await vi.advanceTimersByTimeAsync(2000);
    const link = await screen.findByRole('link', { name: /download archive/i });
    expect(link).toHaveAttribute('href', 'https://minio/x.zip');
    expect(fetchMock).toHaveBeenCalledWith('/settings/data/export/j1');
  });

  it('shows the failed state with a retry when polling reports failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'j1', status: 'failed', download_url: null }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(DataExportCard);
    await deliver({ type: 'success', data: { export: { job_id: 'j1', status: 'processing', download_url: null } as ExportJob } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await screen.findByText(/export failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('surfaces an inline error on a failed submit', async () => {
    render(DataExportCard);
    await deliver({ type: 'failure', data: { exportError: 'Could not start the export.' } });
    expect(await screen.findByText('Could not start the export.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/settings/DataExportCard.svelte.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

Create `src/lib/settings/DataExportCard.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ExportJob, ExportStatus } from './dataPrivacy';

  let state = $state<'idle' | ExportStatus>('idle');
  let jobId = $state<string | null>(null);
  let downloadUrl = $state<string | null>(null);
  let error = $state<string | null>(null);

  const POLL_INTERVAL_MS = 2000;
  const isRunning = $derived(state === 'queued' || state === 'processing');

  function applyJob(job: ExportJob) {
    state = job.status;
    jobId = job.job_id;
    downloadUrl = job.download_url ?? null;
  }

  const submit: SubmitFunction = () => async ({ result, update }) => {
    if (result.type === 'success' && result.data?.export) {
      error = null;
      applyJob(result.data.export as ExportJob);
    } else if (result.type === 'failure') {
      error = (result.data?.exportError as string | undefined) ?? 'Could not start the export.';
    } else {
      await update();
    }
  };

  // Poll the BFF proxy while a job runs; pause while the tab is hidden; stop on
  // a terminal status (isRunning flips false → $effect cleanup clears the timer).
  $effect(() => {
    if (!isRunning || !jobId) return;
    const id = jobId;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/settings/data/export/${id}`);
        if (res.status === 404) {
          state = 'failed';
          return;
        }
        if (!res.ok) return; // transient gateway hiccup; keep polling
        applyJob((await res.json()) as ExportJob);
      } catch {
        /* network hiccup; keep polling */
      }
    };
    const pollId = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(pollId);
  });

  function reset() {
    state = 'idle';
    jobId = null;
    downloadUrl = null;
    error = null;
  }
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
  <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Export your data</h2>
  <div class="px-4 py-3 text-sm">
    {#if state === 'completed' && downloadUrl}
      <p class="text-mlq-text">Your export is ready.</p>
      <p class="mb-3 mt-0.5 text-xs text-mlq-muted">The download link is valid for 24 hours.</p>
      <div class="flex items-center gap-3">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external presigned download URL -->
        <a href={downloadUrl} download class="rounded-mlq-control bg-mlq-workflow px-2.5 py-1 text-xs text-white">Download archive</a>
        <button type="button" onclick={reset} class="text-xs text-mlq-workflow hover:underline">Start a new export</button>
      </div>
    {:else if state === 'failed'}
      <p class="text-mlq-text">Export failed.</p>
      <p class="mb-3 mt-0.5 text-xs text-mlq-muted">Something went wrong preparing your archive.</p>
      <button type="button" onclick={reset} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Try again</button>
    {:else if isRunning}
      <div class="flex items-center gap-2 text-mlq-text">
        <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-mlq-subtle border-t-mlq-text" aria-hidden="true"></span>
        <span>Preparing your export… this can take a minute.</span>
      </div>
    {:else}
      <p class="mb-3 text-mlq-muted">Generate a downloadable archive of your matters, chats, and documents.</p>
      <form method="POST" action="?/requestExport" use:enhance={submit}>
        <button type="submit" class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white">Export my data</button>
      </form>
      {#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
    {/if}
  </div>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/settings/DataExportCard.svelte.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/DataExportCard.svelte src/lib/settings/DataExportCard.svelte.test.ts
git commit -m "feat(settings): DataExportCard with background-job polling"
```

---

### Task 6: DeleteAccountModal component

**Files:**
- Create: `src/lib/settings/DeleteAccountModal.svelte`
- Test: `src/lib/settings/DeleteAccountModal.svelte.test.ts`

Mirrors `MfaDisableModal.svelte` a11y (scrim + `role="dialog"` + `aria-modal` + Esc-to-close). The confirm button is gated until the user types `DELETE`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/DeleteAccountModal.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DeleteAccountModal from './DeleteAccountModal.svelte';

type Result = { type: string; data?: Record<string, unknown> };
type PostCb = (args: { result: Result }) => Promise<void>;
type SubmitFn = () => PostCb;

const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
  enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
    hoisted.submit = submit;
    return {};
  }
}));

describe('DeleteAccountModal', () => {
  it('renders nothing when closed', () => {
    render(DeleteAccountModal, { props: { open: false } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the confirm button disabled until DELETE is typed', async () => {
    render(DeleteAccountModal, { props: { open: true } });
    const confirm = screen.getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(/type delete to confirm/i), { target: { value: 'delete' } });
    expect(confirm).toBeDisabled(); // case-sensitive
    await fireEvent.input(screen.getByLabelText(/type delete to confirm/i), { target: { value: 'DELETE' } });
    expect(confirm).toBeEnabled();
  });

  it('posts ?/requestDeletion', () => {
    const { container } = render(DeleteAccountModal, { props: { open: true } });
    expect(container.querySelector('form')).toHaveAttribute('action', '?/requestDeletion');
  });

  it('calls onclose on Cancel and on Escape', async () => {
    const onclose = vi.fn();
    render(DeleteAccountModal, { props: { open: true, onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('calls ondeleted with the schedule on a successful submit', async () => {
    const ondeleted = vi.fn();
    render(DeleteAccountModal, { props: { open: true, ondeleted } });
    const post = hoisted.submit!();
    await post({ result: { type: 'success', data: { deletion: { scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 } } } });
    expect(ondeleted).toHaveBeenCalledWith({ scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 });
  });

  it('shows an inline error on a failed submit', async () => {
    render(DeleteAccountModal, { props: { open: true } });
    const post = hoisted.submit!();
    await post({ result: { type: 'failure', data: { deleteError: 'Could not schedule deletion. Please try again.' } } });
    expect(await screen.findByText('Could not schedule deletion. Please try again.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/settings/DeleteAccountModal.svelte.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

Create `src/lib/settings/DeleteAccountModal.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { X } from '@lucide/svelte';
  import type { DeletionSchedule } from './dataPrivacy';

  let { open = false, onclose, ondeleted }:
    { open?: boolean; onclose?: () => void; ondeleted?: (info: DeletionSchedule) => void } = $props();

  const CONFIRM_WORD = 'DELETE';
  let confirmText = $state('');
  let error = $state<string | null>(null);
  const canDelete = $derived(confirmText === CONFIRM_WORD);

  // Reset on open — avoids stale text/error when reopened.
  $effect(() => { if (open) { confirmText = ''; error = null; } });

  $effect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose?.(); };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });

  const submit: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'success' && result.data?.deletion) {
      ondeleted?.(result.data.deletion as DeletionSchedule);
    } else {
      error = (result.type === 'failure' ? (result.data?.deleteError as string | undefined) : undefined)
        ?? 'Could not schedule deletion. Please try again.';
    }
    // No update()/invalidateAll: the action cleared our session cookies, so a
    // reload would bounce to /login before the page can show the confirmation.
  };
</script>

{#if open}
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => onclose?.()}></div>
  <div role="dialog" aria-modal="true" aria-label="Delete your account"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-mlq-text">Delete your account?</h2>
      <button type="button" aria-label="Close" onclick={() => onclose?.()} class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={16} /></button>
    </div>
    <p class="mb-3 text-xs text-mlq-muted">This schedules permanent deletion after a grace period and signs you out everywhere. You can cancel during the grace window.</p>
    <form method="POST" action="?/requestDeletion" use:enhance={submit}>
      <label class="block text-xs text-mlq-muted" for="delete-confirm">Type DELETE to confirm</label>
      <input id="delete-confirm" name="confirm" bind:value={confirmText} autocomplete="off"
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-error" />
      {#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick={() => onclose?.()} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Cancel</button>
        <button type="submit" disabled={!canDelete} class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">Delete account</button>
      </div>
    </form>
  </div>
{/if}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/settings/DeleteAccountModal.svelte.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/DeleteAccountModal.svelte src/lib/settings/DeleteAccountModal.svelte.test.ts
git commit -m "feat(settings): DeleteAccountModal with type-to-confirm gating"
```

---

### Task 7: The /settings/data page

**Files:**
- Create: `src/routes/(app)/settings/data/+page.svelte`
- Test: `src/routes/(app)/settings/data/page.svelte.test.ts`

Composes the export card + danger zone (delete button → modal; always-visible cancel link) + the one-time post-delete confirmation.

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/settings/data/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import Page from './+page.svelte';

describe('/settings/data page', () => {
  it('renders the heading, export card, delete button, and cancel link', () => {
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: /data & privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel scheduled deletion/i })).toBeInTheDocument();
  });

  it('opens the delete modal when Delete my account is clicked', async () => {
    const { getByRole } = render(Page);
    await getByRole('button', { name: /delete my account/i }).click();
    expect(screen.getByRole('dialog', { name: /delete your account/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/data/page.svelte.test.ts"`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Write the page**

Create `src/routes/(app)/settings/data/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import DataExportCard from '$lib/settings/DataExportCard.svelte';
  import DeleteAccountModal from '$lib/settings/DeleteAccountModal.svelte';
  import type { DeletionSchedule } from '$lib/settings/dataPrivacy';

  let deleteOpen = $state(false);
  let scheduled = $state<DeletionSchedule | null>(null);
  let cancelMsg = $state<string | null>(null);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const cancelSubmit: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'success') cancelMsg = 'Scheduled deletion cancelled.';
    else if (result.type === 'failure')
      cancelMsg = (result.data?.cancelMessage as string | undefined)
        ?? (result.data?.cancelError as string | undefined)
        ?? 'Could not cancel.';
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
      Your account is scheduled for permanent deletion on <strong>{fmtDate(scheduled.scheduled_deletion_at)}</strong>.
      You can cancel by signing back in within {scheduled.grace_period_days} days.
    </p>
    <button type="button" onclick={returnToLogin} class="mt-4 rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white">Return to sign in</button>
  </section>
{:else}
  <DataExportCard />

  <section class="mt-6 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5">
    <h2 class="border-b border-mlq-error/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-error">Danger zone</h2>
    <div class="px-4 py-3 text-sm">
      <div class="text-mlq-text">Delete account</div>
      <p class="mb-3 mt-0.5 text-xs text-mlq-muted">Schedules your account for permanent deletion after a grace period. You'll be signed out on all devices.</p>
      <button type="button" onclick={() => (deleteOpen = true)} class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Delete my account</button>

      <div class="mt-4 border-t border-mlq-error/20 pt-3 text-xs text-mlq-muted">
        Already scheduled a deletion?
        <form method="POST" action="?/cancelDeletion" use:enhance={cancelSubmit} class="mt-1">
          <button type="submit" class="text-mlq-workflow hover:underline">Cancel scheduled deletion</button>
        </form>
        {#if cancelMsg}<p class="mt-1 text-mlq-text">{cancelMsg}</p>{/if}
      </div>
    </div>
  </section>

  <DeleteAccountModal open={deleteOpen} onclose={() => (deleteOpen = false)} ondeleted={onDeleted} />
{/if}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/data/page.svelte.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Full check + commit**

Run: `npm run check`
Expected: 0 errors and 0 warnings.

```bash
git add "src/routes/(app)/settings/data/+page.svelte" "src/routes/(app)/settings/data/page.svelte.test.ts"
git commit -m "feat(settings): /settings/data page composing export + danger zone"
```

---

### Task 8: Upstream ask — expose deletion status on /users/me

**Files:**
- Create: `docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md`
- Modify: `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`

(Docs only — decision (c): ship the always-on cancel link now, file the ask for a future conditional banner.)

- [ ] **Step 1: Write the detailed request**

Create `docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md`:

```markdown
# LQ_AI ask — expose `deletion_scheduled_at` on `GET /users/me`

**From:** Donna frontend session · **Date:** 2026-05-31 · **Pin Donna is on:** `438198c`

## Problem

P7-2 (Donna's Data & privacy settings) ships account deletion against the existing
`POST /api/v1/users/me/delete` (soft-schedules + revokes sessions) and
`POST /api/v1/users/me/delete/cancel`. But `deletion_scheduled_at` is exposed **only on
`AdminUserRow`** (the admin user-list schema) — the `User` schema returned by
`GET /api/v1/users/me` has no such field. So a normal user's session cannot detect a
pending deletion on load, and Donna cannot conditionally render a proper
"Pending deletion — cancel by <date>" banner.

## Current workaround (shipped in P7-2)

An **always-visible** "Cancel scheduled deletion" control that POSTs the cancel endpoint
(`204` → "cancelled", `400` → "nothing pending"). Functional, but it's always shown even
when nothing is pending — slightly awkward.

## Requested change

Expose the pending-deletion state on the user-facing profile, either:
- add `deletion_scheduled_at?: string | null` to the `User` schema returned by
  `GET /api/v1/users/me`, **or**
- add a small dedicated status field/endpoint Donna can read on load.

## lq-ai files (approx.)

- `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (`GET /users/me` handler)
- `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (the `User` response model)

## Unblocks (Donna)

Replace the always-on cancel link with a conditional "Pending deletion — cancel by <date>"
banner. Donna will bump the pin, run `npm run gen:api`, swap the link for the banner, and
log it in `docs/decisions/lq-ai-pin.md`.
```

- [ ] **Step 2: Add the ask to the relay index**

In `docs/upstream-requests/lq-ai-backend-asks-for-donna.md`:

(a) Update the count sentence (around line 12) from "All three are small and independent" to:

```markdown
These are the backend changes Donna currently needs. All four are small and independent — good
```

(b) Append a new section after the P1.3 block (before the `---` that precedes "After any of these merge"):

```markdown
## P1.4 — Expose `deletion_scheduled_at` on `GET /users/me`

- **Detailed request:** `/Users/kevinkeller/Code/Donna/docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md`
- **lq-ai files:**
  - `/Users/kevinkeller/Code/lq-ai/api/app/api/users.py` (`GET /users/me`)
  - `/Users/kevinkeller/Code/lq-ai/api/app/schemas/` (the `User` response model)
- **Gist:** `deletion_scheduled_at` lives only on `AdminUserRow`, not on the `User` schema from
  `GET /users/me`, so a normal session can't detect a pending deletion on load. Donna ships an
  always-visible "Cancel scheduled deletion" link as a workaround. Add `deletion_scheduled_at`
  (or a small status field/endpoint) to `/users/me` so Donna can show a proper conditional
  "Pending deletion — cancel by <date>" banner instead.
- **Unblocks (Donna):** the conditional pending-deletion banner in P7-2 (the always-on cancel link ships without it).
```

- [ ] **Step 3: Commit**

```bash
git add docs/upstream-requests/lq-ai-expose-deletion-status-on-users-me.md docs/upstream-requests/lq-ai-backend-asks-for-donna.md
git commit -m "docs(upstream): ask to expose deletion_scheduled_at on /users/me (P7-2)"
```

---

### Task 9: Live e2e

**Files:**
- Create: `tests/data-privacy.spec.ts`

Covers export end-to-end (real `ingest-worker`), the deletion-confirm modal UI **without submitting the real delete**, and the cancel-nothing-pending path. Mirrors `tests/kb-management.spec.ts` (login helper + self-cleaning; nothing persistent is created here).

- [ ] **Step 1: Write the e2e test**

Create `tests/data-privacy.spec.ts`:

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

test('Data & privacy — export end-to-end, delete-confirm UI (no submit), cancel-nothing-pending', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  // Reach the page via the settings rail.
  await page.goto('/settings/data');
  await expect(page.getByRole('heading', { level: 1, name: 'Data & privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute('aria-current', 'page');

  // --- Export end-to-end (real ingest-worker builds the ZIP) ---
  await page.getByRole('button', { name: /export my data/i }).click();
  await expect(page.getByText(/preparing your export/i)).toBeVisible({ timeout: 15_000 });
  const download = page.getByRole('link', { name: /download archive/i });
  await expect(download).toBeVisible({ timeout: 240_000 });
  await expect(download).toHaveAttribute('href', /.+/); // presigned URL present

  // --- Deletion confirm modal UI — gate, then CANCEL OUT (never submit) ---
  await page.getByRole('button', { name: /delete my account/i }).click();
  const dialog = page.getByRole('dialog', { name: /delete your account/i });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Delete account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/type delete to confirm/i).fill('DELETE');
  await expect(confirm).toBeEnabled();
  // Do NOT click confirm — closing the modal leaves the account untouched.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // --- Cancel-with-nothing-pending (safe; admin fixture has no pending deletion) ---
  await page.getByRole('button', { name: /cancel scheduled deletion/i }).click();
  await expect(page.getByText(/no scheduled deletion to cancel/i)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 2: Rebuild the web container (it serves built code), then run the e2e**

The running `donna-web` container serves *built* code, so rebuild after adding `src/` files:

Run:
```bash
docker compose up -d --build donna-web
set -a; . ./.env; set +a
npx playwright test tests/data-privacy.spec.ts
```
Expected: 1 passed. (Requires `ingest-worker` up for the export leg.)

- [ ] **Step 3: Commit**

```bash
git add tests/data-privacy.spec.ts
git commit -m "test(settings): live e2e for Data & privacy (export, delete-confirm UI, cancel)"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` → "0 errors and 0 warnings".
- [ ] `npx vitest run` → all green (existing ~697 + the new unit/component/server tests).
- [ ] `docker compose up -d --build donna-web && set -a; . ./.env; set +a; npx playwright test tests/data-privacy.spec.ts` → 1 passed.
- [ ] Manual smoke at http://localhost:13002/settings/data: rail shows "Data & privacy" active; export runs to a download link; delete modal gates on `DELETE`; cancel link reports "nothing pending".

## Notes for the executor

- **Never submit the real deletion** in any automated test — it schedules-deletes the admin fixture and revokes its sessions. Only exercise the modal UI and cancel-out.
- The `download_url` `<a>` carries a `svelte/no-navigation-without-resolve` disable comment because it's an external presigned URL (not an in-app route).
- Server tests need `// @vitest-environment node` and `vi.mock('$lib/server/lqClient', …)`; the `requestDeletion` test also mocks `$lib/server/session` to assert `clearSessionCookies` is called.
- Component tests capture the `use:enhance` submit via `vi.hoisted` (see `MfaDisableModal.svelte.test.ts`) and drive `result` objects directly.
