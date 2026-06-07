# Upstream bug for lq-ai: streamed turns never persist `inference_routing_log`

**Found by:** Donna (frontend), building the P2c Receipts drawer + anonymization indicator.
**Severity:** High — every chat turn created through a streaming client (the entire Donna UI streams) is **missing its `inference_routing_log` row**, so the receipts `inference`/`error` event and everything derived from it (tier, tokens, latency, **`anonymization_applied`**) never appear. Non-streaming (`stream:false`) turns are fine.

## Evidence (reproduced live)

Two turns, same prompt, same stack:

```
stream:true  chat → 0 rows in inference_routing_log   (receipts: 0 inference events)
stream:false chat → 1 row                              (receipts: 1 inference event)
```

The streamed assistant message persists fine (token counts land in `messages`), but no routing-log row is written.

## Root cause

`gateway/app/api/inference.py`, `_stream_openai_sse` (success path):

```python
    yield b"data: [DONE]\n\n"          # line ~1210

    # Persist the routing-log row using the final chunk's usage block.
    usage = ...
    ...
    await log_writer.write(            # line ~1225 — runs AFTER [DONE]
        InferenceRoutingLogRow(...)
    )
```

The `await log_writer.write(...)` is **after** the `yield b"data: [DONE]\n\n"`. The api-side consumer (`GatewayClient.chat_completion_stream` → `_iter_sse_chunks`) stops iterating when it sees `[DONE]` and closes the `async with client.stream(...)` context, which cancels this async generator **before** the write executes. So the row is never persisted.

Note the **failure path** in the same function (~line 1181) calls `_write_failure(...)` **before** its `yield b"data: [DONE]\n\n"` — which is why refused/error turns _do_ log. Only the success path is affected.

## Fix

Move the success-path routing-log write to **before** `yield b"data: [DONE]\n\n"`. Everything it needs (`last_chunk.usage`, cost, correlation ids, `anon_mapper`) is already available after the `async for` loop and after the tail-flush terminal chunk is yielded. Sketch:

```python
    # (tail-flush terminal chunk yielded here, as today)

    # Persist the routing-log row BEFORE signalling end-of-stream, so the
    # consumer closing on [DONE] can't cancel us mid-write.
    usage = (last_chunk.usage if last_chunk is not None else None) or None
    cost = ...
    chat_id, message_id = _correlation_ids(chat_request)
    await log_writer.write(InferenceRoutingLogRow(... anonymization_applied=anon_mapper is not None ...))

    yield b"data: [DONE]\n\n"
```

(Alternatively, schedule the write as a background task that survives client disconnect — e.g. `asyncio.create_task(...)` or a FastAPI `BackgroundTask` — but writing before the `[DONE]` yield is simpler and deterministic, and matches what the failure path already does.)

## Test

Add a gateway/api integration test asserting that a **streaming** chat completion persists exactly one `inference_routing_log` row (same invariant the non-streaming path already satisfies). Today only the non-streaming path is covered, which is why this regressed silently.

## Why it matters to Donna (M2 transparency)

The Receipts drawer's provenance timeline and the per-message anonymization indicator both read `inference_routing_log` (via `GET /chats/{id}/receipts`). Until this is fixed, those surfaces are blank for any chat created in the real (streaming) UI — the feature only demonstrably works on `stream:false`/API-seeded chats. No Donna change is needed once the row is written for streamed turns; the surfaces light up automatically.

## When it's done

Report the merged SHA. Donna will bump the `vendor/lq-ai` pin, regen types (likely no type diff), and the drawer/indicator will populate for normal streamed chats.
