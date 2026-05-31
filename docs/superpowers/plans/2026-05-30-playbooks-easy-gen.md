# Playbooks Easy-Gen Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3-step wizard at `/playbooks/new` that generates a playbook from prior agreements: multi-select documents + contract type → async generation (polled) → review & prune the draft → save via `POST /playbooks`, landing on the new playbook's detail page.

**Architecture:** SSR `load` (matters + `?matter` files + `?generation` resume) + a `?/save` form action on the wizard route; two new JSON BFF proxies (`POST /playbooks/easy`, `GET /playbooks/easy/[generation_id]`); a client rune controller (`genFlow.svelte.ts`) that prepares uploads (→ ingest-poll → document_id), kicks off generation, polls to the draft, and exposes it for review. Reuses B's `/files` proxies + `runFlow` pattern, A's `PositionCard` (widened to also render a draft `PositionCreate`), and P4-1 `MatterPicker` / P4-3a `Dropzone`. No backend change.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, lucide.

**Spec:** `docs/superpowers/specs/2026-05-30-donna-playbooks-easy-gen-design.md`

**Conventions:** TDD; commit per task; push regularly. `npm run check` = 0 errors/0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless — signal = exit 0 + the "0 errors and 0 warnings" line). eslint clean (no `any`). In-app `<a href>`/`goto` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- … -->`. Server-test pattern: `// @vitest-environment node` + `vi.mock('$lib/server/lqClient', …)`. Component-test: `@testing-library/svelte`. **Dev/e2e: `arq-worker` must be running** (consumes `arq:m3a6`; easy-gen hangs `pending` without it).

**Spike facts (live `438198c`):** `document_ids` = File `document_id`s. `draft_playbook` = a `PlaybookCreate` (`{name, contract_type, version, description, positions: PositionCreate[]}`; ~15 positions for 2 NDAs; ~112 s). Easy-gen + save are NOT admin-gated. `EasyPlaybookGeneration` = `{id, status: 'pending'|'running'|'completed'|'error', draft_playbook?, error_message?, …}`.

---

## File Structure

| File | C/M | Responsibility |
|---|---|---|
| `src/lib/playbooks/types.ts` | M | Add `PlaybookCreate`, `PositionCreate`, `EasyPlaybookGeneration`, `DraftPlaybook` |
| `src/lib/playbooks/PositionCard.svelte` | M | Widen prop to `Position \| PositionCreate` (renders no `id`) |
| `src/routes/(app)/playbooks/easy/+server.ts` (+test) | C | easy-gen kickoff proxy (POST) |
| `src/routes/(app)/playbooks/easy/[generation_id]/+server.ts` (+test) | C | generation poll proxy (GET) |
| `src/lib/playbooks/genFlow.svelte.ts` (+test) | C | client generation state-machine |
| `src/lib/playbooks/GenDocumentPicker.svelte` (+test) | C | multi-select doc picker |
| `src/lib/playbooks/GenProgress.svelte` (+test) | C | step-2 progress + stuck |
| `src/lib/playbooks/DraftReview.svelte` (+test) | C | editable header + position keep-list → `PlaybookCreate` |
| `src/routes/(app)/playbooks/new/+page.server.ts` (+test) | C | wizard load + `?/save` action |
| `src/routes/(app)/playbooks/new/+page.svelte` | C | wizard composition (e2e-covered) |
| `src/routes/(app)/playbooks/+page.svelte` | M | add "+ New playbook" entry |
| `tests/playbooks-easy-gen.spec.ts` | C | live e2e |

`new/+page.svelte` is a thin composition covered by component tests + the live e2e (no separate page test).

---

## Task 1: Types + widen PositionCard

**Files:** Modify `src/lib/playbooks/types.ts`, `src/lib/playbooks/PositionCard.svelte`; Test: extend `src/lib/playbooks/PositionCard.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/playbooks/PositionCard.svelte.test.ts` (inside the existing `describe`):

```ts
  it('renders a draft PositionCreate (no id)', () => {
    const draftPos = {
      issue: 'Compelled Disclosure',
      description: 'Notice + cooperation on legal compulsion.',
      standard_language: 'The Receiving Party may disclose when legally compelled…',
      fallback_tiers: [],
      redline_strategy: undefined,
      severity_if_missing: 'high',
      detection_keywords: [],
      detection_examples: [],
      position_order: 0
    } as unknown as import('./types').PositionCreate;
    render(PositionCard, { props: { position: draftPos } });
    expect(screen.getByText('Compelled Disclosure')).toBeInTheDocument();
    expect(screen.getByText(/legally compelled/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/playbooks/PositionCard.svelte.test.ts` (type error: `PositionCreate` not exported / prop type rejects no-`id` object).

- [ ] **Step 3: Implement.** Append to `src/lib/playbooks/types.ts`:

```ts
export type PlaybookCreate = components['schemas']['PlaybookCreate'];
export type PositionCreate = components['schemas']['PositionCreate'];
export type EasyPlaybookGeneration = components['schemas']['EasyPlaybookGeneration'];

/** The `EasyPlaybookGeneration.draft_playbook` payload — a `PlaybookCreate`.
 *  Hand-aliased: the generated contract types it loosely as `{ [k]: unknown }`. */
export type DraftPlaybook = PlaybookCreate;
```

In `src/lib/playbooks/PositionCard.svelte`, widen the prop type so the read `Position` and a draft `PositionCreate` both render (the component reads no `id`):

```svelte
  import type { Position, PositionCreate } from './types';
  ...
  let { position }: { position: Position | PositionCreate } = $props();
```

(Change only the import + the prop type annotation; the template is unchanged — it already reads only fields common to both.)

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/playbooks/PositionCard.svelte.test.ts` (all existing + the new test). **`npm run check`** → 0/0.

- [ ] **Step 5: Commit** — `git add src/lib/playbooks/types.ts src/lib/playbooks/PositionCard.svelte src/lib/playbooks/PositionCard.svelte.test.ts && git commit -m "feat(playbooks): create/draft types + PositionCard renders PositionCreate"`

---

## Task 2: Easy-gen BFF proxies

**Files:** Create `src/routes/(app)/playbooks/easy/+server.ts` (+`server.test.ts`), `src/routes/(app)/playbooks/easy/[generation_id]/+server.ts` (+`server.test.ts`)

- [ ] **Step 1: Write the failing tests.**

`src/routes/(app)/playbooks/easy/server.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';
const ev = (body: unknown) => ({ request: new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /playbooks/easy', () => {
  it('forwards the body and returns the generation', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g1', status: 'pending' }), { status: 202 }));
    const res = await POST(ev({ document_ids: ['d1'], contract_type: 'NDA' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/easy');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ document_ids: ['d1'], contract_type: 'NDA' });
    expect((await res.json()).id).toBe('g1');
  });
  it('maps a 404 (unowned/missing docs) through', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
    await expect(POST(ev({ document_ids: ['d1'], contract_type: 'NDA' }))).rejects.toMatchObject({ status: 404 });
  });
});
```

`src/routes/(app)/playbooks/easy/[generation_id]/server.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (generation_id = 'g1') => ({ params: { generation_id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /playbooks/easy/[generation_id]', () => {
  it('passes through the generation JSON', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g1', status: 'completed' }), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/easy/g1');
    expect((await res.json()).status).toBe('completed');
  });
  it('maps a 500 to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Verify both fail** — `npx vitest run "src/routes/(app)/playbooks/easy/server.test.ts" "src/routes/(app)/playbooks/easy/[generation_id]/server.test.ts"`

- [ ] **Step 3: Implement.**

`src/routes/(app)/playbooks/easy/+server.ts`:
```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.text();
  const res = await lqFetch(event, '/api/v1/playbooks/easy', { method: 'POST', body });
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not start playbook generation.');
  return json(await res.json());
};
```

`src/routes/(app)/playbooks/easy/[generation_id]/+server.ts`:
```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/playbooks/easy/${event.params.generation_id}`);
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load the generation.');
  return json(await res.json());
};
```

- [ ] **Step 4: Verify both pass.** `npm run check` → 0/0; `npx eslint` on the two files → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/easy" && git commit -m "feat(playbooks): easy-gen BFF proxies (kickoff + poll)"`

---

## Task 3: Generation flow controller

**Files:** Create `src/lib/playbooks/genFlow.svelte.ts` (+`.svelte.test.ts`)

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/genFlow.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGenFlow } from './genFlow.svelte';

const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const completedDraft = {
  id: 'g1', status: 'completed',
  draft_playbook: { name: 'Generated NDA Playbook', contract_type: 'NDA', version: '1.0.0', description: 'd', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] }
};

describe('createGenFlow', () => {
  it('matter-only path: generate → poll → review with draft', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202)) // POST easy
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'running' }))       // poll 1
      .mockResolvedValueOnce(jsonResp(completedDraft));                       // poll 2
    vi.stubGlobal('fetch', fetchMock);
    const flow = createGenFlow({ pollMs: 10 });
    const done = flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(fetchMock.mock.calls[0][0]).toBe('/playbooks/easy');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).document_ids).toEqual(['d1']);
    expect(flow.phase).toBe('review');
    expect(flow.draft?.positions?.length).toBe(1);
  });

  it('upload path: upload → ingest poll → generate → poll → review', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'f1' }, 201))                                          // POST /files
      .mockResolvedValueOnce(jsonResp({ id: 'f1', ingestion_status: 'ready', document_id: 'd9' })) // poll files ready
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))                       // POST easy
      .mockResolvedValueOnce(jsonResp(completedDraft));                                            // poll gen
    vi.stubGlobal('fetch', fetchMock);
    const flow = createGenFlow({ pollMs: 10 });
    const file = new File([new Uint8Array([1])], 'c.pdf', { type: 'application/pdf' });
    const done = flow.generate([{ kind: 'upload', file }], 'NDA');
    await vi.advanceTimersByTimeAsync(60);
    await done;
    expect(fetchMock.mock.calls[0][0]).toBe('/files');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).document_ids).toEqual(['d9']);
    expect(flow.phase).toBe('review');
  });

  it('surfaces a generation error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'error', error_message: 'extraction failed' }));
    vi.stubGlobal('fetch', fetchMock);
    const flow = createGenFlow({ pollMs: 10 });
    const done = flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
    await vi.advanceTimersByTimeAsync(30);
    await done;
    expect(flow.phase).toBe('error');
    expect(flow.error).toMatch(/extraction failed/);
  });

  it('flags stuck after the threshold while still polling', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({ id: 'g1', status: 'pending' }, 202))
      .mockResolvedValue(jsonResp({ id: 'g1', status: 'running' }));
    vi.stubGlobal('fetch', fetchMock);
    const flow = createGenFlow({ pollMs: 10, stuckMs: 30 });
    flow.generate([{ kind: 'matter', documentId: 'd1' }], 'NDA');
    await vi.advanceTimersByTimeAsync(60);
    expect(flow.stuck).toBe(true);
    expect(flow.phase).toBe('generating');
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/playbooks/genFlow.svelte.test.ts`

- [ ] **Step 3: Implement** — `src/lib/playbooks/genFlow.svelte.ts`:

```ts
import type { DraftPlaybook, EasyPlaybookGeneration } from './types';

export type GenPhase = 'idle' | 'preparing' | 'generating' | 'review' | 'error';

export type DocSelection =
  | { kind: 'matter'; documentId: string }
  | { kind: 'upload'; file: File };

interface GenFlowOptions {
  pollMs?: number;
  stuckMs?: number;
  onGenerationStarted?: (generationId: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createGenFlow(opts: GenFlowOptions = {}) {
  const pollMs = opts.pollMs ?? 2000;
  const stuckMs = opts.stuckMs ?? 300_000;
  let phase = $state<GenPhase>('idle');
  let error = $state<string | null>(null);
  let stuck = $state(false);
  let draft = $state<DraftPlaybook | null>(null);

  function fail(msg: string) {
    error = msg;
    phase = 'error';
  }

  async function ingestUpload(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const up = await fetch('/files', { method: 'POST', body: fd });
    if (!up.ok) { fail(up.status === 413 ? `"${file.name}" is too large.` : `Could not upload "${file.name}".`); return null; }
    const { id } = (await up.json()) as { id: string };
    while (true) {
      const r = await fetch(`/files/${id}`);
      if (!r.ok) { fail('Could not check document status.'); return null; }
      const f = (await r.json()) as { ingestion_status?: string; ingestion_error?: string | null; document_id?: string | null };
      if (f.ingestion_status === 'ready' && f.document_id) return f.document_id;
      if (f.ingestion_status === 'failed') { fail(`"${file.name}" failed to process: ${f.ingestion_error ?? 'unknown error'}.`); return null; }
      await sleep(pollMs);
    }
  }

  async function pollGeneration(generationId: string): Promise<void> {
    phase = 'generating';
    let elapsed = 0;
    while (true) {
      const res = await fetch(`/playbooks/easy/${generationId}`);
      if (!res.ok) return fail('Lost contact with the generation. Please retry.');
      const gen = (await res.json()) as EasyPlaybookGeneration & { draft_playbook?: DraftPlaybook; error_message?: string | null };
      if (gen.status === 'completed') { draft = (gen.draft_playbook as DraftPlaybook) ?? null; phase = 'review'; return; }
      if (gen.status === 'error') return fail(gen.error_message ?? 'Playbook generation failed.');
      await sleep(pollMs);
      elapsed += pollMs;
      if (elapsed >= stuckMs) stuck = true;
    }
  }

  async function startGeneration(documentIds: string[], contractType: string): Promise<void> {
    phase = 'generating';
    const res = await fetch('/playbooks/easy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_ids: documentIds, contract_type: contractType, persist_documents_after_generation: true })
    });
    if (!res.ok) return fail('Could not start playbook generation.');
    const gen = (await res.json()) as EasyPlaybookGeneration;
    opts.onGenerationStarted?.(gen.id);
    await pollGeneration(gen.id);
  }

  async function generate(selections: DocSelection[], contractType: string): Promise<void> {
    error = null;
    stuck = false;
    draft = null;
    phase = 'preparing';
    const documentIds: string[] = [];
    for (const sel of selections) {
      if (sel.kind === 'matter') {
        documentIds.push(sel.documentId);
      } else {
        const id = await ingestUpload(sel.file);
        if (id === null) return; // ingestUpload already set the error
        documentIds.push(id);
      }
    }
    if (documentIds.length === 0) return fail('Select at least one document.');
    await startGeneration(documentIds, contractType);
  }

  async function resume(gen: EasyPlaybookGeneration & { draft_playbook?: DraftPlaybook; error_message?: string | null }): Promise<void> {
    if (gen.status === 'completed') { draft = (gen.draft_playbook as DraftPlaybook) ?? null; phase = 'review'; return; }
    if (gen.status === 'error') return fail(gen.error_message ?? 'Playbook generation failed.');
    await pollGeneration(gen.id);
  }

  return {
    get phase() { return phase; },
    get error() { return error; },
    get stuck() { return stuck; },
    get draft() { return draft; },
    generate,
    resume
  };
}
```

- [ ] **Step 4: Verify pass** (4 tests, no hangs — the stuck test does not await the never-terminating promise). `npm run check` → 0/0; `npx eslint src/lib/playbooks/genFlow.svelte.ts` → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/genFlow.svelte.ts src/lib/playbooks/genFlow.svelte.test.ts && git commit -m "feat(playbooks): genFlow generation controller"`

---

## Task 4: GenDocumentPicker (multi-select)

**Files:** Create `src/lib/playbooks/GenDocumentPicker.svelte` (+`.svelte.test.ts`)

Maintains a selection list and emits it via a bindable `selected`. Matter files are checkboxes (`?matter=` reflected to the URL like B's chooser); uploaded files accumulate.

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/GenDocumentPicker.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://x/playbooks/new') } }));

import GenDocumentPicker from './GenDocumentPicker.svelte';

function setup() {
  const selected: { kind: string }[] = [];
  const props = {
    matters: [{ id: 'm1', name: 'Acme' }],
    matterFiles: [{ id: 'f1', filename: 'nda.pdf', document_id: 'd1' }],
    selected,
    onchange: vi.fn((s: { kind: string }[]) => { selected.length = 0; selected.push(...s); })
  };
  return props;
}

describe('GenDocumentPicker', () => {
  it('checking a matter file adds it to the selection', async () => {
    const p = setup();
    render(GenDocumentPicker, { props: p });
    await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /nda\.pdf/i }));
    const last = p.onchange.mock.calls.at(-1)![0];
    expect(last).toEqual([{ kind: 'matter', documentId: 'd1', filename: 'nda.pdf' }]);
  });
  it('shows the selected count', async () => {
    const p = setup();
    render(GenDocumentPicker, { props: p });
    await fireEvent.click(screen.getByRole('tab', { name: /choose from a matter/i }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /nda\.pdf/i }));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/playbooks/GenDocumentPicker.svelte.test.ts`

- [ ] **Step 3: Implement** — `src/lib/playbooks/GenDocumentPicker.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Dropzone from '$lib/matters/files/Dropzone.svelte';
  import MatterPicker from '$lib/matters/MatterPicker.svelte';
  import type { DocSelection } from './genFlow.svelte';

  type MatterSummary = { id: string; name: string };
  type IngestedFile = { id: string; filename: string; document_id: string };
  type Selected = (DocSelection & { filename: string });

  let {
    matters,
    matterFiles,
    selected = $bindable<Selected[]>([]),
    onchange
  }: {
    matters: MatterSummary[];
    matterFiles: IngestedFile[];
    selected?: Selected[];
    onchange?: (s: Selected[]) => void;
  } = $props();

  let tab = $state<'upload' | 'matter'>('upload');
  let selectedMatter = $state<string | null>(page.url.searchParams.get('matter'));

  function emit(next: Selected[]) {
    selected = next;
    onchange?.(next);
  }
  function isPicked(documentId: string) {
    return selected.some((s) => s.kind === 'matter' && s.documentId === documentId);
  }
  function toggleMatterFile(f: IngestedFile) {
    if (isPicked(f.document_id)) {
      emit(selected.filter((s) => !(s.kind === 'matter' && s.documentId === f.document_id)));
    } else {
      emit([...selected, { kind: 'matter', documentId: f.document_id, filename: f.filename }]);
    }
  }
  function addUploads(files: File[]) {
    emit([...selected, ...files.map((file) => ({ kind: 'upload' as const, file, filename: file.name }))]);
  }
  function remove(i: number) {
    emit(selected.filter((_, idx) => idx !== i));
  }

  function syncMatterToUrl(id: string | null) {
    const url = new URL(page.url);
    if (id) url.searchParams.set('matter', id);
    else url.searchParams.delete('matter');
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- reactive ?matter sync, no anchor
    goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
  }
  $effect(() => {
    const current = page.url.searchParams.get('matter');
    if (selectedMatter === current) return;
    syncMatterToUrl(selectedMatter);
  });
</script>

<div role="tablist" class="flex gap-1 border-b border-mlq-subtle text-sm">
  <button role="tab" type="button" aria-selected={tab === 'upload'} onclick={() => (tab = 'upload')}
    class="px-3 py-2 {tab === 'upload' ? 'border-b-2 border-mlq-text font-medium text-mlq-text' : 'text-mlq-muted'}">Upload documents</button>
  <button role="tab" type="button" aria-selected={tab === 'matter'} onclick={() => (tab = 'matter')}
    class="px-3 py-2 {tab === 'matter' ? 'border-b-2 border-mlq-text font-medium text-mlq-text' : 'text-mlq-muted'}">Choose from a matter</button>
</div>

<div class="mt-3">
  {#if tab === 'upload'}
    <Dropzone onfiles={addUploads} />
  {:else}
    <MatterPicker {matters} bind:selectedId={selectedMatter} />
    <div class="mt-3">
      {#if !selectedMatter}
        <p class="text-sm text-mlq-muted">Pick a matter to see its documents.</p>
      {:else if matterFiles.length === 0}
        <p class="text-sm text-mlq-muted">No ingested documents in this matter yet.</p>
      {:else}
        <ul class="rounded-mlq-control border border-mlq-subtle">
          {#each matterFiles as f (f.id)}
            <li class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
              <input type="checkbox" id={`gf-${f.id}`} checked={isPicked(f.document_id)} onchange={() => toggleMatterFile(f)} />
              <label for={`gf-${f.id}`} class="truncate text-sm text-mlq-text">{f.filename}</label>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<div class="mt-3 text-xs text-mlq-muted">{selected.length} selected</div>
{#if selected.length > 0}
  <ul class="mt-1 space-y-1">
    {#each selected as s, i (s.filename + i)}
      <li class="flex items-center justify-between gap-2 text-sm text-mlq-text">
        <span class="truncate">{s.filename}</span>
        <button type="button" class="text-xs text-mlq-muted hover:underline" onclick={() => remove(i)} aria-label={`Remove ${s.filename}`}>Remove</button>
      </li>
    {/each}
  </ul>
{/if}
```

The checkbox's accessible name comes from its `<label for>` ("nda.pdf"), so `getByRole('checkbox', { name: /nda\.pdf/i })` matches.

- [ ] **Step 4: Verify pass** (2 tests). `npm run check` → 0/0; `npx eslint src/lib/playbooks/GenDocumentPicker.svelte` → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/GenDocumentPicker.svelte src/lib/playbooks/GenDocumentPicker.svelte.test.ts && git commit -m "feat(playbooks): GenDocumentPicker (multi-select)"`

---

## Task 5: GenProgress

**Files:** Create `src/lib/playbooks/GenProgress.svelte` (+`.svelte.test.ts`)

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/GenProgress.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GenProgress from './GenProgress.svelte';

describe('GenProgress', () => {
  it('shows a preparing message', () => {
    render(GenProgress, { props: { phase: 'preparing' } });
    expect(screen.getByText(/Preparing documents/i)).toBeInTheDocument();
  });
  it('shows a generating message and the stuck hint', () => {
    render(GenProgress, { props: { phase: 'generating', stuck: true } });
    expect(screen.getByText(/Generating/i)).toBeInTheDocument();
    expect(screen.getByText(/reload to resume/i)).toBeInTheDocument();
  });
  it('shows an error message', () => {
    render(GenProgress, { props: { phase: 'error', error: 'extraction failed' } });
    expect(screen.getByText(/extraction failed/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/GenProgress.svelte`:

```svelte
<script lang="ts">
  import type { GenPhase } from './genFlow.svelte';
  let { phase, error = null, stuck = false }: { phase: GenPhase; error?: string | null; stuck?: boolean } = $props();
</script>

{#if phase === 'error'}
  <p class="text-sm text-mlq-error">⚠ {error ?? 'Generation failed.'}</p>
{:else}
  <div class="flex items-center gap-2 text-sm text-mlq-text">
    <span class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle" aria-label="Working"></span>
    {#if phase === 'preparing'}
      <span>Preparing documents…</span>
    {:else}
      <span>Generating playbook from your documents…</span>
    {/if}
  </div>
  {#if stuck}
    <p class="mt-2 text-xs text-mlq-muted">Still generating — you can reload to resume.</p>
  {/if}
{/if}
```

- [ ] **Step 4: Verify pass** (3 tests).
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/GenProgress.svelte src/lib/playbooks/GenProgress.svelte.test.ts && git commit -m "feat(playbooks): GenProgress"`

---

## Task 6: DraftReview

**Files:** Create `src/lib/playbooks/DraftReview.svelte` (+`.svelte.test.ts`). Reuses `PositionCard`.

Owns editable name/contract_type/description + a per-position keep flag; emits the current `PlaybookCreate` via `onchange`.

- [ ] **Step 1: Write the failing test** — `src/lib/playbooks/DraftReview.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DraftReview from './DraftReview.svelte';
import type { DraftPlaybook } from './types';

const draft: DraftPlaybook = {
  name: 'Generated NDA Playbook',
  contract_type: 'NDA',
  version: '1.0.0',
  description: 'desc',
  positions: [
    { issue: 'Compelled Disclosure', standard_language: 'L1', severity_if_missing: 'high' },
    { issue: 'Term', standard_language: 'L2', severity_if_missing: 'medium' }
  ]
};

describe('DraftReview', () => {
  it('renders the name field and a card per position', () => {
    render(DraftReview, { props: { draft, onchange: vi.fn() } });
    expect((screen.getByLabelText(/playbook name/i) as HTMLInputElement).value).toBe('Generated NDA Playbook');
    expect(screen.getByText('Compelled Disclosure')).toBeInTheDocument();
    expect(screen.getByText('Term')).toBeInTheDocument();
  });
  it('unchecking a position drops it from the emitted PlaybookCreate', async () => {
    const onchange = vi.fn();
    render(DraftReview, { props: { draft, onchange } });
    await fireEvent.click(screen.getByRole('checkbox', { name: /keep Compelled Disclosure/i }));
    const last = onchange.mock.calls.at(-1)![0];
    expect(last.positions.map((p: { issue: string }) => p.issue)).toEqual(['Term']);
  });
  it('editing the name updates the emitted value', async () => {
    const onchange = vi.fn();
    render(DraftReview, { props: { draft, onchange } });
    await fireEvent.input(screen.getByLabelText(/playbook name/i), { target: { value: 'My NDA' } });
    expect(onchange.mock.calls.at(-1)![0].name).toBe('My NDA');
  });
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/lib/playbooks/DraftReview.svelte`:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import type { DraftPlaybook, PlaybookCreate, PositionCreate } from './types';
  import PositionCard from './PositionCard.svelte';

  let { draft, onchange }: { draft: DraftPlaybook; onchange: (value: PlaybookCreate) => void } = $props();

  const positions = untrack(() => draft.positions ?? []);
  let name = $state(untrack(() => draft.name));
  let contractType = $state(untrack(() => draft.contract_type));
  let description = $state(untrack(() => draft.description ?? ''));
  let kept = $state(positions.map(() => true));

  const value = $derived<PlaybookCreate>({
    name,
    contract_type: contractType,
    description,
    version: draft.version,
    positions: positions.filter((_: PositionCreate, i: number) => kept[i])
  });
  $effect(() => onchange(value));
</script>

<div class="space-y-3">
  <div>
    <label for="pb-name" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Playbook name</label>
    <input id="pb-name" bind:value={name} class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text" />
  </div>
  <div class="flex gap-3">
    <div class="flex-1">
      <label for="pb-type" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Contract type</label>
      <input id="pb-type" bind:value={contractType} class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text" />
    </div>
  </div>
  <div>
    <label for="pb-desc" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Description</label>
    <textarea id="pb-desc" bind:value={description} rows="2" class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text"></textarea>
  </div>

  <p class="text-xs text-mlq-muted">{kept.filter(Boolean).length} of {positions.length} positions kept — uncheck any to drop before saving.</p>
  <div class="space-y-2">
    {#each positions as position, i (i)}
      <div class="flex items-start gap-2 {kept[i] ? '' : 'opacity-50'}">
        <input type="checkbox" class="mt-4" bind:checked={kept[i]} aria-label={`keep ${position.issue}`} />
        <div class="min-w-0 flex-1"><PositionCard {position} /></div>
      </div>
    {/each}
  </div>
</div>
```

- [ ] **Step 4: Verify pass** (3 tests). `npm run check` → 0/0 (watch `state_referenced_locally` — the `untrack` seeds avoid it); `npx eslint src/lib/playbooks/DraftReview.svelte` → 0.
- [ ] **Step 5: Commit** — `git add src/lib/playbooks/DraftReview.svelte src/lib/playbooks/DraftReview.svelte.test.ts && git commit -m "feat(playbooks): DraftReview (edit header + prune positions)"`

---

## Task 7: Wizard server load + save action

**Files:** Create `src/routes/(app)/playbooks/new/+page.server.ts` (+`page.server.test.ts`)

- [ ] **Step 1: Write the failing test** — `src/routes/(app)/playbooks/new/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const loadEv = (search = '') => ({ url: new URL(`http://x/playbooks/new${search}`) }) as never;
const saveEv = (draft: unknown) => {
  const body = new URLSearchParams(); body.append('draft', JSON.stringify(draft));
  return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/new load', () => {
  it('returns the user matters', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 }));
    const out = (await load(loadEv())) as { matters: { id: string }[]; matterFiles: unknown[]; generation: unknown };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(out.matters[0].id).toBe('m1');
    expect(out.matterFiles).toEqual([]);
    expect(out.generation).toBeNull();
  });
  it('returns only ingested files for ?matter', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })) // matters
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm1', attached_file_ids: ['f1', 'f2'] }), { status: 200 })) // project
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', ingestion_status: 'ready', document_id: 'd1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f2', filename: 'b.pdf', ingestion_status: 'processing', document_id: null }), { status: 200 }));
    const out = (await load(loadEv('?matter=m1'))) as { matterFiles: { id: string }[] };
    expect(out.matterFiles.map((f) => f.id)).toEqual(['f1']);
  });
});

describe('/playbooks/new ?/save', () => {
  it('POSTs the draft to /playbooks and redirects to the new playbook', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb9' }), { status: 201 }));
    const draft = { name: 'My NDA', contract_type: 'NDA', version: '1.0.0', description: 'd', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    await expect(actions.save(saveEv(draft))).rejects.toMatchObject({ status: 303, location: '/playbooks/pb9' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).name).toBe('My NDA');
  });
  it('fails with a message when the draft has no positions', async () => {
    const r = await actions.save(saveEv({ name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [] }));
    expect(r).toMatchObject({ status: 400 });
  });
  it('maps a 422 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'bad' }), { status: 422 }));
    const draft = { name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    const r = await actions.save(saveEv(draft));
    expect(r).toMatchObject({ status: 422 });
  });
});
```

(`redirect(303,…)` throws in SvelteKit, hence `.rejects.toMatchObject`.)

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `src/routes/(app)/playbooks/new/+page.server.ts`:

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { EasyPlaybookGeneration, PlaybookCreate } from '$lib/playbooks/types';
import type { PageServerLoad } from './$types';

type MatterSummary = { id: string; name: string };
type IngestedFile = { id: string; filename: string; document_id: string };

export const load: PageServerLoad = async (event) => {
  const mRes = await lqFetch(event, '/api/v1/projects');
  const matters = (mRes.ok ? ((await mRes.json()) as MatterSummary[]) : []).map((m) => ({ id: m.id, name: m.name }));

  let matterFiles: IngestedFile[] = [];
  const matterId = event.url.searchParams.get('matter');
  if (matterId) {
    const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
    if (projRes.ok) {
      const proj = (await projRes.json()) as { attached_file_ids?: string[] };
      const files = await Promise.all(
        (proj.attached_file_ids ?? []).map(async (fid) => {
          const r = await lqFetch(event, `/api/v1/files/${fid}`);
          return r.ok ? ((await r.json()) as { id: string; filename: string; ingestion_status?: string; document_id?: string | null }) : null;
        })
      );
      matterFiles = files
        .filter((f): f is NonNullable<typeof f> => f !== null && f.ingestion_status === 'ready' && !!f.document_id)
        .map((f) => ({ id: f.id, filename: f.filename, document_id: f.document_id as string }));
    }
  }

  let generation: EasyPlaybookGeneration | null = null;
  const genId = event.url.searchParams.get('generation');
  if (genId) {
    const gRes = await lqFetch(event, `/api/v1/playbooks/easy/${genId}`);
    if (gRes.ok) generation = (await gRes.json()) as EasyPlaybookGeneration;
  }

  return { matters, matterFiles, generation };
};

export const actions: Actions = {
  save: async (event) => {
    const data = await event.request.formData();
    let draft: PlaybookCreate;
    try {
      draft = JSON.parse(String(data.get('draft') ?? '')) as PlaybookCreate;
    } catch {
      return fail(400, { error: 'Could not read the draft.' });
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

- [ ] **Step 4: Verify pass** (5 tests). `npm run check` → 0/0; `npx eslint` on the file → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/new/+page.server.ts" "src/routes/(app)/playbooks/new/page.server.test.ts" && git commit -m "feat(playbooks): wizard load + save action"`

---

## Task 8: Wizard page composition

**Files:** Create `src/routes/(app)/playbooks/new/+page.svelte` (e2e-covered; no unit test)

- [ ] **Step 1: Implement** — `src/routes/(app)/playbooks/new/+page.svelte`:

```svelte
<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import GenDocumentPicker from '$lib/playbooks/GenDocumentPicker.svelte';
  import GenProgress from '$lib/playbooks/GenProgress.svelte';
  import DraftReview from '$lib/playbooks/DraftReview.svelte';
  import { createGenFlow, type DocSelection } from '$lib/playbooks/genFlow.svelte';
  import type { PlaybookCreate } from '$lib/playbooks/types';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const flow = createGenFlow({
    onGenerationStarted: (id) => {
      const url = new URL(page.url);
      url.searchParams.set('generation', id);
      replaceState(`${url.pathname}${url.search}`, {});
    }
  });

  let selected = $state<(DocSelection & { filename: string })[]>([]);
  let contractType = $state('');
  let edited = $state<PlaybookCreate | null>(null);

  const canGenerate = $derived(selected.length > 0 && contractType.trim().length > 0);
  const canSave = $derived(!!edited && !!edited.name?.trim() && !!edited.contract_type?.trim() && (edited.positions?.length ?? 0) > 0);

  let resumed = false;
  $effect(() => {
    if (data.generation && !resumed) { resumed = true; flow.resume(data.generation); }
  });
</script>

<svelte:head><title>New playbook — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">Generate a playbook from documents</h1>

  {#if flow.phase === 'idle'}
    <div class="mt-6 space-y-4">
      <div>
        <label for="ct" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Contract type</label>
        <input id="ct" bind:value={contractType} list="ct-options" placeholder="NDA, MSA-SaaS, DPA-GDPR, …"
          class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text" />
        <datalist id="ct-options"><option value="NDA"></option><option value="MSA-SaaS"></option><option value="MSA-Commercial-Purchase"></option><option value="DPA-GDPR"></option></datalist>
      </div>
      <GenDocumentPicker matters={data.matters} matterFiles={data.matterFiles} bind:selected />
      <button type="button" disabled={!canGenerate} onclick={() => flow.generate(selected, contractType)}
        class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Generate playbook</button>
    </div>
  {:else if flow.phase !== 'review'}
    <div class="mt-6"><GenProgress phase={flow.phase} error={flow.error} stuck={flow.stuck} /></div>
  {/if}

  {#if flow.phase === 'review' && flow.draft}
    <div class="mt-6">
      <DraftReview draft={flow.draft} onchange={(v) => (edited = v)} />
      {#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
      <form method="POST" action="?/save" use:enhance class="mt-4">
        <input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
        <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40">Save playbook</button>
      </form>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify build** — `npm run check` → 0/0 (watch `state_referenced_locally` on `resumed`/`edited`; if flagged, adjust per the existing pattern). `npx eslint "src/routes/(app)/playbooks/new/+page.svelte"` → 0.
- [ ] **Step 3: Commit** — `git add "src/routes/(app)/playbooks/new/+page.svelte" && git commit -m "feat(playbooks): easy-gen wizard page"`

---

## Task 9: "+ New playbook" entry on the index

**Files:** Modify `src/routes/(app)/playbooks/+page.svelte` (+`page.svelte.test.ts` — create)

- [ ] **Step 1: Write the failing test** — create `src/routes/(app)/playbooks/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/playbooks index', () => {
  it('has a New playbook link to the wizard', () => {
    render(Page, { props: { data: { playbooks: [] } } as never });
    const link = screen.getByRole('link', { name: /new playbook/i });
    expect(link).toHaveAttribute('href', '/playbooks/new');
  });
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement.** In `src/routes/(app)/playbooks/+page.svelte`, replace the bare `<h1>Playbooks</h1>` header line with a header row that adds the link (keep the existing grouped list below unchanged):

```svelte
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app new-playbook link -->
    <a href="/playbooks/new" class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">+ New playbook</a>
  </div>
```

(If the current `<h1>` has `class="mb-4 …"`, drop the `mb-4` from the h1 since the wrapping div now owns the bottom margin.)

- [ ] **Step 4: Verify pass** — `npx vitest run "src/routes/(app)/playbooks/page.svelte.test.ts"` + the existing `page.server.test.ts` still green. `npm run check` → 0/0; eslint on `+page.svelte` → 0.
- [ ] **Step 5: Commit** — `git add "src/routes/(app)/playbooks/+page.svelte" "src/routes/(app)/playbooks/page.svelte.test.ts" && git commit -m "feat(playbooks): + New playbook entry on the index"`

---

## Task 10: Live end-to-end test

**Files:** Create `tests/playbooks-easy-gen.spec.ts`

- [ ] **Step 1: Ensure `arq-worker` is running + rebuild `donna-web`**
```bash
set -a; . ./.env; set +a
docker compose up -d arq-worker
docker compose up -d --build donna-web
```
(`arq-worker` is REQUIRED — easy-gen hangs `pending` without it.)

- [ ] **Step 2: Write the e2e** — `tests/playbooks-easy-gen.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const NDA = 'vendor/lq-ai/docs/quickstart/sample-ndas/nda-1-acme-beta.pdf';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('generate a playbook from a document, prune, and save', async ({ page }) => {
  test.setTimeout(240_000); // real ingest + generation worker

  await login(page);
  await page.goto('/playbooks');
  await page.getByRole('link', { name: /new playbook/i }).click();
  await expect(page).toHaveURL(/\/playbooks\/new/);

  await page.getByLabel(/contract type/i).fill('NDA');
  await page.getByTestId('dropzone-input').setInputFiles({
    name: 'nda-1-acme-beta.pdf',
    mimeType: 'application/pdf',
    buffer: readFileSync(NDA)
  });
  await expect(page.getByText(/1 selected/i)).toBeVisible();
  await page.getByRole('button', { name: /generate playbook/i }).click();

  // Review step: the draft name field + at least one position card.
  await expect(page.getByLabel(/playbook name/i)).toBeVisible({ timeout: 220_000 });
  // Prune one position (uncheck the first keep checkbox), then save.
  const firstKeep = page.getByRole('checkbox', { name: /^keep / }).first();
  await firstKeep.uncheck();
  await page.getByRole('button', { name: /save playbook/i }).click();

  // Lands on the saved playbook's detail page.
  await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e** — `npx playwright test tests/playbooks-easy-gen.spec.ts`
Expected: PASS — upload ingests, generation completes (~1–3 min), review shows the draft, prune + save lands on the new playbook detail. (Slow.)

- [ ] **Step 4: Full gate** — `npm run check && npx vitest run`
Expected: check 0/0; all vitest green.

- [ ] **Step 5: Commit** — `git add tests/playbooks-easy-gen.spec.ts && git commit -m "test(playbooks): live e2e — easy-gen wizard"`

---

## Self-Review notes (reconciled)

- **Spec coverage:** §3 wizard steps → Tasks 4 (picker), 5 (progress), 6 (review), 8 (page); §4 proxies → Task 2; §4 controller → Task 3; §4 load+save → Task 7; entry → Task 9; types → Task 1; §8 e2e → Task 10.
- **Type consistency:** `DocSelection`/`GenPhase` defined in `genFlow.svelte.ts` (Task 3), imported by GenDocumentPicker (4), GenProgress (5), the page (8). `DraftPlaybook`/`PlaybookCreate`/`PositionCreate`/`EasyPlaybookGeneration` in `types.ts` (Task 1) used throughout. Proxy paths (`/playbooks/easy`, `/playbooks/easy/[generation_id]`, `/files`, `/files/[id]`) match the controller's fetch URLs. `PositionCard` widened (Task 1) so DraftReview (6) can render `PositionCreate`.
- **No placeholders:** every code/command step is concrete.
- **Known minor (carried):** severity badge tints (amber `caveats`) reuse the same-hue-on-tint pattern flagged in earlier slices — acceptable per the approved design.
- **`arq-worker` dependency** is called out in the header and Task 10.
