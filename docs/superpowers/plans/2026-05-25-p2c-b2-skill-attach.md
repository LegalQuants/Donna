# P2c-B2 Skill-Attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user search and attach lq-ai skills to a chat via a `⊕ Skill` popover in the composer, threading the chosen skill names through the message as `skills[]` (no input forms).

**Architecture:** Thin `/skills/autocomplete` BFF proxy → `createSkillAttach` rune controller (sticky attached set + autocomplete results) → presentational `SkillAttach.svelte` (button + popover) in the composer control row, with removable chips rendered above the textarea. The attached slugs thread through `Composer.onsubmit(text, model, skills)` → `chat.send` → the messages BFF, exactly as B1 did with `model`.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + `@testing-library/svelte`, Playwright. Spec: `docs/superpowers/specs/2026-05-25-donna-p2c-b2-skill-attach-design.md`.

**Conventions (match existing code):**
- Commit per task. Branch is `p2c-b2-skill-attach` (already created off `main`; pin `438198c`).
- After any task that changes `src/`, `npm run check` must report **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal).
- BFF tests mock `$lib/server/lqClient`; component tests use `@testing-library/svelte`; rune controllers are tested by calling methods with an injected `fetch` mock (like `src/lib/models/store.svelte.ts`).
- Icons from `@lucide/svelte`. Tailwind tokens: `mlq-*`.
- **Component boundary (refinement of the spec):** `SkillAttach.svelte` is the `⊕ Skill` button + popover only; the removable **chips render inline in `Composer`** above the textarea (they sit in a different part of the layout than the button, which lives in the control row beside the model picker). This honors the approved mockup and keeps each piece focused.

---

### Task 1: `/skills/autocomplete` BFF thin proxy

**Files:**
- Create: `src/routes/(app)/skills/autocomplete/+server.ts`
- Test: `src/routes/(app)/skills/autocomplete/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/skills/autocomplete/server.test.ts` (mirrors `src/routes/(app)/models/server.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (qs = '') =>
  ({ url: new URL(`http://x/skills/autocomplete${qs}`) }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /skills/autocomplete', () => {
  it('forwards q and limit and returns the body', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const res = await GET(event('?q=nda&limit=8'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/autocomplete?q=nda&limit=8');
    expect(await res.json()).toEqual({ results: [] });
  });

  it('defaults q to empty and limit to 8 (recents)', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/autocomplete?q=&limit=8');
  });

  it('passes through 503 and 504', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 503 });
    lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 504 });
  });

  it('maps other errors to 502', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/skills/autocomplete/server.test.ts"`
Expected: FAIL — no `GET` export.

- [ ] **Step 3: Write the implementation**

Create `src/routes/(app)/skills/autocomplete/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const q = event.url.searchParams.get('q') ?? '';
  const limit = event.url.searchParams.get('limit') ?? '8';
  const path = `/api/v1/skills/autocomplete?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
  const res = await lqFetch(event, path);
  // 503/504 are the gateway's documented unreachable/timeout signals; pass them
  // through so the popover can show "Couldn't load skills"; map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load skills.');
  return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/skills/autocomplete/server.test.ts"`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/skills/autocomplete/+server.ts" "src/routes/(app)/skills/autocomplete/server.test.ts"
git commit -m "feat(p2c-b2): /skills/autocomplete BFF thin proxy"
```

---

### Task 2: Skill types + `createSkillAttach` controller

**Files:**
- Create: `src/lib/skills/types.ts`
- Create: `src/lib/skills/attach.svelte.ts`
- Test: `src/lib/skills/attach.svelte.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/skills/types.ts`:

```ts
import type { paths } from '$lib/api/backend';

/** One autocomplete result, sourced from the generated backend contract. */
export type SkillSuggestion =
  paths['/api/v1/skills/autocomplete']['get']['responses']['200']['content']['application/json']['results'][number];

/** A skill the user has attached to the composer (the name we send + a label). */
export interface AttachedSkill {
  slug: string;
  title: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/skills/attach.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createSkillAttach } from './attach.svelte';

const ok = (results: unknown) => new Response(JSON.stringify({ results }), { status: 200 });
const NDA = { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: 'Full NDA review', scope: 'builtin', icon: null };
const NDA2 = { slug: 'nda-snapshot', slash_alias: null, title: 'NDA Snapshot', description: 'Quick snapshot', scope: 'builtin', icon: null };

describe('createSkillAttach', () => {
  it('starts empty', () => {
    const s = createSkillAttach();
    expect(s.attached).toEqual([]);
    expect(s.names).toEqual([]);
  });

  it('open() fetches recents (empty q) into results', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(ok([NDA, NDA2]));
    await s.open(f);
    expect(f.mock.calls[0][0]).toBe('/skills/autocomplete?q=&limit=8');
    expect(s.results.map((r) => r.slug)).toEqual(['nda-review', 'nda-snapshot']);
    expect(s.error).toBe(false);
  });

  it('search(q) fetches ranked matches', async () => {
    const s = createSkillAttach();
    const f = vi.fn().mockResolvedValue(ok([NDA]));
    await s.search('nda', f);
    expect(f.mock.calls[0][0]).toBe('/skills/autocomplete?q=nda&limit=8');
    expect(s.results.map((r) => r.slug)).toEqual(['nda-review']);
  });

  it('search error sets error and clears results', async () => {
    const s = createSkillAttach();
    await s.search('x', vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    expect(s.error).toBe(true);
    expect(s.results).toEqual([]);
  });

  it('attach adds {slug,title}, dedupes by slug, and drives names', () => {
    const s = createSkillAttach();
    s.attach(NDA);
    s.attach(NDA); // dedupe
    s.attach(NDA2);
    expect(s.attached).toEqual([
      { slug: 'nda-review', title: 'NDA Review' },
      { slug: 'nda-snapshot', title: 'NDA Snapshot' }
    ]);
    expect(s.names).toEqual(['nda-review', 'nda-snapshot']);
  });

  it('remove drops by slug', () => {
    const s = createSkillAttach();
    s.attach(NDA);
    s.attach(NDA2);
    s.remove('nda-review');
    expect(s.names).toEqual(['nda-snapshot']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/skills/attach.svelte.test.ts`
Expected: FAIL — `createSkillAttach` not exported.

- [ ] **Step 4: Write the implementation**

Create `src/lib/skills/attach.svelte.ts`:

```ts
import type { SkillSuggestion, AttachedSkill } from './types';

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
    open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
    search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
    attach(s: SkillSuggestion) {
      if (attached.some((a) => a.slug === s.slug)) return;
      attached = [...attached, { slug: s.slug, title: s.title }];
    },
    remove(slug: string) {
      attached = attached.filter((a) => a.slug !== slug);
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/skills/attach.svelte.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills/types.ts src/lib/skills/attach.svelte.ts src/lib/skills/attach.svelte.test.ts
git commit -m "feat(p2c-b2): skill types + createSkillAttach rune controller"
```

---

### Task 3: `SkillAttach.svelte` (button + popover)

**Files:**
- Create: `src/lib/components/SkillAttach.svelte`
- Test: `src/lib/components/SkillAttach.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/SkillAttach.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SkillAttach from './SkillAttach.svelte';
import type { SkillSuggestion } from '$lib/skills/types';

const RESULTS: SkillSuggestion[] = [
  { slug: 'nda-review', slash_alias: null, title: 'NDA Review', description: 'Full NDA review', scope: 'builtin', icon: null }
];
const baseProps = () => ({ results: RESULTS, loading: false, error: false, onopen: vi.fn(), onsearch: vi.fn(), onattach: vi.fn() });

afterEach(() => vi.useRealTimers());

describe('SkillAttach', () => {
  it('calls onopen when the button opens the popover, and onattach when a result is clicked', async () => {
    const props = baseProps();
    const { getByTestId } = render(SkillAttach, { props });
    await userEvent.click(getByTestId('skill-attach'));
    expect(props.onopen).toHaveBeenCalledTimes(1);
    await userEvent.click(getByTestId('skill-result-nda-review'));
    expect(props.onattach).toHaveBeenCalledWith(RESULTS[0]);
  });

  it('debounces search input (~200ms) before calling onsearch', async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const { getByTestId } = render(SkillAttach, { props });
    // open the popover so the search input renders (onopen is fired but irrelevant here)
    await fireEvent.click(getByTestId('skill-attach'));
    await fireEvent.input(getByTestId('skill-search'), { target: { value: 'nda' } });
    expect(props.onsearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(props.onsearch).toHaveBeenCalledWith('nda');
  });

  it('shows an error note when error is set', async () => {
    const props = { ...baseProps(), error: true };
    const { getByTestId, getByText } = render(SkillAttach, { props });
    await userEvent.click(getByTestId('skill-attach'));
    expect(getByText(/couldn't load skills/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/SkillAttach.svelte.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/SkillAttach.svelte`:

```svelte
<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import type { SkillSuggestion } from '$lib/skills/types';

  let {
    results,
    loading = false,
    error = false,
    onopen,
    onsearch,
    onattach
  }: {
    results: SkillSuggestion[];
    loading?: boolean;
    error?: boolean;
    onopen: () => void;
    onsearch: (q: string) => void;
    onattach: (s: SkillSuggestion) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout>;

  function toggle() {
    open = !open;
    if (open) onopen();
  }
  function oninput(e: Event & { currentTarget: HTMLInputElement }) {
    clearTimeout(timer);
    const q = e.currentTarget.value;
    timer = setTimeout(() => onsearch(q), 200);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });
</script>

<div bind:this={root} class="relative" {onkeydown}>
  <button
    type="button"
    data-testid="skill-attach"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="Attach skill"
    onclick={toggle}
    class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
  >
    <Plus size={13} /> Skill
  </button>

  {#if open}
    <div class="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md">
      <input
        type="text"
        data-testid="skill-search"
        placeholder="Search skills…"
        oninput={oninput}
        class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
      />
      {#if error}
        <p class="px-3 py-2 text-xs text-mlq-muted">Couldn't load skills.</p>
      {:else if loading}
        <p class="px-3 py-2 text-xs text-mlq-muted">Searching…</p>
      {:else if results.length === 0}
        <p class="px-3 py-2 text-xs text-mlq-muted">No skills found.</p>
      {:else}
        <ul class="max-h-64 overflow-y-auto">
          {#each results as s (s.slug)}
            <li>
              <button
                type="button"
                data-testid={`skill-result-${s.slug}`}
                onclick={() => onattach(s)}
                class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50"
              >
                <span class="font-medium text-mlq-text">{s.title}</span>
                {#if s.description}<span class="mt-0.5 block truncate text-mlq-muted">{s.description}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/SkillAttach.svelte.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings". If svelte-check warns on the `<div>` carrying `onkeydown` (a11y_no_static_element_interactions, as it did for `ModelPicker`), add `<!-- svelte-ignore a11y_no_static_element_interactions -->` immediately above that `<div>`. Add only the ignore(s) svelte-check actually prints; re-run until 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SkillAttach.svelte src/lib/components/SkillAttach.svelte.test.ts
git commit -m "feat(p2c-b2): SkillAttach button + autocomplete popover (debounced)"
```

---

### Task 4: Carry `skills` through `chatStream.send` / `retry`

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts` (add one case)

- [ ] **Step 1: Add the failing test**

Append this `it(...)` inside the existing `describe('createChatStream', …)` block in `src/lib/chat/chatStream.svelte.test.ts`:

```ts
  it('posts attached skills in the body and reuses them on retry', async () => {
    const frames = () => streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
      'data: [DONE]\n\n'
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(frames()) // call 0: send POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // call 1: loadAnonymization GET
      .mockResolvedValueOnce(frames()) // call 2: retry POST
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // call 3: loadAnonymization GET
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'smart', ['nda-review']);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({ content: 'hi', model: 'smart', skills: ['nda-review'] });

    await chat.retry();
    const retryBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(retryBody.skills).toEqual(['nda-review']);
    expect(chat.messages[1].status).toBe('done');
  });

  it('omits skills from the body when none are attached', async () => {
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
    await chat.send('hi', 'smart');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect('skills' in body).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts -t "attached skills"`
Expected: FAIL — `send` ignores the third arg; body has no `skills`.

- [ ] **Step 3: Write the implementation**

In `src/lib/chat/chatStream.svelte.ts`, make these edits (leave all streaming/citation/anonymization logic unchanged):

1. Add `lastSkills` beside `lastModel`:

```ts
  let lastUserContent = '';
  let lastModel = 'smart';
  let lastSkills: string[] = [];
```

2. Change `runStream` to accept `skills` and include it in the body only when non-empty:

```ts
  async function runStream(idx: number, content: string, model: string, skills: string[]) {
    status = 'streaming';
    controller = new AbortController();
    try {
      const body: { content: string; model: string; skills?: string[] } = { content, model };
      if (skills.length) body.skills = skills;
      const res = await fetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
```

(the rest of `runStream` is unchanged.)

3. Change `send` to accept `skills` (default `[]`), record it, and pass it down:

```ts
  async function send(content: string, model = 'smart', skills: string[] = []) {
    if (status === 'streaming') return;
    lastUserContent = content;
    lastModel = model;
    lastSkills = skills;
    messages = [
      ...messages,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
      { key: crypto.randomUUID(), id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    await runStream(messages.length - 1, content, model, skills);
  }
```

4. Update the `retry()` `runStream` call to pass `lastSkills`:

```ts
    await runStream(idx, lastUserContent, lastModel, lastSkills);
```

- [ ] **Step 4: Run the full chatStream suite**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS — the two new cases plus all pre-existing (existing `send('hi')` / `send('hi','fast')` calls still work via the `skills = []` default; the B1 model test still passes since `skills` is omitted when empty and that test only asserts `content`/`model`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(p2c-b2): carry attached skills through chatStream send/retry"
```

---

### Task 5: Thread `skills` through the messages BFF

**Files:**
- Modify: `src/routes/(app)/chats/[id]/messages/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/server.test.ts` (add cases)

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe('POST messages', …)` block in `src/routes/(app)/chats/[id]/messages/server.test.ts`:

```ts
  it('forwards skills when present', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart', skills: ['nda-review'] }));
    expect(sentBody().skills).toEqual(['nda-review']);
  });

  it('omits skills when absent or empty', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'smart' }));
    expect('skills' in sentBody()).toBe(false);
    await POST(event({ content: 'hi', model: 'smart', skills: [] }));
    expect('skills' in sentBody()).toBe(false);
  });
```

(Note: `sentBody()` already reads `lqStream.mock.calls[0][2].body`; the second assertion in the "omits" test still reads call index 0 because `lqStream.mockReset()` does not run between the two `POST`s — instead read the latest call. Use this helper variant by replacing the existing `sentBody` with one that reads the **last** call:)

```ts
function sentBody() {
  const calls = lqStream.mock.calls;
  return JSON.parse((calls[calls.length - 1][2] as { body: string }).body);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: FAIL — handler doesn't read `skills`, so `forwards skills` fails.

- [ ] **Step 3: Write the implementation**

Update the body parsing + upstream call in `src/routes/(app)/chats/[id]/messages/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
  let content = '';
  let model = 'smart';
  let skills: string[] = [];
  try {
    const body = (await event.request.json()) as { content?: string; model?: string; skills?: string[] };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
    if (Array.isArray(body.skills)) skills = body.skills.filter((s): s is string => typeof s === 'string');
  } catch {
    content = '';
  }

  const payload: { content: string; model: string; stream: true; skills?: string[] } = { content, model, stream: true };
  if (skills.length) payload.skills = skills;

  const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  // Pipe the upstream SSE body straight through (no buffering). On a non-2xx
  // upstream the body is the JSON error envelope; forward status + body so the
  // client's res.ok check surfaces it.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache'
    }
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: PASS — the two new cases plus the existing three (forwards model / defaults smart / blank → smart; the existing `sentBody()` reads the last call, which for those single-POST tests is still call 0).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/messages/+server.ts" "src/routes/(app)/chats/[id]/messages/server.test.ts"
git commit -m "feat(p2c-b2): forward attached skills through the messages SSE BFF"
```

---

### Task 6: Composer chips + `SkillAttach` wiring

**Files:**
- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.test.ts` (add cases)

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe('Composer', …)` block in `src/lib/components/Composer.test.ts`:

```ts
  it('hides skill UI and submits empty skills when no skillAttach is passed (landing)', async () => {
    const onsubmit = vi.fn();
    const { getByRole, queryByTestId } = render(Composer, { props: { onsubmit } });
    expect(queryByTestId('skill-attach')).toBeNull();
    await userEvent.type(getByRole('textbox'), 'hello');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('hello', expect.any(String), []);
  });

  it('renders chips + skill button and submits attached slugs when skillAttach is passed', async () => {
    const onsubmit = vi.fn();
    const skillAttach = {
      attached: [{ slug: 'nda-review', title: 'NDA Review' }],
      results: [],
      loading: false,
      error: false,
      names: ['nda-review'],
      open: vi.fn(),
      search: vi.fn(),
      attach: vi.fn(),
      remove: vi.fn()
    };
    const { getByRole, getByTestId, getByText } = render(Composer, { props: { onsubmit, skillAttach } });
    expect(getByTestId('skill-attach')).toBeInTheDocument();
    expect(getByText('NDA Review')).toBeInTheDocument();
    await userEvent.type(getByRole('textbox'), 'review this');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('review this', expect.any(String), ['nda-review']);
  });

  it('removes a chip via its remove control', async () => {
    const remove = vi.fn();
    const skillAttach = {
      attached: [{ slug: 'nda-review', title: 'NDA Review' }],
      results: [], loading: false, error: false, names: ['nda-review'],
      open: vi.fn(), search: vi.fn(), attach: vi.fn(), remove
    };
    const { getByRole } = render(Composer, { props: { skillAttach } });
    await userEvent.click(getByRole('button', { name: /remove nda review/i }));
    expect(remove).toHaveBeenCalledWith('nda-review');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Composer.test.ts -t "skillAttach"`
Expected: FAIL — no `skillAttach` prop / `skill-attach` testid; `onsubmit` called with 2 args.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/lib/components/Composer.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowRight, Square, X } from '@lucide/svelte';
  import ModelPicker from './ModelPicker.svelte';
  import SkillAttach from './SkillAttach.svelte';
  import { modelStore } from '$lib/models/store.svelte';
  import type { createSkillAttach } from '$lib/skills/attach.svelte';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop,
    skillAttach
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string, skills: string[]) => void;
    streaming?: boolean;
    onstop?: () => void;
    skillAttach?: ReturnType<typeof createSkillAttach>;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();

  onMount(() => {
    modelStore.load();
  });

  function autogrow() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
  }
  function submit() {
    const text = value.trim();
    if (!text) return;
    onsubmit?.(text, modelStore.selectedModel, skillAttach?.names ?? []);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) submit();
    }
  }
</script>

<div class="rounded-t-mlq-composer border border-mlq-subtle bg-mlq-surface p-3 shadow-sm">
  {#if skillAttach && skillAttach.attached.length}
    <div class="mb-2 flex flex-wrap gap-1.5">
      {#each skillAttach.attached as s (s.slug)}
        <span class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text">
          {s.title}
          <button
            type="button"
            aria-label={`Remove ${s.title}`}
            onclick={() => skillAttach?.remove(s.slug)}
            class="text-mlq-muted hover:text-mlq-text"
          >
            <X size={12} />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <textarea
    bind:this={textarea}
    bind:value
    {placeholder}
    rows="1"
    oninput={autogrow}
    {onkeydown}
    class="max-h-48 w-full resize-none bg-transparent font-serif text-mlq-text outline-none placeholder:text-mlq-muted"
  ></textarea>

  <div class="mt-2 flex items-center gap-2 border-t border-mlq-subtle pt-2">
    <ModelPicker
      options={modelStore.options}
      selected={modelStore.selectedModel}
      error={modelStore.error}
      onselect={modelStore.setModel}
    />
    {#if skillAttach}
      <SkillAttach
        results={skillAttach.results}
        loading={skillAttach.loading}
        error={skillAttach.error}
        onopen={skillAttach.open}
        onsearch={skillAttach.search}
        onattach={skillAttach.attach}
      />
    {/if}
    <span class="flex-1"></span>
    {#if streaming}
      <button type="button" onclick={() => onstop?.()} aria-label="Stop" class="rounded-mlq-control bg-mlq-strong p-2 text-white">
        <Square size={18} />
      </button>
    {:else}
      <button type="button" onclick={submit} disabled={!value.trim()} aria-label="Send" class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40">
        <ArrowRight size={18} />
      </button>
    {/if}
  </div>
</div>
```

- [ ] **Step 4: Run the full Composer suite**

Run: `npx vitest run src/lib/components/Composer.test.ts`
Expected: PASS — the three new cases plus the existing B1 cases (the existing "renders the model picker and submits the selected model" case asserted `onsubmit` with `('hello', expect.any(String))`; it now also receives a third arg `[]`. **If that pre-existing assertion fails because it used exactly two args, update only that assertion to `('hello', expect.any(String), [])`** — this is the expected ripple from the new `onsubmit` signature, not a regression. Do not change any other existing case.)

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings".

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.test.ts
git commit -m "feat(p2c-b2): composer skill chips + SkillAttach wiring"
```

---

### Task 7: Wire the chat page to own the controller and pass skills

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

- [ ] **Step 1: Update the page**

In `src/routes/(app)/chats/[id]/+page.svelte`:

1. Add the import (beside the existing `modelStore` import):

```svelte
  import { createSkillAttach } from '$lib/skills/attach.svelte';
```

2. Create the per-chat controller next to the chat-stream controller (after the `const chat = untrack(...)` line):

```svelte
  const skillAttach = createSkillAttach();
```

3. Update `submit` to accept and forward skills:

```svelte
  function submit(text: string, model = 'smart', skills: string[] = []) {
    draftValue = '';
    chat.send(text, model, skills);
  }
```

4. Pass the controller to the Composer (add the prop to the existing `<Composer ... />`):

```svelte
    <Composer
      bind:value={draftValue}
      onsubmit={submit}
      streaming={chat.status === 'streaming'}
      onstop={chat.stop}
      {skillAttach}
    />
```

(The `onMount` landing-draft auto-send `submit(data.draft, modelStore.selectedModel)` still works — `skills` defaults to `[]`. Confirm `modelStore` is already imported from the B1 work; it is.)

- [ ] **Step 2: Verify check + the full unit suite**

Run: `npm run check && npx vitest run`
Expected: check "0 errors and 0 warnings"; all unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p2c-b2): chat page owns skill controller and forwards skills to send"
```

---

### Task 8: Live e2e + full gate

**Files:**
- Create: `tests/skill-attach.spec.ts`

**Prereqs (run once):**

```bash
cd /Users/kevinkeller/Code/Donna
set -a; . ./.env; set +a
docker compose up -d --build donna-web    # rebuild the app with the new code
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
```

- [ ] **Step 1: Write the e2e test**

Create `tests/skill-attach.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('attach a skill in a chat: chip appears, body carries skills, persists across sends', async ({ page }) => {
  await login(page);

  // Start a chat (the landing composer has no skill UI — in-chat only).
  await page.fill('textarea', 'In one short sentence, what is an NDA?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

  // Open the skill popover, search, and attach nda-review.
  await page.getByTestId('skill-attach').click();
  await page.getByTestId('skill-search').fill('nda');
  await expect(page.getByTestId('skill-result-nda-review')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('skill-result-nda-review').click();

  // Chip appears.
  await expect(page.getByText('NDA Review')).toBeVisible();

  // Sending carries skills:["nda-review"] in the outgoing body.
  const reqPromise = page.waitForRequest(
    (r: any) => r.url().includes('/messages') && r.method() === 'POST'
  );
  await page.fill('textarea', 'Is the non-compete enforceable?');
  await page.keyboard.press('Enter');
  const req = await reqPromise;
  expect(JSON.parse(req.postData() || '{}').skills).toEqual(['nda-review']);

  // Sticky: the chip is still attached for a second message.
  await expect(page.getByRole('button', { name: /copy/i }).last()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('NDA Review')).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e against the running stack**

Run: `npx playwright test tests/skill-attach.spec.ts`
Expected: PASS. If the skill result doesn't appear, confirm `donna-web` was rebuilt and the autocomplete proxy works (`curl` the BFF route while logged in).

- [ ] **Step 3: Full gate**

Run: `npm run check && npx vitest run && npx playwright test`
Expected: check "0 errors and 0 warnings"; all unit specs pass; all Playwright specs pass (the new one + the existing streaming/citation/receipts/model-picker suites — confirm no regression from the Composer change). Note: `tests/citation-live.spec.ts` is RAG-seed timing-sensitive and may need one retry while embeddings settle (it is not affected by this change).

- [ ] **Step 4: Commit**

```bash
git add tests/skill-attach.spec.ts
git commit -m "test(p2c-b2): live e2e for skill-attach (chip, body carries skills, sticky)"
```

---

## Self-review

**Spec coverage:**
- Attach-only (chips + autocomplete, no input forms) → Tasks 2 (controller), 3 (component), 6 (chips). No `skill_inputs` anywhere. ✓
- `⊕ Skill` button + popover backed by `/skills/autocomplete` → Tasks 1 (proxy), 3 (component). ✓
- Sticky in-memory chips → Task 2 (`attached` lives in the controller, no localStorage). ✓
- In-chat only (hidden on landing) → Task 6 (`{#if skillAttach}`) + Task 7 (only the chat page creates the controller; landing composer omits the prop) + Composer test "hides skill UI ... (landing)". ✓
- Thread `skills[]` through send → BFF → Tasks 4 (chatStream), 5 (messages BFF), 7 (page). ✓
- Error handling: autocomplete failure → error note, never blocks (Tasks 1 map errors, 2 sets `error`, 3 renders note); dedupe (Task 2); skills omitted when empty (Tasks 4, 5). ✓
- Testing: unit (2), component (3, 6), proxy (1), chatStream (4), BFF (5), live e2e (8). ✓

**Out of scope (correctly absent):** `skill_inputs` forms, landing skill-attach, slash typeahead, skill inspector, full `/skills` list.

**Type consistency:** `SkillSuggestion`/`AttachedSkill` (Task 2) are used identically in Tasks 3 and 6. The controller surface (`attached/results/loading/error/names/open/search/attach/remove`) defined in Task 2 matches the props mapped in Task 6 and the e2e expectations. `send(content, model, skills)` (Task 4) matches the messages-BFF body (Task 5) and the page call (Task 7). `onsubmit(text, model, skills)` matches between Composer (Task 6) and the page (Task 7). The Composer test mock object (Task 6) mirrors the real controller's shape.

**Known ripple (documented in Task 6):** the new third `onsubmit` arg means the B1 Composer test's two-arg assertion gains a `[]`; Task 6 Step 4 calls this out explicitly so it isn't mistaken for a regression.
