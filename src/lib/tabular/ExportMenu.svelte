<script lang="ts">
	import { Download } from '@lucide/svelte';

	let { executionId }: { executionId: string } = $props();
	let open = $state(false);
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text"
	>
		<Download size={14} aria-hidden="true" /> Export ▾
	</button>
	{#if open}
		<div
			class="absolute right-0 z-10 mt-1 w-40 rounded-mlq-control border border-mlq-subtle bg-mlq-surface py-1 shadow-md"
		>
			<a
				href={`/tabular-executions/${executionId}/export?format=xlsx`}
				class="block px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt"
				onclick={() => (open = false)}>Excel (.xlsx)</a
			>
			<a
				href={`/tabular-executions/${executionId}/export?format=csv`}
				class="block px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt"
				onclick={() => (open = false)}>CSV (.csv)</a
			>
		</div>
	{/if}
</div>
