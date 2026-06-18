# Slice B — MCP admin config (`/settings/mcp`) — design

**Date:** 2026-06-17 · **Milestone:** legal research + MCP in Donna
(`2026-06-17-legal-research-mcp-donna-milestone.md`) · **Branch:** `feat/mcp-admin` (off `main`).
**Backend gate:** LQ-AI **PR4b** (the `/api/v1/admin/mcp` registry, branch `feat/mcp-api-registry`;
PR4a gateway MCP adapter already merged as #165) — must merge to lq-ai `main`, then Donna bumps the
pin + runs `gen:api` **before implementation starts**.

## Problem

An operator who has wired MCP servers into LQ-AI (via the operator-controlled `mcp.yaml`) needs a
way, inside Donna, to **see which servers/tools are available, re-discover a server's tools, and
enable/disable individual tools** — without editing YAML or reading logs. This is the *configuration*
surface; actually letting the chat model call an enabled MCP tool (with the destructive-confirmation
gate) is **Slice C**, not here.

## Upstream contract (verified against `feat/mcp-api-registry`; re-verify via `gen:api` after the pin bump — merged shape wins)

`/api/v1/admin/mcp` — **AdminUser-gated** (non-admin → 403). The api never speaks MCP directly; it
proxies the gateway MCP adapter (ADR 0014). Cleanly typed (named Pydantic schemas — not inline, so
unlike research it should land in `backend.d.ts` directly; still verify the OpenAPI yaml on the bump).

- **`GET /admin/mcp`** → `MCPServersResponse = { servers: MCPServerView[] }`.
- **`POST /admin/mcp/{server}/refresh`** → re-discover the server's tools →
  `MCPRefreshResponse = { server, tools: MCPToolView[] }`.
- **`PATCH /admin/mcp/{server}/tools/{tool}`** body `{ enabled: bool }` (`extra="forbid"`) →
  `MCPToolView`.

Shapes:
- `MCPServerView = { name, type, tools: MCPToolView[] }`
- `MCPToolView = { name, description: str|null, parameters: dict (JSON-Schema),
  read_only: bool, destructive: bool, requires_confirmation: bool, enabled: bool }`

No connector-creation, no auth/OAuth fields in the admin views (operator-allowlisted in `mcp.yaml`;
per-user OAuth is a later concern). So Donna's surface is **list + refresh + per-tool toggle** only.

## Decisions (user-confirmed during brainstorming)

- **Dedicated `/settings/mcp` page**, admin-gated; the settings sub-nav entry is shown only to admins.
- **Tool detail = name + description + flags + toggle.** The JSON-Schema `parameters` are available
  via `gen:api` but **not rendered** in v1 (kept scannable; an expandable schema view is a possible
  fast-follow).
- **Form-action architecture** (mirror BYOK), not the research slice's client-proxy/controller style.

## Architecture (BFF, §3; admin-gated; mirrors `byok-provider-keys`)

- **`src/routes/(app)/settings/mcp/+page.server.ts`**
  - `load`: `const isAdmin = !!event.locals.user?.is_admin`. If admin, `GET /api/v1/admin/mcp` and
    parse; degrade each sub-fetch independently → `{ isAdmin, servers, mcpError }`. Non-admin returns
    `{ isAdmin: false, servers: [], mcpError: false }` (the API would 403 anyway).
  - **Actions** (both `fail(403)` when not admin, mirroring `settings/models`):
    - `toggleTool` — form fields `server`, `tool`, `enabled` →
      `PATCH /api/v1/admin/mcp/{server}/tools/{tool}` `{ enabled }`. On non-ok → `fail` with a message.
    - `refreshServer` — form field `server` → `POST /api/v1/admin/mcp/{server}/refresh`. On non-ok →
      `fail` with a per-server message.
  - Default `invalidateAll` after each action refreshes the list (a refresh may change the tool set;
    a toggle flips one tool's `enabled`).
- **`src/routes/(app)/settings/mcp/+page.svelte`**
  - Non-admin → a slim section: "MCP tools are managed by your administrator." (no data).
  - Admin → server cards: each shows `name` + `type`, a **Refresh** button (`use:enhance` form posting
    `refreshServer`), and the tool rows. Each tool row: name · `description` · badges
    (`read-only` / `⚠ destructive` / `needs confirmation`, rendered from the three booleans) · an
    **enable toggle** (a `use:enhance` form posting `toggleTool`, submit-on-change).
  - Empty state when `servers` is empty: "No MCP servers configured — declare them in `mcp.yaml`."
  - `mcpError` → "MCP configuration is unavailable right now." (settings otherwise intact.)
- **`src/routes/(app)/settings/+layout.svelte`** — add an **MCP** sub-nav entry, shown only when the
  layout knows the user is admin. (If the settings layout lacks `is_admin`, thread it via the
  settings `load`/a `+layout.server.ts`, or show the link and let the page gate — resolve in the
  plan; prefer admin-only visibility.)

## Data layer — `src/lib/mcp/mcp.ts` (pure, defensive)

- Types derived from generated `backend.d.ts` (`MCPServerView`, `MCPToolView`, `MCPServersResponse`,
  `MCPRefreshResponse`) where strict.
- `parseMcpServers(raw): McpServer[]` and `parseMcpTools(raw): McpTool[]` — defensive guards at the
  boundary (tool `name`/`description`/`parameters` are **MCP-discovery-sourced**, i.e. third-party
  strings, so drop malformed rows rather than trust them; the `findings.ts` template). Booleans
  default to safe values (`enabled:false`, `destructive:false`, etc.) when absent.
- A small `toolBadges(tool): {label, kind}[]` helper deriving the badge set from the three flags
  (single source of truth for the row + reused by Slice C later).

## Error handling (honest degradation, §7)

- Non-admin → the managed-by-admin note; never a broken page or a 403 crash.
- `/admin/mcp` load failure → `mcpError` block; the rest of settings renders.
- Per-server **refresh** failure (the MCP server may be unreachable) → an inline error on that server
  card only; other servers and their current tool state are preserved (last-known-good).
- **toggle** failure → `fail` + message; the toggle reflects server truth after `invalidateAll`
  (no optimistic lie).
- Defensive parsers drop malformed discovery rows; never fabricate a tool.

## Testing

- **Unit:** `parseMcpServers`/`parseMcpTools` (malformed-row drop, empty, boolean defaults);
  `toolBadges` (each flag → badge; combinations).
- **Component:** the page states — admin list (servers + tool rows + badges), non-admin note, empty,
  `mcpError`, a per-server refresh-error.
- **Form-action server tests:** mock `lqFetch`; assert `toggleTool` PATCHes the right path/body,
  `refreshServer` POSTs, and both `fail(403)` for a non-admin (the `settings/models` test is the
  template).
- **Live e2e (Playwright):** admin login → `/settings/mcp`. The **empty / not-configured** state runs
  unconditionally; the **list + toggle + refresh** flow is **gated on an MCP server being declared in
  the stack's `mcp.yaml`** (mirrors research's `COURTLISTENER_API_TOKEN` gating). Self-cleaning; a
  toggle is reverted in teardown.

## Out of scope for Slice B (later)

In-chat MCP tool-calling + the destructive-confirmation gate (Slice C); per-user OAuth connector
flows; adding/removing servers from the UI (operator `mcp.yaml` only, by decision); rendering each
tool's JSON-Schema parameters (possible fast-follow).

## Open items to watch (relay to LQ-AI if they bite — §8)

- **OpenAPI drift:** verify on the pin bump that `backend-openapi.yaml` carries the named
  `MCPServerView`/`MCPToolView` schemas (the #163/#164 research drift recurred once already; DE-337
  tracks generating the spec from `app.openapi()`).
- **Empty-vs-unconfigured signal:** `GET /admin/mcp` returns `{servers:[]}` both when MCP is
  unconfigured and when configured-but-empty. If the distinction ever matters for copy, ask for a
  capability flag (cf. research `/capabilities`). For v1 the empty state copy covers both honestly.
- **Refresh error shape:** confirm what a refresh returns when the MCP server is unreachable (typed
  error vs 5xx) so the per-server inline error maps cleanly.
