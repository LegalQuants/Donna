# Automations — Editable Matter on Schedules + Watches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a schedule's/watch's matter (`project_id`) editable in the edit forms — reassign or unassign via PATCH — unblocked by the lq-ai pin bump `35c8bb6 → fc832ca`, with the new project-ownership 404 mapped to a matter-specific error.

**Architecture:** Pin bump regenerates `src/lib/api/backend.d.ts` (additive: `project_id` on `AutonomousScheduleUpdate`/`AutonomousWatchUpdate`). Both forms drop their read-only matter branch and always render `MatterPicker`; in edit mode the `project_id` hidden field is _always_ emitted (empty = cleared) so the server action can send `project_id: null` (unassign) vs a value (reassign). `buildScheduleBody` gains the same `'create' | 'update'` mode param `buildWatchBody` already has. Both `?/update` actions read the 404 body's `detail` to distinguish "project not found" (→ matter-specific error) from "schedule/watch not found".

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, openapi-typescript codegen, vendored lq-ai submodule.

**Spec:** `docs/superpowers/specs/2026-06-05-automations-editable-matter-design.md`

**Branch:** `feat/automations-editable-matter` (already created from `main` @ `14e5078`).

**Upstream facts (verified against `vendor/lq-ai` @ `fc832ca`, `api/app/api/autonomous.py`):**

- PATCH semantics: `project_id` value → reassign · explicit `null` → unassign (`exclude_unset=True` distinguishes sent-null from omitted) · omitted → unchanged.
- Unowned/missing project on PATCH → **404** with body `{"detail": "project not found"}` (from `_load_owned_project`, id-probing-safe).
- Missing schedule/watch on PATCH → 404 with `{"detail": "schedule not found"}` / `{"detail": "watch not found"}`.

---

### Task 1: Pin bump `35c8bb6 → fc832ca` + `gen:api` + pin-doc entries

**Files:**

- Modify: `vendor/lq-ai` (submodule pointer)
- Regenerate: `src/lib/api/backend.d.ts` (and possibly `src/lib/api/gateway.d.ts`, expected no-op)
- Modify: `docs/decisions/lq-ai-pin.md` (header SHA + two bump-log entries — the `541bd6f → 35c8bb6` entry from slice F was never recorded)

- [ ] **Step 1: Bump the submodule**

```bash
cd vendor/lq-ai && git fetch && git checkout fc832ca && cd ../..
git -C vendor/lq-ai log --oneline -1
```

Expected: `fc832ca feat(autonomous): allow reassigning matter via PATCH + validate project_id ownership (#133)`

- [ ] **Step 2: Regenerate API types and inspect the diff**

```bash
npm run gen:api
git diff --stat src/lib/api/
git diff src/lib/api/backend.d.ts | grep -B2 -A2 project_id | head -40
```

Expected: a small **additive** diff to `src/lib/api/backend.d.ts` — `project_id?: string | null` appearing on the `AutonomousScheduleUpdate` and `AutonomousWatchUpdate` schemas (plus possibly updated 404 response descriptions). `gateway.d.ts` unchanged. If the diff is large or removes fields, STOP and report.

- [ ] **Step 3: Update `docs/decisions/lq-ai-pin.md`**

Change the header line:

```markdown
- Pinned SHA: `fc832ca` (bumped 2026-06-05 from `35c8bb6`)
```

Add at the TOP of the `### Bump log` section (newest first), two entries:

```markdown
- `35c8bb6` → `fc832ca` (2026-06-05): lq-ai **#133** — `project_id` added to
  `AutonomousScheduleUpdate` AND `AutonomousWatchUpdate`, so a schedule's/watch's **matter is
  reassignable via PATCH** (value → reassign · explicit `null` → unassign · omit → unchanged).
  Caller-owns-the-project now validated (404 `{"detail": "project not found"}`, id-probing-safe via
  `_load_owned_project`) on POST `/schedules`, POST `/watches`, POST `/run-now`, and both PATCHes.
  `npm run gen:api` → small additive diff (the two Update-schema fields). **Unblocks** the
  editable-matter slice (this bump ships with it): editable `MatterPicker` in
  `ScheduleForm`/`WatchForm` edit mode + 404→"matter not found" mapping.
- `541bd6f` → `35c8bb6` (2026-06-04, **recorded retroactively** — bump shipped mid-slice-F in
  PR #60): lq-ai **#130** — autonomous session/schedule/watch cost fields uniformly typed
  `string` on the wire (matches runtime); range includes lq-ai **#128** = the **BYOK
  provider-keys backend** (`/api/v1/admin/provider-keys` CRUD), making the Donna BYOK frontend
  buildable in-pin.
```

- [ ] **Step 4: Verify the build is clean**

```bash
npm run check
```

Expected: `svelte-check found 0 errors and 0 warnings` (vendor `ERR_MODULE_NOT_FOUND` stderr noise is harmless).

```bash
npx vitest run --silent 2>&1 | tail -5
```

Expected: all tests pass (~1100).

- [ ] **Step 5: Commit**

```bash
git add vendor/lq-ai src/lib/api/ docs/decisions/lq-ai-pin.md
git commit -m "chore(pin): bump lq-ai 35c8bb6 -> fc832ca (matter reassignable via PATCH)"
```

---

### Task 2: `buildScheduleBody` gains a `'create' | 'update'` mode; update emits `project_id` always

**Files:**

- Modify: `src/lib/automations/schedules.ts:51-80`
- Modify: `src/routes/(app)/automations/schedules/+page.server.ts` (caller → `'create'`)
- Modify: `src/routes/(app)/automations/schedules/[id]/+page.server.ts:47` (caller → `'update'`)
- Test: `src/lib/automations/schedules.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/automations/schedules.test.ts`, the existing `buildScheduleBody` tests call it with one argument. Add the second argument `'create'` to ALL existing calls (6 call sites in the `describe('buildScheduleBody')` block — their expected bodies do not change), then add these cases inside that describe block:

```ts
it('update: emits project_id verbatim (reassign)', () => {
	const out = buildScheduleBody(
		fd({
			source_mode: 'playbook',
			playbook_id: 'p1',
			cron_expr: '0 9 * * *',
			project_id: 'm2'
		}),
		'update'
	);
	expect(out.ok && out.body.project_id).toBe('m2');
});
it('update: maps an empty project_id to null (unassign)', () => {
	const out = buildScheduleBody(
		fd({
			source_mode: 'playbook',
			playbook_id: 'p1',
			cron_expr: '0 9 * * *',
			project_id: ''
		}),
		'update'
	);
	expect(out.ok).toBe(true);
	expect(out.ok && out.body.project_id).toBeNull();
});
it('create: still omits an empty project_id', () => {
	const out = buildScheduleBody(
		fd({
			source_mode: 'playbook',
			playbook_id: 'p1',
			cron_expr: '0 9 * * *',
			project_id: ''
		}),
		'create'
	);
	expect(out.ok && 'project_id' in out.body).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx vitest run src/lib/automations/schedules.test.ts
```

Expected: the three new tests FAIL (TypeScript will also flag the arity at check time; vitest runs through). `update: emits project_id verbatim` may pass incidentally — the two distinguishing failures are `maps an empty project_id to null` and the signature itself.

- [ ] **Step 3: Implement**

In `src/lib/automations/schedules.ts`, change the `buildScheduleBody` signature and doc comment, and the `project_id` line:

```ts
/** Build the create/update request body from a submitted form. Enforces the
 *  "exactly one source + a cron" rule; cron validity itself is the backend's
 *  job (422). Shared by the list (?/create) and edit (?/update) actions.
 *  `project_id`: create omits it when empty; update always sends it —
 *  a value reassigns the matter, explicit null unassigns (omit = unchanged,
 *  per AutonomousScheduleUpdate's exclude_unset PATCH semantics). */
export function buildScheduleBody(form: FormData, mode: 'create' | 'update'): ScheduleBodyResult {
```

and replace the single line `if (projectId) body.project_id = projectId;` with:

```ts
if (mode === 'update') body.project_id = projectId || null;
else if (projectId) body.project_id = projectId;
```

- [ ] **Step 4: Update the two callers**

`src/routes/(app)/automations/schedules/+page.server.ts` — in the `create` action:

```ts
const built = buildScheduleBody(await event.request.formData(), 'create');
```

`src/routes/(app)/automations/schedules/[id]/+page.server.ts` — in the `update` action:

```ts
const built = buildScheduleBody(await event.request.formData(), 'update');
```

- [ ] **Step 5: Run tests + check**

```bash
npx vitest run src/lib/automations/schedules.test.ts "src/routes/(app)/automations/schedules"
npm run check
```

Expected: all PASS; check 0/0.

(Note: the `[id]` page-server update test posts no `project_id` field → `String(null ?? '')` = `''` → body now carries `project_id: null`. Its assertions check status/redirect, not the body, so it stays green.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/schedules.ts src/lib/automations/schedules.test.ts "src/routes/(app)/automations/schedules/+page.server.ts" "src/routes/(app)/automations/schedules/[id]/+page.server.ts"
git commit -m "feat(automations): buildScheduleBody create/update modes; update sends project_id (null = unassign)"
```

---

### Task 3: `buildWatchBody` update emits `project_id` (KB stays create-only)

**Files:**

- Modify: `src/lib/automations/watches.ts` (header comment, `buildWatchBody` doc + body)
- Test: `src/lib/automations/watches.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/automations/watches.test.ts`, **replace** the existing test
`'update: omits knowledge_base_id and project_id (immutable), keeps source/enabled/cost'` with:

```ts
it('update: omits knowledge_base_id (immutable) but emits project_id, keeps source/enabled/cost', () => {
	const out = buildWatchBody(
		fd({
			source_mode: 'skill',
			skill_ref: 'comms',
			knowledge_base_id: 'kb1',
			project_id: 'm1',
			max_cost_usd: '1.50',
			enabled: 'false'
		}),
		'update'
	);
	expect(out.ok && out.body).toEqual({
		enabled: false,
		skill_ref: 'comms',
		project_id: 'm1',
		max_cost_usd: '1.50'
	});
});
it('update: maps an empty project_id to null (unassign)', () => {
	const out = buildWatchBody(
		fd({ source_mode: 'playbook', playbook_id: 'p1', project_id: '' }),
		'update'
	);
	expect(out.ok).toBe(true);
	expect(out.ok && out.body.project_id).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/automations/watches.test.ts
```

Expected: both FAIL (update branch currently never sends `project_id`).

- [ ] **Step 3: Implement**

In `src/lib/automations/watches.ts`:

File-header comment (lines 1-3) — replace the trailing clause:

```ts
// Defensively-parsed view models + form helpers for autonomous watches
// (lq-ai /api/v1/autonomous/watches). Mirrors schedules.ts. A watch is bound to
// a required, immutable knowledge_base_id; project_id is editable on update.
```

`buildWatchBody` doc comment:

```ts
/** Build the create/update request body. Create requires a source AND a
 *  knowledge_base_id (and may carry project_id). Update omits knowledge_base_id
 *  (immutable) but always sends project_id — a value reassigns the matter,
 *  explicit null unassigns (omit = unchanged, per AutonomousWatchUpdate's
 *  exclude_unset PATCH semantics). */
```

and in the body, replace:

```ts
if (mode === 'create') {
	body.knowledge_base_id = kbId;
	if (projectId) body.project_id = projectId;
}
```

with:

```ts
if (mode === 'create') {
	body.knowledge_base_id = kbId;
	if (projectId) body.project_id = projectId;
} else {
	body.project_id = projectId || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/automations/watches.test.ts
npm run check
```

Expected: all PASS; check 0/0.

(Note: the watches `[id]` page-server update test posts `project_id: 'm1'` in its form — body assertions aren't made there, so it stays green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/watches.ts src/lib/automations/watches.test.ts
git commit -m "feat(automations): buildWatchBody update sends project_id (null = unassign)"
```

---

### Task 4: `ScheduleForm` — matter editable in edit mode

**Files:**

- Modify: `src/lib/automations/ScheduleForm.svelte`
- Test: `src/lib/automations/ScheduleForm.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/automations/ScheduleForm.svelte.test.ts`, in the test
`'prefills from initial in edit mode (skill source) and shows the given submit label'`, replace the two matter lines:

```ts
// Matter is fixed at creation — edit mode shows it read-only, not an editable picker.
expect(screen.getByText(/set at creation/i)).toBeInTheDocument();
```

with:

```ts
// Matter is editable in edit mode (fc832ca: PATCH project_id reassigns/unassigns).
expect(screen.getByRole('button', { name: /choose matter/i })).toBeInTheDocument();
expect(screen.queryByText(/set at creation/i)).toBeNull();
// Edit mode always emits project_id — empty string here (initial project_id: null)
// so the server can distinguish "cleared" (→ null) from "untouched".
expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('');
```

(`container` is already destructured in that test.) Then add a new test to the same describe block:

```ts
it('create mode omits the project_id hidden input until a matter is picked', () => {
	const { container } = render(ScheduleForm, { props: base });
	expect(container.querySelector('input[name="project_id"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/automations/ScheduleForm.svelte.test.ts
```

Expected: the edit-mode test FAILS (no "Choose matter" button; no empty hidden input). The new create-mode test PASSES already (documents current behavior — kept as a regression guard).

- [ ] **Step 3: Implement**

In `src/lib/automations/ScheduleForm.svelte`:

1. Delete the `matterName` derived (line 57) — it was only used by the read-only branch.
2. Replace the comment above `editing` (lines 60-63) with:

```ts
// Edit mode: the form always emits project_id (empty = cleared) so the update
// action can send an explicit null (unassign) vs omit (untouched, create mode).
const editing = $derived(initial !== null);
```

3. Replace the matter section (lines 115-122):

```svelte
<div>
	<div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
	<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
</div>
```

4. Replace the `project_id` hidden-field line (line 144):

```svelte
{#if projectId}<input type="hidden" name="project_id" value={projectId} />{:else if editing}<input
		type="hidden"
		name="project_id"
		value=""
	/>{/if}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/automations/ScheduleForm.svelte.test.ts
npm run check
```

Expected: all PASS; check 0/0 (the deleted `matterName` would otherwise be an unused-variable warning).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/ScheduleForm.svelte src/lib/automations/ScheduleForm.svelte.test.ts
git commit -m "feat(automations): editable matter in ScheduleForm edit mode"
```

---

### Task 5: `WatchForm` — matter editable in edit mode (KB stays read-only)

**Files:**

- Modify: `src/lib/automations/WatchForm.svelte`
- Test: `src/lib/automations/WatchForm.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/automations/WatchForm.svelte.test.ts`, rename the edit-mode test and update its matter assertions. Replace:

```ts
  it('edit mode: KB + matter read-only, source/cost editable, "Save changes" label', () => {
```

with:

```ts
  it('edit mode: KB read-only, matter + source/cost editable, "Save changes" label', () => {
```

and replace the line:

```ts
expect(screen.getByText(/set at creation/i)).toBeInTheDocument(); // matter read-only
```

with:

```ts
// Matter is editable in edit mode (fc832ca); seeded selection shows on the trigger.
expect(screen.getByRole('button', { name: /choose matter/i })).toBeInTheDocument();
expect(screen.queryByText(/set at creation/i)).toBeNull();
expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('m1'); // seeded matter emitted
```

Then add a new test to the describe block:

```ts
it('edit mode emits an empty project_id when the seeded matter is cleared', async () => {
	const { container } = render(WatchForm, {
		props: {
			...base,
			initial: {
				playbook_id: 'p1',
				skill_ref: null,
				knowledge_base_id: 'kb1',
				project_id: 'm1',
				max_cost_usd: null,
				enabled: true
			}
		}
	});
	await fireEvent.click(screen.getByRole('button', { name: /choose matter/i }));
	await fireEvent.click(screen.getByRole('button', { name: /no matter/i }));
	expect((container.querySelector('input[name="project_id"]') as HTMLInputElement).value).toBe('');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/automations/WatchForm.svelte.test.ts
```

Expected: both edit-mode tests FAIL (matter currently read-only in edit mode).

- [ ] **Step 3: Implement**

In `src/lib/automations/WatchForm.svelte`:

1. Delete the `matterName` derived (line 47) — only used by the read-only branch.
2. Replace the comment above `editing` (lines 49-51) with:

```ts
// A watch's KB is fixed at creation (immutable upstream) → read-only in edit mode.
// Matter IS editable (fc832ca): edit mode always emits project_id (empty = cleared)
// so the update action can send an explicit null (unassign) vs omit (create mode).
const editing = $derived(initial !== null);
```

3. Replace the matter section (lines 99-106):

```svelte
<div>
	<div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
	<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
</div>
```

4. Replace the `project_id` hidden-field line (line 128):

```svelte
{#if projectId}<input type="hidden" name="project_id" value={projectId} />{:else if editing}<input
		type="hidden"
		name="project_id"
		value=""
	/>{/if}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/automations/WatchForm.svelte.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/WatchForm.svelte src/lib/automations/WatchForm.svelte.test.ts
git commit -m "feat(automations): editable matter in WatchForm edit mode (KB stays read-only)"
```

---

### Task 6: `errorDetail` helper + schedules `?/update` 404 disambiguation

**Files:**

- Modify: `src/lib/server/loadJson.ts` (add `errorDetail`)
- Modify: `src/routes/(app)/automations/schedules/[id]/+page.server.ts` (404 branch)
- Test: `src/routes/(app)/automations/schedules/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/routes/(app)/automations/schedules/[id]/page.server.test.ts`, add to the `describe('/automations/schedules/[id] update')` block:

```ts
it('maps a project-ownership 404 to a matter-specific error', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ detail: 'project not found' }), { status: 404 })
	);
	const out = await actions.update(
		ev('s1', {
			source_mode: 'playbook',
			playbook_id: 'p1',
			cron_expr: '0 9 * * *',
			project_id: 'm-stale'
		})
	);
	expect(out).toMatchObject({ status: 404, data: { field: 'matter' } });
	expect((out as { data: { error: string } }).data.error).toMatch(/matter was not found/i);
});
it('keeps the generic message for a schedule-not-found 404', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ detail: 'schedule not found' }), { status: 404 })
	);
	const out = await actions.update(
		ev('missing', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *' })
	);
	expect(out).toMatchObject({ status: 404, data: { error: 'Schedule not found.' } });
});
it('keeps the generic message for a non-JSON 404 body', async () => {
	lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
	const out = await actions.update(
		ev('s1', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *' })
	);
	expect(out).toMatchObject({ status: 404, data: { error: 'Schedule not found.' } });
});
```

- [ ] **Step 2: Run tests to verify the first fails**

```bash
npx vitest run "src/routes/(app)/automations/schedules/[id]/page.server.test.ts"
```

Expected: `maps a project-ownership 404` FAILS (today every 404 → "Schedule not found."); the other two PASS already (regression guards for the new branch).

- [ ] **Step 3: Implement the helper**

In `src/lib/server/loadJson.ts`, append:

```ts
/** The `detail` string from an error-response body, or '' when the body is not
 *  JSON / has no string detail. Lets actions branch on backend 404 causes
 *  (e.g. "project not found" vs "schedule not found") without trusting the body. */
export async function errorDetail(res: Response): Promise<string> {
	try {
		const j = (await res.json()) as { detail?: unknown };
		return typeof j.detail === 'string' ? j.detail : '';
	} catch {
		return '';
	}
}
```

- [ ] **Step 4: Use it in the schedules update action**

In `src/routes/(app)/automations/schedules/[id]/+page.server.ts`:

Extend the import:

```ts
import { jsonOr, errorDetail } from '$lib/server/loadJson';
```

Replace the line `if (res.status === 404) return fail(404, { error: 'Schedule not found.' });` with:

```ts
if (res.status === 404) {
	// fc832ca: PATCH also 404s on an unowned/missing project_id ("project not found").
	if ((await errorDetail(res)).includes('project'))
		return fail(404, {
			error: 'That matter was not found — it may have been deleted or belong to another account.',
			field: 'matter'
		});
	return fail(404, { error: 'Schedule not found.' });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run "src/routes/(app)/automations/schedules/[id]/page.server.test.ts"
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/loadJson.ts "src/routes/(app)/automations/schedules/[id]/+page.server.ts" "src/routes/(app)/automations/schedules/[id]/page.server.test.ts"
git commit -m "feat(automations): map project-ownership 404 to matter error on schedule update"
```

---

### Task 7: Watches `?/update` 404 disambiguation

**Files:**

- Modify: `src/routes/(app)/automations/watches/[id]/+page.server.ts` (404 branch)
- Test: `src/routes/(app)/automations/watches/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/routes/(app)/automations/watches/[id]/page.server.test.ts`, add to the `describe('/automations/watches/[id] update')` block (note: the existing `'maps a 404 to not-found'` test posts a non-JSON body `'gone'` — it stays green and doubles as the non-JSON guard):

```ts
it('maps a project-ownership 404 to a matter-specific error', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ detail: 'project not found' }), { status: 404 })
	);
	const out = await actions.update(
		ev('w1', { source_mode: 'playbook', playbook_id: 'p1', project_id: 'm-stale' })
	);
	expect(out).toMatchObject({ status: 404, data: { field: 'matter' } });
	expect((out as { data: { error: string } }).data.error).toMatch(/matter was not found/i);
});
it('keeps the generic message for a watch-not-found 404', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ detail: 'watch not found' }), { status: 404 })
	);
	const out = await actions.update(ev('missing', { source_mode: 'playbook', playbook_id: 'p1' }));
	expect(out).toMatchObject({ status: 404, data: { error: 'Watch not found.' } });
});
```

- [ ] **Step 2: Run tests to verify the first fails**

```bash
npx vitest run "src/routes/(app)/automations/watches/[id]/page.server.test.ts"
```

Expected: `maps a project-ownership 404` FAILS; `watch-not-found` PASSES already (regression guard).

- [ ] **Step 3: Implement**

In `src/routes/(app)/automations/watches/[id]/+page.server.ts`:

Extend the import:

```ts
import { jsonOr, errorDetail } from '$lib/server/loadJson';
```

Replace the line `if (res.status === 404) return fail(404, { error: 'Watch not found.' });` with:

```ts
if (res.status === 404) {
	// fc832ca: PATCH also 404s on an unowned/missing project_id ("project not found").
	if ((await errorDetail(res)).includes('project'))
		return fail(404, {
			error: 'That matter was not found — it may have been deleted or belong to another account.',
			field: 'matter'
		});
	return fail(404, { error: 'Watch not found.' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "src/routes/(app)/automations/watches/[id]/page.server.test.ts"
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/automations/watches/[id]/+page.server.ts" "src/routes/(app)/automations/watches/[id]/page.server.test.ts"
git commit -m "feat(automations): map project-ownership 404 to matter error on watch update"
```

---

### Task 8: Full-suite verification + lint baseline

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

```bash
npx vitest run --silent 2>&1 | tail -5
```

Expected: all green (~1100 + the new cases), 0 failures.

- [ ] **Step 2: svelte-check**

```bash
npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Lint — no NEW errors**

```bash
npx eslint . 2>&1 | tail -3
```

Expected: the pre-existing baseline (~53 errors) — compare against `main` if unsure:

```bash
npx eslint src/lib/automations/ "src/routes/(app)/automations/" src/lib/server/loadJson.ts
```

Expected: no errors in the files this branch touched.

- [ ] **Step 4: Report**

No commit. Report results; manual dev-stack verification (rebuild `donna-web`, edit a schedule's matter → reassign + unassign, same for a watch) happens at review time per [[donna-dev-stack]]: `docker compose up -d --build donna-web`, app at http://localhost:13002.
