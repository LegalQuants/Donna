<script lang="ts">
  import type { SessionSummary, SessionReceipt } from './types';
  import { formatUsd, formatWhen, statusTone, terminalReasonLabel, triggerLabel } from './display';
  let { session, receipt }: { session: SessionSummary; receipt: SessionReceipt | null } = $props();
  const capLabel = $derived(session.max_cost_usd === null ? 'no cap' : `${formatUsd(session.max_cost_usd)} cap`);
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex flex-wrap items-center gap-2">
    <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusTone(session.status)}">{session.status}</span>
    <span class="text-sm text-mlq-text">trigger: {triggerLabel(session.trigger_kind)}</span>
    <span class="text-xs tabular-nums text-mlq-muted">{formatUsd(session.cost_total_usd)} / {capLabel}</span>
    {#if session.cost_cap_reached}<span class="text-xs text-amber-400">cost cap reached</span>{/if}
    <span class="ml-auto text-xs text-mlq-muted">{terminalReasonLabel(receipt?.terminal_reason ?? null)}</span>
  </div>
  <div class="mt-2 text-xs text-mlq-muted">
    started {formatWhen(session.created_at)} · {session.completed_at ? `finished ${formatWhen(session.completed_at)}` : 'running'}
  </div>
  {#if session.error}
    <p class="mt-2 rounded-mlq-control bg-rose-500/10 p-2 text-xs text-rose-300">Error: {session.error}</p>
  {/if}
</div>
