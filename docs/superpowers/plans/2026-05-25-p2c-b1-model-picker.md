# P2c-B1 Model / Tier Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `model: 'smart'` in the chat SSE BFF with a composer dropdown that lets the user pick from the 6 curated chat aliases (grouped cloud/local), defaulting to `smart` and remembered across reloads.

**Architecture:** Thin BFF proxy (`/models`) → pure normalize module → rune store (selection synced to `localStorage`) → presentational `ModelPicker.svelte` in a new Composer control row. The chosen `model` is threaded through `Composer.onsubmit(text, model)` → `chat.send(text, model)` → the messages BFF body.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + `@testing-library/svelte`, Playwright. Spec: `docs/superpowers/specs/2026-05-25-donna-p2c-b-model-picker-design.md`.

**Conventions (match existing code):**
- Commit per task. Branch is `p2c-composer-power` (already created off `main`).
- Quality gate after each task that changes `src/`: `npm run check` must report **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal).
- BFF tests mock `$lib/server/lqClient`; component tests use `@testing-library/svelte` + `userEvent`; `chatStream` tests stub `fetch`.
- Icons from `@lucide/svelte`. Tailwind tokens: `mlq-*` (e.g. `border-mlq-subtle`, `text-mlq-muted`, `bg-mlq-surface`, `rounded-mlq-control`).

---

### Task 1: Model types + pure normalize module

**Files:**
- Create: `src/lib/models/types.ts`
- Create: `src/lib/models/normalize.ts`
- Test: `src/lib/models/normalize.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/models/types.ts` (hand-written — the live gateway response carries `lq_ai_resolves_to`/`lq_ai_fallback_count`, which the pinned `backend.d.ts` omits):

```ts
/** A raw entry from GET /api/v1/models (gateway passthrough). `lq_ai_resolves_to`
 *  and `lq_ai_fallback_count` are present live but absent from the pinned OpenAPI,
 *  so we type them here rather than via `npm run gen:api`. */
export interface RawModelEntry {
  id: string;
  object: 'model';
  lq_ai_kind: 'alias' | 'provider_native';
  routed_inference_tier?: number;
  provider_type?: string;
  lq_ai_resolves_to?: string;
  lq_ai_fallback_count?: number;
}

export interface ModelsListResponse {
  object: 'list';
  data: RawModelEntry[];
}

/** A normalized, chat-usable alias for the picker. */
export interface ChatModelOption {
  id: string;
  /** Prettified resolved model, e.g. "Opus 4.7"; '' when unknown. */
  label: string;
  resolvedModel: string | null;
  group: 'cloud' | 'local';
  tier: number | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/models/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toChatOptions, prettifyModel } from './normalize';
import type { RawModelEntry } from './types';

// Trimmed capture of the live /models response (2026-05-25 spike).
const RAW: RawModelEntry[] = [
  { id: 'smart', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7' },
  { id: 'fast', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-sonnet-4-6' },
  { id: 'budget', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-haiku-4-5' },
  { id: 'local', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:9b' },
  { id: 'local-fast', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:4b-nvfp4' },
  { id: 'local-thinking', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 1, lq_ai_resolves_to: 'ollama-local/qwen3.5:9b' },
  { id: 'embedding', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'openai-prod/text-embedding-3-small' },
  { id: 'anthropic-prod/claude-opus-4-7', object: 'model', lq_ai_kind: 'provider_native', routed_inference_tier: 4, provider_type: 'anthropic' },
  { id: 'openai-prod/whisper-1', object: 'model', lq_ai_kind: 'provider_native', routed_inference_tier: 4, provider_type: 'openai' }
];

describe('toChatOptions', () => {
  it('keeps only the 6 chat aliases (drops embedding + provider_native)', () => {
    const ids = toChatOptions(RAW).map((o) => o.id);
    expect(ids).toEqual(['smart', 'fast', 'budget', 'local', 'local-fast', 'local-thinking']);
  });

  it('groups cloud vs local (ollama / tier-1 → local)', () => {
    const byId = Object.fromEntries(toChatOptions(RAW).map((o) => [o.id, o.group]));
    expect(byId.smart).toBe('cloud');
    expect(byId.fast).toBe('cloud');
    expect(byId.local).toBe('local');
    expect(byId['local-fast']).toBe('local');
  });

  it('carries tier and resolved model through', () => {
    const smart = toChatOptions(RAW).find((o) => o.id === 'smart')!;
    expect(smart).toMatchObject({ tier: 4, resolvedModel: 'anthropic-prod/claude-opus-4-7', label: 'Opus 4.7' });
  });
});

describe('prettifyModel', () => {
  it('formats the Claude family', () => {
    expect(prettifyModel('anthropic-prod/claude-opus-4-7')).toBe('Opus 4.7');
    expect(prettifyModel('anthropic-prod/claude-sonnet-4-6')).toBe('Sonnet 4.6');
    expect(prettifyModel('anthropic-prod/claude-haiku-4-5')).toBe('Haiku 4.5');
  });

  it('falls back to the tail for non-Claude models', () => {
    expect(prettifyModel('ollama-local/qwen3.5:9b')).toBe('qwen3.5:9b');
  });

  it('returns empty string for null/empty', () => {
    expect(prettifyModel(null)).toBe('');
    expect(prettifyModel('')).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/models/normalize.test.ts`
Expected: FAIL — `toChatOptions`/`prettifyModel` not exported (module missing).

- [ ] **Step 4: Write the implementation**

Create `src/lib/models/normalize.ts`:

```ts
import type { RawModelEntry, ChatModelOption } from './types';

// Resolved-model substrings that mark a non-chat model (belt-and-suspenders for
// future aliases; today only `embedding` needs filtering among aliases).
const NON_CHAT = [
  'text-embedding', 'whisper', 'tts', 'dall-e', 'gpt-image',
  'image-', 'moderation', 'realtime', 'sora', 'audio', 'transcribe'
];

function isNonChat(entry: RawModelEntry): boolean {
  if (entry.id === 'embedding') return true;
  const r = (entry.lq_ai_resolves_to ?? '').toLowerCase();
  return NON_CHAT.some((needle) => r.includes(needle));
}

/** "anthropic-prod/claude-opus-4-7" → "Opus 4.7"; non-Claude → tail; empty → "". */
export function prettifyModel(resolvesTo: string | null | undefined): string {
  if (!resolvesTo) return '';
  const tail = resolvesTo.split('/').pop() ?? '';
  const m = tail.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (m) {
    const family = m[1][0].toUpperCase() + m[1].slice(1);
    return `${family} ${m[2]}.${m[3]}`;
  }
  return tail;
}

/** Filter the raw /models list to chat-usable aliases, normalized for the picker. */
export function toChatOptions(raw: RawModelEntry[]): ChatModelOption[] {
  return raw
    .filter((e) => e.lq_ai_kind === 'alias' && !isNonChat(e))
    .map((e) => {
      const resolved = e.lq_ai_resolves_to ?? null;
      const isLocal = (resolved ?? '').toLowerCase().startsWith('ollama') || e.routed_inference_tier === 1;
      return {
        id: e.id,
        label: prettifyModel(resolved),
        resolvedModel: resolved,
        group: isLocal ? 'local' : 'cloud',
        tier: e.routed_inference_tier ?? null
      } satisfies ChatModelOption;
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/models/normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/models/types.ts src/lib/models/normalize.ts src/lib/models/normalize.test.ts
git commit -m "feat(p2c-b1): model types + pure normalize (alias filter, cloud/local, prettify)"
```

---

### Task 2: `/models` BFF thin proxy

**Files:**
- Create: `src/routes/(app)/models/+server.ts`
- Test: `src/routes/(app)/models/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/models/server.test.ts` (mirrors `chats/[id]/receipts/server.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({}) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /models', () => {
  it('proxies the models endpoint and returns the body', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/models');
    expect(await res.json()).toEqual({ object: 'list', data: [] });
  });

  it('passes through 503 (gateway unreachable)', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 503 });
  });

  it('passes through 504 (gateway timeout)', async () => {
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

Run: `npx vitest run "src/routes/(app)/models/server.test.ts"`
Expected: FAIL — `./+server` has no `GET` export.

- [ ] **Step 3: Write the implementation**

Create `src/routes/(app)/models/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, '/api/v1/models');
  // 503/504 are the gateway's documented unreachable/timeout signals — pass them
  // through so the client can show "model list unavailable"; map anything else to 502.
  if (!res.ok) throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load models.');
  return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/models/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/models/+server.ts" "src/routes/(app)/models/server.test.ts"
git commit -m "feat(p2c-b1): /models BFF thin proxy (503/504 passthrough, else 502)"
```

---

### Task 3: Model rune store (selection + localStorage + loader)

**Files:**
- Create: `src/lib/models/store.svelte.ts`
- Test: `src/lib/models/store.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/models/store.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModelStore } from './store.svelte';

const ok = (data: unknown) => new Response(JSON.stringify({ object: 'list', data }), { status: 200 });
const ALIASES = [
  { id: 'smart', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7' },
  { id: 'fast', object: 'model', lq_ai_kind: 'alias', routed_inference_tier: 4, lq_ai_resolves_to: 'anthropic-prod/claude-sonnet-4-6' }
];

beforeEach(() => localStorage.clear());

describe('createModelStore', () => {
  it('defaults to smart when nothing is stored', () => {
    expect(createModelStore().selectedModel).toBe('smart');
  });

  it('initializes from localStorage', () => {
    localStorage.setItem('donna.model', 'fast');
    expect(createModelStore().selectedModel).toBe('fast');
  });

  it('setModel updates state and persists', () => {
    const s = createModelStore();
    s.setModel('budget');
    expect(s.selectedModel).toBe('budget');
    expect(localStorage.getItem('donna.model')).toBe('budget');
  });

  it('load() populates normalized options', async () => {
    const s = createModelStore();
    await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
    expect(s.options.map((o) => o.id)).toEqual(['smart', 'fast']);
    expect(s.error).toBe(false);
  });

  it('load() falls back to a static smart option on error', async () => {
    const s = createModelStore();
    await s.load(vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    expect(s.error).toBe(true);
    expect(s.options.map((o) => o.id)).toEqual(['smart']);
  });

  it('resets selection to smart when the stored model is no longer offered', async () => {
    localStorage.setItem('donna.model', 'gone');
    const s = createModelStore();
    expect(s.selectedModel).toBe('gone');
    await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
    expect(s.selectedModel).toBe('smart');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/models/store.svelte.test.ts`
Expected: FAIL — `createModelStore` not exported.

- [ ] **Step 3: Write the implementation**

Create `src/lib/models/store.svelte.ts` (gate on `typeof localStorage` rather than `$app/environment`'s `browser` — `browser` is unreliable under vitest's SSR-context resolution, and the `typeof` guard is true in jsdom and false during SSR):

```ts
import type { ChatModelOption, ModelsListResponse } from './types';
import { toChatOptions } from './normalize';

const STORAGE_KEY = 'donna.model';
const DEFAULT_MODEL = 'smart';
const FALLBACK_OPTIONS: ChatModelOption[] = [
  { id: 'smart', label: '', resolvedModel: null, group: 'cloud', tier: null }
];

const hasStorage = () => typeof localStorage !== 'undefined';

function readStored(): string {
  if (!hasStorage()) return DEFAULT_MODEL;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function createModelStore() {
  let selectedModel = $state(readStored());
  let options = $state<ChatModelOption[]>([]);
  let loading = $state(false);
  let error = $state(false);
  let loaded = false;

  function setModel(id: string) {
    selectedModel = id;
    if (!hasStorage()) return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode / storage disabled — selection stays in memory only */
    }
  }

  function ensureValidSelection() {
    if (!options.some((o) => o.id === selectedModel)) setModel(DEFAULT_MODEL);
  }

  async function load(fetchFn: typeof fetch = fetch) {
    if (loaded) return;
    loading = true;
    error = false;
    try {
      const res = await fetchFn('/models');
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ModelsListResponse;
      const opts = toChatOptions(body.data ?? []);
      options = opts.length ? opts : FALLBACK_OPTIONS;
    } catch {
      error = true;
      options = FALLBACK_OPTIONS;
    } finally {
      ensureValidSelection();
      loaded = true;
      loading = false;
    }
  }

  return {
    get selectedModel() {
      return selectedModel;
    },
    get options() {
      return options;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    setModel,
    load
  };
}

/** App-global singleton: the composer's model selection. */
export const modelStore = createModelStore();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/models/store.svelte.test.ts`
Expected: PASS.

> Note: vitest runs a single `jsdom` project (`vite.config.ts`), which provides `localStorage` and clears cleanly via `beforeEach(() => localStorage.clear())`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/models/store.svelte.ts src/lib/models/store.svelte.test.ts
git commit -m "feat(p2c-b1): model rune store (localStorage-synced selection + loader)"
```

---

### Task 4: `ModelPicker.svelte` (presentational dropdown)

**Files:**
- Create: `src/lib/components/ModelPicker.svelte`
- Test: `src/lib/components/ModelPicker.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/ModelPicker.svelte.test.ts`:

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ModelPicker.svelte.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/ModelPicker.svelte`:

```svelte
<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { ChatModelOption } from '$lib/models/types';

  let {
    options,
    selected,
    error = false,
    onselect
  }: {
    options: ChatModelOption[];
    selected: string;
    error?: boolean;
    onselect: (id: string) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  const current = $derived(options.find((o) => o.id === selected));
  const cloud = $derived(options.filter((o) => o.group === 'cloud'));
  const local = $derived(options.filter((o) => o.group === 'local'));

  function choose(id: string) {
    onselect(id);
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
      class="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
    >
      {#if error}
        <p class="px-3 py-2 text-xs text-mlq-muted">Model list unavailable — sending with smart.</p>
      {/if}
      {#each [{ label: 'Cloud', items: cloud }, { label: 'Local', items: local }] as grp (grp.label)}
        {#if grp.items.length}
          <div class="bg-mlq-subtle/40 px-3 py-1 text-[10px] uppercase tracking-wide text-mlq-muted">{grp.label}</div>
          {#each grp.items as opt (opt.id)}
            <button
              type="button"
              role="option"
              aria-selected={opt.id === selected}
              data-testid={`model-option-${opt.id}`}
              onclick={() => choose(opt.id)}
              class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50 aria-selected:font-semibold"
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ModelPicker.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings". If svelte-check flags the `role="listbox"` / `aria-selected` pairing, add a minimal `<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->` immediately above the offending element (the codebase uses these targeted ignores).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ModelPicker.svelte src/lib/components/ModelPicker.svelte.test.ts
git commit -m "feat(p2c-b1): ModelPicker dropdown (grouped cloud/local, a11y, error note)"
```

---

### Task 5: Thread `model` through the messages BFF

**Files:**
- Modify: `src/routes/(app)/chats/[id]/messages/+server.ts`
- Test: `src/routes/(app)/chats/[id]/messages/server.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/chats/[id]/messages/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
  ({ params: { id: 'c1' }, request: new Request('http://x/chats/c1/messages', { method: 'POST', body: JSON.stringify(body) }) }) as any;

beforeEach(() => lqStream.mockReset());

function sentBody() {
  return JSON.parse((lqStream.mock.calls[0][2] as { body: string }).body);
}

describe('POST messages', () => {
  it('forwards the selected model', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: 'fast' }));
    expect(sentBody()).toMatchObject({ content: 'hi', model: 'fast', stream: true });
  });

  it('defaults to smart when model is absent', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi' }));
    expect(sentBody().model).toBe('smart');
  });

  it('defaults to smart when model is blank', async () => {
    lqStream.mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await POST(event({ content: 'hi', model: '   ' }));
    expect(sentBody().model).toBe('smart');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/messages/server.test.ts"`
Expected: FAIL — current handler hardcodes `model: 'smart'`, so the first test (`model: 'fast'`) fails.

- [ ] **Step 3: Write the implementation**

Replace the body parsing + upstream call in `src/routes/(app)/chats/[id]/messages/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
  let content = '';
  let model = 'smart';
  try {
    const body = (await event.request.json()) as { content?: string; model?: string };
    content = (body.content ?? '').trim();
    const m = (body.model ?? '').trim();
    if (m) model = m;
  } catch {
    content = '';
  }

  const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, model, stream: true })
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
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/messages/+server.ts" "src/routes/(app)/chats/[id]/messages/server.test.ts"
git commit -m "feat(p2c-b1): thread selected model through the messages SSE BFF (default smart)"
```

---

### Task 6: Carry `model` through `chatStream.send` / `retry`

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Test: `src/lib/chat/chatStream.svelte.test.ts` (add a case)

- [ ] **Step 1: Add the failing test**

Append to the `describe('createChatStream', …)` block in `src/lib/chat/chatStream.svelte.test.ts`:

```ts
  it('posts the chosen model in the request body and reuses it on retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
      'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"ok"}}\n\n',
      'data: [DONE]\n\n'
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hi', 'fast');
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({ content: 'hi', model: 'fast' });

    await chat.retry();
    const retryBody = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(retryBody.model).toBe('fast');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts -t "posts the chosen model"`
Expected: FAIL — `send` ignores the second arg; body has no `model`.

- [ ] **Step 3: Write the implementation**

In `src/lib/chat/chatStream.svelte.ts`:

1. Add a `lastModel` field beside `lastUserContent`:

```ts
  let lastUserContent = '';
  let lastModel = 'smart';
```

2. Change `runStream` to accept and send `model`:

```ts
  async function runStream(idx: number, content: string, model: string) {
    status = 'streaming';
    controller = new AbortController();
    try {
      const res = await fetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, model }),
        signal: controller.signal
      });
```

(leave the rest of `runStream` unchanged.)

3. Change `send` to accept `model` (default `'smart'`), record it, and pass it down:

```ts
  async function send(content: string, model = 'smart') {
    if (status === 'streaming') return;
    lastUserContent = content;
    lastModel = model;
    messages = [
      ...messages,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), role: 'user', content },
      { key: crypto.randomUUID(), id: 'pending', role: 'assistant', content: '', status: 'streaming' }
    ];
    await runStream(messages.length - 1, content, model);
  }
```

4. Update the `retry()` call site to pass `lastModel`:

```ts
    await runStream(idx, lastUserContent, lastModel);
```

- [ ] **Step 4: Run the full chatStream suite to verify it passes (and nothing regressed)**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS — the new case plus all existing cases (existing `send('hi')` calls still work via the `model = 'smart'` default).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(p2c-b1): carry selected model through chatStream send/retry"
```

---

### Task 7: Composer control row + ModelPicker wiring

**Files:**
- Modify: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.test.ts` (add a case)

- [ ] **Step 1: Add the failing test**

Append to the `describe('Composer', …)` block in `src/lib/components/Composer.test.ts`:

```ts
  it('renders the model picker and submits the selected model', async () => {
    const onsubmit = vi.fn();
    const { getByRole, getByTestId } = render(Composer, { props: { onsubmit } });
    expect(getByTestId('model-picker')).toBeInTheDocument();
    await userEvent.type(getByRole('textbox'), 'hello');
    await userEvent.click(getByRole('button', { name: /send/i }));
    expect(onsubmit).toHaveBeenCalledWith('hello', expect.any(String));
  });
```

> The picker defaults to `smart` (its `load()` runs on mount but isn't awaited in the test; the store's initial `selectedModel` is already `smart`). Asserting `expect.any(String)` keeps the test robust to fetch timing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Composer.test.ts -t "renders the model picker"`
Expected: FAIL — no `model-picker` testid; `onsubmit` called with one arg.

- [ ] **Step 3: Write the implementation**

Replace `src/lib/components/Composer.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowRight, Square } from '@lucide/svelte';
  import ModelPicker from './ModelPicker.svelte';
  import { modelStore } from '$lib/models/store.svelte';

  let {
    value = $bindable(''),
    placeholder = 'Ask a question about your documents…',
    onsubmit,
    streaming = false,
    onstop
  }: {
    value?: string;
    placeholder?: string;
    onsubmit?: (text: string, model: string) => void;
    streaming?: boolean;
    onstop?: () => void;
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
    onsubmit?.(text, modelStore.selectedModel);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) submit();
    }
  }
</script>

<div class="rounded-t-mlq-composer border border-mlq-subtle bg-mlq-surface p-3 shadow-sm">
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

- [ ] **Step 4: Run the full Composer suite to verify it passes**

Run: `npx vitest run src/lib/components/Composer.test.ts`
Expected: PASS — the new case plus the existing four (Enter-to-submit now reports `('hello', 'smart')`; the existing `toHaveBeenCalledTimes(1)`/`not.toHaveBeenCalled()` assertions are unaffected).

- [ ] **Step 5: Verify check is clean**

Run: `npm run check`
Expected: "0 errors and 0 warnings".

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.test.ts
git commit -m "feat(p2c-b1): composer control row hosting the model picker"
```

---

### Task 8: Wire the chat page to pass the model

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte:20-23`

- [ ] **Step 1: Update the submit handler**

In `src/routes/(app)/chats/[id]/+page.svelte`, change `submit` to accept and forward the model:

```svelte
  function submit(text: string, model = 'smart') {
    draftValue = '';
    chat.send(text, model);
  }
```

(The `onMount` land→stream call `submit(data.draft)` keeps working — `model` defaults to `'smart'` for the auto-sent landing draft, which has no picker.)

- [ ] **Step 2: Verify check + the existing chat-stream unit suite**

Run: `npm run check && npx vitest run`
Expected: check shows "0 errors and 0 warnings"; all unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p2c-b1): pass picker model from chat page into chat.send"
```

---

### Task 9: Live e2e + full gate

**Files:**
- Create: `tests/model-picker.spec.ts`

**Prereqs (run once):**

```bash
cd /Users/kevinkeller/Code/Donna
set -a; . ./.env; set +a
docker compose up -d --build donna-web    # rebuild the app with the new code
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
```

- [ ] **Step 1: Write the e2e test**

Create `tests/model-picker.spec.ts`:

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

test('model picker offers grouped aliases, sends the chosen model, and persists', async ({ page }) => {
  await login(page);

  // Start a chat from the landing composer (defaults to smart).
  await page.fill('textarea', 'In one short sentence, what is an NDA?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });

  // Open the picker: it lists the curated aliases (smart + fast at least).
  await page.getByTestId('model-picker').click();
  await expect(page.getByTestId('model-option-fast')).toBeVisible();
  await expect(page.getByTestId('model-option-smart')).toBeVisible();

  // Select fast, then send a second message; assert the outgoing body carries model=fast.
  await page.getByTestId('model-option-fast').click();
  await expect(page.getByTestId('model-picker')).toContainText('fast');

  const reqPromise = page.waitForRequest(
    (r: any) => r.url().includes('/messages') && r.method() === 'POST'
  );
  await page.fill('textarea', 'And what does it protect?');
  await page.keyboard.press('Enter');
  const req = await reqPromise;
  expect(JSON.parse(req.postData() || '{}').model).toBe('fast');

  // Selection persists across reload (localStorage).
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('model-picker')).toContainText('fast');
});
```

- [ ] **Step 2: Run the e2e against the running stack**

Run: `npx playwright test tests/model-picker.spec.ts`
Expected: PASS. If the picker text doesn't update to `fast`, confirm `donna-web` was rebuilt (`docker compose up -d --build donna-web`).

- [ ] **Step 3: Full gate**

Run: `npm run check && npx vitest run && npx playwright test`
Expected: check "0 errors and 0 warnings"; all unit specs pass; all Playwright specs pass (the new one + the existing streaming/citation/receipts suites — confirm no regression from the Composer restructure).

- [ ] **Step 4: Commit**

```bash
git add tests/model-picker.spec.ts
git commit -m "test(p2c-b1): live e2e for model picker (grouped aliases, sends model, persists)"
```

---

## Self-review

**Spec coverage:**
- Picker contents (6 chat aliases, grouped, filter embedding+native) → Task 1 (`toChatOptions`).
- Persistence (sticky + localStorage, default smart) → Task 3 (store).
- Placement (control row beneath textarea) → Task 7 (Composer).
- Trigger label (alias + resolved model) → Task 4 (ModelPicker) + `prettifyModel` Task 1.
- Architecture (thin proxy + rune store) → Tasks 2 + 3.
- Threading model → BFF → Tasks 5 (BFF) + 6 (chatStream) + 8 (page).
- Error handling: `/models` failure fallback → Tasks 2 (502/503/504) + 3 (FALLBACK_OPTIONS) + 4 (note); localStorage unavailable → Task 3 (try/catch); stale stored model → Task 3 (`ensureValidSelection`); unknown model posted → Task 5 (forward as-is); tier badge unchanged → not touched (no task needed).
- Testing: unit (Tasks 1,3), component (Tasks 4,7), BFF (Tasks 2,5), chatStream (Task 6), live e2e (Task 9).

**Out of scope (correctly absent):** provider-native catalog, per-chat server-side memory, B2/B3.

**Type consistency:** `ChatModelOption` fields (`id/label/resolvedModel/group/tier`) are used identically in Tasks 1, 3, 4. `modelStore` API (`options/selectedModel/error/setModel/load`) matches between Task 3 and Task 7. `send(content, model)` signature matches between Task 6 and Tasks 7/8. `onsubmit(text, model)` matches between Composer (Task 7) and the page (Task 8).

**Follow-up (non-blocking, not a task here):** optionally file `docs/upstream-requests/models-resolves-to-fields.md` asking lq-ai to document `lq_ai_resolves_to`/`lq_ai_fallback_count` in the `/models` 200 schema so `gen:api` emits them and `src/lib/models/types.ts` can drop its hand-written extension.
