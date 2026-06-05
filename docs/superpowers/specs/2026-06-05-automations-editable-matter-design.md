# Automations — editable matter on schedules + watches (design)

**Date:** 2026-06-05 · **Slice:** quick win unblocked by lq-ai PR #133 (`fc832ca`) · **Scope:** ~1 small PR

## Problem

A schedule's/watch's matter (`project_id`) was fixed at creation: `AutonomousScheduleUpdate` and
`AutonomousWatchUpdate` had no `project_id`, so both edit forms render the matter read-only
("· set at creation"). Upstream PR #133 (pin `fc832ca`) adds `project_id` to both Update schemas —
PATCH `project_id` → reassign · explicit `project_id: null` → unassign · omit → unchanged — and
validates caller-owns-the-project with an id-probing-safe **404** (`detail: "project not found"`)
on POST `/schedules`, POST `/watches`, POST `/run-now`, and both PATCHes.

## Decision (user-confirmed)

Clearing the matter in edit mode **unassigns** on save (sends `project_id: null`). The picker's
existing "No matter (general)" option must not lie.

## Changes

### 1. Pin bump

`vendor/lq-ai` `35c8bb6 → fc832ca`; `npm run gen:api`; rebuild affected containers; update
`docs/decisions/lq-ai-pin.md` bump log. Generated types gain `project_id?: string | null` on both
Update schemas.

### 2. Forms — `ScheduleForm.svelte`, `WatchForm.svelte`

- Drop the read-only matter branch: `MatterPicker` always renders (create AND edit). Remove the
  stale "fixed at creation" comments. On watches, **KB stays read-only in edit** (still immutable).
- Hidden-field emission for `project_id`:
  - **Create mode (unchanged):** emit only when non-empty (`{#if projectId}`).
  - **Edit mode (new):** always emit, empty string when no matter — the server action needs to
    distinguish "cleared" (→ `null`) from "untouched" (a create-mode form simply omits it).
  - Implementation: `{#if projectId}<input … value={projectId}>{:else if editing}<input … value="">{/if}`
    (or equivalent single expression).

### 3. Body builders — `schedules.ts`, `watches.ts`

- `buildScheduleBody(form)` → `buildScheduleBody(form, mode: 'create' | 'update')`, mirroring
  `buildWatchBody`. Callers: schedules list `?/create` (→ `'create'`), schedules `[id]` `?/update`
  (→ `'update'`).
- `project_id` semantics in both builders:
  - `create`: include only when non-empty (today's behavior).
  - `update`: **always include** — non-empty value → reassign; empty → `null` (unassign).
- `buildWatchBody` update branch changes from "never send `project_id`" to the same always-send
  semantics. `knowledge_base_id` stays create-only (immutable).
- Doc comments updated (watches.ts header still says "project_id is also immutable on update").

### 4. 404 disambiguation — both `[id]/+page.server.ts` `?/update` actions

A PATCH 404 now means *either* "schedule/watch not found" *or* "referenced project not found".
Upstream detail strings are distinguishable (`"project not found"` vs `"schedule/watch not found"`,
conflation idiom in `_load_owned_project`). The action reads the 404 response body:

```ts
if (res.status === 404) {
  const detail = … // defensively parse { detail?: string }; non-JSON → ''
  if (detail.includes('project'))
    return fail(404, { error: 'That matter was not found — it may have been deleted or belong to another account.', field: 'matter' });
  return fail(404, { error: 'Schedule not found.' }); // existing message (watch: 'Watch not found.')
}
```

Defensive: body not JSON / no `detail` → existing generic message. Create actions and run-now keep
their generic handling (YAGNI — the create flow only offers the user's own matters; the edit-PATCH
is where a stale prefill makes the project-404 realistically reachable).

### 5. Tests

- `ScheduleForm.svelte.test.ts` / `WatchForm.svelte.test.ts`: matter picker rendered (not read-only)
  in edit mode; hidden `project_id` emitted when set; **empty `project_id` emitted in edit mode**;
  create mode still omits it; watch KB still read-only in edit.
- `schedules.test.ts` / `watches.test.ts`: update mode — reassign (value), unassign (empty → `null`);
  create mode unchanged (omit when empty); existing cases updated for the new `buildScheduleBody` arity.
- Both `[id]/page.server.test.ts`: 404-with-`project`-detail → matter-specific `fail` with
  `field: 'matter'`; plain 404 → existing message; non-JSON 404 body → existing message.

## Out of scope

- Run-now / create-action 404 mapping (see §4 rationale).
- Watch KB mutability (still immutable upstream).
- Output surfacing (separate slice, upstream-blocked — ask already filed).

## Verification

`npm run check` = 0/0 · `npx vitest run` green · no new eslint errors · manual on the dev stack
(rebuild `donna-web`; edit a schedule's matter → list reflects it; unassign → "No matter";
same for a watch).
