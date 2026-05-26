# Upstream contract gap for lq-ai: `/v1/models` returns undocumented alias fields, and the documented `routed_inference_tier` rule is stale

**Found by:** Donna (frontend), building the P2c-B1 composer model/tier picker (consumes `GET /api/v1/models`).
**Severity:** Low–Medium — not a runtime bug; it's a schema↔implementation mismatch. The live payload carries fields the OpenAPI sketches don't declare, so `openapi-typescript` codegen omits them and downstream clients must hand-type them. One documented constraint is also contradicted by the live response.

## Evidence (reproduced live, 2026-05-25)

`GET /api/v1/models` on a stock dev stack, **alias** rows (`lq_ai_kind: "alias"`):

```json
{ "id": "smart",  "object": "model", "created": 0, "owned_by": "lq-ai-gateway",
  "lq_ai_kind": "alias", "routed_inference_tier": 4,
  "lq_ai_resolves_to": "anthropic-prod/claude-opus-4-7", "lq_ai_fallback_count": 2 }
{ "id": "fast",   "lq_ai_kind": "alias", "routed_inference_tier": 4,
  "lq_ai_resolves_to": "anthropic-prod/claude-sonnet-4-6", "lq_ai_fallback_count": 1 }
{ "id": "local",  "lq_ai_kind": "alias", "routed_inference_tier": 1,
  "lq_ai_resolves_to": "ollama-local/qwen3.5:9b" }
```

Two discrepancies vs. the OpenAPI `ModelEntry` schema:

1. **`lq_ai_resolves_to` (string) and `lq_ai_fallback_count` (integer) are undocumented.** They appear on alias rows in the live response but are absent from `ModelEntry`. `lq_ai_resolves_to` is genuinely useful to clients (it's how a picker can label `smart` as "Opus 4.7"); `lq_ai_fallback_count` communicates fallback depth.
2. **`routed_inference_tier` is present on aliases**, but the schema says it is *omitted* on aliases.

## Root cause (documentation, in the OpenAPI sketches)

`docs/api/gateway-openapi.yaml`, `components.schemas.ModelEntry` (lines ~877–921):

- `properties` (ends ~line 921) declares only `id, object, created, owned_by, lq_ai_kind, routed_inference_tier, provider_type`. It does **not** declare `lq_ai_resolves_to` or `lq_ai_fallback_count`.
- `routed_inference_tier` description (lines ~907–914) says:
  > "Present on `provider_native` rows; omitted on aliases (the alias may resolve to different providers via fallback, so the tier is settled per-request, not per-alias)."

  The live gateway returns `routed_inference_tier` on alias rows too (every cloud alias = 4, local = 1). So either the implementation now annotates aliases with a tier (and the description is stale), or the field shouldn't be there on aliases (and the implementation regressed). The description and the payload disagree — please reconcile.

`docs/api/backend-openapi.yaml`, `/api/v1/models` 200 response (lines ~1614–1630): this is an **inline copy** of the same item shape (the backend doc says the response is "single-sourced" to the gateway). It has the same two omissions and would need the same edit to stay in sync.

> I have only the OpenAPI sketches in the vendored submodule, not the gateway implementation. The exact source that builds alias rows (likely the `/v1/models` handler in `gateway/app/api/inference.py`) is the place to confirm which of the two `routed_inference_tier` readings is intended.

## Fix

In `ModelEntry` (gateway-openapi.yaml ~921, after `provider_type`), add:

```yaml
        lq_ai_resolves_to:
          type: string
          description: |
            For ``alias`` rows: the concrete ``<provider_name>/<native_model>``
            the alias currently resolves to (e.g. ``anthropic-prod/claude-opus-4-7``).
            Lets clients show the real model behind an alias. Absent on
            ``provider_native`` rows (the id already is the native name).
        lq_ai_fallback_count:
          type: integer
          description: |
            For ``alias`` rows: how many fallback providers are configured
            after the primary (0 when the alias has no fallbacks). Absent on
            ``provider_native`` rows.
```

Then either (a) update the `routed_inference_tier` description to say it is also present on aliases (the tier of the alias's primary resolution), or (b) fix the handler so aliases omit it — whichever matches intent. Mirror the same field additions into the inline item schema in `backend-openapi.yaml` (~1614–1630) so the two stay single-sourced. If these fields are produced by the handler but were never speced, this is purely a doc-catches-up-to-code change; add a schema-conformance assertion so the response and `ModelEntry` can't drift again.

## Test

Extend the `/v1/models` schema-conformance test to assert that an **alias** row validates against `ModelEntry` *including* `lq_ai_resolves_to` (and `lq_ai_fallback_count` when fallbacks are configured), and that whatever `routed_inference_tier` rule you land on (present-on-aliases or omitted) is asserted for both alias and provider_native rows. Today the live payload would fail strict additionalProperties validation against the current schema, which is the gap.

## Why it matters to Donna (P2c-B1)

The composer model picker labels each alias with its resolved model (`smart · Opus 4.7`) using `lq_ai_resolves_to`. Because the field isn't in the spec, `npm run gen:api` doesn't emit it, so Donna currently hand-types a local `RawModelEntry` extension (`src/lib/models/types.ts`) to read it. Once `ModelEntry` declares both fields, Donna can drop the local extension and consume the generated type directly. No behavioral change on either side — purely contract hygiene.

## When it's done
Report the merged SHA. Donna will bump the `vendor/lq-ai` pin, run `npm run gen:api`, and remove the local type extension in `src/lib/models/types.ts` (the picker keeps working unchanged).
