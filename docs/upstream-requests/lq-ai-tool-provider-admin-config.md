# Upstream request: a runtime admin API for tool / authority providers (enable + key)

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-03 · **Status:** DELIVERED (LQ.AI PR #273, squash `44a1de54`; see reply at bottom)
> **Pin at filing:** `e40b98c` · **Segment:** in-app configuration of legal-research / authority sources.

## TL;DR (the ask)

Please add an **admin API to configure `tool_providers` at runtime** — the authority/research sources
(CourtListener, GovInfo, EDGAR, EUR-Lex) — mirroring the existing inference **provider-keys** admin
path. Specifically: **enable/disable** a registered source, and **set/rotate/clear its key**
(encrypted-at-rest, hot-applied, no restart), and — unlike the inference path — allow **adding** a
tool-provider entry for a registered type that isn't yet present. Then reply with the **contract**
(endpoints, request/response shapes, status codes, hot-apply semantics) and the **commit SHA** so Donna
can bump its pin and build an in-app "Research sources" admin card.

## Why this matters to Donna

Donna's users are **in-house legal teams and non-technical practitioners**. Turning on case-law research
(CourtListener) — or any authority source that needs a key (GovInfo) — currently requires **editing
`gateway.yaml` or a `.env` file and restarting the gateway**. That is not something we can ask a lawyer
to do. The product needs an **in-app** way for an admin to paste a CourtListener token and enable a
source, exactly like the inference **BYOK provider-keys** card already does for Anthropic/OpenAI.

The desktop launcher can (and does) accept a CourtListener token **once** at first-run. But if the user
skips it, there is today **no way back** short of editing files. That's the gap this ask closes.

## The gap (verified against source at pin `e40b98c`)

A source is reported `enabled` **iff** the gateway has a matching entry in its `tool_providers:` block:

- `api/app/research/registry.py:131` `resolve_available_sources()` joins `SOURCE_REGISTRY` against
  `gateway.list_tool_providers()`; a registry type with no configured provider → `enabled=False`.
- `api/app/api/research.py:116` `GET /research/sources` surfaces that (read-only; no secrets).

There is **no runtime write path for tool providers**:

- The inference admin path `POST/PATCH/DELETE /api/v1/admin/provider-keys`
  (`api/app/api/admin.py:597–660`) → gateway `upsert_provider_key`
  (`gateway/app/config_writer.py:450`) operates **only on the inference `providers:` list**
  (`_find_provider_entry` at `:418` reads `raw.get("providers")`), and its own docstring says: _"Adding
  a brand-new provider … is out of scope for this API — those land through the operator's edit of
  `gateway.yaml` directly."_ It never touches `tool_providers`.
- There is **no** admin endpoint for tool/authority providers anywhere in `api/app/api/admin.py`
  (the routes are: config, aliases, tier-policy, usage, provider-keys [inference], users/role,
  ingest-health).
- `gateway.yaml.example` ships the **entire `tool_providers:` block commented out**, so a default
  install reports **all four** sources `enabled=false` — including the keyless EDGAR / EUR-Lex.

Net: enabling a source or setting its key today = hand-edit `gateway.yaml` + restart. No API, so Donna
cannot build the UI.

## What Donna will do on its own (no ask needed) — for context

For the **keyless** sources (EDGAR, EUR-Lex — "needs only a User-Agent"), Donna will enable them **by
default** in its own gateway wrapper (`docker/gateway.Dockerfile` already appends a `tool_providers:`
block for CourtListener; we'll add the keyless entries there). That handles "why aren't the free
sources on." **This ask is about the runtime, in-app, key-bearing path**, which Donna cannot do from
the BFF.

## Proposed contract (a starting point — your design wins)

Mirror the inference provider-keys ergonomics, scoped to `tool_providers`. A shape that would unblock us:

- `GET /api/v1/admin/tool-providers` → for each **registry** type (`SOURCE_REGISTRY`): `{ type,
  enabled, name?, has_key, key_required, egress_tier? }` — status only, **never** the secret (same P3 /
  ADR 0016 posture as `/research/sources` and `/admin/provider-keys`).
- `POST /api/v1/admin/tool-providers` (or `PUT /…/{type}`) → **enable** a registered type: create/enable
  the `tool_providers` entry (with the registry's `base_url`/allowlist defaults) and, if a key is
  supplied, store it as `api_key_encrypted` (ADR 0011), hot-applied. For a keyless type, enable with no
  key.
- `PATCH /api/v1/admin/tool-providers/{type}` → set/rotate the key; toggle enabled.
- `DELETE /api/v1/admin/tool-providers/{type}` → disable / remove the entry.
- Semantics to document: **hot-apply** (no gateway restart, like provider-keys), status codes
  (400 no gateway master key, 404 unknown/unregistered type, 409 env-provided key not runtime-revocable
  — matching the inference path's conventions), and whether enabling a type not in `SOURCE_REGISTRY` is
  rejected (it should be — the loop only calls sources it has an adapter for).

Admin-gated (`AdminUser`), secrets write-only, never returned. If you'd rather **generalize the existing
`/admin/provider-keys`** to accept a `kind: inference | tool` discriminator instead of a new route, that
works for us too — your call.

## What Donna does on delivery

Bump `vendor/lq-ai` to the new SHA → `npm run gen:api` → build an admin **"Research sources"** card
(Settings, mirroring `ProviderKeysCard` + the Connections pattern): list each authority source with an
Available/Unavailable badge, a masked write-only key input for the key-bearing ones (CourtListener,
GovInfo), and an enable/disable toggle — hot-applied, no restart, no file editing. This closes the
"skipped the token at first-run" case the desktop launcher can't otherwise recover from.
---

## ✅ DELIVERED — LQ.AI reply (2026-07-03)

**Status → DELIVERED.** Shipped in **PR LegalQuants/lq-ai#273** (`feat/tool-provider-admin-api`). Squash SHA on merge: `44a1de54` (security-gated — merges after `@legalquants/security` review). Bump your pin to that SHA.

### API contract

All `AdminUser`-gated (bearer token of an admin user); secrets are **write-only, never returned**; every write records an `audit_log` row.

| Verb | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/v1/admin/tool-providers` | — | `200 {tool_providers: [{type, enabled, name, has_key, key_required, egress_tier}]}` — one row per registered type | `403` non-admin |
| POST | `/api/v1/admin/tool-providers` | `{type, api_key?}` | `200` single status row | `400` no master key (only when a key is supplied), `404` unknown type, `403` |
| PATCH | `/api/v1/admin/tool-providers/{type}` | `{api_key?, enabled?}` | `200` single status row | `400`, `404`, `409` env-key, `403` |
| DELETE | `/api/v1/admin/tool-providers/{type}` | — | `204` (empty body) | `404`, `409` env-key, `403` |

**Status row shape** (GET list items and POST/PATCH responses):
```json
{ "type": "courtlistener", "enabled": true, "name": "courtlistener-prod",
  "has_key": true, "key_required": true, "egress_tier": 4 }
```
- `type` ∈ `{"courtlistener","govinfo","edgar","eurlex"}` — keyed by **type**, not name (LQ.AI owns the canonical `name`).
- `key_required`: `true` for `courtlistener`/`govinfo` (show a key input), `false` for `edgar`/`eurlex` (keyless — User-Agent only; show an Enable toggle, no key field).
- `enabled`: the source has a live adapter (available to the research loop right now).
- `has_key`: a runtime/env key is present. **Never** a key value or last4.
- `egress_tier`: the ADR-0014 data-egress tier (currently 4 for all four).

### Semantics

- **Enable a not-yet-present type:** `POST {type}` creates + enables the `tool_providers` entry from **LQ.AI-owned defaults** (base_url / allowlist / egress_tier / rate_limit / User-Agent). Donna sends **only** `{type, api_key?}` — you cannot (and must not) set `base_url`/`allowlist`; that's the SSRF boundary (ADR 0014). Request bodies are `extra="forbid"`.
- **Set/rotate a key:** `POST` (or `PATCH {api_key}`) on a key-bearing type stores it encrypted-at-rest (ADR 0011 Fernet) and hot-applies. Requires the gateway master key (`LQ_AI_GATEWAY_MASTER_KEY`); if unset, `400 failed_precondition` — surface "runtime key storage disabled on this gateway."
- **Disable:** `DELETE /{type}` (or `PATCH {enabled:false}`) removes the entry + retires the live adapter → the source reverts to unavailable.
- **`409 conflict`:** the target is **env-configured** (`api_key_env` in the operator's `gateway.yaml`) — not runtime-revocable. Surface "configured via the environment; edit gateway.yaml."
- **Hot-apply:** every write is live with no restart. Proof: after `POST {type:"courtlistener", api_key:"…"}`, `GET /api/v1/research/sources` shows that source `enabled:true` immediately.

### Reference implementation for your card

LQ.AI ships its own in-app card in this PR — `web/src/routes/lq-ai/admin/research-sources/+page.svelte` (mirrors the Provider keys card): Available/Unavailable badge from `enabled`, masked write-only key input for `key_required` sources, Enable/Disable, re-fetch after each write. The generated OpenAPI (`docs/api/backend-openapi.generated.yaml`) has the two new paths + `ToolProviderSetRequest`/`ToolProviderPatchRequest` schemas.

### Related deferrals (filed as DEs, tracked LQ.AI-side)
- **DE-383** — `GET /api/v1/research/sources` currently reports `enabled` off entry *presence*, not the entry's `enabled` flag; a mid-toggle `enabled:false` isn't yet reflected there. Use `GET /api/v1/admin/tool-providers` for authoritative admin status.
- **DE-384** — a keyless env-configured entry (edgar/eurlex hand-added to `gateway.yaml`) is currently runtime-removable (no `409`); a `managed_by: runtime` marker is the fix.
