# Slice B2 — per-user MCP OAuth "Connections" (design)

**Date:** 2026-06-18 · **Milestone:** legal-research + MCP (slice B2) · **Backend:** lq-ai pin
`6a6e83e` (PR4d, #172). Read with the milestone map
(`docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`), the upstream ask
(`docs/upstream-requests/lq-ai-mcp-oauth-donna-surface.md`), and the pin log top entry.

## Goal

Let a Donna user **connect their own account** to an operator-declared OAuth MCP server, see their
connection status, and disconnect — entirely within Donna's BFF trust boundary. Slice B (admin) built
the MCP _config_ surface (declare servers, toggle tools); this slice builds the per-user _OAuth_
surface PR4c/PR4d exposed. Inline connect-on-demand from chat is **out of scope** (that's Slice C /
PR5b's `mcp_authorization_required` SSE event).

## Backend contract (pin `6a6e83e`, verified in `backend.d.ts`)

- `GET /api/v1/mcp/oauth` (`ActiveUser`) → `{ servers: [{ server, connected, scopes, expires_at }] }`.
  One entry per configured OAuth-type MCP server with the caller's state. No token bytes.
- `GET /api/v1/mcp/oauth/{server}/authorize?return_url=<url>` (`ActiveUser`) → **302** to the auth
  server. `return_url` is optional and validated against `lq_ai_cors_origins` (`is_allowed_return_url`,
  fail-closed when empty). It is stored on the `mcp_oauth_state` row.
- `GET /api/v1/mcp/oauth/{server}/callback` — **PUBLIC**. After token exchange: if a `return_url` was
  stored → **302** to `{return_url}?mcp_connected={server}` (success) or
  `{return_url}?mcp_error={code}&server={server}` (error), preserving any `#fragment`; if not → 200
  JSON (back-compat). The `redirect_uri` the AS sends the browser to is the **api's own** callback
  (`request.url_for`) — so the api callback must be browser-reachable (true on localhost; a hosted
  deploy must expose it — deployment note, not a blocker).
- `DELETE /api/v1/mcp/oauth/{server}` (`ActiveUser`) → **204**, idempotent.
- `MCPServerView.auth: "none" | "bearer" | "oauth"` now present on `GET /api/v1/admin/mcp` (Q3).

## Surfaces

### 1. `/settings/connections` (new, per-user — all authenticated users)

A new "Connections" entry in the settings layout nav. Distinct from the admin-only `/settings/mcp`.

- **Load** (`+page.server.ts`): `GET /api/v1/mcp/oauth` → `parseOAuthServers`. Honest degradation:
  on a non-ok / thrown fetch return `{ servers: [], loadError: true }`; the page shows an
  "unavailable" note rather than crashing. Reads the `?mcp_connected` / `?mcp_error` + `server`
  query into a typed `result` the page renders as a banner.
- **Render** (`+page.svelte`): one card per server —
  - **Connected** → granted scopes + an expiry line; _Expired_ / _expiring soon_ hint when
    `expires_at` is past / near; a **Disconnect** button and a **Reconnect** link (same as Connect).
  - **Not connected** → a **Connect** button.
  - Top-of-page **banner** from the query result: success (`mcp_connected`) or error (`mcp_error`).
  - **Empty state** when `servers` is `[]` and not `loadError`: "No OAuth MCP servers are configured."
- **Disconnect** (form `action=?/disconnect`, POST `{ server }`): `DELETE
/api/v1/mcp/oauth/{server}`; 204 → `{ success: true }`; non-ok → `fail(...)` with a message. Page
  re-loads status after the action.

### 2. Connect — BFF-mediated redirect: `/settings/connections/[server]/connect/+server.ts`

The Connect/Reconnect control is a plain **navigation** (anchor / button that sets
`window.location`), not a `fetch` — OAuth needs a real browser redirect. The `GET` handler:

1. `return_url = ${event.url.origin}/settings/connections`.
2. `lqFetch(event, '/api/v1/mcp/oauth/' + encodeURIComponent(server) + '/authorize?return_url=' +
encodeURIComponent(return_url), { redirect: 'manual' })` — `redirect: 'manual'` so fetch does
   **not** follow the 302; lqFetch passes `init` straight through and refreshes on 401.
3. On a 3xx with a `Location` header → `redirect(302, location)` (SvelteKit) → browser goes to the AS.
4. Otherwise (non-3xx, missing Location, 400 return_url-not-allowed, 404 not-an-oauth-server) →
   `redirect(303, '/settings/connections?mcp_error=' + code + '&server=' + server)` so the page shows
   the failure through the same banner path. `code` is a small mapped reason
   (`authorize_failed` / `not_allowed` / `not_found`).

Round trip: Connect → Donna handler → AS → api callback → 302 → `…/settings/connections?mcp_connected=<server>`.

### 3. Admin badge (Q3) on `/settings/mcp`

- Extend `parseMcpServers` (in `src/lib/mcp/mcp.ts`) to carry `auth: 'none' | 'bearer' | 'oauth'`
  (default `'none'` when absent / malformed).
- On each server card, show an **"OAuth"** badge when `auth === 'oauth'`, plus a one-line hint:
  "Users connect their own accounts under Settings → Connections."

## Data layer — `src/lib/mcp/oauth.ts`

```ts
export interface OAuthServerStatus {
	server: string;
	connected: boolean;
	scopes: string[];
	expires_at: string | null;
}
export function parseOAuthServers(raw: unknown): OAuthServerStatus[];
```

Defensive parser with local `str`/`bool`/`strArray` guards (the `findings.ts` / `mcp.ts` precedent):
ignores non-object input, drops rows without a string `server`, coerces missing fields to safe
defaults (`connected:false`, `scopes:[]`, `expires_at:null`). Never throws.

A small helper for the expiry display (e.g. `oauthExpiry(expires_at, now)` → `'valid' | 'expiring' |
'expired'`) lives here too so the page stays declarative and the logic is unit-tested.

## Files

```
src/lib/mcp/oauth.ts                                   parseOAuthServers + oauthExpiry (+ tests)
src/lib/mcp/mcp.ts                                     parseMcpServers gains `auth`
src/routes/(app)/settings/connections/+page.server.ts  load + disconnect action
src/routes/(app)/settings/connections/+page.svelte     the per-user UI
src/routes/(app)/settings/connections/[server]/connect/+server.ts   BFF authorize redirect
src/routes/(app)/settings/+layout.svelte               add the "Connections" nav entry
src/routes/(app)/settings/mcp/+page.svelte             OAuth badge + hint (Q3)
tests/mcp-oauth.spec.ts                                live e2e (gated on an OAuth server)
```

## Error handling / degradation

- **Load** GET fails → `{ servers: [], loadError: true }`; page shows an unavailable note.
- **Connect handler** any failure → 303 back to the page with `?mcp_error=<code>&server=<server>`
  (same banner path as a real callback error). Never surfaces a raw error page.
- **Disconnect** non-ok → `fail(status, { message })`; 403 (shouldn't happen for ActiveUser) handled
  with the standard message.
- **Banner** only renders for a known `server` in the current list (ignore stale/unknown query).

## Testing

- **Unit** — `parseOAuthServers` (valid / malformed rows dropped / empty / non-object); `oauthExpiry`
  (valid / expiring / expired / null); `parseMcpServers` carries `auth` and defaults to `'none'`.
- **Component** (`page.svelte.test`) — connected card (scopes + expiry), not-connected card (Connect
  href = `/settings/connections/<server>/connect`), expired hint, disconnect button present, success
  - error banners from `data.result`, empty state.
- **Server** (`page.server.test`) — load maps the list and degrades to `loadError` on failure;
  disconnect action calls `DELETE …/{server}` and returns success / fail.
- **Connect `+server` test** — mocks `lqFetch` returning a 302 + `Location`; asserts the handler
  redirects to that Location and that the outbound authorize URL carries the
  `return_url=${origin}/settings/connections`; non-302 → redirects to `?mcp_error`.
- **Live e2e** (`tests/mcp-oauth.spec.ts`) — gated on an OAuth MCP server being configured (self-skips
  to an asserted empty/admin state otherwise, mirroring `research`/`mcp-admin`). Asserts: the
  Connections page renders; Context7 lists as _Not connected_; clicking **Connect** leaves Donna
  toward Context7's auth domain (assert the post-redirect URL host); **Disconnect** on an unconnected
  server is a clean no-op (204). **Honest limit:** the full external consent at Context7 is interactive
  and not automatable, so the e2e stops at the AS redirect; one full round-trip is driven manually if
  Context7's flow permits, and the result recorded in the handoff.

## Live-verify setup (dev)

Wire Context7 into the dev `mcp.yaml` (`auth: oauth`, host `mcp.context7.com`), set
`LQ_AI_MCP_MASTER_KEY` (Fernet) + `LQ_AI_CORS_ORIGINS=http://localhost:13002` in `.env`, restart
`gateway` + `api`. Confirm `GET /api/v1/mcp/oauth` lists `context7` and the authorize redirect
produces a `context7` AS URL.

## Out of scope (YAGNI)

- Inline connect-on-demand in chat (Slice C / PR5b `mcp_authorization_required`).
- Token refresh UI beyond showing expiry + offering Reconnect (the backend refreshes on use).
- bearer/none server management (those are operator config, not per-user).
- A hosted-deploy reverse-proxy for the api callback (deployment doc, Slice E).
