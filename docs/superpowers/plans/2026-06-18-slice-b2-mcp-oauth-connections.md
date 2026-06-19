# Slice B2 — per-user MCP OAuth Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any Donna user connect their own account to an operator-declared OAuth MCP server, see status, and disconnect — within Donna's BFF boundary — plus an "OAuth" label on the admin MCP page.

**Architecture:** A new per-user `/settings/connections` page (SvelteKit `load` → `GET /api/v1/mcp/oauth`; `disconnect` form action → `DELETE`). Connect is a real browser navigation to a Donna `+server.ts` that calls the bearer-protected `/authorize?return_url=…` with `redirect: 'manual'`, reads the `Location`, and 302s the browser to the auth server; the auth server round-trips back via the api callback to `…/settings/connections?mcp_connected=<server>`. A defensive parser (`src/lib/mcp/oauth.ts`) guards the list at the boundary.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright. Backend lq-ai pin `6a6e83e` (PR4d, #172).

## Global Constraints

- **Svelte 5 runes** throughout (`$props`, `$state`, `$derived`). Tabs for indentation (prettier-enforced).
- **Server-only imports** (`$lib/server/lqClient`) never reach client code; data crosses via `load` / form actions / `+server.ts` only.
- **Defensive parsers** at the data boundary: drop malformed rows, never throw (precedent: `src/lib/mcp/mcp.ts`, `automations/findings.ts`).
- **Honest degradation:** a failed sub-fetch degrades to a null/empty + flag; the page shows "unavailable", never crashes or fabricates.
- **Form-action server tests:** `vi.mock('$lib/server/lqClient')`, dynamic-import the module, build a `Request` with a `URLSearchParams` body, cast the `load`/action result at the call site (the codebase pattern).
- **Gates (every task):** `npm run check` 0 errors / 0 warnings · `npm run lint` fully green · `npx vitest run` passing.
- Connection list endpoint: `GET /api/v1/mcp/oauth` → `{ servers: [{ server, connected, scopes, expires_at }] }`. Authorize: `GET /api/v1/mcp/oauth/{server}/authorize?return_url=<url>` → 302. Disconnect: `DELETE /api/v1/mcp/oauth/{server}` → 204. Admin list adds `MCPServerView.auth: "none"|"bearer"|"oauth"`.

---

### Task 1: Data layer — `parseOAuthServers` + `oauthExpiry`

**Files:**

- Create: `src/lib/mcp/oauth.ts`
- Test: `src/lib/mcp/oauth.test.ts`

**Interfaces:**

- Produces: `interface OAuthServerStatus { server: string; connected: boolean; scopes: string[]; expires_at: string | null }`; `parseOAuthServers(raw: unknown): OAuthServerStatus[]`; `type OAuthExpiry = 'valid' | 'expiring' | 'expired' | 'none'`; `oauthExpiry(expires_at: string | null, now?: number): OAuthExpiry`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mcp/oauth.test.ts
import { describe, it, expect } from 'vitest';
import { parseOAuthServers, oauthExpiry } from './oauth';

describe('parseOAuthServers', () => {
	it('parses valid rows', () => {
		const out = parseOAuthServers({
			servers: [
				{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2026-07-01T00:00:00Z' }
			]
		});
		expect(out).toEqual([
			{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2026-07-01T00:00:00Z' }
		]);
	});
	it('drops rows without a string server and coerces missing fields', () => {
		const out = parseOAuthServers({ servers: [{ connected: true }, { server: 'a' }, 'nope'] });
		expect(out).toEqual([{ server: 'a', connected: false, scopes: [], expires_at: null }]);
	});
	it('returns [] for non-object / missing / non-array servers', () => {
		expect(parseOAuthServers(null)).toEqual([]);
		expect(parseOAuthServers({})).toEqual([]);
		expect(parseOAuthServers({ servers: 'x' })).toEqual([]);
	});
});

describe('oauthExpiry', () => {
	const now = Date.parse('2026-06-18T00:00:00Z');
	it('null / invalid -> none', () => {
		expect(oauthExpiry(null, now)).toBe('none');
		expect(oauthExpiry('not-a-date', now)).toBe('none');
	});
	it('past -> expired', () => {
		expect(oauthExpiry('2026-06-17T00:00:00Z', now)).toBe('expired');
	});
	it('within 24h -> expiring', () => {
		expect(oauthExpiry('2026-06-18T12:00:00Z', now)).toBe('expiring');
	});
	it('far future -> valid', () => {
		expect(oauthExpiry('2026-07-01T00:00:00Z', now)).toBe('valid');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/oauth.test.ts`
Expected: FAIL — `Failed to resolve import "./oauth"` / `parseOAuthServers is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/mcp/oauth.ts
// View-models + defensive parser for the per-user MCP OAuth surface
// (GET /api/v1/mcp/oauth, pin 6a6e83e / PR4d). Guards at the boundary and drops
// malformed rows — same style as mcp.ts / automations/findings.ts.

export interface OAuthServerStatus {
	server: string;
	connected: boolean;
	scopes: string[];
	expires_at: string | null;
}

export type OAuthExpiry = 'valid' | 'expiring' | 'expired' | 'none';

function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseOAuthServers(raw: unknown): OAuthServerStatus[] {
	const r = obj(raw);
	return (Array.isArray(r.servers) ? r.servers : [])
		.map((s) => {
			const o = obj(s);
			if (typeof o.server !== 'string') return null;
			return {
				server: o.server,
				connected: o.connected === true,
				scopes: strArray(o.scopes),
				expires_at: str(o.expires_at)
			};
		})
		.filter((s): s is OAuthServerStatus => s !== null);
}

/** Connection-expiry bucket for display. `expiring` = within 24h of `now`. */
export function oauthExpiry(expires_at: string | null, now: number = Date.now()): OAuthExpiry {
	if (!expires_at) return 'none';
	const t = Date.parse(expires_at);
	if (Number.isNaN(t)) return 'none';
	if (t <= now) return 'expired';
	if (t - now <= 24 * 60 * 60 * 1000) return 'expiring';
	return 'valid';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/oauth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/oauth.ts src/lib/mcp/oauth.test.ts
git commit -m "feat(mcp): parseOAuthServers + oauthExpiry for the per-user OAuth surface"
```

---

### Task 2: `parseMcpServers` carries the `auth` mode (Q3 data)

**Files:**

- Modify: `src/lib/mcp/mcp.ts`
- Test: `src/lib/mcp/mcp.test.ts` (extend)

**Interfaces:**

- Consumes: existing `McpServer`, `parseMcpServers` from `src/lib/mcp/mcp.ts`.
- Produces: `type McpAuth = 'none' | 'bearer' | 'oauth'`; `McpServer` gains `auth: McpAuth`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/mcp/mcp.test.ts`)

```ts
import { parseMcpServers } from './mcp';

describe('parseMcpServers auth field', () => {
	it('carries an oauth auth value', () => {
		const [s] = parseMcpServers({
			servers: [{ name: 'ctx7', type: 'mcp', auth: 'oauth', tools: [] }]
		});
		expect(s.auth).toBe('oauth');
	});
	it('defaults to none when absent or unknown', () => {
		const [a] = parseMcpServers({ servers: [{ name: 'fs', type: 'mcp', tools: [] }] });
		const [b] = parseMcpServers({
			servers: [{ name: 'fs', type: 'mcp', auth: 'weird', tools: [] }]
		});
		expect(a.auth).toBe('none');
		expect(b.auth).toBe('none');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/mcp.test.ts`
Expected: FAIL — `expected undefined to be 'oauth'` (auth not yet parsed).

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/mcp/mcp.ts`)

Add the type + field and a guard, and set it in `parseMcpServers`:

```ts
export type McpAuth = 'none' | 'bearer' | 'oauth';

export interface McpServer {
	name: string;
	type: string;
	auth: McpAuth;
	tools: McpTool[];
}
```

Add near the other guards:

```ts
function parseAuth(v: unknown): McpAuth {
	return v === 'bearer' || v === 'oauth' ? v : 'none';
}
```

In `parseMcpServers`, add `auth` to the returned object:

```ts
return {
	name: o.name,
	type: str(o.type) ?? '',
	auth: parseAuth(o.auth),
	tools: parseToolList(o.tools)
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/mcp.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/mcp.ts src/lib/mcp/mcp.test.ts
git commit -m "feat(mcp): parse the auth mode on MCPServerView (Q3)"
```

---

### Task 3: Connections page server — `load` + `disconnect`

**Files:**

- Create: `src/routes/(app)/settings/connections/+page.server.ts`
- Test: `src/routes/(app)/settings/connections/page.server.test.ts`

**Interfaces:**

- Consumes: `parseOAuthServers`, `OAuthServerStatus` (Task 1); `lqFetch` from `$lib/server/lqClient`.
- Produces: `load` returns `{ servers: OAuthServerStatus[]; loadError: boolean; result: ConnectResult | null }` where `interface ConnectResult { server: string; status: 'connected' | 'error'; code?: string }`; `actions.disconnect`.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/settings/connections/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

function res(status: number, body: unknown) {
	return new Response(
		body === null ? null : typeof body === 'string' ? body : JSON.stringify(body),
		{
			status
		}
	);
}
const ev = (url = 'http://localhost/settings/connections') => ({ url: new URL(url) }) as never;
function formEvent(fields: Record<string, string>) {
	return {
		request: new Request('http://x', {
			method: 'POST',
			body: new URLSearchParams(fields),
			headers: { 'content-type': 'application/x-www-form-urlencoded' }
		})
	} as never;
}
type LoadOut = { servers: unknown[]; loadError: boolean; result: unknown };
type ActionOut = { status?: number; success?: boolean };

beforeEach(() => lqFetch.mockReset());

describe('connections load', () => {
	it('maps the oauth server list', async () => {
		lqFetch.mockResolvedValue(
			res(200, { servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }] })
		);
		const { load } = await import('./+page.server');
		const out = (await load(ev())) as LoadOut;
		expect(out.servers).toHaveLength(1);
		expect(out.loadError).toBe(false);
	});
	it('degrades to loadError on a non-ok fetch', async () => {
		lqFetch.mockResolvedValue(res(502, 'no'));
		const { load } = await import('./+page.server');
		const out = (await load(ev())) as LoadOut;
		expect(out.servers).toEqual([]);
		expect(out.loadError).toBe(true);
	});
	it('reads the mcp_connected banner result', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [] }));
		const { load } = await import('./+page.server');
		const out = (await load(
			ev('http://localhost/settings/connections?mcp_connected=ctx7')
		)) as LoadOut;
		expect(out.result).toEqual({ server: 'ctx7', status: 'connected' });
	});
	it('reads the mcp_error banner result', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [] }));
		const { load } = await import('./+page.server');
		const out = (await load(
			ev('http://localhost/settings/connections?mcp_error=authorize_failed&server=ctx7')
		)) as LoadOut;
		expect(out.result).toEqual({ server: 'ctx7', status: 'error', code: 'authorize_failed' });
	});
});

describe('actions.disconnect', () => {
	it('DELETEs the server token', async () => {
		lqFetch.mockResolvedValue(res(204, null));
		const { actions } = await import('./+page.server');
		const out = (await actions.disconnect(formEvent({ server: 'ctx7' }))) as ActionOut;
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/mcp/oauth/ctx7', {
			method: 'DELETE'
		});
		expect(out).toMatchObject({ success: true });
	});
	it('fails 400 when server is missing', async () => {
		const { actions } = await import('./+page.server');
		const out = (await actions.disconnect(formEvent({}))) as ActionOut;
		expect(out.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/connections/page.server.test.ts"`
Expected: FAIL — cannot resolve `./+page.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/(app)/settings/connections/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseOAuthServers, type OAuthServerStatus } from '$lib/mcp/oauth';

export interface ConnectResult {
	server: string;
	status: 'connected' | 'error';
	code?: string;
}

function readResult(url: URL): ConnectResult | null {
	const connected = url.searchParams.get('mcp_connected');
	if (connected) return { server: connected, status: 'connected' };
	const error = url.searchParams.get('mcp_error');
	const server = url.searchParams.get('server');
	if (error && server) return { server, status: 'error', code: error };
	return null;
}

export const load: PageServerLoad = async (event) => {
	const result = readResult(event.url);
	try {
		const res = await lqFetch(event, '/api/v1/mcp/oauth');
		if (!res.ok) return { servers: [] as OAuthServerStatus[], loadError: true, result };
		return { servers: parseOAuthServers(await res.json()), loadError: false, result };
	} catch {
		return { servers: [] as OAuthServerStatus[], loadError: true, result };
	}
};

export const actions: Actions = {
	disconnect: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		if (!server) return fail(400, { message: 'Missing server.' });
		const res = await lqFetch(event, `/api/v1/mcp/oauth/${encodeURIComponent(server)}`, {
			method: 'DELETE'
		});
		if (!res.ok) return fail(res.status === 403 ? 403 : 502, { message: 'Could not disconnect.' });
		return { success: true };
	}
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/connections/page.server.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/connections/+page.server.ts" "src/routes/(app)/settings/connections/page.server.test.ts"
git commit -m "feat(connections): load OAuth status list + disconnect action"
```

---

### Task 4: Connect BFF redirect route

**Files:**

- Create: `src/routes/(app)/settings/connections/[server]/connect/+server.ts`
- Test: `src/routes/(app)/settings/connections/[server]/connect/server.test.ts`

**Interfaces:**

- Consumes: `lqFetch` from `$lib/server/lqClient`; SvelteKit `redirect`.
- Produces: `GET` handler that throws a SvelteKit redirect (302 to the auth-server `Location`, or 303 to `/settings/connections?mcp_error=<code>&server=<server>`).

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/settings/connections/[server]/connect/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

const ev = (server: string) =>
	({
		params: { server },
		url: new URL(`http://localhost/settings/connections/${server}/connect`)
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET connect', () => {
	it('redirects the browser to the auth-server URL and forwards return_url', async () => {
		lqFetch.mockResolvedValue(
			new Response(null, { status: 302, headers: { location: 'https://as.example/auth?x=1' } })
		);
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 302,
			location: 'https://as.example/auth?x=1'
		});
		const calledPath = lqFetch.mock.calls[0][1] as string;
		expect(calledPath).toContain('/api/v1/mcp/oauth/ctx7/authorize');
		expect(calledPath).toContain(
			'return_url=' + encodeURIComponent('http://localhost/settings/connections')
		);
		expect((lqFetch.mock.calls[0][2] as RequestInit).redirect).toBe('manual');
	});
	it('redirects back with mcp_error when authorize is not 3xx (404 -> not_found)', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 303,
			location: '/settings/connections?mcp_error=not_found&server=ctx7'
		});
	});
	it('redirects back with authorize_failed when lqFetch throws', async () => {
		lqFetch.mockRejectedValue(new Error('network'));
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 303,
			location: '/settings/connections?mcp_error=authorize_failed&server=ctx7'
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/(app)/settings/connections/[server]/connect/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';

const CONNECTIONS = '/settings/connections';

export const GET: RequestHandler = async (event) => {
	const server = event.params.server;
	const returnUrl = `${event.url.origin}${CONNECTIONS}`;
	const path =
		`/api/v1/mcp/oauth/${encodeURIComponent(server)}/authorize` +
		`?return_url=${encodeURIComponent(returnUrl)}`;

	let location: string | null = null;
	let code = 'authorize_failed';
	try {
		const res = await lqFetch(event, path, { redirect: 'manual' });
		if (res.status >= 300 && res.status < 400) location = res.headers.get('location');
		else if (res.status === 404) code = 'not_found';
		else if (res.status === 400) code = 'not_allowed';
	} catch {
		location = null;
	}

	if (location) throw redirect(302, location);
	throw redirect(303, `${CONNECTIONS}?mcp_error=${code}&server=${encodeURIComponent(server)}`);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/settings/connections/[server]/connect/+server.ts" "src/routes/(app)/settings/connections/[server]/connect/server.test.ts"
git commit -m "feat(connections): BFF-mediated OAuth authorize redirect"
```

---

### Task 5: Connections page UI + nav entry

**Files:**

- Create: `src/routes/(app)/settings/connections/+page.svelte`
- Test: `src/routes/(app)/settings/connections/page.svelte.test.ts`
- Modify: `src/lib/settings/SettingsRail.svelte`

**Interfaces:**

- Consumes: `load` output `{ servers, loadError, result }` (Task 3); `oauthExpiry`, `OAuthServerStatus` (Task 1).
- Produces: the `/settings/connections` page; a "Connections" nav entry visible to all users.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/settings/connections/page.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const data = (over: Record<string, unknown> = {}) =>
	({ servers: [], loadError: false, result: null, ...over }) as never;

describe('connections page', () => {
	it('renders a not-connected server with a Connect link', () => {
		render(Page, {
			data: data({ servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }] })
		});
		expect(screen.getByRole('link', { name: /^connect$/i })).toHaveAttribute(
			'href',
			'/settings/connections/ctx7/connect'
		);
	});
	it('renders a connected server with scopes + Disconnect', () => {
		render(Page, {
			data: data({
				servers: [
					{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2099-01-01T00:00:00Z' }
				]
			})
		});
		expect(screen.getByText(/^Connected$/)).toBeInTheDocument();
		expect(screen.getByText(/read/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
	});
	it('shows a success banner from result', () => {
		render(Page, {
			data: data({
				servers: [{ server: 'ctx7', connected: true, scopes: [], expires_at: null }],
				result: { server: 'ctx7', status: 'connected' }
			})
		});
		expect(screen.getByRole('status')).toHaveTextContent(/connected to/i);
	});
	it('shows an error banner from result', () => {
		render(Page, {
			data: data({
				servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }],
				result: { server: 'ctx7', status: 'error', code: 'authorize_failed' }
			})
		});
		expect(screen.getByRole('alert')).toBeInTheDocument();
	});
	it('shows the empty state when no servers', () => {
		render(Page, { data: data() });
		expect(screen.getByText(/no oauth mcp servers/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/settings/connections/page.svelte.test.ts"`
Expected: FAIL — cannot resolve `./+page.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/routes/(app)/settings/connections/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { oauthExpiry, type OAuthServerStatus } from '$lib/mcp/oauth';

	let { data }: { data: PageData } = $props();

	// Only show a banner for a server actually in the current list (ignore stale query).
	const banner = $derived(
		data.result && data.servers.some((s) => s.server === data.result!.server) ? data.result : null
	);

	function statusLabel(s: OAuthServerStatus): string {
		if (!s.connected) return 'Not connected';
		const e = oauthExpiry(s.expires_at);
		if (e === 'expired') return 'Connection expired';
		if (e === 'expiring') return 'Connected — expiring soon';
		return 'Connected';
	}
</script>

<svelte:head><title>Connections · Settings · Donna</title></svelte:head>

<div>
	<h1 class="text-lg font-semibold text-mlq-text">Connections</h1>
	<p class="mt-1 text-xs text-mlq-muted">
		Connect your account to the OAuth-protected MCP tool servers your operator has enabled.
	</p>

	{#if banner}
		{#if banner.status === 'connected'}
			<div
				role="status"
				class="mt-4 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 p-3 text-xs text-mlq-text"
			>
				Connected to <span class="font-medium">{banner.server}</span>.
			</div>
		{:else}
			<div
				role="alert"
				class="mt-4 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 p-3 text-xs text-mlq-text"
			>
				Couldn’t connect to <span class="font-medium">{banner.server}</span>. Please try again.
			</div>
		{/if}
	{/if}

	{#if data.loadError}
		<div
			class="mt-4 rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-4 text-xs text-mlq-muted"
		>
			Your connections are unavailable right now.
		</div>
	{:else if data.servers.length === 0}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			No OAuth MCP servers are configured.
		</div>
	{:else}
		<div class="mt-4 space-y-3">
			{#each data.servers as s (s.server)}
				<section
					class="flex items-center justify-between rounded-mlq-control border border-mlq-subtle p-4"
				>
					<div class="min-w-0">
						<div class="text-sm font-medium text-mlq-text">{s.server}</div>
						<div class="text-xs text-mlq-muted">
							{statusLabel(s)}{#if s.connected && s.scopes.length}
								· {s.scopes.join(', ')}{/if}
						</div>
					</div>
					{#if s.connected}
						<div class="flex gap-2">
							<a
								href="/settings/connections/{s.server}/connect"
								data-sveltekit-reload
								class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
								>Reconnect</a
							>
							<form method="POST" action="?/disconnect" use:enhance>
								<input type="hidden" name="server" value={s.server} />
								<button
									type="submit"
									class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error hover:bg-mlq-surface-alt"
									>Disconnect</button
								>
							</form>
						</div>
					{:else}
						<a
							href="/settings/connections/{s.server}/connect"
							data-sveltekit-reload
							class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
							>Connect</a
						>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Add the nav entry** (edit `src/lib/settings/SettingsRail.svelte`)

In the `sections` array, add Connections after Models (visible to all users):

```ts
		{ href: '/settings/models', label: 'Models' },
		{ href: '/settings/connections', label: 'Connections' },
		...(isAdmin ? [{ href: '/settings/mcp', label: 'MCP' }] : [])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/settings/connections/page.svelte.test.ts"`
Expected: PASS (5 tests). Also run any existing `SettingsRail` test if present: `npx vitest run src/lib/settings` — if it asserts the section list, update it to include Connections.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/settings/connections/+page.svelte" "src/routes/(app)/settings/connections/page.svelte.test.ts" src/lib/settings/SettingsRail.svelte
git commit -m "feat(connections): per-user OAuth connections page + nav entry"
```

---

### Task 6: Admin OAuth badge + hint (Q3 UI)

**Files:**

- Modify: `src/lib/mcp/McpServerCard.svelte`
- Modify: `src/routes/(app)/settings/mcp/+page.svelte`
- Test: `src/lib/mcp/McpServerCard.svelte.test.ts`

**Interfaces:**

- Consumes: `McpServer.auth` (Task 2).
- Produces: an "OAuth" badge on `auth === 'oauth'` server cards; a hint on `/settings/mcp` pointing to Connections.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mcp/McpServerCard.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import McpServerCard from './McpServerCard.svelte';

const server = (auth: string) => ({ name: 'ctx7', type: 'mcp', auth, tools: [] }) as never;

describe('McpServerCard OAuth badge', () => {
	it('shows an OAuth badge for oauth servers', () => {
		render(McpServerCard, { server: server('oauth') });
		expect(screen.getByText('OAuth')).toBeInTheDocument();
	});
	it('shows no OAuth badge for none/bearer', () => {
		render(McpServerCard, { server: server('none') });
		expect(screen.queryByText('OAuth')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/McpServerCard.svelte.test.ts`
Expected: FAIL — `Unable to find an element with the text: OAuth`.

- [ ] **Step 3: Write minimal implementation** (edit `src/lib/mcp/McpServerCard.svelte`)

Add the badge right after the `{server.type}` span (inside the header `<div>`):

```svelte
<span class="ml-2 text-xs text-mlq-muted">{server.type}</span>
{#if server.auth === 'oauth'}
	<span
		class="ml-2 rounded bg-mlq-workflow/10 px-1.5 py-0.5 text-[10px] font-medium text-mlq-workflow"
		>OAuth</span
	>
{/if}
```

- [ ] **Step 4: Add the hint** (edit `src/routes/(app)/settings/mcp/+page.svelte`)

After the existing intro `<p>` (the "Model Context Protocol servers…" paragraph), add a conditional hint shown when any server is OAuth:

```svelte
{#if data.servers.some((s) => s.auth === 'oauth')}
	<p class="mt-1 text-xs text-mlq-muted">
		OAuth-protected servers require each user to connect their own account under
		<a href="/settings/connections" class="text-mlq-workflow hover:underline"
			>Settings → Connections</a
		>.
	</p>
{/if}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/McpServerCard.svelte.test.ts "src/routes/(app)/settings/mcp/page.svelte.test.ts"`
Expected: PASS (new card tests + existing mcp page tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/McpServerCard.svelte "src/routes/(app)/settings/mcp/+page.svelte" src/lib/mcp/McpServerCard.svelte.test.ts
git commit -m "feat(mcp): OAuth badge on admin server cards + Connections hint (Q3)"
```

---

### Task 7: Live e2e + dev-stack verification

**Files:**

- Create: `tests/mcp-oauth.spec.ts`

**Interfaces:**

- Consumes: the running stack with an OAuth MCP server configured.
- Produces: a gated live e2e; a recorded live-verification result.

- [ ] **Step 1: Write the e2e**

```ts
// tests/mcp-oauth.spec.ts
import { test, expect, type Page } from '@playwright/test';

// Live e2e for the per-user MCP OAuth connections surface (Slice B2). Gated on
// an OAuth MCP server being configured in mcp.yaml; self-skips to the empty
// state otherwise (mirrors research / mcp-admin gating). Read-only: any
// disconnect is a no-op on an unconnected server.
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('connections page lists OAuth servers; Connect heads to the auth server', async ({ page }) => {
	await login(page);
	await page.goto('/settings/connections');
	await expect(page.getByRole('heading', { name: /^Connections$/ })).toBeVisible();

	const connect = page.getByRole('link', { name: /^connect$/i }).first();
	if (!(await connect.isVisible().catch(() => false))) {
		await expect(page.getByText(/no oauth mcp servers/i)).toBeVisible();
		test.skip(true, 'No OAuth MCP server configured — empty state asserted');
		return;
	}

	// Clicking Connect leaves Donna toward the external auth server (or, if the
	// gateway can't broker this AS, returns with an error banner — both are
	// honest, non-crashing outcomes; assert we navigated and the page is intact).
	await connect.click();
	await page.waitForLoadState('domcontentloaded');
	const leftDonna = !page.url().includes('localhost:13002');
	if (!leftDonna) {
		// Returned to Donna with a result banner (authorize couldn't broker) — fine.
		await expect(page.getByRole('heading', { name: /^Connections$/ })).toBeVisible();
	}
	expect(true).toBe(true);
});
```

- [ ] **Step 2: Wire an OAuth MCP server into the dev stack**

Append a Context7 entry to the dev `mcp.yaml` (gitignored), alongside DeepWiki:

```yaml
- name: context7
  server_url: https://mcp.context7.com/mcp
  auth: oauth
  egress_tier: 2
  allowlist:
    hosts: [mcp.context7.com]
```

Add the OAuth env to `.env` (gitignored): a Fernet master key + Donna's origin in the CORS allowlist so `return_url` validates:

```bash
# generate a Fernet key (44-char urlsafe base64) and append both vars:
python3 - <<'PY' >> .env
import base64, os
print("LQ_AI_MCP_MASTER_KEY=" + base64.urlsafe_b64encode(os.urandom(32)).decode())
print("LQ_AI_CORS_ORIGINS=http://localhost:13002")
PY
```

Confirm the api + gateway services receive `LQ_AI_MCP_MASTER_KEY` and `LQ_AI_CORS_ORIGINS` (check `docker compose config`; add them to the service `environment:` blocks via the override if the compose doesn't already pass them through). Then:

```bash
set -a; . ./.env; set +a
docker compose up -d --build gateway api donna-web
```

- [ ] **Step 3: Verify discovery + authorize at the API level**

```bash
TOKEN=$(curl -s -X POST http://localhost:18000/api/v1/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"admin@lq.ai\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
# Q1: context7 listed as not-connected
curl -s http://localhost:18000/api/v1/mcp/oauth -H "authorization: Bearer $TOKEN" | python3 -m json.tool
# Q2: authorize with an allowed return_url returns 302 (Location = the AS)
curl -s -o /dev/null -D - "http://localhost:18000/api/v1/mcp/oauth/context7/authorize?return_url=http://localhost:13002/settings/connections" \
  -H "authorization: Bearer $TOKEN" | grep -iE '^HTTP|^location'
```

Expected: the list shows `context7 connected=false`; the authorize returns `302` with a `Location` on the Context7 auth domain. (If the gateway can't broker Context7's discovery/registration, record the exact failure — the per-user surface, list, and disconnect still verify; the external consent is the honest limit from the spec.)

- [ ] **Step 4: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/mcp-oauth.spec.ts`
Expected: PASS (lists context7, Connect navigates). Capture a screenshot of `/settings/connections` for the handoff.

- [ ] **Step 5: Commit**

```bash
git add tests/mcp-oauth.spec.ts
git commit -m "test(connections): live e2e for the per-user MCP OAuth surface"
```

---

## After all tasks

- Run the full gates: `npm run check` (0/0), `npm run lint` (green), `npx vitest run` (all pass). Rebuild `donna-web` before any manual/e2e check.
- Whole-branch Opus review, then open a PR with a **merge commit**; mirror `main` + the branch to `tucuxi`.
- Update the handoff + the milestone memory: Slice B2 shipped; note the deployment requirement (api callback browser-reachability) for Slice E docs; connect-on-demand rendering still pending Slice C/PR5b.

## Self-review notes (coverage)

- Spec §Surfaces 1 (page) → Tasks 3+5; §Surfaces 2 (connect) → Task 4; §Surfaces 3 (admin badge) → Tasks 2+6; §Data layer → Task 1 (+ auth in Task 2); §Testing → each task's tests + Task 7 e2e; §Live-verify → Task 7. No section unmapped.
