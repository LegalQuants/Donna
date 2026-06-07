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
	const session = $derived(live.session ?? initialSession);
	const receipt = $derived(live.session ? live.receipt : initialReceipt);
	const findings = $derived(live.session ? (live.findings ?? initialFindings) : initialFindings);
	const findingsTotal = $derived(
		live.session ? (live.findingsTotal ?? initialFindingsTotal) : initialFindingsTotal
	);
	const memories = $derived(live.session ? (live.memories ?? initialMemories) : initialMemories);
	const memoriesTotal = $derived(
		live.session ? (live.memoriesTotal ?? initialMemoriesTotal) : initialMemoriesTotal
	);

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
