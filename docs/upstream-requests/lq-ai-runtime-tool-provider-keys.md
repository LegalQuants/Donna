# LQ-AI ask — runtime key management for tool providers (CourtListener), + tolerate unset key

**Filed:** 2026-06-17 · **From:** Donna (consumer) · **For:** Donna **Slice A2** (in-app "add your
CourtListener key" UI) and the **desktop first-run wizard** (offer an optional CL token). The LQ-AI
session works in `/Users/kevinkeller/Code/lq-ai` (absolute paths below).

## Product goal

Donna should let a user/admin **bring their own CourtListener key** — in-app and in the desktop
first-run wizard — so case-law research can be turned on without hand-editing `gateway.yaml`. CL is
**user-provided and never shipped** (each operator gets their own token so CourtListener can meter
usage). This mirrors the inference-provider BYOK card Donna already ships (`/settings/models`,
`docs/superpowers/specs/2026-06-06-byok-provider-keys-design.md`, backed by lq-ai #128 /
`/api/v1/admin/provider-keys`).

## The gap (verified against pin `e2cc311`)

The runtime provider-key admin API is **inference-providers only**:

- `/Users/kevinkeller/Code/lq-ai/api/app/api/admin.py` exposes
  `GET|POST|PATCH|DELETE /api/v1/admin/provider-keys` — these proxy the gateway's
  `/admin/v1/provider-keys` surface and operate on **inference** providers (`ProviderAdapter`).
- Tool providers (CourtListener, type `courtlistener`) are configured **only** in `gateway.yaml`
  `tool_providers:` via `api_key_env` / `api_key_encrypted` (operator, config-time). There is **no
  runtime key path** for them — so Donna cannot offer an in-app "add CL key" control today.

## Ask 1 — a runtime key API for tool providers (enables Slice A2)

Extend the runtime key model to cover tool providers, ideally reusing the `provider-keys` shape so
Donna can reuse its BYOK card almost verbatim. Either:

- **(a)** Fold tool providers into the existing surface — e.g.
  `GET /api/v1/admin/provider-keys` returns tool providers too (tagged `kind: "inference" | "tool"`),
  and `POST /{provider}` / `DELETE /{provider}` set/revoke a runtime key for a `courtlistener` tool
  provider, **hot-applied** (no gateway restart), with the same `ProviderKeyStatus`
  (`configured`, `last4`, `source: env|runtime`) and the same error posture (400 no master key, 409
  on env-provided rows). Donna's preference — minimal new UI.
- **(b)** A parallel `GET|POST|DELETE /api/v1/admin/tool-provider-keys` with the same semantics.

When a runtime CL key is set, `GET /api/v1/research/capabilities` should flip to `enabled: true`
without an api/gateway restart (it already reads fresh from the gateway — confirmed in
`api/app/research/service.py::get_capabilities`).

## Ask 2 — the gateway must tolerate a configured tool provider with an _unset_ key (enables shipping the entry on by default)

For the desktop/release path, Donna wants the baked `gateway.yaml` (the `donna-gateway` image) to
**ship the `courtlistener` `tool_providers` entry enabled** (today it's commented out in
`gateway.yaml.example`), gated on `api_key_env: COURTLISTENER_API_TOKEN`, so that a token supplied via
the wizard/`.env` (or via Ask 1 at runtime) **just works** with no config editing.

That only holds if a configured tool provider whose `api_key_env` resolves to **empty** is treated as
**absent / disabled** (`capabilities.enabled=false`, a clean 503 on calls) rather than a **gateway
boot failure**. Please confirm/ensure that behavior (the inference-provider precedent already tolerates
keyless providers — they're simply unroutable). If a configured-but-keyless tool provider currently
raises at startup, that's the one change needed.

## Why both

- Ask 1 makes case-law research **self-service** in Donna (admin adds a key, it lights up) — the
  whole point of a friendly frontend over the operator-config backend.
- Ask 2 lets the **shipped product** (desktop `.dmg` / release compose) default to "CL ready, just add
  your key" instead of "edit a YAML you'll never see." Without it we'd have to keep the entry
  commented and document a manual step — exactly the non-technical-user friction the desktop app exists
  to remove.

## Conventions Donna will follow

- Consume only the published API; `gen:api` after the pin bump; secret write-only / masked
  (`last4`), same as the inference BYOK card.
- Build the A2 card admin-gated, hot-applied, env-row-unrevokable (409) — reusing the BYOK precedent.
