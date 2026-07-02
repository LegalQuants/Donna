<script lang="ts">
	import type { SessionSummary, SessionReceipt } from './types';
	import type { LedgerGate } from '$lib/fiduciary/ledger';
	import { gateVerdict } from '$lib/fiduciary/trust';
	import { formatUsd, formatWhen, statusTone, terminalReasonLabel, triggerLabel } from './display';
	let {
		session,
		receipt,
		gate = null
	}: {
		session: SessionSummary;
		receipt: SessionReceipt | null;
		gate?: LedgerGate | null;
	} = $props();
	const capLabel = $derived(
		session.max_cost_usd === null ? 'no cap' : `${formatUsd(session.max_cost_usd)} cap`
	);
	const verdict = $derived(gateVerdict(gate));
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex flex-wrap items-center gap-2">
		<span class="rounded-full px-2 py-0.5 text-xs font-medium {statusTone(session.status)}"
			>{session.status}</span
		>
		<span class="text-sm text-mlq-text">trigger: {triggerLabel(session.trigger_kind)}</span>
		<span class="text-xs text-mlq-muted tabular-nums"
			>{formatUsd(session.cost_total_usd)} / {capLabel}</span
		>
		{#if session.cost_cap_reached}<span class="text-xs text-mlq-caveats">cost cap reached</span
			>{/if}
		{#if verdict}
			<span
				title={verdict.explanation}
				class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold {verdict.pillClass}"
			>
				<span class="inline-block h-1.5 w-1.5 rounded-full {verdict.dotClass}"></span>
				{verdict.label}
			</span>
		{/if}
		{#if receipt}<span class="ml-auto text-xs text-mlq-muted"
				>{terminalReasonLabel(receipt.terminal_reason)}</span
			>{/if}
	</div>
	<div class="mt-2 text-xs text-mlq-muted">
		started {formatWhen(session.created_at)} · {session.completed_at
			? `finished ${formatWhen(session.completed_at)}`
			: 'running'}
	</div>
	{#if session.error}
		<p class="mt-2 rounded-mlq-control bg-mlq-error/10 p-2 text-xs text-mlq-error">
			Error: {session.error}
		</p>
	{/if}
</div>
