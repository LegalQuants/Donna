<script lang="ts">
	import { untrack } from 'svelte';
	import SessionReceiptHeader from './SessionReceiptHeader.svelte';
	import SessionTimeline from './SessionTimeline.svelte';
	import RunResults from './RunResults.svelte';
	import { createSessionPoll } from './pollSession.svelte';
	import type { SessionSummary, SessionReceipt } from './types';
	import type { FindingItem, RunMemoryItem } from './findings';

	let {
		initialSession,
		initialReceipt,
		initialFindings,
		initialFindingsTotal,
		initialMemories,
		initialMemoriesTotal = null
	}: {
		initialSession: SessionSummary;
		initialReceipt: SessionReceipt | null;
		initialFindings: FindingItem[] | null;
		initialFindingsTotal: number | null;
		initialMemories: RunMemoryItem[] | null;
		initialMemoriesTotal?: number | null;
	} = $props();

	// Live-poll a running session to terminal; swap in fresh data as it arrives.
	// untrack the id read so the initial-prop access isn't a reactive dependency.
	const live = createSessionPoll(untrack(() => initialSession.id));

	// After the poll reaches a clean terminal (done && !error), prefer the
	// server-refreshed initial props (e.g. after a Keep/Dismiss invalidateAll)
	// over the now-frozen live state. While polling is still in progress,
	// prefer live data and fall back to initial props for last-known-good retention.
	function pick<T>(liveVal: T | null, initialVal: T | null): T | null {
		if (!live.session) return initialVal;
		if (live.done && !live.error) return initialVal ?? liveVal;
		return liveVal ?? initialVal;
	}

	const session = $derived(live.session ?? initialSession);
	const receipt = $derived(live.session ? live.receipt : initialReceipt);
	const findings = $derived(pick(live.findings, initialFindings));
	const findingsTotal = $derived(pick(live.findingsTotal, initialFindingsTotal));
	const memories = $derived(pick(live.memories, initialMemories));
	const memoriesTotal = $derived(pick(live.memoriesTotal, initialMemoriesTotal));

	$effect(() => {
		if (initialSession.status === 'running') {
			live.start();
			return () => live.stop();
		}
	});
</script>

<div class="flex flex-col gap-4">
	<SessionReceiptHeader {session} {receipt} />
	{#if session.status === 'running'}
		<p class="text-xs text-mlq-workflow">Running — live updating…</p>
	{/if}
	<RunResults
		{findings}
		{findingsTotal}
		{memories}
		{memoriesTotal}
		running={session.status === 'running'}
	/>
	<SessionTimeline {receipt} />
</div>
