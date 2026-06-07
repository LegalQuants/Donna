# P7-3 Preferences + Ambient Trust Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings/preferences` page exposing the two preferences Donna actually honors — `provenance_pills` (collapse the per-message pill row) and `trust_pills` (format a new ambient "where inference runs" pill in the composer) — saved optimistically via `PATCH /users/me/preferences`.

**Architecture:** The full `User` (incl. `trust_pills`/`provenance_pills`) is already on `data.user` via the `(app)` layout, so consumers read it through `page` from `$app/state`; no extra fetch. The trust pill derives its posture purely from the selected model's `ChatModelOption` (`group`/`tier`). Saves go through one small `PATCH` BFF proxy; on success `invalidateAll()` propagates the new value app-wide.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), Tailwind (mlq tokens), vitest + @testing-library/svelte, Playwright. Server tests use `// @vitest-environment node` + `vi.mock('$lib/server/lqClient')`.

---

## Backend contract (verified @ pin `badf83d`, v0.4.0)

- `PATCH /api/v1/users/me/preferences` — body `UserPreferencesUpdate` (all fields optional; only supplied keys move) → returns updated `UserPreferences`.
- `trust_pills`: `'labels' | 'dots'` (default `labels`). `provenance_pills`: `'always' | 'collapsed'` (default `always`).
- `App.Locals.user` is `components['schemas']['User']` (includes both fields); surfaced as `data.user` by `src/routes/(app)/+layout.server.ts` (`{ user: locals.user }`).
- `ChatModelOption` (`src/lib/models/types.ts`): `{ id, label, resolvedModel, group: 'cloud'|'local', tier: number|null }`.

## File structure

| File                                                              | Responsibility                                        | Action |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `src/lib/preferences/preferences.ts`                              | Types, option lists, `trustPosture()`                 | Create |
| `src/lib/preferences/preferences.test.ts`                         | `trustPosture` cases                                  | Create |
| `src/lib/preferences/SegmentedControl.svelte`                     | Reusable 2-option segmented control (a11y radiogroup) | Create |
| `src/lib/preferences/SegmentedControl.svelte.test.ts`             | render/active/onchange                                | Create |
| `src/lib/preferences/TrustPill.svelte`                            | Ambient trust pill (labels/dots)                      | Create |
| `src/lib/preferences/TrustPill.svelte.test.ts`                    | labels/dots × local/cloud × null                      | Create |
| `src/lib/models/store.svelte.ts`                                  | add `selectedOption` getter                           | Modify |
| `src/lib/models/store.svelte.test.ts`                             | cover `selectedOption`                                | Modify |
| `src/lib/components/Composer.svelte`                              | mount `TrustPill` in the control row                  | Modify |
| `src/lib/components/Message.svelte`                               | honor `provenance_pills` (collapse + Details)         | Modify |
| `src/lib/components/Message.svelte.test.ts`                       | collapse behavior (+ `$app/state` mock)               | Modify |
| `src/lib/components/Composer.svelte.test.ts` + `Composer.test.ts` | add `$app/state` mock (Composer now imports `page`)   | Modify |
| `src/lib/settings/SettingsRail.svelte`                            | add Preferences entry                                 | Modify |
| `src/lib/settings/SettingsRail.svelte.test.ts`                    | cover new entry                                       | Modify |
| `src/routes/(app)/settings/preferences/+server.ts`                | `PATCH` BFF proxy                                     | Create |
| `src/routes/(app)/settings/preferences/server.test.ts`            | proxy success/failure                                 | Create |
| `src/routes/(app)/settings/preferences/+page.server.ts`           | `load` current values                                 | Create |
| `src/routes/(app)/settings/preferences/+page.svelte`              | the page (controls + previews + save-on-change)       | Create |
| `src/routes/(app)/settings/preferences/page.svelte.test.ts`       | render + optimistic save                              | Create |
| `tests/preferences.spec.ts`                                       | live e2e (self-cleaning)                              | Create |

---

### Task 1: Add the "Preferences" rail entry

**Files:**

- Modify: `src/lib/settings/SettingsRail.svelte` (the `sections` array)
- Test: `src/lib/settings/SettingsRail.svelte.test.ts`

- [ ] **Step 1: Add failing tests.** Append inside `describe('SettingsRail', …)`:

```ts
it('renders the Preferences section link', () => {
	h.pathname = '/settings/account';
	render(SettingsRail);
	expect(screen.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
		'href',
		'/settings/preferences'
	);
});

it('marks Preferences active on /settings/preferences', () => {
	h.pathname = '/settings/preferences';
	render(SettingsRail);
	expect(screen.getByRole('link', { name: 'Preferences' })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts` → the two new tests FAIL.

- [ ] **Step 3: Add the entry.** In `src/lib/settings/SettingsRail.svelte`, set the `sections` array to:

```svelte
  const sections: { href: string; label: string }[] = [
    { href: '/settings/account', label: 'Account' },
    { href: '/settings/data', label: 'Data & privacy' },
    { href: '/settings/preferences', label: 'Preferences' }
  ];
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/settings/SettingsRail.svelte.test.ts` → all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/settings/SettingsRail.svelte src/lib/settings/SettingsRail.svelte.test.ts
git commit -m "feat(settings): add Preferences entry to the settings rail"
```

---

### Task 2: Preferences types + `trustPosture` helper

**Files:**

- Create: `src/lib/preferences/preferences.ts`
- Test: `src/lib/preferences/preferences.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/preferences/preferences.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { trustPosture, PROVENANCE_OPTIONS, TRUST_OPTIONS } from './preferences';
import type { ChatModelOption } from '$lib/models/types';

const local: ChatModelOption = {
	id: 'local-fast',
	label: 'Llama 3',
	resolvedModel: 'ollama/llama3',
	group: 'local',
	tier: 1
};
const cloud: ChatModelOption = {
	id: 'smart',
	label: 'Opus 4.7',
	resolvedModel: 'anthropic-prod/claude-opus-4-7',
	group: 'cloud',
	tier: 4
};

describe('trustPosture', () => {
	it('marks a local model self-hosted (green tone, full label, model in detail)', () => {
		const p = trustPosture(local);
		expect(p.tone).toBe('local');
		expect(p.label).toBe('Self-hosted · Local');
		expect(p.detail).toMatch(/never leaves/i);
	});

	it('marks a cloud model cloud (amber tone, tier in label, model in detail)', () => {
		const p = trustPosture(cloud);
		expect(p.tone).toBe('cloud');
		expect(p.label).toBe('Cloud · Tier 4');
		expect(p.detail).toMatch(/Opus 4\.7/);
	});

	it('omits the tier from the cloud label when tier is null', () => {
		expect(trustPosture({ ...cloud, tier: null }).label).toBe('Cloud');
	});
});

describe('option lists', () => {
	it('expose the two values for each control', () => {
		expect(TRUST_OPTIONS.map((o) => o.value)).toEqual(['labels', 'dots']);
		expect(PROVENANCE_OPTIONS.map((o) => o.value)).toEqual(['always', 'collapsed']);
	});
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/preferences/preferences.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.** Create `src/lib/preferences/preferences.ts`:

```ts
import type { ChatModelOption } from '$lib/models/types';

export type TrustFormat = 'labels' | 'dots';
export type ProvenanceMode = 'always' | 'collapsed';

export interface TrustPosture {
	tone: 'local' | 'cloud';
	/** Short pill text, e.g. "Self-hosted · Local" or "Cloud · Tier 4". */
	label: string;
	/** Longer hover/title explanation. */
	detail: string;
}

/** Derive the ambient trust pill content from the selected model option. */
export function trustPosture(option: ChatModelOption): TrustPosture {
	if (option.group === 'local') {
		return {
			tone: 'local',
			label: 'Self-hosted · Local',
			detail:
				'Inference runs on a self-hosted local model — your prompt never leaves your environment.'
		};
	}
	const tierSuffix = option.tier != null ? ` · Tier ${option.tier}` : '';
	const modelName = option.label || option.resolvedModel || 'a cloud model';
	return {
		tone: 'cloud',
		label: `Cloud${tierSuffix}`,
		detail: `Cloud inference via ${modelName}${option.tier != null ? ` at Tier ${option.tier}` : ''}. Outbound requests pass through the anonymization layer.`
	};
}

export const TRUST_OPTIONS: { value: TrustFormat; label: string }[] = [
	{ value: 'labels', label: 'Labels' },
	{ value: 'dots', label: 'Dots' }
];

export const PROVENANCE_OPTIONS: { value: ProvenanceMode; label: string }[] = [
	{ value: 'always', label: 'Always shown' },
	{ value: 'collapsed', label: 'Collapsed' }
];
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/preferences/preferences.test.ts` → pass (5).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/preferences/preferences.ts src/lib/preferences/preferences.test.ts
git commit -m "feat(preferences): types + trustPosture helper"
```

---

### Task 3: SegmentedControl component

**Files:**

- Create: `src/lib/preferences/SegmentedControl.svelte`
- Test: `src/lib/preferences/SegmentedControl.svelte.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/preferences/SegmentedControl.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import SegmentedControl from './SegmentedControl.svelte';

const options = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' }
];

describe('SegmentedControl', () => {
	it('renders options as a radiogroup and marks the active one', () => {
		render(SegmentedControl, { props: { options, value: 'a', label: 'Test' } });
		expect(screen.getByRole('radiogroup', { name: 'Test' })).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false');
	});

	it('fires onchange with the value when an inactive option is clicked', async () => {
		const onchange = vi.fn();
		render(SegmentedControl, { props: { options, value: 'a', label: 'Test', onchange } });
		await fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
		expect(onchange).toHaveBeenCalledWith('b');
	});
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/preferences/SegmentedControl.svelte.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/lib/preferences/SegmentedControl.svelte`:

```svelte
<script lang="ts">
	type Option = { value: string; label: string };
	let {
		options,
		value,
		label,
		onchange
	}: { options: Option[]; value: string; label: string; onchange?: (value: string) => void } =
		$props();
</script>

<div
	role="radiogroup"
	aria-label={label}
	class="inline-flex overflow-hidden rounded-mlq-control border border-mlq-subtle text-xs"
>
	{#each options as o, i (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			onclick={() => {
				if (value !== o.value) onchange?.(o.value);
			}}
			class="px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none
             {i > 0 ? 'border-l border-mlq-subtle' : ''}
             {value === o.value
				? 'bg-mlq-strong text-white'
				: 'text-mlq-text hover:bg-mlq-subtle/50'}">{o.label}</button
		>
	{/each}
</div>
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/preferences/SegmentedControl.svelte.test.ts` → pass (2).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/preferences/SegmentedControl.svelte src/lib/preferences/SegmentedControl.svelte.test.ts
git commit -m "feat(preferences): reusable SegmentedControl (a11y radiogroup)"
```

---

### Task 4: TrustPill component

**Files:**

- Create: `src/lib/preferences/TrustPill.svelte`
- Test: `src/lib/preferences/TrustPill.svelte.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/preferences/TrustPill.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TrustPill from './TrustPill.svelte';
import type { ChatModelOption } from '$lib/models/types';

const local: ChatModelOption = {
	id: 'local-fast',
	label: 'Llama 3',
	resolvedModel: 'ollama/llama3',
	group: 'local',
	tier: 1
};
const cloud: ChatModelOption = {
	id: 'smart',
	label: 'Opus 4.7',
	resolvedModel: 'anthropic-prod/claude-opus-4-7',
	group: 'cloud',
	tier: 4
};

describe('TrustPill', () => {
	it('renders nothing when option is null', () => {
		const { container } = render(TrustPill, { props: { option: null, format: 'labels' } });
		expect(container.querySelector('[data-testid="trust-pill"]')).toBeNull();
	});

	it('labels: shows the full text for a local model', () => {
		render(TrustPill, { props: { option: local, format: 'labels' } });
		expect(screen.getByTestId('trust-pill')).toHaveTextContent('Self-hosted · Local');
	});

	it('labels: shows the cloud text with tier', () => {
		render(TrustPill, { props: { option: cloud, format: 'labels' } });
		expect(screen.getByTestId('trust-pill')).toHaveTextContent('Cloud · Tier 4');
	});

	it('dots: shows no visible label text but keeps it in the title', () => {
		render(TrustPill, { props: { option: local, format: 'dots' } });
		const pill = screen.getByTestId('trust-pill');
		expect(pill).not.toHaveTextContent('Self-hosted');
		expect(pill).toHaveAttribute('title', expect.stringContaining('Self-hosted · Local'));
	});
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/preferences/TrustPill.svelte.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/lib/preferences/TrustPill.svelte`:

```svelte
<script lang="ts">
	import { trustPosture, type TrustFormat } from './preferences';
	import type { ChatModelOption } from '$lib/models/types';

	let { option, format }: { option: ChatModelOption | null; format: TrustFormat } = $props();
	const posture = $derived(option ? trustPosture(option) : null);
	// Green = local/self-hosted; amber = cloud.
	const tone = $derived(
		posture?.tone === 'local'
			? 'border-mlq-success/40 bg-mlq-success/10 text-mlq-success'
			: 'border-mlq-caveats/40 bg-mlq-caveats/10 text-mlq-caveats'
	);
</script>

{#if posture}
	<span
		data-testid="trust-pill"
		title={`${posture.label} — ${posture.detail}`}
		class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-5 {tone}"
	>
		<span aria-hidden="true">●</span>{#if format === 'labels'}<span>{posture.label}</span>{/if}
	</span>
{/if}
```

NOTE: confirm the `mlq-caveats` token exists (it's used by `SeverityBadge` per the playbooks work). If `npm run check` flags it as unknown, substitute the amber-ish token the codebase already uses for warnings (grep `mlq-` tokens in `app.css`); do not invent a new token.

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/preferences/TrustPill.svelte.test.ts` → pass (4).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/preferences/TrustPill.svelte src/lib/preferences/TrustPill.svelte.test.ts
git commit -m "feat(preferences): ambient TrustPill (labels/dots, local/cloud)"
```

---

### Task 5: `modelStore.selectedOption` getter

**Files:**

- Modify: `src/lib/models/store.svelte.ts`
- Test: `src/lib/models/store.svelte.test.ts`

- [ ] **Step 1: Add the failing test.** The file already exists with an `ok(data)` helper and an `ALIASES` fixture and uses `await s.load(vi.fn().mockResolvedValue(ok(ALIASES)))` to seed options. Append inside the `describe('createModelStore', …)`:

```ts
it('selectedOption is null before options load', () => {
	expect(createModelStore().selectedOption).toBe(null);
});

it('selectedOption resolves to the option matching selectedModel after load', async () => {
	const s = createModelStore();
	await s.load(vi.fn().mockResolvedValue(ok(ALIASES)));
	expect(s.selectedModel).toBe('smart');
	expect(s.selectedOption?.id).toBe('smart');
	expect(s.selectedOption).toEqual(s.options.find((o) => o.id === 'smart'));
});
```

(`ok` and `ALIASES` are already defined at the top of this test file — reuse them.)

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/models/store.svelte.test.ts` → the new case FAILs (no `selectedOption`).

- [ ] **Step 3: Implement.** In `src/lib/models/store.svelte.ts`, add a getter to the returned object alongside `get selectedModel()` / `get options()`:

```ts
    get selectedOption() {
      return options.find((o) => o.id === selectedModel) ?? null;
    },
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/models/store.svelte.test.ts` → pass.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/models/store.svelte.ts src/lib/models/store.svelte.test.ts
git commit -m "feat(models): expose selectedOption getter on the model store"
```

---

### Task 6: Mount TrustPill in the composer

**Files:**

- Modify: `src/lib/components/Composer.svelte`
- Modify: `src/lib/components/Composer.svelte.test.ts` and `src/lib/components/Composer.test.ts` (add `$app/state` mock — see Step 1)

(The pill's logic is fully tested in Task 4; behavior in the composer is covered by the live e2e in Task 10. This task only wires it in — but adding the `$app/state` import to `Composer.svelte` WILL break the two existing Composer test files unless they mock it.)

- [ ] **Step 1: Pre-empt the test break — mock `$app/state` in BOTH existing Composer test files.** At the top of `src/lib/components/Composer.svelte.test.ts` AND `src/lib/components/Composer.test.ts` (after the existing imports, before the first `describe`), add:

```ts
import { vi } from 'vitest'; // if not already imported in that file
vi.mock('$app/state', () => ({ page: { data: { user: null } } }));
```

(`page.data.user` is `null` → `null?.trust_pills ?? 'labels'`, so the mounted `TrustPill` gets `format="labels"`; `modelStore.selectedOption` is `null` in these tests so the pill renders nothing — no impact on existing assertions.)

- [ ] **Step 2: Add imports to `Composer.svelte`.** In the `<script>`, add:

```ts
import { page } from '$app/state';
import TrustPill from '$lib/preferences/TrustPill.svelte';
```

- [ ] **Step 3: Mount the pill** in the control row, immediately after the closing `/>` of the `<ModelPicker … />` block (which ends with `onselect={modelStore.setModel}` then `/>`). Insert:

```svelte
<TrustPill option={modelStore.selectedOption} format={page.data.user?.trust_pills ?? 'labels'} />
```

- [ ] **Step 4: Run the existing Composer tests + check.** `npx vitest run src/lib/components/Composer.svelte.test.ts src/lib/components/Composer.test.ts` → all still pass. `npm run check` → 0 errors / 0 warnings.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/components/Composer.svelte src/lib/components/Composer.svelte.test.ts src/lib/components/Composer.test.ts
git commit -m "feat(composer): mount ambient TrustPill next to the model picker"
```

---

### Task 7: Honor `provenance_pills` in Message

**Files:**

- Modify: `src/lib/components/Message.svelte`
- Modify: `src/lib/components/Message.svelte.test.ts` (exists with 8 passing cases; add an `$app/state` mock + 2 new cases)

- [ ] **Step 1: Modify the existing test file.** `src/lib/components/Message.svelte.test.ts` currently imports `{ describe, it, expect }` and renders `Message` with no `$app/state` mock. Since `Message.svelte` will start importing `page` from `$app/state`, add a controllable mock that **defaults to `'always'`** (so the 8 existing cases — tier chip, Anonymized badge, applied-skills footer — keep passing unchanged).

  (a) Change the vitest import to include `vi`: `import { describe, it, expect, vi } from 'vitest';`
  (b) Add, immediately after the imports (before `describe('Message', …)`):

```ts
import { fireEvent } from '@testing-library/dom';
import { screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ provenance: 'always' as 'always' | 'collapsed' }));
vi.mock('$app/state', () => ({
	page: {
		get data() {
			return { user: { provenance_pills: h.provenance } };
		}
	}
}));
```

(c) Append a new `describe` block (the 8 existing tests are untouched and pass because `h.provenance` defaults to `'always'`):

```ts
const doneMsg = {
	key: 'a9',
	id: 'a9',
	role: 'assistant',
	content: 'Answer.',
	status: 'done',
	routed_inference_tier: 4,
	anonymized: true,
	applied_skills: ['summarize'],
	citations: []
} as unknown as import('$lib/chat/chatStream.svelte').ChatMessage;

describe('Message provenance pills (provenance_pills preference)', () => {
	it('shows Tier + Anonymized + Applied and no Details toggle when always', () => {
		h.provenance = 'always';
		render(Message, { props: { message: doneMsg } });
		expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
		expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
		expect(screen.getByText(/Applied:/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
	});

	it('hides the pills behind a Details toggle when collapsed, revealing them on click', async () => {
		h.provenance = 'collapsed';
		render(Message, { props: { message: doneMsg } });
		expect(screen.queryByText(/Tier 4/)).toBeNull();
		expect(screen.queryByText(/Anonymized/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /details/i }));
		expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
		expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
		expect(screen.getByText(/Applied:/)).toBeInTheDocument();
	});
});
```

Reset `h.provenance = 'always'` is implicit per-test via the explicit assignment at the start of each new case; the existing cases never touch `h` so they see `'always'`.

- [ ] **Step 2: Run to verify the new cases fail (existing 8 still pass).** `npx vitest run src/lib/components/Message.svelte.test.ts` → the 2 new cases FAIL (Message doesn't yet gate on provenance); the 8 existing pass.

- [ ] **Step 3: Implement.** Edit `src/lib/components/Message.svelte`:

(a) In `<script>`, after the existing imports add:

```ts
import { page } from '$app/state';
```

and after `let copied = $state(false);` add:

```ts
const collapsed = $derived((page.data.user?.provenance_pills ?? 'always') === 'collapsed');
let showDetails = $state(false);
const showPills = $derived(!collapsed || showDetails);
```

(b) Gate the Tier badge — change the opening condition `{#if message.routed_inference_tier != null}` to `{#if showPills && message.routed_inference_tier != null}`, and the streaming branch `{:else if message.status === 'streaming'}` to `{:else if showPills && message.status === 'streaming'}`.

(c) Gate the Anonymized pill — change `{#if message.anonymized === true}` to `{#if showPills && message.anonymized === true}`.

(d) Gate the Applied-skills block — change `{#if message.applied_skills && message.applied_skills.length > 0}` to `{#if showPills && message.applied_skills && message.applied_skills.length > 0}`.

(e) In the done-footer `<div class="mt-2 flex items-center gap-2 text-xs text-mlq-muted">` (the one containing the Copy button), add a Details toggle right after the Copy `<button>…</button>`:

```svelte
{#if collapsed}
	<button
		type="button"
		onclick={() => (showDetails = !showDetails)}
		class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5"
	>
		{showDetails ? 'Hide details' : 'Details'}
	</button>
{/if}
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/lib/components/Message.svelte.test.ts` → pass (2). Also run any pre-existing Message/citation tests to confirm no regression: `npx vitest run src/lib/components`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/components/Message.svelte src/lib/components/Message.svelte.test.ts
git commit -m "feat(chat): honor provenance_pills — collapse the per-message pill row behind a Details toggle"
```

---

### Task 8: Preferences PATCH BFF proxy

**Files:**

- Create: `src/routes/(app)/settings/preferences/+server.ts`
- Test: `src/routes/(app)/settings/preferences/server.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/routes/(app)/settings/preferences/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH } from './+server';

const event = (body: unknown) =>
	({
		request: new Request('http://x', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('PATCH /settings/preferences proxy', () => {
	it('forwards a known preference field and returns updated prefs', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ trust_pills: 'dots' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		const res = await PATCH(event({ trust_pills: 'dots' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
		expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'PATCH' });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ trust_pills: 'dots' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ trust_pills: 'dots' });
	});

	it('rejects an unknown field with 400 without calling the backend', async () => {
		await expect(PATCH(event({ not_a_pref: 'x' }))).rejects.toMatchObject({ status: 400 });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps a backend failure to 502', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
		await expect(PATCH(event({ provenance_pills: 'collapsed' }))).rejects.toMatchObject({
			status: 502
		});
	});
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run "src/routes/(app)/settings/preferences/server.test.ts"` → FAIL.

- [ ] **Step 3: Implement.** Create `src/routes/(app)/settings/preferences/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

// Only the two preferences Donna currently honors are accepted; anything else is
// a client bug (or an attempt to set an unconsumed field) → 400.
const ALLOWED = new Set(['trust_pills', 'provenance_pills']);

export const PATCH: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const keys = body ? Object.keys(body) : [];
	if (!body || keys.length === 0 || keys.some((k) => !ALLOWED.has(k))) {
		throw error(400, 'Unknown preference field.');
	}
	const res = await lqFetch(event, '/api/v1/users/me/preferences', {
		method: 'PATCH',
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const status =
			res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
		throw error(status, 'Could not save preferences.');
	}
	return json(await res.json());
};
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run "src/routes/(app)/settings/preferences/server.test.ts"` → pass (3).

- [ ] **Step 5: Commit.**

```bash
git add "src/routes/(app)/settings/preferences/+server.ts" "src/routes/(app)/settings/preferences/server.test.ts"
git commit -m "feat(settings): PATCH proxy for user preferences"
```

---

### Task 9: Preferences page (load + UI)

**Files:**

- Create: `src/routes/(app)/settings/preferences/+page.server.ts`
- Create: `src/routes/(app)/settings/preferences/+page.svelte`
- Test: `src/routes/(app)/settings/preferences/page.svelte.test.ts`

- [ ] **Step 1: Write the load.** Create `src/routes/(app)/settings/preferences/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	provenancePills: locals.user?.provenance_pills ?? 'always',
	trustPills: locals.user?.trust_pills ?? 'labels'
});
```

- [ ] **Step 2: Write the failing page test.** Create `src/routes/(app)/settings/preferences/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

const invalidateAll = vi.fn();
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll() }));
import Page from './+page.svelte';

beforeEach(() => {
	invalidateAll.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const data = { provenancePills: 'always' as const, trustPills: 'labels' as const };

describe('/settings/preferences page', () => {
	it('renders both segmented controls seeded from data', () => {
		render(Page, { props: { data } });
		expect(screen.getByRole('radiogroup', { name: /trust indicator/i })).toBeInTheDocument();
		expect(screen.getByRole('radiogroup', { name: /message details/i })).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'Labels' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'Always shown' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});

	it('optimistically switches and PATCHes the proxy on change', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ trust_pills: 'dots' }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { props: { data } });
		await fireEvent.click(screen.getByRole('radio', { name: 'Dots' }));
		expect(screen.getByRole('radio', { name: 'Dots' })).toHaveAttribute('aria-checked', 'true');
		expect(fetchMock).toHaveBeenCalledWith(
			'/settings/preferences',
			expect.objectContaining({ method: 'PATCH' })
		);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ trust_pills: 'dots' });
	});

	it('reverts and shows an error when the PATCH fails', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { props: { data } });
		await fireEvent.click(screen.getByRole('radio', { name: 'Collapsed' }));
		expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'Always shown' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});
});
```

- [ ] **Step 3: Run to verify fail.** `npx vitest run "src/routes/(app)/settings/preferences/page.svelte.test.ts"` → FAIL (page missing).

- [ ] **Step 4: Implement the page.** Create `src/routes/(app)/settings/preferences/+page.svelte`:

```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/preferences/SegmentedControl.svelte';
	import TrustPill from '$lib/preferences/TrustPill.svelte';
	import {
		TRUST_OPTIONS,
		PROVENANCE_OPTIONS,
		type TrustFormat,
		type ProvenanceMode
	} from '$lib/preferences/preferences';
	import type { ChatModelOption } from '$lib/models/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let trust = $state<TrustFormat>(data.trustPills);
	let provenance = $state<ProvenanceMode>(data.provenancePills);
	let error = $state<string | null>(null);

	// Sample options to drive the live trust-pill preview.
	const sampleLocal: ChatModelOption = {
		id: 'preview-local',
		label: 'Llama 3',
		resolvedModel: 'ollama/llama3',
		group: 'local',
		tier: 1
	};

	async function save(
		field: 'trust_pills' | 'provenance_pills',
		value: string,
		revert: () => void
	) {
		error = null;
		try {
			const res = await fetch('/settings/preferences', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ [field]: value })
			});
			if (!res.ok) {
				revert();
				error = "Couldn't save — try again.";
				return;
			}
			await invalidateAll();
		} catch {
			revert();
			error = "Couldn't save — try again.";
		}
	}

	function onTrust(v: string) {
		const prev = trust;
		trust = v as TrustFormat;
		save('trust_pills', v, () => (trust = prev));
	}
	function onProvenance(v: string) {
		const prev = provenance;
		provenance = v as ProvenanceMode;
		save('provenance_pills', v, () => (provenance = prev));
	}
</script>

<svelte:head><title>Preferences — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Preferences</h1>

{#if error}<p class="mb-3 text-sm text-mlq-error">{error}</p>{/if}

<section class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-start justify-between gap-4">
		<div>
			<div class="text-sm font-medium text-mlq-text">Trust indicator</div>
			<div class="mt-0.5 text-xs text-mlq-muted">
				How the “where inference runs” pill shows in the composer.
			</div>
		</div>
		<SegmentedControl
			options={TRUST_OPTIONS}
			value={trust}
			label="Trust indicator"
			onchange={onTrust}
		/>
	</div>
	<div class="mt-3 flex items-center gap-2 border-t border-dashed border-mlq-subtle pt-3">
		<span class="text-[11px] text-mlq-muted">Preview</span>
		<TrustPill option={sampleLocal} format={trust} />
	</div>
</section>

<section class="mt-4 rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-start justify-between gap-4">
		<div>
			<div class="text-sm font-medium text-mlq-text">Message details</div>
			<div class="mt-0.5 text-xs text-mlq-muted">
				The tier / anonymized / applied-skills pills under each answer.
			</div>
		</div>
		<SegmentedControl
			options={PROVENANCE_OPTIONS}
			value={provenance}
			label="Message details"
			onchange={onProvenance}
		/>
	</div>
	<p class="mt-3 border-t border-dashed border-mlq-subtle pt-3 text-[11px] text-mlq-muted">
		{provenance === 'always'
			? 'Shown under each answer.'
			: 'Hidden behind a “Details” toggle on each answer.'}
	</p>
</section>

<p class="mt-4 text-xs text-mlq-muted">Changes save automatically.</p>
```

- [ ] **Step 5: Run to verify pass.** `npx vitest run "src/routes/(app)/settings/preferences/page.svelte.test.ts"` → pass (3). Then `npm run check` → 0 errors / 0 warnings.

- [ ] **Step 6: Commit.**

```bash
git add "src/routes/(app)/settings/preferences/+page.server.ts" "src/routes/(app)/settings/preferences/+page.svelte" "src/routes/(app)/settings/preferences/page.svelte.test.ts"
git commit -m "feat(settings): /settings/preferences page with save-on-change"
```

---

### Task 10: Live e2e

**Files:**

- Create: `tests/preferences.spec.ts`

Mirrors `tests/settings-account.spec.ts` (login helper). **Restores defaults in `finally`** — preferences mutate the shared admin fixture.

- [ ] **Step 1: Write the e2e.** Create `tests/preferences.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

async function resetPrefs() {
	const tok = (
		await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		}).then((r) => r.json())
	).access_token;
	await fetch(`${API}/users/me/preferences`, {
		method: 'PATCH',
		headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
		body: JSON.stringify({ trust_pills: 'labels', provenance_pills: 'always' })
	});
}

test('Preferences — trust indicator + message details persist and apply', async ({ page }) => {
	test.setTimeout(120_000);
	try {
		await login(page);
		await page.goto('/settings/preferences');
		await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
			'aria-current',
			'page'
		);

		// Composer trust pill starts in labels form on the home page.
		await page.goto('/');
		await expect(page.getByTestId('trust-pill')).toBeVisible();
		const labelText = (await page.getByTestId('trust-pill').textContent())?.trim() ?? '';
		expect(labelText.length).toBeGreaterThan(1); // has a word, not just the dot

		// Switch trust indicator → Dots.
		await page.goto('/settings/preferences');
		await page.getByRole('radio', { name: 'Dots' }).click();
		await expect(page.getByRole('radio', { name: 'Dots' })).toHaveAttribute('aria-checked', 'true');

		// Reload home → pill is now dot-only (no word text).
		await page.goto('/');
		await expect(page.getByTestId('trust-pill')).toBeVisible();
		expect(((await page.getByTestId('trust-pill').textContent()) ?? '').replace(/[●\s]/g, '')).toBe(
			''
		);

		// Switch message details → Collapsed; assert it persists across reload.
		await page.goto('/settings/preferences');
		await page.getByRole('radio', { name: 'Collapsed' }).click();
		await expect(page.getByRole('radio', { name: 'Collapsed' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		await page.reload();
		await expect(page.getByRole('radio', { name: 'Collapsed' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	} finally {
		await resetPrefs();
	}
});
```

- [ ] **Step 2: Rebuild the web container (serves built code), then run.**

```bash
docker compose up -d --build donna-web
set -a; . ./.env; set +a
npx playwright test tests/preferences.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit.**

```bash
git add tests/preferences.spec.ts
git commit -m "test(settings): live e2e for Preferences (trust pill + message details persist)"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` → "0 errors and 0 warnings".
- [ ] `npx vitest run` → all green (existing + new).
- [ ] `docker compose up -d --build donna-web && set -a; . ./.env; set +a; npx playwright test tests/preferences.spec.ts` → 1 passed.
- [ ] Manual smoke at http://localhost:13002/settings/preferences: toggle each control; confirm the composer pill format changes and a chat answer's pill row collapses behind "Details".

## Notes for the executor

- `TrustPill` uses the `mlq-success` (green) / `mlq-caveats` (amber) tokens — if `npm run check` rejects `mlq-caveats`, grep `app.css` for the existing warning/amber token and substitute; do not invent one.
- Components read the live preference via `import { page } from '$app/state'` then `page.data.user?.<field>` — the P7-1 `SettingsRail` idiom. Tests mock `$app/state` with a hoisted getter.
- The page seeds its control `$state` once from `data` and updates optimistically; `invalidateAll()` after a successful save refreshes `data.user` for the composer/message consumers (not strictly needed for the page's own controls, which are already optimistic).
- e2e MUST restore `trust_pills:'labels'` + `provenance_pills:'always'` in `finally` — the admin fixture is shared.
