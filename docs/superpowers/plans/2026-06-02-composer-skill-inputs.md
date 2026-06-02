# Composer Skill-Input Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect a skill's declared inputs in the composer and send them as `MessageCreate.skill_inputs` through both the chat and landing send paths.

**Architecture:** A new `SkillInputForm.svelte` renders one skill's inputs by type. `createSkillAttach` fetches each attached skill's inputs from a new `/skills/[id]/inputs` BFF proxy, holds per-skill values, and exposes `.skillInputs` + `.allRequiredFilled`. The composer renders a form per attached skill, gates Send on required inputs, and threads `skill_inputs` into `chatStream`/the landing draft cookie.

**Tech Stack:** SvelteKit (Svelte 5 runes, snippets), Tailwind (`mlq-*` tokens), Vitest + @testing-library/svelte, Playwright.

---

## File Structure

- **New:** `src/lib/skills/SkillInputForm.svelte` (+ `.svelte.test.ts`) — one skill's inputs by type.
- **New:** `src/routes/(app)/skills/[id]/inputs/+server.ts` (+ `server.test.ts`) — BFF proxy to `/api/v1/skills/{id}/inputs`.
- **New:** `src/routes/(app)/chats/[id]/draftSkillInputs.ts` (+ `draftSkillInputs.test.ts`) — parse the draft cookie/field.
- **Modify:** `src/lib/skills/types.ts` — re-export `SkillInputDef`/`SkillInputs`; extend `AttachedSkill`.
- **Modify:** `src/lib/skills/attach.svelte.ts` (+ `attach.svelte.test.ts`) — async `attach` fetch, values, getters.
- **Modify:** `src/lib/chat/chatStream.svelte.ts` (+ `chatStream.svelte.test.ts`) — `skill_inputs` body + 400 surface.
- **Modify:** `src/routes/(app)/chats/[id]/messages/+server.ts` (+ `server.test.ts`) — forward `skill_inputs`.
- **Modify:** `src/routes/(app)/+page.server.ts` — `?/start` reads field → cookie.
- **Modify:** `src/routes/(app)/chats/[id]/+page.server.ts` — read cookie → `draftSkillInputs`.
- **Modify:** `src/lib/components/Composer.svelte` (+ `Composer.svelte.test.ts`) — render forms, gating, `onsubmit` 4-arg.
- **Modify:** `src/routes/(app)/+page.svelte` — hidden `skill_inputs` field.
- **Modify:** `src/routes/(app)/chats/[id]/+page.svelte` — `submit` 4-arg + replay.
- **New:** `tests/skill-inputs.spec.ts` — live e2e.

**Shared "provided" semantics** (used in the component, the controller, and gating): a value is *provided* when — string: non-empty after trim; number: `Number.isFinite`; boolean: always (true/false); otherwise: `!= null`. `undefined` is never provided.

---

## Task 1: Types + `SkillInputForm` component

**Files:**
- Modify: `src/lib/skills/types.ts`
- Create: `src/lib/skills/SkillInputForm.svelte`
- Test: `src/lib/skills/SkillInputForm.svelte.test.ts`

- [ ] **Step 1: Add the generated-type re-exports**

In `src/lib/skills/types.ts`, add after the existing `import type { paths }` line:
```ts
import type { components } from '$lib/api/backend';

export type SkillInputDef = components['schemas']['SkillInputDef'];
export type SkillInputs = components['schemas']['SkillInputs'];
```
(Leave `SkillSuggestion` and `AttachedSkill` as-is for now — `AttachedSkill` is extended in Task 3.)

- [ ] **Step 2: Write the failing component tests**

Create `src/lib/skills/SkillInputForm.svelte.test.ts`:
```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SkillInputForm from './SkillInputForm.svelte';
import type { SkillInputDef } from './types';

const def = (over: Partial<SkillInputDef> & { name: string }): SkillInputDef =>
  ({ type: 'text', required: false, ...over }) as SkillInputDef;

describe('SkillInputForm', () => {
  it('renders a text input for a required text def and flags it when empty', () => {
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [def({ name: 'party', type: 'text', required: true })], optional: [], values: {}, onchange: vi.fn() } });
    expect(screen.getByLabelText('party')).toBeInTheDocument();
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it('renders a select for an enum def with its options', () => {
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [def({ name: 'jurisdiction', type: 'enum', required: true, enum: ['DE', 'NY'] })], optional: [], values: {}, onchange: vi.fn() } });
    const select = screen.getByLabelText('jurisdiction') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'DE' })).toBeInTheDocument();
  });

  it('emits a number for an integer def on input', async () => {
    const onchange = vi.fn();
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [def({ name: 'count', type: 'integer', required: true })], optional: [], values: {}, onchange } });
    await fireEvent.input(screen.getByLabelText('count'), { target: { value: '3' } });
    expect(onchange).toHaveBeenCalledWith('count', 3);
  });

  it('emits a boolean for a boolean def on toggle', async () => {
    const onchange = vi.fn();
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [], optional: [def({ name: 'redline', type: 'boolean', required: false })], values: {}, onchange } });
    await fireEvent.click(screen.getByRole('button', { name: /optional/i }));
    await fireEvent.click(screen.getByLabelText('redline'));
    expect(onchange).toHaveBeenCalledWith('redline', true);
  });

  it('hides optional inputs until the Optional group is expanded', async () => {
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [], optional: [def({ name: 'notes', type: 'text' })], values: {}, onchange: vi.fn() } });
    expect(screen.queryByLabelText('notes')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /optional \(1\)/i }));
    expect(screen.getByLabelText('notes')).toBeInTheDocument();
  });

  it('does not render a file-type input', () => {
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [def({ name: 'doc', type: 'file', required: true })], optional: [], values: {}, onchange: vi.fn() } });
    expect(screen.queryByLabelText('doc')).toBeNull();
  });

  it('pre-fills a text input from values', () => {
    render(SkillInputForm, { props: { skillTitle: 'NDA', required: [def({ name: 'party', type: 'text', required: true })], optional: [], values: { party: 'Acme' }, onchange: vi.fn() } });
    expect((screen.getByLabelText('party') as HTMLInputElement).value).toBe('Acme');
  });
});
```

- [ ] **Step 3: Run the tests to verify they FAIL**

Run: `npx vitest run src/lib/skills/SkillInputForm.svelte.test.ts`
Expected: FAIL — the component does not exist.

- [ ] **Step 4: Implement the component**

Create `src/lib/skills/SkillInputForm.svelte`:
```svelte
<script lang="ts">
  import type { SkillInputDef } from './types';

  let { skillTitle, required = [], optional = [], values = {}, onchange }: {
    skillTitle: string;
    required?: SkillInputDef[];
    optional?: SkillInputDef[];
    values?: Record<string, unknown>;
    onchange: (name: string, value: unknown) => void;
  } = $props();

  // file-type inputs are out of scope (P1.2 covers file_ids); never render them.
  const renderable = (defs: SkillInputDef[]) => defs.filter((d) => d.type !== 'file');
  const req = $derived(renderable(required));
  const opt = $derived(renderable(optional));

  let showOptional = $state(false);

  const provided = (v: unknown): boolean =>
    typeof v === 'string' ? v.trim().length > 0 : typeof v === 'number' ? Number.isFinite(v) : v != null;
</script>

<div class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface/50 p-2">
  <div class="mb-1 text-xs font-medium text-mlq-muted">{skillTitle} — inputs</div>

  {#each req as def (def.name)}
    <label class="mb-1.5 flex flex-col gap-0.5">
      <span class="text-xs text-mlq-muted">
        {def.description || def.name}
        {#if !provided(values[def.name])}<span class="text-mlq-error"> ⚠ required</span>{/if}
      </span>
      {@render widget(def)}
    </label>
  {/each}

  {#if opt.length}
    <button type="button" onclick={() => (showOptional = !showOptional)} class="mt-1 text-xs text-mlq-workflow hover:underline">
      {showOptional ? '▾' : '▸'} Optional ({opt.length})
    </button>
    {#if showOptional}
      {#each opt as def (def.name)}
        <label class="mb-1.5 mt-1 flex flex-col gap-0.5">
          <span class="text-xs text-mlq-muted">{def.description || def.name}</span>
          {@render widget(def)}
        </label>
      {/each}
    {/if}
  {/if}
</div>

{#snippet widget(def: SkillInputDef)}
  {#if def.type === 'enum' && def.enum}
    <select
      aria-label={def.name}
      value={(values[def.name] as string) ?? ''}
      onchange={(e) => onchange(def.name, e.currentTarget.value)}
      class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
    >
      <option value="" disabled>— select —</option>
      {#each def.enum as o (o)}<option value={o}>{o}</option>{/each}
    </select>
  {:else if def.type === 'boolean'}
    <input
      type="checkbox"
      aria-label={def.name}
      checked={values[def.name] === true}
      onchange={(e) => onchange(def.name, e.currentTarget.checked)}
      class="h-4 w-4"
    />
  {:else if def.type === 'integer'}
    <input
      type="number"
      aria-label={def.name}
      value={(values[def.name] as number | string) ?? ''}
      oninput={(e) => onchange(def.name, e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
      class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
    />
  {:else}
    <input
      type="text"
      aria-label={def.name}
      value={(values[def.name] as string) ?? ''}
      oninput={(e) => onchange(def.name, e.currentTarget.value)}
      class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
    />
  {/if}
{/snippet}
```

- [ ] **Step 5: Run the tests to verify they PASS**

Run: `npx vitest run src/lib/skills/SkillInputForm.svelte.test.ts`
Expected: PASS — all seven tests.

- [ ] **Step 6: Verify the gate**

Run: `npm run check`
Expected: 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). No `any`/`!`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/skills/types.ts src/lib/skills/SkillInputForm.svelte src/lib/skills/SkillInputForm.svelte.test.ts
git commit -m "feat(skills): SkillInputForm component + SkillInputDef/SkillInputs types"
```

---

## Task 2: `/skills/[id]/inputs` BFF proxy

**Files:**
- Create: `src/routes/(app)/skills/[id]/inputs/+server.ts`
- Test: `src/routes/(app)/skills/[id]/inputs/server.test.ts`

- [ ] **Step 1: Write the failing proxy tests**

Create `src/routes/(app)/skills/[id]/inputs/server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id: string) => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET skills/[id]/inputs', () => {
  it('forwards to the backend inputs endpoint and returns the JSON', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'nda-review', required: [], optional: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await GET(event('nda-review'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/nda-review/inputs');
    expect(await res.json()).toMatchObject({ name: 'nda-review' });
  });

  it('passes 503/504 through and maps other failures to 502', async () => {
    lqFetch.mockResolvedValue(new Response('x', { status: 503 }));
    await expect(GET(event('s'))).rejects.toMatchObject({ status: 503 });
    lqFetch.mockResolvedValue(new Response('x', { status: 500 }));
    await expect(GET(event('s'))).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/skills/[id]/inputs/server.test.ts"`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Implement the proxy**

Create `src/routes/(app)/skills/[id]/inputs/+server.ts`:
```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const name = event.params.id;
  const res = await lqFetch(event, `/api/v1/skills/${encodeURIComponent(name)}/inputs`);
  // Mirror the autocomplete proxy: pass the gateway's 503/504 through, map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load skill inputs.');
  return json(await res.json());
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/skills/[id]/inputs/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add "src/routes/(app)/skills/[id]/inputs/+server.ts" "src/routes/(app)/skills/[id]/inputs/server.test.ts"
git commit -m "feat(skills): BFF proxy for GET /skills/{id}/inputs"
```

---

## Task 3: Extend `createSkillAttach` (inputs fetch + values + gating)

**Files:**
- Modify: `src/lib/skills/types.ts` (extend `AttachedSkill`)
- Modify: `src/lib/skills/attach.svelte.ts`
- Test: `src/lib/skills/attach.svelte.test.ts`

- [ ] **Step 1: Extend `AttachedSkill`**

In `src/lib/skills/types.ts`, replace the `AttachedSkill` interface with:
```ts
/** A skill the user has attached to the composer (the name we send + a label + its inputs). */
export interface AttachedSkill {
  slug: string;
  title: string;
  inputsLoading: boolean;
  inputsError: boolean;
  required: SkillInputDef[];
  optional: SkillInputDef[];
  values: Record<string, unknown>;
}
```

- [ ] **Step 2: Update + extend the controller tests**

Replace the existing `attach adds {slug,title}…` and `remove drops by slug` tests in `src/lib/skills/attach.svelte.test.ts` and add new ones. The final file (keep the existing `starts empty`, `open()`, `search(q)`, `search error` tests unchanged) should contain these attach/inputs tests:
```ts
const inputsRes = (required: unknown[], optional: unknown[] = []) =>
  new Response(JSON.stringify({ name: 's', required, optional }), { status: 200 });

it('attach adds slug+title, dedupes by slug, fetches inputs, and drives names', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(inputsRes([], []));
  await s.attach(NDA, f);
  await s.attach(NDA, f); // dedupe → no second add
  await s.attach(NDA2, f);
  expect(s.attached.map((a) => ({ slug: a.slug, title: a.title }))).toEqual([
    { slug: 'nda-review', title: 'NDA Review' },
    { slug: 'nda-snapshot', title: 'NDA Snapshot' }
  ]);
  expect(s.names).toEqual(['nda-review', 'nda-snapshot']);
  expect(f.mock.calls[0][0]).toBe('/skills/nda-review/inputs');
});

it('remove drops by slug', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(inputsRes([]));
  await s.attach(NDA, f);
  await s.attach(NDA2, f);
  s.remove('nda-review');
  expect(s.names).toEqual(['nda-snapshot']);
});

it('attach exposes required/optional and seeds values from defaults', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(inputsRes(
    [{ name: 'jurisdiction', type: 'enum', required: true, enum: ['DE', 'NY'], default: 'DE' }],
    [{ name: 'notes', type: 'text', required: false }]
  ));
  await s.attach(NDA, f);
  const e = s.attached[0];
  expect(e.required.map((d) => d.name)).toEqual(['jurisdiction']);
  expect(e.optional.map((d) => d.name)).toEqual(['notes']);
  expect(e.values).toEqual({ jurisdiction: 'DE' });
});

it('allRequiredFilled flips as required values are set', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(inputsRes([{ name: 'party', type: 'text', required: true }]));
  await s.attach(NDA, f);
  expect(s.allRequiredFilled).toBe(false);
  s.setInputValue('nda-review', 'party', 'Acme');
  expect(s.allRequiredFilled).toBe(true);
});

it('skillInputs is keyed by slug, coerced, and omits empty optionals + valueless skills', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(inputsRes(
    [{ name: 'party', type: 'text', required: true }],
    [{ name: 'count', type: 'integer', required: false }]
  ));
  await s.attach(NDA, f);
  s.setInputValue('nda-review', 'party', 'Acme');
  s.setInputValue('nda-review', 'count', 3);
  // a second skill with no provided values must not appear
  const f2 = vi.fn().mockResolvedValue(inputsRes([], [{ name: 'x', type: 'text', required: false }]));
  await s.attach(NDA2, f2);
  expect(s.skillInputs).toEqual({ 'nda-review': { party: 'Acme', count: 3 } });
});

it('inputs fetch failure sets inputsError and does not block allRequiredFilled', async () => {
  const s = createSkillAttach();
  const f = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
  await s.attach(NDA, f);
  expect(s.attached[0].inputsError).toBe(true);
  expect(s.allRequiredFilled).toBe(true);
});
```

- [ ] **Step 3: Run to verify FAIL**

Run: `npx vitest run src/lib/skills/attach.svelte.test.ts`
Expected: FAIL — `attach` isn't async/fetching inputs, `setInputValue`/`skillInputs`/`allRequiredFilled` don't exist, `AttachedSkill` shape changed.

- [ ] **Step 4: Implement the controller changes**

Replace the contents of `src/lib/skills/attach.svelte.ts` with:
```ts
import type { SkillSuggestion, AttachedSkill, SkillInputs } from './types';

function provided(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return v != null;
}

export function createSkillAttach() {
  let attached = $state<AttachedSkill[]>([]);
  let results = $state<SkillSuggestion[]>([]);
  let loading = $state(false);
  let error = $state(false);

  async function fetchResults(q: string, fetchFn: typeof fetch) {
    loading = true;
    error = false;
    try {
      const res = await fetchFn(`/skills/autocomplete?q=${encodeURIComponent(q)}&limit=8`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { results: SkillSuggestion[] };
      results = body.results ?? [];
    } catch {
      error = true;
      results = [];
    } finally {
      loading = false;
    }
  }

  async function fetchInputs(slug: string, fetchFn: typeof fetch) {
    const entry = attached.find((a) => a.slug === slug);
    if (!entry) return;
    try {
      const res = await fetchFn(`/skills/${encodeURIComponent(slug)}/inputs`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SkillInputs;
      entry.required = body.required ?? [];
      entry.optional = body.optional ?? [];
      const seed: Record<string, unknown> = {};
      for (const def of [...entry.required, ...entry.optional]) {
        if (def.type === 'boolean') seed[def.name] = def.default ?? false;
        else if (def.default != null) seed[def.name] = def.default;
      }
      entry.values = seed;
    } catch {
      entry.inputsError = true;
    } finally {
      entry.inputsLoading = false;
    }
  }

  return {
    get attached() {
      return attached;
    },
    get results() {
      return results;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    /** Slugs to send as MessageCreate.skills. */
    get names() {
      return attached.map((s) => s.slug);
    },
    /** MessageCreate.skill_inputs: { [slug]: {…provided values} }, valueless skills omitted. */
    get skillInputs() {
      const out: Record<string, Record<string, unknown>> = {};
      for (const a of attached) {
        const vals: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(a.values)) if (provided(v)) vals[k] = v;
        if (Object.keys(vals).length) out[a.slug] = vals;
      }
      return out;
    },
    /** True when every attached skill's required inputs are all provided. */
    get allRequiredFilled() {
      return attached.every((a) => a.required.every((d) => provided(a.values[d.name])));
    },
    open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
    search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
    async attach(s: SkillSuggestion, fetchFn: typeof fetch = fetch) {
      if (attached.some((a) => a.slug === s.slug)) return;
      attached = [...attached, { slug: s.slug, title: s.title, inputsLoading: true, inputsError: false, required: [], optional: [], values: {} }];
      await fetchInputs(s.slug, fetchFn);
    },
    setInputValue(slug: string, name: string, value: unknown) {
      const entry = attached.find((a) => a.slug === slug);
      if (!entry) return;
      if (value === undefined) {
        const next = { ...entry.values };
        delete next[name];
        entry.values = next;
      } else {
        entry.values = { ...entry.values, [name]: value };
      }
    },
    remove(slug: string) {
      attached = attached.filter((a) => a.slug !== slug);
    }
  };
}
```

- [ ] **Step 5: Run to verify PASS**

Run: `npx vitest run src/lib/skills/attach.svelte.test.ts`
Expected: PASS — all tests (existing + new).

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → 0/0. (Note: `Composer.svelte` still calls `skillAttach.attach` synchronously via the SkillAttach `onattach` prop — that remains type-compatible since `attach` returns a promise the caller may ignore. The composer wiring is Task 7.)
```bash
git add src/lib/skills/types.ts src/lib/skills/attach.svelte.ts src/lib/skills/attach.svelte.test.ts
git commit -m "feat(skills): createSkillAttach fetches inputs, tracks values, exposes skillInputs + allRequiredFilled"
```

---

## Task 4: chatStream — `skill_inputs` in the body + 400 surface

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/chat/chatStream.svelte.test.ts` (it already defines `streamResponse` and the `afterEach(unstubAllGlobals)`):
```ts
describe('createChatStream skill_inputs', () => {
  it('includes skill_inputs in the POST body when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // loadAnonymization GET
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['nda-review'], { 'nda-review': { party: 'Acme' } });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.skill_inputs).toEqual({ 'nda-review': { party: 'Acme' } });
  });

  it('omits skill_inputs when empty', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', [], {});
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect('skill_inputs' in body).toBe(false);
  });

  it('surfaces a 400 skill-input error message from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Missing required skill input: party' }), { status: 400, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['nda-review'], { 'nda-review': {} });
    const last = chat.messages[chat.messages.length - 1];
    expect(last.status).toBe('error');
    expect(last.error).toMatch(/party/i);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — `send` doesn't accept `skillInputs`; the body has no `skill_inputs`; the 400 path returns the generic message.

- [ ] **Step 3: Implement the changes**

In `src/lib/chat/chatStream.svelte.ts`:

(a) Add a `lastSkillInputs` field next to the other `last*` fields:
```ts
  let lastSkills: string[] = [];
  let lastSkillInputs: Record<string, Record<string, unknown>> = {};
```

(b) Change `runStream`'s signature and body construction. Replace the signature line and the body block:
```ts
  async function runStream(idx: number, content: string, model: string, skills: string[], skillInputs: Record<string, Record<string, unknown>>) {
    status = 'streaming';
    controller = new AbortController();
    try {
      const body: { content: string; model: string; skills?: string[]; skill_inputs?: Record<string, Record<string, unknown>> } = { content, model };
      if (skills.length) body.skills = skills;
      if (Object.keys(skillInputs).length) body.skill_inputs = skillInputs;
      const res = await fetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        let msg = 'Could not reach the model. Please try again.';
        if (res.status === 400) {
          try {
            const env = (await res.json()) as { detail?: unknown };
            if (typeof env.detail === 'string' && env.detail) msg = env.detail;
          } catch { /* keep the generic message */ }
        }
        setError(idx, msg);
        return;
      }
```
(Leave the rest of `runStream` — the reader loop and finally — unchanged.)

(c) Change `send` to accept and store `skillInputs`:
```ts
  async function send(content: string, model = 'smart', skills: string[] = [], skillInputs: Record<string, Record<string, unknown>> = {}) {
    if (status === 'streaming') return;
    lastUserContent = content;
    lastModel = model;
    lastSkills = skills;
    lastSkillInputs = skillInputs;
    messages = [
      ...messages,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
      { key: crypto.randomUUID(), id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    await runStream(messages.length - 1, content, model, skills, skillInputs);
  }
```

(d) Update `retry`'s `runStream` call to pass `lastSkillInputs`:
```ts
    await runStream(idx, lastUserContent, lastModel, lastSkills, lastSkillInputs);
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS — new tests plus all existing ones (including the existing skills-in-body and retry tests).

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(chat): thread skill_inputs through chatStream; surface 400 skill-input errors"
```

---

## Task 5: BFF — forward `skill_inputs` in the messages payload

**Files:**
- Modify: `src/routes/(app)/chats/[id]/messages/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/chats/[id]/messages/server.test.ts`:
```ts
describe('POST messages skill_inputs', () => {
  it('forwards skill_inputs when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', skill_inputs: { 'nda-review': { party: 'Acme' } } }));
    expect(sentBody().skill_inputs).toEqual({ 'nda-review': { party: 'Acme' } });
  });

  it('omits skill_inputs when absent or malformed', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('skill_inputs' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', skill_inputs: [1, 2] }));
    expect('skill_inputs' in sentBody()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: FAIL — `skill_inputs` is not read/forwarded.

- [ ] **Step 3: Implement the forwarding**

In `src/routes/(app)/chats/[id]/messages/+server.ts`:

(a) Add a `skillInputs` accumulator and parse it. Replace the parse block:
```ts
  let content = '';
  let model = 'smart';
  let skills: string[] = [];
  let skillInputs: Record<string, Record<string, unknown>> = {};
  try {
    const body = (await event.request.json()) as { content?: string; model?: string; skills?: string[]; skill_inputs?: unknown };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
    if (Array.isArray(body.skills)) skills = body.skills.filter((s): s is string => typeof s === 'string');
    if (body.skill_inputs && typeof body.skill_inputs === 'object' && !Array.isArray(body.skill_inputs)) {
      const si: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of Object.entries(body.skill_inputs as Record<string, unknown>)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) si[k] = v as Record<string, unknown>;
      }
      skillInputs = si;
    }
  } catch {
    content = '';
  }
```

(b) Include it in the payload. Replace the payload block:
```ts
  const payload: { content: string; model: string; stream: true; skills?: string[]; skill_inputs?: Record<string, Record<string, unknown>> } = { content, model, stream: true };
  if (skills.length) payload.skills = skills;
  if (Object.keys(skillInputs).length) payload.skill_inputs = skillInputs;
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: PASS — new + existing tests.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.
```bash
git add "src/routes/(app)/chats/[id]/messages/+server.ts" "src/routes/(app)/chats/[id]/messages/server.test.ts"
git commit -m "feat(chat): forward skill_inputs in the messages BFF payload"
```

---

## Task 6: Landing draft plumbing for `skill_inputs`

**Files:**
- Create: `src/routes/(app)/chats/[id]/draftSkillInputs.ts`
- Test: `src/routes/(app)/chats/[id]/draftSkillInputs.test.ts`
- Modify: `src/routes/(app)/+page.server.ts`
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `src/routes/(app)/chats/[id]/draftSkillInputs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseDraftSkillInputs } from './draftSkillInputs';

describe('parseDraftSkillInputs', () => {
  it('parses a JSON object of per-skill value maps', () => {
    expect(parseDraftSkillInputs('{"nda-review":{"party":"Acme","count":3}}')).toEqual({ 'nda-review': { party: 'Acme', count: 3 } });
  });
  it('returns {} for null/undefined/empty', () => {
    expect(parseDraftSkillInputs(null)).toEqual({});
    expect(parseDraftSkillInputs(undefined)).toEqual({});
    expect(parseDraftSkillInputs('')).toEqual({});
  });
  it('returns {} for malformed JSON', () => {
    expect(parseDraftSkillInputs('not json')).toEqual({});
  });
  it('returns {} when the JSON is not an object', () => {
    expect(parseDraftSkillInputs('[1,2]')).toEqual({});
    expect(parseDraftSkillInputs('"x"')).toEqual({});
  });
  it('drops entries whose value is not a plain object', () => {
    expect(parseDraftSkillInputs('{"a":{"x":1},"b":5,"c":[1]}')).toEqual({ a: { x: 1 } });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftSkillInputs.test.ts"`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/routes/(app)/chats/[id]/draftSkillInputs.ts`:
```ts
/**
 * Parse the one-shot `donna_draft_skill_inputs` cookie / `?/start` form field
 * (a JSON object of `{ [skillSlug]: { [input]: value } }`) into a safe record.
 * Tolerates a missing or malformed value by returning `{}`, and drops any
 * entry whose value is not a plain object.
 */
export function parseDraftSkillInputs(raw: string | null | undefined): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [slug, vals] of Object.entries(parsed as Record<string, unknown>)) {
      if (vals && typeof vals === 'object' && !Array.isArray(vals)) out[slug] = vals as Record<string, unknown>;
    }
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/chats/[id]/draftSkillInputs.test.ts"`
Expected: PASS.

- [ ] **Step 5: Wire `?/start` (landing) to set the cookie**

In `src/routes/(app)/+page.server.ts`:

(a) Add the import near the top:
```ts
import { parseDraftSkillInputs } from './chats/[id]/draftSkillInputs';
```

(b) In the `start` action, after the `const skills = …` line, add:
```ts
    const skillInputs = parseDraftSkillInputs(String(data.get('skill_inputs') ?? ''));
```

(c) After the existing `if (skills.length) { … donna_draft_skills … }` block, add:
```ts
    if (Object.keys(skillInputs).length) {
      event.cookies.set('donna_draft_skill_inputs', JSON.stringify(skillInputs), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 120 });
    }
```

- [ ] **Step 6: Wire the chat `load` to read the cookie**

In `src/routes/(app)/chats/[id]/+page.server.ts`:

(a) Add the import next to the `parseDraftSkills` import:
```ts
import { parseDraftSkillInputs } from './draftSkillInputs';
```

(b) After the existing `const draftSkills = parseDraftSkills(rawDraftSkills);` line, add:
```ts
  const rawDraftSkillInputs = event.cookies.get('donna_draft_skill_inputs');
  if (rawDraftSkillInputs) event.cookies.delete('donna_draft_skill_inputs', { path: '/' });
  const draftSkillInputs = parseDraftSkillInputs(rawDraftSkillInputs);
```

(c) Add `draftSkillInputs` to the returned object (alongside `draftSkills`):
```ts
  return { chatId: event.params.id, messages, draft, draftSkills, draftSkillInputs, matter };
```

- [ ] **Step 7: Gate + commit**

Run: `npm run check` → 0/0. Run `npx vitest run "src/routes/(app)/chats/[id]/draftSkillInputs.test.ts"` → PASS.
```bash
git add "src/routes/(app)/chats/[id]/draftSkillInputs.ts" "src/routes/(app)/chats/[id]/draftSkillInputs.test.ts" "src/routes/(app)/+page.server.ts" "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat(chat): carry skill_inputs through the landing draft cookie"
```

---

## Task 7: Composer wiring (form + gating + 4-arg onsubmit) and call sites

**Files:**
- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.svelte.test.ts`
- Modify: `src/routes/(app)/+page.svelte`
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

- [ ] **Step 1: Write the failing composer test**

Append to `src/lib/components/Composer.svelte.test.ts`:
```ts
import { createSkillAttach } from '$lib/skills/attach.svelte';

describe('Composer skill inputs', () => {
  const NDA = { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: '', scope: 'builtin', icon: null };

  it('renders a required skill input and gates Send until it is filled', async () => {
    const sa = createSkillAttach();
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'nda-review', required: [{ name: 'party', type: 'text', required: true }], optional: [] }), { status: 200 }));
    await sa.attach(NDA as never, f);
    render(Composer, { props: { value: 'hello', skillAttach: sa } as never });
    const party = screen.getByLabelText('party');
    expect(party).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await fireEvent.input(party, { target: { value: 'Acme' } });
    expect(send).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: FAIL — the composer renders no input form and does not gate Send on required inputs.

- [ ] **Step 3: Implement the composer changes**

In `src/lib/components/Composer.svelte`:

(a) Add the import (with the other component imports):
```ts
  import SkillInputForm from '$lib/skills/SkillInputForm.svelte';
```

(b) Change the `onsubmit` prop type (in both the destructure type and usage). Replace the `onsubmit?: (text: string, model: string, skills: string[]) => void;` line in the props type with:
```ts
    onsubmit?: (text: string, model: string, skills: string[], skillInputs: Record<string, Record<string, unknown>>) => void;
```

(c) Replace the `submit()` function:
```ts
  function submit() {
    const text = value.trim();
    if (!text) return;
    if (skillAttach && !skillAttach.allRequiredFilled) return;
    onsubmit?.(text, modelStore.selectedModel, skillAttach?.names ?? [], skillAttach?.skillInputs ?? {});
  }
```

(d) Render the per-skill input forms. Immediately AFTER the existing chips block (the `{#if skillAttach && skillAttach.attached.length} … {/if}`), add:
```svelte
  {#if skillAttach}
    {#each skillAttach.attached as s (s.slug)}
      {#if s.inputsError}
        <p class="mb-2 text-xs text-mlq-muted">Couldn't load inputs for {s.title}.</p>
      {:else if s.required.length + s.optional.length > 0}
        <div class="mb-2">
          <SkillInputForm
            skillTitle={s.title}
            required={s.required}
            optional={s.optional}
            values={s.values}
            onchange={(name, value) => skillAttach?.setInputValue(s.slug, name, value)}
          />
        </div>
      {/if}
    {/each}
  {/if}
```

(e) Gate the Send button. Replace the send `<button>` (the non-streaming branch) `disabled` attribute:
```svelte
      <button type="button" onclick={submit} disabled={!value.trim() || !(skillAttach?.allRequiredFilled ?? true)} aria-label="Send" class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40">
        <ArrowRight size={18} />
      </button>
```

- [ ] **Step 4: Run the composer test to verify it PASSES**

Run: `npx vitest run src/lib/components/Composer.svelte.test.ts`
Expected: PASS — new + existing composer tests.

- [ ] **Step 5: Update the chat page call site**

In `src/routes/(app)/chats/[id]/+page.svelte`:

(a) Replace the `submit` function:
```ts
  function submit(text: string, model = 'smart', skills: string[] = [], skillInputs: Record<string, Record<string, unknown>> = {}) {
    draftValue = '';
    chat.send(text, model, skills, skillInputs);
  }
```

(b) Replace the `onMount` replay line to pass draft skill inputs:
```ts
    if (data.draft && data.messages.length === 0) submit(data.draft, modelStore.selectedModel, data.draftSkills ?? [], data.draftSkillInputs ?? {});
```
(`onsubmit={submit}` already passes the composer's 4 args through unchanged.)

- [ ] **Step 6: Update the landing page call site**

In `src/routes/(app)/+page.svelte`, add a hidden field inside the `<form action="?/start">`, right after the existing `{#each skillAttach.names …}` hidden-inputs block:
```svelte
    <input type="hidden" name="skill_inputs" value={JSON.stringify(skillAttach.skillInputs)} />
```
(The landing composer's `onsubmit={() => formEl?.requestSubmit()}` reads controller state, so the serialized `skillInputs` rides along on form submit.)

- [ ] **Step 7: Full gate + commit**

Run: `npm run check` → 0/0. Run `npx vitest run` → full suite green.
```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.svelte.test.ts "src/routes/(app)/+page.svelte" "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(composer): render skill-input forms, gate Send on required inputs, thread skill_inputs"
```

---

## Task 8: Live e2e

**Files:**
- Create: `tests/skill-inputs.spec.ts`

- [ ] **Step 1: Discover a built-in skill that declares inputs**

The dev stack must be up. Find a built-in skill whose `/inputs` declares at least one required input, and note its slug + the required input's `name` and `type`:
```bash
set -a; . ./.env; set +a
TOKEN=$(curl -s -X POST localhost:13002/api/v1/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$DONNA_E2E_EMAIL\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])' 2>/dev/null)
for slug in $(curl -s localhost:13002/api/v1/skills?scope=builtin -H "authorization: Bearer $TOKEN" | python3 -c 'import sys,json;[print(s["slug"]) for s in json.load(sys.stdin)]'); do
  req=$(curl -s "localhost:13002/api/v1/skills/$slug/inputs" -H "authorization: Bearer $TOKEN" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(len(d.get("required",[])), d.get("required",[]))' 2>/dev/null)
  echo "$slug -> $req"
done
```
(The exact backend port/login shape may differ; if this probe is awkward, instead log in through the UI and check the Network tab for `/skills/{slug}/inputs` responses, or query the running API container directly.) Record the first slug with a required input, plus the input's `name` and `type`.

- [ ] **Step 2: Write the e2e using the discovered skill**

Create `tests/skill-inputs.spec.ts`. Replace `SKILL_QUERY`, `SKILL_TITLE`, `INPUT_NAME`, and the fill value with the discovered skill's search term, its title text, and its required input's `name` (use a value valid for its type — a string for text/enum, a number for integer):
```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

// --- Fill these from Task 8 Step 1 discovery ---
const SKILL_QUERY = 'REPLACE_WITH_SEARCH_TERM';     // e.g. 'nda'
const SKILL_RESULT_SLUG = 'REPLACE_WITH_SLUG';      // e.g. 'nda-review' (matches data-testid skill-result-{slug})
const INPUT_NAME = 'REPLACE_WITH_INPUT_NAME';       // e.g. 'jurisdiction'
const INPUT_VALUE = 'REPLACE_WITH_VALID_VALUE';     // e.g. 'Delaware'
// ------------------------------------------------

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('composer: attach a skill, fill its required input, and send', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  // Start a chat so we're on the chat composer.
  await page.getByRole('textbox').first().fill('Walk me through this.');
  // Attach the skill via the skill picker.
  await page.getByTestId('skill-attach').click();
  await page.getByTestId('skill-search').fill(SKILL_QUERY);
  await page.getByTestId(`skill-result-${SKILL_RESULT_SLUG}`).click();

  // The inline input form appears; Send is gated until the required input is filled.
  const input = page.getByLabelText(INPUT_NAME);
  await expect(input).toBeVisible({ timeout: 10_000 });
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();
  await input.fill(INPUT_VALUE);
  await expect(send).toBeEnabled();

  // Send and confirm the turn streams to completion (lands on the chat route).
  await send.click();
  await page.waitForURL(/\/chats\//, { timeout: 15_000 });
  await expect(page.locator('article, [data-role="assistant"]').last()).toBeVisible({ timeout: 60_000 });
});
```
**Fallback if Step 1 finds no built-in skill with required inputs:** do NOT ship a broken e2e. Instead skip the live spec (`test.skip`) with a comment explaining no fixture skill declares inputs, and rely on the Task 1/3/4/5/7 unit + component tests for coverage. Note this gap in the PR description.

- [ ] **Step 3: Rebuild donna-web and run the e2e**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
npx playwright test tests/skill-inputs.spec.ts
```
Expected: PASS (or skipped per the fallback). The flow attaches a skill, gates Send, fills the input, and the turn completes. If it fails for a reason other than fixture data, read and report — do not loosen assertions.

- [ ] **Step 4: Commit**

```bash
git add tests/skill-inputs.spec.ts
git commit -m "test(skills): live e2e for composer skill inputs"
```

---

## Final Verification (run after all tasks)

- [ ] `npm run check` → 0 errors / 0 warnings.
- [ ] `npx vitest run` → full suite green.
- [ ] `set -a; . ./.env; set +a; docker compose up -d --build donna-web && npx playwright test tests/skill-inputs.spec.ts` → green (or documented skip).
- [ ] Manual sanity: attach a skill with inputs → form appears under the chips; Send disabled until required filled; send works; a no-input skill shows no form.

## Acceptance criteria (from the spec)

- [ ] Attaching an input-declaring skill shows an inline form (required + collapsible optional); no-input skill shows nothing.
- [ ] Send blocked while a required input is empty; unfilled required flagged; enables once filled.
- [ ] `skill_inputs` sent keyed by slug with coerced non-empty values; empty optionals omitted; BFF forwards it.
- [ ] Landing-composer inputs reach the first message via the draft cookie.
- [ ] Backend `skill_input_missing` 400 surfaces a readable inline error.
- [ ] `/inputs` fetch failure degrades gracefully (attaches, no block, note).
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`); unit/component tests green; live e2e green or documented skip.
