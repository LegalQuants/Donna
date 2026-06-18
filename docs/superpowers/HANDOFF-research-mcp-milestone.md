# Handoff — Legal-research + MCP milestone (Donna)

**Date:** 2026-06-17 · **Read this + `docs/superpowers/specs/2026-06-17-legal-research-mcp-donna-milestone.md`
(the milestone map) + the memory `donna-legal-research-mcp-milestone.md` first.** Durable references:
`docs/decisions/lq-ai-pin.md` (pin log), `CLAUDE.md` (engineering guide).

This milestone surfaces LQ-AI's **legal research (CourtListener)** + **MCP** capabilities in Donna,
one slice per backend PR. Donna is the frontend; all backend logic is LQ-AI's (§1).

## Current state (what's done)

- **Pin:** `vendor/lq-ai` @ **`8142d58`** (MCP/WS2). lq-ai `main` is ahead at **`786801a`** (the
  pagination `cursor`, #167 — see "pagination" below).
- **Slice A — case-law research workspace: ✅ MERGED** (PR #84, merge commit on `main`). Live-verified
  with real CourtListener data. The dev stack runs it (CL enabled — see "dev stack" below).
- **Slice B — MCP admin (`/settings/mcp`): ✅ BUILT, verified live (empty-state), NOT yet PR'd.**
  Branch **`feat/mcp-admin`** (pushed to origin + tucuxi), 6 task commits, all per-task reviewed.
  Gates: `npm run check` 0/0 · `npm run lint` 0/0 · **vitest 1375**. e2e `tests/mcp-admin.spec.ts`
  passes (skips the toggle flow until an MCP server is configured). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-17-slice-b-mcp-admin*`.

## Immediate next steps (in order)

1. **Finish Slice B → PR.** Run a whole-branch Opus review of `feat/mcp-admin` vs `origin/main`
   (the `requesting-code-review` pattern; per-task reviews already passed), then open a PR with a
   **MERGE COMMIT** (never squash — §2.4). The PR is functional without a live MCP server (the e2e
   gates like research did). Then merge + sync `tucuxi` + delete the branch (see Slice A's close for
   the exact `git` recipe; verify the merge is a 2-parent commit).

2. **Slice A pagination ("Load more") — NOW UNBLOCKED.** #167 (`786801a`) added a `cursor` to
   `SearchRequest`. On a fresh branch off updated `main`: bump pin `8142d58`→`786801a` + `gen:api`,
   then wire it — the store already holds `nextCursor`. Add `cursor` to `createResearch().search`
   (send it; append results instead of replacing) + a "Load more" button in the research page when
   `r.nextCursor`. Small. Ask doc: `docs/upstream-requests/lq-ai-research-search-cursor.md`.

3. **Test a live MCP server (user asked).** Harder than the CL token: MCP servers are declared in a
   separate **`mcp.yaml`** (`mcp_servers:` block — name, server*url, auth none|bearer|oauth), loaded
   by the gateway via an `mcp_path` (see `vendor/lq-ai/gateway/app/config_loader.py::load_config`,
   `mcp.yaml.example` at the lq-ai root; api reads servers from gateway config via
   `list_tool_providers`, discovers tools via the gateway). **GOTCHA:** the gateway's SSRF guard
   blocks private/loopback/HTTP — so a \_local* MCP container is rejected; you need a **reachable
   public HTTPS `streamable_http` MCP server**. To wire (dev): provide an `mcp.yaml` with one
   `mcp_servers:` entry, mount it into the gateway + set its `mcp_path` env (mirror the CL approach:
   a local `docker-compose.override.yml` + a config edit), `docker compose up -d gateway`, then
   `GET /api/v1/admin/mcp` should list it. Then the `tests/mcp-admin.spec.ts` toggle flow runs.

## Remaining slices (gated on backend PRs)

- **Slice A2 — in-app CourtListener key (BYOK-style card):** 🔴 upstream-blocked. Needs a runtime
  tool-provider key API. Ask filed: `docs/upstream-requests/lq-ai-runtime-tool-provider-keys.md`
  (Ask 1 runtime key API; Ask 2 gateway tolerates unset key). Build when it lands (mirror
  `byok-provider-keys`).
- **Slice C — governed tool-calling in chat:** gate **PR5 (WS4)**, not started. The big one:
  tool-call rendering in chat, the **destructive-tool confirmation gate** (SSE pause→approve→resume),
  provenance pills, per-turn cap, + the new `retrieve_caselaw`/`call_mcp_tool` ToolIntents. **Reuses
  `toolBadges` from `src/lib/mcp/mcp.ts`** (built in Slice B for exactly this). SSE research events
  also live here.
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
- **Rebuild before any live check** (the container serves built code): `docker compose up -d --build
api arq-worker ingest-worker donna-web` (also runs migrations on api boot).

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
