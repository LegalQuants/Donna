# Tabular Reviews — Slice B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/tabular` into an executions history index (builder relocated to `/tabular/new`), let users resume a past run from the list, fix the row-label UUID leak, and surface document-specific errors — shipping counts-only citations with a pin-gated cell→source nav follow-on.

**Architecture:** Pure SvelteKit + the lq-ai BFF. The history list SSR-loads `GET /api/v1/tabular/executions?limit=50` via `lqFetch` directly in `+page.server.ts` (Playbooks precedent — no client-side proxy). The builder pages move under `/tabular/new`. The row-label fix threads the execution's parallel `document_names`/`document_ids` into `parseTabularResults` as an optional lookup. Error specificity is a 404/422→400 remap in two existing proxies plus reading the server message in the builder. Citation nav is gated on an upstream pin bump and is the final, optional task.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript (0 `any`, 0 warnings), Vitest + @testing-library/svelte, Tailwind (`mlq-*` tokens).

**Spec:** `docs/superpowers/specs/2026-06-02-donna-p6-tabular-slice-b-design.md`

---

## File structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/routes/(app)/tabular/new/+page.server.ts` | Builder SSR load (moved) | 1 |
| `src/routes/(app)/tabular/new/+page.svelte` | Builder UI (moved) | 1, 4 |
| `src/routes/(app)/tabular/new/page.server.test.ts` | Builder load test (moved) | 1 |
| `src/routes/(app)/tabular/+page.server.ts` | History list SSR load (new) | 2 |
| `src/routes/(app)/tabular/+page.svelte` | History index UI (new) | 2 |
| `src/routes/(app)/tabular/page.server.test.ts` | History load test (new) | 2 |
| `src/routes/(app)/tabular/page.svelte.test.ts` | History empty-state/list test (new) | 2 |
| `src/lib/tabular/TabularExecutionRow.svelte` | One history-list row (new) | 2 |
| `src/lib/tabular/TabularExecutionRow.svelte.test.ts` | Row render test (new) | 2 |
| `src/lib/tabular/types.ts` | `TabularExecutionSummary` export + `parseTabularResults` fallback arg | 2, 3 |
| `src/lib/tabular/types.test.ts` | Fallback-map unit tests (extend) | 3 |
| `src/routes/(app)/tabular/[executionId]/+page.svelte` | Build + pass the name map | 3 |
| `src/routes/(app)/tabular/preview-cost/+server.ts` | 404/422→400 specific error | 4 |
| `src/routes/(app)/tabular/execute/+server.ts` | 404/422→400 specific error | 4 |
| `src/routes/(app)/tabular/preview-cost/server.test.ts` | Error-map test (extend) | 4 |
| `src/routes/(app)/tabular/execute/server.test.ts` | Error-map test (extend) | 4 |
| `src/lib/tabular/CellDetail.svelte` | Clickable citations (pin-gated) | 5 |

**Note on the gate (every task):** `npm run check` must report **0 errors and 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless). Run targeted vitest per task; a full `npx vitest run` (~873+ green) before the PR. No `any`, no non-null `!`.

---

## Task 1: Relocate the builder to `/tabular/new`

Moves the three builder files into a `new/` subdir and updates the two internal route strings, freeing `/tabular` for the history index. Behaviour is unchanged — this is a pure relocation.

**Files:**
- Move: `src/routes/(app)/tabular/+page.server.ts` → `src/routes/(app)/tabular/new/+page.server.ts`
- Move: `src/routes/(app)/tabular/+page.svelte` → `src/routes/(app)/tabular/new/+page.svelte`
- Move: `src/routes/(app)/tabular/page.server.test.ts` → `src/routes/(app)/tabular/new/page.server.test.ts`

- [ ] **Step 1: Move the three files with git (preserves history)**

```bash
cd /Users/kevinkeller/Code/Donna
mkdir -p "src/routes/(app)/tabular/new"
git mv "src/routes/(app)/tabular/+page.server.ts"   "src/routes/(app)/tabular/new/+page.server.ts"
git mv "src/routes/(app)/tabular/+page.svelte"      "src/routes/(app)/tabular/new/+page.svelte"
git mv "src/routes/(app)/tabular/page.server.test.ts" "src/routes/(app)/tabular/new/page.server.test.ts"
```

- [ ] **Step 2: Update the builder's two internal route strings**

In `src/routes/(app)/tabular/new/+page.svelte`, the `onmatter` function currently points at `/tabular`. Change it to `/tabular/new` (the post-submit `goto(\`/tabular/${exec.id}\`)` on line ~69 is the run page — leave it):

```svelte
  function onmatter(id: string | null) {
    goto(id ? `/tabular/new?matter=${id}` : '/tabular/new', { keepFocus: true, noScroll: true });
  }
```

- [ ] **Step 3: Update the moved test's request URLs for accuracy**

In `src/routes/(app)/tabular/new/page.server.test.ts`, update the `ev` helper's URL so it reflects the new route (the load function only reads `?matter=`, so this is cosmetic but keeps the test honest):

```ts
const ev = (matter?: string) =>
  ({ url: new URL(`http://x/tabular/new${matter ? `?matter=${matter}` : ''}`) }) as never;
```

- [ ] **Step 4: Run the moved test + typecheck**

Run: `npx vitest run "src/routes/(app)/tabular/new/page.server.test.ts"`
Expected: PASS (2 tests).
Run: `npm run check`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 5: Commit**

```bash
git add -A "src/routes/(app)/tabular"
git commit -m "refactor(tabular): relocate builder to /tabular/new

Frees /tabular for the executions history index (Slice B). Pure move +
internal route-string updates; behaviour unchanged."
```

---

## Task 2: Executions history index at `/tabular`

Builds the new landing page: SSR-load the summaries, render a "New review" CTA + a list of rows, with an empty state. Mirrors the Matters list row idiom and the Playbooks list page.

**Files:**
- Modify: `src/lib/tabular/types.ts` (add the summary type export)
- Create: `src/lib/tabular/TabularExecutionRow.svelte`
- Create: `src/lib/tabular/TabularExecutionRow.svelte.test.ts`
- Create: `src/routes/(app)/tabular/+page.server.ts`
- Create: `src/routes/(app)/tabular/page.server.test.ts`
- Create: `src/routes/(app)/tabular/+page.svelte`
- Create: `src/routes/(app)/tabular/page.svelte.test.ts`

- [ ] **Step 1: Export the summary type**

Add to `src/lib/tabular/types.ts`, directly after the existing `TabularExecution` exports (after line 8):

```ts
/** Compact projection from the list endpoint (no inlined results). */
export type TabularExecutionSummary = components['schemas']['TabularExecutionSummary'];
```

- [ ] **Step 2: Write the failing row-component test**

Create `src/lib/tabular/TabularExecutionRow.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TabularExecutionRow from './TabularExecutionRow.svelte';
import type { TabularExecutionSummary } from './types';

const summary: TabularExecutionSummary = {
  id: 'ex-1',
  status: 'completed',
  document_count: 3,
  column_count: 2,
  cost_estimate_usd: '0.12',
  created_at: '2026-05-01T10:00:00Z'
};

describe('TabularExecutionRow', () => {
  it('links to the run page and shows status, counts and estimate', () => {
    render(TabularExecutionRow, { props: { summary } as never });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/tabular/ex-1');
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/3 docs · 2 cols/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
  });

  it('handles singular counts and a missing estimate', () => {
    render(TabularExecutionRow, {
      props: { summary: { ...summary, document_count: 1, column_count: 1, cost_estimate_usd: null } } as never
    });
    expect(screen.getByText(/1 doc · 1 col/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/tabular/TabularExecutionRow.svelte.test.ts`
Expected: FAIL (cannot resolve `./TabularExecutionRow.svelte`).

- [ ] **Step 4: Implement the row component**

Create `src/lib/tabular/TabularExecutionRow.svelte`:

```svelte
<script lang="ts">
  import type { TabularExecutionSummary, ExecutionStatus } from './types';

  let { summary }: { summary: TabularExecutionSummary } = $props();

  const badge: Record<ExecutionStatus, string> = {
    completed: 'bg-mlq-success',
    failed: 'bg-mlq-error',
    cancelled: 'bg-mlq-muted',
    running: 'bg-mlq-workflow',
    pending: 'bg-mlq-workflow'
  };

  const docCols = $derived(
    `${summary.document_count} doc${summary.document_count === 1 ? '' : 's'} · ` +
      `${summary.column_count} col${summary.column_count === 1 ? '' : 's'}`
  );
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app execution link -->
<a href="/tabular/{summary.id}" class="flex items-center gap-3 px-4 py-3 hover:bg-mlq-surface-alt">
  <span class="inline-flex shrink-0 items-center gap-1.5 text-xs text-mlq-muted">
    <span class="inline-block h-2 w-2 rounded-full {badge[summary.status]}"></span>
    {summary.status}
  </span>
  <span class="min-w-0 truncate text-sm text-mlq-text">{docCols}</span>
  {#if summary.cost_estimate_usd}
    <span class="shrink-0 text-xs text-mlq-muted">est. ${summary.cost_estimate_usd}</span>
  {/if}
  <span class="ml-auto shrink-0 text-xs text-mlq-muted">{new Date(summary.created_at).toLocaleDateString()}</span>
</a>
```

- [ ] **Step 5: Run the row test — expect PASS**

Run: `npx vitest run src/lib/tabular/TabularExecutionRow.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing page-load test**

Create `src/routes/(app)/tabular/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const event = {} as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular history load', () => {
  it('requests the executions list and returns the summaries', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify([{ id: 'ex1', status: 'completed', document_count: 2, column_count: 1, created_at: '2026-05-01T00:00:00Z' }]), { status: 200 })
    );
    const out = (await load(event)) as { executions: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions?limit=50');
    expect(out.executions).toHaveLength(1);
    expect(out.executions[0].id).toBe('ex1');
  });

  it('throws 502 when the backend list call fails', async () => {
    lqFetch.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(load(event)).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `npx vitest run "src/routes/(app)/tabular/page.server.test.ts"`
Expected: FAIL (cannot resolve `./+page.server`).

- [ ] **Step 8: Implement the page load**

Create `src/routes/(app)/tabular/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { TabularExecutionSummary } from '$lib/tabular/types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, '/api/v1/tabular/executions?limit=50');
  if (!res.ok) throw error(502, 'Could not load your tabular reviews.');
  const executions = (await res.json()) as TabularExecutionSummary[];
  return { executions };
};
```

- [ ] **Step 9: Run the load test — expect PASS**

Run: `npx vitest run "src/routes/(app)/tabular/page.server.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 10: Write the failing page (empty-state + list) test**

Create `src/routes/(app)/tabular/page.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { TabularExecutionSummary } from '$lib/tabular/types';

const summary: TabularExecutionSummary = {
  id: 'ex-1', status: 'completed', document_count: 3, column_count: 2,
  cost_estimate_usd: '0.12', created_at: '2026-05-01T10:00:00Z'
};

describe('/tabular history page', () => {
  it('shows the empty state and a New review link when there are no executions', () => {
    render(Page, { props: { data: { executions: [] } } as never });
    expect(screen.getByText(/no tabular reviews yet/i)).toBeInTheDocument();
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/tabular/new');
    expect(link).toBeTruthy();
  });

  it('renders a row per execution', () => {
    render(Page, { props: { data: { executions: [summary] } } as never });
    expect(screen.getByText(/3 docs · 2 cols/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run it to confirm it fails**

Run: `npx vitest run "src/routes/(app)/tabular/page.svelte.test.ts"`
Expected: FAIL (cannot resolve `./+page.svelte`).

- [ ] **Step 12: Implement the history index page**

Create `src/routes/(app)/tabular/+page.svelte`:

```svelte
<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import TabularExecutionRow from '$lib/tabular/TabularExecutionRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Tabular reviews — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Tabular reviews</h1>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app new-review link -->
    <a href="/tabular/new" class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New review</a>
  </div>

  {#if data.executions.length === 0}
    <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-10 text-center">
      <p class="text-sm text-mlq-muted">No tabular reviews yet — start one to ask the same questions across many documents.</p>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app new-review link -->
      <a href="/tabular/new" class="mt-3 inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New review</a>
    </div>
  {:else}
    <ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
      {#each data.executions as execution (execution.id)}
        <li><TabularExecutionRow summary={execution} /></li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 13: Run the page test — expect PASS**

Run: `npx vitest run "src/routes/(app)/tabular/page.svelte.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 14: Typecheck + commit**

Run: `npm run check`
Expected: `0 errors and 0 warnings`.

```bash
git add -A "src/routes/(app)/tabular/+page.server.ts" "src/routes/(app)/tabular/+page.svelte" "src/routes/(app)/tabular/page.server.test.ts" "src/routes/(app)/tabular/page.svelte.test.ts" src/lib/tabular/TabularExecutionRow.svelte src/lib/tabular/TabularExecutionRow.svelte.test.ts src/lib/tabular/types.ts
git commit -m "feat(tabular): executions history index at /tabular

SSR-loads GET /tabular/executions?limit=50 and renders a list (status, doc/col
counts, estimate, date) with a New-review CTA and empty state. Resume = each row
links to /tabular/[id], which already polls/renders by id."
```

---

## Task 3: Row-label UUID fallback via parallel `document_names`

`parseTabularResults` currently leaks a raw `document_id` UUID as the row label when the `m3-c2-v1` payload omits a per-row name. The execution detail carries `document_names[]` parallel to `document_ids[]`; thread that in as an optional lookup so the parser prefers the real name → the parallel name → the UUID.

**Files:**
- Modify: `src/lib/tabular/types.ts` (`parseTabularResults` signature + fallback)
- Modify: `src/lib/tabular/types.test.ts` (new cases)
- Modify: `src/routes/(app)/tabular/[executionId]/+page.svelte` (build + pass the map)

- [ ] **Step 1: Write the failing fallback tests**

Add to `src/lib/tabular/types.test.ts` inside the `describe('parseTabularResults', …)` block:

```ts
  it('falls back to the parallel document_names map when a row name is missing', () => {
    const out = parseTabularResults(
      { rows: [{ document_id: 'd2', cells: {} }] },
      { d2: 'contract.pdf' }
    );
    expect(out?.rows[0].document_name).toBe('contract.pdf');
  });

  it('prefers the row name over the map, and the id when neither is present', () => {
    const out = parseTabularResults(
      { rows: [{ document_id: 'd1', document_name: 'real.pdf', cells: {} }, { document_id: 'd3', cells: {} }] },
      { d1: 'ignored.pdf' }
    );
    expect(out?.rows[0].document_name).toBe('real.pdf');
    expect(out?.rows[1].document_name).toBe('d3');
  });
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/lib/tabular/types.test.ts`
Expected: FAIL (the 2nd arg is ignored / `contract.pdf` not found).

- [ ] **Step 3: Add the optional fallback map to the parser**

In `src/lib/tabular/types.ts`, change the `parseTabularResults` signature and the `document_name` resolution. Replace the signature line (58) and the `push` block's `document_name` line (85):

```ts
export function parseTabularResults(
  raw: unknown,
  documentNamesById?: Record<string, string>
): TabularResults | null {
```

and replace the `document_name` field inside the `rows.push({ … })` with:

```ts
      document_name:
        typeof ro.document_name === 'string'
          ? ro.document_name
          : (documentNamesById?.[ro.document_id] ?? ro.document_id),
```

- [ ] **Step 4: Run the parser tests — expect PASS**

Run: `npx vitest run src/lib/tabular/types.test.ts`
Expected: PASS (all cases, including the pre-existing "defaults document_name to the id" — it passes no map).

- [ ] **Step 5: Build + pass the map in the run page**

In `src/routes/(app)/tabular/[executionId]/+page.svelte`, replace the `results` derivation (line ~16) so it builds a name map from the execution's parallel arrays and passes it:

```svelte
  const documentNamesById = $derived(
    Object.fromEntries(current.document_ids.map((id, i) => [id, current.document_names[i]]))
  );
  const results = $derived(parseTabularResults(current.results, documentNamesById));
```

- [ ] **Step 6: Typecheck + run the run-page test**

Run: `npm run check`
Expected: `0 errors and 0 warnings`.
Run: `npx vitest run "src/routes/(app)/tabular/[executionId]/page.server.test.ts"`
Expected: PASS (unchanged — server load untouched).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tabular/types.ts src/lib/tabular/types.test.ts "src/routes/(app)/tabular/[executionId]/+page.svelte"
git commit -m "fix(tabular): use parallel document_names for grid row labels

parseTabularResults now accepts an optional id->name map; the run page builds it
from the execution's document_ids/document_names so a missing per-row name no
longer leaks a raw UUID."
```

---

## Task 4: Document-specific error for invalid documents

The `preview-cost` and `execute` proxies map a backend 404/422 (invalid or not-owned `document_id`) to a generic 502. Remap 404/422 to a 400 with a document-specific message, and have the builder surface the server's message instead of its hard-coded string.

**Files:**
- Modify: `src/routes/(app)/tabular/preview-cost/+server.ts`
- Modify: `src/routes/(app)/tabular/execute/+server.ts`
- Modify: `src/routes/(app)/tabular/preview-cost/server.test.ts`
- Modify: `src/routes/(app)/tabular/execute/server.test.ts`
- Modify: `src/routes/(app)/tabular/new/+page.svelte` (read the server message)

- [ ] **Step 1: Write the failing proxy tests**

Add to `src/routes/(app)/tabular/execute/server.test.ts` inside the `describe('POST /tabular/execute', …)` block:

```ts
  it('maps a backend 404/422 (bad document) to a 400 with a document-specific message', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400, body: { message: expect.stringMatching(/document/i) } });
    lqFetch.mockResolvedValue(new Response('unprocessable', { status: 422 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400 });
  });
```

Add the analogous case to `src/routes/(app)/tabular/preview-cost/server.test.ts` (it already has the `POST` import and an `event(body)` helper — just add the case inside its `describe` block):

```ts
  it('maps a backend 404/422 (bad document) to a 400 with a document-specific message', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400, body: { message: expect.stringMatching(/document/i) } });
    lqFetch.mockResolvedValue(new Response('unprocessable', { status: 422 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400 });
  });
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run "src/routes/(app)/tabular/execute/server.test.ts" "src/routes/(app)/tabular/preview-cost/server.test.ts"`
Expected: FAIL (currently 404/422 → 502).

- [ ] **Step 3: Remap 404/422 in the execute proxy**

Replace the `if (!res.ok)` line in `src/routes/(app)/tabular/execute/+server.ts`:

```ts
  if (!res.ok) {
    if (res.status === 404 || res.status === 422)
      throw error(400, 'One or more selected documents could not be found or is not accessible. Re-check your document selection.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not start the review.');
  }
```

- [ ] **Step 4: Remap 404/422 in the preview-cost proxy**

Replace the `if (!res.ok)` line in `src/routes/(app)/tabular/preview-cost/+server.ts`:

```ts
  if (!res.ok) {
    if (res.status === 404 || res.status === 422)
      throw error(400, 'One or more selected documents could not be found or is not accessible. Re-check your document selection.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not estimate the review cost.');
  }
```

- [ ] **Step 5: Run the proxy tests — expect PASS**

Run: `npx vitest run "src/routes/(app)/tabular/execute/server.test.ts" "src/routes/(app)/tabular/preview-cost/server.test.ts"`
Expected: PASS (including the pre-existing 400→502 / 504-passthrough case in execute — note backend 400 still maps to 502; only 404/422 are now 400).

- [ ] **Step 6: Surface the server message in the builder**

In `src/routes/(app)/tabular/new/+page.svelte`, both `openPreview` and `confirmRun` currently set a hard-coded error string on `!res.ok`. Replace each `if (!res.ok) { … }` block so it reads the server's `{ message }` body, falling back to the existing copy.

In `openPreview`:

```svelte
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        error = body?.message ?? 'Could not estimate the cost. Please try again.';
        return;
      }
```

In `confirmRun`:

```svelte
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        error = body?.message ?? 'Could not start the review. Please try again.';
        busy = false;
        return;
      }
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run check`
Expected: `0 errors and 0 warnings`.

```bash
git add "src/routes/(app)/tabular/preview-cost/+server.ts" "src/routes/(app)/tabular/execute/+server.ts" "src/routes/(app)/tabular/preview-cost/server.test.ts" "src/routes/(app)/tabular/execute/server.test.ts" "src/routes/(app)/tabular/new/+page.svelte"
git commit -m "fix(tabular): document-specific error for invalid documents

preview-cost/execute proxies now map a backend 404/422 to a 400 with a
document-specific message; the builder surfaces the server message so a bad or
not-owned document_id no longer reads as a generic outage."
```

---

## Task 5 (PIN-GATED — do ONLY if the upstream SHA has landed): cell→source citation nav

**Gate:** Run this task **only** if the lq-ai backend citation-provenance request
(`docs/upstream-requests/lq-ai-tabular-cell-citation-provenance.md`) has merged and you have a pin SHA.
**If not, STOP here** — Slice B ships counts-only and this becomes fast-follow P6-B.1. Confirm the gate
before starting: a completed execution's `cell.citations[*]` must carry a non-null `source_file_id`.

**Wiring note:** the doc panel is **page-owned** (precedent: `src/routes/(app)/chats/[id]/+page.svelte`
does `const docPanel = createDocPanel()`, renders `{#if docPanel.open_}<DocumentPanel {docPanel} />`, and
threads `onactivatecitation={(c) => docPanel.open(c)}` down to citations). So the **run page** owns the
panel and a callback is threaded **run page → `TabularGrid` → `CellDetail`** — exactly how chat threads
it through `Message`. The cell's `citations` (from the bumped types) carry the navigable
`{ source_file_id, source_page, source_text }` that `docPanel.open(c)` consumes.

**Files:**
- Modify: `vendor/lq-ai` pin + `src/lib/api/backend.d.ts` (regenerate)
- Modify: `src/routes/(app)/tabular/[executionId]/+page.svelte` (own `createDocPanel` + render `DocumentPanel` + pass callback)
- Modify: `src/lib/tabular/TabularGrid.svelte` (accept + forward `onactivatecitation` to `CellDetail`)
- Modify: `src/lib/tabular/CellDetail.svelte` (clickable citations → callback)
- Create: `src/lib/tabular/CellDetail.svelte.test.ts`

- [ ] **Step 1: Bump the pin and regenerate types**

```bash
cd /Users/kevinkeller/Code/Donna/vendor/lq-ai && git fetch origin && git checkout <SHA> && cd -
# regenerate backend.d.ts via the repo's codegen (check package.json "scripts" for the openapi/types
# target, e.g. `npm run gen:api`); then:
npm run check
```

Expected: `0 errors and 0 warnings`. Confirm the tabular cell's `Citation` in `backend.d.ts` now includes
`source_file_id` / `source_page` / `source_text`. **If those fields are absent, STOP — the backend change
is incomplete; report back rather than faking nav.** Also re-read `src/lib/docpanel/docPanel.svelte.ts`
`open()` and the cell `citations` field name on the regenerated `TabularExecution.results` cell shape, and
update `parseTabularResults`/`TabularCell` to carry `citations` if the grid will read them off the typed
cell (today it only parses `cited_chunk_ids`).

- [ ] **Step 2: Thread the callback type through the components**

Decide the callback prop `onactivatecitation: (c: Citation) => void` (import `Citation` from
`src/lib/citations/types`, the type `docPanel.open` accepts). `CellDetail` gains it as an optional prop;
`TabularGrid` gains it and forwards to `CellDetail`; the run page passes `(c) => docPanel.open(c)`.

- [ ] **Step 3: Write the failing CellDetail test**

Create `src/lib/tabular/CellDetail.svelte.test.ts`: render `CellDetail` with a cell whose `citations`
carry a `source_file_id`, pass a spy `onactivatecitation`, click the first citation control, and assert
the spy was called with the citation. (Mirror `TabularGrid.svelte.test.ts`'s render style.)

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/tabular/CellDetail.svelte.test.ts`
Expected: FAIL (citations not clickable / prop not wired yet).

- [ ] **Step 5: Implement the three component edits**

`CellDetail.svelte`: replace the counts-only line (26) with the count as a heading + a list of buttons,
one per citation, each `onclick={() => onactivatecitation?.(c)}`. `TabularGrid.svelte`: accept
`onactivatecitation` and pass it to `<CellDetail … {onactivatecitation} />`. Run page
`[executionId]/+page.svelte`: `import { createDocPanel } from '$lib/docpanel/docPanel.svelte'` + the
`DocumentPanel` component, `const docPanel = createDocPanel()`, pass
`onactivatecitation={(c) => docPanel.open(c)}` to `<TabularGrid>`, and render
`{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}`. No `any`, no `!`.

- [ ] **Step 6: Run the test — expect PASS; full check**

Run: `npx vitest run src/lib/tabular/CellDetail.svelte.test.ts "src/routes/(app)/tabular"`
Expected: PASS.
Run: `npm run check`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 7: Commit**

```bash
git add vendor/lq-ai src/lib/api/backend.d.ts src/lib/tabular/CellDetail.svelte src/lib/tabular/CellDetail.svelte.test.ts src/lib/tabular/TabularGrid.svelte "src/routes/(app)/tabular/[executionId]/+page.svelte"
git commit -m "feat(tabular): open a cited source from a grid cell

Bumps the lq-ai pin to <SHA> (navigable tabular cell citations) and threads a
doc-panel open callback run page -> TabularGrid -> CellDetail so each citation
opens the cited document in the doc panel."
```

---

## Whole-branch verification (before the PR)

- [ ] **Full unit suite:** `npx vitest run` → ≥ ~873 green (the new tests add to that).
- [ ] **Typecheck/lint gate:** `npm run check` → `0 errors and 0 warnings`; `npx eslint .` clean.
- [ ] **Rebuild for live e2e:** `set -a; . ./.env; set +a; docker compose up -d --build donna-web`.
- [ ] **Live e2e (`.pdf` fixture):** visit `http://localhost:13002/tabular` → history list shows a prior
  run → click a row → run page renders the grid (or status) → "New review" → `/tabular/new` builder loads
  and can start a run. (Reuse a `/tmp/spike*.pdf`; if none, `cupsfilter /etc/hosts > /tmp/x.pdf`.)
- [ ] Then proceed to `superpowers:finishing-a-development-branch` → PR into `main`.
```
