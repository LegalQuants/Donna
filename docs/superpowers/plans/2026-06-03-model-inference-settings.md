# Model & Inference Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Settings → Models` surface that shows what model backs each inference category (`smart`/`fast`/`budget`/`local*`), lets an admin reassign each to any available model (cloud or installed-local) while preserving its fallback chain, and lists installed local (Ollama) models.

**Architecture:** Pure `src/lib/inference/` helpers normalize `GET /models` + `GET /admin/aliases` into view models; a SvelteKit page under `/settings/models` SSR-loads them and a `?/reassign` form action PATCHes `/api/v1/admin/aliases/{name}` (re-reading the entry to preserve `fallback`). Writes gate on `locals.user.is_admin`; non-admins get a read-only view. Provider-key management is a pin-gated follow-on.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript (0 `any`, 0 warnings), Vitest + @testing-library/svelte, Tailwind (`mlq-*`).

**Spec:** `docs/superpowers/specs/2026-06-03-donna-model-inference-settings-design.md`

---

## File structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/lib/inference/types.ts` | re-exported backend types + view types (`ModelTarget`, `CategoryView`) | 1 |
| `src/lib/inference/inference.ts` | pure helpers (targets, categories, reassign body) | 1 |
| `src/lib/inference/inference.test.ts` | helper unit tests | 1 |
| `src/lib/settings/SettingsRail.svelte` | add the "Models" rail entry | 2 |
| `src/routes/(app)/settings/models/+page.server.ts` | SSR load (+ `?/reassign` action in Task 3) | 2,3 |
| `src/routes/(app)/settings/models/page.server.test.ts` | load + action tests | 2,3 |
| `src/lib/inference/CategoryRow.svelte` | one category row (admin select vs read-only) | 4 |
| `src/lib/inference/CategoryRow.svelte.test.ts` | row render test | 4 |
| `src/lib/inference/LocalModelsCard.svelte` | installed local models list | 4 |
| `src/routes/(app)/settings/models/+page.svelte` | compose cards + provider-keys note | 4 |
| `vendor/lq-ai` pin + provider-keys card | pin-gated | 5 |

**Gate (every task):** `npm run check` → 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). No `any`, no non-null `!`. Targeted vitest per task; full `npx vitest run` (≥893) before the PR.

---

## Task 1: `src/lib/inference/` — types + pure helpers

**Files:** Create `src/lib/inference/types.ts`, `src/lib/inference/inference.ts`, `src/lib/inference/inference.test.ts`.

- [ ] **Step 1: Create the types**

Create `src/lib/inference/types.ts`:

```ts
import type { components } from '$lib/api/backend';

export type AdminAliasEntry = components['schemas']['AdminAliasEntry'];
export type AdminAliasFallback = components['schemas']['AdminAliasFallback'];
export type AdminAliasUpdate = components['schemas']['AdminAliasUpdate'];
export type TierConfigResponse = components['schemas']['TierConfigResponse'];

/** An assignable concrete model (a provider-native entry from GET /models). */
export interface ModelTarget {
  id: string; // "provider/model" (the GET /models id)
  provider: string;
  model: string;
  label: string;
  group: 'cloud' | 'local';
  tier: number | null;
}

/** A view of one inference category (alias) for the settings rows. */
export interface CategoryView {
  name: string; // e.g. "smart"
  backingLabel: string; // e.g. "Opus 4.7"
  currentTargetId: string | null; // "provider/model" of the current backing
  tier: number | null;
  group: 'cloud' | 'local';
}
```

- [ ] **Step 2: Write the failing helper tests**

Create `src/lib/inference/inference.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { availableTargets, orderedChatCategories, categoryFromEntry, categoryFromOption, reassignPatchBody, localModels } from './inference';
import type { AdminAliasEntry, ModelTarget } from './types';
import type { RawModelEntry, ChatModelOption } from '$lib/models/types';

const raw: RawModelEntry[] = [
  { id: 'smart', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7', routed_inference_tier: 4 },
  { id: 'local', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'ollama-local/llama3.1:8b', routed_inference_tier: 1 },
  { id: 'embedding', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/text-embedding', routed_inference_tier: 4 },
  { id: 'anthropic-prod/claude-opus-4-7', object: 'model', owned_by: 'anthropic-prod', lq_ai_kind: 'provider_native', provider_type: 'anthropic', routed_inference_tier: 4 },
  { id: 'ollama-local/llama3.1:8b', object: 'model', owned_by: 'ollama-local', lq_ai_kind: 'provider_native', provider_type: 'ollama', routed_inference_tier: 1 }
] as never;

describe('availableTargets', () => {
  it('maps provider-native entries to {provider, model} split on the owned_by prefix, grouped', () => {
    const t = availableTargets(raw);
    expect(t).toEqual([
      { id: 'anthropic-prod/claude-opus-4-7', provider: 'anthropic-prod', model: 'claude-opus-4-7', label: 'Opus 4.7', group: 'cloud', tier: 4 },
      { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 }
    ]);
  });
});

describe('orderedChatCategories', () => {
  it('returns chat-alias options in canonical order, excluding embedding/non-chat', () => {
    expect(orderedChatCategories(raw).map((o) => o.id)).toEqual(['smart', 'local']);
  });
});

describe('categoryFromEntry / categoryFromOption', () => {
  it('builds a CategoryView from an admin alias entry (currentTargetId = provider/model)', () => {
    const entry: AdminAliasEntry = { name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [], primary_inference_tier: 4 };
    expect(categoryFromEntry(entry)).toEqual({ name: 'smart', backingLabel: 'Opus 4.7', currentTargetId: 'anthropic-prod/claude-opus-4-7', tier: 4, group: 'cloud' });
  });
  it('builds a CategoryView from a normalized chat option', () => {
    const o: ChatModelOption = { id: 'local', label: 'llama3.1:8b', resolvedModel: 'ollama-local/llama3.1:8b', group: 'local', tier: 1 };
    expect(categoryFromOption(o)).toEqual({ name: 'local', backingLabel: 'llama3.1:8b', currentTargetId: 'ollama-local/llama3.1:8b', tier: 1, group: 'local' });
  });
});

describe('reassignPatchBody', () => {
  it('swaps the primary provider/model but PRESERVES the existing fallback', () => {
    const entry: AdminAliasEntry = { name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] };
    const target: ModelTarget = { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 };
    expect(reassignPatchBody(entry, target)).toEqual({ provider: 'ollama-local', model: 'llama3.1:8b', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] });
  });
});

describe('localModels', () => {
  it('is the local subset of availableTargets', () => {
    expect(localModels(raw).map((t) => t.id)).toEqual(['ollama-local/llama3.1:8b']);
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `npx vitest run src/lib/inference/inference.test.ts`
Expected: FAIL (cannot resolve `./inference`).

- [ ] **Step 4: Implement the helpers**

Create `src/lib/inference/inference.ts`:

```ts
import { prettifyModel, toChatOptions } from '$lib/models/normalize';
import type { RawModelEntry, ChatModelOption } from '$lib/models/types';
import type { AdminAliasEntry, AdminAliasUpdate, CategoryView, ModelTarget } from './types';

const CANON = ['smart', 'fast', 'budget', 'local', 'local-fast', 'local-thinking'];

/** The assignable concrete models (provider-native entries), cloud then local. */
export function availableTargets(raw: RawModelEntry[]): ModelTarget[] {
  return raw
    .filter((e) => e.lq_ai_kind === 'provider_native')
    .map((e) => {
      const provider = e.owned_by;
      const model = e.id.startsWith(provider + '/') ? e.id.slice(provider.length + 1) : e.id;
      const tier = e.routed_inference_tier ?? null;
      const local = e.provider_type === 'ollama' || tier === 1;
      return { id: e.id, provider, model, label: prettifyModel(e.id), group: local ? 'local' : 'cloud', tier } satisfies ModelTarget;
    });
}

/** Chat-usable alias options (from the shared normalizer) in canonical order. */
export function orderedChatCategories(raw: RawModelEntry[]): ChatModelOption[] {
  const opts = toChatOptions(raw);
  const rank = (id: string) => {
    const i = CANON.indexOf(id);
    return i === -1 ? CANON.length : i;
  };
  return [...opts].sort((a, b) => rank(a.id) - rank(b.id));
}

export function categoryFromEntry(entry: AdminAliasEntry): CategoryView {
  const id = `${entry.provider}/${entry.model}`;
  const tier = entry.primary_inference_tier ?? null;
  return { name: entry.name, backingLabel: prettifyModel(id), currentTargetId: id, tier, group: tier === 1 ? 'local' : 'cloud' };
}

/** Non-admin path: a CategoryView from a normalized chat option (no /admin/aliases read). */
export function categoryFromOption(o: ChatModelOption): CategoryView {
  return { name: o.id, backingLabel: o.label, currentTargetId: o.resolvedModel, tier: o.tier, group: o.group };
}

/** New primary provider/model, preserving the alias's existing fallback chain. */
export function reassignPatchBody(entry: AdminAliasEntry, target: ModelTarget): AdminAliasUpdate {
  return { provider: target.provider, model: target.model, fallback: entry.fallback };
}

/** Installed local models = the local subset of the assignable targets. */
export function localModels(raw: RawModelEntry[]): ModelTarget[] {
  return availableTargets(raw).filter((t) => t.group === 'local');
}
```

- [ ] **Step 5: Run the tests — expect PASS**

Run: `npx vitest run src/lib/inference/inference.test.ts`
Expected: PASS (6 tests). `npm run check` → 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/inference/types.ts src/lib/inference/inference.ts src/lib/inference/inference.test.ts
git commit -m "feat(inference): pure helpers for model/inference settings

availableTargets / orderedChatCategories / categoryFrom{Entry,Option} / reassignPatchBody
(preserves fallback) / localModels — normalize GET /models + /admin/aliases into
view models for the Settings → Models surface."
```

---

## Task 2: Rail entry + page load

**Files:** Modify `src/lib/settings/SettingsRail.svelte`; create `src/routes/(app)/settings/models/+page.server.ts` + `page.server.test.ts`.

- [ ] **Step 1: Add the rail entry**

In `src/lib/settings/SettingsRail.svelte`, add to the `sections` array (after `trust`):

```ts
    { href: '/settings/models', label: 'Models' }
```

- [ ] **Step 2: Write the failing load test**

Create `src/routes/(app)/settings/models/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const modelsBody = {
  object: 'list',
  data: [
    { id: 'smart', object: 'model', owned_by: 'lq-ai-gateway', lq_ai_kind: 'alias', lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7', routed_inference_tier: 4 },
    { id: 'anthropic-prod/claude-opus-4-7', object: 'model', owned_by: 'anthropic-prod', lq_ai_kind: 'provider_native', provider_type: 'anthropic', routed_inference_tier: 4 },
    { id: 'ollama-local/llama3.1:8b', object: 'model', owned_by: 'ollama-local', lq_ai_kind: 'provider_native', provider_type: 'ollama', routed_inference_tier: 1 }
  ]
};
const ev = (isAdmin: boolean) => ({ locals: { user: { is_admin: isAdmin } } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/settings/models load', () => {
  it('admin: fetches models + admin aliases, builds categories from the alias entries', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: 'list', data: [{ name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [], primary_inference_tier: 4 }] }), { status: 200 }));
    const out = (await load(ev(true))) as { isAdmin: boolean; categories: { name: string; currentTargetId: string | null }[]; targets: unknown[]; localModels: unknown[]; modelsError: boolean };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/models');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/admin/aliases');
    expect(out.isAdmin).toBe(true);
    expect(out.categories[0]).toMatchObject({ name: 'smart', currentTargetId: 'anthropic-prod/claude-opus-4-7' });
    expect(out.targets).toHaveLength(2);
    expect(out.localModels).toHaveLength(1);
    expect(out.modelsError).toBe(false);
  });

  it('non-admin: skips the admin call and derives categories from /models', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
    const out = (await load(ev(false))) as { isAdmin: boolean; categories: { name: string }[] };
    expect(lqFetch).toHaveBeenCalledTimes(1);
    expect(out.isAdmin).toBe(false);
    expect(out.categories[0].name).toBe('smart');
  });

  it('flags modelsError when /models fails', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const out = (await load(ev(false))) as { modelsError: boolean; categories: unknown[] };
    expect(out.modelsError).toBe(true);
    expect(out.categories).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"`
Expected: FAIL (cannot resolve `./+page.server`).

- [ ] **Step 4: Implement the load**

Create `src/routes/(app)/settings/models/+page.server.ts`:

```ts
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { ModelsListResponse } from '$lib/models/types';
import { availableTargets, orderedChatCategories, categoryFromEntry, categoryFromOption, localModels } from '$lib/inference/inference';
import type { AdminAliasEntry, CategoryView, ModelTarget } from '$lib/inference/types';

export const load: PageServerLoad = async (event) => {
  const isAdmin = !!event.locals.user?.is_admin;

  const modelsRes = await lqFetch(event, '/api/v1/models');
  if (!modelsRes.ok) {
    return { isAdmin, categories: [] as CategoryView[], targets: [] as ModelTarget[], localModels: [] as ModelTarget[], modelsError: true };
  }
  const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
  const options = orderedChatCategories(raw);
  const targets = availableTargets(raw);
  const local = localModels(raw);

  let categories: CategoryView[];
  if (isAdmin) {
    const aRes = await lqFetch(event, '/api/v1/admin/aliases');
    const entries = aRes.ok ? (((await aRes.json()) as { data: AdminAliasEntry[] }).data ?? []) : [];
    const byName = new Map(entries.map((e) => [e.name, e]));
    categories = options.map((o) => {
      const e = byName.get(o.id);
      return e ? categoryFromEntry(e) : categoryFromOption(o);
    });
  } else {
    categories = options.map(categoryFromOption);
  }

  return { isAdmin, categories, targets, localModels: local, modelsError: false };
};
```

> Note: `event.locals.user?.is_admin` — if svelte-check reports the `Locals['user']` type lacks `is_admin`, use `event.locals.user?.role === 'admin'` instead (the user object carries both).

- [ ] **Step 5: Run the load tests — expect PASS**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"`
Expected: PASS (3 tests). `npm run check` → 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/SettingsRail.svelte "src/routes/(app)/settings/models/+page.server.ts" "src/routes/(app)/settings/models/page.server.test.ts"
git commit -m "feat(settings): Models rail entry + SSR load (categories, targets, local)

Loads GET /models (+ GET /admin/aliases for admins) into category/target view
models; non-admins derive categories from /models. modelsError on failure."
```

---

## Task 3: `?/reassign` form action

**Files:** Modify `src/routes/(app)/settings/models/+page.server.ts` + `page.server.test.ts`.

- [ ] **Step 1: Write the failing action test**

Add to `src/routes/(app)/settings/models/page.server.test.ts`:

```ts
import { actions } from './+page.server';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return { request: { formData: async () => fd }, locals: { user: { is_admin: true } } } as never;
};

describe('/settings/models ?/reassign', () => {
  it('re-reads the alias for its fallback, then PATCHes the new primary preserving it', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 })) // resolve target
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'smart', provider: 'anthropic-prod', model: 'claude-opus-4-7', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] }), { status: 200 })) // GET alias
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'smart' }), { status: 200 })); // PATCH
    const res = await actions.reassign(form({ name: 'smart', target_id: 'ollama-local/llama3.1:8b' }));
    expect(res).toMatchObject({ success: true });
    expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/admin/aliases/smart');
    const patchInit = lqFetch.mock.calls[2][2] as RequestInit;
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(patchInit.body as string)).toEqual({ provider: 'ollama-local', model: 'llama3.1:8b', fallback: [{ provider: 'openai-prod', model: 'gpt-4' }] });
  });

  it('returns a 403 failure when the backend rejects the alias read (non-admin)', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const res = (await actions.reassign(form({ name: 'smart', target_id: 'ollama-local/llama3.1:8b' }))) as { status: number };
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"`
Expected: FAIL (no `actions` export).

- [ ] **Step 3: Implement the action**

Append to `src/routes/(app)/settings/models/+page.server.ts` (add the imports `fail` + `reassignPatchBody` + `AdminAliasEntry`):

```ts
import { fail } from '@sveltejs/kit';
import { reassignPatchBody } from '$lib/inference/inference';
import type { Actions } from './$types';

export const actions: Actions = {
  reassign: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '');
    const targetId = String(data.get('target_id') ?? '');
    if (!name || !targetId) return fail(400, { message: 'Missing category or model.' });

    const modelsRes = await lqFetch(event, '/api/v1/models');
    if (!modelsRes.ok) return fail(502, { message: 'Could not load models.' });
    const raw = ((await modelsRes.json()) as ModelsListResponse).data ?? [];
    const target = availableTargets(raw).find((t) => t.id === targetId);
    if (!target) return fail(400, { message: 'Unknown model.' });

    const getRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`);
    if (getRes.status === 403) return fail(403, { message: 'Changing model routing requires an admin account.' });
    if (!getRes.ok) return fail(getRes.status === 404 ? 404 : 502, { message: 'Could not read the category.' });
    const entry = (await getRes.json()) as AdminAliasEntry;

    const patchRes = await lqFetch(event, `/api/v1/admin/aliases/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(reassignPatchBody(entry, target))
    });
    if (patchRes.status === 403) return fail(403, { message: 'Changing model routing requires an admin account.' });
    if (!patchRes.ok) return fail(patchRes.status >= 400 && patchRes.status < 500 ? 400 : 502, { message: 'Could not update the category.' });
    return { success: true };
  }
};
```

- [ ] **Step 4: Run the action tests — expect PASS**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"`
Expected: PASS (5 tests total). `npm run check` → 0/0.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/models/+page.server.ts" "src/routes/(app)/settings/models/page.server.test.ts"
git commit -m "feat(settings): ?/reassign action PATCHes an alias, preserving fallback

Resolves the chosen target from /models, re-reads the alias for its current
fallback, then PATCHes /admin/aliases/{name} with the new primary + that fallback.
403 → admin-required failure."
```

---

## Task 4: Components + page composition

**Files:** Create `src/lib/inference/CategoryRow.svelte`, `src/lib/inference/CategoryRow.svelte.test.ts`, `src/lib/inference/LocalModelsCard.svelte`; create `src/routes/(app)/settings/models/+page.svelte`.

- [ ] **Step 1: Write the failing row test**

Create `src/lib/inference/CategoryRow.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CategoryRow from './CategoryRow.svelte';
import type { CategoryView, ModelTarget } from './types';

const category: CategoryView = { name: 'smart', backingLabel: 'Opus 4.7', currentTargetId: 'anthropic-prod/claude-opus-4-7', tier: 4, group: 'cloud' };
const targets: ModelTarget[] = [
  { id: 'anthropic-prod/claude-opus-4-7', provider: 'anthropic-prod', model: 'claude-opus-4-7', label: 'Opus 4.7', group: 'cloud', tier: 4 },
  { id: 'ollama-local/llama3.1:8b', provider: 'ollama-local', model: 'llama3.1:8b', label: 'llama3.1:8b', group: 'local', tier: 1 }
];

describe('CategoryRow', () => {
  it('admin: renders the category, its backing, and a model select with the current value', () => {
    render(CategoryRow, { props: { category, targets, isAdmin: true } as never });
    expect(screen.getByText('smart')).toBeInTheDocument();
    expect(screen.getByText('Opus 4.7')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /model for smart/i }) as HTMLSelectElement;
    expect(select.value).toBe('anthropic-prod/claude-opus-4-7');
    expect(screen.getByRole('option', { name: 'llama3.1:8b' })).toBeInTheDocument();
  });

  it('non-admin: renders read-only (no select)', () => {
    render(CategoryRow, { props: { category, targets, isAdmin: false } as never });
    expect(screen.getByText('Opus 4.7')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/inference/CategoryRow.svelte.test.ts`
Expected: FAIL (cannot resolve `./CategoryRow.svelte`).

- [ ] **Step 3: Implement `CategoryRow`**

Create `src/lib/inference/CategoryRow.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { CategoryView, ModelTarget } from './types';

  let { category, targets, isAdmin }: { category: CategoryView; targets: ModelTarget[]; isAdmin: boolean } = $props();

  let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let formEl = $state<HTMLFormElement>();

  const cloud = $derived(targets.filter((t) => t.group === 'cloud'));
  const local = $derived(targets.filter((t) => t.group === 'local'));

  const submit = () => {
    status = 'saving';
    return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
      if (result.type === 'success') { status = 'saved'; await update(); }
      else { status = 'error'; }
    };
  };
</script>

<div class="flex items-center justify-between gap-3 border-b border-mlq-subtle px-4 py-3 last:border-b-0">
  <div class="min-w-0">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-mlq-text">{category.name}</span>
      <span class="rounded-full border border-mlq-subtle px-1.5 text-xs text-mlq-muted">{category.group === 'local' ? 'Local' : 'Cloud'}{category.tier ? ` · tier ${category.tier}` : ''}</span>
    </div>
    <div class="truncate text-xs text-mlq-muted">Backed by {category.backingLabel || '—'}</div>
  </div>
  {#if isAdmin}
    <form method="POST" action="?/reassign" use:enhance={submit} bind:this={formEl} class="flex items-center gap-2">
      <input type="hidden" name="name" value={category.name} />
      <select
        name="target_id"
        aria-label="Model for {category.name}"
        value={category.currentTargetId ?? ''}
        onchange={() => formEl?.requestSubmit()}
        class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
      >
        {#if cloud.length}
          <optgroup label="Cloud">
            {#each cloud as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
          </optgroup>
        {/if}
        {#if local.length}
          <optgroup label="Local">
            {#each local as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
          </optgroup>
        {/if}
      </select>
      {#if status === 'saving'}<span class="text-xs text-mlq-muted">Saving…</span>
      {:else if status === 'saved'}<span class="text-xs text-mlq-success">Saved</span>
      {:else if status === 'error'}<span class="text-xs text-mlq-error">Failed</span>{/if}
    </form>
  {/if}
</div>
```

- [ ] **Step 4: Run the row test — expect PASS**

Run: `npx vitest run src/lib/inference/CategoryRow.svelte.test.ts`
Expected: PASS (2 tests). (The test does not submit the form — `requestSubmit` is exercised by the live e2e — it only asserts render.)

- [ ] **Step 5: Implement `LocalModelsCard`**

Create `src/lib/inference/LocalModelsCard.svelte`:

```svelte
<script lang="ts">
  import type { ModelTarget } from './types';
  let { localModels }: { localModels: ModelTarget[] } = $props();
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
  <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Installed local models</h2>
  <div class="px-4 py-3">
    {#if localModels.length === 0}
      <p class="text-sm text-mlq-muted">No local models detected. Install <a class="underline" href="https://ollama.com">Ollama</a> and run <code>ollama pull &lt;model&gt;</code> to add one.</p>
    {:else}
      <ul class="space-y-1">
        {#each localModels as m (m.id)}
          <li class="text-sm text-mlq-text">{m.label} <span class="text-xs text-mlq-muted">({m.id})</span></li>
        {/each}
      </ul>
      <p class="mt-2 text-xs text-mlq-muted">Detected via Ollama on your system. Run <code>ollama pull &lt;model&gt;</code> to add more.</p>
    {/if}
  </div>
</section>
```

- [ ] **Step 6: Implement the page**

Create `src/routes/(app)/settings/models/+page.svelte`:

```svelte
<script lang="ts">
  import CategoryRow from '$lib/inference/CategoryRow.svelte';
  import LocalModelsCard from '$lib/inference/LocalModelsCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Models — Settings — Donna</title></svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-medium text-mlq-text">Models</h1>
    <p class="mt-1 text-sm text-mlq-muted">Choose which model backs each inference category. See <a class="underline" href="/settings/trust">Trust</a> for where your data goes.</p>
  </div>

  {#if data.modelsError}
    <div class="rounded-mlq-control border border-mlq-subtle px-4 py-6 text-center text-sm text-mlq-muted">Could not load models right now.</div>
  {:else}
    <section class="rounded-mlq-control border border-mlq-subtle">
      <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Inference categories</h2>
      {#each data.categories as c (c.name)}
        <CategoryRow category={c} targets={data.targets} isAdmin={data.isAdmin} />
      {/each}
      {#if !data.isAdmin}
        <p class="px-4 py-2 text-xs text-mlq-muted">Changing model routing requires an admin account.</p>
      {/if}
    </section>

    <LocalModelsCard localModels={data.localModels} />

    <section class="rounded-mlq-control border border-mlq-subtle px-4 py-3">
      <h2 class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Provider keys</h2>
      <p class="mt-1 text-sm text-mlq-muted">Provider API keys are set via your deployment's environment. In-app key management is coming.</p>
    </section>
  {/if}
</div>
```

- [ ] **Step 7: Typecheck + run inference tests + commit**

Run: `npm run check` → 0/0. Run `npx vitest run src/lib/inference "src/routes/(app)/settings/models"` → green.

```bash
git add src/lib/inference/CategoryRow.svelte src/lib/inference/CategoryRow.svelte.test.ts src/lib/inference/LocalModelsCard.svelte "src/routes/(app)/settings/models/+page.svelte"
git commit -m "feat(settings): Models page — category rows, local models, keys note

CategoryRow shows each category's backing + (admin) a grouped model select that
submits ?/reassign on change; LocalModelsCard lists installed Ollama models; the
page notes provider-keys are env-only for now."
```

---

## Task 5 (PIN-GATED — do ONLY if the BYOK SHA has landed): provider-keys card

**Gate:** Run only if the upstream ask (`docs/upstream-requests/lq-ai-provider-key-management.md`) has merged and you have a pin SHA exposing `GET/POST/PATCH/DELETE /api/v1/admin/provider-keys`. **If not, STOP** — this slice ships with the env-only note and the key card becomes a fast-follow. Replace the §6 "Provider keys" note section with a real management card: list providers (`configured`, `source`, `last4`), a masked `type="password"` input per provider to set a key (POST), and rotate/revoke (PATCH/DELETE) — reusing the `MfaDisableModal`/`DeleteAccountModal` + change-password secret-input precedents, gated to admins, never displaying the secret. Add a `?/setProviderKey` (+ rotate/revoke) form action proxying the new endpoints. Pin bump: `cd vendor/lq-ai && git checkout <SHA> && cd - && npm run gen:api && npm run check`. Then TDD the card + action and commit.

---

## Whole-branch verification (before the PR)

- [ ] **Full unit suite:** `npx vitest run` → ≥ ~893 green.
- [ ] **Gate:** `npm run check` → 0/0; `npx eslint .` adds no NEW errors vs `main`'s pre-existing set.
- [ ] **Rebuild for live e2e:** `set -a; . ./.env; set +a; docker compose up -d --build donna-web`.
- [ ] **Live e2e** (`tests/model-settings.spec.ts`, dev fixture is admin): visit `/settings/models` → categories list with current backings → change a category's select to another available model → reload → the new backing persists; the installed local-models list renders. (Restore the original backing in a `finally` so the test is re-runnable.)
- [ ] Then `superpowers:finishing-a-development-branch` → PR into `main`.
```
