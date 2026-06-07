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
	const canSave = $derived(sourceValue !== null && kbId !== null);
	// A watch's KB is fixed at creation (immutable upstream) → read-only in edit mode.
	// Matter IS editable (fc832ca): edit mode always emits project_id (empty = cleared)
	// so the update action can send an explicit null (unassign) vs omit (create mode).
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
			<p class="text-xs text-mlq-muted">Watching: {kbName ?? 'a knowledge base'}</p>
		{:else if kbs.length === 0}
			<p class="text-xs text-mlq-muted">
				No knowledge bases yet.
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
		<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
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
	{#if projectId}<input type="hidden" name="project_id" value={projectId} />{:else if editing}<input
			type="hidden"
			name="project_id"
			value=""
		/>{/if}
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
