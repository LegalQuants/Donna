# Upstream lq-ai drift — schedule `max_cost_usd` missing from OpenAPI sketch

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
