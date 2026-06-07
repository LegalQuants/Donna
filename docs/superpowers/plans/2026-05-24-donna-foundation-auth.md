# Donna Foundation + Auth + Landing (P0+P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Donna SvelteKit app with the lq-ai backend bundled (submodule + docker-compose), a MikeOSS-style design substrate and app shell, a BFF auth/session layer over lq-ai's JWT auth, and the assistant landing screen that creates a chat and routes to it.

**Architecture:** A fresh SvelteKit (Svelte 5) app is the only thing that talks to the lq-ai `api` — via a server-side BFF that holds JWT access + refresh tokens in httpOnly cookies, attaches `Authorization: Bearer`, and transparently refreshes on 401. The browser is same-origin to SvelteKit (no CORS, no client-held JWT). lq-ai is vendored as a git submodule and brought up by a Donna `docker-compose.yml` that `include`s lq-ai's compose and replaces its `web` service with Donna's.

**Tech Stack:** SvelteKit + Svelte 5 (runes), TypeScript, Tailwind v4, bits-ui, lucide-svelte, `@sveltejs/adapter-node`, openapi-typescript, Vitest + @testing-library/svelte, Playwright, Docker Compose.

**Reference contracts (verified against lq-ai `docs/api/backend-openapi.yaml`):**

- `POST /api/v1/auth/login` `{email, password}` → `200 LoginResponse {access_token, token_type:"Bearer", expires_in, refresh_token, user}` · `401` invalid · `423 MfaChallenge {mfa_token, methods}`
- `POST /api/v1/auth/mfa/verify` `{mfa_token, code}` → `200 LoginResponse`
- `POST /api/v1/auth/refresh` `{refresh_token}` → `200 TokenResponse {access_token, refresh_token, token_type, expires_in}`
- `POST /api/v1/auth/logout` (Bearer) → `204`
- `POST /api/v1/auth/change-password` (Bearer) `{current_password, new_password}` → `204`; clears `must_change_password`, **revokes all sessions**
- `GET /api/v1/users/me` (Bearer) → `200 User {id, email, display_name?, is_admin, role, mfa_enabled, must_change_password, ...}`; returns `403 password_change_required` on other endpoints while the flag is set
- `POST /api/v1/chats` `{title?, project_id?}` → `201 Chat {id, owner_id, title, ...}`
- **No `/auth/signup`** — account creation is admin-side; first-run is the `must_change_password` forced rotation. P1 has **no public signup page**.

> **Commit convention:** every commit in this plan ends its message with the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Commit messages below omit it for brevity — add it.

---

## File map

```
Donna/
├─ src/
│  ├─ app.css                         # Tailwind v4 import + @theme design tokens + keyframes
│  ├─ app.html · app.d.ts             # locals typing (App.Locals)
│  ├─ hooks.server.ts                 # session hydration + route gates
│  ├─ lib/
│  │  ├─ api/backend.d.ts             # generated (openapi-typescript)
│  │  ├─ api/gateway.d.ts             # generated (openapi-typescript)
│  │  ├─ server/env.ts                # LQ_API base url
│  │  ├─ server/session.ts            # cookie names + set/clear helpers
│  │  ├─ server/lqClient.ts           # authed fetch w/ refresh-on-401 + stream pass-through
│  │  ├─ server/auth.ts               # typed wrappers: login/verifyMfa/changePassword/logout
│  │  ├─ design/primitives.ts         # bits-ui re-exports (single swap point)
│  │  ├─ components/sidebar.ts        # loadSidebar/persistSidebar pure helpers
│  │  ├─ components/Sidebar.svelte
│  │  └─ components/Composer.svelte
│  └─ routes/
│     ├─ (auth)/login/+page.server.ts · +page.svelte
│     ├─ (auth)/change-password/+page.server.ts · +page.svelte
│     ├─ (app)/+layout.server.ts · +layout.svelte
│     ├─ (app)/+page.server.ts · +page.svelte         # assistant landing
│     ├─ (app)/chats/[id]/+page.server.ts · +page.svelte   # placeholder (P2 fills in)
│     ├─ (app)/matters/+page.svelte · workflows/+page.svelte · tabular/+page.svelte  # placeholders
│     └─ (app)/logout/+page.server.ts · +page.svelte
├─ tests/                              # Playwright e2e
├─ vendor/lq-ai/                       # git submodule (pinned SHA)
├─ docker-compose.yml · Dockerfile · .env.example
├─ docs/decisions/lq-ai-pin.md
└─ (config) svelte.config.js · vite.config.ts · tailwind via app.css · playwright.config.ts · vitest in vite.config
```

---

## Task 1: Scaffold SvelteKit app + tooling

**Files:**

- Create: project config (`package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.css`, `eslint`, `prettier`, `playwright.config.ts`)

- [ ] **Step 1: Scaffold into the existing repo**

Run (in `/Users/kevinkeller/Code/Donna`, which already has git + the docs):

```bash
npx sv create . --template minimal --types ts --no-install
npx sv add --no-install tailwindcss eslint prettier vitest playwright
npm install
npm install bits-ui lucide-svelte
npm install -D openapi-typescript @testing-library/svelte @testing-library/user-event jsdom
npm install @sveltejs/adapter-node
```

If `sv create` refuses a non-empty dir, scaffold in a temp dir and copy `src/`, config files, and `package.json` in, preserving the existing `docs/`, `.gitignore`, and `*.md`.

- [ ] **Step 2: Use the Node adapter**

In `svelte.config.js`, replace the auto adapter import with:

```js
import adapter from '@sveltejs/adapter-node';
```

Keep `vitePreprocess()`. Leave the rest as scaffolded.

- [ ] **Step 3: Verify the app builds and dev-serves**

Run:

```bash
npm run check && npm run build
```

Expected: `svelte-check` 0 errors; build completes with the node adapter.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold SvelteKit app with Tailwind, Vitest, Playwright, adapter-node"
```

---

## Task 2: Vendor lq-ai (submodule) + generate API types

**Files:**

- Create: `vendor/lq-ai` (submodule), `docs/decisions/lq-ai-pin.md`, `src/lib/api/backend.d.ts`, `src/lib/api/gateway.d.ts`
- Modify: `package.json` (add `gen:api` script)

- [ ] **Step 1: Add the submodule and capture the pin**

```bash
git submodule add https://github.com/LegalQuants/lq-ai vendor/lq-ai
git -C vendor/lq-ai rev-parse HEAD
```

Record the SHA in `docs/decisions/lq-ai-pin.md`:

```markdown
# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `<SHA from rev-parse>`
- Captured: 2026-05-24
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.
```

- [ ] **Step 2: Add the type-generation script**

In `package.json` `"scripts"`:

```json
"gen:api": "openapi-typescript vendor/lq-ai/docs/api/backend-openapi.yaml -o src/lib/api/backend.d.ts && openapi-typescript vendor/lq-ai/docs/api/gateway-openapi.yaml -o src/lib/api/gateway.d.ts"
```

- [ ] **Step 3: Generate and verify the types compile**

```bash
npm run gen:api
npm run check
```

Expected: `src/lib/api/backend.d.ts` exists and exports `components`/`paths`; `svelte-check` passes. Spot-check that `components['schemas']['User']` and `['LoginResponse']` exist:

```bash
grep -E "LoginResponse:|^    User:|MfaChallenge:|TokenResponse:|ChatCreate:" src/lib/api/backend.d.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: vendor lq-ai submodule (pinned) and generate API types"
```

---

## Task 3: Design tokens (MikeOSS language)

**Files:**

- Modify: `src/app.css`

- [ ] **Step 1: Replace `src/app.css` with the token theme**

```css
@import 'tailwindcss';

@theme {
	/* Typography — serif headings AND body is the signature MikeOSS trait. */
	--font-serif: ui-serif, Georgia, 'Times New Roman', serif;
	--font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

	/* Restrained gray palette */
	--color-mlq-surface: #ffffff;
	--color-mlq-surface-alt: #f7f7f8; /* gray-50/100 */
	--color-mlq-subtle: #e5e7eb; /* border */
	--color-mlq-muted: #9ca3af; /* gray-400, disclaimers/labels */
	--color-mlq-text: #374151; /* gray-700 body */
	--color-mlq-strong: #111827; /* near-black headings */

	/* Semantic accents */
	--color-mlq-workflow: #2563eb; /* blue */
	--color-mlq-error: #dc2626; /* red — PDF/error/alert */
	--color-mlq-success: #16a34a; /* green */
	--color-mlq-doc: #111827; /* black document chips */
	--color-mlq-privileged: #7f1d1d; /* reserved for P4 (high-contrast) */

	/* Radii */
	--radius-mlq-composer: 20px;
	--radius-mlq-control: 0.5rem; /* rounded-lg */
}

@layer base {
	html {
		font-family: var(--font-serif);
		color: var(--color-mlq-text);
		background: var(--color-mlq-surface);
	}
}

/* Motion */
@keyframes shimmer {
	0% {
		background-position: -200% 0;
	}
	100% {
		background-position: 200% 0;
	}
}
@keyframes mlq-rise {
	from {
		opacity: 0;
		transform: translateY(8px);
	}
	to {
		opacity: 1;
		transform: none;
	}
}
.mlq-rise {
	animation: mlq-rise 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.mlq-rise-delay {
	animation: mlq-rise 600ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both;
}
```

- [ ] **Step 2: Verify the dev server renders serif body text**

```bash
npm run dev
```

Open `http://localhost:5173`. Expected: default page text renders in a serif face (token applied). Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/app.css && git commit -m "feat: MikeOSS-style design tokens (serif, gray palette, accents, motion)"
```

---

## Task 4: Primitives re-export (single swap point)

**Files:**

- Create: `src/lib/design/primitives.ts`

- [ ] **Step 1: Re-export the bits-ui primitives we need now/soon**

```ts
// Single import surface for headless primitives. Swap library here only.
export { Dialog, DropdownMenu, Tooltip, Tabs, Switch, Separator } from 'bits-ui';
```

- [ ] **Step 2: Verify it type-checks**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/design/primitives.ts && git commit -m "feat: bits-ui primitives re-export surface"
```

---

## Task 5: Server env + session cookie helpers (TDD)

**Files:**

- Create: `src/lib/server/env.ts`, `src/lib/server/session.ts`
- Test: `src/lib/server/session.test.ts`
- Modify: `vite.config.ts` (vitest jsdom + setup), `.env.example`

- [ ] **Step 1: Configure Vitest**

In `vite.config.ts`, ensure the `test` block:

```ts
test: {
  environment: 'jsdom',
  globals: true,
  include: ['src/**/*.{test,spec}.{js,ts}']
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/server/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setSessionCookies, clearSessionCookies, AT_COOKIE, RT_COOKIE } from './session';

function fakeEvent() {
	const calls: any[] = [];
	return {
		calls,
		cookies: {
			set: (name: string, value: string, opts: any) => calls.push({ op: 'set', name, value, opts }),
			delete: (name: string, opts: any) => calls.push({ op: 'delete', name, opts })
		}
	} as any;
}

describe('session cookies', () => {
	it('sets httpOnly access + refresh cookies with correct lifetimes', () => {
		const e = fakeEvent();
		setSessionCookies(e, 'AT', 'RT', 900);
		const at = e.calls.find((c: any) => c.name === AT_COOKIE);
		const rt = e.calls.find((c: any) => c.name === RT_COOKIE);
		expect(at.value).toBe('AT');
		expect(at.opts.httpOnly).toBe(true);
		expect(at.opts.sameSite).toBe('lax');
		expect(at.opts.path).toBe('/');
		expect(at.opts.maxAge).toBe(900);
		expect(rt.value).toBe('RT');
		expect(rt.opts.maxAge).toBeGreaterThan(900);
	});

	it('omits refresh cookie when no refresh token is given', () => {
		const e = fakeEvent();
		setSessionCookies(e, 'AT', undefined, 900);
		expect(e.calls.some((c: any) => c.name === RT_COOKIE)).toBe(false);
	});

	it('clears both cookies', () => {
		const e = fakeEvent();
		clearSessionCookies(e);
		expect(e.calls.filter((c: any) => c.op === 'delete')).toHaveLength(2);
	});
});
```

- [ ] **Step 3: Run it — expect failure**

```bash
npx vitest run src/lib/server/session.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 4: Implement**

`src/lib/server/env.ts`:

```ts
import { env } from '$env/dynamic/private';
export const LQ_API = (): string => env.LQ_API_INTERNAL_URL ?? 'http://localhost:8000';
```

`src/lib/server/session.ts`:

```ts
import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';

export const AT_COOKIE = 'donna_at';
export const RT_COOKIE = 'donna_rt';
const REFRESH_TTL_SECONDS = 60 * 60 * 8; // mirrors lq-ai jwt_refresh_token_ttl default (8h)

function opts(maxAge: number) {
	return { httpOnly: true, secure: !dev, sameSite: 'lax' as const, path: '/', maxAge };
}

export function setSessionCookies(
	event: RequestEvent,
	accessToken: string,
	refreshToken: string | undefined,
	expiresIn: number
) {
	event.cookies.set(AT_COOKIE, accessToken, opts(expiresIn));
	if (refreshToken) event.cookies.set(RT_COOKIE, refreshToken, opts(REFRESH_TTL_SECONDS));
}

export function clearSessionCookies(event: RequestEvent) {
	event.cookies.delete(AT_COOKIE, { path: '/' });
	event.cookies.delete(RT_COOKIE, { path: '/' });
}
```

Add to `.env.example`:

```
# URL the SvelteKit server uses to reach the lq-ai api (compose service name in Docker).
LQ_API_INTERNAL_URL=http://localhost:8000
```

- [ ] **Step 5: Run it — expect pass**

```bash
npx vitest run src/lib/server/session.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: BFF session cookie helpers + vitest setup"
```

---

## Task 6: Authed server fetch with refresh-on-401

**Files:**

- Create: `src/lib/server/lqClient.ts`
- Test: `src/lib/server/lqClient.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/server/lqClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lqFetch } from './lqClient';
import { AT_COOKIE, RT_COOKIE } from './session';

function eventWith(cookies: Record<string, string>) {
	const store = { ...cookies };
	return {
		store,
		cookies: {
			get: (n: string) => store[n],
			set: (n: string, v: string) => {
				store[n] = v;
			},
			delete: (n: string) => {
				delete store[n];
			}
		}
	} as any;
}

describe('lqFetch', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('attaches Bearer and returns non-401 responses directly', async () => {
		(fetch as any).mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const e = eventWith({ [AT_COOKIE]: 'AT1' });
		const res = await lqFetch(e, '/api/v1/users/me');
		expect(res.status).toBe(200);
		const init = (fetch as any).mock.calls[0][1];
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer AT1');
	});

	it('refreshes once on 401, rotates cookies, retries', async () => {
		(fetch as any)
			.mockResolvedValueOnce(new Response('', { status: 401 })) // original
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 900 }),
					{ status: 200 }
				)
			) // refresh
			.mockResolvedValueOnce(new Response('{}', { status: 200 })); // retry
		const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
		const res = await lqFetch(e, '/api/v1/users/me');
		expect(res.status).toBe(200);
		expect(e.store[AT_COOKIE]).toBe('AT2');
		expect(e.store[RT_COOKIE]).toBe('RT2');
		expect((fetch as any).mock.calls).toHaveLength(3);
	});

	it('clears cookies and returns the 401 when refresh fails', async () => {
		(fetch as any)
			.mockResolvedValueOnce(new Response('', { status: 401 }))
			.mockResolvedValueOnce(new Response('', { status: 401 })); // refresh fails
		const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
		const res = await lqFetch(e, '/api/v1/users/me');
		expect(res.status).toBe(401);
		expect(e.store[AT_COOKIE]).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
npx vitest run src/lib/server/lqClient.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/server/lqClient.ts`:

```ts
import type { RequestEvent } from '@sveltejs/kit';
import { LQ_API } from './env';
import { AT_COOKIE, RT_COOKIE, setSessionCookies, clearSessionCookies } from './session';

async function raw(path: string, init: RequestInit, token?: string): Promise<Response> {
	const headers = new Headers(init.headers);
	if (token) headers.set('authorization', `Bearer ${token}`);
	if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
	return fetch(`${LQ_API()}${path}`, { ...init, headers });
}

/** Authed fetch through the BFF: attaches Bearer, refreshes once on 401, retries. */
export async function lqFetch(
	event: RequestEvent,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	const at = event.cookies.get(AT_COOKIE);
	const res = await raw(path, init, at);
	if (res.status !== 401) return res;

	const rt = event.cookies.get(RT_COOKIE);
	if (!rt) return res;

	const refreshed = await raw('/api/v1/auth/refresh', {
		method: 'POST',
		body: JSON.stringify({ refresh_token: rt })
	});
	if (!refreshed.ok) {
		clearSessionCookies(event);
		return res;
	}
	const tok = (await refreshed.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	setSessionCookies(event, tok.access_token, tok.refresh_token, tok.expires_in);
	return raw(path, init, tok.access_token);
}

/**
 * Streaming pass-through for SSE (consumed in P2). Single attempt with the
 * current access token; refresh is handled by the page `load` that precedes
 * the stream request.
 */
export async function lqStream(
	event: RequestEvent,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	return raw(path, init, event.cookies.get(AT_COOKIE));
}
```

- [ ] **Step 4: Run it — expect pass**

```bash
npx vitest run src/lib/server/lqClient.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: BFF authed fetch with refresh-on-401 + SSE pass-through"
```

---

## Task 7: Auth server module (login/MFA/change-password/logout)

**Files:**

- Create: `src/lib/server/auth.ts`

- [ ] **Step 1: Implement typed wrappers**

`src/lib/server/auth.ts`:

```ts
import { LQ_API } from './env';
import type { components } from '$lib/api/backend';

type LoginResponse = components['schemas']['LoginResponse'];
type MfaChallenge = components['schemas']['MfaChallenge'];

async function post(path: string, body: unknown, token?: string): Promise<Response> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (token) headers.authorization = `Bearer ${token}`;
	return fetch(`${LQ_API()}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export type LoginResult =
	| { kind: 'ok'; data: LoginResponse }
	| { kind: 'mfa'; data: MfaChallenge }
	| { kind: 'invalid' };

export async function login(email: string, password: string): Promise<LoginResult> {
	const res = await post('/api/v1/auth/login', { email, password });
	if (res.status === 200) return { kind: 'ok', data: await res.json() };
	if (res.status === 423) return { kind: 'mfa', data: await res.json() };
	return { kind: 'invalid' };
}

export async function verifyMfa(mfa_token: string, code: string): Promise<LoginResult> {
	const res = await post('/api/v1/auth/mfa/verify', { mfa_token, code });
	if (res.status === 200) return { kind: 'ok', data: await res.json() };
	return { kind: 'invalid' };
}

export async function changePassword(
	token: string,
	current_password: string,
	new_password: string
): Promise<boolean> {
	const res = await post('/api/v1/auth/change-password', { current_password, new_password }, token);
	return res.status === 204;
}

export async function logout(token: string | undefined): Promise<void> {
	if (token) await post('/api/v1/auth/logout', {}, token).catch(() => {});
}
```

- [ ] **Step 2: Verify type-check**

```bash
npm run check
```

Expected: 0 errors (relies on generated `components` from Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/auth.ts && git commit -m "feat: typed auth server wrappers (login, mfa, change-password, logout)"
```

---

## Task 8: Session hydration + route gates (hooks)

**Files:**

- Create: `src/hooks.server.ts`
- Modify: `src/app.d.ts`

- [ ] **Step 1: Type `App.Locals`**

`src/app.d.ts`:

```ts
import type { components } from '$lib/api/backend';

declare global {
	namespace App {
		interface Locals {
			user: components['schemas']['User'] | null;
			mustChangePassword: boolean;
		}
	}
}

export {};
```

- [ ] **Step 2: Implement hooks**

`src/hooks.server.ts`:

```ts
import { redirect, type Handle } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { AT_COOKIE } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.mustChangePassword = false;

	if (event.cookies.get(AT_COOKIE)) {
		const res = await lqFetch(event, '/api/v1/users/me');
		if (res.status === 200) {
			const user = await res.json();
			event.locals.user = user;
			event.locals.mustChangePassword = !!user.must_change_password;
		} else if (res.status === 403) {
			const body = await res.json().catch(() => ({}) as any);
			const code = body?.error?.code ?? body?.detail;
			if (code === 'password_change_required') event.locals.mustChangePassword = true;
		}
	}

	const id = event.route.id ?? '';
	const isApp = id.startsWith('/(app)');
	const isAuth = id.startsWith('/(auth)');
	const path = event.url.pathname;

	// Forced first-run password rotation takes precedence.
	if (event.locals.mustChangePassword && path !== '/change-password') {
		throw redirect(303, '/change-password');
	}
	// Protect app routes.
	if (isApp && !event.locals.user) {
		throw redirect(303, `/login?next=${encodeURIComponent(path)}`);
	}
	// Authed users skip the auth screens.
	if (isAuth && event.locals.user && !event.locals.mustChangePassword) {
		throw redirect(303, '/');
	}

	return resolve(event);
};
```

- [ ] **Step 3: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks.server.ts src/app.d.ts && git commit -m "feat: session hydration + route-group auth gates in hooks"
```

---

## Task 9: Sidebar state helper (TDD) + Sidebar + app layout

**Files:**

- Create: `src/lib/components/sidebar.ts`, `src/lib/components/Sidebar.svelte`, `src/routes/(app)/+layout.server.ts`, `src/routes/(app)/+layout.svelte`
- Test: `src/lib/components/sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/components/sidebar.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSidebar, persistSidebar, SIDEBAR_KEY } from './sidebar';

describe('sidebar persistence', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to open when nothing stored', () => {
		expect(loadSidebar()).toBe(true);
	});

	it('round-trips closed state', () => {
		persistSidebar(false);
		expect(localStorage.getItem(SIDEBAR_KEY)).toBe('closed');
		expect(loadSidebar()).toBe(false);
	});

	it('round-trips open state', () => {
		persistSidebar(true);
		expect(loadSidebar()).toBe(true);
	});
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
npx vitest run src/lib/components/sidebar.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement the helper**

`src/lib/components/sidebar.ts`:

```ts
import { browser } from '$app/environment';

export const SIDEBAR_KEY = 'donna:sidebar-open';

export function loadSidebar(): boolean {
	if (!browser) return true;
	return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
}

export function persistSidebar(open: boolean): void {
	if (browser) localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
}
```

- [ ] **Step 4: Run it — expect pass**

```bash
npx vitest run src/lib/components/sidebar.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Implement Sidebar.svelte**

`src/lib/components/Sidebar.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut } from 'lucide-svelte';
	import { loadSidebar, persistSidebar } from './sidebar';

	let { displayName = 'Account' }: { displayName?: string } = $props();
	let open = $state(loadSidebar());

	const nav = [
		{ href: '/', label: 'Assistant', icon: MessageSquare },
		{ href: '/matters', label: 'Projects', icon: FolderKanban },
		{ href: '/workflows', label: 'Workflows', icon: Workflow },
		{ href: '/tabular', label: 'Tabular', icon: Table }
	];

	function toggle() {
		open = !open;
		persistSidebar(open);
	}
	const isActive = (href: string) =>
		href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
</script>

<aside
	class="flex h-full flex-col border-r border-mlq-subtle bg-mlq-surface-alt transition-all {open
		? 'w-64'
		: 'w-16'}"
>
	<div class="flex items-center justify-between px-3 py-4">
		{#if open}<span class="font-serif text-lg text-mlq-strong">Donna</span>{/if}
		<button
			onclick={toggle}
			aria-label="Toggle sidebar"
			class="rounded-mlq-control p-2 hover:bg-mlq-subtle"
		>
			<PanelLeft size={18} />
		</button>
	</div>

	<nav class="flex-1 space-y-1 px-2">
		{#each nav as item}
			<a
				href={item.href}
				class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
                {isActive(item.href) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}"
			>
				<item.icon size={18} />
				{#if open}<span>{item.label}</span>{/if}
			</a>
		{/each}
	</nav>

	<form method="POST" action="/logout" class="border-t border-mlq-subtle p-2">
		<button
			type="submit"
			class="flex w-full items-center gap-3 rounded-mlq-control px-3 py-2 text-sm text-mlq-text hover:bg-mlq-subtle"
		>
			<LogOut size={18} />
			{#if open}<span>{displayName} · Sign out</span>{/if}
		</button>
	</form>
</aside>
```

- [ ] **Step 6: Implement the app layout (load + shell)**

`src/routes/(app)/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};
```

`src/routes/(app)/+layout.svelte`:

```svelte
<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	let { data, children } = $props();
	const displayName = data.user?.display_name || data.user?.email?.split('@')[0] || 'Account';
</script>

<div class="flex h-screen overflow-hidden">
	<Sidebar {displayName} />
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
```

- [ ] **Step 7: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: collapsible app shell (sidebar + layout) with persisted state"
```

---

## Task 10: Placeholder app routes + logout

**Files:**

- Create: `src/routes/(app)/matters/+page.svelte`, `.../workflows/+page.svelte`, `.../tabular/+page.svelte`, `.../chats/[id]/+page.server.ts`, `.../chats/[id]/+page.svelte`, `.../logout/+page.server.ts`, `.../logout/+page.svelte`

- [ ] **Step 1: Create the three nav placeholders**

Each of `matters`, `workflows`, `tabular` `+page.svelte` (substitute the title):

```svelte
<div class="mx-auto max-w-4xl px-6 py-16">
	<h1 class="font-serif text-2xl text-mlq-strong">Projects</h1>
	<p class="mt-2 text-mlq-muted">Coming in a later phase.</p>
</div>
```

(Use "Projects" / "Workflows" / "Tabular Reviews" as the heading respectively.)

- [ ] **Step 2: Create the chat placeholder that consumes the draft**

`src/routes/(app)/chats/[id]/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const draft = cookies.get('donna_draft') ?? null;
	if (draft) cookies.delete('donna_draft', { path: '/' });
	return { chatId: params.id, draft };
};
```

`src/routes/(app)/chats/[id]/+page.svelte`:

```svelte
<script lang="ts">
	let { data } = $props();
</script>

<div class="mx-auto max-w-4xl px-6 py-16">
	<h1 class="font-serif text-2xl text-mlq-strong">Chat {data.chatId}</h1>
	{#if data.draft}
		<p class="mt-4 rounded-mlq-control bg-mlq-surface-alt p-4 text-mlq-text">{data.draft}</p>
	{/if}
	<p class="mt-2 text-mlq-muted">The conversation surface arrives in P2.</p>
</div>
```

- [ ] **Step 3: Create the logout action**

`src/routes/(app)/logout/+page.server.ts`:

```ts
import { redirect, type Actions } from '@sveltejs/kit';
import { logout } from '$lib/server/auth';
import { AT_COOKIE, clearSessionCookies } from '$lib/server/session';

export const actions: Actions = {
	default: async (event) => {
		await logout(event.cookies.get(AT_COOKIE));
		clearSessionCookies(event);
		throw redirect(303, '/login');
	}
};
```

`src/routes/(app)/logout/+page.svelte`:

```svelte
<p class="p-6 text-mlq-muted">Signing out…</p>
```

- [ ] **Step 4: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: placeholder nav routes, chat-draft handoff, logout action"
```

---

## Task 11: Composer component (TDD)

**Files:**

- Create: `src/lib/components/Composer.svelte`
- Test: `src/lib/components/Composer.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/components/Composer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Composer from './Composer.svelte';

describe('Composer', () => {
	it('disables send when empty and enables when typed', async () => {
		const { getByRole } = render(Composer, { props: {} });
		const send = getByRole('button', { name: /send/i });
		expect(send).toBeDisabled();
		await userEvent.type(getByRole('textbox'), 'hello');
		expect(send).not.toBeDisabled();
	});

	it('submits on Enter, newline on Shift+Enter', async () => {
		const onsubmit = vi.fn();
		const { getByRole } = render(Composer, { props: { onsubmit } });
		const ta = getByRole('textbox');
		await userEvent.type(ta, 'first{Shift>}{Enter}{/Shift}second');
		expect(onsubmit).not.toHaveBeenCalled();
		await userEvent.type(ta, '{Enter}');
		expect(onsubmit).toHaveBeenCalledTimes(1);
	});

	it('does not submit when only whitespace', async () => {
		const onsubmit = vi.fn();
		const { getByRole } = render(Composer, { props: { onsubmit } });
		await userEvent.type(getByRole('textbox'), '   {Enter}');
		expect(onsubmit).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
npx vitest run src/lib/components/Composer.test.ts
```

Expected: FAIL (component missing).

- [ ] **Step 3: Implement Composer.svelte**

```svelte
<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';

	let {
		value = $bindable(''),
		placeholder = 'Ask a question about your documents…',
		onsubmit
	}: { value?: string; placeholder?: string; onsubmit?: (text: string) => void } = $props();

	let textarea = $state<HTMLTextAreaElement>();

	function autogrow() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
	}
	function submit() {
		const text = value.trim();
		if (!text) return;
		onsubmit?.(text);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div
	class="flex items-end gap-2 rounded-t-mlq-composer border border-mlq-subtle bg-mlq-surface p-3 shadow-sm"
>
	<textarea
		bind:this={textarea}
		bind:value
		{placeholder}
		rows="1"
		oninput={autogrow}
		{onkeydown}
		class="max-h-48 flex-1 resize-none bg-transparent font-serif text-mlq-text outline-none placeholder:text-mlq-muted"
	></textarea>
	<button
		type="button"
		onclick={submit}
		disabled={!value.trim()}
		aria-label="Send"
		class="rounded-mlq-control bg-mlq-strong p-2 text-white disabled:opacity-40"
	>
		<ArrowRight size={18} />
	</button>
</div>
```

- [ ] **Step 4: Run it — expect pass**

```bash
npx vitest run src/lib/components/Composer.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: shared Composer (autogrow, Enter-submit, send button)"
```

---

## Task 12: Login route (+ MFA step)

**Files:**

- Create: `src/routes/(auth)/login/+page.server.ts`, `src/routes/(auth)/login/+page.svelte`

- [ ] **Step 1: Implement the actions**

`src/routes/(auth)/login/+page.server.ts`:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { login, verifyMfa } from '$lib/server/auth';
import { setSessionCookies } from '$lib/server/session';

function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
	login: async (event) => {
		const data = await event.request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');
		if (!email || !password) return fail(400, { email, error: 'Email and password are required.' });

		const result = await login(email, password);
		if (result.kind === 'invalid') return fail(401, { email, error: 'Invalid email or password.' });
		if (result.kind === 'mfa') return { mfa: true, mfaToken: result.data.mfa_token, email };

		setSessionCookies(
			event,
			result.data.access_token,
			result.data.refresh_token,
			result.data.expires_in
		);
		throw redirect(303, safeNext(event.url.searchParams.get('next')));
	},

	mfa: async (event) => {
		const data = await event.request.formData();
		const mfaToken = String(data.get('mfaToken') ?? '');
		const code = String(data.get('code') ?? '').trim();
		const result = await verifyMfa(mfaToken, code);
		if (result.kind !== 'ok')
			return fail(401, { mfa: true, mfaToken, error: 'Invalid code. Try again.' });

		setSessionCookies(
			event,
			result.data.access_token,
			result.data.refresh_token,
			result.data.expires_in
		);
		throw redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};
```

- [ ] **Step 2: Implement the page**

`src/routes/(auth)/login/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
	<h1 class="mb-8 text-center font-serif text-3xl text-mlq-strong">Donna</h1>

	{#if form?.mfa}
		<form method="POST" action="?/mfa" use:enhance class="space-y-4">
			<input type="hidden" name="mfaToken" value={form.mfaToken} />
			<p class="text-sm text-mlq-text">Enter the 6-digit code from your authenticator app.</p>
			<input
				name="code"
				inputmode="numeric"
				autocomplete="one-time-code"
				placeholder="123456"
				class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 text-center tracking-widest outline-none"
			/>
			{#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
			<button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Verify</button>
		</form>
	{:else}
		<form method="POST" action="?/login" use:enhance class="space-y-4">
			<input
				name="email"
				type="email"
				autocomplete="username"
				placeholder="you@firm.com"
				value={form?.email ?? ''}
				class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none"
			/>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				placeholder="Password"
				class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none"
			/>
			{#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
			<button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Sign in</button>
		</form>
	{/if}
</div>
```

- [ ] **Step 3: Verify type-check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: login route with MFA challenge step"
```

---

## Task 13: Forced password-change route

**Files:**

- Create: `src/routes/(auth)/change-password/+page.server.ts`, `src/routes/(auth)/change-password/+page.svelte`

- [ ] **Step 1: Implement the action**

`src/routes/(auth)/change-password/+page.server.ts`:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { changePassword } from '$lib/server/auth';
import { AT_COOKIE, clearSessionCookies } from '$lib/server/session';

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const current = String(data.get('current_password') ?? '');
		const next = String(data.get('new_password') ?? '');
		const confirm = String(data.get('confirm_password') ?? '');
		if (!current || !next) return fail(400, { error: 'All fields are required.' });
		if (next !== confirm) return fail(400, { error: 'New passwords do not match.' });

		const token = event.cookies.get(AT_COOKIE);
		if (!token) throw redirect(303, '/login');

		const ok = await changePassword(token, current, next);
		if (!ok)
			return fail(400, {
				error: 'Could not change password. Check your current password and policy.'
			});

		// Backend revokes all sessions on change — force a fresh login.
		clearSessionCookies(event);
		throw redirect(303, '/login?changed=1');
	}
};
```

- [ ] **Step 2: Implement the page**

`src/routes/(auth)/change-password/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
	<h1 class="mb-2 text-center font-serif text-2xl text-mlq-strong">Set a new password</h1>
	<p class="mb-6 text-center text-sm text-mlq-muted">
		Your account requires a password change before continuing.
	</p>
	<form method="POST" use:enhance class="space-y-4">
		<input
			name="current_password"
			type="password"
			autocomplete="current-password"
			placeholder="Current password"
			class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none"
		/>
		<input
			name="new_password"
			type="password"
			autocomplete="new-password"
			placeholder="New password"
			class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none"
		/>
		<input
			name="confirm_password"
			type="password"
			autocomplete="new-password"
			placeholder="Confirm new password"
			class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none"
		/>
		{#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
		<button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Change password</button
		>
	</form>
</div>
```

- [ ] **Step 3: Verify type-check + commit**

```bash
npm run check
git add -A && git commit -m "feat: forced first-run password-change route"
```

---

## Task 14: Assistant landing (create-and-route)

**Files:**

- Create: `src/routes/(app)/+page.server.ts`, `src/routes/(app)/+page.svelte`

- [ ] **Step 1: Implement the start action**

`src/routes/(app)/+page.server.ts`:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

export const actions: Actions = {
	start: async (event) => {
		const data = await event.request.formData();
		const message = String(data.get('message') ?? '').trim();

		const res = await lqFetch(event, '/api/v1/chats', { method: 'POST', body: JSON.stringify({}) });
		if (!res.ok) return fail(502, { error: 'Could not start a chat. Please try again.' });

		const chat = (await res.json()) as { id: string };
		if (message) {
			event.cookies.set('donna_draft', message, {
				path: '/',
				httpOnly: false,
				sameSite: 'lax',
				maxAge: 120
			});
		}
		throw redirect(303, `/chats/${chat.id}`);
	}
};
```

- [ ] **Step 2: Implement the landing page**

`src/routes/(app)/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import Composer from '$lib/components/Composer.svelte';

	let { data, form } = $props();
	let message = $state('');
	let formEl = $state<HTMLFormElement>();

	const name = data.user?.display_name || data.user?.email?.split('@')[0] || 'there';
</script>

<div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6">
	<h1 class="mlq-rise mb-8 text-center font-serif text-4xl font-light text-mlq-strong">
		Hi, {name}
	</h1>

	<form method="POST" action="?/start" bind:this={formEl} use:enhance class="mlq-rise-delay">
		<input type="hidden" name="message" value={message} />
		<Composer bind:value={message} onsubmit={() => formEl?.requestSubmit()} />
	</form>

	{#if form?.error}<p class="mt-3 text-center text-sm text-mlq-error">{form.error}</p>{/if}
	<p class="mt-3 text-center text-xs text-mlq-muted">
		AI can make mistakes. Answers are not legal advice.
	</p>
</div>
```

- [ ] **Step 3: Verify type-check + commit**

```bash
npm run check
git add -A && git commit -m "feat: assistant landing — serif greeting, composer, create-and-route"
```

---

## Task 15: Docker Compose + Dockerfile + env

**Files:**

- Create: `Dockerfile`, `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add the SvelteKit Dockerfile (node adapter)**

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build"]
```

- [ ] **Step 2: Add the Donna compose that includes lq-ai and replaces `web`**

`docker-compose.yml`:

```yaml
# Donna brings up the lq-ai backend via `include`, and REDEFINES the `web`
# service to be Donna's SvelteKit app (this replaces lq-ai's own web service).
include:
  - vendor/lq-ai/docker-compose.yml

services:
  web:
    build: .
    environment:
      LQ_API_INTERNAL_URL: http://api:8000
    ports:
      - '3000:3000'
    depends_on:
      - api
```

> If `include` cannot override the `web` service key on this Compose version, fall back to:
> `docker compose -f vendor/lq-ai/docker-compose.yml -f docker-compose.web.yml up` where
> `docker-compose.web.yml` sets lq-ai `web` to `profiles: ["disabled"]` and adds Donna `web`.
> Record whichever mechanism works in `docs/decisions/lq-ai-pin.md`.

- [ ] **Step 3: Document compose env in `.env.example`**

Append:

```
# In Docker Compose the SvelteKit server reaches the api by service name:
#   LQ_API_INTERNAL_URL=http://api:8000
# Optional heavy services live behind profiles: ollama, paddleocr, bridges.
```

- [ ] **Step 4: Verify the stack starts**

```bash
docker compose config >/dev/null   # validates merged compose, incl. the include
docker compose up -d postgres redis minio gateway api
docker compose up -d --build web
curl -fsS http://localhost:3000/login >/dev/null && echo "web up"
docker compose down
```

Expected: `docker compose config` succeeds; `/login` returns HTML (200). If the api needs DB migration/bootstrap, follow `vendor/lq-ai/README.md` to bootstrap the first-run admin, and record the steps in `docs/decisions/lq-ai-pin.md`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example && git commit -m "feat: docker-compose bundling lq-ai backend + Donna web service"
```

---

## Task 16: Playwright e2e for the slice

**Files:**

- Create: `playwright.config.ts` (adjust if scaffolded), `tests/auth-and-landing.spec.ts`, `tests/global-setup.ts`
- Modify: `.env.example` (e2e credentials)

> **Prerequisite (documented, not a placeholder):** the e2e runs against a live stack. Provide a working account via env — `DONNA_E2E_EMAIL` / `DONNA_E2E_PASSWORD` (the bootstrapped first-run admin, password already rotated past `must_change_password`). `global-setup` asserts the stack is reachable and fails fast with guidance otherwise.

- [ ] **Step 1: Configure Playwright against the running web service**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests',
	globalSetup: './tests/global-setup.ts',
	use: { baseURL: process.env.DONNA_BASE_URL ?? 'http://localhost:3000' },
	reporter: 'list'
});
```

- [ ] **Step 2: Global setup — fail fast if the stack/credentials are missing**

`tests/global-setup.ts`:

```ts
export default async function globalSetup() {
	const base = process.env.DONNA_BASE_URL ?? 'http://localhost:3000';
	if (!process.env.DONNA_E2E_EMAIL || !process.env.DONNA_E2E_PASSWORD) {
		throw new Error(
			'Set DONNA_E2E_EMAIL and DONNA_E2E_PASSWORD (a bootstrapped lq-ai account) to run e2e.'
		);
	}
	const res = await fetch(`${base}/login`).catch(() => null);
	if (!res || !res.ok) {
		throw new Error(`Donna web not reachable at ${base}. Run: docker compose up -d --build`);
	}
}
```

- [ ] **Step 3: Write the e2e spec**

`tests/auth-and-landing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
}

test('rejects invalid credentials with an inline error', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', 'definitely-wrong');
	await page.click('button:has-text("Sign in")');
	await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test('logs in and lands on the assistant greeting', async ({ page }) => {
	await login(page);
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: /^Hi, / })).toBeVisible();
	await expect(page.getByText(/answers are not legal advice/i)).toBeVisible();
});

test('access token cookie is httpOnly and not readable from JS', async ({ page, context }) => {
	await login(page);
	const cookies = await context.cookies();
	const at = cookies.find((c) => c.name === 'donna_at');
	expect(at?.httpOnly).toBe(true);
	const visible = await page.evaluate(() => document.cookie);
	expect(visible).not.toContain('donna_at');
});

test('submitting a first message creates a chat and routes to it', async ({ page }) => {
	await login(page);
	await page.fill('textarea', 'Review this NDA for unusual terms.');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(page.getByText('Review this NDA for unusual terms.')).toBeVisible();
});

test('sidebar collapse persists across reload', async ({ page }) => {
	await login(page);
	await page.click('button[aria-label="Toggle sidebar"]');
	await page.reload();
	await expect(page.locator('aside')).toHaveClass(/w-16/);
});
```

- [ ] **Step 4: Run the e2e against the live stack**

```bash
docker compose up -d --build
DONNA_E2E_EMAIL=... DONNA_E2E_PASSWORD=... npx playwright test
docker compose down
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: e2e for login, MFA-less happy path, landing, chat create, cookie safety"
```

---

## Task 17: README, decisions, final verification

**Files:**

- Create: `README.md`
- Modify: `docs/decisions/lq-ai-pin.md` (record working bootstrap + compose mechanism)

- [ ] **Step 1: Write a runnable README**

`README.md` covering: what Donna is (one paragraph), prerequisites (Docker, Node 22), `git clone --recurse-submodules`, `npm install`, `npm run gen:api`, `cp .env.example .env`, `docker compose up -d --build`, where to log in, how to run `npm run check`, `npx vitest run`, `npx playwright test`, and a pointer to `docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md`.

- [ ] **Step 2: Full local verification gate**

```bash
npm run check          # 0 errors
npx vitest run         # all unit/component tests pass
docker compose up -d --build
DONNA_E2E_EMAIL=... DONNA_E2E_PASSWORD=... npx playwright test   # all e2e pass
docker compose down
```

Expected: every command green. This is the §7 "slice is done" contract from the spec.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README + runnable verification; record bootstrap + compose mechanism"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** repo structure (T1–T2,T15), backend wiring/submodule/compose (T2,T15), design tokens (T3), primitives (T4), typed API client (T2,T6,T7), BFF auth + refresh + cookies (T5,T6,T7,T8), app shell (T9,T10), login+MFA (T12), bootstrap/forced change-password (T13), assistant landing + create-and-route (T14), verification (T16,T17). Spec §10 open Q#1 (signup) is **resolved**: no public signup — first-run is `must_change_password` (T13).
- **Type consistency:** cookie names `donna_at`/`donna_rt` (T5) used by `lqClient` (T6), `hooks` (T8), routes (T12–T14). `lqFetch(event, path, init)` signature consistent everywhere. `LoginResult` union (T7) consumed identically in T12. `donna_draft` cookie written in T14, read+cleared in T10.
- **No placeholders:** every code step ships complete code; the only externalized item is the e2e account, handled as a documented env prerequisite with a fail-fast check (T16), not a TODO.
