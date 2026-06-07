# Upstream request to lq-ai: expose `anonymization_applied` (and `message_id`) in the receipts inference event

**Requested by:** Donna (frontend) — needed for the M2-D2 **anonymization indicator** transparency surface.
**Size:** ~2 lines of code + 1 test + 1 doc note. No schema migration (columns already exist).

## Why

Donna wants to show a **per-message, verified** "anonymized before it left your environment" indicator on assistant turns. The data already exists — `InferenceRoutingLog.anonymization_applied` (bool, non-null) — but it is **not exposed by any read endpoint** the frontend can reach:

- The chat message APIs don't carry it.
- `GET /api/v1/chats/{chat_id}/receipts` reads `InferenceRoutingLog` but its `inference`/`error` event `detail` omits `anonymization_applied` (and `message_id`).

Without this, the only options are dishonest (hardcode a badge from the gateway's default-on behavior), which violates the transparency / "don't overclaim" principle. Exposing the real per-request flag keeps the indicator truthful.

## The change

**File:** `api/app/api/chat_receipts.py` — in `get_chat_receipts`, the inference/error event `detail` dict (currently ~lines 194–203).

Add two keys to that `detail` dict:

```python
detail={
    "provider": log.routed_provider,
    "model": log.routed_model,
    "tier": log.routed_inference_tier,
    "tokens_in": log.tokens_in,
    "tokens_out": log.tokens_out,
    "latency_ms": log.latency_ms,
    "refused": log.refused,
    "refusal_reason": log.refusal_reason,
    # --- additions ---
    "anonymization_applied": log.anonymization_applied,
    "message_id": str(log.message_id) if log.message_id else None,
},
```

- `anonymization_applied` — the existing `InferenceRoutingLog.anonymization_applied` column (bool, non-null, `models/inference.py:82`). This is the indicator's source of truth.
- `message_id` — the existing nullable `InferenceRoutingLog.message_id` column (`models/inference.py:67`). Lets the frontend **correlate the inference event (its anonymization flag + tier) to a specific assistant message**, so the indicator can sit on the right message bubble. (The `message` events already carry `message_id`; the `inference` event does not, which is the missing link.)

Apply to both the `inference` and `error` branches — they build the **same** `detail` dict (the code sets `kind = "error" if log.refused else "inference"` and appends one event), so adding the keys once covers both.

## OpenAPI (`docs/api/backend-openapi.yaml`)

The receipts endpoint's event `detail` is typed `additionalProperties: true` (free-form), so **no strict schema change is required**. Per the project's "documentation is part of the change" rule, update the `GET /api/v1/chats/{chat_id}/receipts` description to note that the `inference`/`error` event `detail` now includes `anonymization_applied: boolean` and `message_id: uuid|null` (alongside the existing provider/model/tier/tokens/latency/refused fields).

## Tests

In the receipts test suite (the integration test covering `GET /chats/{chat_id}/receipts`), add/extend a case asserting that a chat which ran an inference produces an `inference` event whose `detail` contains:

- `anonymization_applied` as a boolean, and
- `message_id` equal to the assistant message's id (and `None`/absent only when the log row has no `message_id`).

A regression test that the field is present (not silently dropped) is the key guard.

## Conventions reminder (from lq-ai CLAUDE.md)

- Imperative commit message, DCO sign-off (`git commit -s`), reference this as the motivation.
- Coverage must not decrease; the added test covers the new keys.
- This touches `api/` (not `gateway/`), so it's not in the security-review CODEOWNERS path — a normal review.

## When it's done

Report back with the merged SHA. Donna will bump the `vendor/lq-ai` submodule pin (deliberate, one-PR-per-bump per `docs/decisions/lq-ai-pin.md`), regenerate API types (`npm run gen:api`), and then build the anonymization indicator on top of the receipts data (it will already be flowing through the Receipts drawer we're building now).
