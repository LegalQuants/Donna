# Slice F — Zero-config research wiring ("bring a token, it just works") — Design Spec

> **Milestone:** Legal research + MCP — release-readiness. **Date:** 2026-06-21.
> **Branch:** `feat/slice-f-zero-config-research` off `main` (pin `658fdbc`).

## Problem

The legal-research + MCP milestone (Slices A–E) is merged, but a **fresh user can't reach
CourtListener research in any shipped path**. Verified across all three install paths:

| Path                                          | CourtListener today                             | Why                                                                                                |
| --------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dev source build                              | off (manual `gateway.yaml` edit + token)        | seeded `gateway.yaml.example` has `tool_providers` commented out                                   |
| Release images (`docker-compose.release.yml`) | **impossible without editing the baked config** | wrapper bakes the vendored (commented-out) example; compose never passes `COURTLISTENER_API_TOKEN` |
| Desktop `.dmg`                                | **impossible**                                  | inherits the release images; wizard collects no CL token                                           |

The dev wiring we used to test the milestone (appending a `tool_providers` block to the gateway-config
volume + an untracked `docker-compose.override.yml`) was a **hand-applied dev hack**, never shipped.

## Goal

Make CourtListener research **turnkey** on the user-facing paths: a user provides only a
**CourtListener API token** (bring-your-own key) and research works — **no `gateway.yaml` editing,
no manual steps**. No token → research is simply off (never an error). MCP stays an **advanced opt-in**
(plumbing ready, documented, no default servers). Bar: dead simple, especially the `.dmg`
(download → install → run; have Docker + Ollama; paste keys if you want; nothing else).

## Verified foundation

- The gateway **skips a tool-provider whose `api_key_env` is unset, with a warning, and still starts**
  (`vendor/lq-ai/gateway/app/main.py:15` + the lifespan build-adapter loop, lines ~240–259; and the
  `tool_providers` loop ~314–328). So **declaring `courtlistener` gated on `COURTLISTENER_API_TOKEN`
  is safe**: no token ⇒ provider skipped ⇒ research off; token set ⇒ provider built ⇒ research works.
- The release `donna-gateway` wrapper (`docker/gateway.Dockerfile`, BuildKit `# syntax=...:1`) builds
  `FROM ${BASE}` and `COPY`s `gateway.yaml.example` into `/usr/share/lq-ai/gateway.yaml.example`; the
  gateway entrypoint seeds that into the `gateway-config` volume on first boot (only-if-absent).
- The vendored example's `courtlistener` block is **commented out** (`vendor/lq-ai/gateway.yaml.example`
  ~lines 200–218), and `tool_providers:` is otherwise absent — so an appended active `tool_providers:`
  is valid YAML (the commented block is inert).

## Decisions locked in brainstorming (2026-06-21)

1. **CourtListener = token-triggered on all user-facing paths** (release + desktop), plus token
   passthrough in dev.
2. **MCP = plumb the env vars (`MCP_CONFIG_PATH`, `LQ_AI_MCP_MASTER_KEY`, `LQ_AI_CORS_ORIGINS`) +
   document; no default servers.**
3. **Desktop: an optional CourtListener-token field in the first-run wizard.**
4. **`anonymize_outbound: false`** for the shipped CourtListener provider (public case-law lookups;
   anonymizing would mangle case names / legal queries and wreck results — matches dev).
5. **Don't edit `vendor/lq-ai`.** Donna owns a ~12-line CourtListener snippet baked into Donna's own
   wrapper image — legitimate packaging, like `donna-api` baking the skills corpus.

## Non-goals

- No default MCP servers; MCP remains operator opt-in (env plumbing + docs only).
- No re-architecture of dev gateway seeding (dev builds lq-ai's own gateway image, not our wrapper —
  it can't bake the snippet; a committed full `gateway.yaml` fork would drift). Dev gets the token
  passthrough + the existing documented one-time append recipe.
- No change to `vendor/lq-ai`, the citation engine, or any backend behavior.
- Not cutting the release here — this is the wiring that makes the release deliver research.

## Components

### 1. CourtListener baked into the release wrapper — `docker/gateway.Dockerfile`

Append a Donna-owned `tool_providers` snippet onto the baked example via a BuildKit heredoc `RUN`
(keeps the existing build context = `vendor/lq-ai`; no `.github/workflows/release.yml` change; Donna
owns only the ~12 lines, upstream owns the rest of the file — minimal drift):

```dockerfile
# syntax=docker/dockerfile:1
ARG BASE
FROM ${BASE}
COPY gateway.yaml.example /usr/share/lq-ai/gateway.yaml.example
# Donna packaging: enable the CourtListener case-law tool-provider. Gated on
# COURTLISTENER_API_TOKEN — the gateway skips it (with a warning) when the token is
# unset, so research is simply OFF until a user provides a key. (We never edit the
# vendored submodule; we bake our own ~12-line block into our own wrapper image.)
RUN cat >> /usr/share/lq-ai/gateway.yaml.example <<'YAML'

# --- Donna: CourtListener case-law research (active when COURTLISTENER_API_TOKEN is set) ---
tool_providers:
  - name: courtlistener
    type: courtlistener
    base_url: https://www.courtlistener.com/api/rest/v4
    api_key_env: COURTLISTENER_API_TOKEN
    egress_tier: 4
    allowlist:
      hosts: [www.courtlistener.com]
    rate_limit:
      requests_per_minute: 60
    anonymize_outbound: false
YAML
```

(Provider `name: courtlistener` — the api's research `capabilities` resolves the first courtlistener
provider; the dev block used `courtlistener-dev`, the shipped one is `courtlistener`.)

### 2. Token + MCP plumbing — both compose files (+ the desktop copy)

In the `gateway` service `environment:` of **`docker-compose.release.yml`**,
**`desktop/resources/docker-compose.release.yml`** (identical mirror), and **`docker-compose.yml`**
(dev), add:

```yaml
COURTLISTENER_API_TOKEN: ${COURTLISTENER_API_TOKEN:-}
MCP_CONFIG_PATH: ${MCP_CONFIG_PATH:-}
LQ_AI_MCP_MASTER_KEY: ${LQ_AI_MCP_MASTER_KEY:-}
LQ_AI_CORS_ORIGINS: ${LQ_AI_CORS_ORIGINS:-}
```

(Empty defaults — absent vars are inert: the gateway skips the CL provider, and with no
`MCP_CONFIG_PATH` it discovers no MCP servers.) For the **api** service, add `LQ_AI_MCP_MASTER_KEY`
and `LQ_AI_CORS_ORIGINS` if the api needs them for the OAuth/connections surface (per the Slice B2 pin
notes the api uses `LQ_AI_MCP_MASTER_KEY` (Fernet) + `LQ_AI_CORS_ORIGINS` for `return_url`); confirm
in `vendor/lq-ai` during planning and add only where consumed.

### 3. `.env.example`

- **Uncomment + document `COURTLISTENER_API_TOKEN`** with the now-true statement: _setting this
  enables case-law research — no gateway edit needed_ (drop the old "AND enable the gateway block"
  caveat).
- Add a documented (commented) **MCP** block: `MCP_CONFIG_PATH`, `LQ_AI_MCP_MASTER_KEY`,
  `LQ_AI_CORS_ORIGINS`, with a one-line note that MCP is advanced/optional and needs an `mcp.yaml`
  mounted into the gateway (point to a short doc / the existing recipe).

### 4. Desktop wizard — `desktop/`

Thread an optional CourtListener token from the first-run wizard into the generated `.env`:

- **`desktop/src/core/config.ts`** — add `courtlistenerToken?: string` to `LauncherConfig`.
- **`desktop/src/core/env.ts`** — `renderEnv` emits `COURTLISTENER_API_TOKEN=${cfg.courtlistenerToken
?? ''}` (same injection-safe KEY=VALUE rule as the rest; unit-tested).
- **`desktop/src/renderer/wizard.ts`** — an optional password-type field "CourtListener token —
  enables case-law research (optional)"; collected into `WizardInput.courtlistenerToken`.
- **`desktop/src/main/index.ts`** — `wizard:complete` threads `courtlistenerToken` into the
  `LauncherConfig`; **bump `imageTag` from `'v0.1.0'` → `'v0.2.0'`** (currently hardcoded). (If a
  config version constant lives elsewhere, bump there.)
- **`desktop/src/main/store.ts`** — unchanged (writes `renderEnv(cfg)` at 0600).

The desktop already invokes `docker-compose.release.yml`; once that file passes
`COURTLISTENER_API_TOKEN` (component 2) and the wrapper bakes the provider (component 1), the token
in the generated `.env` reaches the gateway with no other change.

### 5. Dev path (token passthrough + documented recipe — not turnkey)

Dev's `docker-compose.yml` gateway now passes `COURTLISTENER_API_TOKEN`. Dev still seeds the gateway
config from the vendored (commented-out) example, so a developer enabling research locally appends the
CL block once (the existing handoff recipe) — documented in `README`/CLAUDE notes. Turnkey behavior is
verified on the **release-image** dry-run, not dev.

### 6. Docs

- `docs/decisions/` — a short note recording the release-side CL wiring (what the wrapper bakes, why
  `anonymize_outbound: false`, the drift caveat that the snippet must stay valid against upstream's
  `gateway.yaml.example`).
- README "Quick install" — note that adding `COURTLISTENER_API_TOKEN` to `.env` enables case-law
  research (release path), and the desktop wizard's optional token field.

## Testing

- **Desktop unit (vitest):** extend `desktop/src/core/env.test.ts` — `renderEnv` emits
  `COURTLISTENER_API_TOKEN=` (empty when absent; the value when present; injection-safe). Any
  `config`/wizard-input mapping helper gets a focused test.
- **Build sanity:** `docker build` the `donna-gateway` wrapper locally and assert the baked
  `/usr/share/lq-ai/gateway.yaml.example` ends with an **active** `tool_providers: courtlistener`
  block (grep inside the image). Confirms the heredoc append worked.
- **Live turnkey verification (the real test, during the release-image dry-run):** with a token-only
  `.env`, a fresh `docker-compose.release.yml` stack (built from the new wrapper) → `/research` is
  enabled and a case-law search returns results, **with zero config editing**; and with **no** token,
  the gateway starts clean and `/research` shows "not enabled" (no crash, logs the skip warning).
- Gates: `npm run check` 0/0, `npm run lint` clean, `npx vitest run` green (incl. the desktop core
  tests under their own config), `desktop` build/typecheck clean.

## Build shape

Subagent-driven where there's logic (desktop env/wizard threading), inline for the Dockerfile/compose/
docs edits, per-task review, whole-branch review, PR with a **merge commit**, mirror `tucuxi`.
Suggested task order:

1. `docker/gateway.Dockerfile` CL snippet append + a build-time grep test.
2. Compose env passthrough (release + desktop copy + dev) for `COURTLISTENER_API_TOKEN` + MCP vars.
3. `.env.example` CL (uncomment) + MCP (documented) blocks.
4. Desktop: `LauncherConfig.courtlistenerToken` → `renderEnv` (+ env.test) → wizard field → main
   threading → `imageTag` v0.2.0.
5. Docs (decision note + README).
6. Live turnkey verification (folded into the release-image dry-run).

## Acceptance criteria

1. A release-image (and desktop) user who sets only `COURTLISTENER_API_TOKEN` gets working case-law
   research — Research workspace enabled, chat case-law tool-loop works — with no `gateway.yaml` edit.
2. With no token, every path's gateway starts cleanly and research shows "not enabled" (no crash).
3. The desktop first-run wizard offers an optional CourtListener token field that lands in the
   generated `.env`; `imageTag` is `v0.2.0`.
4. MCP env vars are plumbed through the compose files and documented; no default servers ship.
5. `.env.example` documents `COURTLISTENER_API_TOKEN` (enables research directly) + the MCP block.
6. Gates green; the live turnkey + no-token cases verified on the release-image dry-run.
