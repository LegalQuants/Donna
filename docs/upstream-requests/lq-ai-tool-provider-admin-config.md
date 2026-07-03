# Upstream request: a runtime admin API for tool / authority providers (enable + key)

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-03 · **Status:** OPEN
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
