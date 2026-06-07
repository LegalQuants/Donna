<script lang="ts">
	import type { PositionResult } from './types';
	import VerdictBadge from './VerdictBadge.svelte';
	import SeverityBadge from './SeverityBadge.svelte';
	import RedlineBlocks from './RedlineBlocks.svelte';

	let { result }: { result: PositionResult } = $props();
	const pct = $derived(Math.round(result.confidence * 100));
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-start justify-between gap-3">
		<h3 class="font-serif text-mlq-strong">{result.issue}</h3>
		<VerdictBadge verdict={result.verdict} fallbackRank={result.matched_fallback_rank} />
	</div>
	<div class="mt-1 flex items-center gap-2 text-xs text-mlq-muted">
		<SeverityBadge severity={result.severity_if_missing} />
		<span>{pct}% confidence</span>
	</div>

	{#if result.matched_text}
		<div class="mt-2 text-[10px] font-medium tracking-wide text-mlq-muted uppercase">
			What the contract says
		</div>
		<div class="mt-1 border-l-2 border-mlq-subtle pl-3 text-sm text-mlq-text">
			{result.matched_text}
		</div>
	{/if}

	<p class="mt-2 text-sm text-mlq-muted">{result.justification}</p>

	{#if result.redline}
		<div class="mt-3 text-[10px] font-medium tracking-wide text-mlq-muted uppercase">
			Suggested redline
		</div>
		<div class="mt-1"><RedlineBlocks redline={result.redline} /></div>
	{/if}
</div>
