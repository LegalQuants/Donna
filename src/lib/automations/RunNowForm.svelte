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
	let emitArtifacts = $state(false);

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
			Target knowledge base <span class="text-mlq-error">*</span>
		</div>
		{#if kbs.length === 0}
			<p class="text-xs text-mlq-muted">
				No knowledge bases yet.
				<a href="/knowledge" class="text-mlq-workflow hover:underline">Create one first.</a>
			</p>
		{:else}
			<KbPicker {kbs} triggerLabel="Choose a knowledge base" onpick={(id) => (kbId = id)} />
			{#if kbName}<p class="mt-1 text-xs text-mlq-muted">Selected: {kbName}</p>{/if}
		{/if}
	</div>

	<label class="flex items-start gap-2 text-sm text-mlq-text">
		<input type="checkbox" bind:checked={emitArtifacts} class="mt-0.5 accent-mlq-workflow" />
		<span>
			Save run documents to the knowledge base
			<span class="block text-xs text-mlq-muted">
				When the run produces a document-grade result (a memo), save it to the target knowledge base
				and link it on the run's receipt. Documents need a target knowledge base.
			</span>
		</span>
	</label>

	<div>
		<div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
		<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
	</div>

	<div>
		<label for="run-cost-cap" class="mb-1 block text-xs font-medium text-mlq-muted"
			>Cost cap (optional, USD)</label
		>
		<!-- type=text (not number): number-binding coerces to a number and breaks maxCost.trim(). -->
		<input
			id="run-cost-cap"
			type="text"
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
	<input type="hidden" name="emit_artifacts" value={emitArtifacts ? 'true' : 'false'} />

	<div>
		<button
			type="submit"
			disabled={!canRun}
			class="rounded-mlq-control bg-mlq-workflow px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none disabled:opacity-60"
			>Run</button
		>
	</div>
</div>
