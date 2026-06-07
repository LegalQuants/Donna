<script lang="ts">
	import type { ExecutionResults, PositionResult, Redline } from './types';
	import { compareBySeverity } from './severity';
	import RedlineChange from './RedlineChange.svelte';
	import SeverityBadge from './SeverityBadge.svelte';

	let { results }: { results: ExecutionResults } = $props();

	// Only positions with a redline; narrow via predicate so `c.redline` is non-null
	// (no `!`). Severity-ordered, critical-first.
	const changes = $derived(
		results.positions
			.filter((p): p is PositionResult & { redline: Redline } => p.redline !== null)
			.sort(compareBySeverity)
	);
</script>

{#if changes.length === 0}
	<p
		class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
	>
		No redlines — the contract matches the playbook's positions.
	</p>
{:else}
	<div class="space-y-5">
		{#each changes as c (c.position_id)}
			<div class="grid gap-3 sm:grid-cols-[1fr_minmax(0,12rem)]">
				<RedlineChange redline={c.redline} />
				<div class="space-y-1 text-xs">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-mlq-strong">{c.issue}</span>
						<SeverityBadge severity={c.severity_if_missing} />
					</div>
					<p class="text-mlq-muted">{c.redline.justification}</p>
				</div>
			</div>
		{/each}
	</div>
{/if}
