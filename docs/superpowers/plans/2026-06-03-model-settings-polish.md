# Model-settings polish (slice 3) — Spec + Plan

> Streamlined loop for three small, pre-approved banked cleanups to the model/inference settings surface (shipped in #51). Inline TDD execution. Frontend/test/docs only — no backend/vendor change.

**Goal:** Three independent polish fixes: (1) an honest disabled placeholder `<option>` when a category's backing model isn't among the available targets; (2) document `OLLAMA_BASE_URL` in `.env.example`; (3) two `fail(400)` tests for the `?/reassign` action.

**Gate:** `npm run check` = 0/0, `npx eslint` no new errors, `npx vitest run` green.

---

### Task 1: Stale-backing disabled placeholder `<option>`

**Problem:** `src/lib/inference/CategoryRow.svelte:34-51` renders `<select value={category.currentTargetId ?? ''}>` whose only options are the cloud/local `targets`. When `currentTargetId` is null **or** not among `targets` (a stale/removed backing), the value matches no option and the browser silently shows the **first** option as selected — misrepresenting the real backing.

**Fix:** Render a leading, `disabled` placeholder `<option>` whose value equals `category.currentTargetId ?? ''` whenever the current backing isn't a known target, so the select honestly reflects the stale/empty state. Admins can still pick a real target to fix it.

**Files:**

- Modify: `src/lib/inference/CategoryRow.svelte`
- Test: `src/lib/inference/CategoryRow.svelte.test.ts`

- [ ] **Step 1 (test, fails):** add a case to `CategoryRow.svelte.test.ts`:

```ts
it('admin: shows a disabled placeholder when the backing is not among the targets (stale)', () => {
	const stale: CategoryView = {
		name: 'smart',
		backingLabel: 'Retired Model',
		currentTargetId: 'gone-prod/retired-1',
		tier: 4,
		group: 'cloud'
	};
	render(CategoryRow, { props: { category: stale, targets, isAdmin: true } as never });
	const select = screen.getByRole('combobox', { name: /model for smart/i }) as HTMLSelectElement;
	// The select honestly reflects the stale backing rather than silently selecting the first real option.
	expect(select.value).toBe('gone-prod/retired-1');
	const placeholder = screen.getByRole('option', {
		name: /Retired Model \(unavailable\)/i
	}) as HTMLOptionElement;
	expect(placeholder.disabled).toBe(true);
});
```

Run: `npx vitest run src/lib/inference/CategoryRow.svelte.test.ts` → expect FAIL (no such option; `select.value` falls back to first target).

- [ ] **Step 2 (implement):** in `CategoryRow.svelte`, add a derived `knownTarget` and the placeholder option. After the existing `const local = …` line:

```svelte
const knownTarget = $derived( category.currentTargetId != null && category.currentTargetId !== '' &&
targets.some((t) => t.id === category.currentTargetId) );
```

Then inside `<select …>`, immediately before the `{#if cloud.length}` block:

```svelte
{#if !knownTarget}
	<option value={category.currentTargetId ?? ''} disabled>
		{category.currentTargetId
			? `${category.backingLabel || category.currentTargetId} (unavailable)`
			: 'Select a model…'}
	</option>
{/if}
```

- [ ] **Step 3:** `npx vitest run src/lib/inference/CategoryRow.svelte.test.ts` → PASS (new + 2 existing). The first existing test still asserts `select.value === 'anthropic-prod/claude-opus-4-7'` (a known target → no placeholder), confirming no regression.
- [ ] **Step 4:** `npm run check` (0/0) and `npx eslint src/lib/inference/CategoryRow.svelte` (clean).
- [ ] **Step 5:** Commit: `git add src/lib/inference/CategoryRow.svelte src/lib/inference/CategoryRow.svelte.test.ts && git commit -m "fix(settings): show a disabled placeholder for stale category backings"`.

---

### Task 2: Document `OLLAMA_BASE_URL` in `.env.example`

**Why:** The default `http://ollama:11434` points at a non-existent container, so local models never appear in `/settings/models`. The working value for Ollama-on-host is `http://host.docker.internal:11434` — currently only set in the gitignored `.env`, undocumented for new clones.

**Files:** Modify `.env.example`.

- [ ] **Step 1:** After the "Optional cloud provider keys" block (`.env.example:36-37`), insert:

```
# Local models via Ollama running on the host (so /settings/models can list them).
# Default http://ollama:11434 targets a non-existent container; point at the host instead:
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

- [ ] **Step 2:** Commit: `git add .env.example && git commit -m "docs(env): document OLLAMA_BASE_URL for host Ollama local models"`.

---

### Task 3: Two `fail(400)` tests for `?/reassign`

The action (`src/routes/(app)/settings/models/+page.server.ts:41,47`) returns `fail(400, …)` for (a) missing `name`/`target_id`, and (b) an unknown `target_id`. Neither path is currently tested.

**Files:** Test `src/routes/(app)/settings/models/page.server.test.ts`.

- [ ] **Step 1:** Add two cases to the `describe('/settings/models ?/reassign', …)` block (the `form()`, `lqFetch`, `modelsBody`, `actions` helpers already exist in the file):

```ts
it('fails 400 when required fields are missing (no fetch)', async () => {
	const res = (await actions.reassign(form({}))) as { status: number; data: { message: string } };
	expect(res.status).toBe(400);
	expect(res.data.message).toMatch(/missing/i);
	expect(lqFetch).not.toHaveBeenCalled();
});

it('fails 400 when the target_id is not an available model', async () => {
	lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
	const res = (await actions.reassign(form({ name: 'smart', target_id: 'nope/not-real' }))) as {
		status: number;
		data: { message: string };
	};
	expect(res.status).toBe(400);
	expect(res.data.message).toMatch(/unknown model/i);
	expect(lqFetch).toHaveBeenCalledTimes(1); // only the models lookup; no alias GET/PATCH
});
```

- [ ] **Step 2:** `npx vitest run "src/routes/(app)/settings/models/page.server.test.ts"` → PASS (existing 6 + 2 new).
- [ ] **Step 3:** `npm run check` (0/0).
- [ ] **Step 4:** Commit: `git add "src/routes/(app)/settings/models/page.server.test.ts" && git commit -m "test(settings): cover ?/reassign 400s — missing fields and unknown model"`.

---

## Notes

- All three are independent; order doesn't matter. No backend/vendor change.
- After all tasks: full `npx vitest run` green, whole-branch review, then `finishing-a-development-branch` → PR.
