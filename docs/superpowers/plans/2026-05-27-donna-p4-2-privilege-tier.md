# Donna P4-2 — Privilege & tier-floor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `privileged` flag and `minimum_inference_tier` floor to Donna's matter create/edit form with coupled validation, surface privilege via a reusable `PrivilegedChip` on the matters list, detail header, and chat header, and enforce the tier floor in-chat by disabling sub-floor models in the model picker.

**Architecture:** Extend the existing `MatterForm` shared by the create modal and rename modal (Approach A from the spec). Add a single reusable `PrivilegedChip` using the P0-reserved `--color-mlq-privileged` Tailwind v4 token. Widen `resolveMatter` to a new `MatterHeaderInfo` type so the chat page can plumb `minimumTier` into `Composer` → `ModelPicker`. A pure `pickValidModel` helper guards against stale selection on chat load. No backend changes — `Project.privileged` + `minimum_inference_tier` are already in the generated contract (`vendor/lq-ai` @ `438198c`).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind v4 (`@theme` block in `src/app.css`), `@lucide/svelte` icons, vitest + `@testing-library/svelte` + `userEvent` for unit/component tests, Playwright for live e2e against the Docker stack on `localhost:13002`.

**Preconditions:**
- On branch `p4-2-privilege-tier` (already created off `main`; spec commit `6537348`).
- Docker stack up: `set -a; . ./.env; set +a && docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker`.
- Vendor pin verified: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
- Quality bar: `npm run check` = 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npx eslint <touched-files>` clean. **Rebuild `donna-web` before live e2e** (`docker compose up -d --build donna-web`).

---

## Task 1: Widen `resolveMatter` to carry privilege + tier

**Why first:** Pure data-layer change with its own test file already present. Establishes the `MatterHeaderInfo` type the chat header and Composer will consume in later tasks. MatterBadge's existing `MatterSummary` prop type is satisfied structurally by the wider object, so passing the new shape doesn't break anything.

**Files:**
- Modify: `src/lib/matters/types.ts`
- Modify: `src/routes/(app)/chats/[id]/matter.ts`
- Modify: `src/routes/(app)/chats/[id]/matter.test.ts`

- [ ] **Step 1: Add the new type to `src/lib/matters/types.ts`**

Replace the file contents with:

```ts
import type { components } from '$lib/api/backend';

/** A matter is a backend "project". */
export type Matter = components['schemas']['Project'];
export type MatterSummary = Pick<Matter, 'id' | 'name'>;

/** Richer view for the chat header — carries privilege + tier-floor so the
 *  chat page can render the PrivilegedChip and pass minimumTier to ModelPicker. */
export interface MatterHeaderInfo {
  id: string;
  name: string;
  privileged: boolean;
  minimumTier: 1 | 2 | 3 | 4 | 5 | null;
}

/** Drop the per-user sandbox project; the list/picker only show real matters. */
export function activeMatters(projects: Matter[]): Matter[] {
  return projects.filter((p) => !p.is_sandbox);
}
```

- [ ] **Step 2: Update the failing tests in `matter.test.ts` first (TDD)**

Replace `src/routes/(app)/chats/[id]/matter.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveMatter } from './matter';

describe('resolveMatter', () => {
  it('returns id/name + privileged/minimumTier when the chat has a project', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'c1', project_id: 'p1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Acme MSA', privileged: true, minimum_inference_tier: 4 }), { status: 200 }));
    expect(await resolveMatter(fetcher, 'c1')).toEqual({ id: 'p1', name: 'Acme MSA', privileged: true, minimumTier: 4 });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/chats/c1');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/projects/p1');
  });

  it('defaults privileged=false and minimumTier=null when the project omits them', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'c1', project_id: 'p1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Acme MSA' }), { status: 200 }));
    expect(await resolveMatter(fetcher, 'c1')).toEqual({ id: 'p1', name: 'Acme MSA', privileged: false, minimumTier: null });
  });

  it('returns null when the chat has no project', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'c1', project_id: null }), { status: 200 }));
    expect(await resolveMatter(fetcher, 'c1')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns null if the chat fetch fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
    expect(await resolveMatter(fetcher, 'c1')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `npx vitest run src/routes/\(app\)/chats/\[id\]/matter.test.ts`
Expected: at least the first two cases FAIL (`resolveMatter` still returns only `{id, name}`).

- [ ] **Step 4: Widen `resolveMatter`**

Replace `src/routes/(app)/chats/[id]/matter.ts` with:

```ts
import type { MatterHeaderInfo } from '$lib/matters/types';

type Fetcher = (path: string) => Promise<Response>;

/** Resolve a chat's matter for the header. Returns null when unscoped or on error.
 *  Carries privileged + minimumTier so the chat page can render the
 *  PrivilegedChip and pass the tier floor to the model picker. */
export async function resolveMatter(fetcher: Fetcher, chatId: string): Promise<MatterHeaderInfo | null> {
  const cRes = await fetcher(`/api/v1/chats/${chatId}`);
  if (!cRes.ok) return null;
  const projectId = ((await cRes.json()) as { project_id?: string | null }).project_id;
  if (!projectId) return null;
  const pRes = await fetcher(`/api/v1/projects/${projectId}`);
  if (!pRes.ok) return null;
  const p = (await pRes.json()) as {
    id: string;
    name: string;
    privileged?: boolean;
    minimum_inference_tier?: 1 | 2 | 3 | 4 | 5 | null;
  };
  return {
    id: p.id,
    name: p.name,
    privileged: p.privileged ?? false,
    minimumTier: p.minimum_inference_tier ?? null
  };
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run src/routes/\(app\)/chats/\[id\]/matter.test.ts`
Expected: all 4 cases PASS.

- [ ] **Step 6: Verify `npm run check` still clean**

Run: `npm run check`
Expected: exit 0 with "0 errors and 0 warnings". (Type widening should be structurally compatible with `MatterBadge`'s `MatterSummary | null` prop.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/matters/types.ts src/routes/\(app\)/chats/\[id\]/matter.ts src/routes/\(app\)/chats/\[id\]/matter.test.ts
git commit -m "feat(p4-2): widen resolveMatter to MatterHeaderInfo (privileged + tier)

Adds MatterHeaderInfo to matters/types.ts and updates resolveMatter
to extract privileged and minimum_inference_tier from the project
fetch. MatterBadge still type-checks (its MatterSummary prop is
structurally satisfied by the wider object).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `pickValidModel` pure helper

**Why now:** Independent pure function; the chat page's stale-selection guard depends on it. Building it before the chat-page wiring keeps that task focused on glue.

**Files:**
- Create: `src/lib/models/pickValidModel.ts`
- Create: `src/lib/models/pickValidModel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/models/pickValidModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ChatModelOption } from './types';
import { pickValidModel } from './pickValidModel';

const opts: ChatModelOption[] = [
  { id: 'smart', label: 'Opus 4.7', resolvedModel: 'x', group: 'cloud', tier: 4 },
  { id: 'fast', label: 'Sonnet 4.6', resolvedModel: 'x', group: 'cloud', tier: 4 },
  { id: 'local', label: 'qwen', resolvedModel: 'x', group: 'local', tier: 1 }
];

describe('pickValidModel', () => {
  it('returns the current id when no floor is set', () => {
    expect(pickValidModel(opts, 'local', null)).toBe('local');
    expect(pickValidModel(opts, 'smart', null)).toBe('smart');
  });

  it('returns the current id when it satisfies the floor', () => {
    expect(pickValidModel(opts, 'smart', 4)).toBe('smart');
    expect(pickValidModel(opts, 'local', 1)).toBe('local');
  });

  it('returns "smart" when the current selection is sub-floor and smart is valid', () => {
    expect(pickValidModel(opts, 'local', 2)).toBe('smart');
    expect(pickValidModel(opts, 'local', 4)).toBe('smart');
  });

  it('falls back to the highest-tier valid option when smart itself is sub-floor', () => {
    // Only the "smart" option satisfies tier 4; if smart were missing, fast (tier 4) wins.
    const noSmart = opts.filter((o) => o.id !== 'smart');
    expect(pickValidModel(noSmart, 'local', 3)).toBe('fast');
  });

  it('returns the current id (no-op) when no option is valid', () => {
    // tier 5 floor with cloud at tier 4: nothing valid → keep current selection.
    expect(pickValidModel(opts, 'local', 5)).toBe('local');
    expect(pickValidModel(opts, 'smart', 5)).toBe('smart');
  });

  it('returns the current id when options is empty', () => {
    expect(pickValidModel([], 'smart', 4)).toBe('smart');
  });

  it('treats options with tier=null as always valid', () => {
    const withNull: ChatModelOption[] = [{ id: 'mystery', label: '', resolvedModel: null, group: 'cloud', tier: null }];
    expect(pickValidModel(withNull, 'mystery', 5)).toBe('mystery');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/models/pickValidModel.test.ts`
Expected: FAIL with "cannot find module './pickValidModel'".

- [ ] **Step 3: Implement the helper**

Create `src/lib/models/pickValidModel.ts`:

```ts
import type { ChatModelOption } from './types';

/** Return the id of the model the chat should use, given the matter's
 *  minimum_inference_tier floor. If the current selection satisfies the floor
 *  (or there is no floor), return it unchanged. Otherwise prefer "smart" when
 *  it's valid; else the highest-tier valid option; else leave the current
 *  selection in place (degenerate; the gateway will refuse server-side). */
export function pickValidModel(
  options: ChatModelOption[],
  currentId: string,
  minimumTier: 1 | 2 | 3 | 4 | 5 | null
): string {
  if (minimumTier == null) return currentId;
  const valid = (o: ChatModelOption) => o.tier == null || o.tier >= minimumTier;
  const current = options.find((o) => o.id === currentId);
  if (current && valid(current)) return currentId;
  const smart = options.find((o) => o.id === 'smart');
  if (smart && valid(smart)) return 'smart';
  const validOptions = options.filter(valid);
  if (validOptions.length === 0) return currentId;
  // Highest tier first; null-tier options sort last so they don't displace a
  // concrete cloud match (and they were already handled by `valid`).
  validOptions.sort((a, b) => (b.tier ?? -1) - (a.tier ?? -1));
  return validOptions[0].id;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/models/pickValidModel.test.ts`
Expected: all 7 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/models/pickValidModel.ts src/lib/models/pickValidModel.test.ts
git commit -m "feat(p4-2): pure pickValidModel helper for the chat-page stale-selection guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `PrivilegedChip` component

**Why now:** Presentational, no logic; both the matters list/detail tasks and the chat-header task depend on it.

**Files:**
- Create: `src/lib/matters/PrivilegedChip.svelte`
- Create: `src/lib/matters/PrivilegedChip.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/matters/PrivilegedChip.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PrivilegedChip from './PrivilegedChip.svelte';

describe('PrivilegedChip', () => {
  it('renders the label and a privileged aria-label', () => {
    render(PrivilegedChip);
    const chip = screen.getByLabelText('Privileged matter');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Privileged');
  });

  it('uses the privileged token background', () => {
    render(PrivilegedChip);
    const chip = screen.getByLabelText('Privileged matter');
    expect(chip.className).toMatch(/bg-mlq-privileged/);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run src/lib/matters/PrivilegedChip.svelte.test.ts`
Expected: FAIL with "cannot find module './PrivilegedChip.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/PrivilegedChip.svelte`:

```svelte
<script lang="ts">
  import { Lock } from '@lucide/svelte';
</script>

<span
  aria-label="Privileged matter"
  class="inline-flex items-center gap-1 rounded-full bg-mlq-privileged px-2 py-0.5 text-xs font-medium text-white"
>
  <Lock size={12} aria-hidden="true" /> Privileged
</span>
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run src/lib/matters/PrivilegedChip.svelte.test.ts`
Expected: both cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/PrivilegedChip.svelte src/lib/matters/PrivilegedChip.svelte.test.ts
git commit -m "feat(p4-2): reusable PrivilegedChip in the P0 mlq-privileged token

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Extend `MatterForm` with privileged + tier + coupling

**Why now:** The form has to ship before the server actions need to read its fields. New props default safely (`privileged=false`, `minimumTier=null`), so existing callers (create modal, rename modal) continue to render correctly without being touched in this task.

**Files:**
- Modify: `src/lib/matters/MatterForm.svelte`
- Modify: `src/lib/matters/MatterForm.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/matters/MatterForm.svelte.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MatterForm from './MatterForm.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('MatterForm', () => {
  it('posts to the given action and disables submit until a name is typed', async () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
    const form = screen.getByRole('form', { name: /matter/i });
    expect(form).toHaveAttribute('action', '?/create');
    const submit = screen.getByRole('button', { name: 'Create matter' });
    expect(submit).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
    expect(submit).toBeEnabled();
  });

  it('seeds name and description in edit mode', () => {
    render(MatterForm, { props: { action: '?/rename', submitLabel: 'Save', name: 'Beta', description: 'Beta engagement' } });
    expect((screen.getByLabelText(/matter name/i) as HTMLInputElement).value).toBe('Beta');
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe('Beta engagement');
  });

  it('surfaces a server error message', () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter', error: 'Could not create the matter.' } });
    expect(screen.getByText('Could not create the matter.')).toBeInTheDocument();
  });

  it('seeds privileged and minimumTier in edit mode', () => {
    render(MatterForm, {
      props: { action: '?/rename', submitLabel: 'Save', name: 'Beta', privileged: true, minimumTier: 4 }
    });
    expect((screen.getByLabelText(/privileged matter/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/minimum model tier/i) as HTMLSelectElement).value).toBe('4');
  });

  it('disables submit and shows the coupling hint when privileged is checked but no tier is selected', async () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
    await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
    const submit = screen.getByRole('button', { name: 'Create matter' });
    expect(submit).toBeEnabled();
    await fireEvent.click(screen.getByLabelText(/privileged matter/i));
    expect(submit).toBeDisabled();
    expect(screen.getByText(/privileged matters require a minimum tier/i)).toBeInTheDocument();
  });

  it('re-enables submit once a tier is picked', async () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
    await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
    await fireEvent.click(screen.getByLabelText(/privileged matter/i));
    await fireEvent.change(screen.getByLabelText(/minimum model tier/i), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'Create matter' })).toBeEnabled();
    expect(screen.queryByText(/privileged matters require a minimum tier/i)).not.toBeInTheDocument();
  });

  it('non-privileged matters can submit with no tier selected', async () => {
    render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
    await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
    expect(screen.getByRole('button', { name: 'Create matter' })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/lib/matters/MatterForm.svelte.test.ts`
Expected: the 4 new cases FAIL (existing 3 still pass). Failures will reference missing labels / checkbox / select.

- [ ] **Step 3: Update `MatterForm.svelte`**

Replace `src/lib/matters/MatterForm.svelte` with:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';

  let {
    action,
    submitLabel,
    name: initialName = '',
    description: initialDesc = '',
    privileged: initialPrivileged = false,
    minimumTier: initialTier = null as 1 | 2 | 3 | 4 | 5 | null,
    error = ''
  }: {
    action: string;
    submitLabel: string;
    name?: string;
    description?: string;
    privileged?: boolean;
    minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
    error?: string;
  } = $props();

  // untrack: intentional one-time seed from props (uncontrolled input pattern).
  let nameValue = $state(untrack(() => initialName));
  let descValue = $state(untrack(() => initialDesc));
  let privilegedValue = $state(untrack(() => initialPrivileged));
  // The select binds to a string so the empty "None" option is representable.
  let tierValue = $state<'' | '1' | '2' | '3' | '4' | '5'>(
    untrack(() => (initialTier == null ? '' : (String(initialTier) as '1' | '2' | '3' | '4' | '5')))
  );

  const needsTier = $derived(privilegedValue && tierValue === '');
  const canSubmit = $derived(!!nameValue.trim() && !needsTier);
</script>

<form method="POST" {action} use:enhance aria-label="Matter" class="space-y-3">
  <div>
    <label for="matter-name" class="mb-1 block text-xs font-medium text-mlq-text">Matter name <span class="text-mlq-error">*</span></label>
    <input id="matter-name" name="name" bind:value={nameValue} required
           class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none" />
  </div>
  <div>
    <label for="matter-desc" class="mb-1 block text-xs font-medium text-mlq-text">Description <span class="text-mlq-muted">(optional)</span></label>
    <textarea id="matter-desc" name="description" bind:value={descValue} rows="3"
              class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"></textarea>
  </div>

  <div class="space-y-1">
    <label class="flex items-center gap-2 text-xs text-mlq-text">
      <input type="checkbox" name="privileged" bind:checked={privilegedValue} class="size-3.5 accent-mlq-privileged" />
      <span class="font-medium">Privileged matter</span>
    </label>
    <p class="pl-5 text-xs text-mlq-muted">Flags every chat in this matter as privileged in the audit log and enforces a minimum model tier.</p>
  </div>

  <div>
    <label for="matter-tier" class="mb-1 block text-xs font-medium text-mlq-text">Minimum model tier</label>
    <select id="matter-tier" name="minimum_inference_tier" bind:value={tierValue}
            class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none">
      <option value="">None</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
      <option value="5">5</option>
    </select>
    <p class="mt-1 text-xs text-mlq-muted">Higher tiers require cloud models. Privileged matters require a tier.</p>
    {#if needsTier}
      <p class="mt-1 text-xs text-mlq-error">Privileged matters require a minimum tier.</p>
    {/if}
  </div>

  {#if error}<p class="text-xs text-mlq-error">{error}</p>{/if}
  <div class="flex justify-end">
    <button type="submit" disabled={!canSubmit}
            class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{submitLabel}</button>
  </div>
</form>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/MatterForm.svelte.test.ts`
Expected: all 7 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/MatterForm.svelte src/lib/matters/MatterForm.svelte.test.ts
git commit -m "feat(p4-2): MatterForm — privileged checkbox + minimum tier select + coupling

Adds privileged + minimumTier props (default false/null). When the user
checks 'Privileged matter' but leaves the tier as None, the submit button
is disabled and an inline 'Privileged matters require a minimum tier'
hint appears. Existing callers (create + rename modals) pick up the new
fields automatically; this commit keeps them rendering correctly with
the default empty state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `create` action — parse privileged + tier, map 422

**Files:**
- Modify: `src/routes/(app)/matters/+page.server.ts`
- Modify: `src/routes/(app)/matters/page.server.test.ts`

- [ ] **Step 1: Update the existing test + add new cases (TDD)**

Replace `src/routes/(app)/matters/page.server.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const project = (over = {}) => ({ id: 'p1', name: 'Acme', slug: 'acme', description: null, privileged: false, minimum_inference_tier: null, is_sandbox: false, archived_at: null, ...over });
const formEvent = (fields: Record<string, string>) =>
  ({ request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;
const loadEvent = () => ({}) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters load', () => {
  it('loads active matters (sandbox filtered out)', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify([project({ id: 'a' }), project({ id: 'b', is_sandbox: true })]), { status: 200 }));
    const out = (await load(loadEvent())) as { matters: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(out.matters.map((m) => m.id)).toEqual(['a']);
  });
});

describe('/matters create action', () => {
  it('rejects an empty name without calling the backend', async () => {
    const r = await actions.create(formEvent({ name: '   ' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('POSTs the matter (non-privileged, no tier) and redirects to its detail page', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new1' })), { status: 201 }));
    await expect(actions.create(formEvent({ name: 'Acme MSA', description: 'engagement' }))).rejects.toMatchObject({ status: 303, location: '/matters/new1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: 'engagement', privileged: false });
  });

  it('POSTs privileged=true + minimum_inference_tier when both are set', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new2' })), { status: 201 }));
    await expect(
      actions.create(formEvent({ name: 'Acme MSA', description: '', privileged: 'on', minimum_inference_tier: '4' }))
    ).rejects.toMatchObject({ status: 303, location: '/matters/new2' });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: '', privileged: true, minimum_inference_tier: 4 });
  });

  it('POSTs minimum_inference_tier without privileged when only the tier is set', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new3' })), { status: 201 }));
    await expect(
      actions.create(formEvent({ name: 'Acme MSA', description: '', minimum_inference_tier: '2' }))
    ).rejects.toMatchObject({ status: 303 });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: '', privileged: false, minimum_inference_tier: 2 });
  });

  it('pre-checks privileged-without-tier without calling the backend', async () => {
    const r = await actions.create(formEvent({ name: 'Acme MSA', privileged: 'on' }));
    expect(r).toMatchObject({ status: 422, data: { error: 'Privileged matters require a minimum tier.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('maps a backend 422 to the privilege error message', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 422 }));
    const r = await actions.create(formEvent({ name: 'Acme MSA', privileged: 'on', minimum_inference_tier: '4' }));
    expect(r).toMatchObject({ status: 422, data: { error: 'Privileged matters require a minimum tier.' } });
  });

  it('maps other backend failures to the generic create error', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const r = await actions.create(formEvent({ name: 'Acme MSA' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not create the matter.' } });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/routes/\(app\)/matters/page.server.test.ts`
Expected: at least the 4 new cases FAIL (current action sends `{name, description}` and doesn't pre-check / map 422).

- [ ] **Step 3: Update `+page.server.ts`**

Replace `src/routes/(app)/matters/+page.server.ts` with:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { activeMatters, type Matter } from '$lib/matters/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/projects');
  if (!res.ok) throw error(502, 'Could not load matters.');
  return { matters: activeMatters((await res.json()) as Matter[]) };
};

function parsePrivilege(data: FormData): { privileged: boolean; minimum_inference_tier: 1 | 2 | 3 | 4 | 5 | null } {
  const privileged = data.get('privileged') === 'on';
  const raw = String(data.get('minimum_inference_tier') ?? '');
  const tier = raw === '' ? null : (Number(raw) as 1 | 2 | 3 | 4 | 5);
  return { privileged, minimum_inference_tier: tier };
}

export const actions: Actions = {
  create: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const { privileged, minimum_inference_tier } = parsePrivilege(data);
    if (privileged && minimum_inference_tier === null) {
      return fail(422, { error: 'Privileged matters require a minimum tier.' });
    }
    const body: Record<string, unknown> = { name, description, privileged };
    if (minimum_inference_tier !== null) body.minimum_inference_tier = minimum_inference_tier;
    const res = await lqFetch(event, '/api/v1/projects', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status === 422) return fail(422, { error: 'Privileged matters require a minimum tier.' });
      return fail(502, { error: 'Could not create the matter.' });
    }
    const m = (await res.json()) as Matter;
    throw redirect(303, `/matters/${m.id}`);
  }
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\(app\)/matters/page.server.test.ts`
Expected: all 8 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(app\)/matters/+page.server.ts src/routes/\(app\)/matters/page.server.test.ts
git commit -m "feat(p4-2): create action — parse privileged + tier, pre-check, map 422

Sends privileged (always) and minimum_inference_tier (only when set) on
POST /projects. Refuses privileged-without-tier with fail(422) before
reaching the backend, and maps a backend 422 to the same friendly
message in case the client guard is bypassed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Matters list — render `PrivilegedChip` on rows

**Files:**
- Modify: `src/routes/(app)/matters/+page.svelte`

- [ ] **Step 1: Edit the list row to render the chip**

In `src/routes/(app)/matters/+page.svelte`, add the import:

```svelte
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';
```

(Add it next to the existing `import MatterForm from '$lib/matters/MatterForm.svelte';`.)

Then update the list-row markup. Find this block:

```svelte
            <div class="min-w-0">
              <div class="font-serif text-sm text-mlq-text">{m.name}</div>
              {#if m.description}<div class="truncate text-xs text-mlq-muted">{m.description}</div>{/if}
            </div>
```

Replace it with:

```svelte
            <div class="min-w-0">
              <div class="flex items-center gap-2 font-serif text-sm text-mlq-text">
                <span class="truncate">{m.name}</span>
                {#if m.privileged}<PrivilegedChip />{/if}
              </div>
              {#if m.description}<div class="truncate text-xs text-mlq-muted">{m.description}</div>{/if}
            </div>
```

- [ ] **Step 2: Run the existing unit test suite — expect no regressions**

Run: `npx vitest run`
Expected: all currently-green tests stay green.

- [ ] **Step 3: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 4: Verify ESLint clean on the touched file**

Run: `npx eslint src/routes/\(app\)/matters/+page.svelte`
Expected: no output / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/matters/+page.svelte
git commit -m "feat(p4-2): privileged chip on matters list rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `rename` action — parse privileged + tier, map 400

**Files:**
- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Update the existing test + add new cases (TDD)**

Replace `src/routes/(app)/matters/[id]/page.server.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ev = (fields: Record<string, string> = {}, id = 'p1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;
const loadEv = (id = 'p1') => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters/[id] load', () => {
  it('loads the matter and its chats', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Acme', description: 'd', privileged: false, minimum_inference_tier: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'c1', title: 'Chat 1', message_count: 3 }] }), { status: 200 }));
    const out = (await load(loadEv())) as { matter: { name: string }; chats: unknown[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/chats?project_id=p1');
    expect(out.matter.name).toBe('Acme');
    expect(out.chats).toHaveLength(1);
  });
});

describe('/matters/[id] actions', () => {
  it('rename rejects an empty name without calling the backend', async () => {
    const r = await actions.rename(ev({ name: '  ' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('rename PATCHes name + description + privileged=false + null tier when neither is set', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.rename(ev({ name: 'Renamed', description: 'x' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Renamed', description: 'x', privileged: false, minimum_inference_tier: null });
    expect(r).toMatchObject({ success: true });
  });

  it('rename PATCHes privileged=true + numeric tier when both are set', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.rename(ev({ name: 'Renamed', description: 'x', privileged: 'on', minimum_inference_tier: '4' }));
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Renamed', description: 'x', privileged: true, minimum_inference_tier: 4 });
    expect(r).toMatchObject({ success: true });
  });

  it('rename pre-checks privileged-without-tier without calling the backend', async () => {
    const r = await actions.rename(ev({ name: 'Renamed', privileged: 'on' }));
    expect(r).toMatchObject({ status: 400, data: { error: 'Privileged matters require a minimum tier.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('rename maps a backend 400 to the privilege error message', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 400 }));
    const r = await actions.rename(ev({ name: 'Renamed', privileged: 'on', minimum_inference_tier: '4' }));
    expect(r).toMatchObject({ status: 400, data: { error: 'Privileged matters require a minimum tier.' } });
  });

  it('rename maps other backend failures to the generic rename error', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const r = await actions.rename(ev({ name: 'Renamed' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not rename the matter.' } });
  });

  it('archive DELETEs and redirects to /matters', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(actions.archive(ev())).rejects.toMatchObject({ status: 303, location: '/matters' });
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });

  it('newChat POSTs a project-scoped chat and redirects to it', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chatX' }), { status: 201 }));
    await expect(actions.newChat(ev())).rejects.toMatchObject({ status: 303, location: '/chats/chatX' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/routes/\(app\)/matters/\[id\]/page.server.test.ts`
Expected: at least the 4 new/changed rename cases FAIL (action still sends `{name, description}` and doesn't pre-check / map 400).

- [ ] **Step 3: Update `+page.server.ts`**

Replace `src/routes/(app)/matters/[id]/+page.server.ts` with:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Matter } from '$lib/matters/types';
import type { components } from '$lib/api/backend';
import type { PageServerLoad } from './$types';

type Chat = components['schemas']['Chat'];

export const load: PageServerLoad = async (event) => {
  const [mRes, cRes] = await Promise.all([
    lqFetch(event, `/api/v1/projects/${event.params.id}`),
    lqFetch(event, `/api/v1/chats?project_id=${event.params.id}`)
  ]);
  if (!mRes.ok) throw error(mRes.status === 404 ? 404 : 502, 'Could not load this matter.');
  const matter = (await mRes.json()) as Matter;
  const chats = cRes.ok ? (((await cRes.json()) as { items: Chat[] }).items ?? []) : [];
  return { matter, chats };
};

function parsePrivilege(data: FormData): { privileged: boolean; minimum_inference_tier: 1 | 2 | 3 | 4 | 5 | null } {
  const privileged = data.get('privileged') === 'on';
  const raw = String(data.get('minimum_inference_tier') ?? '');
  const tier = raw === '' ? null : (Number(raw) as 1 | 2 | 3 | 4 | 5);
  return { privileged, minimum_inference_tier: tier };
}

export const actions: Actions = {
  rename: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Matter name is required.' });
    const { privileged, minimum_inference_tier } = parsePrivilege(data);
    if (privileged && minimum_inference_tier === null) {
      return fail(400, { error: 'Privileged matters require a minimum tier.' });
    }
    const body = { name, description, privileged, minimum_inference_tier };
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status === 400) return fail(400, { error: 'Privileged matters require a minimum tier.' });
      return fail(502, { error: 'Could not rename the matter.' });
    }
    return { success: true };
  },

  archive: async (event) => {
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, { method: 'DELETE' });
    if (!res.ok) return fail(502, { error: 'Could not archive the matter.' });
    throw redirect(303, '/matters');
  },

  newChat: async (event) => {
    const res = await lqFetch(event, '/api/v1/chats', {
      method: 'POST',
      body: JSON.stringify({ project_id: event.params.id })
    });
    if (!res.ok) return fail(502, { error: 'Could not start a chat.' });
    const chat = (await res.json()) as Chat;
    throw redirect(303, `/chats/${chat.id}`);
  }
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\(app\)/matters/\[id\]/page.server.test.ts`
Expected: all 9 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(app\)/matters/\[id\]/+page.server.ts src/routes/\(app\)/matters/\[id\]/page.server.test.ts
git commit -m "feat(p4-2): rename action — parse privileged + tier, pre-check, map 400

Sends privileged + minimum_inference_tier (as null when None — ProjectUpdate
accepts null, so unchecking a tier clears it). Refuses privileged-without-tier
with fail(400) before reaching the backend, and maps a backend 400 to the
same friendly message in case the client guard is bypassed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Matter detail — render `PrivilegedChip` + seed rename form

**Files:**
- Modify: `src/routes/(app)/matters/[id]/+page.svelte`

- [ ] **Step 1: Add the import**

In `src/routes/(app)/matters/[id]/+page.svelte`, alongside the existing `import MatterForm from '$lib/matters/MatterForm.svelte';`, add:

```svelte
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';
```

- [ ] **Step 2: Render the chip in the detail header**

Find this block:

```svelte
  <div class="mb-6 border-b border-mlq-subtle pb-5">
    <h1 class="font-serif text-2xl text-mlq-strong">{data.matter.name}</h1>
```

Replace with:

```svelte
  <div class="mb-6 border-b border-mlq-subtle pb-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-serif text-2xl text-mlq-strong">{data.matter.name}</h1>
      {#if data.matter.privileged}<PrivilegedChip />{/if}
    </div>
```

- [ ] **Step 3: Seed privileged + minimumTier on the rename `MatterForm`**

Find this block:

```svelte
      <MatterForm action="?/rename" submitLabel="Save" name={data.matter.name} description={data.matter.description ?? ''} error={form?.error ?? ''} />
```

Replace with:

```svelte
      <MatterForm
        action="?/rename"
        submitLabel="Save"
        name={data.matter.name}
        description={data.matter.description ?? ''}
        privileged={data.matter.privileged}
        minimumTier={data.matter.minimum_inference_tier ?? null}
        error={form?.error ?? ''}
      />
```

- [ ] **Step 4: Run the full unit suite — expect no regressions**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: ESLint clean on the touched file**

Run: `npx eslint src/routes/\(app\)/matters/\[id\]/+page.svelte`
Expected: no output / exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/\(app\)/matters/\[id\]/+page.svelte
git commit -m "feat(p4-2): matter detail header — privileged chip + seed rename form

The rename modal now seeds the privileged checkbox and minimum-tier select
from the loaded matter, so editing keeps the form fully round-trippable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `ModelPicker` — `minimumTier` prop + disable sub-floor + floor note

**Files:**
- Modify: `src/lib/components/ModelPicker.svelte`
- Modify: `src/lib/components/ModelPicker.svelte.test.ts`

- [ ] **Step 1: Add the failing tests**

Replace `src/lib/components/ModelPicker.svelte.test.ts` with:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ModelPicker from './ModelPicker.svelte';
import type { ChatModelOption } from '$lib/models/types';

const OPTIONS: ChatModelOption[] = [
  { id: 'smart', label: 'Opus 4.7', resolvedModel: 'anthropic-prod/claude-opus-4-7', group: 'cloud', tier: 4 },
  { id: 'fast', label: 'Sonnet 4.6', resolvedModel: 'anthropic-prod/claude-sonnet-4-6', group: 'cloud', tier: 4 },
  { id: 'local', label: 'qwen3.5:9b', resolvedModel: 'ollama-local/qwen3.5:9b', group: 'local', tier: 1 }
];

describe('ModelPicker', () => {
  it('shows the selected alias and resolved model on the trigger', () => {
    const { getByTestId } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect: vi.fn() } });
    expect(getByTestId('model-picker')).toHaveTextContent('smart');
    expect(getByTestId('model-picker')).toHaveTextContent('Opus 4.7');
  });

  it('opens on click and calls onselect with the chosen id', async () => {
    const onselect = vi.fn();
    const { getByTestId } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect } });
    await userEvent.click(getByTestId('model-picker'));
    await userEvent.click(getByTestId('model-option-fast'));
    expect(onselect).toHaveBeenCalledWith('fast');
  });

  it('shows an unavailable note when error is set', async () => {
    const { getByTestId, getByText } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: true, onselect: vi.fn() } });
    await userEvent.click(getByTestId('model-picker'));
    expect(getByText(/unavailable/i)).toBeInTheDocument();
  });

  it('does not render the floor note when minimumTier is null', async () => {
    const { getByTestId, queryByText } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect: vi.fn(), minimumTier: null } });
    await userEvent.click(getByTestId('model-picker'));
    expect(queryByText(/lower-tier models are unavailable/i)).not.toBeInTheDocument();
  });

  it('renders a floor note and disables sub-floor options when minimumTier=2', async () => {
    const onselect = vi.fn();
    const { getByTestId, getByText } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect, minimumTier: 2 } });
    await userEvent.click(getByTestId('model-picker'));
    expect(getByText(/tier ≥ 2/)).toBeInTheDocument();
    const localOpt = getByTestId('model-option-local');
    expect(localOpt).toBeDisabled();
    await userEvent.click(localOpt);
    expect(onselect).not.toHaveBeenCalled();
    const fastOpt = getByTestId('model-option-fast');
    expect(fastOpt).not.toBeDisabled();
    await userEvent.click(fastOpt);
    expect(onselect).toHaveBeenCalledWith('fast');
  });

  it('disables every option when minimumTier=5 (cloud reports tier 4)', async () => {
    const onselect = vi.fn();
    const { getByTestId } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect, minimumTier: 5 } });
    await userEvent.click(getByTestId('model-picker'));
    expect(getByTestId('model-option-smart')).toBeDisabled();
    expect(getByTestId('model-option-fast')).toBeDisabled();
    expect(getByTestId('model-option-local')).toBeDisabled();
    await userEvent.click(getByTestId('model-option-smart'));
    expect(onselect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/lib/components/ModelPicker.svelte.test.ts`
Expected: the 3 new cases FAIL (no `minimumTier` prop yet).

- [ ] **Step 3: Update `ModelPicker.svelte`**

Replace `src/lib/components/ModelPicker.svelte` with:

```svelte
<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { ChatModelOption } from '$lib/models/types';

  let {
    options,
    selected,
    error = false,
    minimumTier = null as 1 | 2 | 3 | 4 | 5 | null,
    onselect
  }: {
    options: ChatModelOption[];
    selected: string;
    error?: boolean;
    minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
    onselect: (id: string) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  const current = $derived(options.find((o) => o.id === selected));
  const cloud = $derived(options.filter((o) => o.group === 'cloud'));
  const local = $derived(options.filter((o) => o.group === 'local'));

  function isSubFloor(o: ChatModelOption): boolean {
    return minimumTier != null && o.tier != null && o.tier < minimumTier;
  }
  function choose(o: ChatModelOption) {
    if (isSubFloor(o)) return;
    onselect(o.id);
    open = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
  // Close on outside click.
  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative" {onkeydown}>
  <button
    type="button"
    data-testid="model-picker"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="Model"
    onclick={() => (open = !open)}
    class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
  >
    <span class="font-medium">{selected}</span>
    {#if current?.label}<span class="text-mlq-muted">· {current.label}</span>{/if}
    <ChevronDown size={13} />
  </button>

  {#if open}
    <div
      role="listbox"
      class="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
    >
      {#if error}
        <p class="px-3 py-2 text-xs text-mlq-muted">Model list unavailable — sending with smart.</p>
      {/if}
      {#if minimumTier != null}
        <p class="border-b border-mlq-subtle bg-mlq-surface-alt px-3 py-2 text-xs text-mlq-muted">
          This matter requires tier ≥ {minimumTier} — lower-tier models are unavailable.
        </p>
      {/if}
      {#each [{ label: 'Cloud', items: cloud }, { label: 'Local', items: local }] as grp (grp.label)}
        {#if grp.items.length}
          <div class="bg-mlq-subtle/40 px-3 py-1 text-[10px] uppercase tracking-wide text-mlq-muted">{grp.label}</div>
          {#each grp.items as opt (opt.id)}
            {@const blocked = isSubFloor(opt)}
            <button
              type="button"
              role="option"
              aria-selected={opt.id === selected}
              aria-disabled={blocked}
              disabled={blocked}
              data-testid={`model-option-${opt.id}`}
              onclick={() => choose(opt)}
              class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50 aria-selected:font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span>{opt.id}</span>
              {#if opt.label}<span class="text-mlq-muted">{opt.label}</span>{/if}
            </button>
          {/each}
        {/if}
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/components/ModelPicker.svelte.test.ts`
Expected: all 6 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ModelPicker.svelte src/lib/components/ModelPicker.svelte.test.ts
git commit -m "feat(p4-2): ModelPicker — minimumTier prop, disable sub-floor options, floor note

When minimumTier is set, options with tier < minimumTier render disabled
(opacity-40, aria-disabled, click is a no-op) and a one-line floor note
appears above the option groups. minimumTier=null leaves the picker
behavior identical to before.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `Composer` — thread `minimumTier` to ModelPicker

**Files:**
- Modify: `src/lib/components/Composer.svelte`

- [ ] **Step 1: Add the prop**

In `src/lib/components/Composer.svelte`, update the props block from:

```svelte
  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop,
    skillAttach,
    enhance,
    matters,
    selectedMatterId = $bindable(null as string | null)
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string, skills: string[]) => void;
    streaming?: boolean;
    onstop?: () => void;
    skillAttach?: ReturnType<typeof createSkillAttach>;
    enhance?: ReturnType<typeof createEnhance>;
    matters?: MatterSummary[];
    selectedMatterId?: string | null;
  } = $props();
```

to:

```svelte
  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop,
    skillAttach,
    enhance,
    matters,
    selectedMatterId = $bindable(null as string | null),
    minimumTier = null as 1 | 2 | 3 | 4 | 5 | null
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string, skills: string[]) => void;
    streaming?: boolean;
    onstop?: () => void;
    skillAttach?: ReturnType<typeof createSkillAttach>;
    enhance?: ReturnType<typeof createEnhance>;
    matters?: MatterSummary[];
    selectedMatterId?: string | null;
    minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
  } = $props();
```

- [ ] **Step 2: Pass `minimumTier` through to `ModelPicker`**

Find this block:

```svelte
    <ModelPicker
      options={modelStore.options}
      selected={modelStore.selectedModel}
      error={modelStore.error}
      onselect={modelStore.setModel}
    />
```

Replace with:

```svelte
    <ModelPicker
      options={modelStore.options}
      selected={modelStore.selectedModel}
      error={modelStore.error}
      {minimumTier}
      onselect={modelStore.setModel}
    />
```

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: all green (existing Composer tests, if any, continue to pass; ModelPicker continues to receive `minimumTier=null` by default).

- [ ] **Step 4: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Composer.svelte
git commit -m "feat(p4-2): Composer threads minimumTier through to ModelPicker

Default null keeps the landing path inert; the chat page will pass the
matter's floor in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Chat page — `PrivilegedChip` + `minimumTier` to `Composer` + stale-selection guard

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

- [ ] **Step 1: Add the new imports**

In `src/routes/(app)/chats/[id]/+page.svelte`, find this line:

```svelte
  import MatterBadge from '$lib/matters/MatterBadge.svelte';
```

Replace with:

```svelte
  import MatterBadge from '$lib/matters/MatterBadge.svelte';
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';
  import { pickValidModel } from '$lib/models/pickValidModel';
```

- [ ] **Step 2: Add the stale-selection guard `$effect`**

Find the existing scroll `$effect` block:

```svelte
  // Auto-scroll to the newest content as messages/stream update.
  $effect(() => {
    const _len = chat.messages.length;
    const _last = chat.messages[chat.messages.length - 1]?.content;
    void _len;
    void _last;
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  });
```

Immediately after it, add:

```svelte
  // When the chat is scoped to a tier-floored matter, ensure the selected
  // model satisfies the floor. Only swaps when the chosen id differs, so
  // it doesn't loop on setModel updates.
  $effect(() => {
    const tier = data.matter?.minimumTier ?? null;
    if (tier == null || modelStore.options.length === 0) return;
    const chosen = pickValidModel(modelStore.options, modelStore.selectedModel, tier);
    if (chosen !== modelStore.selectedModel) modelStore.setModel(chosen);
  });
```

- [ ] **Step 3: Render the `PrivilegedChip` next to the matter badge**

Find this block in the header:

```svelte
    <div class="flex items-center justify-between border-b border-mlq-subtle px-6 py-2">
      <MatterBadge matter={data.matter} />
      <button
        type="button"
        onclick={() => (showReceipts = true)}
        class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
      >
        <ReceiptText size={14} /> Receipts
      </button>
    </div>
```

Replace with:

```svelte
    <div class="flex items-center justify-between border-b border-mlq-subtle px-6 py-2">
      <div class="flex items-center gap-2">
        <MatterBadge matter={data.matter} />
        {#if data.matter?.privileged}<PrivilegedChip />{/if}
      </div>
      <button
        type="button"
        onclick={() => (showReceipts = true)}
        class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
      >
        <ReceiptText size={14} /> Receipts
      </button>
    </div>
```

- [ ] **Step 4: Pass `minimumTier` to `Composer`**

Find this block:

```svelte
      <Composer
        bind:value={draftValue}
        onsubmit={submit}
        streaming={chat.status === 'streaming'}
        onstop={chat.stop}
        {skillAttach}
        {enhance}
      />
```

Replace with:

```svelte
      <Composer
        bind:value={draftValue}
        onsubmit={submit}
        streaming={chat.status === 'streaming'}
        onstop={chat.stop}
        {skillAttach}
        {enhance}
        minimumTier={data.matter?.minimumTier ?? null}
      />
```

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 7: ESLint clean on the touched file**

Run: `npx eslint src/routes/\(app\)/chats/\[id\]/+page.svelte`
Expected: no output / exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(app\)/chats/\[id\]/+page.svelte
git commit -m "feat(p4-2): chat header chip + ModelPicker floor + stale-selection guard

Renders PrivilegedChip next to MatterBadge when the matter is
privileged; passes the matter's minimumTier to Composer (and thus
ModelPicker) so sub-floor options render disabled with a floor note;
on options-load, resets a sub-floor selectedModel to the highest-tier
valid option (preferring 'smart') via the pure pickValidModel helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Live e2e — `tests/matter-privilege.spec.ts`

**Files:**
- Create: `tests/matter-privilege.spec.ts`

- [ ] **Step 1: Rebuild `donna-web` (required before any live e2e)**

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` is rebuilt and shows healthy in `docker compose ps`.

- [ ] **Step 2: Write the spec file**

Create `tests/matter-privilege.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
  return (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }).then((r) => r.json())).access_token;
}
async function api(tok: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${tok}`, ...(init.headers || {}) } });
}
async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('privileged matter shows the chip on list + detail + chat header and disables sub-floor models', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/matters');

  const unique = `E2E Privileged ${Date.now()}`;

  // Create a privileged matter with tier 4 via the UI form.
  await page.getByRole('button', { name: /new matter/i }).click();
  await page.getByLabel(/matter name/i).fill(unique);
  await page.getByLabel(/privileged matter/i).check();
  // Coupling: submit is disabled until a tier is selected.
  await expect(page.getByRole('button', { name: 'Create matter' })).toBeDisabled();
  await page.getByLabel(/minimum model tier/i).selectOption('4');
  await page.getByRole('button', { name: 'Create matter' }).click();

  // Detail page: heading + Privileged chip.
  await expect(page.getByRole('heading', { name: unique })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Privileged matter')).toBeVisible();

  // List page: privileged row carries the chip too.
  await page.goto('/matters');
  const row = page.getByRole('link', { name: new RegExp(unique) });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByLabel('Privileged matter')).toBeVisible();

  // Open the matter, start a chat in it.
  await row.click();
  await page.getByRole('button', { name: /new chat in this matter/i }).click();
  await page.waitForURL(/\/chats\//);

  // Chat header carries both the matter badge link AND the Privileged chip.
  await expect(page.getByRole('link', { name: unique })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Privileged matter')).toBeVisible();

  // ModelPicker shows the floor note and local models are disabled.
  await page.getByTestId('model-picker').click();
  await expect(page.getByText(/tier ≥ 4/)).toBeVisible();
  await expect(page.getByTestId('model-option-local')).toBeDisabled();
  // Cloud aliases (tier 4) remain enabled at floor 4.
  await expect(page.getByTestId('model-option-smart')).not.toBeDisabled();

  // Cleanup: archive the seeded matter.
  const tok = await token();
  // Detail URL is /matters/<id>; pull the id off the matter-badge link href.
  const projectHref = await page.getByRole('link', { name: unique }).first().getAttribute('href');
  const projectId = projectHref?.split('/').pop();
  if (projectId) await api(tok, `/projects/${projectId}`, { method: 'DELETE' });
});
```

- [ ] **Step 3: Run only this spec**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test tests/matter-privilege.spec.ts --reporter=line
```

Expected: 1 passed. If the first run hits a transient network/cold-start, re-run once.

- [ ] **Step 4: Confirm the seeded matter is gone**

Run:

```bash
TOK=$(curl -s "$DONNA_LQ_AI_API"/auth/login -H 'content-type: application/json' -d "{\"email\":\"$DONNA_E2E_EMAIL\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -s "$DONNA_LQ_AI_API"/projects -H "authorization: Bearer $TOK" | python3 -c 'import json,sys; print([m["name"] for m in json.load(sys.stdin) if m["name"].startswith("E2E Privileged ")])'
```

Expected: `[]` (no leftover `E2E Privileged …` matters).

- [ ] **Step 5: Commit**

```bash
git add tests/matter-privilege.spec.ts
git commit -m "test(p4-2): live e2e — privileged chip on list/detail/chat header + sub-floor model disable

Self-cleaning: creates a privileged matter with tier 4 via the UI,
asserts the chip + floor note + local-option disable, then archives
the seeded matter via the API so the shared admin account doesn't
accumulate seed data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Final quality bar pass + container rebuild

- [ ] **Step 1: Rebuild `donna-web` against the final code**

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` rebuilt, healthy in `docker compose ps`.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Full svelte-check pass**

Run: `npm run check`
Expected: exit 0 / "0 errors and 0 warnings" line at the end (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless and is not counted).

- [ ] **Step 4: ESLint clean on touched files**

Run:

```bash
npx eslint \
  src/lib/matters/types.ts \
  src/lib/matters/MatterForm.svelte \
  src/lib/matters/MatterForm.svelte.test.ts \
  src/lib/matters/PrivilegedChip.svelte \
  src/lib/matters/PrivilegedChip.svelte.test.ts \
  src/lib/models/pickValidModel.ts \
  src/lib/models/pickValidModel.test.ts \
  src/lib/components/Composer.svelte \
  src/lib/components/ModelPicker.svelte \
  src/lib/components/ModelPicker.svelte.test.ts \
  "src/routes/(app)/matters/+page.server.ts" \
  "src/routes/(app)/matters/+page.svelte" \
  "src/routes/(app)/matters/page.server.test.ts" \
  "src/routes/(app)/matters/[id]/+page.server.ts" \
  "src/routes/(app)/matters/[id]/+page.svelte" \
  "src/routes/(app)/matters/[id]/page.server.test.ts" \
  "src/routes/(app)/chats/[id]/matter.ts" \
  "src/routes/(app)/chats/[id]/matter.test.ts" \
  "src/routes/(app)/chats/[id]/+page.svelte" \
  tests/matter-privilege.spec.ts
```

Expected: no output / exit 0. (Repo-wide `npm run lint` is pre-existingly red — the gate is the *touched* files.)

- [ ] **Step 5: Re-run the full Playwright suite to catch regressions**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test --reporter=line
```

Expected: all specs green, including `tests/matter-privilege.spec.ts` and `tests/matters.spec.ts`. Note that `tests/citation-live.spec.ts` is timing-sensitive on embeddings — a single retry after a pass is acceptable per the dev-stack memory.

- [ ] **Step 6: If any fix-up commits were needed, commit them with a single message**

Run:

```bash
git status
# If working tree is clean, skip this step. Otherwise:
git add -A
git commit -m "chore(p4-2): final quality-bar fixups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Push and open the PR**

Run:

```bash
git push -u origin p4-2-privilege-tier
gh pr create --base main --title "P4-2: matter privilege + tier-floor" --body "$(cat <<'EOF'
Closes the P4-2 slice from the roadmap. Adds a `Privileged` flag and `minimum_inference_tier` floor to Donna's matter create/edit surface, with the coupled `privileged ⇒ tier` rule validated client-side (disable submit + inline hint) and the backend 422/400 mapped to the same friendly message as a fallback. A reusable `PrivilegedChip` in the P0-reserved `--color-mlq-privileged` token lights up the matters list row, the matter detail header, and the chat header. In-chat enforcement plumbs the matter's `minimumTier` through `Composer` to `ModelPicker`, which disables sub-floor model options and shows a one-line floor note; a pure `pickValidModel` helper guards against a stale `selectedModel` when entering a tier-floored chat.

Spec: `docs/superpowers/specs/2026-05-27-donna-p4-2-privilege-tier-design.md`
Plan: `docs/superpowers/plans/2026-05-27-donna-p4-2-privilege-tier.md`

Backend: no changes — `Project.privileged` + `minimum_inference_tier` are already in the generated contract (`vendor/lq-ai` @ `438198c`).

Quality bar: `npm run check` 0/0, ESLint clean on touched files, full vitest + Playwright suites green (live `tests/matter-privilege.spec.ts` self-cleans by archiving the seeded matter via the API).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `main`.

---

## Self-review — spec coverage check

| Spec section | Implemented in |
|---|---|
| §1 Goal | Tasks 4 (form), 6/8/11 (chips), 9/10/11 (in-chat enforcement) |
| §2 Backend contract | Tasks 5 (create body shape, 422 mapping), 7 (rename body shape with `null`, 400 mapping) |
| §3 Decisions Q1 (full in-chat enforcement) | Tasks 9, 10, 11 |
| §3 Decisions Q2 (numeric 1–5 select) | Task 4 (select renders 1–5 + None) |
| §3 Decisions Q3 (disable submit + inline hint) | Task 4 (`needsTier` → `canSubmit` + hint render) |
| §3 Decisions Q4 (distinct chip with Lock icon) | Task 3 (`PrivilegedChip`) |
| §4 Data model `MatterHeaderInfo` | Task 1 |
| §5 `MatterForm` extension | Task 4 |
| §6 Form actions (`create` + `rename`) | Tasks 5 and 7 |
| §7 `PrivilegedChip` + placements | Tasks 3 (component), 6 (list row), 8 (detail header), 11 (chat header) |
| §8 In-chat tier-floor enforcement | Tasks 9 (ModelPicker), 10 (Composer), 11 (chat page + stale-selection guard) |
| §9 File-level change map | All file paths above match §9 exactly |
| §10 Testing strategy | Each unit test bullet has a task (1, 2, 3, 4, 5, 7, 9); live e2e in Task 12; full quality-bar pass in Task 13 |
| §11 Risks & edges (`minimumTier=5` degenerate) | Task 9 test "disables every option when minimumTier=5" |
| §11 Risks & edges (stale model selection) | Task 2 (`pickValidModel`) + Task 11 (`$effect` guard, only swaps when chosen differs) |
| §11 Risks & edges (`resolveMatter` widening keeps `MatterBadge` working) | Task 1 (structural compatibility verified by `npm run check` step) |
| §11 Risks & edges (PATCH coupled rule) | Task 7 pre-check + 400 mapping; Task 4 client guard prevents the bypass case |
| §12 Out of scope | Not implemented (correctly) — admin tier-policy, context_md, files/KBs/skills, etc. |

No gaps. No placeholders. Type/property names are consistent across tasks: `MatterHeaderInfo.minimumTier` (camelCase) at the TS boundary, `minimum_inference_tier` (snake_case) on the wire and in form field names, `privileged` consistently as both.
