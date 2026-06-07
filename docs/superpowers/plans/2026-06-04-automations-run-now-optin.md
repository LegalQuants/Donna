# Automations — Run-now + Opt-in (Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt into autonomous automations and launch a one-off ("manual") autonomous session — pick a playbook or skill to run over a knowledge base — then land on its live receipt (the A+B viewer).

**Architecture:** A per-user `autonomous_enabled` opt-in (canonical toggle on `/settings/preferences` + an inline `AutomationsGate` in the Automations area, both via `PATCH /users/me/preferences`), and a run-now form at `/automations/new` (SSR `load` of libraries; a SvelteKit form action `?/run` that `POST`s `/api/v1/autonomous/run-now` and redirects to `/automations/{id}`). Reuses Donna's `lqFetch` SSR pattern, `KbPicker`/`MatterPicker`, and the existing preferences machinery.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Vitest 4, `@testing-library/svelte`, Tailwind `mlq-*` tokens. Backend at pin `541bd6f` (no bump).

**Spec:** `docs/superpowers/specs/2026-06-04-automations-run-now-optin-design.md`

---

## Conventions (read once)

- **Gate:** `npm run check` = **0 errors / 0 warnings** (a vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless). `npx vitest run` green. **No new eslint errors** (~53 pre-exist on `main`).
- **Internal `<a href>`** carry `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on the line directly above the `href=` line (keep `href` on the `<a` line).
- **Test file names drop the `+`:** `page.server.test.ts`, `page.svelte.test.ts`, `server.test.ts`.
- **Server/load/action/proxy tests** use `// @vitest-environment node` and mock `$lib/server/lqClient`.
- **Component tests** use `@testing-library/svelte`.
- **Commit after every task.** Imperative subject + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Everything new lives under `src/lib/automations/` and `src/routes/(app)/automations/new/`.

## File Structure

**Library:**

- `src/lib/automations/optin.server.ts` — `isAutonomousEnabled(event)` over `GET /users/me/preferences` (best-effort `false`).
- `src/lib/automations/runNow.ts` — `SourceMode`, `SourceItem`, `toPlaybookItems`, `toSkillItems`.
- `src/lib/automations/SourcePicker.svelte` — searchable list over `SourceItem[]`.
- `src/lib/automations/AutomationsGate.svelte` — the opt-in prompt (shared).
- `src/lib/automations/RunNowForm.svelte` — source toggle + pickers + cost cap + hidden inputs + submit.

**Routes:**

- `src/routes/(app)/automations/new/{+page.server.ts,+page.svelte}` — run-now load + `?/run` action + gate-or-form.

**Modified:**

- `src/routes/(app)/settings/preferences/{+server.ts,+page.server.ts,+page.svelte,page.svelte.test.ts,server.test.ts}` — opt-in toggle.
- `src/routes/(app)/automations/{+page.server.ts,+page.svelte,page.server.test.ts,page.svelte.test.ts}` — "Run now" button / gate.

---

## Task 0: Spike — confirm `skill_ref` + run-now playbook ownership (manual; gating)

Resolves the two open contract questions before the source list is built. Dev stack must be up (`arq-worker` runs the autonomous job).

- [ ] **Step 1: Auth + opt-in (admin fixture)**

```bash
cd /Users/kevinkeller/Code/Donna; set -a; . ./.env; set +a
TOKEN=$(curl -s -X POST localhost:18000/api/v1/auth/login -H 'content-type: application/json' -d "{\"email\":\"admin@lq.ai\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -X PATCH localhost:18000/api/v1/users/me/preferences -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"autonomous_enabled":true}' >/dev/null
```

- [ ] **Step 2: List a skill + a KB to use**

```bash
echo "skills:"; curl -s "localhost:18000/api/v1/skills?scope=builtin" -H "authorization: Bearer $TOKEN" | python3 -c 'import sys,json;[print(s.get("name"),"|",s.get("title")) for s in json.load(sys.stdin)[:5]]'
echo "kbs:"; curl -s localhost:18000/api/v1/knowledge-bases -H "authorization: Bearer $TOKEN" | python3 -c 'import sys,json
d=json.load(sys.stdin); items=d if isinstance(d,list) else d.get("knowledge_bases",d)
[print(k.get("id"),"|",k.get("name")) for k in (items or [])[:5]]'
```

Note a built-in skill `name` (e.g. `comms-improver`) and a KB id.

- [ ] **Step 3: Spawn a SKILL run-now → confirm `skill_ref` = the skill `name`/slug**

```bash
curl -s -o /tmp/skillrun.json -w 'HTTP %{http_code}\n' -X POST localhost:18000/api/v1/autonomous/run-now \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"skill_ref":"<SKILL_NAME>","target_kb_id":"<KB_ID>","max_cost_usd":"1.00"}'
python3 -m json.tool /tmp/skillrun.json
```

Expected: **201** with `trigger_kind:"manual"`. **Record:** whether `skill_ref` is the built-in `name`, the user-skill `slug`, or both. (If 422 "skill not found", try the user-skill `slug` form.)

- [ ] **Step 4: Probe run-now playbook ownership (non-admin question)**

The dev fixture is admin, so a built-in `playbook_id` run will succeed regardless. Inspect the executor to decide the **non-admin** behavior:

```bash
grep -niE "is_admin|created_by|owner|permission|403|forbidden" vendor/lq-ai/api/app/autonomous/nodes.py vendor/lq-ai/api/app/autonomous/executor.py 2>/dev/null | grep -iE "playbook|admin|owner|created_by" | head
```

**Decide:** if `run_playbook` enforces admin-or-owner on built-ins, the playbook source list should be limited to **owned** playbooks for non-admins (mirror playbooks-slice-B gating); otherwise list all. Record the decision — it adjusts Task 6's `load` (whether to filter the playbook list by `created_by === locals.user.id` for non-admins).

- [ ] **Step 5: Record findings**

Append a short note to the spec or this plan: the confirmed `skill_ref` field, and the playbook-ownership decision. No code commit needed (findings only); proceed to Task 1.

> If a skill run won't spawn at all (persistent 422), STOP and report — the source toggle's skill mode depends on a working `skill_ref`.

---

## Task 1: Opt-in source helper

**Files:**

- Create: `src/lib/automations/optin.server.ts`
- Test: `src/lib/automations/optin.server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/optin.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { isAutonomousEnabled } from './optin.server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('isAutonomousEnabled', () => {
	it('reads autonomous_enabled from GET /users/me/preferences', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		);
		expect(await isAutonomousEnabled(ev())).toBe(true);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
	});
	it('returns false when the field is missing or the call fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
		expect(await isAutonomousEnabled(ev())).toBe(false);
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		expect(await isAutonomousEnabled(ev())).toBe(false);
		lqFetch.mockRejectedValueOnce(new Error('network'));
		expect(await isAutonomousEnabled(ev())).toBe(false);
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/automations/optin.server.test.ts`

- [ ] **Step 3: Implement `src/lib/automations/optin.server.ts`**

```ts
import type { RequestEvent } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

/** Whether the user has opted into autonomous automations (`autonomous_enabled`).
 *  Not on the `User` object (`GET /users/me`) — only on the preferences endpoint.
 *  Best-effort: never throws; returns false on any failure (→ shows the opt-in gate). */
export async function isAutonomousEnabled(event: RequestEvent): Promise<boolean> {
	try {
		const res = await lqFetch(event, '/api/v1/users/me/preferences');
		if (!res.ok) return false;
		const body = (await res.json()) as { autonomous_enabled?: unknown };
		return body.autonomous_enabled === true;
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/automations/optin.server.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/optin.server.ts src/lib/automations/optin.server.test.ts
git commit -m "feat(automations): isAutonomousEnabled opt-in helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Source normalization helpers

**Files:**

- Create: `src/lib/automations/runNow.ts`
- Test: `src/lib/automations/runNow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/runNow.test.ts
import { describe, it, expect } from 'vitest';
import { toPlaybookItems, toSkillItems } from './runNow';

describe('toPlaybookItems', () => {
	it('maps playbooks to {value:id,label:name,sub:contract_type}', () => {
		const items = toPlaybookItems([{ id: 'p1', name: 'NDA — Mutual', contract_type: 'NDA' }]);
		expect(items).toEqual([{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }]);
	});
	it('returns [] for a non-array', () => {
		expect(toPlaybookItems(null as never)).toEqual([]);
	});
});

describe('toSkillItems', () => {
	it('merges user skills (slug) and built-ins (name) into source items', () => {
		const items = toSkillItems(
			[{ slug: 'my-skill', display_name: 'My Skill', description: 'mine' }],
			[{ name: 'comms-improver', title: 'Comms Improver', description: 'builtin' }]
		);
		expect(items).toEqual([
			{ value: 'my-skill', label: 'My Skill', sub: 'mine' },
			{ value: 'comms-improver', label: 'Comms Improver', sub: 'builtin' }
		]);
	});
	it('tolerates missing arrays', () => {
		expect(toSkillItems(undefined as never, undefined as never)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/automations/runNow.test.ts`

- [ ] **Step 3: Implement `src/lib/automations/runNow.ts`**

```ts
export type SourceMode = 'playbook' | 'skill';

/** One selectable run-now source (a playbook or a skill). */
export interface SourceItem {
	value: string; // playbook id, or skill slug/name (the run-now playbook_id | skill_ref)
	label: string;
	sub?: string;
}

interface PlaybookLike {
	id: string;
	name: string;
	contract_type?: string;
}
interface UserSkillLike {
	slug: string;
	display_name: string;
	description?: string;
}
interface BuiltinSkillLike {
	name: string;
	title: string;
	description?: string;
}

export function toPlaybookItems(playbooks: PlaybookLike[]): SourceItem[] {
	if (!Array.isArray(playbooks)) return [];
	return playbooks.map((p) => ({ value: p.id, label: p.name, sub: p.contract_type }));
}

export function toSkillItems(
	userSkills: UserSkillLike[],
	builtins: BuiltinSkillLike[]
): SourceItem[] {
	const u = Array.isArray(userSkills) ? userSkills : [];
	const b = Array.isArray(builtins) ? builtins : [];
	return [
		...u.map((s) => ({ value: s.slug, label: s.display_name, sub: s.description })),
		...b.map((s) => ({ value: s.name, label: s.title, sub: s.description }))
	];
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/automations/runNow.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/runNow.ts src/lib/automations/runNow.test.ts
git commit -m "feat(automations): normalize playbooks/skills into run-now source items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Preferences opt-in toggle

**Files:**

- Modify: `src/routes/(app)/settings/preferences/+server.ts`
- Modify: `src/routes/(app)/settings/preferences/+page.server.ts`
- Modify: `src/routes/(app)/settings/preferences/+page.svelte`
- Modify: `src/routes/(app)/settings/preferences/server.test.ts`
- Modify: `src/routes/(app)/settings/preferences/page.svelte.test.ts`

- [ ] **Step 1: Read the three current files** so you preserve existing behavior:
      `src/routes/(app)/settings/preferences/+server.ts`, `+page.server.ts`, `+page.svelte`, and the two test files.

- [ ] **Step 2: Allow `autonomous_enabled` in the BFF** — in `+server.ts`, change the `ALLOWED` set:

```ts
const ALLOWED = new Set(['trust_pills', 'provenance_pills', 'autonomous_enabled']);
```

- [ ] **Step 3: Add a server test for the new allowed field** — in `server.test.ts`, ADD (inside the existing describe):

```ts
it('forwards autonomous_enabled to the backend', async () => {
	lqFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
	);
	const ev = {
		request: new Request('http://x', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ autonomous_enabled: true })
		})
	} as never;
	const res = await PATCH(ev);
	expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
	expect((await res.json()).autonomous_enabled).toBe(true);
});
```

(If the existing test file imports `PATCH`/mocks `lqFetch`, reuse them; match the existing test's event-construction style if it differs.)

- [ ] **Step 4: Load `autonomousEnabled`** — replace `+page.server.ts` with:

```ts
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	provenancePills: event.locals.user?.provenance_pills ?? 'always',
	trustPills: event.locals.user?.trust_pills ?? 'labels',
	autonomousEnabled: await isAutonomousEnabled(event)
});
```

- [ ] **Step 5: Add the toggle section** — in `+page.svelte`:
  - widen the `save` signature to accept the new field + a boolean value:
    `async function save(field: 'trust_pills' | 'provenance_pills' | 'autonomous_enabled', value: string | boolean, revert: () => void)` (body unchanged — `JSON.stringify({ [field]: value })` already handles booleans).
  - add state + handler after the existing ones:
    ```ts
    let autonomousEnabled = $state<boolean>(untrack(() => data.autonomousEnabled));
    function onAutonomous() {
    	const prev = autonomousEnabled;
    	autonomousEnabled = !prev;
    	save('autonomous_enabled', autonomousEnabled, () => (autonomousEnabled = prev));
    }
    ```
  - add this section after the "Message details" section (before the "Changes save automatically." line):
    ```svelte
    <section class="mt-4 rounded-mlq-control border border-mlq-subtle p-4">
    	<div class="flex items-start justify-between gap-4">
    		<div>
    			<div class="text-sm font-medium text-mlq-text">Automations</div>
    			<div class="mt-0.5 text-xs text-mlq-muted">
    				Let Donna run skills &amp; playbooks on its own — on demand, on a schedule, or when
    				documents arrive. You control cost and can halt anytime.
    			</div>
    		</div>
    		<button
    			type="button"
    			role="switch"
    			aria-checked={autonomousEnabled}
    			aria-label="Enable automations"
    			onclick={onAutonomous}
    			class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none {autonomousEnabled
    				? 'bg-mlq-workflow'
    				: 'bg-mlq-subtle'}"
    		>
    			<span
    				class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform {autonomousEnabled
    					? 'translate-x-5'
    					: 'translate-x-0.5'}"
    			></span>
    		</button>
    	</div>
    </section>
    ```

- [ ] **Step 6: Update the page test** — in `page.svelte.test.ts`, ensure rendered `data` includes `autonomousEnabled` and ADD a toggle test:

```ts
it('renders the Automations opt-in switch reflecting the loaded value', () => {
	render(Page, {
		props: {
			data: { trustPills: 'labels', provenancePills: 'always', autonomousEnabled: true }
		} as never
	});
	const sw = screen.getByRole('switch', { name: /enable automations/i });
	expect(sw).toHaveAttribute('aria-checked', 'true');
});
```

(Update any existing render calls in this file that pass `data` to also include `autonomousEnabled: false` so they keep compiling.)

- [ ] **Step 7: Run + gate**

Run: `npx vitest run "src/routes/(app)/settings/preferences" && npm run check && npx eslint "src/routes/(app)/settings/preferences/**"`
Expected: tests pass; check 0/0; no new eslint errors.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(app)/settings/preferences/+server.ts" "src/routes/(app)/settings/preferences/+page.server.ts" "src/routes/(app)/settings/preferences/+page.svelte" "src/routes/(app)/settings/preferences/server.test.ts" "src/routes/(app)/settings/preferences/page.svelte.test.ts"
git commit -m "feat(automations): autonomous_enabled opt-in toggle on settings/preferences

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: AutomationsGate component

**Files:**

- Create: `src/lib/automations/AutomationsGate.svelte`
- Test: `src/lib/automations/AutomationsGate.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/AutomationsGate.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import AutomationsGate from './AutomationsGate.svelte';

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{}', { status: 200 }))
	);
});
afterEach(() => vi.restoreAllMocks());

describe('AutomationsGate', () => {
	it('shows the opt-in copy and an enable button', () => {
		render(AutomationsGate);
		expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /enable automations/i })).toBeInTheDocument();
	});
	it('PATCHes the preference on enable', async () => {
		render(AutomationsGate);
		await fireEvent.click(screen.getByRole('button', { name: /enable automations/i }));
		const [url, init] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
		expect(url).toBe('/settings/preferences');
		expect((init as RequestInit).method).toBe('PATCH');
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ autonomous_enabled: true });
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/automations/AutomationsGate.svelte.test.ts`

- [ ] **Step 3: Implement `src/lib/automations/AutomationsGate.svelte`**

```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function enable() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const res = await fetch('/settings/preferences', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ autonomous_enabled: true })
			});
			if (!res.ok) {
				error = "Couldn't enable — try again.";
				return;
			}
			await invalidateAll();
		} catch {
			error = "Couldn't enable — try again.";
		} finally {
			busy = false;
		}
	}
</script>

<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-5">
	<div class="text-sm font-medium text-mlq-text">Automations are off</div>
	<p class="mt-1 text-xs text-mlq-muted">
		Let Donna run skills &amp; playbooks on its own. You control cost and can halt a run anytime.
	</p>
	{#if error}<p role="status" aria-live="polite" class="mt-2 text-xs text-mlq-error">
			{error}
		</p>{/if}
	<button
		type="button"
		onclick={enable}
		disabled={busy}
		class="mt-3 rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none disabled:opacity-60"
		>{busy ? 'Enabling…' : 'Enable automations'}</button
	>
</div>
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/automations/AutomationsGate.svelte.test.ts`

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npx eslint src/lib/automations/AutomationsGate.svelte
git add src/lib/automations/AutomationsGate.svelte src/lib/automations/AutomationsGate.svelte.test.ts
git commit -m "feat(automations): AutomationsGate opt-in prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire "Run now" + gate into the Sessions list

**Files:**

- Modify: `src/routes/(app)/automations/+page.server.ts`
- Modify: `src/routes/(app)/automations/+page.svelte`
- Modify: `src/routes/(app)/automations/page.server.test.ts`
- Modify: `src/routes/(app)/automations/page.svelte.test.ts`

- [ ] **Step 1: Read** the current `automations/+page.server.ts` and `+page.svelte` (from slice A+B) so you extend, not replace, their behavior.

- [ ] **Step 2: Add `autonomousEnabled` to the load** — edit `+page.server.ts`'s `Promise.all` to also resolve the opt-in:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseSessionList } from '$lib/automations/types';
import { unreadCount } from '$lib/automations/unread.server';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const [res, unread, autonomousEnabled] = await Promise.all([
		lqFetch(event, '/api/v1/autonomous/sessions'),
		unreadCount(event),
		isAutonomousEnabled(event)
	]);
	if (!res.ok) throw error(502, 'Could not load automations.');
	const sessions = parseSessionList(await res.json());
	return { sessions, unread, autonomousEnabled };
};
```

- [ ] **Step 3: Update the load test** — in `page.server.test.ts`, the success test now makes a 3rd lqFetch (preferences). Add a third `mockResolvedValueOnce` and assert `autonomousEnabled`:

```ts
lqFetch
	.mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				sessions: [
					{
						id: 's1',
						status: 'completed',
						trigger_kind: 'schedule',
						current_phase: 'delivery',
						cost_total_usd: '0.42',
						created_at: 'x'
					}
				],
				total_count: 1,
				limit: 50,
				offset: 0
			}),
			{ status: 200 }
		)
	)
	.mockResolvedValueOnce(
		new Response(JSON.stringify({ notifications: [], total_count: 2, limit: 1, offset: 0 }), {
			status: 200
		})
	)
	.mockResolvedValueOnce(
		new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
	);
const out = (await load(ev())) as {
	sessions: { id: string }[];
	unread: number;
	autonomousEnabled: boolean;
};
expect(out.unread).toBe(2);
expect(out.autonomousEnabled).toBe(true);
```

Leave the 502 test as-is (the sessions fetch rejects first). For the "unread defaults to 0" test, add a 3rd mock (`autonomous_enabled:false`) so the parallel call resolves.

- [ ] **Step 4: Render "Run now" or the gate** — in `+page.svelte`, import the gate and add the control above `SessionList`:

```svelte
import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
```

Then between `<AutomationsNav ... />` and `<SessionList ... />`:

```svelte
{#if data.autonomousEnabled}
	<div class="mb-3">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- run-now entry -->
		<a
			href="/automations/new"
			class="inline-block rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none"
			>Run now</a
		>
	</div>
	<SessionList sessions={data.sessions} />
{:else}
	<AutomationsGate />
	{#if data.sessions.length > 0}<div class="mt-4">
			<SessionList sessions={data.sessions} />
		</div>{/if}
{/if}
```

(Replace the existing bare `<SessionList sessions={data.sessions} />` with the block above.)

- [ ] **Step 5: Update the page test** — `page.svelte.test.ts` renders with `data`; add `autonomousEnabled` and a case for each branch:

```ts
it('shows Run now when opted in', () => {
	render(Page, { props: { data: { sessions: [], unread: 0, autonomousEnabled: true } } as never });
	expect(screen.getByRole('link', { name: 'Run now' })).toHaveAttribute('href', '/automations/new');
});
it('shows the opt-in gate when not opted in', () => {
	render(Page, { props: { data: { sessions: [], unread: 0, autonomousEnabled: false } } as never });
	expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
});
```

(Update the existing empty-state test's `data` to include `autonomousEnabled: true` so it still finds the empty state under the opted-in branch.)

- [ ] **Step 6: Run + gate**

Run: `npx vitest run "src/routes/(app)/automations" && npm run check && npx eslint "src/routes/(app)/automations/+page.svelte"`
Expected: pass; 0/0; no new eslint errors.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/automations/+page.server.ts" "src/routes/(app)/automations/+page.svelte" "src/routes/(app)/automations/page.server.test.ts" "src/routes/(app)/automations/page.svelte.test.ts"
git commit -m "feat(automations): Run now entry + opt-in gate on the sessions list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SourcePicker component

**Files:**

- Create: `src/lib/automations/SourcePicker.svelte`
- Test: `src/lib/automations/SourcePicker.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/SourcePicker.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import SourcePicker from './SourcePicker.svelte';
import type { SourceItem } from './runNow';

const items: SourceItem[] = [
	{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' },
	{ value: 'p2', label: 'DPA — GDPR', sub: 'DPA' }
];

describe('SourcePicker', () => {
	it('lists items and emits the value on select', async () => {
		const onselect = vi.fn();
		render(SourcePicker, {
			props: { items, selectedValue: null, label: 'Choose a playbook', onselect }
		});
		await fireEvent.click(screen.getByRole('button', { name: /DPA — GDPR/ }));
		expect(onselect).toHaveBeenCalledWith('p2');
	});
	it('filters by the search query', async () => {
		render(SourcePicker, {
			props: { items, selectedValue: null, label: 'Choose', onselect: () => {} }
		});
		await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'gdpr' } });
		expect(screen.queryByText('NDA — Mutual')).not.toBeInTheDocument();
		expect(screen.getByText('DPA — GDPR')).toBeInTheDocument();
	});
	it('shows an empty note when there are no items', () => {
		render(SourcePicker, {
			props: {
				items: [],
				selectedValue: null,
				label: 'Choose',
				emptyNote: 'No playbooks yet.',
				onselect: () => {}
			}
		});
		expect(screen.getByText('No playbooks yet.')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/automations/SourcePicker.svelte.test.ts`

- [ ] **Step 3: Implement `src/lib/automations/SourcePicker.svelte`** (modeled on `TableSkillPicker`):

```svelte
<script lang="ts">
	import type { SourceItem } from './runNow';
	let {
		items,
		selectedValue,
		label,
		emptyNote = 'Nothing to choose from yet.',
		onselect
	}: {
		items: SourceItem[];
		selectedValue: string | null;
		label: string;
		emptyNote?: string;
		onselect: (value: string) => void;
	} = $props();

	let q = $state('');
	const filtered = $derived(
		q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : items
	);
</script>

{#if items.length === 0}
	<div
		class="rounded-mlq-control border border-dashed border-mlq-subtle px-3 py-6 text-center text-xs text-mlq-muted"
	>
		{emptyNote}
	</div>
{:else}
	<div class="rounded-mlq-control border border-mlq-subtle">
		<input
			type="text"
			aria-label={label}
			placeholder="Search…"
			bind:value={q}
			class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
		/>
		<ul class="max-h-64 overflow-y-auto">
			{#each filtered as i (i.value)}
				<li>
					<button
						type="button"
						onclick={() => onselect(i.value)}
						class="block w-full px-3 py-2 text-left hover:bg-mlq-subtle/50 {selectedValue ===
						i.value
							? 'bg-mlq-subtle/40'
							: ''}"
					>
						<span class="block truncate text-sm text-mlq-text">{i.label}</span>
						{#if i.sub}<span class="block truncate text-xs text-mlq-muted">{i.sub}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/automations/SourcePicker.svelte.test.ts`

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npx eslint src/lib/automations/SourcePicker.svelte
git add src/lib/automations/SourcePicker.svelte src/lib/automations/SourcePicker.svelte.test.ts
git commit -m "feat(automations): searchable SourcePicker for run-now

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: RunNowForm component

**Files:**

- Create: `src/lib/automations/RunNowForm.svelte`
- Test: `src/lib/automations/RunNowForm.svelte.test.ts`

The form owns the field state, renders the source toggle + pickers + cost cap, and emits hidden inputs the page's `<form action="?/run">` submits. Reuses `KbPicker` (`{kbs,onpick}`) and `MatterPicker` (`{matters, selectedId(bindable), placement}`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/RunNowForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import RunNowForm from './RunNowForm.svelte';
import type { SourceItem } from './runNow';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [
	{ value: 'comms-improver', label: 'Comms Improver', sub: 'builtin' }
];
const kbs = [{ id: 'kb1', name: 'Contracts KB' }] as never;
const matters = [{ id: 'm1', name: 'Acme' }] as never;

function setup() {
	return render(RunNowForm, { props: { playbookItems, skillItems, kbs, matters } });
}

describe('RunNowForm', () => {
	it('disables Run until a source and a KB are chosen', async () => {
		setup();
		const run = screen.getByRole('button', { name: /^run$/i });
		expect(run).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		expect(run).toBeDisabled(); // still needs a KB
		await fireEvent.click(screen.getByRole('button', { name: /Contracts KB/ }));
		expect(run).not.toBeDisabled();
	});
	it('submits playbook_id + target_kb_id via hidden inputs', async () => {
		const { container } = setup();
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Contracts KB/ }));
		expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe(
			'p1'
		);
		expect((container.querySelector('input[name="target_kb_id"]') as HTMLInputElement).value).toBe(
			'kb1'
		);
		expect(container.querySelector('input[name="skill_ref"]')).toBeNull();
	});
	it('switching to Skill mode emits skill_ref instead of playbook_id', async () => {
		const { container } = setup();
		await fireEvent.click(screen.getByRole('radio', { name: /skill/i }));
		await fireEvent.click(screen.getByRole('button', { name: /Comms Improver/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Contracts KB/ }));
		expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe(
			'comms-improver'
		);
		expect(container.querySelector('input[name="playbook_id"]')).toBeNull();
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/automations/RunNowForm.svelte.test.ts`

- [ ] **Step 3: Implement `src/lib/automations/RunNowForm.svelte`**

```svelte
<script lang="ts">
	import type { SourceItem, SourceMode } from './runNow';
	import type { KnowledgeBase } from '$lib/knowledge/types';
	import type { MatterSummary } from '$lib/matters/types';
	import SourcePicker from './SourcePicker.svelte';
	import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';

	let {
		playbookItems,
		skillItems,
		kbs,
		matters
	}: {
		playbookItems: SourceItem[];
		skillItems: SourceItem[];
		kbs: KnowledgeBase[];
		matters: MatterSummary[];
	} = $props();

	let mode = $state<SourceMode>('playbook');
	let sourceValue = $state<string | null>(null);
	let kbId = $state<string | null>(null);
	let projectId = $state<string | null>(null);
	let maxCost = $state('');

	const items = $derived(mode === 'playbook' ? playbookItems : skillItems);
	const kbName = $derived(kbs.find((k) => k.id === kbId)?.name ?? null);
	const canRun = $derived(sourceValue !== null && kbId !== null);

	function setMode(next: SourceMode) {
		if (next === mode) return;
		mode = next;
		sourceValue = null; // a source from the other mode is no longer valid
	}
</script>

<div class="flex flex-col gap-4">
	<fieldset>
		<legend class="mb-1 text-xs font-medium text-mlq-muted">Run a</legend>
		<div
			role="radiogroup"
			aria-label="Source type"
			class="inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1"
		>
			<button
				type="button"
				role="radio"
				aria-checked={mode === 'playbook'}
				onclick={() => setMode('playbook')}
				class="rounded-mlq-control px-3 py-1 text-sm {mode === 'playbook'
					? 'bg-mlq-subtle text-mlq-strong'
					: 'text-mlq-text hover:bg-mlq-subtle/50'}">Playbook</button
			>
			<button
				type="button"
				role="radio"
				aria-checked={mode === 'skill'}
				onclick={() => setMode('skill')}
				class="rounded-mlq-control px-3 py-1 text-sm {mode === 'skill'
					? 'bg-mlq-subtle text-mlq-strong'
					: 'text-mlq-text hover:bg-mlq-subtle/50'}">Skill</button
			>
		</div>
	</fieldset>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">
			{mode === 'playbook' ? 'Playbook' : 'Skill'}
		</div>
		<SourcePicker
			{items}
			selectedValue={sourceValue}
			label={mode === 'playbook' ? 'Choose a playbook' : 'Choose a skill'}
			emptyNote={mode === 'playbook' ? 'No playbooks yet.' : 'No skills yet.'}
			onselect={(v) => (sourceValue = v)}
		/>
	</div>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">
			Target knowledge base <span class="text-mlq-error">*</span>
		</div>
		{#if kbs.length === 0}
			<p class="text-xs text-mlq-muted">
				No knowledge bases yet.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- create a KB first -->
				<a href="/knowledge" class="text-mlq-workflow hover:underline">Create one first.</a>
			</p>
		{:else}
			<KbPicker {kbs} onpick={(id) => (kbId = id)} />
			{#if kbName}<p class="mt-1 text-xs text-mlq-muted">Selected: {kbName}</p>{/if}
		{/if}
	</div>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
		<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
	</div>

	<div>
		<label for="run-cost-cap" class="mb-1 block text-xs font-medium text-mlq-muted"
			>Cost cap (optional, USD)</label
		>
		<input
			id="run-cost-cap"
			type="number"
			min="0"
			step="0.01"
			inputmode="decimal"
			bind:value={maxCost}
			placeholder="e.g. 2.00"
			class="w-32 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow"
		/>
	</div>

	<!-- Hidden fields submitted by the page's <form action="?/run">. Only the active source key is present. -->
	<input type="hidden" name="source_mode" value={mode} />
	{#if mode === 'playbook' && sourceValue}<input
			type="hidden"
			name="playbook_id"
			value={sourceValue}
		/>{/if}
	{#if mode === 'skill' && sourceValue}<input
			type="hidden"
			name="skill_ref"
			value={sourceValue}
		/>{/if}
	{#if kbId}<input type="hidden" name="target_kb_id" value={kbId} />{/if}
	{#if projectId}<input type="hidden" name="project_id" value={projectId} />{/if}
	{#if maxCost.trim()}<input type="hidden" name="max_cost_usd" value={maxCost.trim()} />{/if}

	<div>
		<button
			type="submit"
			disabled={!canRun}
			class="rounded-mlq-control bg-mlq-workflow px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none disabled:opacity-60"
			>Run</button
		>
	</div>
</div>
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/automations/RunNowForm.svelte.test.ts`

- [ ] **Step 5: Gate + commit**

```bash
npm run check && npx eslint src/lib/automations/RunNowForm.svelte
git add src/lib/automations/RunNowForm.svelte src/lib/automations/RunNowForm.svelte.test.ts
git commit -m "feat(automations): RunNowForm — source toggle, KB/matter pickers, cost cap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Run-now route — load + `?/run` action + page

**Files:**

- Create: `src/routes/(app)/automations/new/+page.server.ts`
- Create: `src/routes/(app)/automations/new/+page.svelte`
- Test: `src/routes/(app)/automations/new/page.server.test.ts`
- Test: `src/routes/(app)/automations/new/page.svelte.test.ts`

- [ ] **Step 1: Write the failing load+action test `page.server.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const formEvent = (fields: Record<string, string>) =>
	({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;

describe('/automations/new load', () => {
	it('loads libraries + opt-in', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'p1', name: 'NDA', contract_type: 'NDA' }]), {
					status: 200
				})
			) // playbooks
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ slug: 'mine', display_name: 'Mine', description: '' }]), {
					status: 200
				})
			) // user-skills
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ name: 'comms', title: 'Comms' }]), { status: 200 })
			) // builtins
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ knowledge_bases: [{ id: 'kb1', name: 'KB' }] }), {
					status: 200
				})
			) // kbs
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			); // matters
		const out = (await load({} as never)) as {
			autonomousEnabled: boolean;
			playbookItems: unknown[];
			skillItems: unknown[];
			kbs: unknown[];
			matters: unknown[];
		};
		expect(out.autonomousEnabled).toBe(true);
		expect(out.playbookItems).toHaveLength(1);
		expect(out.skillItems).toHaveLength(2);
		expect(out.kbs).toHaveLength(1);
		expect(out.matters).toHaveLength(1);
	});
});

describe('/automations/new run action', () => {
	it('POSTs run-now and redirects to the new session receipt', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sess-9' }), { status: 201 }));
		await expect(
			actions.run(
				formEvent({
					source_mode: 'playbook',
					playbook_id: 'p1',
					target_kb_id: 'kb1',
					max_cost_usd: '2.00'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/automations/sess-9' });
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/run-now');
		expect(body).toEqual({ playbook_id: 'p1', target_kb_id: 'kb1', max_cost_usd: '2.00' });
	});
	it('sends skill_ref when source_mode=skill', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's2' }), { status: 201 }));
		await expect(
			actions.run(formEvent({ source_mode: 'skill', skill_ref: 'comms', target_kb_id: 'kb1' }))
		).rejects.toMatchObject({ status: 303 });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			skill_ref: 'comms',
			target_kb_id: 'kb1'
		});
	});
	it('fails 400 when neither source nor KB is present', async () => {
		const out = await actions.run(formEvent({ source_mode: 'playbook' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('redirects to /automations on a 403 (not opted in)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
		await expect(
			actions.run(formEvent({ source_mode: 'playbook', playbook_id: 'p1', target_kb_id: 'kb1' }))
		).rejects.toMatchObject({ status: 303, location: '/automations' });
	});
	it('fails with a form error on a 422', async () => {
		lqFetch.mockResolvedValueOnce(new Response('bad', { status: 422 }));
		const out = await actions.run(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', target_kb_id: 'kb1' })
		);
		expect(out).toMatchObject({ status: 422 });
	});
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run "src/routes/(app)/automations/new/page.server.test.ts"`

- [ ] **Step 3: Implement `src/routes/(app)/automations/new/+page.server.ts`**

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import type { PageServerLoad, Actions } from './$types';

async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
	if (!res.ok) return fallback;
	try {
		return (await res.json()) as T;
	} catch {
		return fallback;
	}
}

export const load: PageServerLoad = async (event) => {
	const [autonomousEnabled, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] =
		await Promise.all([
			isAutonomousEnabled(event),
			lqFetch(event, '/api/v1/playbooks'),
			lqFetch(event, '/api/v1/user-skills?scope=user'),
			lqFetch(event, '/api/v1/skills?scope=builtin'),
			lqFetch(event, '/api/v1/knowledge-bases'),
			lqFetch(event, '/api/v1/projects')
		]);

	const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(
		playbooksRes,
		[]
	);
	const userSkills = (
		await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, [])
	).filter((s) => Boolean(s.slug));
	const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(
		builtinsRes,
		[]
	);
	const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []); // GET /knowledge-bases is a bare array (backend.d.ts:3611)
	const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

	return {
		autonomousEnabled,
		playbookItems: toPlaybookItems(playbooks),
		skillItems: toSkillItems(userSkills, builtins),
		kbs,
		matters: matters.map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	run: async (event) => {
		const form = await event.request.formData();
		const mode = String(form.get('source_mode') ?? 'playbook');
		const playbookId = String(form.get('playbook_id') ?? '');
		const skillRef = String(form.get('skill_ref') ?? '');
		const targetKbId = String(form.get('target_kb_id') ?? '');
		const projectId = String(form.get('project_id') ?? '');
		const maxCost = String(form.get('max_cost_usd') ?? '');

		const sourceOk = mode === 'skill' ? Boolean(skillRef) : Boolean(playbookId);
		if (!sourceOk || !targetKbId) {
			return fail(400, { error: 'Choose a source and a target knowledge base.' });
		}

		const body: Record<string, string> = { target_kb_id: targetKbId };
		if (mode === 'skill') body.skill_ref = skillRef;
		else body.playbook_id = playbookId;
		if (projectId) body.project_id = projectId;
		if (maxCost) body.max_cost_usd = maxCost;

		const res = await lqFetch(event, '/api/v1/autonomous/run-now', {
			method: 'POST',
			body: JSON.stringify(body)
		});
		if (res.status === 403) throw redirect(303, '/automations'); // not opted in → gate
		if (!res.ok) return fail(res.status === 422 ? 422 : 502, { error: 'Could not start the run.' });
		const session = (await res.json()) as { id?: string };
		if (!session.id) return fail(502, { error: 'The run started but returned no id.' });
		throw redirect(303, `/automations/${session.id}`);
	}
};
```

- [ ] **Step 4: Run → PASS.** `npx vitest run "src/routes/(app)/automations/new/page.server.test.ts"`

- [ ] **Step 5: Implement `src/routes/(app)/automations/new/+page.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
	import RunNowForm from '$lib/automations/RunNowForm.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Run an automation — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to sessions -->
	<a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
		>← Sessions</a
	>

	{#if !data.autonomousEnabled}
		<AutomationsGate />
	{:else}
		<h2 class="mb-3 text-lg font-medium text-mlq-text">Run an automation</h2>
		{#if form?.error}<p role="status" aria-live="polite" class="mb-3 text-sm text-mlq-error">
				{form.error}
			</p>{/if}
		<form method="POST" action="?/run" use:enhance>
			<RunNowForm
				playbookItems={data.playbookItems}
				skillItems={data.skillItems}
				kbs={data.kbs}
				matters={data.matters}
			/>
		</form>
	{/if}
</div>
```

- [ ] **Step 6: Write the page test `page.svelte.test.ts`**

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const base = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/new', () => {
	it('renders the gate when not opted in', () => {
		render(Page, { props: { data: { ...base, autonomousEnabled: false }, form: null } as never });
		expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
	});
	it('renders the run form when opted in', () => {
		render(Page, { props: { data: { ...base, autonomousEnabled: true }, form: null } as never });
		expect(screen.getByRole('heading', { name: /run an automation/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 7: Run + gate**

Run: `npx vitest run "src/routes/(app)/automations/new" && npm run check && npx eslint "src/routes/(app)/automations/new/**"`
Expected: pass; 0/0; no new eslint errors.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(app)/automations/new/+page.server.ts" "src/routes/(app)/automations/new/+page.svelte" "src/routes/(app)/automations/new/page.server.test.ts" "src/routes/(app)/automations/new/page.svelte.test.ts"
git commit -m "feat(automations): /automations/new run-now route (load + run action + form)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Whole-branch verification, review, PR

- [ ] **Step 1: Full gate**

```bash
npm run check
npx vitest run src/lib/automations "src/routes/(app)/automations" "src/routes/(app)/settings/preferences"
npx eslint src/lib/automations "src/routes/(app)/automations" "src/routes/(app)/settings/preferences"
```

Expected: check 0/0; all green; no new eslint errors.

- [ ] **Step 2: Live e2e (rebuild donna-web)**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Browser (http://localhost:13002, admin): Settings → Preferences → toggle **Automations** on. Go to **Workflows → Automations** → **Run now** → pick a playbook (and a skill, switching modes) + a target KB → **Run** → confirm it redirects to the new session's live receipt and runs to completion. Toggle the opt-in **off** → `/automations` and `/automations/new` show the **gate**; enabling from the gate restores the Run-now flow.

- [ ] **Step 3: Whole-branch Opus review** via `superpowers:requesting-code-review` (base `main`). Address findings; re-run Step 1.

- [ ] **Step 4:** `superpowers:finishing-a-development-branch` → PR. Body: scope (run-now + opt-in; F/G next), pin unchanged (`541bd6f`), the spike findings (`skill_ref` field + playbook-ownership decision), and that it builds on the A+B viewer (#58).

---

## Self-Review (completed during planning)

**1. Spec coverage:**

- §3 IA (`/automations/new`, Run-now button, gate, settings toggle, redirect) → Tasks 3,5,8. ✔
- §4 opt-in (BFF allowlist + settings load/toggle + gate + sourcing helper) → Tasks 1,3,4. ✔
- §5 run-now form (source toggle, required KB, optional matter/cost, canRun) → Tasks 6,7. ✔
- §6 components/data-flow (form action `?/run` → POST → redirect; reuse KbPicker/MatterPicker) → Tasks 7,8. ✔
- §7 error handling (403→gate redirect, 422 form error, 400 missing, empty libs) → Tasks 7,8. ✔
- §8 testing bar → every task ends in vitest + check; Task 9 full gate. ✔
- §9 spike (skill_ref + ownership) → Task 0. ✔
- Non-goals (F/G/D/E) correctly absent. ✔

**2. Placeholder scan:** none — every code step is complete; commands have expected output.

**3. Type consistency:** `SourceItem`/`SourceMode` (Task 2) used identically in `SourcePicker`/`RunNowForm` (6,7); `isAutonomousEnabled` (Task 1) used in Tasks 3,5,8; `toPlaybookItems`/`toSkillItems` (Task 2) used in Task 8 load; the run action's body keys (`playbook_id`/`skill_ref`/`target_kb_id`/`project_id`/`max_cost_usd`) match `RunNowForm`'s hidden-input names. ✔
