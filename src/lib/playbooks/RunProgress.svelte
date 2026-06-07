<script lang="ts">
	import type { RunPhase } from './runFlow.svelte';

	let {
		phase,
		error = null,
		skipUpload = false
	}: { phase: RunPhase; error?: string | null; skipUpload?: boolean } = $props();

	const ALL_STEPS: { key: RunPhase; label: string }[] = [
		{ key: 'uploading', label: 'Uploaded' },
		{ key: 'ingesting', label: 'Ingested' },
		{ key: 'analysing', label: 'Analysing' },
		{ key: 'done', label: 'Results' }
	];
	const STEPS = $derived(
		skipUpload ? ALL_STEPS.filter((s) => s.key !== 'uploading' && s.key !== 'ingesting') : ALL_STEPS
	);
	const ORDER: RunPhase[] = ['idle', 'uploading', 'ingesting', 'executing', 'analysing', 'done'];
	const rank = $derived(ORDER.indexOf(phase === 'error' ? 'idle' : phase));

	function stepClass(stepKey: RunPhase): string {
		const stepRank = ORDER.indexOf(stepKey);
		if (rank > stepRank) return 'text-mlq-success';
		if (rank === stepRank) return 'font-semibold text-mlq-text';
		return 'text-mlq-muted';
	}
</script>

{#if phase === 'error'}
	<p class="text-sm text-mlq-error">⚠ {error ?? 'The run failed.'}</p>
{:else}
	<div class="flex items-center gap-2 text-xs">
		<span
			class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle"
			aria-label="Running"
		></span>
		{#each STEPS as step, i (step.key)}
			<span class={stepClass(step.key)}
				>{rank > ORDER.indexOf(step.key) ? '✓ ' : ''}{step.label}</span
			>
			{#if i < STEPS.length - 1}<span class="text-mlq-subtle">→</span>{/if}
		{/each}
	</div>
{/if}
