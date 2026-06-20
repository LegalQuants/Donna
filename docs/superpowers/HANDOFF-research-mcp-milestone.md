# Handoff — Legal-research + MCP milestone (Donna)

**Date:** 2026-06-17 · **Read this + `docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`
(the milestone map) + the memory `donna-legal-research-mcp-milestone.md` first.** Durable references:
`docs/decisions/lq-ai-pin.md` (pin log), `CLAUDE.md` (engineering guide).

This milestone surfaces LQ-AI's **legal research (CourtListener)** + **MCP** capabilities in Donna,
one slice per backend PR. Donna is the frontend; all backend logic is LQ-AI's (§1).

## Current state (what's done)

- **Pin:** `vendor/lq-ai` @ **`97ccbc0`** (PR5a #181 + PR5b #187, WS4 governed chat tool-loop). Bumped from `6a6e83e` for Slice C.
- **Slice C — governed chat tool-loop (confirm gate + connect-on-demand): ✅ MERGED** (PR #88, merge
  commit `e8a7e00` on `main`; mirrored `tucuxi`; branch deleted). Two terminal SSE frames consumed:
  `tool_confirmation_required` → inline Approve/Deny card → `decide()` POSTs `/chats/{id}/tool-calls/
{pending_call_id}` → resumed turn streams into the same message; `mcp_authorization_required` →
  inline Connect card (reuses Slice B2 connect route, generalized with `?return=/chats/{id}`) + a
  "Connected — Retry" banner on return. New `sse.ts` frames, store `consumeStream` refactor + `decide`,
  BFF resume proxy, `Message.svelte` cards, `ConnectedBanner`. 8-task subagent-driven TDD + whole-branch
  Opus review (ready-to-merge; 2 review-loop security fixes folded: chatId href guard + protocol-relative
  open-redirect guard). Gates check 0/0 · lint 0/0 · **vitest 1429** · **live-verified** (start →
  tool_confirmation_required → DONE; approve → delta → complete; 2nd resume → 409 single-use; UI card
  screenshot). **HONEST LIMIT:** tool rounds are non-streaming/invisible (no inline tool frames);
  connect-on-demand not live-triggerable (Context7 has no discoverable tools w/o a token — B2 limit) so
  unit-covered. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-19-slice-c-chat-tool-loop*`.
  **NEXT after this: the RELEASE DRY-RUN (see Slice E) — user wants a fresh-user README walkthrough
  before cutting images/desktop.**
- **Slice B2 — per-user MCP OAuth Connections: ✅ MERGED** (PR #87, merge commit `123b578` on `main`;
  mirrored to `tucuxi`; branch deleted). New per-user `/settings/connections` page (list OAuth servers
  → Connect via a BFF-mediated `[server]/connect/+server.ts` that proxies `/authorize?return_url=…`
  with `redirect:'manual'` and forwards the 302 → status → Disconnect) + an "OAuth" badge on the admin
  `/settings/mcp`. Consumes PR4d's Q1 `GET /api/v1/mcp/oauth` / Q2 `return_url` / Q3 `MCPServerView.auth`.
  Built via subagent-driven TDD (7 tasks) + whole-branch Opus review (ready-to-merge). Gates: check 0/0
  · lint 0/0 · **vitest 1409** · live-verified (Context7 wired as an oauth server). **Honest limit:**
  full external consent needs a _registered_ `oauth_client_id` (the gateway brokers a pre-registered
  client, NOT dynamic registration) — the dev round-trip stops at the AS; the connect-_success_ UI is
  unit-covered, the connect→error path is verified live. Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-18-slice-b2-mcp-oauth-connections*`. Ask (accepted+shipped):
  `docs/upstream-requests/lq-ai-mcp-oauth-donna-surface.md`. **Deployment (Slice E): the AS redirects
  the browser to the api's callback, so the api callback must be browser-reachable — true on localhost
  (dev + desktop); a hosted Donna must expose it / run same-origin.**
- **Live MCP server tested (DeepWiki no-auth) — ✅ DONE** (see next-steps #1 below). Context7 (oauth) is
  also now wired in the dev `mcp.yaml` (placeholder `oauth_client_id`) for B2 testing.
- **Slice A — case-law research workspace: ✅ MERGED** (PR #84, merge commit on `main`). Live-verified
  with real CourtListener data. The dev stack runs it (CL enabled — see "dev stack" below).
- **Slice A pagination ("Load more"): ✅ MERGED** (PR #86, merge commit `ef92d10` on `main`; +hotfix
  `d783ec2`; mirrored to `tucuxi`; branch deleted). The store sends the prior `next_cursor` back,
  **appends** the next page (dedup by `cluster_id ?? case_name ?? absolute_url`), resets the cursor on
  a fresh search; a "Load more" button shows when `r.nextCursor`. Whole-branch Opus review passed (its
  two follow-ups folded in). Gates: check 0/0 · lint 0/0 · **vitest 1384** · **live e2e verified**
  (`tests/research.spec.ts` 2nd test: broad query → Load more grows the list; direct API confirmed
  page 2 returns distinct clusters, zero overlap). **GOTCHA hit + fixed:** the cursor-accept logic is
  in the **gateway** CL adapter — rebuild `gateway` (not just api/web) before a live pagination check.
- **Slice B — MCP admin (`/settings/mcp`): ✅ MERGED** (PR #85, merge commit `f212590` on `main`;
  mirrored to `tucuxi`; branch deleted). Whole-branch Opus review passed. Gates were check 0/0 ·
  lint 0/0 · **vitest 1375** · e2e verified live (empty-state). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-17-slice-b-mcp-admin*`.

## Immediate next steps (in order)

1. **Test a live MCP server: ✅ DONE (2026-06-18).** Slice B verified end-to-end against a real public
   MCP server — **DeepWiki** (`https://mcp.deepwiki.com/mcp`, no-auth streamable-HTTP; tools
   `read_wiki_structure` / `read_wiki_contents` / `ask_question`, all un-annotated → "needs
   confirmation" badge). **Left wired in the dev stack** (useful for Slice C). The recipe (mirrors the
   CL dev wiring):
   - **`mcp.yaml`** (repo root, gitignored): one `mcp_servers:` entry — `name`, `server_url`,
     `auth: none`, `egress_tier`, `allowlist.hosts: [<host>]`. The host **must** be in `allowlist`
     and resolve to a **public** IP — the gateway egress guard (`gateway/app/providers/tool/egress.py`)
     is HTTPS-only + public-IP-only, so **local/loopback MCP containers are rejected**; you need a
     reachable **public HTTPS streamable-HTTP** server.
   - **`docker-compose.override.yml`**: mount `./mcp.yaml → /config/mcp.yaml:ro` on `gateway` and set
     `MCP_CONFIG_PATH=/config/mcp.yaml` (the gateway resolves `MCP_CONFIG_PATH`, else a sibling
     `mcp.yaml` of the gateway config). `docker compose up -d gateway`.
   - **Discovery is two-step:** `GET /api/v1/admin/mcp` lists the server immediately but with
     **`tools: []`** — tools are a DB cache (migration 0050). `POST /api/v1/admin/mcp/{server}/refresh`
     (the page's **Refresh** button) discovers via the gateway and populates the cache; then GET lists
     the tools and the page renders them. `tests/mcp-admin.spec.ts` toggle flow then passes.
   - **Pre-flight tip:** to confirm a candidate server before wiring, run the real MCP client _inside
     the gateway container_: `docker compose exec -T gateway python -c "...streamablehttp_client(url)...
session.initialize(); session.list_tools()"` — same library + network the gateway uses.
   - **Verified:** api lists `deepwiki`; refresh discovers 3 tools with badges; PATCH enable/disable
     round-trips; Donna `/settings/mcp` renders all 3 with toggles; e2e green. To remove: delete
     `mcp.yaml` (+ the override's MCP lines) and `docker compose up -d gateway`.

## Remaining slices (gated on backend PRs)

- **Slice A2 — in-app CourtListener key (BYOK-style card):** 🔴 upstream-blocked. Needs a runtime
  tool-provider key API. Ask filed: `docs/upstream-requests/lq-ai-runtime-tool-provider-keys.md`
  (Ask 1 runtime key API; Ask 2 gateway tolerates unset key). Build when it lands (mirror
  `byok-provider-keys`).
- **Slice B2 — per-user MCP OAuth Connections:** ✅ **MERGED** (PR #87) — see "Current state".
- **Slice C — governed tool-calling in chat:** gate **PR5 (WS4)**, not started. The big one:
  tool-call rendering in chat, the **destructive-tool confirmation gate** (SSE pause→approve→resume),
  provenance pills, per-turn cap, + the new `retrieve_caselaw`/`call_mcp_tool` ToolIntents. **Reuses
  `toolBadges` from `src/lib/mcp/mcp.ts`** (built in Slice B for exactly this). SSE research events
  also live here. **PR5 is split: PR5a (chat tool-loop) is MERGED on lq-ai `main` as of 2026-06-19;
  PR5b adds the connect-on-demand SSE `mcp_authorization_required {server, authorize_url}` event** (the
  inline-connect prompt that pairs with Slice B2's `return_url`). **DECISION (user, 2026-06-19): do NOT
  start Slice C on PR5a alone — WAIT for PR5b, then build the chat tool-loop + connect-on-demand
  together as one slice** (one pin bump covering PR5a+PR5b). User will notify when PR5b merges. On that
  signal: bump pin → PR5b SHA, `gen:api`, then brainstorm→spec→plan→TDD Slice C.
- **Slice D — transparency & automations:** gate **PR6 (WS5)**. External-source citations through the
  existing citation UI; `retrieve_caselaw`/`call_mcp_tool` surfaced in Automations receipts.
- **Slice E — wrap-up (docs + desktop):** after A–D. Two parts:
  - **Docs refresh:** README, `docs/PRODUCT.md`, `CHANGELOG.md`, `docs/GUIDE.md`, and the in-app
    `/about` (its playgrounds + guide — the richest docs, §11). **Pull in LQ-AI's research+MCP docs**
    (their PRD §3.6 research, §8.5 MCP, ADRs 0014/0015) and reflect the new Donna surfaces.
  - **New macOS desktop release** (likely `desktop-v0.2.0`): a fresh signed/notarized DMG pointing at
    the new images, per `docs/BUILD-AND-RELEASE.md`. **New:** the first-run wizard offers an optional
    **CourtListener token** field (skippable) written to the generated `.env`; plus the **release-side
    CL/MCP wiring** (release compose passes `COURTLISTENER_API_TOKEN` to the gateway; baked
    `gateway.yaml` carries the `courtlistener` tool_provider gated on the env; confirm the gateway
    tolerates an unset key — Ask 2 above). See the milestone map's "Release-side CL wiring" note.

## Dev stack (currently UP)

- 8 containers healthy; **CL enabled** (research works in the browser at http://localhost:13002 →
  Research; login `admin@lq.ai` / `DONNA_E2E_PASSWORD` from `.env`). Migration head **0050**.
- CL enablement is LOCAL/dev-only: `docker-compose.override.yml` (untracked) passes
  `COURTLISTENER_API_TOKEN` to the gateway; a `tool_providers: courtlistener-dev` block was appended
  to the gateway-config volume's `gateway.yaml` (backup `/tmp/gateway.yaml.bak`). Token in `.env`
  (gitignored). To disable CL: delete the override + `docker compose up -d gateway`.
- **MCP also wired (2026-06-18):** the same `docker-compose.override.yml` mounts a gitignored root
  `mcp.yaml` (one `mcp_servers:` entry, **DeepWiki**, public no-auth) into the gateway via
  `MCP_CONFIG_PATH`. `/settings/mcp` shows it with 3 tools (post-Refresh). See next-steps #1 for the
  full recipe / how to remove.
- **Rebuild before any live check** (the container serves built code): `docker compose up -d --build
api arq-worker ingest-worker donna-web` (also runs migrations on api boot). **For an MCP/gateway-config
  change rebuild/restart `gateway` specifically** — the pagination slice proved api/web rebuilds alone
  miss gateway-side behavior.

## Process notes (how this milestone is built)

- **Subagent-driven TDD** per task (fresh implementer + per-task spec+quality review), whole-branch
  review, PR with **merge commit**. Keep `check`/`lint`/vitest green every task.
- **Lint cleanup already done** (commit `c0cdac5`, in `.git-blame-ignore-revs`): the root lint had
  been red since the desktop launcher; don't redo it. Don't weaken `eslint.config.js` to dodge a
  test type error — **cast the `load`/action result** at the call site (the codebase pattern; a Slice
  B task tried `@ts-nocheck` and it was reverted).
- **OpenAPI drift watch:** verify `backend.d.ts` reflects named schemas after each pin bump (research
  #163 drifted once; MCP #166 did not). DE-337 tracks generating the spec from `app.openapi()`.
- Mirror `tucuxi` remote (main + tags + feature branches). `git fetch` before committing to `main`.

## Pointers

- Milestone map: `docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`
- Slice specs/plans: `docs/superpowers/{specs,plans}/2026-06-17-*`
- Upstream asks: `docs/upstream-requests/lq-ai-{research-surface-donna-refinements,runtime-tool-provider-keys,research-search-cursor}.md`
- Pin log: `docs/decisions/lq-ai-pin.md` · Memory: `donna-legal-research-mcp-milestone.md`
