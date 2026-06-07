# Automations — Slice G: Watches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing CRUD for autonomous **watches** (KB-arrival-triggered runs) over LQ-AI's `/api/v1/autonomous/watches` — a watch fires an autonomous run every time a new document arrives in a required, immutable knowledge base.

**Architecture:** SvelteKit `(app)` routes under `/automations/watches`, mirroring slice F (schedules). A pure `watches.ts` (parse + `buildWatchBody` + `kbLabel`) carries logic and is unit-tested in isolation. A new `WatchForm` composes the existing `SourcePicker`/`KbPicker`/`MatterPicker` (no changes to shipped schedule/run-now files). The `sourceLabel` helper is extracted to a shared module reused by schedules + watches. Server `load` + form actions talk to the backend via `lqFetch`; the existing `arq-worker` dispatcher fires watches.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Tailwind (mlq tokens), Vitest + `@testing-library/svelte`, `lqFetch`.

**Spec:** `docs/superpowers/specs/2026-06-04-automations-watches-design.md`. **Pin:** `vendor/lq-ai` @ `35c8bb6` (no bump — watch types present, `max_cost_usd` typed `string`). **Branch:** `feat/automations-watches`.

**Key contract facts (verified against `src/lib/api/backend.d.ts`):**

- `AutonomousWatchCreate`: `knowledge_base_id` (**required**, owned KB else **404**), exactly one of `playbook_id`/`skill_ref`, `project_id?`, `enabled` (default true), `max_cost_usd?`.
- `AutonomousWatchUpdate`: `enabled?`, `playbook_id?`, `skill_ref?`, `max_cost_usd?` **only** — `knowledge_base_id` AND `project_id` are **immutable** (absent).
- `AutonomousWatchRead`: `id, knowledge_base_id, playbook_id?, skill_ref?, project_id?, enabled, max_cost_usd?, created_at, updated_at`. **No `name`, no `next_run_at`/`last_run_at`.**
- List = `{ watches: AutonomousWatchRead[], total_count, limit, offset }`. `/watches/{watch_id}` exposes only **PATCH + DELETE** (DELETE → 200; re-delete → 404). No GET-single. All `autonomous_enabled`-gated (403); cross-user id → 404.

---

## File structure

**Create:**

- `src/lib/automations/sourceLabel.ts` — shared `SourceRef` + `sourceLabel` (extracted from `schedules.ts`).
- `src/lib/automations/sourceLabel.test.ts`
- `src/lib/automations/watches.ts` — `WatchSummary`, `parseWatch`/`parseWatchList`, `buildWatchBody`, `kbLabel`.
- `src/lib/automations/watches.test.ts`
- `src/lib/automations/WatchForm.svelte` + `.svelte.test.ts`
- `src/lib/automations/WatchList.svelte` + `.svelte.test.ts`
- `src/lib/automations/WatchRow.svelte` + `.svelte.test.ts`
- `src/routes/(app)/automations/watches/+page.server.ts` + `page.server.test.ts`
- `src/routes/(app)/automations/watches/+page.svelte` + `page.svelte.test.ts`
- `src/routes/(app)/automations/watches/[id]/+page.server.ts` + `page.server.test.ts`
- `src/routes/(app)/automations/watches/[id]/+page.svelte` + `page.svelte.test.ts`

**Modify:**

- `src/lib/automations/schedules.ts` — remove local `sourceLabel`, re-export from `./sourceLabel` (F imports/tests unaffected).
- `src/lib/automations/AutomationsNav.svelte` (+ `.svelte.test.ts`) — add the Watches tab.

---

## Task 1: Extract shared `sourceLabel`

**Files:**

- Create: `src/lib/automations/sourceLabel.ts`, `src/lib/automations/sourceLabel.test.ts`
- Modify: `src/lib/automations/schedules.ts`

**Context:** `schedules.ts` currently defines+exports `sourceLabel(s: ScheduleSummary, …)`. Watches need the same logic over a different summary type. Extract it to a shared module keyed on a minimal `SourceRef` shape, and re-export from `schedules.ts` so existing imports (`$lib/automations/schedules`) and F's `schedules.test.ts` keep working unchanged.

- [ ] **Step 1: Write the failing test `src/lib/automations/sourceLabel.test.ts`**

```ts
// src/lib/automations/sourceLabel.test.ts
import { describe, it, expect } from 'vitest';
import { sourceLabel } from './sourceLabel';
import type { SourceItem } from './runNow';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA Review' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver' }];

describe('sourceLabel', () => {
	it('resolves a playbook id to its label (fallback "Playbook")', () => {
		expect(sourceLabel({ playbook_id: 'p1', skill_ref: null }, playbookItems, skillItems)).toBe(
			'NDA Review'
		);
		expect(sourceLabel({ playbook_id: 'gone', skill_ref: null }, playbookItems, skillItems)).toBe(
			'Playbook'
		);
	});
	it('resolves a skill ref to its label, falling back to the ref', () => {
		expect(sourceLabel({ playbook_id: null, skill_ref: 'comms' }, playbookItems, skillItems)).toBe(
			'Comms Improver'
		);
		expect(
			sourceLabel({ playbook_id: null, skill_ref: 'unknown' }, playbookItems, skillItems)
		).toBe('unknown');
	});
	it('returns an em-dash when neither is set', () => {
		expect(sourceLabel({ playbook_id: null, skill_ref: null }, playbookItems, skillItems)).toBe(
			'—'
		);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/sourceLabel.test.ts`
Expected: FAIL — `./sourceLabel` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/automations/sourceLabel.ts`**

```ts
// src/lib/automations/sourceLabel.ts
// Shared source-label resolver for schedules and watches (both reference a
// playbook or a skill). Keyed on a minimal structural shape so any summary works.
import type { SourceItem } from './runNow';

export interface SourceRef {
	playbook_id: string | null;
	skill_ref: string | null;
}

/** Human label for a source, resolved against the loaded libraries. */
export function sourceLabel(
	s: SourceRef,
	playbookItems: SourceItem[],
	skillItems: SourceItem[]
): string {
	if (s.playbook_id)
		return playbookItems.find((i) => i.value === s.playbook_id)?.label ?? 'Playbook';
	if (s.skill_ref) return skillItems.find((i) => i.value === s.skill_ref)?.label ?? s.skill_ref;
	return '—';
}
```

- [ ] **Step 4: Update `schedules.ts` to re-export (remove the local copy)**

In `src/lib/automations/schedules.ts`:

(a) **Replace** the top import line `import type { SourceItem } from './runNow';` with the re-export (the `SourceItem` import was used ONLY by the local `sourceLabel`, so leaving it would be an unused-import error against the 0/0 bar):

```ts
export { sourceLabel } from './sourceLabel';
```

(b) **Delete** the local `sourceLabel` function and its doc comment entirely:

```ts
/** Human label for a schedule's source, resolved against the loaded libraries. */
export function sourceLabel(
	s: ScheduleSummary,
	playbookItems: SourceItem[],
	skillItems: SourceItem[]
): string {
	if (s.playbook_id)
		return playbookItems.find((i) => i.value === s.playbook_id)?.label ?? 'Playbook';
	if (s.skill_ref) return skillItems.find((i) => i.value === s.skill_ref)?.label ?? s.skill_ref;
	return '—';
}
```

(`ScheduleSummary` satisfies `SourceRef` structurally, so `schedules.test.ts`'s `sourceLabel(parseSchedule(raw)!, …)` calls still typecheck and pass via the re-export. Verify no other reference to `SourceItem` remains in `schedules.ts` before removing the import — there are none.)

- [ ] **Step 5: Run to verify both pass**

Run: `npx vitest run src/lib/automations/sourceLabel.test.ts src/lib/automations/schedules.test.ts`
Expected: PASS (new module + F's schedule tests still green).

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/automations/sourceLabel.ts src/lib/automations/sourceLabel.test.ts src/lib/automations/schedules.ts
git commit -m "refactor(automations): extract shared sourceLabel for schedules + watches

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `watches.ts` — parse, build body, kb label (pure, TDD)

**Files:**

- Create: `src/lib/automations/watches.ts`, `src/lib/automations/watches.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/automations/watches.test.ts`**

```ts
// src/lib/automations/watches.test.ts
import { describe, it, expect } from 'vitest';
import { parseWatch, parseWatchList, buildWatchBody, kbLabel } from './watches';
import type { KnowledgeBase } from '$lib/knowledge/types';

const raw = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: 'm1',
	max_cost_usd: '2.50',
	enabled: true
};

describe('parseWatch / parseWatchList', () => {
	it('parses a well-formed watch', () => {
		const w = parseWatch(raw);
		expect(w).not.toBeNull();
		expect(w!.id).toBe('w1');
		expect(w!.knowledge_base_id).toBe('kb1');
		expect(w!.enabled).toBe(true);
		expect(w!.max_cost_usd).toBe('2.50');
	});
	it('returns null when id or knowledge_base_id is missing', () => {
		expect(parseWatch({ id: 'w1' })).toBeNull();
		expect(parseWatch({ knowledge_base_id: 'kb1' })).toBeNull();
		expect(parseWatch(null)).toBeNull();
	});
	it('reads the {watches:[...]} envelope and a bare array', () => {
		expect(parseWatchList({ watches: [raw] })).toHaveLength(1);
		expect(parseWatchList([raw, { bad: true }])).toHaveLength(1);
		expect(parseWatchList({})).toEqual([]);
	});
});

const kb = (id: string, name: string): KnowledgeBase => ({
	id,
	name,
	owner_id: 'u1',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
});

describe('kbLabel', () => {
	it('resolves the watched KB name, falling back when absent', () => {
		expect(kbLabel(parseWatch(raw)!, [kb('kb1', 'Contracts KB')])).toBe('Contracts KB');
		expect(kbLabel(parseWatch(raw)!, [])).toBe('a knowledge base');
	});
});

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('buildWatchBody', () => {
	it('create: requires source + knowledge_base_id, emits project_id', () => {
		const out = buildWatchBody(
			fd({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				project_id: 'm1',
				max_cost_usd: '2.00',
				enabled: 'true'
			}),
			'create'
		);
		expect(out.ok).toBe(true);
		expect(out.ok && out.body).toEqual({
			enabled: true,
			playbook_id: 'p1',
			knowledge_base_id: 'kb1',
			project_id: 'm1',
			max_cost_usd: '2.00'
		});
	});
	it('create: fails without a knowledge_base_id', () => {
		expect(buildWatchBody(fd({ source_mode: 'playbook', playbook_id: 'p1' }), 'create').ok).toBe(
			false
		);
	});
	it('create: fails without a source', () => {
		expect(
			buildWatchBody(fd({ source_mode: 'playbook', knowledge_base_id: 'kb1' }), 'create').ok
		).toBe(false);
	});
	it('update: omits knowledge_base_id and project_id (immutable), keeps source/enabled/cost', () => {
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
			max_cost_usd: '1.50'
		});
	});
	it('drops a non-numeric max_cost_usd', () => {
		const out = buildWatchBody(
			fd({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				max_cost_usd: 'abc'
			}),
			'create'
		);
		expect(out.ok).toBe(true);
		expect(out.ok && 'max_cost_usd' in out.body).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/watches.test.ts`
Expected: FAIL — `./watches` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/automations/watches.ts`**

```ts
// src/lib/automations/watches.ts
// Defensively-parsed view models + form helpers for autonomous watches
// (lq-ai /api/v1/autonomous/watches). Mirrors schedules.ts. A watch is bound to
// a required, immutable knowledge_base_id; project_id is also immutable on update.
import type { KnowledgeBase } from '$lib/knowledge/types';

export interface WatchSummary {
	id: string;
	knowledge_base_id: string;
	playbook_id: string | null;
	skill_ref: string | null;
	project_id: string | null;
	max_cost_usd: string | null;
	enabled: boolean;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseWatch(raw: unknown): WatchSummary | null {
	const r = obj(raw);
	if (typeof r.id !== 'string' || typeof r.knowledge_base_id !== 'string') return null;
	return {
		id: r.id,
		knowledge_base_id: r.knowledge_base_id,
		playbook_id: str(r.playbook_id),
		skill_ref: str(r.skill_ref),
		project_id: str(r.project_id),
		max_cost_usd: str(r.max_cost_usd),
		enabled: r.enabled === true
	};
}

export function parseWatchList(raw: unknown): WatchSummary[] {
	const envelope = obj(raw).watches;
	const arr = Array.isArray(raw) ? raw : Array.isArray(envelope) ? (envelope as unknown[]) : [];
	return arr.map(parseWatch).filter((w): w is WatchSummary => w !== null);
}

/** The watched KB's display name, resolved against the loaded KBs. */
export function kbLabel(w: WatchSummary, kbs: KnowledgeBase[]): string {
	return kbs.find((k) => k.id === w.knowledge_base_id)?.name ?? 'a knowledge base';
}

export type WatchBodyResult = { ok: true; body: Record<string, unknown> } | { ok: false };

/** Build the create/update request body. Create requires a source AND a
 *  knowledge_base_id (and may carry project_id). Update omits knowledge_base_id
 *  and project_id (both immutable per AutonomousWatchUpdate). */
export function buildWatchBody(form: FormData, mode: 'create' | 'update'): WatchBodyResult {
	const srcMode = String(form.get('source_mode') ?? 'playbook');
	const playbookId = String(form.get('playbook_id') ?? '');
	const skillRef = String(form.get('skill_ref') ?? '');
	const kbId = String(form.get('knowledge_base_id') ?? '');
	const projectId = String(form.get('project_id') ?? '');
	const maxCost = String(form.get('max_cost_usd') ?? '').trim();
	const enabled = String(form.get('enabled') ?? 'true') === 'true';

	const sourceOk = srcMode === 'skill' ? Boolean(skillRef) : Boolean(playbookId);
	if (!sourceOk || (mode === 'create' && !kbId)) return { ok: false };

	const body: Record<string, unknown> = { enabled };
	if (srcMode === 'skill') body.skill_ref = skillRef;
	else body.playbook_id = playbookId;
	if (mode === 'create') {
		body.knowledge_base_id = kbId;
		if (projectId) body.project_id = projectId;
	}
	if (maxCost && Number.isFinite(Number(maxCost)) && Number(maxCost) >= 0)
		body.max_cost_usd = maxCost;
	return { ok: true, body };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/watches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/watches.ts src/lib/automations/watches.test.ts
git commit -m "feat(automations): watch parse, kbLabel, buildWatchBody

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `WatchForm.svelte` — composed form (TDD)

**Files:**

- Create: `src/lib/automations/WatchForm.svelte`, `src/lib/automations/WatchForm.svelte.test.ts`

**Note:** Mirrors `ScheduleForm` (read it first) MINUS cron and name. Differences: **KB required** (`canSave` needs `kbId`); **lead copy** "Runs every time a new document is added to this knowledge base"; **emphasized cost-cap block**; **edit mode renders KB read-only** ("Watching: {name} · set at creation") in addition to matter read-only. Cost input is `type="text"` (number-binding breaks `maxCost.trim()`). Seeds state once via `untrack`. Hidden inputs: `source_mode`, `playbook_id`|`skill_ref`, `knowledge_base_id`, `project_id`, `max_cost_usd`, `enabled`.

- [ ] **Step 1: Write the failing test `src/lib/automations/WatchForm.svelte.test.ts`**

```ts
// src/lib/automations/WatchForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import WatchForm from './WatchForm.svelte';
import type { SourceItem } from './runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { MatterSummary } from '$lib/matters/types';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver', sub: 'builtin' }];
const kbs: KnowledgeBase[] = [
	{
		id: 'kb1',
		name: 'Contracts KB',
		owner_id: 'u1',
		hybrid_alpha: 0.5,
		file_count: 0,
		chunk_count: 0,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z'
	}
];
const matters: MatterSummary[] = [{ id: 'm1', name: 'Acme' }];
const base = { playbookItems, skillItems, kbs, matters };

// KbPicker renders a trigger button; KB rows appear after opening it.
async function pickKb(name: RegExp) {
	await fireEvent.click(screen.getByRole('button', { name: /choose a knowledge base/i }));
	await fireEvent.click(screen.getByRole('button', { name }));
}

describe('WatchForm', () => {
	it('states the per-arrival trigger and enables Save only after a source AND a KB', async () => {
		render(WatchForm, { props: base });
		expect(screen.getByText(/every time a new document is added/i)).toBeInTheDocument();
		const save = screen.getByRole('button', { name: /save watch/i });
		expect(save).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		expect(save).toBeDisabled(); // still needs a KB (required)
		await pickKb(/Contracts KB/);
		expect(save).not.toBeDisabled();
	});

	it('emits knowledge_base_id + playbook_id + enabled hidden inputs', async () => {
		const { container } = render(WatchForm, { props: base });
		await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
		await pickKb(/Contracts KB/);
		expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe(
			'p1'
		);
		expect(
			(container.querySelector('input[name="knowledge_base_id"]') as HTMLInputElement).value
		).toBe('kb1');
		expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe(
			'true'
		);
	});

	it('edit mode: KB + matter read-only, source/cost editable, "Save changes" label', () => {
		const { container } = render(WatchForm, {
			props: {
				...base,
				submitLabel: 'Save changes',
				initial: {
					playbook_id: null,
					skill_ref: 'comms',
					knowledge_base_id: 'kb1',
					project_id: 'm1',
					max_cost_usd: '2.50',
					enabled: false
				}
			}
		});
		expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
		expect(screen.getByText(/Watching: Contracts KB/i)).toBeInTheDocument(); // KB read-only
		expect(screen.getByText(/set at creation/i)).toBeInTheDocument(); // matter read-only
		expect(screen.queryByRole('button', { name: /choose a knowledge base/i })).toBeNull(); // no KB picker
		expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe(
			'comms'
		);
		expect(
			(container.querySelector('input[name="knowledge_base_id"]') as HTMLInputElement).value
		).toBe('kb1');
		expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe(
			'2.50'
		);
	});

	it('puts a typed cost cap into the hidden max_cost_usd input (string)', async () => {
		const { container } = render(WatchForm, { props: base });
		await fireEvent.input(screen.getByLabelText(/cost cap/i), { target: { value: '3.00' } });
		expect((container.querySelector('input[name="max_cost_usd"]') as HTMLInputElement).value).toBe(
			'3.00'
		);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/WatchForm.svelte.test.ts`
Expected: FAIL — component cannot be resolved.

- [ ] **Step 3: Implement `src/lib/automations/WatchForm.svelte`**

```svelte
<!-- src/lib/automations/WatchForm.svelte -->
<script lang="ts">
	import type { SourceItem, SourceMode } from './runNow';
	import type { KnowledgeBase } from '$lib/knowledge/types';
	import type { MatterSummary } from '$lib/matters/types';
	import SourcePicker from './SourcePicker.svelte';
	import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';
	import { untrack } from 'svelte';

	export interface WatchInitial {
		playbook_id: string | null;
		skill_ref: string | null;
		knowledge_base_id: string;
		project_id: string | null;
		max_cost_usd: string | null;
		enabled: boolean;
	}

	let {
		playbookItems,
		skillItems,
		kbs,
		matters,
		initial = null,
		submitLabel = 'Save watch'
	}: {
		playbookItems: SourceItem[];
		skillItems: SourceItem[];
		kbs: KnowledgeBase[];
		matters: MatterSummary[];
		initial?: WatchInitial | null;
		submitLabel?: string;
	} = $props();

	// Seed local state once from `initial` (edit prefill) via untrack — see ScheduleForm.
	const seed = untrack(() => initial);
	let mode = $state<SourceMode>(seed?.skill_ref ? 'skill' : 'playbook');
	let sourceValue = $state<string | null>(seed?.skill_ref ?? seed?.playbook_id ?? null);
	let kbId = $state<string | null>(seed?.knowledge_base_id ?? null);
	let projectId = $state<string | null>(seed?.project_id ?? null);
	let maxCost = $state(seed?.max_cost_usd ?? '');
	let enabled = $state(seed?.enabled ?? true);

	const items = $derived(mode === 'playbook' ? playbookItems : skillItems);
	const kbName = $derived(kbs.find((k) => k.id === kbId)?.name ?? null);
	const matterName = $derived(matters.find((m) => m.id === projectId)?.name ?? null);
	const canSave = $derived(sourceValue !== null && kbId !== null);
	// A watch's KB and matter are fixed at creation (AutonomousWatchUpdate has neither),
	// so edit mode shows them read-only.
	const editing = $derived(initial !== null);

	function setMode(next: SourceMode) {
		if (next === mode) return;
		mode = next;
		sourceValue = null;
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-sm text-mlq-text">
		Runs every time a new document is added to this knowledge base.
	</p>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">Run a</div>
		<div
			role="radiogroup"
			aria-label="Run a"
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
	</div>

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
			Watched knowledge base <span class="text-mlq-error">*</span>
		</div>
		{#if editing}
			<p class="text-xs text-mlq-muted">
				Watching: {kbName ?? 'a knowledge base'}
				<span class="text-mlq-muted/70">· set at creation</span>
			</p>
		{:else if kbs.length === 0}
			<p class="text-xs text-mlq-muted">
				No knowledge bases yet.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- create a KB first -->
				<a href="/knowledge" class="text-mlq-workflow hover:underline">Create one first.</a>
			</p>
		{:else}
			<KbPicker
				{kbs}
				triggerLabel={kbName ? `Knowledge base: ${kbName}` : 'Choose a knowledge base'}
				onpick={(id) => (kbId = id)}
			/>
		{/if}
	</div>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
		{#if editing}
			<p class="text-xs text-mlq-muted">
				{matterName ?? 'None'} <span class="text-mlq-muted/70">· set at creation</span>
			</p>
		{:else}
			<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
		{/if}
	</div>

	<!-- Cost cap is the safety control for a watch: it fires on every new document, so each run is capped. -->
	<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-3">
		<label for="watch-cost-cap" class="mb-1 block text-xs font-medium text-mlq-text"
			>Cost cap per run (USD)</label
		>
		<!-- type=text (not number): number-binding coerces to a number and breaks maxCost.trim(). -->
		<input
			id="watch-cost-cap"
			type="text"
			inputmode="decimal"
			bind:value={maxCost}
			placeholder="e.g. 2.00"
			class="w-32 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow"
		/>
		<p class="mt-1 text-xs text-mlq-muted">
			Recommended — a watch fires on every new document, so this caps each run's spend.
		</p>
	</div>

	<label class="flex items-center gap-2 text-sm text-mlq-text">
		<input type="checkbox" bind:checked={enabled} class="accent-mlq-workflow" />
		Enabled
	</label>

	<!-- Hidden fields submitted by the page's <form>. Only the active source key is present. -->
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
	{#if kbId}<input type="hidden" name="knowledge_base_id" value={kbId} />{/if}
	{#if projectId}<input type="hidden" name="project_id" value={projectId} />{/if}
	{#if maxCost.trim()}<input type="hidden" name="max_cost_usd" value={maxCost.trim()} />{/if}
	<input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />

	<div>
		<button
			type="submit"
			disabled={!canSave}
			class="rounded-mlq-control bg-mlq-workflow px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none disabled:opacity-60"
			>{submitLabel}</button
		>
	</div>
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/WatchForm.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm the bar**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/WatchForm.svelte src/lib/automations/WatchForm.svelte.test.ts
git commit -m "feat(automations): WatchForm — KB-required, fire+cost emphasis, edit read-only

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `WatchRow.svelte` + `WatchList.svelte` (TDD)

**Files:**

- Create: `src/lib/automations/WatchRow.svelte`, `src/lib/automations/WatchList.svelte`, and their `.svelte.test.ts`.

**Note:** Mirrors `ScheduleRow`/`ScheduleList` (read them). Row title = watched KB name; subtitle = source · "watches for new documents"; no cadence/next-run. Two-step Delete confirm. Empty state reinforces the framing.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/WatchRow.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import WatchRow from './WatchRow.svelte';
import type { WatchSummary } from './watches';

const watch: WatchSummary = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};

describe('WatchRow', () => {
	it('shows the watched KB title, source subtitle, and an On toggle', () => {
		const { container } = render(WatchRow, {
			props: { watch, kbLabel: 'Contracts KB', sourceLabel: 'NDA Review' }
		});
		expect(screen.getByText('Contracts KB')).toBeInTheDocument();
		expect(screen.getByText(/NDA Review · watches for new documents/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^on$/i })).toBeInTheDocument();
		expect(
			(container.querySelector('form[action="?/toggle"] input[name="enabled"]') as HTMLInputElement)
				.value
		).toBe('false');
		expect(
			(container.querySelector('form[action="?/toggle"] input[name="id"]') as HTMLInputElement)
				.value
		).toBe('w1');
	});

	it('links to the edit page and reveals delete only after confirm', async () => {
		const { container } = render(WatchRow, {
			props: {
				watch: { ...watch, enabled: false },
				kbLabel: 'Contracts KB',
				sourceLabel: 'NDA Review'
			}
		});
		expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
			'href',
			'/automations/watches/w1'
		);
		expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
		expect(container.querySelector('form[action="?/delete"]')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
		expect(
			(container.querySelector('form[action="?/delete"] input[name="id"]') as HTMLInputElement)
				.value
		).toBe('w1');
		expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
	});
});
```

```ts
// src/lib/automations/WatchList.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WatchList from './WatchList.svelte';
import type { WatchSummary } from './watches';

const watch: WatchSummary = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};

describe('WatchList', () => {
	it('renders an empty state with example use-cases', () => {
		render(WatchList, { props: { rows: [] } });
		expect(screen.getByText(/No watches yet/)).toBeInTheDocument();
		expect(screen.getByText(/Auto-summarize/i)).toBeInTheDocument();
	});
	it('renders one row per watch', () => {
		render(WatchList, { props: { rows: [{ watch, kb: 'Contracts KB', source: 'NDA Review' }] } });
		expect(screen.getByText('Contracts KB')).toBeInTheDocument();
		expect(screen.queryByText(/No watches yet/)).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/automations/WatchRow.svelte.test.ts src/lib/automations/WatchList.svelte.test.ts`
Expected: FAIL — components cannot be resolved.

- [ ] **Step 3: Implement `src/lib/automations/WatchRow.svelte`**

```svelte
<!-- src/lib/automations/WatchRow.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { WatchSummary } from './watches';

	let {
		watch,
		kbLabel,
		sourceLabel
	}: { watch: WatchSummary; kbLabel: string; sourceLabel: string } = $props();

	// Two-step confirm so an accidental click can't delete a watch.
	let confirmingDelete = $state(false);
</script>

<div class="flex items-center gap-3 rounded-mlq-control border border-mlq-subtle p-3">
	<div class="min-w-0">
		<div class="truncate text-sm text-mlq-text">{kbLabel}</div>
		<div class="truncate text-xs text-mlq-muted">{sourceLabel} · watches for new documents</div>
	</div>

	<form method="POST" action="?/toggle" use:enhance class="ml-auto shrink-0">
		<input type="hidden" name="id" value={watch.id} />
		<input type="hidden" name="enabled" value={watch.enabled ? 'false' : 'true'} />
		<button
			type="submit"
			aria-pressed={watch.enabled}
			class="rounded-full px-2 py-0.5 text-xs font-medium {watch.enabled
				? 'bg-mlq-success/15 text-mlq-success'
				: 'bg-mlq-subtle text-mlq-muted'}"
		>
			{watch.enabled ? 'On' : 'Off'}
		</button>
	</form>

	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- edit watch link -->
	<a
		href="/automations/watches/{watch.id}"
		class="shrink-0 text-xs text-mlq-workflow hover:underline">Edit</a
	>

	{#if confirmingDelete}
		<form method="POST" action="?/delete" use:enhance class="flex shrink-0 items-center gap-2">
			<input type="hidden" name="id" value={watch.id} />
			<button type="submit" class="text-xs font-medium text-mlq-error hover:underline"
				>Confirm</button
			>
			<button
				type="button"
				onclick={() => (confirmingDelete = false)}
				class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
			>
		</form>
	{:else}
		<button
			type="button"
			onclick={() => (confirmingDelete = true)}
			class="shrink-0 text-xs text-mlq-error hover:underline">Delete</button
		>
	{/if}
</div>
```

- [ ] **Step 4: Implement `src/lib/automations/WatchList.svelte`**

```svelte
<!-- src/lib/automations/WatchList.svelte -->
<script lang="ts">
	import type { WatchSummary } from './watches';
	import WatchRow from './WatchRow.svelte';

	let { rows }: { rows: { watch: WatchSummary; kb: string; source: string }[] } = $props();
</script>

{#if rows.length === 0}
	<div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
		<p class="text-sm font-medium text-mlq-text">No watches yet</p>
		<p class="mt-1 text-xs text-mlq-muted">
			A watch runs a playbook or skill automatically whenever a new document lands in a knowledge
			base.
		</p>
		<ul class="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-mlq-muted">
			<li>• <strong>Auto-summarize</strong> every contract dropped into a knowledge base.</li>
			<li>• Run a <strong>risk-review skill</strong> on each new document as it arrives.</li>
		</ul>
	</div>
{:else}
	<ul class="flex flex-col gap-2">
		{#each rows as row (row.watch.id)}
			<li><WatchRow watch={row.watch} kbLabel={row.kb} sourceLabel={row.source} /></li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/automations/WatchRow.svelte.test.ts src/lib/automations/WatchList.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/WatchRow.svelte src/lib/automations/WatchList.svelte src/lib/automations/WatchRow.svelte.test.ts src/lib/automations/WatchList.svelte.test.ts
git commit -m "feat(automations): WatchList + WatchRow (KB title, watches-for-new-docs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add the Watches tab to `AutomationsNav` (TDD)

**Files:**

- Modify: `src/lib/automations/AutomationsNav.svelte`, `src/lib/automations/AutomationsNav.svelte.test.ts`

- [ ] **Step 1: Add a failing test case**

Append inside the existing top-level `describe` in `src/lib/automations/AutomationsNav.svelte.test.ts`:

```ts
it('renders a Watches tab linking to /automations/watches, current when active', () => {
	render(AutomationsNav, { props: { active: 'watches' } });
	const link = screen.getByRole('link', { name: /watches/i });
	expect(link).toHaveAttribute('href', '/automations/watches');
	expect(link).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`
Expected: FAIL — no Watches link / `active: 'watches'` not assignable.

- [ ] **Step 3: Modify `AutomationsNav.svelte`**

Replace the `View` type and `tabs` array:

```svelte
  type View = 'sessions' | 'schedules' | 'watches' | 'notifications';
  let { active, unread = 0 }: { active: View; unread?: number } = $props();

  const tabs: { id: View; label: string; href: string }[] = [
    { id: 'sessions', label: 'Sessions', href: '/automations' },
    { id: 'schedules', label: 'Schedules', href: '/automations/schedules' },
    { id: 'watches', label: 'Watches', href: '/automations/watches' },
    { id: 'notifications', label: 'Notifications', href: '/automations/notifications' }
  ];
```

(The `{#each}` markup and the notifications-only `UnreadBadge` are unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/AutomationsNav.svelte src/lib/automations/AutomationsNav.svelte.test.ts
git commit -m "feat(automations): add Watches tab to AutomationsNav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `/automations/watches` route — list + inline create (TDD)

**Files:**

- Create: `src/routes/(app)/automations/watches/+page.server.ts` + `page.server.test.ts`
- Create: `src/routes/(app)/automations/watches/+page.svelte` + `page.svelte.test.ts`

**Note:** Mirrors `/automations/schedules`. `load` gates → gate-only shape when off; else `Promise.all` of `unreadCount`, `GET /watches`, libraries. Actions `create`/`toggle`/`delete`. **Create maps a backend 404 → a KB form error.** No cron-field plumbing — all `form.error` renders at page top-level.

- [ ] **Step 1: Write the failing server test `page.server.test.ts`**

```ts
// src/routes/(app)/automations/watches/page.server.test.ts
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

describe('/automations/watches load', () => {
	it('returns the gate-only shape when not opted in (no list fetch)', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
		);
		const out = (await load({} as never)) as { autonomousEnabled: boolean; watches: unknown[] };
		expect(out.autonomousEnabled).toBe(false);
		expect(out.watches).toEqual([]);
		expect(lqFetch).toHaveBeenCalledTimes(1);
	});

	it('loads watches + libraries when opted in', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			) // isAutonomousEnabled
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						watches: [{ id: 'w1', knowledge_base_id: 'kb1', playbook_id: 'p1', enabled: true }]
					}),
					{ status: 200 }
				)
			) // watches
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })
			) // playbooks
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ slug: 'mine', display_name: 'Mine' }]), { status: 200 })
			) // user-skills
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ name: 'comms', title: 'Comms' }]), { status: 200 })
			) // builtins
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })
			) // kbs
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			); // matters
		const out = (await load({} as never)) as {
			autonomousEnabled: boolean;
			watches: unknown[];
			playbookItems: unknown[];
		};
		expect(out.autonomousEnabled).toBe(true);
		expect(out.watches).toHaveLength(1);
		expect(out.playbookItems).toHaveLength(1);
	});

	it('throws 502 when the watches fetch fails', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
			)
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }))
			.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
		await expect(load({} as never)).rejects.toMatchObject({ status: 502 });
	});
});

describe('/automations/watches actions', () => {
	it('create POSTs a watch body and returns created', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w9' }), { status: 201 }));
		const out = await actions.create(
			formEvent({
				source_mode: 'playbook',
				playbook_id: 'p1',
				knowledge_base_id: 'kb1',
				enabled: 'true'
			})
		);
		expect(out).toMatchObject({ created: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toMatchObject({
			playbook_id: 'p1',
			knowledge_base_id: 'kb1',
			enabled: true
		});
	});
	it('create fails 400 without a KB', async () => {
		const out = await actions.create(formEvent({ source_mode: 'playbook', playbook_id: 'p1' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('create maps a backend 404 to a KB form error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('no kb', { status: 404 }));
		const out = await actions.create(
			formEvent({ source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kbX' })
		);
		expect(out).toMatchObject({ status: 404 });
		expect((out as { data: { error: string } }).data.error).toMatch(/knowledge base/i);
	});
	it('toggle PATCHes the new enabled value', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'w1', enabled: false }), { status: 200 })
		);
		const out = await actions.toggle(formEvent({ id: 'w1', enabled: 'false' }));
		expect(out).toMatchObject({ toggled: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches/w1');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ enabled: false });
	});
	it('delete DELETEs the watch', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w1' }), { status: 200 }));
		const out = await actions.delete(formEvent({ id: 'w1' }));
		expect(out).toMatchObject({ deleted: true });
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/watches/page.server.test.ts"`
Expected: FAIL — `./+page.server` cannot be resolved.

- [ ] **Step 3: Implement `+page.server.ts`**

```ts
import { fail, error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseWatchList, buildWatchBody } from '$lib/automations/watches';
import { jsonOr } from '$lib/server/loadJson';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const autonomousEnabled = await isAutonomousEnabled(event);
	if (!autonomousEnabled) {
		return {
			autonomousEnabled,
			unread: 0,
			watches: [],
			playbookItems: [],
			skillItems: [],
			kbs: [],
			matters: []
		};
	}

	const [unread, watchesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] =
		await Promise.all([
			unreadCount(event),
			lqFetch(event, '/api/v1/autonomous/watches'),
			lqFetch(event, '/api/v1/playbooks'),
			lqFetch(event, '/api/v1/user-skills?scope=user'),
			lqFetch(event, '/api/v1/skills?scope=builtin'),
			lqFetch(event, '/api/v1/knowledge-bases'),
			lqFetch(event, '/api/v1/projects')
		]);
	if (!watchesRes.ok) throw error(502, 'Could not load watches.');

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
	const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
	const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

	return {
		autonomousEnabled,
		unread,
		watches: parseWatchList(await watchesRes.json()),
		playbookItems: toPlaybookItems(playbooks),
		skillItems: toSkillItems(userSkills, builtins),
		kbs,
		matters: matters.map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const built = buildWatchBody(await event.request.formData(), 'create');
		if (!built.ok) return fail(400, { error: 'Choose a source and a knowledge base to watch.' });
		const res = await lqFetch(event, '/api/v1/autonomous/watches', {
			method: 'POST',
			body: JSON.stringify(built.body)
		});
		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: "That knowledge base isn't available." });
		if (res.status === 422)
			return fail(422, { error: 'Choose exactly one of a playbook or a skill.' });
		if (!res.ok) return fail(502, { error: 'Could not save the watch.' });
		return { created: true };
	},
	toggle: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const enabled = String(form.get('enabled') ?? '') === 'true';
		if (!id) return fail(400, { error: 'Missing watch id.' });
		const res = await lqFetch(event, `/api/v1/autonomous/watches/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ enabled })
		});
		if (!res.ok)
			return fail(res.status === 403 ? 403 : 502, { error: 'Could not update the watch.' });
		return { toggled: true };
	},
	delete: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing watch id.' });
		const res = await lqFetch(event, `/api/v1/autonomous/watches/${id}`, { method: 'DELETE' });
		if (!res.ok)
			return fail(res.status === 403 ? 403 : 502, { error: 'Could not delete the watch.' });
		return { deleted: true };
	}
};
```

- [ ] **Step 4: Run to verify the server test passes**

Run: `npx vitest run "src/routes/(app)/automations/watches/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the failing page test `page.svelte.test.ts`**

```ts
// src/routes/(app)/automations/watches/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const libs = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/watches page', () => {
	it('shows the opt-in gate when autonomous is off', () => {
		render(Page, {
			props: {
				data: { autonomousEnabled: false, unread: 0, watches: [], ...libs },
				form: null
			} as never
		});
		expect(screen.getByText(/Automations are off/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /new watch/i })).toBeNull();
	});

	it('shows the New watch control and the list when opted in', () => {
		const watch = {
			id: 'w1',
			knowledge_base_id: 'kb1',
			playbook_id: 'p1',
			skill_ref: null,
			project_id: null,
			max_cost_usd: null,
			enabled: true
		};
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					watches: [watch],
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs: [
						{
							id: 'kb1',
							name: 'Contracts KB',
							owner_id: 'u1',
							hybrid_alpha: 0.5,
							file_count: 0,
							chunk_count: 0,
							created_at: 'x',
							updated_at: 'x'
						}
					],
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.getByRole('button', { name: /new watch/i })).toBeInTheDocument();
		expect(screen.getByText('Contracts KB')).toBeInTheDocument();
	});

	it('shows a failed toggle/delete error at page level even with the form closed', () => {
		render(Page, {
			props: {
				data: { autonomousEnabled: true, unread: 0, watches: [], ...libs },
				form: { error: 'Could not update the watch.' }
			} as never
		});
		expect(screen.queryByRole('button', { name: /save watch/i })).toBeNull();
		expect(screen.getByRole('alert')).toHaveTextContent(/could not update the watch/i);
	});

	it('reveals the inline create form when "New watch" is clicked', async () => {
		render(Page, {
			props: {
				data: {
					autonomousEnabled: true,
					unread: 0,
					watches: [],
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs: [],
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.queryByRole('button', { name: /save watch/i })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /new watch/i }));
		expect(screen.getByRole('button', { name: /save watch/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/watches/page.svelte.test.ts"`
Expected: FAIL — `./+page.svelte` cannot be resolved.

- [ ] **Step 7: Implement `+page.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
	import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
	import WatchForm from '$lib/automations/WatchForm.svelte';
	import WatchList from '$lib/automations/WatchList.svelte';
	import { kbLabel } from '$lib/automations/watches';
	import { sourceLabel } from '$lib/automations/sourceLabel';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	$effect(() => {
		if (form?.created) showForm = false;
	});

	const rows = $derived(
		data.watches.map((w) => ({
			watch: w,
			kb: kbLabel(w, data.kbs),
			source: sourceLabel(w, data.playbookItems, data.skillItems)
		}))
	);
</script>

<svelte:head><title>Watches — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<AutomationsNav active="watches" unread={data.unread} />

	{#if !data.autonomousEnabled}
		<AutomationsGate />
	{:else}
		{#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}

		<div class="mb-3">
			<button
				type="button"
				onclick={() => (showForm = !showForm)}
				class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none"
			>
				{showForm ? 'Cancel' : 'New watch'}
			</button>
		</div>

		{#if showForm}
			<form
				method="POST"
				action="?/create"
				use:enhance
				class="mb-6 rounded-mlq-control border border-mlq-subtle p-4"
			>
				<WatchForm
					playbookItems={data.playbookItems}
					skillItems={data.skillItems}
					kbs={data.kbs}
					matters={data.matters}
				/>
			</form>
		{/if}

		<WatchList {rows} />
	{/if}
</div>
```

- [ ] **Step 8: Run to verify the page test passes**

Run: `npx vitest run "src/routes/(app)/automations/watches/page.svelte.test.ts"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/automations/watches/+page.server.ts" "src/routes/(app)/automations/watches/+page.svelte" "src/routes/(app)/automations/watches/page.server.test.ts" "src/routes/(app)/automations/watches/page.svelte.test.ts"
git commit -m "feat(automations): /automations/watches list + inline create

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `/automations/watches/[id]` — edit page (TDD)

**Files:**

- Create: `src/routes/(app)/automations/watches/[id]/+page.server.ts` + `page.server.test.ts`
- Create: `src/routes/(app)/automations/watches/[id]/+page.svelte` + `page.svelte.test.ts`

**Note:** No GET-single → `load` finds the watch by id from the list (404 if absent); 403 if opted out; loads `unreadCount` for the nav badge. `update` calls `buildWatchBody(form, 'update')` (KB/matter omitted) → PATCH → 303 to `/automations/watches`.

- [ ] **Step 1: Write the failing server test `[id]/page.server.test.ts`**

```ts
// src/routes/(app)/automations/watches/[id]/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const ev = (id: string, fields?: Record<string, string>) =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields ?? {}) })
	}) as never;

const w = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};

function loadMocks(found: boolean) {
	lqFetch
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		) // isAutonomousEnabled
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ watches: found ? [w] : [] }), { status: 200 })
		) // watches
		.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })
		) // playbooks
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // user-skills
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // builtins
		.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })
		) // kbs
		.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters
}

describe('/automations/watches/[id] load', () => {
	it('finds the watch by id', async () => {
		loadMocks(true);
		const out = (await load(ev('w1'))) as { watch: { id: string } };
		expect(out.watch.id).toBe('w1');
	});
	it('throws 404 when the id is not in the list', async () => {
		loadMocks(false);
		await expect(load(ev('missing'))).rejects.toMatchObject({ status: 404 });
	});
	it('throws 403 when not opted in', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })
		);
		await expect(load(ev('w1'))).rejects.toMatchObject({ status: 403 });
	});
});

describe('/automations/watches/[id] update', () => {
	it('PATCHes (no KB/matter) and redirects to the list', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w1' }), { status: 200 }));
		await expect(
			actions.update(
				ev('w1', {
					source_mode: 'playbook',
					playbook_id: 'p1',
					knowledge_base_id: 'kb1',
					project_id: 'm1',
					enabled: 'false'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/automations/watches' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches/w1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		const body = JSON.parse(lqFetch.mock.calls[0][2].body);
		expect(body).toEqual({ enabled: false, playbook_id: 'p1' }); // KB + project omitted (immutable)
	});
	it('fails 400 without a source', async () => {
		const out = await actions.update(ev('w1', { source_mode: 'playbook' }));
		expect(out).toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('maps a 404 to not-found', async () => {
		lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
		const out = await actions.update(ev('w1', { source_mode: 'playbook', playbook_id: 'p1' }));
		expect(out).toMatchObject({ status: 404 });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/watches/[id]/page.server.test.ts"`
Expected: FAIL — `./+page.server` cannot be resolved.

- [ ] **Step 3: Implement `[id]/+page.server.ts`**

```ts
import { fail, error, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseWatchList, buildWatchBody } from '$lib/automations/watches';
import { jsonOr } from '$lib/server/loadJson';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!(await isAutonomousEnabled(event))) throw error(403, 'Automations are turned off.');

	const [unread, watchesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] =
		await Promise.all([
			unreadCount(event),
			lqFetch(event, '/api/v1/autonomous/watches'),
			lqFetch(event, '/api/v1/playbooks'),
			lqFetch(event, '/api/v1/user-skills?scope=user'),
			lqFetch(event, '/api/v1/skills?scope=builtin'),
			lqFetch(event, '/api/v1/knowledge-bases'),
			lqFetch(event, '/api/v1/projects')
		]);
	if (!watchesRes.ok) throw error(502, 'Could not load watches.');

	const watch = parseWatchList(await watchesRes.json()).find((x) => x.id === event.params.id);
	if (!watch) throw error(404, 'Watch not found.');

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
	const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
	const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

	return {
		watch,
		unread,
		playbookItems: toPlaybookItems(playbooks),
		skillItems: toSkillItems(userSkills, builtins),
		kbs,
		matters: matters.map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	update: async (event) => {
		const built = buildWatchBody(await event.request.formData(), 'update');
		if (!built.ok) return fail(400, { error: 'Choose a source.' });
		const res = await lqFetch(event, `/api/v1/autonomous/watches/${event.params.id}`, {
			method: 'PATCH',
			body: JSON.stringify(built.body)
		});
		if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
		if (res.status === 404) return fail(404, { error: 'Watch not found.' });
		if (res.status === 422)
			return fail(422, { error: 'Choose exactly one of a playbook or a skill.' });
		if (!res.ok) return fail(502, { error: 'Could not save the watch.' });
		throw redirect(303, '/automations/watches');
	}
};
```

- [ ] **Step 4: Run to verify the server test passes**

Run: `npx vitest run "src/routes/(app)/automations/watches/[id]/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the failing page test `[id]/page.svelte.test.ts`**

```ts
// src/routes/(app)/automations/watches/[id]/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const watch = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};
const kbs = [
	{
		id: 'kb1',
		name: 'Contracts KB',
		owner_id: 'u1',
		hybrid_alpha: 0.5,
		file_count: 0,
		chunk_count: 0,
		created_at: 'x',
		updated_at: 'x'
	}
];

describe('/automations/watches/[id] page', () => {
	it('renders the edit form with a Save changes button and the read-only KB', () => {
		render(Page, {
			props: {
				data: {
					watch,
					unread: 0,
					playbookItems: [{ value: 'p1', label: 'NDA' }],
					skillItems: [],
					kbs,
					matters: []
				},
				form: null
			} as never
		});
		expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
		expect(screen.getByText(/Watching: Contracts KB/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/watches/[id]/page.svelte.test.ts"`
Expected: FAIL — `./+page.svelte` cannot be resolved.

- [ ] **Step 7: Implement `[id]/+page.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
	import WatchForm from '$lib/automations/WatchForm.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const initial = $derived({
		playbook_id: data.watch.playbook_id,
		skill_ref: data.watch.skill_ref,
		knowledge_base_id: data.watch.knowledge_base_id,
		project_id: data.watch.project_id,
		max_cost_usd: data.watch.max_cost_usd,
		enabled: data.watch.enabled
	});
</script>

<svelte:head><title>Edit watch — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<AutomationsNav active="watches" unread={data.unread} />
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to watches -->
	<a
		href="/automations/watches"
		class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Watches</a
	>

	<h2 class="mb-3 text-lg font-medium text-mlq-text">Edit watch</h2>
	{#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
	<form method="POST" action="?/update" use:enhance>
		<WatchForm
			playbookItems={data.playbookItems}
			skillItems={data.skillItems}
			kbs={data.kbs}
			matters={data.matters}
			{initial}
			submitLabel="Save changes"
		/>
	</form>
</div>
```

- [ ] **Step 8: Run to verify the page test passes**

Run: `npx vitest run "src/routes/(app)/automations/watches/[id]/page.svelte.test.ts"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/automations/watches/[id]"
git commit -m "feat(automations): /automations/watches/[id] edit page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck — the gate**

Run: `npm run check`
Expected: **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` on stderr is harmless).

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all green (new watch tests included; schedule tests still pass after the `sourceLabel` extraction).

- [ ] **Step 3: Lint — no new errors**

Run: `npx eslint src/lib/automations "src/routes/(app)/automations"`
Expected: no new errors vs `main`. Internal `<a href>` links carry the `svelte/no-navigation-without-resolve` disable-next-line directly above the `href` line (present in `WatchRow`, `WatchForm`'s "Create one first" link, and the edit/back links).

- [ ] **Step 4: Manual smoke (dev stack)**

Cold start per the spec/handoff, then **rebuild `donna-web`** (`docker compose up -d --build donna-web`). At http://localhost:13002 (admin `admin@lq.ai` / `$DONNA_E2E_PASSWORD`):

1. With automations **off**, visit `/automations/watches` → opt-in gate shows.
2. Enable automations on `/settings/preferences`, return → "New watch" appears; the form leads with "Runs every time a new document is added…" and the cost cap is in its emphasized block.
3. Create with a playbook + a KB → row shows the **KB name** + "{source} · watches for new documents".
4. Toggle a row On/Off; Delete (two-step confirm).
5. Edit a row → KB and matter are read-only ("Watching: {KB} · set at creation"); change the source/cost → saves and redirects to the list.
6. Try creating with no KB → Save stays disabled.

- [ ] **Step 5: Push + finish**

The branch is ready for the whole-branch Opus review → `finishing-a-development-branch` → PR (per `[[donna-workflow]]`). Sync this plan + the spec if a review changes executed code.

```bash
git push -u origin feat/automations-watches
```

---

## Self-review notes (coverage vs spec)

- **Backend contract (KB required+immutable, matter immutable, no name/cadence, no GET-single)** → Tasks 2, 6, 7 (`buildWatchBody` mode-aware; edit read-only; find-by-id).
- **IA: Watches tab** → Task 5. **Routes: list+inline create, `[id]` edit** → Tasks 6–7.
- **Fire + cost emphasis (lead copy + emphasized cost block)** → `WatchForm` (Task 3); reinforced in the empty state (Task 4).
- **Reuse without disturbing F** → new `WatchForm`/`WatchRow`/`WatchList`/`watches.ts`; `sourceLabel` extracted to a shared module with `schedules.ts` re-export (Task 1) — F's imports/tests unchanged.
- **KB-ownership 404 → form error; immutable KB/matter on edit** → Task 6 create action + Task 3 edit mode.
- **Error mapping / gate / tests / 0/0 bar** → Tasks 6–8.
