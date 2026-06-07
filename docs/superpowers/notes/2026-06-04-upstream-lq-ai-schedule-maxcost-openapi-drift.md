# Upstream lq-ai drift — schedule `max_cost_usd` missing from OpenAPI sketch

**Status:** ✅ RESOLVED upstream same day — lq-ai `69a0d35`
(_fix(api): sync max_cost_usd onto autonomous schedule/watch OpenAPI schemas (contract drift) #129_).
Donna bumped the `vendor/lq-ai` submodule pin `541bd6f → 69a0d35` and reran `gen:api`;
`AutonomousScheduleCreate`/`Update`/`Read` now all type `max_cost_usd?: string | null`.
(The bump also brought `29c1106` — the BYOK provider-key backend, Donna #7 — unblocking that future milestone.)

**Date:** 2026-06-04 · **Found during:** Donna Automations slice F (schedules).

**Drift:** `api/app/schemas/autonomous.py::AutonomousScheduleCreate` (and `AutonomousScheduleUpdate`)
expose `max_cost_usd: Decimal | None` (added by migration `0045_autonomous_per_trigger_max_cost.py`,
covered by `tests/autonomous/test_watch_schedule_max_cost_field.py`). The hand-maintained OpenAPI sketch
`docs/api/backend-openapi.yaml` does **not** list `max_cost_usd` on those two schemas — though it
correctly lists it on `AutonomousManualRunRequest` (run-now). The same likely applies to the watch
create/update schemas (verify when slice G lands).

**Impact on Donna:** `gen:api` reads the sketch, so the generated `AutonomousScheduleCreate` type lacks
the field. Donna posts `max_cost_usd` in an untyped request body, so it works at runtime; only
compile-time typing is missing.

**Upstream fix:** add `max_cost_usd: {type: string, nullable: true}` to `AutonomousScheduleCreate`,
`AutonomousScheduleUpdate` (and the watch create/update) in `docs/api/backend-openapi.yaml`, matching the
`AutonomousManualRunRequest` precedent. After the pin bumps past that fix, Donna can drop the untyped cast.

---

## Related asymmetry — `project_id` is absent from `AutonomousScheduleUpdate` (not just the sketch)

Found during slice F whole-branch review. `AutonomousScheduleCreate` accepts `project_id`, but
`AutonomousScheduleUpdate` (both the Pydantic model and the generated `backend.d.ts`) has **no
`project_id`** — so a schedule's matter is effectively **fixed at creation**; a PATCH carrying
`project_id` is silently ignored (Pydantic `extra='ignore'`). Donna handles this by rendering the matter
**read-only** in the edit form (`ScheduleForm` `editing` branch) instead of an editable control that does
nothing. If reassigning a schedule's matter is ever desired, that's an upstream ask to add `project_id`
to `AutonomousScheduleUpdate`; otherwise the current read-only treatment is correct.
