# LQ-AI ask — make per-user MCP OAuth consumable from Donna's BFF

**Filed:** 2026-06-18 · **From:** Donna (consumer) · **For:** surfacing per-user MCP OAuth
(authorize/connect/status/disconnect) in Donna. Verified against lq-ai `main` @ `d4a026e` (#170,
PR4c/WS2 — MCP OAuth complete). The LQ-AI session works in `/Users/kevinkeller/Code/lq-ai`.

> **STATUS — ✅ ACCEPTED as PR4d (2026-06-18).** LQ-AI CC confirmed all three asks, none are in PR4c
> or PR5 (PR4c built the mechanics and parked the per-user UX for the transparency phase; PR5 is the
> chat tool-loop). They'll ship Q1+Q2+Q3 as a small, security-gated **PR4d** ("per-user OAuth UX
> surface"), ~a day. The grounding notes below reflect the **agreed** contract — Donna aligns to this
> shape and builds on the PR4d pin bump. **Donna is waiting on PR4d.**

## Context

PR4c shipped the per-user OAuth surface at `/api/v1/mcp/oauth/{server}/{authorize,callback,status}` +
`DELETE /api/v1/mcp/oauth/{server}`. The auth posture is LOCKED and we are **not** asking to change it
(authorize/status/disconnect = `ActiveUser`; callback = public, bound by the single-use `state` row).

Donna is a **backend-for-frontend**: the browser talks **only** to Donna's SvelteKit server, which
holds the lq-ai JWT in httpOnly cookies and attaches the bearer when proxying. The lq-ai `api` is
**not exposed to the browser** in a Donna deployment. Three gaps make the OAuth flow hard to surface
cleanly in that model. Asks are ordered by how blocking they are.

## Ask 1 (blocking) — a per-user "list my connectable OAuth servers + status" endpoint

Today a user can only call `/status` for a **server they already name**. The only way to enumerate MCP
servers is `GET /api/v1/admin/mcp` — **AdminUser-gated** — so a non-admin user has no way to discover
which OAuth servers exist to connect to, or review what they're already connected to.

**Proposed:** `GET /api/v1/mcp/oauth` (`ActiveUser`) → the OAuth-type MCP servers from gateway config,
each with the caller's connection state:

```json
{
	"servers": [
		{
			"server": "context7",
			"connected": true,
			"scopes": ["read"],
			"expires_at": "2026-07-01T00:00:00Z"
		},
		{ "server": "acme-mcp", "connected": false, "scopes": [], "expires_at": null }
	]
}
```

This lets Donna render a per-user "Connections" view (connect / re-auth before expiry / disconnect)
without admin access. It's the per-user, list-shaped sibling of the existing single-server `/status`.

**Agreed (PR4d):** cross-reference `list_mcp_oauth_config()` (the gateway's oauth-type servers, already
present from PR4c) with the user's `mcp_oauth_tokens` rows → `[{server, connected, scopes, expires_at}]`.
`ActiveUser`, returns no token material. With connect-on-demand (PR5b, below) this becomes the
"manage my connections" view — useful, **lower urgency than Q2**.

## Ask 2 (blocking) — an allowlisted `return_url` on `/authorize` so the callback returns to the frontend

`/authorize` computes `redirect_uri = request.url_for("mcp_oauth_callback")` (the **api's** callback)
and the **callback returns 200 JSON**. In Donna's BFF model the AS would redirect the browser to an
api URL the browser can't reach in production, and even in dev the user lands on a raw-JSON page —
there's no way to return them to a Donna page with a success/error result.

**Proposed:** `/authorize` accepts an optional `return_url` query param (`ActiveUser`), **validated
against an operator-configured frontend-origin allowlist** (reject anything else → no open-redirect).
Persist it on the `mcp_oauth_state` row; after `exchange_code` succeeds (or fails), the **callback
302-redirects the browser to `return_url`** with a result query, e.g.
`…/settings/connections?mcp_connected=context7` or `…?mcp_error=exchange_failed&server=context7`.
When `return_url` is absent, keep today's JSON response (back-compat).

This is the one change that makes the flow fit a BFF: Donna sends `return_url` of its own page, the
browser round-trips AS → api callback → back to Donna, and Donna renders the outcome. (The bearer /
state posture is unchanged; this only adds where the browser lands after the public callback.)

**Agreed (PR4d):** validate the `return_url` **origin against the existing `lq_ai_cors_origins`**
(scheme+host+port match — reject anything else; no second allowlist to maintain unless a distinct
`lq_ai_oauth_return_url_origins` is ever wanted). Adds a one-column `return_url` on `mcp_oauth_state`
(small migration); the callback branches: state has `return_url` → 302 with `?mcp_connected=<server>` /
`?mcp_error=…`; absent → today's 200 JSON (back-compat). **This is the load-bearing ask** — needed for
both the standalone Connections view AND connect-on-demand (below).

## Ask 3 (minor) — expose the `auth` mode on `MCPServerView`

`MCPServerView` is `{ name, type, tools }` and `type` is always `"mcp"`, so the **admin** `/settings/mcp`
page can't tell which servers are `oauth` vs `none`/`bearer` — it can't label "this server needs a
per-user connection" or link to the connect flow. The gateway already knows `auth` per server
(`MCPServerConfig.auth`); surfacing it as `MCPServerView.auth: "none" | "bearer" | "oauth"` lets the
admin page and any "connect" entry point be precise. Cheap, and improves the admin surface too.

**Agreed (PR4d):** read `auth` from `get_admin_config` (which carries `MCPServerConfig.auth`) rather
than the stripped `list_tool_providers`, surfacing `MCPServerView.auth: "none" | "bearer" | "oauth"`.

## Connect-on-demand (PR5b — confirmed direction)

LQ-AI CC confirmed PR5 heads toward inline connect: when a chat tool-call hits an `auth: oauth` server
with no valid token, `get_valid_token` returns `None` → `MCPAuthorizationRequired` (the 409 contract),
and **PR5b will surface that as an SSE `mcp_authorization_required { server, authorize_url }` event** —
a sibling of the `tool_confirmation_required` gate — so the chat UI can prompt an inline connect. Donna
(Slice C) renders that prompt; the connect still uses Q2's `return_url` to land the browser back in chat.

## Donna side (ready to wire on these)

With Ask 1 + Ask 2, Donna builds a per-user MCP "Connections" surface (list → Connect → browser
round-trips → returns to a Donna page → status reflects connected/expiry → Disconnect). Q2's
`return_url` also powers the PR5b connect-on-demand prompt in chat. Ask 3 lets the admin page label
OAuth servers. **Donna waits on PR4d** (Q1/Q2/Q3) before building the per-user surface; connect-on-demand
rendering lands with Slice C (PR5).
