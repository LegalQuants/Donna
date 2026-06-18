# Slice B — MCP admin config (`/settings/mcp`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-gated `/settings/mcp` page that lists the operator's MCP servers + tools, refreshes a server's tool discovery, and enables/disables individual tools (with read-only/destructive/confirm badges).

**Architecture:** BFF + admin-gated SvelteKit **form actions** (the BYOK `/settings/models` precedent), not the research slice's client-proxy/controller style. SSR `load` fetches `/api/v1/admin/mcp` only for admins; `toggleTool`/`refreshServer` are form actions that `PATCH`/`POST` the backend and `invalidateAll`. A pure data module parses the MCP-discovery payload defensively.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + Testing Library, Playwright. Pinned lq-ai `8142d58`.

**Spec:** `docs/superpowers/specs/2026-06-17-slice-b-mcp-admin-design.md`. **Contract is pinned & verified** (named `MCPServerView`/`MCPToolView` in `src/lib/api/backend.d.ts`; the 3 `/api/v1/admin/mcp` paths present).

**Conventions to mirror:** `src/routes/(app)/settings/models/+page.server.ts` (admin-gated load + `fail(403)` form actions); `src/lib/automations/findings.ts` (defensive parser); `src/lib/settings/SettingsRail.svelte` (settings nav). Tabs for indent. After every task: `npm run check` 0/0, `npm run lint` green, vitest passing.

---

### Task 1: MCP data layer — view-models, defensive parsers, badge helper

**Files:**

- Create: `src/lib/mcp/mcp.ts`
- Test: `src/lib/mcp/mcp.test.ts`

> The `/admin/mcp` schemas are named/typed in `backend.d.ts`, but tool `name`/`description`/flags are **MCP-discovery-sourced** (third-party), so we keep Donna view-models + a defensive parser at the boundary (mirrors `findings.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/mcp/mcp.test.ts
import { describe, it, expect } from 'vitest';
import { parseMcpServers, parseMcpTools, toolBadges } from './mcp';

const tool = (over = {}) => ({
	name: 'read_file',
	description: 'Reads a file.',
	read_only: true,
	destructive: false,
	requires_confirmation: false,
	enabled: true,
	...over
});

describe('parseMcpServers', () => {
	it('parses servers + tools, drops malformed rows', () => {
		const out = parseMcpServers({
			servers: [
				{ name: 'fs', type: 'mcp', tools: [tool(), 42, { description: 'no name' }] },
				99,
				{ type: 'mcp' } // no name → dropped
			]
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ name: 'fs', type: 'mcp' });
		expect(out[0].tools).toHaveLength(1);
		expect(out[0].tools[0]).toMatchObject({ name: 'read_file', read_only: true, enabled: true });
	});
	it('empty on junk', () => {
		expect(parseMcpServers(null)).toEqual([]);
		expect(parseMcpServers({ servers: 'nope' })).toEqual([]);
	});
	it('boolean flags default to false when absent', () => {
		const out = parseMcpServers({ servers: [{ name: 's', type: 'mcp', tools: [{ name: 't' }] }] });
		expect(out[0].tools[0]).toMatchObject({
			read_only: false,
			destructive: false,
			requires_confirmation: false,
			enabled: false,
			description: null
		});
	});
});

describe('parseMcpTools', () => {
	it('parses a refresh response tool list', () => {
		expect(parseMcpTools({ server: 'fs', tools: [tool({ name: 'x' })] })).toEqual([
			expect.objectContaining({ name: 'x' })
		]);
	});
	it('empty on junk', () => {
		expect(parseMcpTools(null)).toEqual([]);
	});
});

describe('toolBadges', () => {
	it('derives one badge per active flag, in order', () => {
		expect(
			toolBadges(tool({ read_only: true, destructive: true, requires_confirmation: true }))
		).toEqual([
			{ label: 'read-only', kind: 'info' },
			{ label: 'destructive', kind: 'danger' },
			{ label: 'needs confirmation', kind: 'warn' }
		]);
	});
	it('no badges when all flags false', () => {
		expect(toolBadges(tool({ read_only: false }))).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/mcp.test.ts`
Expected: FAIL — "Cannot find module './mcp'".

- [ ] **Step 3: Implement `mcp.ts`**

```ts
// src/lib/mcp/mcp.ts
// View-models + defensive parsers for the /api/v1/admin/mcp surface (WS2, pin
// 8142d58). The backend types these (named MCPServerView/MCPToolView), but tool
// name/description/flags are MCP-discovery-sourced (third-party), so we guard at
// the boundary and drop malformed rows — same style as automations/findings.ts.

export interface McpTool {
	name: string;
	description: string | null;
	read_only: boolean;
	destructive: boolean;
	requires_confirmation: boolean;
	enabled: boolean;
}

export interface McpServer {
	name: string;
	type: string;
	tools: McpTool[];
}

export type BadgeKind = 'info' | 'danger' | 'warn';
export interface ToolBadge {
	label: string;
	kind: BadgeKind;
}

function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function bool(v: unknown): boolean {
	return v === true;
}

function parseTool(raw: unknown): McpTool | null {
	const r = obj(raw);
	if (typeof r.name !== 'string') return null;
	return {
		name: r.name,
		description: str(r.description),
		read_only: bool(r.read_only),
		destructive: bool(r.destructive),
		requires_confirmation: bool(r.requires_confirmation),
		enabled: bool(r.enabled)
	};
}

function parseToolList(raw: unknown): McpTool[] {
	return (Array.isArray(raw) ? raw : []).map(parseTool).filter((t): t is McpTool => t !== null);
}

export function parseMcpServers(raw: unknown): McpServer[] {
	const r = obj(raw);
	return (Array.isArray(r.servers) ? r.servers : [])
		.map((s) => {
			const o = obj(s);
			if (typeof o.name !== 'string') return null;
			return {
				name: o.name,
				type: str(o.type) ?? '',
				tools: parseToolList(o.tools)
			};
		})
		.filter((s): s is McpServer => s !== null);
}

/** Tool list from a `POST /{server}/refresh` response (`{ server, tools }`). */
export function parseMcpTools(raw: unknown): McpTool[] {
	return parseToolList(obj(raw).tools);
}

/** One badge per active metadata flag, in a fixed order. Reused by Slice C. */
export function toolBadges(t: McpTool): ToolBadge[] {
	const badges: ToolBadge[] = [];
	if (t.read_only) badges.push({ label: 'read-only', kind: 'info' });
	if (t.destructive) badges.push({ label: 'destructive', kind: 'danger' });
	if (t.requires_confirmation) badges.push({ label: 'needs confirmation', kind: 'warn' });
	return badges;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/lib/mcp/mcp.ts src/lib/mcp/mcp.test.ts
git commit -m "feat(mcp): data layer — view-models, defensive parsers, tool badges"
```

---

### Task 2: Page server — admin-gated load + toggle/refresh actions

**Files:**

- Create: `src/routes/(app)/settings/mcp/+page.server.ts`
- Test: `src/routes/(app)/settings/mcp/page.server.test.ts`

> Mirror `settings/models/+page.server.ts`: admin via `event.locals.user?.is_admin`; degrade independently; actions `fail(403)` on a backend 403.

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/(app)/settings/mcp/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

function res(status: number, body: unknown) {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
const admin = { locals: { user: { is_admin: true } } };
const nonAdmin = { locals: { user: { is_admin: false } } };
function formEvent(base: { locals: unknown }, fields: Record<string, string>) {
	const fd = new URLSearchParams(fields);
	return {
		...base,
		request: new Request('http://x', {
			method: 'POST',
			body: fd,
			headers: { 'content-type': 'application/x-www-form-urlencoded' }
		})
	} as never;
}

beforeEach(() => lqFetch.mockReset());

describe('mcp load', () => {
	it('admin: returns parsed servers', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [{ name: 'fs', type: 'mcp', tools: [] }] }));
		const { load } = await import('./+page.server');
		const out = await load(admin as never);
		expect(out.isAdmin).toBe(true);
		expect(out.servers).toHaveLength(1);
		expect(out.mcpError).toBe(false);
	});
	it('admin: degrades to mcpError on non-ok', async () => {
		lqFetch.mockResolvedValue(res(502, 'no'));
		const { load } = await import('./+page.server');
		const out = await load(admin as never);
		expect(out.mcpError).toBe(true);
		expect(out.servers).toEqual([]);
	});
	it('non-admin: no fetch, empty + isAdmin false', async () => {
		const { load } = await import('./+page.server');
		const out = await load(nonAdmin as never);
		expect(out.isAdmin).toBe(false);
		expect(out.servers).toEqual([]);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('actions.toggleTool', () => {
	it('PATCHes the tool enabled state', async () => {
		lqFetch.mockResolvedValue(res(200, { name: 'read_file', enabled: false }));
		const { actions } = await import('./+page.server');
		const out = await actions.toggleTool(
			formEvent(admin, { server: 'fs', tool: 'read_file', enabled: 'false' })
		);
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/mcp/fs/tools/read_file',
			{ method: 'PATCH', body: JSON.stringify({ enabled: false }) }
		);
		expect(out).toMatchObject({ success: true });
	});
	it('fails 403 when the backend rejects', async () => {
		lqFetch.mockResolvedValue(res(403, 'no'));
		const { actions } = await import('./+page.server');
		const out = await actions.toggleTool(
			formEvent(admin, { server: 'fs', tool: 'read_file', enabled: 'true' })
		);
		expect(out.status).toBe(403);
	});
});

describe('actions.refreshServer', () => {
	it('POSTs refresh', async () => {
		lqFetch.mockResolvedValue(res(200, { server: 'fs', tools: [] }));
		const { actions } = await import('./+page.server');
		await actions.refreshServer(formEvent(admin, { server: 'fs' }));
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/admin/mcp/fs/refresh', {
			method: 'POST'
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/routes/(app)/settings/mcp/page.server.test.ts"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `+page.server.ts`**

```ts
// src/routes/(app)/settings/mcp/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseMcpServers, type McpServer } from '$lib/mcp/mcp';

export const load: PageServerLoad = async (event) => {
	const isAdmin = !!event.locals.user?.is_admin;
	if (!isAdmin) return { isAdmin, servers: [] as McpServer[], mcpError: false };
	try {
		const res = await lqFetch(event, '/api/v1/admin/mcp');
		if (!res.ok) return { isAdmin, servers: [] as McpServer[], mcpError: true };
		return { isAdmin, servers: parseMcpServers(await res.json()), mcpError: false };
	} catch {
		return { isAdmin, servers: [] as McpServer[], mcpError: true };
	}
};

const ADMIN_ONLY = 'Managing MCP tools requires an admin account.';

export const actions: Actions = {
	toggleTool: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		const tool = String(data.get('tool') ?? '');
		const enabled = String(data.get('enabled') ?? '') === 'true';
		if (!server || !tool) return fail(400, { message: 'Missing server or tool.' });

		const res = await lqFetch(
			event,
			`/api/v1/admin/mcp/${encodeURIComponent(server)}/tools/${encodeURIComponent(tool)}`,
			{ method: 'PATCH', body: JSON.stringify({ enabled }) }
		);
		if (res.status === 403) return fail(403, { message: ADMIN_ONLY });
		if (!res.ok)
			return fail(res.status === 404 ? 404 : 502, { message: 'Could not update the tool.' });
		return { success: true };
	},

	refreshServer: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		if (!server) return fail(400, { message: 'Missing server.' });

		const res = await lqFetch(event, `/api/v1/admin/mcp/${encodeURIComponent(server)}/refresh`, {
			method: 'POST'
		});
		if (res.status === 403) return fail(403, { message: ADMIN_ONLY });
		if (!res.ok)
			return fail(res.status === 404 ? 404 : 502, {
				server,
				message: 'Could not refresh this server.'
			});
		return { success: true };
	}
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/settings/mcp/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add "src/routes/(app)/settings/mcp/+page.server.ts" "src/routes/(app)/settings/mcp/page.server.test.ts"
git commit -m "feat(mcp): admin-gated /settings/mcp load + toggle/refresh actions"
```

---

### Task 3: Admin-gated settings nav entry

**Files:**

- Create: `src/routes/(app)/settings/+layout.server.ts`
- Modify: `src/routes/(app)/settings/+layout.svelte`
- Modify: `src/lib/settings/SettingsRail.svelte`
- Test: `src/lib/settings/SettingsRail.svelte.test.ts`

> `SettingsRail` is currently a static list. Thread `isAdmin` through a settings `+layout.server.ts` so the **MCP** entry shows only for admins.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/settings/SettingsRail.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SettingsRail from './SettingsRail.svelte';

describe('SettingsRail', () => {
	it('always shows the core sections', () => {
		render(SettingsRail, { isAdmin: false });
		expect(screen.getByRole('link', { name: 'Models' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'MCP' })).toBeNull();
	});
	it('shows MCP only for admins', () => {
		render(SettingsRail, { isAdmin: true });
		expect(screen.getByRole('link', { name: 'MCP' })).toHaveAttribute('href', '/settings/mcp');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: FAIL — `isAdmin` prop not handled / MCP link absent.

- [ ] **Step 3a: `SettingsRail.svelte` — accept `isAdmin`, conditionally add MCP**

Replace the `<script>` of `src/lib/settings/SettingsRail.svelte` with:

```svelte
<script lang="ts">
	import { page } from '$app/state';

	let { isAdmin = false }: { isAdmin?: boolean } = $props();

	const sections = $derived([
		{ href: '/settings/account', label: 'Account' },
		{ href: '/settings/data', label: 'Data & privacy' },
		{ href: '/settings/preferences', label: 'Preferences' },
		{ href: '/settings/trust', label: 'Trust' },
		{ href: '/settings/models', label: 'Models' },
		...(isAdmin ? [{ href: '/settings/mcp', label: 'MCP' }] : [])
	]);
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>
```

(Leave the `<nav>…</nav>` markup unchanged — it iterates `sections`.)

- [ ] **Step 3b: `settings/+layout.server.ts` (new)**

```ts
// src/routes/(app)/settings/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	return { isAdmin: !!event.locals.user?.is_admin };
};
```

- [ ] **Step 3c: `settings/+layout.svelte` — pass `isAdmin` to the rail**

```svelte
<script lang="ts">
	import SettingsRail from '$lib/settings/SettingsRail.svelte';
	import type { LayoutData } from './$types';
	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:flex-row">
	<SettingsRail isAdmin={data.isAdmin} />
	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/lib/settings/SettingsRail.svelte src/lib/settings/SettingsRail.svelte.test.ts "src/routes/(app)/settings/+layout.server.ts" "src/routes/(app)/settings/+layout.svelte"
git commit -m "feat(mcp): admin-only MCP entry in the settings rail"
```

---

### Task 4: The `/settings/mcp` page + server card

**Files:**

- Create: `src/routes/(app)/settings/mcp/+page.svelte`
- Create: `src/lib/mcp/McpServerCard.svelte`
- Test: `src/routes/(app)/settings/mcp/page.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/settings/mcp/page.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const server = {
	name: 'filesystem',
	type: 'mcp',
	tools: [
		{
			name: 'read_file',
			description: 'Reads.',
			read_only: true,
			destructive: false,
			requires_confirmation: false,
			enabled: true
		},
		{
			name: 'write_file',
			description: 'Writes.',
			read_only: false,
			destructive: true,
			requires_confirmation: true,
			enabled: false
		}
	]
};

describe('mcp settings page', () => {
	it('non-admin sees the managed-by-admin note, no servers', () => {
		render(Page, { data: { isAdmin: false, servers: [], mcpError: false } });
		expect(screen.getByText(/managed by your administrator/i)).toBeInTheDocument();
	});
	it('admin sees servers + tools + badges', () => {
		render(Page, { data: { isAdmin: true, servers: [server], mcpError: false } });
		expect(screen.getByText('filesystem')).toBeInTheDocument();
		expect(screen.getByText('read_file')).toBeInTheDocument();
		expect(screen.getByText('write_file')).toBeInTheDocument();
		expect(screen.getByText('destructive')).toBeInTheDocument();
	});
	it('admin with no servers sees the empty state', () => {
		render(Page, { data: { isAdmin: true, servers: [], mcpError: false } });
		expect(screen.getByText(/no mcp servers configured/i)).toBeInTheDocument();
	});
	it('shows the unavailable state on mcpError', () => {
		render(Page, { data: { isAdmin: true, servers: [], mcpError: true } });
		expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/mcp/page.svelte.test.ts"`
Expected: FAIL — module missing.

- [ ] **Step 3a: `McpServerCard.svelte`**

```svelte
<!-- src/lib/mcp/McpServerCard.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { toolBadges, type McpServer } from './mcp';

	let { server }: { server: McpServer } = $props();

	const badgeClass = (kind: string) =>
		kind === 'danger'
			? 'bg-mlq-error/10 text-mlq-error'
			: kind === 'warn'
				? 'bg-mlq-caveats/10 text-mlq-caveats'
				: 'bg-mlq-subtle text-mlq-muted';
</script>

<section class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-center justify-between">
		<div>
			<span class="text-sm font-medium text-mlq-text">{server.name}</span>
			<span class="ml-2 text-xs text-mlq-muted">{server.type}</span>
		</div>
		<form method="POST" action="?/refreshServer" use:enhance>
			<input type="hidden" name="server" value={server.name} />
			<button
				type="submit"
				class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt"
				>Refresh</button
			>
		</form>
	</div>

	<ul class="mt-3 space-y-2">
		{#each server.tools as tool (tool.name)}
			<li
				class="flex items-start justify-between gap-3 rounded-mlq-control border border-mlq-subtle/60 p-3"
			>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm font-medium text-mlq-text">{tool.name}</span>
						{#each toolBadges(tool) as b (b.label)}
							<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {badgeClass(b.kind)}"
								>{b.label}</span
							>
						{/each}
					</div>
					{#if tool.description}<p class="mt-0.5 text-xs text-mlq-muted">{tool.description}</p>{/if}
				</div>
				<form method="POST" action="?/toggleTool" use:enhance>
					<input type="hidden" name="server" value={server.name} />
					<input type="hidden" name="tool" value={tool.name} />
					<input type="hidden" name="enabled" value={(!tool.enabled).toString()} />
					<button
						type="submit"
						aria-pressed={tool.enabled}
						class="rounded-mlq-control border px-2 py-1 text-xs {tool.enabled
							? 'border-mlq-workflow bg-mlq-workflow text-white'
							: 'border-mlq-subtle text-mlq-text hover:bg-mlq-surface-alt'}"
						>{tool.enabled ? 'Enabled' : 'Disabled'}</button
					>
				</form>
			</li>
		{/each}
	</ul>
</section>
```

- [ ] **Step 3b: `+page.svelte`**

```svelte
<!-- src/routes/(app)/settings/mcp/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import McpServerCard from '$lib/mcp/McpServerCard.svelte';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>MCP · Settings · Donna</title></svelte:head>

<div>
	<h1 class="text-lg font-semibold text-mlq-text">MCP tools</h1>
	<p class="mt-1 text-xs text-mlq-muted">
		Model Context Protocol servers your operator has connected. Enable the tools you want available.
	</p>

	{#if !data.isAdmin}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			MCP tools are managed by your administrator.
		</div>
	{:else if data.mcpError}
		<div
			class="mt-4 rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-4 text-xs text-mlq-muted"
		>
			MCP configuration is unavailable right now.
		</div>
	{:else if data.servers.length === 0}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			No MCP servers configured — declare them in <code>mcp.yaml</code>.
		</div>
	{:else}
		<div class="mt-4 space-y-4">
			{#each data.servers as server (server.name)}
				<McpServerCard {server} />
			{/each}
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/mcp/page.svelte.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint` (run `npx prettier --write` on the new files if flagged)

```bash
git add "src/routes/(app)/settings/mcp/+page.svelte" src/lib/mcp/McpServerCard.svelte "src/routes/(app)/settings/mcp/page.svelte.test.ts"
git commit -m "feat(mcp): /settings/mcp page + server card (list, refresh, per-tool toggle)"
```

---

### Task 5: Live e2e (admin-gated; list/toggle gated on a configured server)

**Files:**

- Create: `tests/mcp-admin.spec.ts`

> **Prerequisite for the populated path:** the stack's gateway must have at least one MCP server declared in `mcp.yaml` + `COURTLISTENER`-style env if the server needs it. Without one, `/admin/mcp` returns `{servers:[]}` and the test asserts the empty state + skips the toggle flow. Rebuild `donna-web` before running (it serves built code) and ensure the stack ran migration **0050**.

- [ ] **Step 1: Write the e2e**

```ts
// tests/mcp-admin.spec.ts
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

test('mcp settings: admin sees the page; servers list when configured', async ({ page }) => {
	await login(page); // the e2e fixture admin is an admin account
	await page.goto('/settings/mcp');
	await expect(page.getByRole('heading', { name: /mcp tools/i })).toBeVisible();

	// Either servers are configured (cards with a Refresh button) or the empty state shows.
	const hasServers = await page
		.getByRole('button', { name: 'Refresh' })
		.first()
		.isVisible()
		.catch(() => false);
	if (!hasServers) {
		await expect(page.getByText(/no mcp servers configured/i)).toBeVisible();
		test.skip(true, 'No MCP server in mcp.yaml — empty state asserted, toggle flow skipped');
		return;
	}

	// Toggle the first tool and confirm the control flips; revert it (self-clean).
	const firstToggle = page.locator('button[aria-pressed]').first();
	const before = await firstToggle.getAttribute('aria-pressed');
	await firstToggle.click();
	await expect(page.locator('button[aria-pressed]').first()).not.toHaveAttribute(
		'aria-pressed',
		before ?? ''
	);
	await page.locator('button[aria-pressed]').first().click(); // revert
});
```

- [ ] **Step 2: Bring the stack current + run**

```bash
docker compose up -d --build api arq-worker ingest-worker donna-web   # migration 0050 runs on api boot
npx playwright test tests/mcp-admin.spec.ts
```

Expected: PASS (empty-state path if no server; toggle flow if one is configured).

- [ ] **Step 3: Commit**

```bash
git add tests/mcp-admin.spec.ts
git commit -m "test(mcp): live e2e — admin page renders; list/toggle gated on a configured server"
```

---

## Self-Review

**Spec coverage:** list servers+tools ✅(T1/T2/T4) · refresh discovery ✅(T2 action + T4 card) · per-tool enable/disable ✅(T2 action + T4 toggle) · badges from the 3 flags ✅(T1 `toolBadges` + T4) · admin-gated load + actions ✅(T2) · admin-only nav ✅(T3) · non-admin note / empty / mcpError states ✅(T4) · defensive parser on discovery data ✅(T1) · honest degradation ✅(T2 load + T4 states) · live e2e gated on a configured server ✅(T5).

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `McpServer`/`McpTool`/`ToolBadge`, `parseMcpServers`/`parseMcpTools`/`toolBadges`, the `{ isAdmin, servers, mcpError }` load shape, action names `toggleTool`/`refreshServer`, and the form field names (`server`/`tool`/`enabled`) are consistent across T1–T5.

**One thing the implementer must verify against the live app:**

- The `mlq-*` token classes used in `McpServerCard` (`bg-mlq-error/10`, `bg-mlq-caveats/10`, `bg-mlq-subtle`, `border-mlq-workflow`, etc.) — confirm they exist in the theme (grep an existing component, e.g. `AutomationsGate.svelte` uses `mlq-caveats`; the BYOK card uses status colors). Swap to the nearest existing token if one is missing; lint/`check` won't catch an unknown Tailwind class, so eyeball it against a neighbor.
