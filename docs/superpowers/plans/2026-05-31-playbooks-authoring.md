# Playbooks Manual Authoring + Full Position Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable playbook editor that powers create-from-scratch (`POST /playbooks`), duplicate-any-playbook, edit-owned (`PATCH /playbooks/{id}`), and delete-owned (`DELETE`), and upgrades the easy-gen wizard's Step 3 from prune-only to full editing.

**Architecture:** A mode-agnostic `PlaybookEditor` component (header fields + accordion of `PositionEditor`s, each with a nested `FallbackTierEditor`) owns all form state and emits a `PlaybookCreate` via `onchange` — no I/O, no async controller. Three thin SvelteKit routes consume it (create `/playbooks/new/manual`, edit `/playbooks/[id]/edit`, and the existing wizard Step 3), persisting through per-route `?/save` form actions via `lqFetch`. Pure logic (blank/normalize/duplicate drafts, lines↔array, validity) lives in `editorDraft.ts`.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide.

**Spec:** `docs/superpowers/specs/2026-05-31-donna-playbooks-authoring-design.md`

**Conventions:** TDD; commit per task; push regularly. `npm run check` = 0 errors/0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless — signal = exit 0 + the "0 errors and 0 warnings" line). eslint clean (no `any`). In-app `<a href>`/`goto`/`replaceState` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- … -->`. Server-test pattern: `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`. Component-test: `@testing-library/svelte`. Modal a11y mirrors `src/routes/(app)/skills/[id]/+page.svelte` (`role="presentation"` backdrop + `role="dialog"` + Escape `$effect`). No `arq-worker` needed (authoring is synchronous).

**Verified facts (against `src/lib/api/backend.d.ts`, pin `438198c`):** `PlaybookCreate {name, contract_type, description?, version?, positions?: PositionCreate[]}`. `PlaybookUpdate` = same fields all-optional; **supplying `positions` atomically replaces the whole list**. `PositionCreate {issue, description?, standard_language, fallback_tiers?: FallbackTier[], redline_strategy?, severity_if_missing: 'critical'|'high'|'medium'|'low', detection_keywords?: string[], detection_examples?: string[], position_order?}`. `FallbackTier {rank, description, language}`. `Playbook` adds `id`, `created_by?: string | null`, `positions?: Position[]`. `locals.user` = `User | null`; `User.id: string`, `User.is_admin: boolean`. `lqFetch(event, path, init)` auto-sets JSON content-type for non-FormData bodies. **No `PositionUpdate`, no per-position endpoint, no playbook fork endpoint.**

---

## File Structure

| File | C/M/D | Responsibility |
|---|---|---|
| `src/lib/playbooks/editorDraft.ts` (+`.test.ts`) | C | pure: `blankPosition`, `blankDraft`, `normalizeDraft`, `duplicateDraft`, `linesToArray`, `arrayToLines`, `isValidDraft` |
| `src/lib/playbooks/editor/FallbackTierEditor.svelte` (+`.svelte.test.ts`) | C | fallback-tier rows, auto-rank |
| `src/lib/playbooks/editor/PositionEditor.svelte` (+`.svelte.test.ts`) | C | one position, all fields |
| `src/lib/playbooks/editor/PlaybookEditor.svelte` (+`.svelte.test.ts`) | C | header + accordion + add/remove/reorder → emits `PlaybookCreate` |
| `src/routes/(app)/playbooks/new/manual/+page.server.ts` (+`page.server.test.ts`) | C | create load (blank / `?from`) + `?/save` POST |
| `src/routes/(app)/playbooks/new/manual/+page.svelte` | C | create page (e2e-covered) |
| `src/routes/(app)/playbooks/[id]/edit/+page.server.ts` (+`page.server.test.ts`) | C | edit load (owner-gated) + `?/save` PATCH |
| `src/routes/(app)/playbooks/[id]/edit/+page.svelte` | C | edit page (e2e-covered) |
| `src/routes/(app)/playbooks/[id]/+page.server.ts` (+`page.server.test.ts`) | M | add `isOwner`; `?/delete` action |
| `src/routes/(app)/playbooks/[id]/+page.svelte` (+`page.svelte.test.ts`) | M | Edit/Delete (owner) + Duplicate (all) + delete-confirm modal |
| `src/routes/(app)/playbooks/+page.svelte` (+`page.svelte.test.ts`) | M | "+ New playbook" → popover chooser |
| `src/routes/(app)/playbooks/new/+page.svelte` | M | Step 3: `DraftReview` → `PlaybookEditor` |
| `src/lib/playbooks/DraftReview.svelte` (+`.svelte.test.ts`) | D | removed (absorbed by `PlaybookEditor`) |
| `tests/playbooks-easy-gen.spec.ts` | M | update "New playbook" popover navigation |
| `tests/playbooks-authoring.spec.ts` | C | live e2e |

---

## Task 1: editorDraft pure helpers

**Files:** Create `src/lib/playbooks/editorDraft.ts`, `src/lib/playbooks/editorDraft.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/editorDraft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blankPosition, blankDraft, normalizeDraft, duplicateDraft, linesToArray, arrayToLines, isValidDraft } from './editorDraft';
import type { Playbook, PlaybookCreate } from './types';

describe('editorDraft', () => {
  it('blankDraft has empty header and one blank position', () => {
    const d = blankDraft();
    expect(d.name).toBe('');
    expect(d.version).toBe('1.0.0');
    expect(d.positions).toHaveLength(1);
    expect(d.positions![0].severity_if_missing).toBe('medium');
    expect(d.positions![0].fallback_tiers).toEqual([]);
  });

  it('linesToArray trims and drops blanks; arrayToLines joins', () => {
    expect(linesToArray('a\n\n  b \nc')).toEqual(['a', 'b', 'c']);
    expect(arrayToLines(['a', 'b'])).toBe('a\nb');
    expect(arrayToLines(undefined)).toBe('');
  });

  it('normalizeDraft maps a Playbook to an editable PlaybookCreate (sorted, arrays/strings defaulted, no ids)', () => {
    const pb = {
      id: 'pb1', name: 'NDA', contract_type: 'NDA', version: '2.0.0', created_by: 'u1', created_at: '', updated_at: '',
      positions: [
        { id: 'p2', issue: 'Term', standard_language: 'L2', severity_if_missing: 'low', position_order: 1 },
        { id: 'p1', issue: 'Confidentiality', standard_language: 'L1', severity_if_missing: 'high', position_order: 0, detection_keywords: ['x'] }
      ]
    } as unknown as Playbook;
    const d = normalizeDraft(pb);
    expect(d.name).toBe('NDA');
    expect(d.positions!.map((p) => p.issue)).toEqual(['Confidentiality', 'Term']); // sorted by order
    expect(d.positions!.map((p) => p.position_order)).toEqual([0, 1]); // reseated
    expect((d.positions![0] as Record<string, unknown>).id).toBeUndefined(); // id stripped
    expect(d.positions![0].fallback_tiers).toEqual([]); // defaulted
    expect(d.positions![0].detection_keywords).toEqual(['x']);
  });

  it('duplicateDraft prefixes the name with "Copy of"', () => {
    const pb = { id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', created_by: null, created_at: '', updated_at: '', positions: [] } as unknown as Playbook;
    expect(duplicateDraft(pb).name).toBe('Copy of NDA-Mutual');
  });

  it('isValidDraft requires name, contract_type, >=1 position with issue + standard_language', () => {
    const ok: PlaybookCreate = { name: 'N', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'I', standard_language: 'L', severity_if_missing: 'high' }] };
    expect(isValidDraft(ok)).toBe(true);
    expect(isValidDraft({ ...ok, name: ' ' })).toBe(false);
    expect(isValidDraft({ ...ok, positions: [] })).toBe(false);
    expect(isValidDraft({ ...ok, positions: [{ issue: '', standard_language: 'L', severity_if_missing: 'high' }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/playbooks/editorDraft.test.ts` (module not found).

- [ ] **Step 3: Implement** — `src/lib/playbooks/editorDraft.ts`:

```ts
import type { Playbook, PlaybookCreate, PositionCreate } from './types';

export function blankPosition(order = 0): PositionCreate {
  return {
    issue: '',
    description: '',
    standard_language: '',
    fallback_tiers: [],
    redline_strategy: '',
    severity_if_missing: 'medium',
    detection_keywords: [],
    detection_examples: [],
    position_order: order
  };
}

export function blankDraft(): PlaybookCreate {
  return { name: '', contract_type: '', description: '', version: '1.0.0', positions: [blankPosition(0)] };
}

/** Map a loaded Playbook (or a raw PlaybookCreate) to a clean, editable
 *  PlaybookCreate: positions sorted by order then reseated 0..n, server ids
 *  dropped, optional arrays/strings defaulted so the editor can bind safely. */
export function normalizeDraft(src: PlaybookCreate | Playbook): PlaybookCreate {
  const positions = [...(src.positions ?? [])]
    .sort((a, b) => (a.position_order ?? 0) - (b.position_order ?? 0))
    .map((p, i): PositionCreate => ({
      issue: p.issue,
      description: p.description ?? '',
      standard_language: p.standard_language,
      fallback_tiers: (p.fallback_tiers ?? []).map((t) => ({ rank: t.rank, description: t.description, language: t.language })),
      redline_strategy: p.redline_strategy ?? '',
      severity_if_missing: p.severity_if_missing,
      detection_keywords: [...(p.detection_keywords ?? [])],
      detection_examples: [...(p.detection_examples ?? [])],
      position_order: i
    }));
  return {
    name: src.name,
    contract_type: src.contract_type,
    description: src.description ?? '',
    version: src.version ?? '1.0.0',
    positions
  };
}

/** A create-draft prefilled from an existing playbook (Duplicate). */
export function duplicateDraft(src: Playbook): PlaybookCreate {
  return { ...normalizeDraft(src), name: `Copy of ${src.name}` };
}

export function linesToArray(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

export function arrayToLines(arr: string[] | undefined): string {
  return (arr ?? []).join('\n');
}

export function isValidDraft(d: PlaybookCreate): boolean {
  if (!d.name?.trim() || !d.contract_type?.trim()) return false;
  const positions = d.positions ?? [];
  if (positions.length === 0) return false;
  return positions.every((p) => !!p.issue?.trim() && !!p.standard_language?.trim() && !!p.severity_if_missing);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/playbooks/editorDraft.test.ts`. `npm run check` → 0/0; `npx eslint src/lib/playbooks/editorDraft.ts` → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/editorDraft.ts src/lib/playbooks/editorDraft.test.ts && git commit -m "feat(playbooks): editorDraft pure helpers (blank/normalize/duplicate/validity)"`

---

## Task 2: FallbackTierEditor

**Files:** Create `src/lib/playbooks/editor/FallbackTierEditor.svelte`, `src/lib/playbooks/editor/FallbackTierEditor.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/editor/FallbackTierEditor.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import FallbackTierEditor from './FallbackTierEditor.svelte';
import type { FallbackTier } from '../types';

// Wrapper drives the bindable `tiers` and exposes the latest value for assertions.
import Wrapper from './FallbackTierEditor.test.svelte';

describe('FallbackTierEditor', () => {
  it('adds a tier with the next rank', async () => {
    const seen: FallbackTier[][] = [];
    render(Wrapper, { props: { initial: [], onseen: (t: FallbackTier[]) => seen.push(t) } });
    await fireEvent.click(screen.getByRole('button', { name: /add fallback tier/i }));
    expect(seen.at(-1)).toEqual([{ rank: 1, description: '', language: '' }]);
  });

  it('removing the first of two tiers renumbers ranks to 1', async () => {
    const seen: FallbackTier[][] = [];
    render(Wrapper, {
      props: {
        initial: [{ rank: 1, description: 'a', language: 'LA' }, { rank: 2, description: 'b', language: 'LB' }],
        onseen: (t: FallbackTier[]) => seen.push(t)
      }
    });
    await fireEvent.click(screen.getAllByRole('button', { name: /remove tier/i })[0]);
    expect(seen.at(-1)).toEqual([{ rank: 1, description: 'b', language: 'LB' }]);
  });
});
```

- [ ] **Step 2: Create the test wrapper** — `src/lib/playbooks/editor/FallbackTierEditor.test.svelte` (binds `tiers` and reports changes; needed because the component uses `$bindable`):

```svelte
<script lang="ts">
  import FallbackTierEditor from './FallbackTierEditor.svelte';
  import type { FallbackTier } from '../types';
  let { initial, onseen }: { initial: FallbackTier[]; onseen: (t: FallbackTier[]) => void } = $props();
  let tiers = $state<FallbackTier[]>(initial);
  $effect(() => onseen(tiers));
</script>

<FallbackTierEditor bind:tiers />
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run src/lib/playbooks/editor/FallbackTierEditor.svelte.test.ts`.

- [ ] **Step 4: Implement** — `src/lib/playbooks/editor/FallbackTierEditor.svelte`:

```svelte
<script lang="ts">
  import type { FallbackTier } from '../types';

  let { tiers = $bindable<FallbackTier[]>([]) }: { tiers?: FallbackTier[] } = $props();

  function add() {
    tiers = [...tiers, { rank: tiers.length + 1, description: '', language: '' }];
  }
  function remove(i: number) {
    tiers = tiers.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, rank: idx + 1 }));
  }
</script>

<div class="space-y-2">
  {#each tiers as tier, i (i)}
    <div class="rounded-mlq-control border border-mlq-subtle p-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Tier {tier.rank}</span>
        <button type="button" onclick={() => remove(i)} aria-label={`Remove tier ${tier.rank}`} class="text-xs text-mlq-muted hover:text-mlq-error">Remove</button>
      </div>
      <input bind:value={tier.description} placeholder="When this tier applies (short label)" aria-label={`Tier ${tier.rank} description`}
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text" />
      <textarea bind:value={tier.language} rows="2" placeholder="Fallback clause language" aria-label={`Tier ${tier.rank} language`}
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text"></textarea>
    </div>
  {/each}
  <button type="button" onclick={add} class="text-xs text-mlq-workflow hover:underline">+ Add fallback tier</button>
</div>
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run src/lib/playbooks/editor/FallbackTierEditor.svelte.test.ts`. `npm run check` → 0/0; eslint on both `.svelte`+wrapper → 0.
- [ ] **Step 6: Commit** — `git add src/lib/playbooks/editor/FallbackTierEditor.svelte src/lib/playbooks/editor/FallbackTierEditor.svelte.test.ts src/lib/playbooks/editor/FallbackTierEditor.test.svelte && git commit -m "feat(playbooks): FallbackTierEditor (auto-ranked rows)"`

---

## Task 3: PositionEditor

**Files:** Create `src/lib/playbooks/editor/PositionEditor.svelte`, `src/lib/playbooks/editor/PositionEditor.svelte.test.ts`, `src/lib/playbooks/editor/PositionEditor.test.svelte`

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/editor/PositionEditor.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Wrapper from './PositionEditor.test.svelte';
import { blankPosition } from '../editorDraft';
import type { PositionCreate } from '../types';

function setup() {
  const seen: PositionCreate[] = [];
  render(Wrapper, { props: { initial: blankPosition(0), onseen: (p: PositionCreate) => seen.push(p) } });
  return seen;
}

describe('PositionEditor', () => {
  it('editing the issue emits the updated position', async () => {
    const seen = setup();
    await fireEvent.input(screen.getByLabelText(/^issue/i), { target: { value: 'Confidentiality' } });
    expect(seen.at(-1)!.issue).toBe('Confidentiality');
  });

  it('keywords textarea (one per line) becomes a string array', async () => {
    const seen = setup();
    await fireEvent.input(screen.getByLabelText(/detection keywords/i), { target: { value: 'confidential\n\nproprietary' } });
    expect(seen.at(-1)!.detection_keywords).toEqual(['confidential', 'proprietary']);
  });

  it('changing severity emits it', async () => {
    const seen = setup();
    await fireEvent.change(screen.getByLabelText(/severity/i), { target: { value: 'critical' } });
    expect(seen.at(-1)!.severity_if_missing).toBe('critical');
  });
});
```

- [ ] **Step 2: Create the test wrapper** — `src/lib/playbooks/editor/PositionEditor.test.svelte`:

```svelte
<script lang="ts">
  import PositionEditor from './PositionEditor.svelte';
  import type { PositionCreate } from '../types';
  let { initial, onseen }: { initial: PositionCreate; onseen: (p: PositionCreate) => void } = $props();
  let position = $state<PositionCreate>(initial);
  $effect(() => onseen($state.snapshot(position) as PositionCreate));
</script>

<PositionEditor bind:position />
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run src/lib/playbooks/editor/PositionEditor.svelte.test.ts`.

- [ ] **Step 4: Implement** — `src/lib/playbooks/editor/PositionEditor.svelte`:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PositionCreate } from '../types';
  import FallbackTierEditor from './FallbackTierEditor.svelte';
  import { arrayToLines, linesToArray } from '../editorDraft';

  let { position = $bindable() }: { position: PositionCreate } = $props();

  // Free-text line lists need local text state so typing a trailing newline
  // isn't stripped mid-edit; an effect syncs the parsed array back into the bound position.
  let keywordsText = $state(untrack(() => arrayToLines(position.detection_keywords)));
  let examplesText = $state(untrack(() => arrayToLines(position.detection_examples)));
  $effect(() => { position.detection_keywords = linesToArray(keywordsText); });
  $effect(() => { position.detection_examples = linesToArray(examplesText); });

  const fieldCls = 'mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text';
  const labelCls = 'block text-xs font-medium uppercase tracking-wide text-mlq-muted';
</script>

<div class="space-y-3">
  <label class={labelCls}>Issue
    <input bind:value={position.issue} class={fieldCls} />
  </label>
  <label class={labelCls}>Description
    <input bind:value={position.description} class={fieldCls} />
  </label>
  <label class={labelCls}>Standard language
    <textarea bind:value={position.standard_language} rows="4" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Severity if missing
    <select bind:value={position.severity_if_missing} class={fieldCls}>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
  </label>
  <label class={labelCls}>Redline strategy
    <textarea bind:value={position.redline_strategy} rows="2" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Detection keywords (one per line)
    <textarea bind:value={keywordsText} rows="3" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Detection examples (one per line)
    <textarea bind:value={examplesText} rows="3" class={fieldCls}></textarea>
  </label>
  <div class={labelCls}>Fallback tiers
    <div class="mt-1"><FallbackTierEditor bind:tiers={position.fallback_tiers} /></div>
  </div>
</div>
```

Note: `position.fallback_tiers` is always an array here — every draft passes through `normalizeDraft`/`blankPosition` (Task 1) which default it to `[]`.

- [ ] **Step 5: Run to verify it passes** — `npx vitest run src/lib/playbooks/editor/PositionEditor.svelte.test.ts`. `npm run check` → 0/0 (watch `state_referenced_locally` on `keywordsText`/`examplesText` — the `untrack` seeds avoid it); eslint → 0.
- [ ] **Step 6: Commit** — `git add src/lib/playbooks/editor/PositionEditor.svelte src/lib/playbooks/editor/PositionEditor.svelte.test.ts src/lib/playbooks/editor/PositionEditor.test.svelte && git commit -m "feat(playbooks): PositionEditor (all fields + line-list keywords/examples)"`

---

## Task 4: PlaybookEditor

**Files:** Create `src/lib/playbooks/editor/PlaybookEditor.svelte`, `src/lib/playbooks/editor/PlaybookEditor.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/editor/PlaybookEditor.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import PlaybookEditor from './PlaybookEditor.svelte';
import type { PlaybookCreate } from '../types';

const initial: PlaybookCreate = {
  name: 'NDA', contract_type: 'NDA', version: '1.0.0', description: '',
  positions: [
    { issue: 'Confidentiality', standard_language: 'L1', severity_if_missing: 'high', position_order: 0, fallback_tiers: [], detection_keywords: [], detection_examples: [] },
    { issue: 'Term', standard_language: 'L2', severity_if_missing: 'medium', position_order: 1, fallback_tiers: [], detection_keywords: [], detection_examples: [] }
  ]
};

describe('PlaybookEditor', () => {
  it('renders the name field and a summary per position', () => {
    render(PlaybookEditor, { props: { initial, onchange: vi.fn() } });
    expect((screen.getByLabelText(/playbook name/i) as HTMLInputElement).value).toBe('NDA');
    expect(screen.getByRole('button', { name: /Confidentiality/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Term/ })).toBeInTheDocument();
  });

  it('editing the name emits the updated PlaybookCreate', async () => {
    const onchange = vi.fn();
    render(PlaybookEditor, { props: { initial, onchange } });
    await fireEvent.input(screen.getByLabelText(/playbook name/i), { target: { value: 'My NDA' } });
    expect(onchange.mock.calls.at(-1)![0].name).toBe('My NDA');
  });

  it('Add position appends a blank position', async () => {
    const onchange = vi.fn();
    render(PlaybookEditor, { props: { initial, onchange } });
    await fireEvent.click(screen.getByRole('button', { name: /add position/i }));
    expect(onchange.mock.calls.at(-1)![0].positions).toHaveLength(3);
  });

  it('Remove drops a position', async () => {
    const onchange = vi.fn();
    render(PlaybookEditor, { props: { initial, onchange } });
    await fireEvent.click(screen.getAllByRole('button', { name: /remove position/i })[0]);
    const last = onchange.mock.calls.at(-1)![0];
    expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual(['Term']);
  });

  it('Move down swaps order and reseats position_order', async () => {
    const onchange = vi.fn();
    render(PlaybookEditor, { props: { initial, onchange } });
    await fireEvent.click(screen.getAllByRole('button', { name: /move .* down/i })[0]);
    const last = onchange.mock.calls.at(-1)![0];
    expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual(['Term', 'Confidentiality']);
    expect(last.positions.map((p: { position_order: number }) => p.position_order)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/playbooks/editor/PlaybookEditor.svelte.test.ts`.

- [ ] **Step 3: Implement** — `src/lib/playbooks/editor/PlaybookEditor.svelte`:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Playbook, PlaybookCreate, PositionCreate } from '../types';
  import PositionEditor from './PositionEditor.svelte';
  import SeverityBadge from '../SeverityBadge.svelte';
  import { normalizeDraft, blankPosition } from '../editorDraft';

  let { initial, onchange }: { initial: PlaybookCreate | Playbook; onchange: (value: PlaybookCreate) => void } = $props();

  let draft = $state<PlaybookCreate>(untrack(() => normalizeDraft(initial)));
  let expanded = $state<number | null>(0);

  function reseat() {
    draft.positions = (draft.positions ?? []).map((p, i) => ({ ...p, position_order: i }));
  }
  function addPosition() {
    const arr = draft.positions ?? [];
    draft.positions = [...arr, blankPosition(arr.length)];
    expanded = (draft.positions.length ?? 1) - 1;
  }
  function removePosition(i: number) {
    draft.positions = (draft.positions ?? []).filter((_, idx) => idx !== i);
    reseat();
    expanded = null;
  }
  function move(i: number, dir: -1 | 1) {
    const arr = [...(draft.positions ?? [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    draft.positions = arr;
    reseat();
    expanded = expanded === i ? j : expanded === j ? i : expanded;
  }
  function positionValid(p: PositionCreate) {
    return !!p.issue?.trim() && !!p.standard_language?.trim();
  }

  const fieldCls = 'mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text';
  const labelCls = 'block text-xs font-medium uppercase tracking-wide text-mlq-muted';

  $effect(() => onchange($state.snapshot(draft) as PlaybookCreate));
</script>

<div class="space-y-3">
  <div>
    <label for="pb-name" class={labelCls}>Playbook name</label>
    <input id="pb-name" bind:value={draft.name} class={fieldCls} />
  </div>
  <div class="flex gap-3">
    <div class="flex-1">
      <label for="pb-type" class={labelCls}>Contract type</label>
      <input id="pb-type" bind:value={draft.contract_type} class={fieldCls} />
    </div>
    <div class="w-32">
      <label for="pb-version" class={labelCls}>Version</label>
      <input id="pb-version" bind:value={draft.version} class={`${fieldCls} font-mono`} />
    </div>
  </div>
  <div>
    <label for="pb-desc" class={labelCls}>Description</label>
    <textarea id="pb-desc" bind:value={draft.description} rows="2" class={fieldCls}></textarea>
  </div>

  <p class="text-xs text-mlq-muted">{draft.positions?.length ?? 0} position{(draft.positions?.length ?? 0) === 1 ? '' : 's'}</p>
  <div class="space-y-2">
    {#each draft.positions ?? [] as position, i (i)}
      <div class="rounded-mlq-control border border-mlq-subtle">
        <div class="flex items-center gap-2 px-3 py-2">
          <button type="button" onclick={() => (expanded = expanded === i ? null : i)} aria-expanded={expanded === i}
            class="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span class="truncate font-serif text-mlq-strong">{position.issue || 'Untitled position'}</span>
            <SeverityBadge severity={position.severity_if_missing} />
            {#if !positionValid(position)}<span class="text-xs text-mlq-error">• incomplete</span>{/if}
          </button>
          <button type="button" onclick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${position.issue || 'position'} up`} class="px-1 text-mlq-muted disabled:opacity-30 hover:text-mlq-text">↑</button>
          <button type="button" onclick={() => move(i, 1)} disabled={i === (draft.positions?.length ?? 0) - 1} aria-label={`Move ${position.issue || 'position'} down`} class="px-1 text-mlq-muted disabled:opacity-30 hover:text-mlq-text">↓</button>
          <button type="button" onclick={() => removePosition(i)} aria-label={`Remove position ${position.issue || ''}`.trim()} class="px-1 text-xs text-mlq-muted hover:text-mlq-error">Remove</button>
        </div>
        {#if expanded === i}
          <div class="border-t border-mlq-subtle p-3"><PositionEditor bind:position={draft.positions![i]} /></div>
        {/if}
      </div>
    {/each}
    <button type="button" onclick={addPosition} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text hover:border-mlq-workflow">+ Add position</button>
  </div>
</div>
```

Note: the `aria-label={`Remove position ${position.issue || ''}`.trim()}` yields "Remove position" for blank issues — the test's `/remove position/i` matches. "Move … up/down" labels back the reorder tests.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/playbooks/editor/PlaybookEditor.svelte.test.ts`. `npm run check` → 0/0 (watch `state_referenced_locally`); eslint → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/editor/PlaybookEditor.svelte src/lib/playbooks/editor/PlaybookEditor.svelte.test.ts && git commit -m "feat(playbooks): PlaybookEditor (header + accordion + add/remove/reorder)"`

---

## Task 5: Create route — server load + save (POST)

**Files:** Create `src/routes/(app)/playbooks/new/manual/+page.server.ts`, `src/routes/(app)/playbooks/new/manual/page.server.test.ts`

- [ ] **Step 1: Write the failing test** — `src/routes/(app)/playbooks/new/manual/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const loadEv = (search = '') => ({ url: new URL(`http://x/playbooks/new/manual${search}`) }) as never;
const saveEv = (draft: unknown) => {
  const body = new URLSearchParams(); body.append('draft', JSON.stringify(draft));
  return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/new/manual load', () => {
  it('returns a blank draft with no ?from', async () => {
    const out = (await load(loadEv())) as { initial: { name: string; positions: unknown[] } };
    expect(out.initial.name).toBe('');
    expect(out.initial.positions).toHaveLength(1);
    expect(lqFetch).not.toHaveBeenCalled();
  });
  it('prefills a "Copy of" draft from ?from', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', created_by: null, positions: [{ id: 'p1', issue: 'X', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }] }), { status: 200 }));
    const out = (await load(loadEv('?from=pb1'))) as { initial: { name: string; positions: { issue: string }[] } };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(out.initial.name).toBe('Copy of NDA-Mutual');
    expect(out.initial.positions[0].issue).toBe('X');
  });
});

describe('/playbooks/new/manual ?/save', () => {
  it('POSTs the draft and redirects to the new playbook', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb9' }), { status: 201 }));
    const draft = { name: 'My NDA', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    await expect(actions.save(saveEv(draft))).rejects.toMatchObject({ status: 303, location: '/playbooks/pb9' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).name).toBe('My NDA');
  });
  it('fails when there are no positions', async () => {
    const r = await actions.save(saveEv({ name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [] }));
    expect(r).toMatchObject({ status: 400 });
  });
  it('maps a 422 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
    const draft = { name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    expect(await actions.save(saveEv(draft))).toMatchObject({ status: 422 });
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/playbooks/new/manual/page.server.test.ts"`.

- [ ] **Step 3: Implement** — `src/routes/(app)/playbooks/new/manual/+page.server.ts`:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { blankDraft, duplicateDraft } from '$lib/playbooks/editorDraft';
import type { Playbook, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const from = event.url.searchParams.get('from');
  if (from) {
    const res = await lqFetch(event, `/api/v1/playbooks/${from}`);
    if (res.ok) {
      const src = (await res.json()) as Playbook;
      return { initial: duplicateDraft(src) };
    }
  }
  return { initial: blankDraft() };
};

export const actions: Actions = {
  save: async (event) => {
    const data = await event.request.formData();
    let draft: PlaybookCreate;
    try {
      draft = JSON.parse(String(data.get('draft') ?? '')) as PlaybookCreate;
    } catch {
      return fail(400, { error: 'Could not read the playbook.' });
    }
    if (!draft.name?.trim() || !draft.contract_type?.trim() || !(draft.positions?.length)) {
      return fail(400, { error: 'A name, contract type, and at least one position are required.' });
    }
    const res = await lqFetch(event, '/api/v1/playbooks', { method: 'POST', body: JSON.stringify(draft) });
    if (res.status === 422) return fail(422, { error: 'The backend rejected the playbook. Check the fields and try again.' });
    if (!res.ok) return fail(502, { error: 'Could not save the playbook.' });
    const created = (await res.json()) as { id: string };
    throw redirect(303, `/playbooks/${created.id}`);
  }
};
```

- [ ] **Step 4: Verify pass** (5 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/new/manual/+page.server.ts" "src/routes/(app)/playbooks/new/manual/page.server.test.ts" && git commit -m "feat(playbooks): manual create route — load (blank/duplicate) + save POST"`

---

## Task 6: Create route — page

**Files:** Create `src/routes/(app)/playbooks/new/manual/+page.svelte` (e2e-covered; no unit test)

- [ ] **Step 1: Implement** — `src/routes/(app)/playbooks/new/manual/+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
  import type { PlaybookCreate } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let edited = $state<PlaybookCreate | null>(null);
  const canSave = $derived(!!edited && !!edited.name?.trim() && !!edited.contract_type?.trim() && (edited.positions?.length ?? 0) > 0);
</script>

<svelte:head><title>New playbook — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">New playbook</h1>

  <div class="mt-6">
    <PlaybookEditor initial={data.initial} onchange={(v) => (edited = v)} />
    {#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
    <form method="POST" action="?/save" use:enhance class="mt-4">
      <input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
      <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Save playbook</button>
    </form>
  </div>
</div>
```

- [ ] **Step 2: Verify build** — `npm run check` → 0/0 (watch `state_referenced_locally` on `edited`); `npx eslint "src/routes/(app)/playbooks/new/manual/+page.svelte"` → 0.
- [ ] **Step 3: Commit** — `git add "src/routes/(app)/playbooks/new/manual/+page.svelte" && git commit -m "feat(playbooks): manual create page"`

---

## Task 7: Edit route — server load (owner-gated) + save (PATCH)

**Files:** Create `src/routes/(app)/playbooks/[id]/edit/+page.server.ts`, `src/routes/(app)/playbooks/[id]/edit/page.server.test.ts`

- [ ] **Step 1: Write the failing test** — `src/routes/(app)/playbooks/[id]/edit/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ownedPb = { id: 'pb1', name: 'Mine', contract_type: 'NDA', version: '1.0.0', created_by: 'u1', positions: [{ id: 'p1', issue: 'X', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }] };
const loadEv = (user: unknown, pb = ownedPb) => {
  lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(pb), { status: 200 }));
  return { params: { id: 'pb1' }, locals: { user } } as never;
};
const saveEv = (draft: unknown) => {
  const body = new URLSearchParams(); body.append('draft', JSON.stringify(draft));
  return { params: { id: 'pb1' }, request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id]/edit load', () => {
  it('returns the normalized draft for the owner', async () => {
    const out = (await load(loadEv({ id: 'u1', is_admin: false }))) as { initial: { name: string }; name: string };
    expect(out.initial.name).toBe('Mine');
    expect(out.name).toBe('Mine');
  });
  it('403s for a non-owner', async () => {
    await expect(load(loadEv({ id: 'other', is_admin: false }))).rejects.toMatchObject({ status: 403 });
  });
  it('403s for a built-in (created_by null) even for an admin', async () => {
    await expect(load(loadEv({ id: 'u1', is_admin: true }, { ...ownedPb, created_by: null }))).rejects.toMatchObject({ status: 403 });
  });
});

describe('/playbooks/[id]/edit ?/save', () => {
  it('PATCHes the full draft and redirects to detail', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const draft = { name: 'Mine v2', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    await expect(actions.save(saveEv(draft))).rejects.toMatchObject({ status: 303, location: '/playbooks/pb1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).positions).toHaveLength(1);
  });
  it('maps a 403 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
    const draft = { name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    expect(await actions.save(saveEv(draft))).toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/playbooks/[id]/edit/page.server.test.ts"`.

- [ ] **Step 3: Implement** — `src/routes/(app)/playbooks/[id]/edit/+page.server.ts`:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { normalizeDraft } from '$lib/playbooks/editorDraft';
import type { Playbook, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
  if (res.status === 404) throw error(404, 'Playbook not found.');
  if (!res.ok) throw error(502, 'Could not load this playbook.');
  const playbook = (await res.json()) as Playbook;
  const isOwner = !!playbook.created_by && playbook.created_by === event.locals?.user?.id;
  if (!isOwner) throw error(403, 'You can only edit playbooks you own.');
  return { id: playbook.id, name: playbook.name, initial: normalizeDraft(playbook) };
};

export const actions: Actions = {
  save: async (event) => {
    const data = await event.request.formData();
    let draft: PlaybookCreate;
    try {
      draft = JSON.parse(String(data.get('draft') ?? '')) as PlaybookCreate;
    } catch {
      return fail(400, { error: 'Could not read the playbook.' });
    }
    if (!draft.name?.trim() || !draft.contract_type?.trim() || !(draft.positions?.length)) {
      return fail(400, { error: 'A name, contract type, and at least one position are required.' });
    }
    const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(draft) });
    if (res.status === 403) return fail(403, { error: 'You can only edit playbooks you own.' });
    if (res.status === 422) return fail(422, { error: 'The backend rejected the playbook. Check the fields and try again.' });
    if (!res.ok) return fail(502, { error: 'Could not save the playbook.' });
    throw redirect(303, `/playbooks/${event.params.id}`);
  }
};
```

- [ ] **Step 4: Verify pass** (5 tests). `npm run check` → 0/0; eslint → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/[id]/edit/+page.server.ts" "src/routes/(app)/playbooks/[id]/edit/page.server.test.ts" && git commit -m "feat(playbooks): edit route — owner-gated load + save PATCH"`

---

## Task 8: Edit route — page

**Files:** Create `src/routes/(app)/playbooks/[id]/edit/+page.svelte` (e2e-covered; no unit test)

- [ ] **Step 1: Implement** — `src/routes/(app)/playbooks/[id]/edit/+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
  import type { PlaybookCreate } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let edited = $state<PlaybookCreate | null>(null);
  const canSave = $derived(!!edited && !!edited.name?.trim() && !!edited.contract_type?.trim() && (edited.positions?.length ?? 0) > 0);
</script>

<svelte:head><title>Edit {data.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks/{data.id}" class="text-xs text-mlq-muted hover:underline">← {data.name}</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">Edit playbook</h1>

  <div class="mt-6">
    <PlaybookEditor initial={data.initial} onchange={(v) => (edited = v)} />
    {#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
    <form method="POST" action="?/save" use:enhance class="mt-4">
      <input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
      <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Save changes</button>
    </form>
  </div>
</div>
```

- [ ] **Step 2: Verify build** — `npm run check` → 0/0; `npx eslint "src/routes/(app)/playbooks/[id]/edit/+page.svelte"` → 0.
- [ ] **Step 3: Commit** — `git add "src/routes/(app)/playbooks/[id]/edit/+page.svelte" && git commit -m "feat(playbooks): edit page"`

---

## Task 9: Detail page — ownership, delete, Edit/Delete/Duplicate buttons

**Files:** Modify `src/routes/(app)/playbooks/[id]/+page.server.ts`, `src/routes/(app)/playbooks/[id]/page.server.test.ts`, `src/routes/(app)/playbooks/[id]/+page.svelte`, `src/routes/(app)/playbooks/[id]/page.svelte.test.ts`

- [ ] **Step 1: Extend the server test** — append to `src/routes/(app)/playbooks/[id]/page.server.test.ts` (add `actions` to the import: `import { load, actions } from './+page.server';`), inside the file:

```ts
describe('/playbooks/[id] ownership + delete', () => {
  it('marks isOwner true when created_by matches the user', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', created_by: 'u1', positions: [] }), { status: 200 }));
    const out = (await load({ params: { id: 'pb1' }, locals: { user: { id: 'u1', is_admin: false } } } as never)) as { isOwner: boolean };
    expect(out.isOwner).toBe(true);
  });
  it('marks isOwner false for a built-in (created_by null)', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', created_by: null, positions: [] }), { status: 200 }));
    const out = (await load({ params: { id: 'pb1' }, locals: { user: { id: 'u1', is_admin: true } } } as never)) as { isOwner: boolean };
    expect(out.isOwner).toBe(false);
  });
  it('?/delete DELETEs and redirects to the index', async () => {
    lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(actions.delete({ params: { id: 'pb1' } } as never)).rejects.toMatchObject({ status: 303, location: '/playbooks' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });
  it('?/delete maps 403 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
    expect(await actions.delete({ params: { id: 'pb1' } } as never)).toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Verify the new tests fail** — `npx vitest run "src/routes/(app)/playbooks/[id]/page.server.test.ts"` (no `actions` export / no `isOwner`).

- [ ] **Step 3: Implement the server change** — replace `src/routes/(app)/playbooks/[id]/+page.server.ts` with:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { Playbook } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`);
  if (res.status === 404) throw error(404, 'Playbook not found.');
  if (!res.ok) throw error(502, 'Could not load this playbook.');
  const playbook = (await res.json()) as Playbook;
  return {
    playbook,
    isAdmin: event.locals?.user?.is_admin ?? false,
    isOwner: !!playbook.created_by && playbook.created_by === event.locals?.user?.id
  };
};

export const actions: Actions = {
  delete: async (event) => {
    const res = await lqFetch(event, `/api/v1/playbooks/${event.params.id}`, { method: 'DELETE' });
    if (res.status === 403) return fail(403, { error: 'You can only delete playbooks you own.' });
    if (!res.ok && res.status !== 404) return fail(502, { error: 'Could not delete the playbook.' });
    throw redirect(303, '/playbooks');
  }
};
```

- [ ] **Step 4: Run the server tests** — `npx vitest run "src/routes/(app)/playbooks/[id]/page.server.test.ts"` (existing + 4 new pass).

- [ ] **Step 5: Write the failing page test** — replace `src/routes/(app)/playbooks/[id]/page.svelte.test.ts` with (it currently asserts the read-only render; extend with the new buttons):

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const playbook = { id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', positions: [{ id: 'p1', issue: 'Confidentiality', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }] };

describe('/playbooks/[id] detail', () => {
  it('always shows a Duplicate link to the prefilled create route', () => {
    render(Page, { props: { data: { playbook, isAdmin: false, isOwner: false } } as never });
    expect(screen.getByRole('link', { name: /duplicate/i })).toHaveAttribute('href', '/playbooks/new/manual?from=pb1');
  });
  it('shows Edit + Delete only for the owner', () => {
    const { unmount } = render(Page, { props: { data: { playbook, isAdmin: false, isOwner: true } } as never });
    expect(screen.getByRole('link', { name: /^edit/i })).toHaveAttribute('href', '/playbooks/pb1/edit');
    expect(screen.getByRole('button', { name: /^delete/i })).toBeInTheDocument();
    unmount();
    render(Page, { props: { data: { playbook, isAdmin: false, isOwner: false } } as never });
    expect(screen.queryByRole('link', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Verify the page test fails** — `npx vitest run "src/routes/(app)/playbooks/[id]/page.svelte.test.ts"`.

- [ ] **Step 7: Implement the page change** — replace `src/routes/(app)/playbooks/[id]/+page.svelte` with:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import PositionCard from '$lib/playbooks/PositionCard.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const positions = $derived(
    [...(data.playbook.positions ?? [])].sort((a, b) => (a.position_order ?? 0) - (b.position_order ?? 0))
  );

  let confirmingDelete = $state(false);
  $effect(() => {
    if (!confirmingDelete) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') confirmingDelete = false; };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>

<svelte:head><title>{data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <div class="mt-2 flex items-start justify-between gap-3">
    <h1 class="font-serif text-2xl text-mlq-strong">{data.playbook.name}</h1>
    <div class="flex shrink-0 items-center gap-2">
      {#if data.isOwner}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app edit link -->
        <a href="/playbooks/{data.playbook.id}/edit" class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow">Edit</a>
        <button type="button" onclick={() => (confirmingDelete = true)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-error">Delete</button>
      {/if}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app duplicate link -->
      <a href="/playbooks/new/manual?from={data.playbook.id}" class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow">Duplicate</a>
    </div>
  </div>
  <div class="mt-1 text-sm text-mlq-muted">
    {data.playbook.contract_type}{#if data.playbook.version} · v{data.playbook.version}{/if} · {positions.length} position{positions.length === 1 ? '' : 's'}
  </div>
  {#if data.isAdmin}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app run link -->
    <a href="/playbooks/{data.playbook.id}/run" class="mt-3 inline-block rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface hover:opacity-90">Apply to a document</a>
  {:else}
    <p class="mt-3 text-xs text-mlq-muted">Running built-in playbooks requires an admin account in this version.</p>
  {/if}
  {#if data.playbook.description}
    <p class="mt-2 text-sm text-mlq-text">{data.playbook.description}</p>
  {/if}

  {#if positions.length === 0}
    <p class="mt-6 text-sm text-mlq-muted">No positions defined.</p>
  {:else}
    <div class="mt-6 space-y-3">
      {#each positions as position (position.id)}<PositionCard {position} />{/each}
    </div>
  {/if}
</div>

{#if confirmingDelete}
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => (confirmingDelete = false)}></div>
  <div role="dialog" aria-modal="true" aria-label="Delete playbook"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <h2 class="mb-2 text-sm font-medium text-mlq-text">Delete "{data.playbook.name}"?</h2>
    <p class="mb-4 text-xs text-mlq-muted">This permanently removes the playbook and its positions. This can't be undone.</p>
    <form method="POST" action="?/delete" use:enhance class="flex justify-end gap-2">
      <button type="button" onclick={() => (confirmingDelete = false)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">Cancel</button>
      <button type="submit" class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Delete</button>
    </form>
  </div>
{/if}
```

- [ ] **Step 8: Verify pass** — `npx vitest run "src/routes/(app)/playbooks/[id]/page.svelte.test.ts" "src/routes/(app)/playbooks/[id]/page.server.test.ts"`. `npm run check` → 0/0; eslint on both changed files → 0.
- [ ] **Step 9: Commit** — `git add "src/routes/(app)/playbooks/[id]/+page.server.ts" "src/routes/(app)/playbooks/[id]/+page.svelte" "src/routes/(app)/playbooks/[id]/page.server.test.ts" "src/routes/(app)/playbooks/[id]/page.svelte.test.ts" && git commit -m "feat(playbooks): detail Edit/Delete (owner) + Duplicate (all) + delete-confirm"`

---

## Task 10: Index "+ New playbook" → popover chooser

**Files:** Modify `src/routes/(app)/playbooks/+page.svelte`, `src/routes/(app)/playbooks/page.svelte.test.ts`, `tests/playbooks-easy-gen.spec.ts`

- [ ] **Step 1: Replace the index page test** — `src/routes/(app)/playbooks/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

describe('/playbooks index', () => {
  it('opening the New playbook menu reveals both create paths', async () => {
    render(Page, { props: { data: { playbooks: [] } } as never });
    await fireEvent.click(screen.getByRole('button', { name: /new playbook/i }));
    expect(screen.getByRole('link', { name: /generate from documents/i })).toHaveAttribute('href', '/playbooks/new');
    expect(screen.getByRole('link', { name: /start from scratch/i })).toHaveAttribute('href', '/playbooks/new/manual');
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run "src/routes/(app)/playbooks/page.svelte.test.ts"`.

- [ ] **Step 3: Implement** — replace the `<script>` + the header `<div class="mb-4 …">` block in `src/routes/(app)/playbooks/+page.svelte`. New `<script>`:

```svelte
<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import PlaybookRow from '$lib/playbooks/PlaybookRow.svelte';
  import { groupByContractFamily } from '$lib/playbooks/contractFamily';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const families = $derived(groupByContractFamily(data.playbooks));

  let menuOpen = $state(false);
  $effect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') menuOpen = false; };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>
```

New header block (replaces the existing `<div class="mb-4 flex items-center justify-between"> … </div>`):

```svelte
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
    <div class="relative">
      <button type="button" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}
        class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New playbook</button>
      {#if menuOpen}
        <div role="presentation" class="fixed inset-0 z-30" onclick={() => (menuOpen = false)}></div>
        <div class="absolute right-0 z-40 mt-1 w-56 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-1 shadow-xl">
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app generate link -->
          <a href="/playbooks/new" class="block rounded-mlq-control px-2.5 py-1.5 text-sm text-mlq-text hover:bg-mlq-subtle">Generate from documents</a>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app manual link -->
          <a href="/playbooks/new/manual" class="block rounded-mlq-control px-2.5 py-1.5 text-sm text-mlq-text hover:bg-mlq-subtle">Start from scratch</a>
        </div>
      {/if}
    </div>
  </div>
```

- [ ] **Step 4: Update the easy-gen e2e navigation** — in `tests/playbooks-easy-gen.spec.ts`, replace the line that clicks the New-playbook link:

```ts
  await page.getByRole('link', { name: /new playbook/i }).click();
```

with (open the popover, then pick Generate):

```ts
  await page.getByRole('button', { name: /new playbook/i }).click();
  await page.getByRole('link', { name: /generate from documents/i }).click();
```

- [ ] **Step 5: Verify pass** — `npx vitest run "src/routes/(app)/playbooks/page.svelte.test.ts"`. `npm run check` → 0/0; eslint on `+page.svelte` → 0. (The easy-gen e2e is re-run in Task 12's gate, not now.)
- [ ] **Step 6: Commit** — `git add "src/routes/(app)/playbooks/+page.svelte" "src/routes/(app)/playbooks/page.svelte.test.ts" "tests/playbooks-easy-gen.spec.ts" && git commit -m "feat(playbooks): New-playbook chooser (generate vs scratch)"`

---

## Task 11: Wizard Step 3 → PlaybookEditor (remove DraftReview)

**Files:** Modify `src/routes/(app)/playbooks/new/+page.svelte`; Delete `src/lib/playbooks/DraftReview.svelte`, `src/lib/playbooks/DraftReview.svelte.test.ts`

- [ ] **Step 1: Swap the component** — in `src/routes/(app)/playbooks/new/+page.svelte`, change the import:

```svelte
  import DraftReview from '$lib/playbooks/DraftReview.svelte';
```
to:
```svelte
  import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
```

and in the review block replace:

```svelte
      <DraftReview draft={flow.draft} onchange={(v) => (edited = v)} />
```
with:
```svelte
      <PlaybookEditor initial={flow.draft} onchange={(v) => (edited = v)} />
```

(Everything else in the wizard — the hidden `draft` field, `?/save`, `canSave` — is unchanged. `PlaybookEditor` emits the same `PlaybookCreate` contract `DraftReview` did.)

- [ ] **Step 2: Delete the obsolete component + its test**

```bash
git rm src/lib/playbooks/DraftReview.svelte src/lib/playbooks/DraftReview.svelte.test.ts
```

- [ ] **Step 3: Verify** — `npm run check` → 0/0 (no dangling `DraftReview` import anywhere: `grep -rn DraftReview src/` returns nothing). `npx vitest run src/lib/playbooks` → green. `npx eslint "src/routes/(app)/playbooks/new/+page.svelte"` → 0.
- [ ] **Step 4: Commit** — `git add "src/routes/(app)/playbooks/new/+page.svelte" && git commit -m "refactor(playbooks): wizard Step 3 uses PlaybookEditor; remove DraftReview"`

---

## Task 12: Live end-to-end test

**Files:** Create `tests/playbooks-authoring.spec.ts`

- [ ] **Step 1: Rebuild `donna-web`** (picks up all the new routes/components):

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

(No `arq-worker` needed — authoring is synchronous.)

- [ ] **Step 2: Write the e2e** — `tests/playbooks-authoring.spec.ts`:

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

async function deleteOwned(page: Page, id: string) {
  await page.goto(`/playbooks/${id}`);
  const del = page.getByRole('button', { name: /^delete/i });
  if (await del.count()) {
    await del.click();
    await page.getByRole('dialog').getByRole('button', { name: /^delete/i }).click();
    await page.waitForURL(/\/playbooks$/);
  }
}

test('duplicate a built-in, edit it, create from scratch, delete', async ({ page }) => {
  test.setTimeout(90_000);
  const created: string[] = [];
  const stamp = Date.now();

  try {
    await login(page);

    // 1. Duplicate the first built-in from its detail page.
    await page.goto('/playbooks');
    await page.locator('ul a[href^="/playbooks/"]').first().click();
    await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
    await page.getByRole('link', { name: /duplicate/i }).click();
    await expect(page).toHaveURL(/\/playbooks\/new\/manual\?from=/);
    await expect(page.getByLabel(/playbook name/i)).toHaveValue(/^Copy of /);
    const dupName = `Authoring E2E Dup ${stamp}`;
    await page.getByLabel(/playbook name/i).fill(dupName);
    await page.getByRole('button', { name: /save playbook/i }).click();
    await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
    created.push(page.url().split('/').pop()!);
    await expect(page.getByRole('heading', { level: 1, name: dupName })).toBeVisible();

    // 2. Edit it: rename, add a position, reorder, save.
    await page.getByRole('link', { name: /^edit/i }).click();
    await expect(page).toHaveURL(/\/edit$/);
    const editedName = `${dupName} v2`;
    await page.getByLabel(/playbook name/i).fill(editedName);
    await page.getByRole('button', { name: /add position/i }).click();
    // The new (last) position is auto-expanded — fill its required fields.
    await page.getByLabel(/^issue/i).last().fill('E2E Added Position');
    await page.getByLabel(/standard language/i).last().fill('Added standard language.');
    await page.getByRole('button', { name: /move E2E Added Position up/i }).click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
    await expect(page.getByRole('heading', { level: 1, name: editedName })).toBeVisible();
    await expect(page.getByText('E2E Added Position')).toBeVisible();

    // 3. Create from scratch via the chooser.
    await page.goto('/playbooks');
    await page.getByRole('button', { name: /new playbook/i }).click();
    await page.getByRole('link', { name: /start from scratch/i }).click();
    await expect(page).toHaveURL(/\/playbooks\/new\/manual$/);
    const scratchName = `Authoring E2E Scratch ${stamp}`;
    await page.getByLabel(/playbook name/i).fill(scratchName);
    await page.getByLabel(/contract type/i).fill('NDA');
    await page.getByLabel(/^issue/i).first().fill('Scratch Position');
    await page.getByLabel(/standard language/i).first().fill('Scratch language.');
    await page.getByRole('button', { name: /save playbook/i }).click();
    await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
    created.push(page.url().split('/').pop()!);

    // 4. Delete the scratch playbook via the confirm modal.
    await page.getByRole('button', { name: /^delete/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^delete/i }).click();
    await expect(page).toHaveURL(/\/playbooks$/);
    created.pop(); // deleted above
  } finally {
    for (const id of created) await deleteOwned(page, id);
  }
});
```

- [ ] **Step 3: Run the e2e** — `set -a; . ./.env; set +a; npx playwright test tests/playbooks-authoring.spec.ts`
Expected: PASS (synchronous; no LLM). Duplicate→edit→create→delete all land correctly; teardown removes any leftovers.

- [ ] **Step 4: Full gate** — `npm run check && npx vitest run` then `set -a; . ./.env; set +a; npx playwright test tests/playbooks-easy-gen.spec.ts tests/playbooks-authoring.spec.ts`
Expected: check 0/0; all vitest green; both playbook e2es pass (the easy-gen e2e now navigates via the popover from Task 10).

- [ ] **Step 5: Commit** — `git add tests/playbooks-authoring.spec.ts && git commit -m "test(playbooks): live e2e — manual authoring (duplicate/edit/create/delete)"`

---

## Self-Review (reconciled)

- **Spec coverage:** §3.1 components → Tasks 2 (FallbackTierEditor), 3 (PositionEditor), 4 (PlaybookEditor); pure helpers (§5 `editorDraft`) → Task 1; §3.2 create route → Tasks 5–6; edit route → Tasks 7–8; detail isOwner/delete/Duplicate → Task 9; chooser → Task 10; wizard Step-3 swap + DraftReview removal → Task 11; §6 testing → unit tests per component task + server tests in 5/7/9 + live e2e Task 12. §2 R1 (`locals.user.id`) confirmed present; R2 resolved as owner-only with built-ins read-only (Tasks 7 & 9 gate on `created_by === user.id`).
- **Type consistency:** `normalizeDraft`/`duplicateDraft`/`blankDraft`/`blankPosition`/`linesToArray`/`arrayToLines`/`isValidDraft` defined in Task 1, consumed in Tasks 3 (lines helpers), 4 (normalize/blankPosition), 5 (blank/duplicate), 7 (normalize). `PlaybookEditor` prop `{ initial, onchange }` matches its consumers in Tasks 6, 8, 11. `FallbackTierEditor` bindable `tiers` ↔ `PositionEditor`'s `bind:tiers={position.fallback_tiers}`. `PositionEditor` bindable `position` ↔ `PlaybookEditor`'s `bind:position={draft.positions![i]}`. Proxy-free; all server I/O via `lqFetch`. Save form contract (hidden `draft` JSON + `?/save`) identical across create/edit and the existing wizard.
- **No placeholders:** every code/command step is concrete.
- **Decisions locked from spec open-questions:** chooser = popover (keeps wizard at `/playbooks/new`; the merged easy-gen e2e is updated in Task 10/12); blank-draft starts with **one** empty position; keywords/examples = one-per-line textareas (TagInput rejected — it slugifies); built-ins read-only even for admins.
- **Known minor (carried):** `SeverityBadge` medium tint contrast (sub-AA) reused from slice A per the approved design.
