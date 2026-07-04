# Research Sources Admin Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** An admin-gated **Research sources** surface at `/settings/research` where an admin enables/disables the authority sources (CourtListener, GovInfo, EDGAR, EUR-Lex) and sets the keyed ones' API keys **in-app**, hot-applied — no `.env`/`gateway.yaml` editing. Plus enable the keyless sources (EDGAR, EUR-Lex) by default in Donna's gateway wrapper.

**Architecture:** Mirror the inference `ProviderKeysCard` pattern. A hand-typed client/parser (`src/lib/research/toolProviders.ts`) models `GET /api/v1/admin/tool-providers`; the `/settings/research` page loads status server-side (BFF `lqFetch`) and mutates through **form actions** (POST/PATCH/DELETE proxied to `/api/v1/admin/tool-providers`). A `ResearchSourcesAdminCard` renders rows. Part A extends `docker/gateway.Dockerfile`'s baked `tool_providers:` block to enable EDGAR + EUR-Lex by default.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright, Tailwind `mlq-*`.

## Global Constraints

- Backend pin `44a1de54`. Contract (all `AdminUser`-gated, secrets **write-only, never returned**, hot-applied):
  - `GET /api/v1/admin/tool-providers` → `{tool_providers:[{type, enabled, name, has_key, key_required, egress_tier}]}`, one row per type.
  - `POST /api/v1/admin/tool-providers` body `{type, api_key?}` → enable (+ optional key); returns one reshaped row.
  - `PATCH /api/v1/admin/tool-providers/{provider_type}` body `{api_key?, enabled?}` → rotate key / toggle enabled; returns one row.
  - `DELETE /api/v1/admin/tool-providers/{provider_type}` → 204 (disable).
- `type ∈ {courtlistener, govinfo, edgar, eurlex}`. `key_required` true for `courtlistener`/`govinfo`, false for `edgar`/`eurlex`. **Never render a key**; `has_key` is a bool.
- Request bodies are `extra="forbid"` — send **only** `{type, api_key?, enabled?}`; never base_url/allowlist.
- Errors: **400** = gateway master key unset ("runtime key storage disabled"); **404** = unknown type; **409** = env-configured entry ("configured via the environment; edit gateway.yaml"); **403** = non-admin. Map each to honest copy.
- **DE-383:** load authoritative admin status from `GET /admin/tool-providers` — **never** `/research/sources`.
- **No generated types** for these routes — hand-type them (precedent: `providerKeys.ts`, `ledger.ts`). BFF discipline: mutate via form actions, never client→lq-ai. Server-only imports stay server-side. Tabs; Svelte 5 runes.
- Gates: `npm run check` 0/0, `npm run lint` green, `npx vitest run` green, the e2e passing. Commit per task.

---

### Task 1: `toolProviders.ts` — hand-typed client model + parser + helpers

**Files:**

- Create: `src/lib/research/toolProviders.ts`
- Test: `src/lib/research/toolProviders.test.ts`

**Interfaces:**

- Produces: `interface ToolProviderRow { type: string; enabled: boolean; name: string | null; has_key: boolean; key_required: boolean; egress_tier: number | null }`; `parseToolProviders(raw: unknown): ToolProviderRow[]`; `sourceLabel(type: string): string`; `keyStatus(row): 'no_key_needed' | 'key_set' | 'no_key'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/research/toolProviders.test.ts
import { describe, it, expect } from 'vitest';
import { parseToolProviders, sourceLabel, keyStatus } from './toolProviders';

const RAW = {
	tool_providers: [
		{
			type: 'courtlistener',
			enabled: false,
			name: 'courtlistener-prod',
			has_key: false,
			key_required: true,
			egress_tier: 4
		},
		{
			type: 'edgar',
			enabled: true,
			name: 'edgar-prod',
			has_key: false,
			key_required: false,
			egress_tier: 4
		}
	]
};

describe('parseToolProviders', () => {
	it('parses rows and coerces types', () => {
		const rows = parseToolProviders(RAW);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			type: 'courtlistener',
			enabled: false,
			name: 'courtlistener-prod',
			has_key: false,
			key_required: true,
			egress_tier: 4
		});
		expect(rows[1].enabled).toBe(true);
	});
	it('drops malformed rows (no type) and tolerates a non-array', () => {
		expect(parseToolProviders({ tool_providers: [{ enabled: true }] })).toEqual([]);
		expect(parseToolProviders({})).toEqual([]);
		expect(parseToolProviders(null)).toEqual([]);
	});
	it('defaults booleans safely', () => {
		const [r] = parseToolProviders({ tool_providers: [{ type: 'eurlex' }] });
		expect(r).toEqual({
			type: 'eurlex',
			enabled: false,
			name: null,
			has_key: false,
			key_required: false,
			egress_tier: null
		});
	});
});

describe('sourceLabel', () => {
	it('maps known types and falls back to the raw type', () => {
		expect(sourceLabel('courtlistener')).toMatch(/CourtListener/);
		expect(sourceLabel('edgar')).toMatch(/EDGAR/);
		expect(sourceLabel('mystery')).toBe('mystery');
	});
});

describe('keyStatus', () => {
	it('classifies the key column', () => {
		expect(keyStatus({ key_required: false } as never)).toBe('no_key_needed');
		expect(keyStatus({ key_required: true, has_key: true } as never)).toBe('key_set');
		expect(keyStatus({ key_required: true, has_key: false } as never)).toBe('no_key');
	});
});
```

- [ ] **Step 2: Run — fail** — `npx vitest run src/lib/research/toolProviders.test.ts` → cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/lib/research/toolProviders.ts
// Hand-typed view model + helpers for GET /api/v1/admin/tool-providers
// (lq-ai #273). The routes are not in Donna's generated typegen (they live in
// the code-generated OpenAPI export, which we don't yet consume — see the pin
// log), so we hand-type + defensively parse here (house style of
// $lib/inference/providerKeys.ts). Secrets are never returned — rows carry
// only a has_key bool.

export interface ToolProviderRow {
	type: string;
	enabled: boolean;
	name: string | null;
	has_key: boolean;
	key_required: boolean;
	egress_tier: number | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseToolProviders(raw: unknown): ToolProviderRow[] {
	const arr = obj(raw).tool_providers;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((p) => {
			const r = obj(p);
			if (typeof r.type !== 'string') return null;
			return {
				type: r.type,
				enabled: r.enabled === true,
				name: str(r.name),
				has_key: r.has_key === true,
				key_required: r.key_required === true,
				egress_tier: num(r.egress_tier)
			};
		})
		.filter((p): p is ToolProviderRow => p !== null);
}

const LABELS: Record<string, string> = {
	courtlistener: 'CourtListener — U.S. case law',
	govinfo: 'GovInfo — U.S. Code + CFR',
	edgar: 'SEC EDGAR — company filings',
	eurlex: 'EUR-Lex — EU law + CJEU'
};

/** Human label for a source type; falls back to the raw type. */
export function sourceLabel(type: string): string {
	return LABELS[type] ?? type;
}

/** The key-column state for a row. */
export function keyStatus(row: ToolProviderRow): 'no_key_needed' | 'key_set' | 'no_key' {
	if (!row.key_required) return 'no_key_needed';
	return row.has_key ? 'key_set' : 'no_key';
}
```

- [ ] **Step 4: Run — pass** — `npx vitest run src/lib/research/toolProviders.test.ts` → all green.

- [ ] **Step 5: Commit** — `git add src/lib/research/toolProviders.ts src/lib/research/toolProviders.test.ts && git commit -m "feat(research): hand-typed tool-providers client model + parser"`

---

### Task 2: `/settings/research` loader + form actions

**Files:**

- Create: `src/routes/(app)/settings/research/+page.server.ts`
- Test: `src/routes/(app)/settings/research/page.server.test.ts`

**Interfaces:**

- Consumes: `lqFetch` (`$lib/server/lqClient`); `parseToolProviders` (Task 1).
- Produces: `load` → `{ isAdmin: boolean; sources: ToolProviderRow[] | null }` (non-admin → `{isAdmin:false, sources:null}`, no fetch). Form actions `enable` (POST `{type}`), `setKey` (POST `{type, api_key}`), `reenable` (PATCH `{enabled:true}`), `disable` (DELETE). Each returns `{ success, type }` or `fail(status, { type, message })` mapping 403/404/400/409.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/settings/research/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ROWS = {
	tool_providers: [
		{
			type: 'edgar',
			enabled: false,
			name: 'edgar-prod',
			has_key: false,
			key_required: false,
			egress_tier: 4
		}
	]
};
const admin = (over = {}) => ({ locals: { user: { is_admin: true } }, ...over }) as never;
const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return { request: { formData: async () => f }, locals: { user: { is_admin: true } } } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/settings/research load', () => {
	it('loads sources for an admin', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ROWS });
		const out = (await load(admin())) as { isAdmin: boolean; sources: unknown[] };
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/admin/tool-providers');
		expect(out.isAdmin).toBe(true);
		expect(out.sources).toHaveLength(1);
	});
	it('does not fetch for a non-admin', async () => {
		const out = (await load({ locals: { user: { is_admin: false } } } as never)) as {
			isAdmin: boolean;
			sources: unknown;
		};
		expect(out).toEqual({ isAdmin: false, sources: null });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('/settings/research actions', () => {
	it('enable POSTs {type}', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		const r = await actions.enable(fd({ type: 'edgar' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers',
			expect.objectContaining({ method: 'POST', body: JSON.stringify({ type: 'edgar' }) })
		);
		expect(r).toEqual({ success: true, type: 'edgar' });
	});
	it('setKey POSTs {type, api_key}', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await actions.setKey(fd({ type: 'courtlistener', api_key: '  tok  ' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ type: 'courtlistener', api_key: 'tok' })
			})
		);
	});
	it('setKey with a blank key fails 400 without a call', async () => {
		const r = await actions.setKey(fd({ type: 'courtlistener', api_key: '   ' }));
		expect(lqFetch).not.toHaveBeenCalled();
		expect(r).toMatchObject({ status: 400, data: { type: 'courtlistener' } });
	});
	it('disable DELETEs the type', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
		await actions.disable(fd({ type: 'edgar' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers/edgar',
			expect.objectContaining({ method: 'DELETE' })
		);
	});
	it('maps 400 master-key, 404 unknown, 409 env-configured', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'no master key' });
		expect(await actions.enable(fd({ type: 'edgar' }))).toMatchObject({ status: 400 });
		lqFetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
		expect(await actions.enable(fd({ type: 'edgar' }))).toMatchObject({ status: 404 });
		lqFetch.mockResolvedValue({ ok: false, status: 409, text: async () => '' });
		expect(await actions.disable(fd({ type: 'edgar' }))).toMatchObject({ status: 409 });
	});
});
```

- [ ] **Step 2: Run — fail** — `npx vitest run "src/routes/(app)/settings/research/page.server.test.ts"` → no module.

- [ ] **Step 3: Implement**

```ts
// src/routes/(app)/settings/research/+page.server.ts
import { fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseToolProviders, type ToolProviderRow } from '$lib/research/toolProviders';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const isAdmin = !!event.locals.user?.is_admin;
	if (!isAdmin) return { isAdmin: false, sources: null as ToolProviderRow[] | null };
	const res = await lqFetch(event, '/api/v1/admin/tool-providers');
	if (!res.ok) return { isAdmin, sources: null as ToolProviderRow[] | null };
	try {
		return { isAdmin, sources: parseToolProviders(await res.json()) };
	} catch {
		return { isAdmin, sources: null as ToolProviderRow[] | null };
	}
};

async function mapError(res: { status: number; text: () => Promise<string> }, type: string) {
	if (res.status === 403)
		return fail(403, { type, message: 'Managing research sources requires an admin account.' });
	if (res.status === 404)
		return fail(404, { type, message: 'That source is not available on this deployment.' });
	if (res.status === 409)
		return fail(409, {
			type,
			message: 'This source is configured via the environment — edit gateway.yaml to change it.'
		});
	if (res.status === 400) {
		const body = await res.text().catch(() => '');
		return fail(400, {
			type,
			message: /master.?key/i.test(body)
				? 'The gateway has no master key set, so runtime key storage is disabled — ask your operator to configure LQ_AI_GATEWAY_MASTER_KEY.'
				: 'Could not update this source.'
		});
	}
	return fail(502, { type, message: 'Could not update this source.' });
}

export const actions: Actions = {
	enable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, '/api/v1/admin/tool-providers', {
			method: 'POST',
			body: JSON.stringify({ type })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	setKey: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		const apiKey = String(data.get('api_key') ?? '').trim();
		if (!type) return fail(400, { type, message: 'Missing source.' });
		if (!apiKey) return fail(400, { type, message: 'Paste a key first.' });
		const res = await lqFetch(event, '/api/v1/admin/tool-providers', {
			method: 'POST',
			body: JSON.stringify({ type, api_key: apiKey })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	reenable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, `/api/v1/admin/tool-providers/${encodeURIComponent(type)}`, {
			method: 'PATCH',
			body: JSON.stringify({ enabled: true })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	disable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, `/api/v1/admin/tool-providers/${encodeURIComponent(type)}`, {
			method: 'DELETE'
		});
		if (res.ok || res.status === 404) return { success: true, type };
		return mapError(res, type);
	}
};
```

- [ ] **Step 4: Run — pass** — `npx vitest run "src/routes/(app)/settings/research/page.server.test.ts"` → green.

- [ ] **Step 5: Commit** — `git add "src/routes/(app)/settings/research/+page.server.ts" "src/routes/(app)/settings/research/page.server.test.ts" && git commit -m "feat(research): /settings/research loader + tool-provider form actions"`

---

### Task 3: `ResearchSourcesAdminCard` component

**Files:**

- Create: `src/lib/research/ResearchSourcesAdminCard.svelte`
- Test: `src/lib/research/ResearchSourcesAdminCard.svelte.test.ts`

**Interfaces:**

- Consumes: `ToolProviderRow`, `sourceLabel`, `keyStatus` (Task 1); `form` ActionData `{ type?; message?; success?boolean }`.
- Produces: the card. Props `{ isAdmin: boolean; sources: ToolProviderRow[] | null; form }`. Renders per-row status/key/actions using native `<form method="POST" action="?/…">` posts (progressive enhancement via `use:enhance`).

- [ ] **Step 1: Write the failing component test**

```ts
// src/lib/research/ResearchSourcesAdminCard.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Card from './ResearchSourcesAdminCard.svelte';
import type { ToolProviderRow } from './toolProviders';

const rows: ToolProviderRow[] = [
	{
		type: 'courtlistener',
		enabled: false,
		name: 'courtlistener-prod',
		has_key: false,
		key_required: true,
		egress_tier: 4
	},
	{
		type: 'edgar',
		enabled: true,
		name: 'edgar-prod',
		has_key: false,
		key_required: false,
		egress_tier: 4
	}
];

describe('ResearchSourcesAdminCard', () => {
	it('renders a row per source with badges and keyed vs keyless controls', () => {
		render(Card, { props: { isAdmin: true, sources: rows, form: null } });
		expect(screen.getByText(/CourtListener/)).toBeInTheDocument();
		expect(screen.getByText(/SEC EDGAR/)).toBeInTheDocument();
		// keyless enabled edgar → Available + a Disable control
		expect(screen.getByText('Available')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
		// keyed courtlistener (no key) → a Set key control, no rendered key
		expect(screen.getByRole('button', { name: /set key/i })).toBeInTheDocument();
	});
	it('shows a non-admin note and no controls', () => {
		render(Card, { props: { isAdmin: false, sources: null, form: null } });
		expect(screen.getByText(/managed by your administrator/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /enable|disable|set key/i })).toBeNull();
	});
	it('surfaces a row-scoped error from form', () => {
		render(Card, {
			props: {
				isAdmin: true,
				sources: rows,
				form: { type: 'courtlistener', message: 'runtime key storage is disabled' }
			}
		});
		expect(screen.getByText(/runtime key storage is disabled/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement** (mirror `ProviderKeysCard`; native forms + `use:enhance`; masked input only for keyed rows; never render a key)

```svelte
<!-- src/lib/research/ResearchSourcesAdminCard.svelte -->
<!-- Admin-gated card for /settings/research: enable/disable authority sources +
     set the keyed ones' API keys, hot-applied via form actions. Mirrors
     ProviderKeysCard. Status comes from GET /admin/tool-providers (DE-383), not
     /research/sources. Secrets are write-only — has_key is a bool, never a key. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { sourceLabel, keyStatus, type ToolProviderRow } from './toolProviders';

	let {
		isAdmin,
		sources,
		form
	}: {
		isAdmin: boolean;
		sources: ToolProviderRow[] | null;
		form: { type?: string; message?: string; success?: boolean } | null | undefined;
	} = $props();

	// Which keyed row has its key editor open.
	let editing = $state<string | null>(null);
	function rowError(type: string): string | null {
		return form?.message && form.type === type ? form.message : null;
	}
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
	<div class="border-b border-mlq-subtle px-4 py-2">
		<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Research sources</h2>
		{#if isAdmin}
			<p class="mt-1 text-xs text-mlq-muted">
				The authority sources Donna can cite. Keys are encrypted at rest in the gateway and applied
				immediately — no restart. A key is never shown after saving.
			</p>
		{/if}
	</div>

	{#if !isAdmin}
		<p class="px-4 py-3 text-sm text-mlq-muted">
			Research sources are managed by your administrator.
		</p>
	{:else if sources === null}
		<p class="px-4 py-3 text-sm text-mlq-muted">Could not load research sources right now.</p>
	{:else if sources.length === 0}
		<p class="px-4 py-3 text-sm text-mlq-muted">No authority sources are registered.</p>
	{:else}
		<ul>
			{#each sources as row (row.type)}
				{@const ks = keyStatus(row)}
				<li class="border-b border-mlq-subtle px-4 py-3 last:border-b-0">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="min-w-0">
							<div class="text-sm font-medium text-mlq-text">{sourceLabel(row.type)}</div>
							<div class="mt-0.5 flex items-center gap-2 text-xs">
								{#if row.enabled}
									<span class="font-medium text-mlq-success">● Available</span>
								{:else}
									<span class="text-mlq-muted">○ Unavailable</span>
								{/if}
								<span class="text-mlq-muted">
									·
									{#if ks === 'no_key_needed'}No key needed{:else if ks === 'key_set'}Key set{:else}No
										key{/if}
								</span>
							</div>
						</div>
						<div class="flex items-center gap-2">
							{#if row.key_required}
								<button
									type="button"
									onclick={() => (editing = editing === row.type ? null : row.type)}
									class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt"
								>
									{row.has_key ? 'Replace key' : 'Set key'}
								</button>
							{:else if !row.enabled}
								<form method="POST" action="?/enable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control bg-mlq-workflow px-2 py-1 text-xs font-medium text-white"
										>Enable</button
									>
								</form>
							{/if}
							{#if row.key_required && row.has_key && !row.enabled}
								<form method="POST" action="?/reenable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control bg-mlq-workflow px-2 py-1 text-xs font-medium text-white"
										>Enable</button
									>
								</form>
							{/if}
							{#if row.enabled}
								<form method="POST" action="?/disable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control border border-mlq-error/40 px-2 py-1 text-xs text-mlq-error hover:bg-mlq-surface-alt"
										>Disable</button
									>
								</form>
							{/if}
						</div>
					</div>

					{#if editing === row.type && row.key_required}
						<form
							method="POST"
							action="?/setKey"
							use:enhance={() =>
								async ({ update }) => {
									await update();
									editing = null;
								}}
							class="mt-2 flex flex-wrap items-end gap-2"
						>
							<input type="hidden" name="type" value={row.type} />
							<label class="flex flex-col gap-1 text-xs text-mlq-muted">
								API key for {sourceLabel(row.type)}
								<input
									name="api_key"
									type="password"
									autocomplete="off"
									placeholder="Paste the key"
									class="w-72 max-w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-sm text-mlq-text"
								/>
							</label>
							<button
								type="submit"
								class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
								>Save key</button
							>
							<button
								type="button"
								onclick={() => (editing = null)}
								class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
								>Cancel</button
							>
						</form>
					{/if}

					{#if rowError(row.type)}
						<p role="alert" class="mt-1 text-xs text-mlq-error">{rowError(row.type)}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
```

- [ ] **Step 4: Run — pass** + `npm run check` 0/0.

- [ ] **Step 5: Commit** — `git add src/lib/research/ResearchSourcesAdminCard.svelte src/lib/research/ResearchSourcesAdminCard.svelte.test.ts && git commit -m "feat(research): ResearchSourcesAdminCard (enable/disable + set key)"`

---

### Task 4: `/settings/research` page + SettingsRail entry

**Files:**

- Create: `src/routes/(app)/settings/research/+page.svelte`
- Modify: `src/lib/settings/SettingsRail.svelte` (admin-only "Research sources" entry)
- Test: `src/lib/settings/SettingsRail.svelte.test.ts` (create if absent; assert entry shown for admin, hidden otherwise)

**Interfaces:**

- Consumes: `PageData` from Task 2 (`{ isAdmin, sources }`) + `ActionData`; `ResearchSourcesAdminCard` (Task 3).

- [ ] **Step 1: Failing SettingsRail test** — create `src/lib/settings/SettingsRail.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/settings/account') } }));
import SettingsRail from './SettingsRail.svelte';

describe('SettingsRail', () => {
	it('shows Research sources for an admin', () => {
		render(SettingsRail, { props: { isAdmin: true } });
		expect(screen.getByRole('link', { name: 'Research sources' })).toHaveAttribute(
			'href',
			'/settings/research'
		);
	});
	it('hides Research sources for a non-admin', () => {
		render(SettingsRail, { props: { isAdmin: false } });
		expect(screen.queryByRole('link', { name: 'Research sources' })).toBeNull();
	});
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Add the rail entry** — in `SettingsRail.svelte`, extend the admin-only spread:

```ts
		...(isAdmin
			? [
					{ href: '/settings/mcp', label: 'MCP' },
					{ href: '/settings/research', label: 'Research sources' }
				]
			: [])
```

- [ ] **Step 4: Create the page**

```svelte
<!-- src/routes/(app)/settings/research/+page.svelte -->
<script lang="ts">
	import ResearchSourcesAdminCard from '$lib/research/ResearchSourcesAdminCard.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Research sources — Donna</title></svelte:head>

<div class="flex flex-col gap-4">
	<h1 class="text-lg font-medium text-mlq-text">Research sources</h1>
	<ResearchSourcesAdminCard isAdmin={data.isAdmin} sources={data.sources} {form} />
</div>
```

- [ ] **Step 5: Run tests + check + lint** — `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts && npm run check && npm run lint` → green.

- [ ] **Step 6: Commit** — `git add "src/routes/(app)/settings/research/+page.svelte" src/lib/settings/SettingsRail.svelte src/lib/settings/SettingsRail.svelte.test.ts && git commit -m "feat(research): /settings/research page + gated rail entry"`

---

### Task 5: Live e2e — admin enables then disables a keyless source

**Files:**

- Create: `tests/research-sources-admin.spec.ts`

**Interfaces:** consumes the running stack (rebuild `donna-web` first) + admin fixture. Enables EDGAR (keyless) via the card, asserts it flips to Available, then disables it. Self-cleaning (disable in `finally`).

- [ ] **Step 1: Write the e2e**

```ts
// tests/research-sources-admin.spec.ts
import { execSync } from 'node:child_process';
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

// Ensure edgar is disabled at start + end (idempotent; DELETE is 204/404-safe).
function disableEdgar() {
	try {
		execSync(`docker compose exec -T api python -c "import asyncio;print('noop')"`, {
			stdio: 'ignore',
			env: process.env
		});
	} catch {
		/* best-effort */
	}
}

test('admin enables then disables a keyless authority source (EDGAR)', async ({ page }) => {
	await login(page);
	await page.goto('/settings/research');

	// The EDGAR row is present; enable it (keyless → Enable button).
	const edgarRow = page.locator('li', { hasText: /SEC EDGAR/ });
	await expect(edgarRow).toBeVisible();

	try {
		if (await edgarRow.getByRole('button', { name: /^Enable$/ }).count()) {
			await edgarRow.getByRole('button', { name: /^Enable$/ }).click();
		}
		// After the form action + reload, EDGAR shows Available + a Disable control.
		await expect(edgarRow.getByText('Available')).toBeVisible({ timeout: 15000 });
		await expect(edgarRow.getByRole('button', { name: /disable/i })).toBeVisible();
	} finally {
		// Teardown: disable via the UI if still enabled.
		await page.goto('/settings/research');
		const row = page.locator('li', { hasText: /SEC EDGAR/ });
		if (await row.getByRole('button', { name: /disable/i }).count()) {
			await row.getByRole('button', { name: /disable/i }).click();
			await expect(row.getByText('Unavailable')).toBeVisible({ timeout: 15000 });
		}
	}
});
```

- [ ] **Step 2: Rebuild web + run** — `set -a; . ./.env; set +a; docker compose up -d --build donna-web && npx playwright test tests/research-sources-admin.spec.ts` → 1 passed. (Remove the unused `disableEdgar`/`execSync` import if the teardown-via-UI path is sufficient — keep the spec lint-clean.)

- [ ] **Step 3: Commit** — `git add tests/research-sources-admin.spec.ts && git commit -m "test(research): live e2e — admin enables/disables a keyless source"`

---

### Task 6 (Part A): enable keyless EDGAR + EUR-Lex by default in the gateway wrapper

**Files:**

- Modify: `docker/gateway.Dockerfile` (append edgar + eurlex entries to the baked `tool_providers:` block)
- Modify: `docker/courtlistener.tool_provider.yaml` (keep it the source-of-truth mirror of the appended block)
- Verify: `docker/gateway-config.test.sh` still passes (or extend it)

**Interfaces:** the gateway wrapper bakes one `tool_providers:` list; add the two keyless (no `api_key_env`) entries so a fresh install reports them `enabled`.

- [ ] **Step 1: Read `docker/gateway.Dockerfile` + `docker/courtlistener.tool_provider.yaml` + `docker/gateway-config.test.sh`** to match the exact YAML shape (name/type/base_url/allowlist/rate_limit; EDGAR + EUR-Lex use a User-Agent, no key).

- [ ] **Step 2: Append the two keyless entries** under the SAME `tool_providers:` list in the Dockerfile heredoc (do NOT emit a second `tool_providers:` key). Use the registry/gateway.yaml.example blocks as the shape reference (`vendor/lq-ai/gateway.yaml.example` edgar/eurlex commented blocks — copy their `base_url`/`allowlist`/User-Agent). Mirror the same into `courtlistener.tool_provider.yaml`.

- [ ] **Step 3: Run `docker/gateway-config.test.sh`** (the config parses + the wrapper produces valid YAML) → green. If it pins provider counts, bump them.

- [ ] **Step 4: Commit** — `git add docker/gateway.Dockerfile docker/courtlistener.tool_provider.yaml docker/gateway-config.test.sh && git commit -m "feat(research): enable keyless EDGAR + EUR-Lex by default in the gateway wrapper"`

---

## Final verification (before PR)

- [ ] `npm run check` 0/0 · `npm run lint` green · `npx vitest run` green
- [ ] `npx playwright test tests/research-sources-admin.spec.ts tests/research-sources.spec.ts` green
- [ ] Whole-branch Opus review (superpowers:requesting-code-review), then PR to `main` with a **merge commit**, `git push tucuxi`.
- [ ] Separately: verify **D** (desktop wizard CourtListener token) still fine; then the **release cut**.

## Self-review notes

- Coverage: contract GET/POST/PATCH/DELETE → Tasks 2 (actions) + 3 (controls); UI rules (keyed vs keyless, badges, never-render-key) → Task 3; errors 400/404/409/403 → Task 2 `mapError`; DE-383 (load from /admin/tool-providers) → Task 2 load; placement/rail → Task 4; Part A default-on → Task 6.
- Types: `ToolProviderRow` (Task 1) flows to loader (2), card (3), page (4). Form action names `enable`/`setKey`/`reenable`/`disable` consistent between the loader and the card's `action="?/…"`.
- BFF: all mutation via form actions (server `lqFetch`), never client→lq-ai. Secrets never returned/rendered.
