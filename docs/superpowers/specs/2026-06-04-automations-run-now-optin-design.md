# Automations — Run-now + opt-in (Slice C)

**Date:** 2026-06-04 · **Pin:** `vendor/lq-ai` @ `541bd6f` (autonomous M4 surface present — **no pin bump**) · **Status:** design approved, ready to plan.

The first **interactive** Automations slice: a per-user **`autonomous_enabled` opt-in** plus **run-now** — launch a one-off ("manual") autonomous session over a knowledge base and watch it run in the live receipt view shipped in A+B (PR #58, merge `fd6965f`).

Builds on the read-only viewer: `docs/superpowers/specs/2026-06-04-automations-sessions-receipt-design.md`. The remaining mutate slices (F schedules, G watches; D memory, E precedents) are out of scope here — see that spec's §10 roadmap.

---

## 1. Goal & non-goals

**Goal.** Turn the Automations viewer into a control panel for the *manual* trigger: a user opts in, picks a **playbook or skill** to run over a **target knowledge base** (optionally scoped to a matter, optionally cost-capped), launches it, and is taken to the spawned session's live receipt.

**Non-goals (explicitly out of scope for slice C):**
- Schedules (F) and watches (G) — the cron/KB-arrival triggers.
- Memory review (D), precedents/proposals (E), halt button (H — already deferred).
- Adding the opt-in to anywhere other than Settings → Preferences + the inline Automations gate.

---

## 2. Backend contract (pin `541bd6f`)

The autonomous M4 layer is on `main` and present at the current pin — confirmed during A+B. **No pin bump for slice C** (the `29c1106` BYOK bump belongs with the later BYOK slice).

- **Opt-in:** `GET`/`PATCH /api/v1/users/me/preferences` — `autonomous_enabled: boolean` (request `{ autonomous_enabled?: boolean }`). Self-serve. Off by default. All autonomous *mutate/spawn* endpoints require it (`AutonomousEnabledUser`) → **403** until on.
- **Run-now:** `POST /api/v1/autonomous/run-now` → **201** `AutonomousSessionRead`. Body `AutonomousManualRunRequest`:
  - **exactly one of** `playbook_id` (uuid) *or* `skill_ref` (string) — zero or both → **422**.
  - optional `target_kb_id` (uuid), `project_id` (uuid), `max_cost_usd` (string|null; defaults to the gateway config cap if unset, so R4 always arms).
  - Semantics (`autonomous.py::_spawn_manual_session`): builds `params = { since: null, kb_id?, playbook_id?|skill_ref? }`; the **intake phase scopes the run to that KB's chunks**, the analysis phase runs the playbook/skill over them. `project_id` only associates the session with a matter (context/grouping), it is **not** the document scope → **the target KB is what the agent actually works on; no KB = an empty run.**
- The spawned session is then viewed via the **A+B receipt** at `/automations/{id}` (live-polls to terminal).

**✅ Spike resolved (2026-06-04, live at pin `541bd6f`):**
1. **`skill_ref` = the skill `name`/slug** — a built-in skill run (`skill_ref:"contract-qa"` + `target_kb_id`) returned **201**, `params.skill_ref:"contract-qa"`. User skills use their `slug` (same field). → `toSkillItems` (slug for user skills, name for built-ins) is correct.
2. **run-now does NOT gate built-in playbooks by ownership** — `_load_playbook_system_prompt` (`vendor/lq-ai/api/app/autonomous/prompts.py:226`) loads the playbook by `id` only (`deleted_at IS NULL`), **no `created_by`/admin filter** (unlike the playbooks *execute* endpoint). Any opted-in user can run any playbook by id. → **list all playbooks; no ownership filtering.**

**(Original) two items verified in the spike:**
1. **`skill_ref` format** — almost certainly the skill `slug` (skills carry `slug` in `src/lib/skills/types.ts`); confirm live by spawning a skill run. (The `playbook_id` path is already proven by A's spike.)
2. **Run-now playbook ownership** — the playbooks *execute* endpoint is admin-or-owner (non-admins can't execute built-ins). Confirm whether run-now's `run_playbook` tool inherits that gate. If it does, restrict the playbook source list (owned + forked) or mirror playbooks-B's "fork-first"; if not, list all. Dev admin fixture passes regardless. **Decision deferred to the spike** (do not pre-restrict).

---

## 3. Information architecture & flow

- **`/automations/new`** — the run-now form (dedicated route, mirrors `/tabular/new`, `/playbooks/[id]/run`).
- **`/automations`** (Sessions list) gains a **"Run now"** primary action → `/automations/new`.
- **Opt-in gate:** when `autonomous_enabled` is off, `/automations` and `/automations/new` render `AutomationsGate` (an "Automations are off → Enable" prompt) instead of the Run-now button / form.
- **`/settings/preferences`** gains an **Automations** toggle section (the canonical, persistent control).
- **On submit** → `POST run-now` → **redirect (303) to `/automations/{id}`** (the existing live receipt). No new receipt UI.

---

## 4. Opt-in (`autonomous_enabled`)

Reuses the existing preferences machinery end-to-end:
- **BFF:** add `autonomous_enabled` to the `ALLOWED` set in `src/routes/(app)/settings/preferences/+server.ts` (PATCH → `/users/me/preferences`).
- **Settings page:** `src/routes/(app)/settings/preferences/+page.server.ts` `load` also returns `autonomousEnabled` (from `GET /users/me/preferences`); `+page.svelte` adds a labeled **Automations** toggle section using the existing optimistic `save()` + revert-on-failure pattern.
- **Inline gate:** `src/lib/automations/AutomationsGate.svelte` — approved copy ("Automations are off / Let Donna run skills & playbooks on its own. You control cost and can halt anytime. / **Enable automations**"). Its button does `PATCH /settings/preferences {autonomous_enabled:true}` → `invalidateAll()`. Rendered on `/automations` and `/automations/new` when off.
- **Sourcing the flag:** a small server helper reads `autonomous_enabled` off `GET /api/v1/users/me/preferences`, used by the `/automations`, `/automations/new`, and settings loads. Best-effort default `false`.

---

## 5. Run-now form (`/automations/new`)

**SSR `load`** (parallel `lqFetch`, best-effort where a library is non-critical): playbooks (`GET /playbooks`), skills (`GET /skills`), the user's knowledge bases (`GET /knowledge-bases`), matters (`GET /projects`), and `autonomousEnabled`. If off → render `AutomationsGate`, skip the form.

**Form (client state):**
- A segmented **Playbook | Skill** control selects the source *mode*.
- `SourcePicker` — a searchable, mode-aware list (the playbook list or the skill list). Selecting yields `playbook_id` or `skill_ref` (the slug).
- `KbPicker` (**required**) → `target_kb_id`.
- `MatterPicker` (optional) → `project_id`.
- A **cost-cap** number input (optional) → `max_cost_usd` (string).
- The **Run** button is disabled until a source **and** a KB are chosen — so the backend's "exactly one source" rule can never 422 from the UI.
- Empty-library states: no KBs → "Create a knowledge base first" (link to `/knowledge`); no playbooks/skills in the active mode → a mode-specific empty note.

---

## 6. Components & data flow

| Unit | Responsibility |
|---|---|
| `src/routes/(app)/automations/new/+page.server.ts` | `load` (libraries + opt-in); `actions.run` |
| `src/routes/(app)/automations/new/+page.svelte` | gate-or-form shell |
| `src/lib/automations/RunNowForm.svelte` | composes the source toggle + pickers + cost cap; emits the run request; manages `canRun` |
| `src/lib/automations/SourcePicker.svelte` | searchable mode-aware (playbook\|skill) list, modeled on `TableSkillPicker` |
| `src/lib/automations/AutomationsGate.svelte` | opt-in prompt (shared by `/automations` + `/automations/new`) |
| `src/lib/automations/optin.server.ts` | `autonomousEnabled(event)` helper over `GET /users/me/preferences` |
| **edit** `settings/preferences/{+page.server.ts,+page.svelte,+server.ts}` | add the `autonomous_enabled` toggle |
| **edit** `automations/+page.{server.ts,svelte}` | "Run now" button + gate when off |
| **reuse** `matters/knowledge/KbPicker.svelte`, `matters/MatterPicker.svelte` | target KB / matter |

**Submit** is a SvelteKit **form action** `?/run` on `/automations/new/+page.server.ts`: validates a source + KB are present, `POST`s `/api/v1/autonomous/run-now`, and on **201** `redirect(303, '/automations/{id}')`. Internal `<a>`/nav follow the `eslint-disable-next-line svelte/no-navigation-without-resolve` convention.

---

## 7. Error handling

- **Not opted in:** the `load` detects `!autonomousEnabled` and renders `AutomationsGate` (the 403 is never reached). Defensive: a **403** from the run action → `redirect(303, '/automations')` (where the gate shows).
- **422** (zero/both sources): prevented by the UI; defensively mapped to a form error.
- **400 / 404** (bad/missing KB or source): surfaced as a form error from the action (`fail`).
- **Empty libraries:** explicit empty states; Run stays disabled.
- **Cost cap:** client-validates a non-negative number before enabling Run.

---

## 8. Testing (to Donna's `npm run check` = 0/0 bar; `npx vitest run` green; no new eslint errors)

- **Settings:** BFF `ALLOWED` accepts `autonomous_enabled` (and still rejects unknown keys); `load` exposes `autonomousEnabled`; toggle save + revert-on-failure.
- **`/automations/new` `load`:** returns libraries + `autonomousEnabled`; off → gate path.
- **`run` action:** success → `redirect` to `/automations/{id}`; missing source/KB → `fail(400)`; backend 403 → redirect; 422 → form error.
- **`AutomationsGate`:** renders the copy + Enable button; enable PATCHes `/settings/preferences`.
- **`SourcePicker`:** mode switch swaps the list; selection emits the right id/slug.
- **`RunNowForm`:** Run disabled until source + KB chosen.
- **`/automations` index:** shows "Run now" when on, gate when off.

---

## 9. Execution order

0. **Spike (task 1):** opt the admin fixture in; spawn a **skill** run-now to confirm the **`skill_ref` = slug** format; confirm whether run-now **gates built-in playbooks** by ownership (decides the playbook-list scope). Record findings; adjust §5/§2 if needed.
1. **Opt-in:** preferences BFF `ALLOWED` + `load` + toggle section + `optin.server.ts` helper.
2. **`AutomationsGate`** + wire into `/automations` (button when on, gate when off).
3. **`/automations/new`** form: `SourcePicker` + `RunNowForm` + reused KB/Matter pickers + empty states.
4. **`run` action** → spawn → `redirect` to the live receipt; error mapping.
5. Whole-branch Opus review → `finishing-a-development-branch` → PR.

## Key references
- Run-now handler/semantics: `vendor/lq-ai/api/app/api/autonomous.py` (`_spawn_manual_session` ~1094; intake scoping `docs/autonomous-layer.md:116-117`); request schema `AutonomousManualRunRequest` (`backend.d.ts:8977`); opt-in `/users/me/preferences`.
- Reuse: `src/routes/(app)/settings/preferences/*` (opt-in pattern), `src/lib/tabular/TableSkillPicker.svelte` (source picker model), `src/lib/matters/knowledge/KbPicker.svelte`, `src/lib/matters/MatterPicker.svelte`, `/playbooks/[id]/run` + `/tabular/new` (run-form precedents), `src/lib/automations/*` (A+B viewer this redirects into).
