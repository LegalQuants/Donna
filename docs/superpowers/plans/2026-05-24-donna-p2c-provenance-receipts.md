# P2c Slice A — Provenance (Receipts drawer + anonymization indicator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-chat Receipts drawer (right slide-over: provenance timeline, kind filters, JSONL export) plus a per-assistant-message "Anonymized" badge, both driven by `GET /chats/{id}/receipts`.

**Architecture:** Pure `describeEvent`/`anonymizedByMessage` helpers format the free-form receipt `detail`; a controlled `ReceiptsDrawer` fetches on open and renders `ReceiptEventRow`s; two BFF routes proxy the receipts JSON and the JSONL export. The anonymization badge reads `anonymization_applied` from the `inference` event correlated to each message by `message_id` (history: in `load`; fresh: after stream completes — same pattern as P2b citations).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind v4 (`mlq-*`), `@lucide/svelte`, vitest + @testing-library/svelte, Playwright. Backend: lq-ai pinned at `4df3b9b` (already bumped on this branch).

**Spec:** `docs/superpowers/specs/2026-05-24-donna-p2c-provenance-receipts-design.md`

**Conventions:** commit per task and push; `npm run check` = **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless — exit 0 + the "0 errors and 0 warnings" line is the signal); icons via `@lucide/svelte`; run a single unit file with `npx vitest run <path>`. The stack is up (compose project `donna`); **anonymization is enabled** in the gateway for the indicator e2e (see spec §7/§8; recorded in dev-stack memory).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/receipts/types.ts` (new) | `ReceiptKind`, `ReceiptEvent` |
| `src/lib/receipts/format.ts` (new) | pure `describeEvent`, `anonStatus`, `anonymizedByMessage` |
| `src/routes/(app)/chats/[id]/receipts/+server.ts` (new) | BFF: receipts JSON (forwards `event_kinds`) |
| `src/routes/(app)/chats/[id]/receipts/export.jsonl/+server.ts` (new) | BFF: JSONL export (forwards download headers) |
| `src/lib/components/ReceiptEventRow.svelte` (new) | two-line event row + raw-detail expander |
| `src/lib/components/ReceiptsDrawer.svelte` (new) | slide-over panel: fetch/state/filter/export |
| `src/routes/(app)/chats/[id]/+page.svelte` (modify) | slim header bar + Receipts toggle + drawer mount |
| `src/lib/chat/chatStream.svelte.ts` (modify) | `ChatMessage.anonymized`; fetch after done; clear on retry |
| `src/routes/(app)/chats/[id]/+page.server.ts` (modify) | history: set `anonymized` per message |
| `src/lib/components/Message.svelte` (modify) | render the "Anonymized" badge |
| `tests/receipts-drawer.spec.ts` (new) | live e2e: drawer |
| `tests/anonymization-indicator.spec.ts` (new) | live e2e: badge true + no-false-positive |

---

### Task 1: Receipt types + formatting helpers

**Files:**
- Create: `src/lib/receipts/types.ts`
- Create: `src/lib/receipts/format.ts`
- Test: `src/lib/receipts/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/receipts/format.test.ts
import { describe, it, expect } from 'vitest';
import { describeEvent, anonStatus, anonymizedByMessage } from './format';
import type { ReceiptEvent } from './types';

const ev = (kind: string, detail: Record<string, unknown>): ReceiptEvent => ({ ts: '2026-05-25T05:04:31Z', kind, detail });

describe('describeEvent', () => {
  it('assistant message → label + token detail', () => {
    const v = describeEvent(ev('message', { role: 'assistant', message_kind: 'ai', prompt_tokens: 379, completion_tokens: 428 }));
    expect(v.label).toBe('Assistant');
    expect(v.detail).toBe('379 prompt · 428 completion tokens');
  });
  it('user message → You', () => {
    expect(describeEvent(ev('message', { role: 'user' })).label).toBe('You');
  });
  it('retrieval → chunk/KB summary', () => {
    const v = describeEvent(ev('retrieval', { details: { kb_ids: ['k'], chunk_count: 1, query_token_estimate: 18 } }));
    expect(v.label).toMatch(/retrieval/i);
    expect(v.detail).toBe('1 chunk · from 1 KB · ~18 query tokens');
  });
  it('inference → model label, tier, facts', () => {
    const v = describeEvent(ev('inference', { provider: 'anthropic-prod', model: 'claude-opus-4-7', tier: 4, tokens_in: 379, tokens_out: 428, latency_ms: 7589, refused: false }));
    expect(v.label).toBe('claude-opus-4-7');
    expect(v.tier).toBe(4);
    expect(v.detail).toBe('anthropic-prod · 379→428 tokens · 7.6s');
    expect(v.tone).toBe('default');
  });
  it('refused/error → error tone + reason', () => {
    const v = describeEvent(ev('error', { model: 'x', tier: 5, refused: true, refusal_reason: 'tier-floor not met' }));
    expect(v.tone).toBe('error');
    expect(v.label).toMatch(/refused/i);
    expect(v.detail).toBe('tier-floor not met');
  });
  it('skill → name', () => {
    expect(describeEvent(ev('skill', { name: 'nda-review' })).detail).toBe('nda-review');
  });
  it('unknown kind → generic, never throws', () => {
    const v = describeEvent(ev('whatever', {}));
    expect(v.label).toBe('whatever');
    expect(v.tone).toBe('default');
  });
  it('tolerates missing detail fields', () => {
    expect(() => describeEvent(ev('inference', {}))).not.toThrow();
  });
});

describe('anonStatus', () => {
  it('applied / none / null', () => {
    expect(anonStatus(ev('inference', { anonymization_applied: true }))).toBe('applied');
    expect(anonStatus(ev('inference', { anonymization_applied: false }))).toBe('none');
    expect(anonStatus(ev('message', { anonymization_applied: true }))).toBeNull();
  });
});

describe('anonymizedByMessage', () => {
  it('maps message_id → anonymization_applied for inference events only', () => {
    const m = anonymizedByMessage([
      ev('inference', { message_id: 'a', anonymization_applied: true }),
      ev('inference', { message_id: 'b', anonymization_applied: false }),
      ev('inference', { message_id: null, anonymization_applied: true }),
      ev('message', { message_id: 'c', anonymization_applied: true })
    ]);
    expect(m.get('a')).toBe(true);
    expect(m.get('b')).toBe(false);
    expect(m.has('c')).toBe(false);
    expect(m.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/receipts/format.test.ts`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Write the types**

```ts
// src/lib/receipts/types.ts
export type ReceiptKind = 'message' | 'retrieval' | 'inference' | 'skill' | 'audit' | 'error';

/** One event from GET /chats/{id}/receipts. `detail` is free-form per kind. */
export interface ReceiptEvent {
  ts: string;
  kind: ReceiptKind | (string & {});
  detail: Record<string, unknown>;
}
```

- [ ] **Step 4: Write the formatters**

```ts
// src/lib/receipts/format.ts
import type { ReceiptEvent } from './types';

export interface EventView {
  label: string;
  detail: string;
  tone: 'default' | 'error';
  tier?: number;
}

const num = (d: Record<string, unknown>, k: string): number | undefined =>
  typeof d[k] === 'number' ? (d[k] as number) : undefined;
const str = (d: Record<string, unknown>, k: string): string | undefined =>
  typeof d[k] === 'string' ? (d[k] as string) : undefined;

export function describeEvent(e: ReceiptEvent): EventView {
  const d = e.detail ?? {};
  switch (e.kind) {
    case 'message': {
      const assistant = d.role === 'assistant' || d.message_kind === 'ai';
      const parts: string[] = [];
      const pt = num(d, 'prompt_tokens');
      const ct = num(d, 'completion_tokens');
      if (pt != null) parts.push(`${pt} prompt`);
      if (ct != null) parts.push(`${ct} completion`);
      return {
        label: assistant ? 'Assistant' : 'You',
        detail: parts.length ? `${parts.join(' · ')} tokens` : 'message',
        tone: 'default'
      };
    }
    case 'retrieval': {
      const det = (d.details ?? {}) as Record<string, unknown>;
      const chunks = num(det, 'chunk_count');
      const kbs = Array.isArray(det.kb_ids) ? (det.kb_ids as unknown[]).length : undefined;
      const qt = num(det, 'query_token_estimate');
      const bits: string[] = [];
      if (chunks != null) bits.push(`${chunks} chunk${chunks === 1 ? '' : 's'}`);
      if (kbs != null) bits.push(`from ${kbs} KB${kbs === 1 ? '' : 's'}`);
      if (qt != null) bits.push(`~${qt} query tokens`);
      return { label: 'Knowledge-base retrieval', detail: bits.join(' · ') || 'retrieved context', tone: 'default' };
    }
    case 'inference':
    case 'error': {
      const tier = num(d, 'tier');
      if (e.kind === 'error' || d.refused === true) {
        return { label: 'Inference refused', detail: str(d, 'refusal_reason') ?? 'inference refused', tone: 'error', tier };
      }
      const ti = num(d, 'tokens_in');
      const to = num(d, 'tokens_out');
      const lat = num(d, 'latency_ms');
      const bits: string[] = [];
      const provider = str(d, 'provider');
      if (provider) bits.push(provider);
      if (ti != null && to != null) bits.push(`${ti}→${to} tokens`);
      if (lat != null) bits.push(`${(lat / 1000).toFixed(1)}s`);
      return { label: str(d, 'model') ?? 'inference', detail: bits.join(' · '), tone: 'default', tier };
    }
    case 'skill':
      return { label: 'Skill applied', detail: str(d, 'name') ?? str(d, 'skill') ?? str(d, 'skill_name') ?? 'skill', tone: 'default' };
    case 'audit':
      return { label: 'Audit', detail: str(d, 'action') ?? 'audit event', tone: 'default' };
    default:
      return { label: String(e.kind || 'event'), detail: '', tone: 'default' };
  }
}

/** Anonymization status for an inference/error event, or null for other kinds. */
export function anonStatus(e: ReceiptEvent): 'applied' | 'none' | null {
  if (e.kind !== 'inference' && e.kind !== 'error') return null;
  const a = e.detail?.anonymization_applied;
  if (a === true) return 'applied';
  if (a === false) return 'none';
  return null;
}

/** message_id → anonymization_applied, from inference/error events that carry both. */
export function anonymizedByMessage(events: ReceiptEvent[]): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const e of events) {
    if (e.kind !== 'inference' && e.kind !== 'error') continue;
    const mid = e.detail?.message_id;
    const a = e.detail?.anonymization_applied;
    if (typeof mid === 'string' && typeof a === 'boolean') m.set(mid, a);
  }
  return m;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/receipts/format.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/receipts/types.ts src/lib/receipts/format.ts src/lib/receipts/format.test.ts
git commit -m "feat(p2c-a): receipt types + describeEvent/anonStatus/anonymizedByMessage"
git push
```

---

### Task 2: Receipts BFF route

**Files:**
- Create: `src/routes/(app)/chats/[id]/receipts/+server.ts`
- Test: `src/routes/(app)/chats/[id]/receipts/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/chats/[id]/receipts/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (qs = '') =>
  ({ params: { id: 'c1' }, url: new URL(`http://x/chats/c1/receipts${qs}`) }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET receipts', () => {
  it('proxies the receipts endpoint', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify([{ ts: 't', kind: 'message', detail: {} }]), { status: 200 }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts');
    expect(await res.json()).toHaveLength(1);
  });
  it('forwards the event_kinds filter', async () => {
    lqFetch.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(event('?event_kinds=inference'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts?event_kinds=inference');
  });
  it('maps 403 to 403', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 403 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/receipts/server.test.ts"`
Expected: FAIL — `Cannot find module './+server'`.

- [ ] **Step 3: Write the route**

```ts
// src/routes/(app)/chats/[id]/receipts/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const kinds = event.url.searchParams.get('event_kinds');
  const path = `/api/v1/chats/${event.params.id}/receipts${kinds ? `?event_kinds=${encodeURIComponent(kinds)}` : ''}`;
  const res = await lqFetch(event, path);
  if (!res.ok) throw error(res.status === 403 ? 403 : res.status === 404 ? 404 : 502, 'Could not load receipts.');
  return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/receipts/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/receipts/+server.ts" "src/routes/(app)/chats/[id]/receipts/server.test.ts"
git commit -m "feat(p2c-a): receipts BFF proxy (forwards event_kinds)"
git push
```

---

### Task 3: Export BFF route

**Files:**
- Create: `src/routes/(app)/chats/[id]/receipts/export.jsonl/+server.ts`
- Test: `src/routes/(app)/chats/[id]/receipts/export.jsonl/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/chats/[id]/receipts/export.jsonl/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({ params: { id: 'c1' } }) as any;
beforeEach(() => lqFetch.mockReset());

describe('GET receipts export', () => {
  it('forwards body + content-disposition for download', async () => {
    lqFetch.mockResolvedValue(new Response('{"ts":"t"}\n', {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson', 'content-disposition': 'attachment; filename="x.jsonl"' }
    }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts/export.jsonl');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toContain('"ts"');
  });
  it('synthesizes a filename when upstream omits content-disposition', async () => {
    lqFetch.mockResolvedValue(new Response('', { status: 200 }));
    const res = await GET(event());
    expect(res.headers.get('content-disposition')).toContain('chat-c1-receipts.jsonl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/chats/[id]/receipts/export.jsonl/server.test.ts"`
Expected: FAIL — `Cannot find module './+server'`.

- [ ] **Step 3: Write the route**

```ts
// src/routes/(app)/chats/[id]/receipts/export.jsonl/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/chats/${event.params.id}/receipts/export.jsonl`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not export receipts.');
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/x-ndjson',
      'content-disposition':
        res.headers.get('content-disposition') ?? `attachment; filename="chat-${event.params.id}-receipts.jsonl"`,
      'cache-control': 'no-store'
    }
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/chats/[id]/receipts/export.jsonl/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/chats/[id]/receipts/export.jsonl"
git commit -m "feat(p2c-a): receipts JSONL export BFF passthrough"
git push
```

---

### Task 4: `ReceiptEventRow.svelte`

**Files:**
- Create: `src/lib/components/ReceiptEventRow.svelte`
- Test: `src/lib/components/ReceiptEventRow.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ReceiptEventRow from './ReceiptEventRow.svelte';
import type { ReceiptEvent } from '$lib/receipts/types';

const inf: ReceiptEvent = { ts: '2026-05-25T05:04:39Z', kind: 'inference', detail: { provider: 'anthropic-prod', model: 'claude-opus-4-7', tier: 4, tokens_in: 379, tokens_out: 428, latency_ms: 7589, refused: false, anonymization_applied: true, message_id: 'm1' } };

describe('ReceiptEventRow', () => {
  it('renders label, detail, tier badge, and anonymization status', () => {
    const { getByText } = render(ReceiptEventRow, { props: { event: inf } });
    expect(getByText('claude-opus-4-7')).toBeInTheDocument();
    expect(getByText(/anthropic-prod/)).toBeInTheDocument();
    expect(getByText(/Tier 4/)).toBeInTheDocument();
    expect(getByText(/Anonymized/i)).toBeInTheDocument();
  });
  it('toggles the raw-detail expander', async () => {
    const { getByRole, queryByText, getByText } = render(ReceiptEventRow, { props: { event: inf } });
    expect(queryByText(/"message_id": "m1"/)).toBeNull();
    await fireEvent.click(getByRole('button', { name: /details/i }));
    expect(getByText(/"message_id": "m1"/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ReceiptEventRow.svelte.test.ts`
Expected: FAIL — cannot resolve `./ReceiptEventRow.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/components/ReceiptEventRow.svelte -->
<script lang="ts">
  import { MessageSquare, Search, Cpu, Puzzle, Shield, TriangleAlert, Dot, ShieldCheck } from '@lucide/svelte';
  import { describeEvent, anonStatus } from '$lib/receipts/format';
  import type { ReceiptEvent } from '$lib/receipts/types';

  let { event }: { event: ReceiptEvent } = $props();

  const view = $derived(describeEvent(event));
  const anon = $derived(anonStatus(event));
  let showRaw = $state(false);

  const ICONS: Record<string, typeof MessageSquare> = {
    message: MessageSquare, retrieval: Search, inference: Cpu, skill: Puzzle, audit: Shield, error: TriangleAlert
  };
  const Icon = $derived(ICONS[event.kind] ?? Dot);
  const time = $derived(new Date(event.ts).toLocaleTimeString());
  const raw = $derived(JSON.stringify(event.detail, null, 2));
</script>

<div class="row" class:err={view.tone === 'error'}>
  <div class="ico ico-{event.kind}"><Icon size={14} /></div>
  <div class="body">
    <div class="top">
      <span class="lbl">
        {view.label}
        {#if view.tier != null}<span class="tier">Tier {view.tier}</span>{/if}
      </span>
      <span class="ts">{time}</span>
    </div>
    {#if view.detail}<div class="sub">{view.detail}</div>{/if}
    {#if anon}
      <div class="anon" class:on={anon === 'applied'}>
        {#if anon === 'applied'}<ShieldCheck size={11} /> Anonymized{:else}<Shield size={11} /> No anonymization{/if}
      </div>
    {/if}
    <button type="button" class="raw-toggle" onclick={() => (showRaw = !showRaw)}>{showRaw ? 'Hide details' : 'Details'}</button>
    {#if showRaw}<pre class="raw">{raw}</pre>{/if}
  </div>
</div>

<style>
  .row { display: flex; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--color-mlq-subtle); font-family: var(--font-sans); }
  .ico { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex: none; color: var(--color-mlq-muted); background: var(--color-mlq-surface-alt); }
  .ico-retrieval { color: var(--color-mlq-workflow); } .ico-inference { color: var(--color-mlq-success); } .ico-error { color: var(--color-mlq-error); }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--color-mlq-text); }
  .lbl { font-weight: 600; display: flex; align-items: center; gap: 5px; }
  .tier { font-size: 9.5px; font-weight: 700; color: #fff; background: var(--color-mlq-success); border-radius: 999px; padding: 1px 6px; }
  .ts { font-variant-numeric: tabular-nums; color: var(--color-mlq-muted); font-size: 10.5px; }
  .sub { font-size: 11.5px; color: var(--color-mlq-muted); margin-top: 2px; line-height: 1.4; }
  .err .sub, .err .lbl { color: var(--color-mlq-error); }
  .anon { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; color: var(--color-mlq-muted); margin-top: 3px; }
  .anon.on { color: var(--color-mlq-success); }
  .raw-toggle { font-size: 10.5px; color: var(--color-mlq-workflow); background: none; border: none; padding: 3px 0 0; cursor: pointer; }
  .raw { font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--color-mlq-text); background: var(--color-mlq-surface-alt); border-radius: 6px; padding: 6px 8px; margin: 4px 0 0; overflow-x: auto; white-space: pre; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ReceiptEventRow.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: `npm run check`**

Run: `npm run check`
Expected: 0 errors / 0 warnings. (If svelte-check warns that `Icon`/`$derived` of a component needs a capitalized binding — it's already capitalized; keep as-is.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ReceiptEventRow.svelte src/lib/components/ReceiptEventRow.svelte.test.ts
git commit -m "feat(p2c-a): ReceiptEventRow (two-line + tier/anon + raw expander)"
git push
```

---

### Task 5: `ReceiptsDrawer.svelte`

**Files:**
- Create: `src/lib/components/ReceiptsDrawer.svelte`
- Test: `src/lib/components/ReceiptsDrawer.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ReceiptsDrawer from './ReceiptsDrawer.svelte';

const EVENTS = [
  { ts: '2026-05-25T05:04:31Z', kind: 'message', detail: { role: 'user' } },
  { ts: '2026-05-25T05:04:39Z', kind: 'inference', detail: { provider: 'anthropic-prod', model: 'claude-opus-4-7', tier: 4, refused: false, anonymization_applied: false, message_id: 'm1' } }
];

afterEach(() => vi.unstubAllGlobals());

describe('ReceiptsDrawer', () => {
  it('fetches on open and renders rows; export link points at the BFF route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(EVENTS), { status: 200 })));
    const { getByText, getByRole } = render(ReceiptsDrawer, { props: { chatId: 'c1', open: true, onclose: () => {} } });
    await waitFor(() => expect(getByText('claude-opus-4-7')).toBeInTheDocument());
    expect(getByText('You')).toBeInTheDocument();
    const link = getByRole('link', { name: /export/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/chats/c1/receipts/export.jsonl');
  });

  it('filters by kind chip (client-side)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(EVENTS), { status: 200 })));
    const { getByText, queryByText, getByRole } = render(ReceiptsDrawer, { props: { chatId: 'c1', open: true, onclose: () => {} } });
    await waitFor(() => expect(getByText('claude-opus-4-7')).toBeInTheDocument());
    await fireEvent.click(getByRole('button', { name: /^message/i })); // toggle message OFF
    expect(queryByText('You')).toBeNull();
    expect(getByText('claude-opus-4-7')).toBeInTheDocument(); // inference still shown
  });

  it('shows an error state with Retry on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 502 })));
    const { getByText, getByRole } = render(ReceiptsDrawer, { props: { chatId: 'c1', open: true, onclose: () => {} } });
    await waitFor(() => expect(getByText(/couldn.t load receipts/i)).toBeInTheDocument());
    expect(getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onclose on Escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
    let closed = false;
    const { container } = render(ReceiptsDrawer, { props: { chatId: 'c1', open: true, onclose: () => (closed = true) } });
    await fireEvent.keyDown(container, { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ReceiptsDrawer.svelte.test.ts`
Expected: FAIL — cannot resolve `./ReceiptsDrawer.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/components/ReceiptsDrawer.svelte -->
<script lang="ts">
  import { X, Download } from '@lucide/svelte';
  import ReceiptEventRow from './ReceiptEventRow.svelte';
  import type { ReceiptEvent, ReceiptKind } from '$lib/receipts/types';

  let { chatId, open, onclose }: { chatId: string; open: boolean; onclose: () => void } = $props();

  let status = $state<'idle' | 'loading' | 'error' | 'ready'>('idle');
  let events = $state<ReceiptEvent[]>([]);
  let offKinds = $state<Set<string>>(new Set()); // kinds toggled OFF

  async function load() {
    status = 'loading';
    try {
      const res = await fetch(`/chats/${chatId}/receipts`);
      if (!res.ok) { status = 'error'; return; }
      events = (await res.json()) as ReceiptEvent[];
      status = 'ready';
    } catch {
      status = 'error';
    }
  }

  // Fetch each time the drawer opens (chats are bounded; reflects new turns).
  $effect(() => {
    if (open) { offKinds = new Set(); load(); }
  });

  // Esc closes while open.
  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const presentKinds = $derived([...new Set(events.map((e) => e.kind))] as string[]);
  const shown = $derived(events.filter((e) => !offKinds.has(e.kind)));

  function toggle(kind: string) {
    const next = new Set(offKinds);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    offKinds = next;
  }
</script>

{#if open}
  <div class="scrim" onclick={onclose} role="presentation"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Receipts">
    <header class="hd">
      <h2>Receipts {#if status === 'ready'}<span class="count">· {events.length} events</span>{/if}</h2>
      <div class="actions">
        <a class="exp" href={`/chats/${chatId}/receipts/export.jsonl`} download><Download size={13} /> Export</a>
        <button type="button" class="close" aria-label="Close receipts" onclick={onclose}><X size={16} /></button>
      </div>
    </header>

    {#if status === 'ready' && events.length > 0}
      <div class="chips">
        {#each presentKinds as k (k)}
          <button type="button" class="chip" class:off={offKinds.has(k)} onclick={() => toggle(k)}>{k}</button>
        {/each}
      </div>
    {/if}

    <div class="scroll">
      {#if status === 'loading'}
        <p class="state">Loading…</p>
      {:else if status === 'error'}
        <p class="state">Couldn't load receipts. <button type="button" class="retry" onclick={load}>Retry</button></p>
      {:else if events.length === 0}
        <p class="state">No receipts yet for this chat.</p>
      {:else}
        {#each shown as e (e.ts + e.kind + JSON.stringify(e.detail).length)}
          <ReceiptEventRow event={e} />
        {/each}
      {/if}
    </div>
  </aside>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgb(17 24 39 / 12%); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 90vw); background: var(--color-mlq-surface); border-left: 1px solid var(--color-mlq-subtle); box-shadow: -8px 0 28px rgb(0 0 0 / 10%); z-index: 41; display: flex; flex-direction: column; font-family: var(--font-sans); }
  .hd { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--color-mlq-subtle); }
  .hd h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--color-mlq-strong); }
  .count { font-weight: 400; color: var(--color-mlq-muted); font-size: 12px; }
  .actions { display: flex; align-items: center; gap: 10px; }
  .exp { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--color-mlq-workflow); text-decoration: none; }
  .close { border: none; background: none; color: var(--color-mlq-muted); cursor: pointer; padding: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--color-mlq-subtle); }
  .chip { font-size: 10.5px; text-transform: capitalize; border: 1px solid var(--color-mlq-subtle); border-radius: 999px; padding: 2px 9px; background: var(--color-mlq-surface-alt); color: var(--color-mlq-text); cursor: pointer; }
  .chip.off { opacity: 0.4; text-decoration: line-through; }
  .scroll { overflow-y: auto; flex: 1; }
  .state { padding: 18px 14px; font-size: 13px; color: var(--color-mlq-muted); }
  .retry { font-size: 12px; color: var(--color-mlq-workflow); background: none; border: none; cursor: pointer; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ReceiptsDrawer.svelte.test.ts`
Expected: PASS (4 cases). If svelte-check later flags the `.scrim` click handler a11y, the `role="presentation"` is already set; add `<!-- svelte-ignore a11y_no_static_element_interactions -->` above it if needed (keep behavior).

- [ ] **Step 5: `npm run check`**

Run: `npm run check`
Expected: 0 errors / 0 warnings. Add minimal `<!-- svelte-ignore ... -->` comments only if needed for the scrim/keydown a11y, without changing behavior.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ReceiptsDrawer.svelte src/lib/components/ReceiptsDrawer.svelte.test.ts
git commit -m "feat(p2c-a): ReceiptsDrawer (fetch-on-open, filter chips, export, states)"
git push
```

---

### Task 6: Chat header bar + Receipts toggle

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.svelte`

No new unit test (wiring; covered by the live e2e in Task 10). Verify via `npm run check`.

- [ ] **Step 1: Add the import + state**

In `src/routes/(app)/chats/[id]/+page.svelte`, add to the `<script>` (after the existing imports):

```ts
  import ReceiptsDrawer from '$lib/components/ReceiptsDrawer.svelte';
  import { ReceiptText } from '@lucide/svelte';
```

And add state (near `let draftValue`):

```ts
  let showReceipts = $state(false);
```

- [ ] **Step 2: Add the header bar + drawer to the markup**

Change the outer wrapper to include a slim header bar at the top, and mount the drawer. Replace the opening of the template:

```svelte
<div class="flex h-full flex-col">
  <div bind:this={scroller} class="flex-1 overflow-y-auto">
```

with:

```svelte
<div class="flex h-full flex-col">
  <div class="flex items-center justify-end border-b border-mlq-subtle px-6 py-2">
    <button
      type="button"
      onclick={() => (showReceipts = true)}
      class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
    >
      <ReceiptText size={14} /> Receipts
    </button>
  </div>

  <div bind:this={scroller} class="flex-1 overflow-y-auto">
```

Then, just before the final closing `</div>` of the component, mount the drawer:

```svelte
  <ReceiptsDrawer chatId={data.chatId} open={showReceipts} onclose={() => (showReceipts = false)} />
</div>
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: 0 errors / 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p2c-a): chat header bar with Receipts drawer toggle"
git push
```

---

### Task 7: `chatStream` — anonymized field + fetch after completion

**Files:**
- Modify: `src/lib/chat/chatStream.svelte.ts`
- Modify: `src/lib/chat/chatStream.svelte.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/lib/chat/chatStream.svelte.test.ts` (inside the `describe`):

```ts
  it('sets anonymized from the inference receipt after completion', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"type":"start","lq_ai_message_id":"a1","chat_id":"c1"}\n\n',
        'data: {"type":"complete","lq_ai_message_id":"a1","message":{"id":"a1","content":"hi"}}\n\n',
        'data: [DONE]\n\n'
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { ts: 't', kind: 'inference', detail: { message_id: 'a1', anonymization_applied: true } }
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chat = createChatStream('c1');
    await chat.send('hello');
    expect(fetchMock.mock.calls[1][0]).toBe('/chats/c1/messages/a1/citations');
    expect(fetchMock.mock.calls[2][0]).toBe('/chats/c1/receipts?event_kinds=inference');
    expect(chat.messages[1].anonymized).toBe(true);
  });
```

(Note: the citations fetch from P2b runs first only when markers are present; "hi" has none, so the **only** post-completion fetch is the anonymization one. Adjust the indices: with no markers, `loadCitations` issues no fetch, so the receipts call is `calls[1]`. Use the assertion below instead.)

Replace the two `mock.calls[...]` assertions in the test above with:

```ts
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/chats/c1/receipts?event_kinds=inference');
    expect(chat.messages[1].anonymized).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: FAIL — `anonymized` is undefined; no receipts fetch.

- [ ] **Step 3: Update `chatStream.svelte.ts`**

3a. Add to imports:

```ts
import { anonymizedByMessage } from '$lib/receipts/format';
import type { ReceiptEvent } from '$lib/receipts/types';
```

3b. In the `ChatMessage` interface, add after `citations?: Citation[];`:

```ts
  anonymized?: boolean;
```

3c. Add a helper next to `loadCitations`:

```ts
  // Anonymization is recorded on the inference receipt, correlated by message_id.
  async function loadAnonymization(idx: number) {
    const id = messages[idx].id;
    if (!id || id === 'pending') return;
    try {
      const res = await fetch(`/chats/${chatId}/receipts?event_kinds=inference`);
      if (!res.ok) return;
      const map = anonymizedByMessage((await res.json()) as ReceiptEvent[]);
      if (map.has(id)) messages[idx].anonymized = map.get(id);
    } catch {
      /* non-blocking — badge simply absent */
    }
  }
```

3d. In `runStream`, right after the existing `await loadCitations(idx);`, add:

```ts
      await loadAnonymization(idx);
```

3e. In `retry()`, where it clears `messages[idx].citations = undefined;`, add below it:

```ts
    messages[idx].anonymized = undefined;
```

3f. **Make the existing P2b fetch-count assertions robust.** `loadAnonymization` now issues an *unconditional* post-completion receipts fetch, so tests that asserted exact `fetch` call counts/indices must switch to URL-based assertions. Apply these three edits in `chatStream.svelte.test.ts`:

- In **"fetches citations for the assistant message after completion when markers are present"**, replace the two assertions
  `expect(fetchMock).toHaveBeenCalledTimes(2);` and `expect(fetchMock.mock.calls[1][0]).toBe('/chats/c1/messages/a1/citations');` with:
  ```ts
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/chats/c1/messages/a1/citations');
  ```
  (Keep the `citations` length + `verification_method` assertions.)

- In **"does not fetch citations when the answer has no markers"**, replace `expect(fetchMock).toHaveBeenCalledTimes(1);` with:
  ```ts
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/citations'))).toBe(false);
  ```

- In **"retries the citations fetch once when the first response is empty (persist/fetch race)"**, remove `expect(fetchMock).toHaveBeenCalledTimes(3);` (the trailing anonymization fetch makes the count vary). Keep `expect(chat.messages[1].citations).toHaveLength(1);`.

These reflect the controller's new behavior: after a turn completes it loads citations (only when markers are present) **and** always loads anonymization — so "exact total fetch count" is no longer the right invariant; "did/didn't hit the citations endpoint" is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/chatStream.svelte.test.ts`
Expected: PASS (existing + new). Existing no-marker tests now also issue the receipts fetch — they mock `fetch` with a single `mockResolvedValue` returning the SSE stream, so the receipts fetch receives the SSE body; `res.json()` throws → caught → `anonymized` stays undefined → those assertions are unaffected.

- [ ] **Step 5: `npm run check` + commit**

```bash
npm run check
git add src/lib/chat/chatStream.svelte.ts src/lib/chat/chatStream.svelte.test.ts
git commit -m "feat(p2c-a): fetch per-message anonymization after stream completes"
git push
```

---

### Task 8: History load — set `anonymized` per message

**Files:**
- Modify: `src/routes/(app)/chats/[id]/+page.server.ts`

No new unit test (server `load`; covered by the live e2e). The map builder is unit-tested in Task 1.

- [ ] **Step 1: Update the load**

Add imports at the top of `src/routes/(app)/chats/[id]/+page.server.ts`:

```ts
import { anonymizedByMessage } from '$lib/receipts/format';
import type { ReceiptEvent } from '$lib/receipts/types';
```

After the existing citations `Promise.all(...)` block (added in P2b) and before `return { … }`, insert:

```ts
  // Per-message anonymization status from the inference receipts (M2-D2).
  try {
    const r = await lqFetch(event, `/api/v1/chats/${event.params.id}/receipts?event_kinds=inference`);
    if (r.ok) {
      const map = anonymizedByMessage((await r.json()) as ReceiptEvent[]);
      for (const m of messages) {
        if (m.role === 'assistant' && map.has(m.id)) m.anonymized = map.get(m.id);
      }
    }
  } catch {
    /* non-blocking — badges simply absent */
  }
```

- [ ] **Step 2: Verify**

Run: `npm run check` (0 errors / 0 warnings) and `npx vitest run` (all suites pass).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/chats/[id]/+page.server.ts"
git commit -m "feat(p2c-a): load per-message anonymization status for history"
git push
```

---

### Task 9: Anonymization badge in `Message.svelte`

**Files:**
- Modify: `src/lib/components/Message.svelte`
- Modify: `src/lib/components/Message.svelte.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/components/Message.svelte.test.ts` (inside the `describe`):

```ts
  it('shows the Anonymized badge when message.anonymized is true', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'a3', id: 'a3', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, anonymized: true } }
    });
    expect(getByText(/Anonymized/i)).toBeInTheDocument();
  });
  it('does not show the badge when anonymized is false/undefined', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'a4', id: 'a4', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, anonymized: false } }
    });
    expect(queryByText(/Anonymized/i)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: FAIL — no "Anonymized" text.

- [ ] **Step 3: Update `Message.svelte`**

Add to the `<script>` imports:

```ts
  import { ShieldCheck } from '@lucide/svelte';
```

In the assistant branch, the tier chip currently renders as a `float-right` span. Directly **after** the tier-chip `{#if …}{:else if …}{/if}` block (the lines rendering `Tier {…}` / `Tier…`), add:

```svelte
    {#if message.anonymized === true}
      <span class="float-right ml-2 inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 text-[10px] leading-5 text-mlq-success" title="Personal data was anonymized before this request left your environment">
        <ShieldCheck size={11} /> Anonymized
      </span>
    {/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/Message.svelte.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: `npm run check` + commit**

```bash
npm run check
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(p2c-a): per-message Anonymized badge (affirmative-only)"
git push
```

---

### Task 10: Live e2e — Receipts drawer

**Files:**
- Create: `tests/receipts-drawer.spec.ts`

Rebuild `donna-web` first (it must include the P2c client code).

- [ ] **Step 1: Write the test**

```ts
// tests/receipts-drawer.spec.ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
// A chat that already has a real inference + retrieval (seed via the API helper if needed).
const SEEDED_CHAT = process.env.DONNA_SEEDED_CHAT ?? '';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

async function newChatWithATurn(page: Page): Promise<void> {
  await page.fill('textarea', 'In one sentence, what is a force majeure clause?');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
  await expect(page.getByRole('button', { name: /copy/i })).toBeVisible({ timeout: 30000 });
}

test('Receipts drawer opens and shows the provenance timeline', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  if (SEEDED_CHAT) await page.goto(`/chats/${SEEDED_CHAT}`);
  else await newChatWithATurn(page);

  await page.getByRole('button', { name: /receipts/i }).click();
  const drawer = page.getByRole('dialog', { name: /receipts/i });
  await expect(drawer).toBeVisible();

  // At least an inference and a message row render (real events).
  await expect(drawer.getByText(/tier \d/i).first()).toBeVisible({ timeout: 15000 });
  await expect(drawer.getByRole('link', { name: /export/i })).toHaveAttribute('href', /receipts\/export\.jsonl$/);

  // A filter chip narrows the list (toggle "inference" off → its row disappears).
  const before = await drawer.locator('text=/tier \\d/i').count();
  await drawer.getByRole('button', { name: /^inference$/i }).click();
  await expect(drawer.locator('text=/tier \\d/i')).toHaveCount(0);
  expect(before).toBeGreaterThan(0);

  // Esc closes.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /receipts/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Rebuild donna-web + run**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
docker compose exec -T api python -m app.cli reset-admin-password --email "$DONNA_E2E_EMAIL" --password "$DONNA_E2E_PASSWORD" --no-force-change
npx playwright test tests/receipts-drawer.spec.ts
```

Expected: PASS. (A fresh chat gets a project-less turn — still produces `message` + `inference` receipts; retrieval only appears for project-backed chats, which the test does not require.)

- [ ] **Step 3: Commit**

```bash
git add tests/receipts-drawer.spec.ts
git commit -m "test(p2c-a): live e2e for the Receipts drawer"
git push
```

---

### Task 11: Live e2e — anonymization indicator (true + no false positive)

**Files:**
- Create: `tests/anonymization-indicator.spec.ts`

Stack prereq: `anonymization.enabled: true` in the gateway (already enabled in this dev stack; see dev-stack memory). The test seeds via the API.

- [ ] **Step 1: Write the test**

```ts
// tests/anonymization-indicator.spec.ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
  return fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  }).then((r) => r.json()).then((d) => d.access_token);
}

async function seedChat(tok: string, content: string): Promise<string> {
  const cid = await fetch(`${API}/chats`, {
    method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'anon e2e' })
  }).then((r) => r.json()).then((d) => d.id);
  await fetch(`${API}/chats/${cid}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content, model: 'smart', stream: false })
  });
  return cid;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

test('Anonymized badge shows for a PII turn and is absent otherwise', async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token();
  const piiChat = await seedChat(tok, 'Draft a one-line note that John Smith (john.smith@acme.com, 555-123-4567) of Acme Corporation received the documents.');
  const plainChat = await seedChat(tok, 'In one sentence, what is consideration in contract law?');

  await login(page);

  // PII chat → badge present on the assistant turn.
  await page.goto(`/chats/${piiChat}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Anonymized/i).first()).toBeVisible({ timeout: 15000 });

  // Plain chat → no badge.
  await page.goto(`/chats/${plainChat}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Anonymized/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Run**

```bash
set -a; . ./.env; set +a
npx playwright test tests/anonymization-indicator.spec.ts
```

Expected: PASS — the PII turn shows "Anonymized" (history load sets `anonymized=true` from the inference receipt); the plain turn shows no badge. If the PII chat shows no badge, confirm anonymization is enabled: `docker compose exec gateway grep -A1 '^anonymization:' /etc/lq-ai/gateway.yaml` should show `enabled: true` (if not, flip it and `docker compose restart gateway`). Do NOT weaken assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/anonymization-indicator.spec.ts
git commit -m "test(p2c-a): live e2e for the anonymization indicator (true + absent)"
git push
```

---

### Task 12: Final verification gate + PR

- [ ] **Step 1: Full gate**

```bash
npm run check
npx vitest run
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
npx playwright test
```

Expected: `npm run check` exit 0 / 0 errors 0 warnings; all vitest suites green; all Playwright specs green (P2a + P2b citation specs + the two new P2c specs).

- [ ] **Step 2: Final whole-branch review, then finishing-a-development-branch (open PR into `main`).**

The branch already includes the `4df3b9b` pin bump commit; call it out in the PR body.

---

## Self-Review

**Spec coverage:**
- §1 contract / detail shapes → Task 1 (`describeEvent` handles every kind + missing fields). ✓
- §3 drawer (placement/trigger, rows, behavior, states, BFF) → Tasks 2,3,4,5,6. ✓
- §4 anonymization indicator (field, history, fresh, UI) → Tasks 7 (fresh + field), 8 (history), 9 (badge). ✓
- §5 error/edge → Task 2 (403/404/502), 5 (loading/error/empty/unknown-kind via Task 1 default), 7/8 (swallow → no badge), 9 (false/undefined → no badge). ✓
- §6 out of scope → not built (composer power, header title, pagination). ✓
- §7 testing (unit/component/live, incl. live true-state + no-false-positive) → Tasks 1,2,3,4,5,9 (unit/component), 10 (drawer e2e), 11 (indicator e2e). ✓
- §8 decisions (affirmative-only; live true via enabled anonymization+PII; client-side filtering) → Tasks 9, 11, 5. ✓

**Placeholder scan:** No TBD/TODO; all steps carry full code/commands. The Task 7 test note explicitly resolves the fetch-index ambiguity (asserts via `urls.toContain`, not a fixed index). ✓

**Type consistency:** `ReceiptEvent`/`ReceiptKind` (Task 1) used identically in format, BFF tests, row, drawer, chatStream, load. `describeEvent`→`EventView { label, detail, tone, tier? }` consumed by `ReceiptEventRow` (Task 4). `anonymizedByMessage` (Task 1) used in Tasks 7 + 8. `ChatMessage.anonymized` defined Task 7, set in 7+8, read in 9. BFF route paths (`/chats/{id}/receipts`, `?event_kinds=inference`, `/receipts/export.jsonl`) consistent across server routes, drawer, chatStream, load, and e2e. ✓
