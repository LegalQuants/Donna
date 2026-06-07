<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import type { EnhancePromptResponse } from '$lib/enhance/types';

	let {
		result,
		onaccept,
		ondiscard
	}: {
		result: EnhancePromptResponse;
		onaccept: () => void;
		ondiscard: () => void;
	} = $props();

	let showReasoning = $state(false);
</script>

<div
	class="mb-2 rounded-mlq-control border border-l-2 border-mlq-subtle border-l-mlq-strong bg-mlq-surface p-3"
>
	<div class="mb-1 flex items-center gap-1.5 text-[11px] tracking-wide text-mlq-muted uppercase">
		<Sparkles size={12} /> Enhanced prompt
	</div>
	<p data-testid="enhance-expanded" class="font-serif text-sm whitespace-pre-wrap text-mlq-text">
		{result.expanded_prompt}
	</p>

	{#if result.reasoning.length}
		<button
			type="button"
			onclick={() => (showReasoning = !showReasoning)}
			class="mt-2 text-xs text-mlq-muted hover:text-mlq-text"
		>
			{showReasoning ? '▾' : '▸'} Why these changes ({result.reasoning.length})
		</button>
		{#if showReasoning}
			<ul class="mt-1 list-disc space-y-1 pl-5 text-xs text-mlq-muted">
				{#each result.reasoning as r, i (i)}<li>{r}</li>{/each}
			</ul>
		{/if}
	{/if}

	<div class="mt-3 flex gap-2">
		<button
			type="button"
			data-testid="enhance-accept"
			onclick={onaccept}
			class="rounded-mlq-control bg-mlq-strong px-3 py-1 text-xs text-white">Use this</button
		>
		<button
			type="button"
			data-testid="enhance-discard"
			onclick={ondiscard}
			class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-xs text-mlq-text"
			>Discard</button
		>
	</div>
</div>
