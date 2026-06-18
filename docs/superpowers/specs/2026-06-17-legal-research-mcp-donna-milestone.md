# Legal research + MCP in Donna — milestone map

**Date:** 2026-06-17 · **Status:** decomposition approved; Slice A in design.

This is the **Donna-side** scope for the LQ-AI "Legal Research Sources + MCP Client" milestone
(LQ-AI mini-PRD `docs/proposals/legal-research-and-mcp.md` @ `b6c5c87`; ADRs 0014/0015). It frames
_only_ what Donna (the frontend) builds. All legal-AI logic — the gateway egress boundary, the
CourtListener provider, the MCP client, the governed tool-calling loop, citation modeling — lives in
**lq-ai** and is out of scope for Donna per the cardinal rules (§1). Donna's job is the consuming UI,
built one slice at a time as each backend PR merges and we bump the pin + `gen:api` (§8).

## The reframe — not every backend workstream has a Donna surface

The LQ-AI milestone is six PRs across six workstreams. Two of them (WS1 gateway egress boundary,
WS3a the CourtListener provider adapter) are **pure backend** — invisible to Donna. The Donna work is
therefore smaller and more focused than six PRs: roughly **four feature slices + a wrap-up**, each
gated on a specific backend PR.

## Backend state (observed 2026-06-17 against the local lq-ai checkout)

- **PR1 / WS1** — gateway tool-provider egress boundary + ADRs 0014/0015 — **MERGED** (`#158`).
- **PR2 / WS3a** — CourtListener gateway tool-provider — **MERGED** (`#159`).
- **PR3a** — gateway tool-call HTTP transport — **MERGED** (`#160`, `b6c5c87`).
- **PR3b / WS3b** — `/api/v1/research/*` API surface — **in branch `feat/research-api`**; endpoints +
  schemas already exist (`6bc8b8e`). This is Slice A's contract.
- **PR4 / WS2** (MCP client + `/admin/mcp`), **PR5 / WS4** (governed tool-calling loop),
  **PR6 / WS5** (transparency surfaces) — **not started**.

## The slices

| Slice                                 | What Donna builds                                                                                                                                                       | Backend gate                                                                                          | Gate status         | Contract                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| **A — Case-law research workspace**   | Top-level `/research` page: search → read opinions in the doc panel → find-in-case → verify-citations                                                                   | PR3b `/api/v1/research/*`                                                                             | ✅ pinned `e2cc311` | plain synchronous REST                      |
| **A2 — In-app CourtListener key**     | Admin/user UI to add their own CL token (BYOK-style card, hot-applied) — so CL can be enabled without editing `gateway.yaml`. **CL is user-provided, never shipped.**   | **NEW upstream ask** — runtime tool-provider key API (today `/admin/provider-keys` is inference-only) | 🔴 upstream-blocked | mirrors `byok-provider-keys`                |
| **B — MCP admin config**              | Admin surface to list/refresh MCP connectors + tools, per-tool enable/disable, status badges                                                                            | PR4 `/api/v1/admin/mcp`                                                                               | ⚪ not started      | mirrors the provider-keys admin card        |
| **C — Governed tool-calling in chat** | Tool-call rendering in chat, **destructive-tool confirmation gate** (SSE pause→approve→resume), provenance pills, per-turn cap surfacing; SSE research events live here | PR5 (WS4)                                                                                             | ⚪ not started      | chat tool-loop + SSE frames                 |
| **D — Transparency & automations**    | External-source citations through the existing citation UI; the new `retrieve_caselaw` / `call_mcp_tool` ToolIntents surfaced in Automations receipts                   | PR6 (WS5)                                                                                             | ⚪ not started      | citation source-kind + audit/receipt fields |
| **E — Wrap-up**                       | Docs refresh (`/about` + playgrounds, README, PRODUCT.md, CHANGELOG, in-app guide) **and** a new signed/notarized desktop release pointing at the new images            | all of A–D                                                                                            | ⚪ after A–D        | `docs/BUILD-AND-RELEASE.md`                 |

Each of A–D is its own brainstorm → spec → plan → execute cycle (the §6 loop), gated on a pin bump +
`gen:api` after its backend PR lands on lq-ai `main`. **Nothing is buildable until its contract is
pinned.** Slice A is the only one within reach today.

## Sequencing

A → (B ∥ partial of C) → C → D → E. A is first because its backend is nearly done and it has zero
dependencies on the others. B (MCP admin) and C (chat tool-loop) can overlap once their PRs land. D
depends on both research (A's data) and the tool-loop (C). E rides last.

## The two wrap-up items (Slice E), recorded now so they aren't lost

- **Docs refresh.** Everything A–D adds must reach `/about` (the richest, most current explanation
  per CLAUDE.md §11), its interactive playgrounds, README, `docs/PRODUCT.md`, `CHANGELOG.md`, and the
  friendly `docs/GUIDE.md`.
- **A new Mac app for non-technical users.** The desktop launcher _wraps_ `docker-compose.release.yml`
  - the published images — it does not fork `donna-web` or the backend (§1). So "a new Mac app" =
    cut a fresh release (likely `desktop-v0.2.0`) once the new images are published, following
    `docs/BUILD-AND-RELEASE.md`. A release, not a rebuild. **Plus (new):** the first-run wizard offers an
    **optional CourtListener token** field alongside the Anthropic key — skippable, add-later — written
    into the generated chmod-600 `.env` (never bundled). Requires the release-side wiring below.
- **Release-side CL wiring (new, gates the desktop CL option).** `docker-compose.release.yml` must
  pass `COURTLISTENER_API_TOKEN` to the gateway, and the baked `gateway.yaml` (donna-gateway image)
  must carry the `courtlistener` `tool_providers` entry (today it ships **commented out**) gated on
  `api_key_env: COURTLISTENER_API_TOKEN`. **Open question to confirm upstream:** the gateway must
  tolerate an _unset_ `api_key_env` (provider simply absent / `capabilities.enabled=false`) so stacks
  with no CL token still boot — otherwise enabling the entry would break tokenless installs.

## Working agreement with the LQ-AI session

The live lq-ai backend is on this machine (`/Users/kevinkeller/Code/lq-ai`) and in the remote. As we
build each slice, any contract that makes a feature awkward in Donna is filed as an **upstream
request** (§8) and relayed to the LQ-AI session for a backend refinement, _before_ the shape is
locked. The pin is bumped per `docs/decisions/lq-ai-pin.md` when a fix merges.

## Cardinal-rule reminders for every slice

- Never edit `vendor/lq-ai` (§1). Consume the contract via `gen:api`; hand-type loose
  `additionalProperties` fields in a defensive parser (§2, §7).
- BFF only: the browser talks to Donna's server; Donna proxies to lq-ai with the bearer token (§3).
- Honest degradation: each sub-fetch degrades to `null` independently; feature-flag-off states show a
  friendly gate, never a broken page (§7).
- Merge with a merge commit; keep `npm run check` / `lint` / tests green (§2.3, §2.4).
