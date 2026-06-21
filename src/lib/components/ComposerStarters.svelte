<script lang="ts">
	import { Scale } from '@lucide/svelte';
	let { onpick }: { onpick: (text: string) => void } = $props();
	const PROMPTS = ['Find a landmark U.S. Supreme Court case on free speech and cite it'];
</script>

<div class="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-mlq-muted">
	<span>Try:</span>
	{#each PROMPTS as p (p)}
		<button
			type="button"
			onclick={() => onpick(p)}
			class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2.5 py-0.5 text-mlq-text hover:bg-mlq-surface-alt"
		>
			<Scale size={12} aria-hidden="true" />
			{p}
		</button>
	{/each}
</div>
