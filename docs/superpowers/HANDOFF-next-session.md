# Donna — Handoff for the next session

**Date:** 2026-06-04 · **`main` @ `9e1c77d`** · **Pin:** `vendor/lq-ai` @ `35c8bb6`.

## Where things stand
The **Automations** surface (4th Workflows segment over LQ-AI's autonomous M4 layer) is being built in slices, each its own brainstorm→spec→plan→subagent-execute→whole-branch-Opus-review→PR loop. Shipped to `main`:
- **A+B (#58):** read-only viewer — Sessions list + per-session receipt + notifications inbox.
- **C (#59):** run-now + `autonomous_enabled` opt-in.
- **F — Schedules (#60, MERGED):** `/automations/schedules` list/create/edit/toggle/delete cron-triggered runs; `CronInput` (presets+advanced), `ScheduleForm`, pure `cron.ts`/`schedules.ts`. **Pin bumped `541bd6f → 35c8bb6` during F** → all autonomous cost fields now uniformly typed `string`, AND the **BYOK provider-key backend is now in-pin** (lq-ai #128). Two run-now crash fixes also shipped (each_key_duplicate dedupe; cost-cap `type=number→text`).

## IN PROGRESS: Slice G — Watches (branch `feat/automations-watches`, off `9e1c77d`)
A **watch** = schedule minus cron, minus name, bound to a **required, immutable `knowledge_base_id`**; fires a run **every time a new document arrives** in that KB. Matter also immutable on edit. User chose **explicit fire + cost emphasis** in the form.

- **Spec:** `docs/superpowers/specs/2026-06-04-automations-watches-design.md` (committed).
- **Plan (the resumable handoff — full code per task):** `docs/superpowers/plans/2026-06-04-automations-watches.md` (committed). 8 tasks.
- **To resume:** run **superpowers:subagent-driven-development** on that plan. Check `git log --oneline main..HEAD` to see which tasks are committed, then start at the next one. Each task = fresh implementer subagent (haiku for pure Tasks 1–2, sonnet for components/routes) + spec review + code-quality review; fix→re-review. Then whole-branch **Opus** review → `finishing-a-development-branch` → PR.
- **Progress (committed on the branch):** Task 1 ✅ (shared `sourceLabel` extracted to `src/lib/automations/sourceLabel.ts`, `schedules.ts` re-exports) · Task 2 ✅ (`watches.ts` — parse/kbLabel/buildWatchBody). **Next: Task 3 (`WatchForm.svelte`).**
- **Key contract:** `AutonomousWatchCreate` = `knowledge_base_id` (req, owned KB else 404) + one of `playbook_id`/`skill_ref` + `project_id?` + `enabled` + `max_cost_usd?`. `AutonomousWatchUpdate` = `enabled?`/`playbook_id?`/`skill_ref?`/`max_cost_usd?` ONLY (KB + project_id immutable). DELETE→200 (re-delete 404). No GET-single (edit finds-by-id from the list). All `autonomous_enabled`-gated.

## THEN (sequencing, user-confirmed 2026-06-04): output surfacing → BYOK → docs-polish
- **Automations output surfacing** ([[donna-automations-output-surfacing]]) — **user priority right after G.** Surface a run's actual **work-product** (link the produced document(s) from the receipt + a "completed, output ready" signal), not just the transparency receipt. **Has a backend unknown:** the receipt (`autonomous_sessions.result`) carries no output-artifact field — start with a spike against the live backend; may need an upstream lq-ai ask (drift-fix workflow). Doing it after G means it covers all three trigger types (run-now/schedule/watch).
- **BYOK / provider-keys frontend** — now UNBLOCKED, backend in-pin at `35c8bb6` (do NOT bump to the stale `29c1106`). Full contract in [[donna-model-inference-settings]].
- **Docs-polish** — About refresh + README/LICENSE Apache 2.0/acknowledgements ([[donna-docs-polish-milestone]]).

## Dev-stack + build-loop reminders (see [[donna-dev-stack]], [[donna-workflow]])
- **Shifted ports.** Cold start: `set -a; . ./.env; set +a; docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker`. App http://localhost:13002 · API :18000 · admin `admin@lq.ai`/`$DONNA_E2E_PASSWORD`. The `arq-worker` runs the autonomous job + schedule-dispatcher + **watch dispatcher** + idle-watchdog.
- **Rebuild `donna-web`** (`docker compose up -d --build donna-web`) before any manual/e2e check — stale container serves old bundle.
- **Gate: `npm run check` = 0/0** is THE bar (vendor `ERR_MODULE_NOT_FOUND` stderr harmless). `npx vitest run` ~1060+ green. `npm run lint`/`eslint .` has ~53 PRE-EXISTING errors on `main` — add **no new** ones (internal `<a href>` need `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on the line above the `href`).
- **Reuse map for G:** `src/lib/automations/{optin.server, unread.server, AutomationsGate, SourcePicker, sourceLabel, runNow}`, `$lib/matters/{MatterPicker, knowledge/KbPicker}`, `$lib/server/loadJson` (jsonOr), the `/automations` sub-nav (`AutomationsNav`). Build new `WatchForm`/`WatchRow`/`WatchList` parallel to the schedule equivalents; touch no shipped F files except the `sourceLabel` re-export.
