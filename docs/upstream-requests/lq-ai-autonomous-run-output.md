# LQ-AI ask — expose an autonomous run's findings (work-product) for display

**Filed:** 2026-06-05 · **From:** Donna (consumer) · **For:** the next Automations slice ("run output surfacing"). The LQ-AI session works in `/Users/kevinkeller/Code/lq-ai` (absolute paths below; it can't see Donna branches).

## Why
Donna's Automations viewer shows a run's **transparency receipt** (`GET /api/v1/autonomous/sessions/{id}` → phase timeline, tool calls, cost, terminal reason) and a Notifications inbox. But a user currently **cannot see the actual work-product a run produced** — only that it happened. This defeats the feature's purpose for scheduled/watch runs ("a run finished — what did it produce, and where do I read it?").

## What I found (spike against the pinned vendor source, 2026-06-05)
A run's phases are **intake → analysis → drafting → ethics_review → notify** (`api/app/autonomous/state.py`, `enums.py`). The work-product is dispatched per-item through the chokepoint during drafting/ethics:
- **findings** (`ToolIntent.emit_finding`) — the core analysis output;
- **memories** (`propose_memory`) — persisted to `autonomous_memory` (has `source_session_id`);
- **precedents** (`propose_precedent`) — persisted to `PrecedentEntry`.

Then `notify` writes an `AutonomousNotification` (`session_id`, `title`, `body` = counts + receipt link, `payload = {"finding_count": N}`).

**The gap:** **findings are transient + audit-only — there is no `AutonomousFinding` table and no endpoint that returns a run's findings content.** A user sees a *count* (`finding_count`) in the notification, never the findings themselves. (`emit_finding` is a local, brake-checked, **audited** intent — `api/app/autonomous/cost.py`, `nodes.py:~280,540` — but nothing persists findings for later read.) Memories/precedents ARE persisted, but `GET /memory` filters by `state` only — **no `?source_session_id=` filter** — so "what THIS run produced" isn't a clean query either. There is **no "document dropped in a KB"** concept; the deliverable is findings/memories/precedents.

## The ask (in priority order)
1. **Persist findings + expose them per session (the enabler).** Add an `autonomous_findings` table written by the `emit_finding` chokepoint — at minimum `{ id, session_id (FK, ON DELETE CASCADE), severity, title, body/content, created_at }` — and a read endpoint, either:
   - `GET /api/v1/autonomous/sessions/{id}/findings` (paginated, owner-gated, 404 on cross-user like the other session routes), **or**
   - fold `findings: [...]` into the existing `GET /sessions/{id}` detail / `build_receipt` payload.
   This lets Donna render "what the run found/produced" directly under the receipt.
2. **(Lesser) Add `?source_session_id=<uuid>` to `GET /memory`** (and the precedents list), so a per-receipt "memories/precedents this run proposed" section is a clean query. The `source_session_id` column already exists on `autonomous_memory`; this is just a query param + WHERE clause.
3. **(Confirm)** whether the notification `payload` could also carry typed refs (finding ids/severities) for deep-linking — but #1 supersedes this.

## Donna side (once shipped)
Bump the pin + `gen:api`, then a small slice: a "Results / What it produced" section on the session receipt page rendering findings (severity-grouped) and, if #2 lands, the run's proposed memories/precedents — closing the loop so a scheduled/watch run's output is discoverable without digging. Spec/plan to follow.

**Note:** if findings are intentionally ephemeral by design (transparency-via-audit-log only), say so and we'll instead surface the **audit-log entries** for the session as the "what it did/produced" view — but a typed findings read model is the cleaner UX.
