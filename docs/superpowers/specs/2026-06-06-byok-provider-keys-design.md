# BYOK — provider-keys management card on /settings/models (design)

**Date:** 2026-06-06 · **Slice:** the deferred Task-5 provider-keys card from the model/inference
settings milestone, unblocked since pin `35c8bb6` (lq-ai #128 runtime key API) · **Branch:**
`feat/byok-provider-keys` (off `main` — independent of the automations stack).

## Problem

Provider API keys live only in the deployment's gitignored `.env`; `/settings/models` shows a
placeholder ("In-app key management is coming."). The backend has had a runtime provider-key API
since lq-ai #128 — admins should be able to add/rotate/revoke keys in-app, hot-applied, without
touching the server environment.

## Upstream contract (verified: generated types @ current pin + `vendor/lq-ai` api/gateway source)

- **`GET /api/v1/admin/provider-keys`** (admin-only; non-admin → 403) →
  `{ provider_keys: ProviderKeyStatus[] }` where `ProviderKeyStatus = { provider, type: string|null,
  configured: boolean, last4: string|null, source: "env"|"runtime"|null }`. The full key is NEVER
  returned (`last4` at most; null when absent/unresolvable/<4 chars).
- **`POST /api/v1/admin/provider-keys` `{ provider, api_key }`** → **set/REPLACE** a runtime key →
  returns the updated `ProviderKeyStatus`. **Hot-applied** (adapter swapped live, no gateway
  restart): a keyless provider becomes routable immediately; `source` flips to `"runtime"`.
  Setting a runtime key on an **env** row is supported — the gateway persists `api_key_encrypted`
  **and clears `api_key_env`** (runtime takes over management; verified in
  `gateway/app/provider_keys.py::apply_provider_key`).
- **`PATCH /{provider}` `{ api_key }`** → rotate. **Deliberately unused** by Donna: POST is
  documented set/replace, so the UI needs one verb.
- **`DELETE /{provider}`** → revoke runtime key (204, hot-applied removal).
- **Scope:** operates on providers already in the gateway config. Adding a brand-new provider
  (type/base_url/tier) is NOT in the API — out of scope here too.
- **Errors:** **400** = gateway has no `LQ_AI_GATEWAY_MASTER_KEY` (runtime keys can't be encrypted
  at rest; detail mentions the master key — from `MasterKeyMissing`); **404** = unknown provider;
  **409** = revoke attempted on an env-provided key. Keys encrypted at rest; secret write-only
  end-to-end.

## Decisions (user-confirmed)

- **Non-admin:** slim section with "Provider API keys are managed by your administrator." — no
  data (the API 403s anyway); mirrors the categories section's gated-with-note pattern.
- **Architecture (approach A):** SSR `load` + per-row `use:enhance` form actions on the existing
  `/settings/models` page — the page's established pattern. No client proxies, no polling; the
  default `invalidateAll` after an action refreshes statuses AND the categories/local-models cards
  (hot-apply can make new models routable).
- **One write verb:** always POST (set/replace) — covers add, rotate, and env-takeover. No PATCH.
- **Live e2e is non-destructive:** assert the read path + env-row affordances (env hints, no
  Revoke control). The 409/error mappings are unit-tested. No real key writes in tests.

## Changes

### 1. Data layer — new `src/lib/inference/providerKeys.ts` (pure)

- `ProviderKeyRow = { provider: string; type: string | null; configured: boolean; last4: string |
  null; source: 'env' | 'runtime' | null }`.
- `parseProviderKeys(raw): ProviderKeyRow[]` — defensive parse of the `provider_keys` envelope
  (house style: malformed rows dropped; `source` outside env/runtime → null).
- `sourceLabel(row): string` — `'runtime'` / `'environment'` / `'no key'`.
- `canRevoke(row): boolean` — `row.source === 'runtime'`.

### 2. UI — `ProviderKeysCard.svelte` + `ProviderKeyRowItem.svelte` (new, `src/lib/inference/`)

Card replaces the placeholder section on `/settings/models/+page.svelte`:

- **Admin, loaded:** one `ProviderKeyRowItem` per row:
  - Status line: provider name (text-sm medium) + adapter `type` chip (subtle) + status — configured:
    `✓ Configured · {sourceLabel} · ••••{last4}` (last4 null → no bullet suffix); env rows add a muted
    hint "managed by your deployment's environment"; unconfigured: `No key`.
  - Set/replace form (`?/setKey`): masked input `type="password"` `autocomplete="new-password"` +
    submit labeled **Add key** (unconfigured) / **Replace key** (configured). Disabled while empty.
    Input value is cleared after a successful save (enhance success path). Env rows keep the same
    form — replacing converts them to runtime-managed (copy hint under the input on env rows:
    "Saving a key here takes over management from the environment.").
  - Revoke (`?/revokeKey`): only when `canRevoke` — two-step confirm (Revoke → "Revoke key?" +
    Confirm/Cancel; schedules/watches delete precedent).
  - Per-row error display from the action's `fail` payload (row-scoped via a `provider` echo in the
    payload; only the matching row shows the message).
- **Admin, fetch failed:** "Could not load provider keys right now."
- **Admin, zero rows:** "No providers are configured in the gateway."
- **Non-admin:** the slim managed-by-administrator note.
- Sub-copy under the heading: "Keys are encrypted at rest in the gateway and applied immediately —
  no restart. The full key is never shown again after saving."

### 3. Server — `src/routes/(app)/settings/models/+page.server.ts`

- `load`: when `isAdmin`, also fetch `GET /api/v1/admin/provider-keys` (in parallel with the
  admin-aliases fetch — the models fetch stays first since its failure early-returns the page) →
  `providerKeys: ProviderKeyRow[] | null` (null = failed) + the existing payload.
  Non-admin: `providerKeys: null`, no fetch (UI distinguishes via `isAdmin`).
- `?/setKey` action: reads `provider` + `api_key` from the form; empty either → `fail(400)` with no
  upstream call. `POST /api/v1/admin/provider-keys`. Mapping (sniffs the raw response body — the error detail may be a plain string or the structured
  envelope): **403** → "Managing provider keys requires an admin account."; **400**
  with detail mentioning "master key" → "The gateway has no master key set, so runtime keys can't
  be stored — ask your operator to configure LQ_AI_GATEWAY_MASTER_KEY."; other 400 → generic save
  failure; **404** → "Unknown provider."; other → 502 "Could not save the key." All failure
  payloads carry `{ provider }` so the card scopes the message to the right row. **The `api_key`
  value is never logged, echoed back, or included in any payload.** Success → `{ success: true }`
  (enhance default `invalidateAll` refreshes statuses).
- `?/revokeKey` action: `DELETE /api/v1/admin/provider-keys/{provider}` (encodeURIComponent).
  **409** → "This key can't be revoked here — it comes from the deployment environment, or was
  already removed." (the gateway also 409s when no runtime key exists — stale-tab race); **404** →
  treat as success (provider unknown — idempotent from the UI's perspective); **403** → admin
  message; other → 502.

### 4. Out of scope

Adding new providers; the PATCH rotate verb; non-admin key visibility; surfacing
`LQ_AI_GATEWAY_MASTER_KEY` state proactively (the 400 mapping covers it reactively); key strength
validation (backend's job).

## Error handling summary

| Failure | Behavior |
|---|---|
| GET fails / non-JSON | `providerKeys: null` → card degraded message; page otherwise fine |
| POST 400 master-key detail | operator-actionable message on the row |
| POST 400 other / 5xx | generic row-scoped failure |
| POST/DELETE 404 | setKey: "Unknown provider." · revoke: success (idempotent) |
| DELETE 409 (env) | env-managed explanation on the row |
| 403 anywhere | admin-required message |
| Malformed status row | dropped by parser |

## Testing

- **Unit:** `providerKeys.ts` (envelope, malformed rows, source normalization, labels, canRevoke);
  `ProviderKeyRowItem` (unconfigured/runtime/env states, button labels, env hint, two-step revoke,
  no revoke on env, disabled-on-empty); `ProviderKeysCard` (rows/empty/error/non-admin);
  `page.server` (admin parallel fetch + parse, non-admin skips the fetch, degrade-to-null; setKey:
  success, empty-input no-fetch, 403, master-key-400 detail sniff, other-400, 404, 502; revokeKey:
  204 success, 409 message, 404-idempotent, 403).
- **Live e2e** (`tests/byok-provider-keys.spec.ts`, non-destructive): admin login →
  `/settings/models` → provider rows render with real statuses (dev stack: anthropic/openai are
  env-sourced) → env row shows no Revoke control; POST/DELETE mutations are NOT exercised live
  (mutating `gateway.yaml` isn't test-reversible) — the 409 mapping is unit-tested. If no
  env-sourced row exists in the environment, assert the card's structural render only.

## Verification

`npm run check` 0/0 · `npx vitest run` green · no new eslint errors · live e2e green on the dev
stack (rebuild `donna-web`). **No pin bump; the slice must NOT commit a `vendor/lq-ai` pointer
change** (the local checkout may sit at a newer SHA from the parallel automations stack).
