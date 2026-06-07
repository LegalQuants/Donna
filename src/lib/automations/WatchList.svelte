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
