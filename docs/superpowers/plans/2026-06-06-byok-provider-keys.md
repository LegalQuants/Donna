# BYOK — Provider-Keys Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/settings/models` provider-keys placeholder with a working admin-gated card: add/replace a provider's runtime key (masked, hot-applied), revoke runtime keys, with env-row semantics and operator-actionable errors.

**Architecture:** Pure frontend slice (the API is in-pin). SSR `load` gains a parallel admin-only `GET /admin/provider-keys`; two new form actions (`?/setKey` always POSTs — backend documents POST as set/replace; `?/revokeKey` DELETEs). New pure data layer `providerKeys.ts` + two components (`ProviderKeysCard` section wrapper, `ProviderKeyRowItem` per-provider form row). Row-scoped errors via a `provider` echo in failure payloads. `use:enhance` default `invalidateAll` refreshes statuses after hot-apply.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright (non-destructive read-only e2e).

**Spec:** `docs/superpowers/specs/2026-06-06-byok-provider-keys-design.md`

**Branch:** `feat/byok-provider-keys` (already created, off `main`).

**⚠️ Submodule guard:** the local `vendor/lq-ai` checkout may sit at a NEWER sha than this branch's recorded pointer (parallel automations stack). NO pin bump in this slice — never `git add vendor/lq-ai`; keep commits to the exact file lists below.

**Upstream contract (verified: generated `backend.d.ts` + `vendor/lq-ai` api/gateway source):**

- `GET /api/v1/admin/provider-keys` (admin-only, non-admin 403) → `{ provider_keys: [{ provider, type: string|null, configured: boolean, last4: string|null, source: "env"|"runtime"|null }] }`. Full key never returned.
- `POST /api/v1/admin/provider-keys { provider, api_key }` → set/REPLACE, hot-applied; on an env row the gateway clears `api_key_env` (runtime takes over). Returns the updated status.
- `DELETE /api/v1/admin/provider-keys/{provider}` → 204; **409** when the key is env-provided; **404** unknown provider.
- **400** = gateway master key missing (`MasterKeyMissing`: "runtime key storage requires a master key to be set"). NOTE: the api's error envelope may carry `detail` as a STRING or as a structured `{code, message, ...}` object — the master-key sniff must therefore regex the raw body text, not use the `errorDetail` (string-only) helper.

---

### Task 1: Data layer — `src/lib/inference/providerKeys.ts`

**Files:**

- Create: `src/lib/inference/providerKeys.ts`
- Test: `src/lib/inference/providerKeys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inference/providerKeys.test.ts`:

```ts
// src/lib/inference/providerKeys.test.ts
import { describe, it, expect } from 'vitest';
import { parseProviderKeys, sourceLabel, canRevoke, type ProviderKeyRow } from './providerKeys';

const raw = (over: Record<string, unknown> = {}) => ({
	provider: 'anthropic-prod',
	type: 'anthropic',
	configured: true,
	last4: 'a1b2',
	source: 'env',
	...over
});

describe('parseProviderKeys', () => {
	it('parses the provider_keys envelope', () => {
		const out = parseProviderKeys({
			provider_keys: [raw(), raw({ provider: 'openai-prod', source: 'runtime' })]
		});
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({
			provider: 'anthropic-prod',
			type: 'anthropic',
			configured: true,
			last4: 'a1b2',
			source: 'env'
		});
		expect(out[1].source).toBe('runtime');
	});
	it('drops malformed rows and tolerates missing fields', () => {
		const out = parseProviderKeys({
			provider_keys: [
				{ nope: 1 },
				raw({ type: null, configured: 'yes', last4: null, source: 'weird' })
			]
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual({
			provider: 'anthropic-prod',
			type: null,
			configured: false,
			last4: null,
			source: null
		});
	});
	it('returns [] for a non-object / missing envelope', () => {
		expect(parseProviderKeys(null)).toEqual([]);
		expect(parseProviderKeys({ keys: [] })).toEqual([]);
	});
});

describe('sourceLabel / canRevoke', () => {
	const row = (source: ProviderKeyRow['source']): ProviderKeyRow => ({
		provider: 'p',
		type: null,
		configured: source !== null,
		last4: null,
		source
	});
	it('labels the three sources', () => {
		expect(sourceLabel(row('runtime'))).toBe('runtime');
		expect(sourceLabel(row('env'))).toBe('environment');
		expect(sourceLabel(row(null))).toBe('no key');
	});
	it('only runtime rows are revocable', () => {
		expect(canRevoke(row('runtime'))).toBe(true);
		expect(canRevoke(row('env'))).toBe(false);
		expect(canRevoke(row(null))).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/inference/providerKeys.test.ts`
Expected: FAIL — module `./providerKeys` not found.

- [ ] **Step 3: Implement `src/lib/inference/providerKeys.ts`**

```ts
// src/lib/inference/providerKeys.ts
// Defensively-parsed view models + display helpers for the admin provider-key
// API (lq-ai /api/v1/admin/provider-keys, lq-ai #128). The backend never
// returns the full key — rows carry at most last4. Mirrors the parsing style
// of $lib/automations/types.ts.

export interface ProviderKeyRow {
	provider: string;
	type: string | null;
	configured: boolean;
	last4: string | null;
	source: 'env' | 'runtime' | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseProviderKeys(raw: unknown): ProviderKeyRow[] {
	const arr = obj(raw).provider_keys;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((p) => {
			const r = obj(p);
			if (typeof r.provider !== 'string') return null;
			return {
				provider: r.provider,
				type: str(r.type),
				configured: r.configured === true,
				last4: str(r.last4),
				source: r.source === 'env' || r.source === 'runtime' ? r.source : null
			};
		})
		.filter((p): p is ProviderKeyRow => p !== null);
}

/** Display label for where a row's key comes from. */
export function sourceLabel(row: ProviderKeyRow): string {
	return row.source === 'runtime' ? 'runtime' : row.source === 'env' ? 'environment' : 'no key';
}

/** Only runtime-managed keys can be revoked via the API (env rows 409). */
export function canRevoke(row: ProviderKeyRow): boolean {
	return row.source === 'runtime';
}
```

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run src/lib/inference/providerKeys.test.ts && npm run check`
Expected: all PASS; check 0/0 (vendor `ERR_MODULE_NOT_FOUND` stderr harmless).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inference/providerKeys.ts src/lib/inference/providerKeys.test.ts
git commit -m "feat(settings): provider-key data layer (parse + source helpers)"
```

---

### Task 2: Server — load widening + `?/setKey` / `?/revokeKey` actions

**Files:**

- Modify: `src/routes/(app)/settings/models/+page.server.ts`
- Test: `src/routes/(app)/settings/models/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/routes/(app)/settings/models/page.server.test.ts`:

(a) The admin `load` will now fire a THIRD lqFetch (`/api/v1/admin/provider-keys`, in `Promise.all` with the aliases call — call order: models, aliases, provider-keys). Update the two existing admin load tests:

- `'admin: fetches models + admin aliases, builds categories from the alias entries'`: add a third mock after the aliases mock and extend assertions:

```ts
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider_keys: [{ provider: 'anthropic-prod', type: 'anthropic', configured: true, last4: 'a1b2', source: 'env' }] }), { status: 200 }));
```

and after the existing assertions:

```ts
expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/admin/provider-keys');
expect((out as { providerKeys: unknown[] | null }).providerKeys).toHaveLength(1);
```

- `'admin: when /admin/aliases fails, categories fall back...'`: add a provider-keys mock after the failing aliases mock:

```ts
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider_keys: [] }), { status: 200 }));
```

(b) New load tests in the same describe:

```ts
it('admin: degrades providerKeys to null when the provider-keys fetch fails', async () => {
	lqFetch
		.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 })
		)
		.mockResolvedValueOnce(new Response('boom', { status: 500 }));
	const out = (await load(ev(true))) as { providerKeys: unknown };
	expect(out.providerKeys).toBeNull();
});
it('non-admin: providerKeys is null and no admin endpoints are called', async () => {
	lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
	const out = (await load(ev(false))) as { providerKeys: unknown };
	expect(out.providerKeys).toBeNull();
	expect(lqFetch).toHaveBeenCalledTimes(1);
});
```

(c) New action describes (the existing `form()` helper builds an admin event):

```ts
describe('/settings/models ?/setKey', () => {
	it('POSTs provider + api_key and succeeds with a provider echo', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					provider: 'openai-prod',
					type: 'openai',
					configured: true,
					last4: 'z9y8',
					source: 'runtime'
				}),
				{ status: 200 }
			)
		);
		const res = await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-test-123' }));
		expect(res).toMatchObject({ success: true, provider: 'openai-prod' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/admin/provider-keys');
		const init = lqFetch.mock.calls[0][2] as RequestInit;
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({
			provider: 'openai-prod',
			api_key: 'sk-test-123'
		});
	});
	it('fails 400 with no upstream call when the key is empty', async () => {
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: '   ' }))) as {
			status: number;
		};
		expect(res.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('maps a master-key 400 to the operator-actionable message (string detail)', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ detail: 'runtime key storage requires a master key to be set' }),
				{ status: 400 }
			)
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string; provider: string };
		};
		expect(res.status).toBe(400);
		expect(res.data.message).toMatch(/LQ_AI_GATEWAY_MASTER_KEY/);
		expect(res.data.provider).toBe('openai-prod');
	});
	it('maps a master-key 400 with a structured error envelope too', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					detail: {
						code: 'master_key_missing',
						message: 'runtime key storage requires a master key to be set'
					}
				}),
				{ status: 400 }
			)
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res.data.message).toMatch(/LQ_AI_GATEWAY_MASTER_KEY/);
	});
	it('maps other 400s to a generic failure', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'bad request' }), { status: 400 })
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			data: { message: string };
		};
		expect(res.data.message).toBe('Could not save the key.');
	});
	it('maps 404 unknown provider and 403 admin-required', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		let res = (await actions.setKey(form({ provider: 'ghost', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res).toMatchObject({
			status: 404,
			data: { message: 'Unknown provider.', provider: 'ghost' }
		});
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
		res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res.status).toBe(403);
		expect(res.data.message).toMatch(/admin account/);
	});
	it('never echoes the api_key in any payload', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		const res = await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-SECRET' }));
		expect(JSON.stringify(res)).not.toContain('sk-SECRET');
	});
});

describe('/settings/models ?/revokeKey', () => {
	it('DELETEs the provider key and succeeds', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const res = await actions.revokeKey(form({ provider: 'openai-prod' }));
		expect(res).toMatchObject({ success: true, provider: 'openai-prod' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/admin/provider-keys/openai-prod');
		expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('DELETE');
	});
	it('treats 404 as success (already revoked)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		const res = await actions.revokeKey(form({ provider: 'openai-prod' }));
		expect(res).toMatchObject({ success: true });
	});
	it('maps the env-key 409 to the env-managed message', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 409 }));
		const res = (await actions.revokeKey(form({ provider: 'anthropic-prod' }))) as {
			status: number;
			data: { message: string; provider: string };
		};
		expect(res.status).toBe(409);
		expect(res.data.message).toMatch(/deployment environment/);
		expect(res.data.provider).toBe('anthropic-prod');
	});
	it('fails 400 with no fetch when provider is missing', async () => {
		const res = (await actions.revokeKey(form({}))) as { status: number };
		expect(res.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"`
Expected: new tests FAIL (`actions.setKey is not a function`; load lacks `providerKeys`); the two updated admin-load tests FAIL on the new assertions.

- [ ] **Step 3: Implement in `src/routes/(app)/settings/models/+page.server.ts`**

Extend the imports:

```ts
import { parseProviderKeys, type ProviderKeyRow } from '$lib/inference/providerKeys';
```

In `load`, change the early-return (models fetch failed) to also carry the new key:

```ts
return {
	isAdmin,
	categories: [] as CategoryView[],
	targets: [] as ModelTarget[],
	localModels: [] as ModelTarget[],
	modelsError: true,
	providerKeys: null as ProviderKeyRow[] | null
};
```

Replace the `if (isAdmin)` block so aliases + provider-keys fetch in parallel:

```ts
let categories: CategoryView[];
let providerKeys: ProviderKeyRow[] | null = null;
if (isAdmin) {
	const [aRes, pkRes] = await Promise.all([
		lqFetch(event, '/api/v1/admin/aliases'),
		lqFetch(event, '/api/v1/admin/provider-keys')
	]);
	const entries = aRes.ok ? (((await aRes.json()) as { data: AdminAliasEntry[] }).data ?? []) : [];
	const byName = new Map(entries.map((e) => [e.name, e]));
	categories = options.map((o) => {
		const e = byName.get(o.id);
		return e ? categoryFromEntry(e) : categoryFromOption(o);
	});
	if (pkRes.ok) {
		try {
			providerKeys = parseProviderKeys(await pkRes.json());
		} catch {
			providerKeys = null; // non-JSON body → degraded card
		}
	}
} else {
	categories = options.map(categoryFromOption);
}

return { isAdmin, categories, targets, localModels: local, modelsError: false, providerKeys };
```

Add the two actions after `reassign` (inside the same `actions` object):

```ts
  setKey: async (event) => {
    const data = await event.request.formData();
    const provider = String(data.get('provider') ?? '');
    const apiKey = String(data.get('api_key') ?? '');
    if (!provider || !apiKey.trim()) return fail(400, { provider, message: 'Enter a key first.' });

    const res = await lqFetch(event, '/api/v1/admin/provider-keys', {
      method: 'POST',
      body: JSON.stringify({ provider, api_key: apiKey })
    });
    if (res.status === 403) return fail(403, { provider, message: 'Managing provider keys requires an admin account.' });
    if (res.status === 404) return fail(404, { provider, message: 'Unknown provider.' });
    if (res.status === 400) {
      // The 400's detail may be a plain string OR the structured LQAIError
      // envelope — sniff the raw body for the master-key cause either way.
      const body = await res.text().catch(() => '');
      return fail(400, {
        provider,
        message: /master.?key/i.test(body)
          ? "The gateway has no master key set, so runtime keys can't be stored — ask your operator to configure LQ_AI_GATEWAY_MASTER_KEY."
          : 'Could not save the key.'
      });
    }
    if (!res.ok) return fail(502, { provider, message: 'Could not save the key.' });
    return { success: true, provider };
  },

  revokeKey: async (event) => {
    const data = await event.request.formData();
    const provider = String(data.get('provider') ?? '');
    if (!provider) return fail(400, { provider, message: 'Missing provider.' });

    const res = await lqFetch(event, `/api/v1/admin/provider-keys/${encodeURIComponent(provider)}`, { method: 'DELETE' });
    if (res.status === 409) return fail(409, { provider, message: "This key comes from the deployment environment and can't be revoked here." });
    if (res.status === 403) return fail(403, { provider, message: 'Managing provider keys requires an admin account.' });
    if (res.ok || res.status === 404) return { success: true, provider }; // 404 = already gone (idempotent)
    return fail(502, { provider, message: 'Could not revoke the key.' });
  }
```

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts" && npm run check`
Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/models/+page.server.ts" "src/routes/(app)/settings/models/page.server.test.ts"
git commit -m "feat(settings): provider-keys load + setKey/revokeKey actions (master-key 400 mapped)"
```

---

### Task 3: `ProviderKeyRowItem.svelte`

**Files:**

- Create: `src/lib/inference/ProviderKeyRowItem.svelte`
- Test: `src/lib/inference/ProviderKeyRowItem.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inference/ProviderKeyRowItem.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ProviderKeyRowItem from './ProviderKeyRowItem.svelte';
import type { ProviderKeyRow } from './providerKeys';

const row = (over: Partial<ProviderKeyRow> = {}): ProviderKeyRow => ({
	provider: 'anthropic-prod',
	type: 'anthropic',
	configured: true,
	last4: 'a1b2',
	source: 'env',
	...over
});

describe('ProviderKeyRowItem', () => {
	it('unconfigured: shows "No key" and an Add key button, disabled until input', async () => {
		render(ProviderKeyRowItem, {
			props: { row: row({ configured: false, last4: null, source: null }) }
		});
		expect(screen.getByText('No key')).toBeInTheDocument();
		const btn = screen.getByRole('button', { name: 'Add key' });
		expect(btn).toBeDisabled();
		await fireEvent.input(screen.getByLabelText(/API key for anthropic-prod/i), {
			target: { value: 'sk-x' }
		});
		expect(btn).not.toBeDisabled();
	});

	it('runtime row: configured status with masked last4, Replace key label, and a two-step revoke', async () => {
		render(ProviderKeyRowItem, { props: { row: row({ source: 'runtime' }) } });
		expect(screen.getByText(/Configured · runtime · ••••a1b2/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
		// two-step revoke: Revoke → confirm UI
		await fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
		expect(screen.getByText('Revoke key?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm revoke' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Revoke key?')).toBeNull();
	});

	it('env row: environment label + managed-by-env hints, Replace key, NO revoke control', () => {
		render(ProviderKeyRowItem, { props: { row: row() } });
		expect(screen.getByText(/Configured · environment · ••••a1b2/)).toBeInTheDocument();
		expect(screen.getByText(/managed by your deployment's environment/)).toBeInTheDocument();
		expect(screen.getByText(/takes over management from the environment/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
	});

	it('masked input is a password field; null last4 renders without a bullet suffix', () => {
		render(ProviderKeyRowItem, { props: { row: row({ last4: null, source: 'runtime' }) } });
		const input = screen.getByLabelText(/API key for anthropic-prod/i) as HTMLInputElement;
		expect(input.type).toBe('password');
		expect(input.autocomplete).toBe('new-password');
		expect(screen.getByText(/Configured · runtime$/)).toBeInTheDocument();
	});

	it('renders a row-scoped error message when given one', () => {
		render(ProviderKeyRowItem, { props: { row: row(), error: 'Unknown provider.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Unknown provider.');
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/inference/ProviderKeyRowItem.svelte.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/inference/ProviderKeyRowItem.svelte`**

```svelte
<!-- src/lib/inference/ProviderKeyRowItem.svelte -->
<!-- One provider's key row: status line + masked set/replace form + (runtime
     only) two-step revoke. The key value is write-only — the backend returns
     at most last4 and this component clears the input after a save. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { sourceLabel, canRevoke, type ProviderKeyRow } from './providerKeys';

	let { row, error = null }: { row: ProviderKeyRow; error?: string | null } = $props();

	let keyValue = $state('');
	let status = $state<'idle' | 'saving' | 'saved'>('idle');
	let confirmingRevoke = $state(false);

	const statusText = $derived(
		row.configured
			? `✓ Configured · ${sourceLabel(row)}${row.last4 ? ` · ••••${row.last4}` : ''}`
			: 'No key'
	);

	const submitKey: SubmitFunction = () => {
		status = 'saving';
		return async ({ result, update }) => {
			if (result.type === 'success') {
				status = 'saved';
				keyValue = ''; // write-only: never keep the secret around
			} else {
				status = 'idle';
			}
			await update(); // refresh statuses (hot-applied) + surface failure payload
		};
	};

	const submitRevoke: SubmitFunction = () => {
		confirmingRevoke = false;
		return async ({ update }) => {
			await update();
		};
	};
</script>

<div class="border-b border-mlq-subtle px-4 py-3 last:border-b-0">
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-mlq-text">{row.provider}</span>
		{#if row.type}<span class="rounded-full border border-mlq-subtle px-1.5 text-xs text-mlq-muted"
				>{row.type}</span
			>{/if}
		<span class="text-xs {row.configured ? 'text-mlq-success' : 'text-mlq-muted'}"
			>{statusText}</span
		>
	</div>
	{#if row.source === 'env'}
		<p class="mt-0.5 text-xs text-mlq-muted">
			This key is managed by your deployment's environment.
		</p>
	{/if}

	<div class="mt-2 flex flex-wrap items-center gap-2">
		<form method="POST" action="?/setKey" use:enhance={submitKey} class="flex items-center gap-2">
			<input type="hidden" name="provider" value={row.provider} />
			<input
				type="password"
				name="api_key"
				autocomplete="new-password"
				aria-label="API key for {row.provider}"
				placeholder={row.configured ? 'New key' : 'Paste key'}
				bind:value={keyValue}
				class="w-56 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-xs text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow"
			/>
			<button
				type="submit"
				disabled={!keyValue.trim()}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50 disabled:opacity-60"
			>
				{row.configured ? 'Replace key' : 'Add key'}
			</button>
			{#if status === 'saving'}<span class="text-xs text-mlq-muted">Saving…</span>
			{:else if status === 'saved'}<span class="text-xs text-mlq-success">Saved</span>{/if}
		</form>

		{#if canRevoke(row)}
			{#if confirmingRevoke}
				<span class="text-xs text-mlq-text">Revoke key?</span>
				<form method="POST" action="?/revokeKey" use:enhance={submitRevoke} class="inline">
					<input type="hidden" name="provider" value={row.provider} />
					<button
						type="submit"
						class="rounded-mlq-control border border-mlq-error px-2.5 py-1 text-xs text-mlq-error hover:bg-mlq-error/10"
						>Confirm revoke</button
					>
				</form>
				<button
					type="button"
					onclick={() => (confirmingRevoke = false)}
					class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
				>
			{:else}
				<button
					type="button"
					onclick={() => (confirmingRevoke = true)}
					class="text-xs text-mlq-muted hover:text-mlq-error">Revoke</button
				>
			{/if}
		{/if}
	</div>

	{#if row.source === 'env'}
		<p class="mt-1 text-xs text-mlq-muted/80">
			Saving a key here takes over management from the environment.
		</p>
	{/if}
	{#if error}
		<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>
	{/if}
</div>
```

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run src/lib/inference/ProviderKeyRowItem.svelte.test.ts && npm run check`
Expected: all PASS; check 0/0. (If svelte-check flags `state_referenced_locally` anywhere, wrap the offending expression in `$derived(...)` — precedent from FindingCard.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/inference/ProviderKeyRowItem.svelte src/lib/inference/ProviderKeyRowItem.svelte.test.ts
git commit -m "feat(settings): ProviderKeyRowItem (masked write-only input, env semantics, two-step revoke)"
```

---

### Task 4: `ProviderKeysCard.svelte` + page mount

**Files:**

- Create: `src/lib/inference/ProviderKeysCard.svelte`
- Test: `src/lib/inference/ProviderKeysCard.svelte.test.ts`
- Modify: `src/routes/(app)/settings/models/+page.svelte`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inference/ProviderKeysCard.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProviderKeysCard from './ProviderKeysCard.svelte';
import type { ProviderKeyRow } from './providerKeys';

const rows: ProviderKeyRow[] = [
	{ provider: 'anthropic-prod', type: 'anthropic', configured: true, last4: 'a1b2', source: 'env' },
	{ provider: 'openai-prod', type: 'openai', configured: false, last4: null, source: null }
];

describe('ProviderKeysCard', () => {
	it('admin: renders one row per provider with the sub-copy', () => {
		render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: rows, form: null } });
		expect(screen.getByRole('heading', { name: /provider keys/i })).toBeInTheDocument();
		expect(screen.getByText(/encrypted at rest .* applied immediately/i)).toBeInTheDocument();
		expect(screen.getByText('anthropic-prod')).toBeInTheDocument();
		expect(screen.getByText('openai-prod')).toBeInTheDocument();
	});
	it('routes a row-scoped error to the matching row only', () => {
		render(ProviderKeysCard, {
			props: {
				isAdmin: true,
				providerKeys: rows,
				form: { provider: 'openai-prod', message: 'Unknown provider.' }
			}
		});
		const alerts = screen.getAllByRole('alert');
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toHaveTextContent('Unknown provider.');
	});
	it('admin: empty list → no-providers note', () => {
		render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: [], form: null } });
		expect(screen.getByText('No providers are configured in the gateway.')).toBeInTheDocument();
	});
	it('admin: failed fetch (null) → degraded message', () => {
		render(ProviderKeysCard, { props: { isAdmin: true, providerKeys: null, form: null } });
		expect(screen.getByText('Could not load provider keys right now.')).toBeInTheDocument();
	});
	it('non-admin: managed-by-administrator note, no rows', () => {
		render(ProviderKeysCard, { props: { isAdmin: false, providerKeys: null, form: null } });
		expect(
			screen.getByText('Provider API keys are managed by your administrator.')
		).toBeInTheDocument();
		expect(screen.queryByText('anthropic-prod')).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/inference/ProviderKeysCard.svelte.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/inference/ProviderKeysCard.svelte`**

```svelte
<!-- src/lib/inference/ProviderKeysCard.svelte -->
<!-- Admin-gated BYOK card for /settings/models. Non-admins get a note (the
     API itself is admin-only). `form` is the page's ActionData — failures
     carry { provider, message } so the error lands on the right row. -->
<script lang="ts">
	import ProviderKeyRowItem from './ProviderKeyRowItem.svelte';
	import type { ProviderKeyRow } from './providerKeys';

	let {
		isAdmin,
		providerKeys,
		form
	}: {
		isAdmin: boolean;
		providerKeys: ProviderKeyRow[] | null;
		form: { provider?: string; message?: string } | null | undefined;
	} = $props();

	function rowError(provider: string): string | null {
		return form?.message && form.provider === provider ? form.message : null;
	}
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
	<div class="border-b border-mlq-subtle px-4 py-2">
		<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Provider keys</h2>
		{#if isAdmin}
			<p class="mt-1 text-xs text-mlq-muted">
				Keys are encrypted at rest in the gateway and applied immediately — no restart. The full key
				is never shown again after saving.
			</p>
		{/if}
	</div>
	{#if !isAdmin}
		<p class="px-4 py-3 text-sm text-mlq-muted">
			Provider API keys are managed by your administrator.
		</p>
	{:else if providerKeys === null}
		<p class="px-4 py-3 text-sm text-mlq-muted">Could not load provider keys right now.</p>
	{:else if providerKeys.length === 0}
		<p class="px-4 py-3 text-sm text-mlq-muted">No providers are configured in the gateway.</p>
	{:else}
		{#each providerKeys as row (row.provider)}
			<ProviderKeyRowItem {row} error={rowError(row.provider)} />
		{/each}
	{/if}
</section>
```

- [ ] **Step 4: Mount on the page**

In `src/routes/(app)/settings/models/+page.svelte`:

Script: add the `form` prop and the import —

```svelte
<script lang="ts">
	import CategoryRow from '$lib/inference/CategoryRow.svelte';
	import LocalModelsCard from '$lib/inference/LocalModelsCard.svelte';
	import ProviderKeysCard from '$lib/inference/ProviderKeysCard.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>
```

Replace the placeholder section (the `<section>` containing "In-app key management is coming.") with:

```svelte
<ProviderKeysCard isAdmin={data.isAdmin} providerKeys={data.providerKeys} {form} />
```

(Note: `ActionData` is a union including `reassign`'s `{ message }`-only failures — `rowError` already guards on `form.provider === provider`, and `reassign` failures carry no `provider`, so they never land on a key row. The `form` prop typing in ProviderKeysCard is structural, so passing the page's `form` is type-compatible; if `npm run check` complains about the union, widen the card's prop type to match what check suggests, keeping the `provider`/`message` reads optional.)

- [ ] **Step 5: Run tests + check**

Run: `npx vitest run src/lib/inference/ "src/routes/(app)/settings/models" && npm run check`
Expected: all PASS; check 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/inference/ProviderKeysCard.svelte src/lib/inference/ProviderKeysCard.svelte.test.ts "src/routes/(app)/settings/models/+page.svelte"
git commit -m "feat(settings): ProviderKeysCard replaces the BYOK placeholder on /settings/models"
```

---

### Task 5: Non-destructive live e2e + full verification

**Files:**

- Create: `tests/byok-provider-keys.spec.ts`

- [ ] **Step 1: Prep the dev stack**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

(No backend rebuild needed — the running api/gateway already serve the provider-keys API. Give `donna-web` ~30s to warm.)

- [ ] **Step 2: Write the e2e**

Create `tests/byok-provider-keys.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// Read-only by design: setting/revoking a real key would mutate gateway.yaml
// (and replacing an env key permanently converts it to runtime-managed), which
// is not test-reversible. The write paths are unit-tested; this verifies the
// live read path + env-row affordances.
test('settings → models: provider-keys card renders live statuses (read-only)', async ({
	page
}) => {
	await login(page);
	await page.goto('/settings/models');

	const card = page.locator('section', {
		has: page.getByRole('heading', { name: /provider keys/i })
	});
	await expect(card).toBeVisible();
	await expect(card.getByText(/never shown again after saving/i)).toBeVisible();

	// The dev gateway config has at least one provider; each row exposes a masked input.
	const inputs = card.locator('input[type="password"]');
	expect(await inputs.count()).toBeGreaterThan(0);

	// Dev stack keys come from .env → expect an env-sourced row; it must show the
	// env hints and NO revoke control. (Skip gracefully if this env has none.)
	const envRow = card.locator('div', { hasText: /Configured · environment/ }).first();
	if (await envRow.count()) {
		await expect(envRow.getByText(/managed by your deployment's environment/)).toBeVisible();
		await expect(envRow.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
		await expect(envRow.getByRole('button', { name: 'Replace key' })).toBeVisible();
	}
});
```

- [ ] **Step 3: Run the e2e**

Run: `npx playwright test tests/byok-provider-keys.spec.ts --reporter=line`
Expected: 1 passed. If the card shows "Could not load provider keys right now.", the api/gateway may predate the provider-keys API — check `docker compose logs api --tail 20` and report BLOCKED. On selector mismatch, fix the selector against the live DOM, keep assertion intent.

- [ ] **Step 4: Full-suite verification**

```bash
npx vitest run --silent 2>&1 | tail -3
npm run check
npx eslint src/lib/inference/ "src/routes/(app)/settings/models/" tests/byok-provider-keys.spec.ts
```

Expected: all green; check 0/0; no eslint errors in touched paths.

- [ ] **Step 5: Commit**

```bash
git add tests/byok-provider-keys.spec.ts
git commit -m "test(settings): live e2e — provider-keys card read path + env-row affordances"
```

(Reminder: `git status` must show NO `vendor/lq-ai` change staged at any point.)
