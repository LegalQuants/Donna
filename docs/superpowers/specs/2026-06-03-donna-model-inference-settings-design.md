# Model & Inference Settings Design

**Date:** 2026-06-03 · **Phase:** post-P6 (model/inference config surface) · **Pin:** `vendor/lq-ai` @ `c22360a`
(provider-keys UI gated on a future pin bump — see §5)

## What this is

Donna hardcodes model/inference choices silently even though the lq-ai backend exposes per-category model
routing, live local-model discovery, and (deployment-only) provider keys. This adds a **Settings → Models**
surface that makes the routing transparent and lets the operator reassign which model backs each inference
category — the configuration layer above the existing per-message model picker (P2c-B1).

## Decisions locked (brainstorm 2026-06-03)

1. **Focused MVP:** show each category's current backing + (admin) reassign it + list installed local
   models. **Out:** custom-alias creation, fallback-chain editing, tier-policy editing (tier _policy_
   stays read-only on the existing Trust page — no duplication).
2. **Provider keys (BYOK):** there is **no runtime key API** (env-only). Filed an **upstream request**
   (`docs/upstream-requests/lq-ai-provider-key-management.md`); the in-app key card is a **pin-gated
   task** (or fast-follow) once the SHA lands. No no-op control ships.
3. **Admin-gated writes:** Donna is self-hosted-per-operator, so the typical user _is_ admin. Writes
   (alias reassign) require `is_admin`; non-admins get a read-only view + a note. Reads work for everyone.

## Backend reality (verified live + against generated `backend.d.ts`)

- **`GET /api/v1/models`** (any user): merged list. **Aliases** (`lq_ai_kind:'alias'`) carry
  `lq_ai_resolves_to` (`"provider/model"`) + `routed_inference_tier`. **Provider-native** entries
  (`lq_ai_kind:'provider_native'`) are the assignable concrete models — `id:"provider/model"`,
  `owned_by:provider`, `provider_type` (e.g. `ollama`), `routed_inference_tier`. Installed Ollama models
  appear here via live discovery (60 s cache; absent/quiet if Ollama is down).
- **`GET /api/v1/admin/aliases`** (admin): `AdminAliasEntry[]` = `{name, provider, model, fallback:
{provider,model}[], primary_inference_tier?}`. `GET /admin/aliases/{name}` = one entry.
- **`PATCH /api/v1/admin/aliases/{name}`** (admin) body `AdminAliasUpdate` = `{provider, model,
fallback?}`. Hot-applies, no restart. ⚠️ **`fallback` is replaced, not merged** — omitting it (or
  sending `[]`) drops the chain, so a reassign MUST resend the existing fallback.
- **Provider keys:** none. Env-only (`gateway/app/config.py`, `ProviderKeyResolver`). → §5.
- **No Ollama install/pull API** — discovery only.

## Architecture & components

### 1. IA

`SettingsRail.svelte` gains `{ href: '/settings/models', label: 'Models' }`. New route
`(app)/settings/models/` slots into the existing `/settings` layout. (Cross-links to `/settings/trust`
for the data-trust framing; tier _policy_ lives there.)

### 2. `src/lib/inference/` — pure helpers + types (testable, no I/O)

- `types.ts`: re-export `AdminAliasEntry`, `AdminAliasFallback`, `AdminAliasUpdate`,
  `TierConfigResponse` from the generated schema; define view types `ModelTarget`
  (`{ id; provider; model; label; group: 'cloud'|'local'; tier: number|null }`) and `CategoryView`
  (`{ name; label; backingLabel; tier; group; }`).
- `inference.ts`:
  - `availableTargets(raw: RawModelEntry[]): ModelTarget[]` — provider-native entries →
    `{ id, provider: owned_by, model: id without the "owned_by/" prefix, label: prettifyModel(id),
group: provider_type==='ollama' || tier===1 ? 'local':'cloud', tier }`, deduped, cloud-then-local.
  - `chatCategoryNames(raw): string[]` — the chat-alias ids from the exported `toChatOptions(raw)` (it
    already filters out non-chat/embedding aliases), ordered by the canonical list
    `['smart','fast','budget','local','local-fast','local-thinking']`, then any others appended.
  - `categoryView(name, entryOrAliasRaw): CategoryView` — current backing label (`prettifyModel`),
    tier, cloud/local — works from an `AdminAliasEntry` (admin) or a raw alias entry (non-admin).
  - `reassignPatchBody(entry: AdminAliasEntry, target: ModelTarget): AdminAliasUpdate` —
    `{ provider: target.provider, model: target.model, fallback: entry.fallback }` (**preserves fallback**).
  - `localModels(raw): ModelTarget[]` — the `group:'local'` subset of `availableTargets` (the installed
    Ollama models). Reuse `prettifyModel` from `src/lib/models/normalize.ts`.

### 3. `/settings/models/+page.server.ts`

SSR `load`: always `GET /api/v1/models`; **if `locals.user?.is_admin`** also `GET /api/v1/admin/aliases`.
Returns `{ isAdmin, categories: CategoryView[], aliasEntries: AdminAliasEntry[]|null, targets:
ModelTarget[], localModels: ModelTarget[] }`. Empty/degraded on a failed `/models` (show an error card);
non-admin → `aliasEntries: null`, categories derived from the `/models` alias entries.

**`?/reassign` form action** (admin): inputs `name`, `target_id`. Re-`GET /admin/aliases/{name}` for the
current fallback, resolve `target_id`→`ModelTarget`, `PATCH /admin/aliases/{name}` with
`reassignPatchBody`. Map 403→`fail(403,'admin required')`, 4xx→`fail(400,…)`, else `error(502)`. Success →
`invalidateAll` reloads the rows. (Form action, not a standalone BFF proxy — matches the
preferences/matters precedent.)

### 4. Components

- `src/lib/inference/CategoryRow.svelte` — props `{ category: CategoryView; targets: ModelTarget[];
isAdmin: boolean }`. Renders the category name + description + current backing + tier badge. **Admin:**
  a `<select>` of `targets` (grouped Cloud/Local via `<optgroup>`) inside a `use:enhance` form posting
  `name` + the chosen `target_id` to `?/reassign` (submit on change; a small "Saving…/Saved/Error"
  status). **Non-admin:** read-only + (once, on the card) "Changing model routing requires an admin
  account."
- `src/lib/inference/LocalModelsCard.svelte` — props `{ localModels: ModelTarget[] }`. Lists detected
  Ollama models with a note "Detected via Ollama on your system. Run `ollama pull <model>` to add more."
  Empty state when none.
- `+page.svelte` — composes a category card (rows) + the local-models card + the §5 provider-keys note.

### 5. Provider keys — PIN-GATED

This slice ships a single informational line where the card will live: _"Provider API keys are set via
your deployment's environment; in-app management is coming."_ The management card (masked key input per
provider + configured status, reusing the settings modal/secret-input precedents) is a **pin-gated task**
added once the upstream BYOK API (`docs/upstream-requests/lq-ai-provider-key-management.md`) lands; if the
SHA is late it's a fast-follow. No no-op control before then.

## Reuse

`/settings` rail + layout; the settings card structure + form-action/`use:enhance` pattern
(preferences); `prettifyModel`/`toChatOptions` (`src/lib/models/normalize.ts`); native
`type="password"` secret input + the `MfaDisableModal`/`DeleteAccountModal` base (for the pin-gated key
card); `lqFetch`.

## Testing

- **vitest:** `inference.ts` helpers (availableTargets grouping/provider+model split incl. a
  slash-in-name case; chatCategoryNames order + non-chat exclusion; reassignPatchBody **preserves
  fallback**; categoryView for admin-entry vs raw-alias; localModels subset); `CategoryRow` render
  (admin select vs read-only); `+page.server.ts` load (admin → fetches aliases; non-admin → skips, derives
  from /models; /models failure → error shape); `?/reassign` action (re-reads fallback, PATCH body
  correct, 403→fail).
- **live e2e** (rebuild `donna-web`; dev fixture is admin): visit `/settings/models` → categories show
  current backings → reassign a category to another available model via the select → it persists on
  reload; the installed local-models list renders. Gate: `npm run check` 0/0 · eslint no new errors ·
  `npx vitest run` ≥ ~893.

## Risks & notes

- **Preserve fallback on reassign** — the single most important correctness detail (§2/§3).
- **Admin-gating:** non-admins must get a clean read-only view, never a broken editable one.
- **`provider/model` parsing** — split on the `owned_by` prefix, not naive first-slash, in case a model
  id itself contains a slash.
- Reassigning across tiers (e.g. `smart`→a local model) is allowed by the backend; the UI permits it
  (operator's call) and the tier badge updates on reload.
- `cost_actual`/billing, Ollama install, and provider keys are all out (the last is §5 pin-gated).
