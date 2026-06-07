# Upstream request: runtime provider API-key management (BYOK)

**For:** lq-ai backend/gateway · **From:** Donna (frontend) · **Filed:** 2026-06-03 · **Status:** dispatched (awaiting SHA)
**Relates to:** Donna model/inference settings (Settings → Models); enables the pin-gated provider-keys card.

## Problem

Donna wants an in-app way to add/manage provider API keys. Today they are **env-only**: the gateway loads
them at startup (`gateway/app/config.py` — each provider carries `api_key_env` _or_ `api_key_encrypted`,
the latter decrypted with `LQ_AI_GATEWAY_MASTER_KEY`), held in memory by `ProviderKeyResolver`. There is
**no runtime mutation** and **no key-management endpoint** anywhere in the backend or gateway. So a user
cannot add or rotate a key without editing env and restarting — there's no in-product path at all.

## Ask — an admin API to manage provider credentials at runtime (gateway stays the secret boundary)

- `GET /api/v1/admin/provider-keys` → list configured providers **without exposing secrets**:
  `{ provider, type, configured: bool, last4?/fingerprint?, source: 'env' | 'runtime' }[]`.
- `POST /api/v1/admin/provider-keys` → set/add a key `{ provider, api_key }` — stored **encrypted at
  rest** (reuse the Fernet / `LQ_AI_GATEWAY_MASTER_KEY` machinery) and **hot-applied** to the live
  `ProviderKeyResolver` / provider pool **without a restart**.
- `PATCH /api/v1/admin/provider-keys/{provider}` → rotate the key.
- `DELETE /api/v1/admin/provider-keys/{provider}` → revoke a runtime key.
- **Never** return the secret value in any response (write-only; surface masked/last4 + `configured`
  status only). **Admin-only**; TLS in transit; encrypted at rest. Env-provided keys keep working and
  report `source: 'env'` (and should not be deletable via the runtime API).

## Acceptance

- `POST` a key for a provider that has no env key → the gateway can immediately route to it **without a
  restart**; `GET` then lists it `configured: true, source: 'runtime'` with **no secret in the payload**.
- `DELETE` revokes the runtime key → routing to that provider fails as unconfigured.
- An env-configured provider shows `source: 'env'`, `configured: true`, and is not clobbered/removable by
  the runtime API.

## Handoff

Push to `main` and return the **commit SHA**. Donna pins `vendor/lq-ai` to it, regenerates types, and
builds the provider-keys management card (already scoped as the pin-gated task of the model/inference
settings slice): a masked key input per provider + configured/last4 status, reusing Donna's settings
modal + `type="password"` secret-input precedents. The card never displays or stores the secret
client-side beyond the single write.
