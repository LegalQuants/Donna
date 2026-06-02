# P7-4 — Trust (Settings slice 4 of 4 — completes P7)

**Date:** 2026-06-01 · **Branch:** `p7-4-trust` · **Phase:** P7 Settings, final slice (Account → Data & privacy → Preferences → **Trust**)

## Goal

A read-only `/settings/trust` page that discloses how Donna routes a user's data — the deployment's trust/tier posture. It's the fuller companion to the P7-3 ambient composer trust pill. Completes the P7 Settings area.

## Key context / findings

- **Read-only disclosure.** The two relevant endpoints are user-readable; the only write surface (`POST /api/v1/inference/override-tier-floor`) is **admin-only** (Wave D.1 re-run), so the Trust page has **no user controls** — no no-op-toggle risk.
- **No existing Donna UI** consumes the tier endpoints (`tier-config`/`current-tier` appear only in the generated contract). P7-4 is their first consumer.
- The composer model picker already normalizes `/models` to `ChatModelOption { id, label, resolvedModel, group: 'cloud'|'local', tier }` via `toChatOptions()` (`src/lib/models/normalize.ts`). The Trust matrix reuses this — the local-vs-cloud + tier data is already derivable; **no per-model `current-tier` calls needed.**

## Backend contract (verified @ pin `badf83d`, v0.4.0)

- `GET /api/v1/models` → `{ data: RawModelEntry[] }` (same source the composer uses; client hits it via the `/models` BFF proxy, but the Trust SSR load calls `lqFetch(event, '/api/v1/models')` directly). `toChatOptions(body.data ?? [])` → chat-usable normalized options.
- `GET /api/v1/inference/tier-config` → `TierConfigResponse { allowed_tiers_global: number[]; default_minimum_tier: number; privileged_minimum_tier: number; warn_on_tiers: number[] }`. User-accessible read of the operator's tier policy.
- (`GET /api/v1/inference/current-tier?provider&model` exists but is **not used** — the matrix derives local/cloud + tier from the models list.)

## Decisions locked in brainstorming

1. **Content — all four blocks**, in this order: (1) plain-language trust model (prose), (2) per-model trust matrix, (3) tier-policy disclosure, (4) anonymization callout.
2. **Matrix keeps the "What it means" column** (Model · Where it runs · Tier · What it means) — not just Local/Cloud + tier.
3. **Order** intro → matrix → policy → anonymization (approved).
4. Green = Local/self-hosted, amber = Cloud (consistent with the P7-3 trust pill).

## Architecture

### Route & shell
- **`SettingsRail.svelte`** — append `{ href: '/settings/trust', label: 'Trust' }` (4th entry; completes the rail).
- **`src/routes/(app)/settings/trust/+page.server.ts`** — SSR `load` (read-only disclosure; no actions).
- **`src/routes/(app)/settings/trust/+page.svelte`** — renders the four blocks.

### Pure helper
- **`src/lib/trust/trust.ts`**:
  ```ts
  export interface TrustRow {
    id: string;
    label: string;          // prettified model, or the id if label is ''
    where: 'Local' | 'Cloud';
    tone: 'local' | 'cloud';
    tier: number | null;
    meaning: string;        // local → "Never leaves your environment"; cloud → "Anonymized before leaving"
  }
  export function toTrustRows(options: ChatModelOption[]): TrustRow[];
  ```
  Pure mapping from normalized model options; `label` falls back to `id` when the prettified label is empty. Unit-tested.

### SSR load (data flow)
`+page.server.ts` `load`:
1. `const modelsRes = await lqFetch(event, '/api/v1/models')` → on ok, `toTrustRows(toChatOptions((await modelsRes.json()).data ?? []))`; on failure, `rows = []` and `modelsError = true`.
2. `const cfgRes = await lqFetch(event, '/api/v1/inference/tier-config')` → on ok, the `TierConfigResponse`; on failure, `tierConfig = null`.
3. Returns `{ rows, modelsError, tierConfig }`.

Both fetches are independent; one failing doesn't block the other. No client state, no polling.

### Page blocks (`+page.svelte`)
1. **Intro prose** — static: local = on-device/never leaves; cloud = anonymized before leaving; privileged matters enforce a minimum tier.
2. **Per-model matrix** — a table from `data.rows`: columns Model · Where it runs (colored dot: green `tone==='local'` / amber `tone==='cloud'`) · Tier (`tier ?? '—'`) · What it means. If `data.modelsError` or `rows.length === 0`, show an inline "Couldn't load the model list." note instead of the table.
3. **Tier policy** — from `data.tierConfig` (when non-null): "Normal chats — minimum tier" = `default_minimum_tier`; "Privileged matters — minimum tier" = `privileged_minimum_tier`; "Allowed tiers" = `allowed_tiers_global.join(', ')`. When `tierConfig` is null, omit the whole block.
4. **Anonymization callout** — static reassurance (shield) that outbound cloud requests pass through the anonymization layer, tying to the per-answer "Anonymized" provenance marker.

## Error handling

- Models fetch fails → matrix replaced by an inline "Couldn't load the model list." note; the rest of the page renders.
- tier-config fails → the policy block is omitted entirely (no error noise; the page is still useful).
- Both are SSR; a hard auth failure is already handled upstream by `hooks.server.ts` (redirect to login).

## Testing

- **Unit (vitest):** `toTrustRows` — local option → `where:'Local'`, `tone:'local'`, `meaning` "Never leaves…"; cloud option → `where:'Cloud'`, `tone:'cloud'`, "Anonymized before leaving"; `tier` passthrough incl. `null`; empty `label` falls back to `id`.
- **Server (`// @vitest-environment node`, `vi.mock('$lib/server/lqClient')`):** the `load` — both endpoints ok (rows + tierConfig populated); models 500 → `rows: []`, `modelsError: true`, tierConfig still returned; tier-config 500 → `tierConfig: null`, rows still returned.
- **Component (page render):** seed `data` with a couple of rows + a tierConfig → assert matrix rows (a Local + a Cloud), the three policy values, and the anonymization callout render; seed `modelsError: true` → assert the fallback note; seed `tierConfig: null` → assert no policy block.
- **Live e2e (Playwright, read-only, no cleanup; mirrors `settings-account.spec.ts`):** visit `/settings/trust`; assert the rail "Trust" link is `aria-current="page"`; the matrix shows ≥1 row containing "Local" or "Cloud" and a tier; the tier-policy section shows the minimum-tier values; the anonymization callout is visible.

## Scope / guardrails

- Reuse the settings shell — append the rail entry + add the `/settings/trust` route.
- Read-only; **no controls, no new BFF proxies** (SSR load via `lqFetch`), no `current-tier` per-model calls.
- Reuse `toChatOptions` (don't re-implement model normalization).
- Quality bar: `npm run check` 0/0; eslint clean (no `any`/`!`); table is semantic (`<table>`/`<th scope>` or an accessible grid); green/amber via the existing `mlq-success`/`mlq-caveats` tokens (consistent with the P7-3 pill).

## Out of scope

- Any tier **override** control (admin-only endpoint; not user-facing).
- Per-model `current-tier` detail panels / provider compliance deep-dive (the matrix's derived columns suffice; revisit only if users ask for the raw `explanation`/`routed_provider_type`).
- Usage/cost disclosure (`/usage` endpoints) — a separate concern, not part of P7.

## Completes P7

With this slice merged, all four P7 Settings slices ship: Account · Data & privacy · Preferences · Trust.
