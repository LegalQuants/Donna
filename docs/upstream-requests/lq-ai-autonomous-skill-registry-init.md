# lq-ai ask: initialise the skill registry in the arq-worker (scheduled `skill_ref` runs always fail)

**From:** Donna (frontend consumer, pin `0097b01`) · **Date:** 2026-06-07
**Severity:** every scheduled autonomous run with a `skill_ref` source fails on the worker — the
schedules feature is effectively broken for skill sources.

## Symptom

Sessions spawned by `cron:autonomous_schedule_dispatcher` with a `skill_ref` source fail with:

```
ValueError: assemble_analysis_messages: skill registry not initialised (skill_ref='dpa-checklist-review')
```

Observed on Donna's dev stack (single recurring schedule, `cron_expr: 0 9 * * *`,
`skill_ref: dpa-checklist-review`):

| Tick (UTC)       | Worker image                  | Result                   |
| ---------------- | ----------------------------- | ------------------------ |
| 2026-06-05 09:00 | pre-`0097b01` (older pin era) | **completed**            |
| 2026-06-06 09:00 | pre-rebuild                   | **failed** (error above) |
| 2026-06-07 09:00 | rebuilt on `0097b01`          | **failed** (error above) |

The 06-05 success on an older image suggests this is a **regression** somewhere in the range
leading up to `0097b01` (e.g. if skill resolution previously loaded the registry lazily rather
than reading `app.state`). Run-now sessions in the same window completed, but those were
playbook-sourced — we have no recent evidence that worker-side `skill_ref` resolution works at
all on `0097b01`, and by code inspection it cannot (below).

## Root cause (verified by code inspection at `0097b01`)

1. **Error site:** `api/app/autonomous/prompts.py:166-187`. `_load_skill_system_prompt` calls
   `_registry_from_app_state()` (lines 176-183), which does
   `getattr(app.state, "skill_registry", None)` on the **imported FastAPI `app` object** and
   raises the ValueError when it's `None`.
2. **The registry is only installed by the API process:** `api/app/main.py:63-93` — the FastAPI
   lifespan loads skills from disk (`load_registry(skills_dir, community_skills_dir=…)`) and sets
   `app.state.skill_registry = MutableSkillRegistry(initial_registry)` (line ~88).
3. **The arq worker never runs that lifespan.** Its startup hook
   (`api/app/workers/arq_setup.py:128-143`, `on_startup`) only logs. So in the worker process,
   `app.state.skill_registry` is unset and EVERY `skill_ref` session that reaches
   `assemble_analysis_messages` fails — scheduled, watch-triggered, or run-now alike.
   (`playbook_id` sources are unaffected: `prompts.py:143-147` resolves playbooks via a DB query.)
4. **Why tests don't catch it:** `api/tests/autonomous/conftest.py:243-263`'s
   `_installed_skill_registry` fixture manually installs the registry before prompts tests —
   replicating exactly the init step the worker is missing. `test_schedules.py` covers
   `_run_schedule_sweep` but never executes the worker job through skill resolution.

## Requested fix

Initialise the skill registry during worker startup, mirroring the lifespan logic. Preferably:

1. **Extract** the registry-building block from `main.py:63-88` (skills dir + community dir
   resolution + `load_registry` + `MutableSkillRegistry` + install on `app.state`) into a reusable
   helper, e.g. `app/skills/bootstrap.py::install_skill_registry(app) -> MutableSkillRegistry`.
2. **Call it from both** the FastAPI lifespan (`main.py`) and the arq `on_startup` hook
   (`arq_setup.py:128-143`).

(A worker that can't load the skills dir should fail loudly at startup, not at the first 9 AM
tick.)

## Requested test

An integration test that runs `autonomous_session_job` for a `skill_ref` session **through the
worker startup path** (i.e. with only `arq_setup.on_startup` having run — NOT the
`_installed_skill_registry` fixture), asserting the analysis phase assembles messages. That is
the exact gap that let this regress.

## What Donna does on the merged SHA

Bump the pin + rebuild `arq-worker`, then confirm the next scheduled tick completes. No frontend
change needed — Donna already renders failed sessions' `error` faithfully on the receipt page.
