<script lang="ts">
  import type { SessionReceipt } from './types';
  import { mergeTimeline } from './timeline';
  import { formatUsd, formatTime, phaseLabel, outcomeTone } from './display';
  let { receipt }: { receipt: SessionReceipt | null } = $props();
  const events = $derived(receipt ? mergeTimeline(receipt) : []);
</script>

<section aria-label="Activity" class="flex flex-col gap-2">
  <div>
    <h2 class="text-sm font-medium text-mlq-strong">Activity</h2>
    <p class="text-xs text-mlq-muted">The run's transparency receipt — phases and tool calls.</p>
  </div>

  {#if !receipt}
    <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-6 text-center">
      <p class="text-sm font-medium text-mlq-text">Receipt unavailable</p>
      <p class="mt-1 text-xs text-mlq-muted">This session ended without a transparency receipt. The status and cost above are still accurate.</p>
    </div>
  {:else if events.length === 0}
    <p class="px-1 py-4 text-xs text-mlq-muted">No activity recorded yet.</p>
  {:else}
    <ol class="relative ml-2 border-l border-mlq-subtle">
      {#each events as ev (ev.order)}
        <li class="relative py-2 pl-5">
          <span aria-hidden="true" class="absolute -left-[5px] top-3.5 h-2.5 w-2.5 rounded-full {ev.kind === 'phase' ? 'bg-mlq-workflow' : 'bg-mlq-success'}"></span>
          {#if ev.kind === 'phase'}
            <span class="text-sm font-medium text-mlq-text">phase: {phaseLabel(ev.label)}</span>
          {:else}
            <span class="font-mono text-xs text-mlq-text">{ev.label}</span>
            {#if ev.outcome}<span class="ml-1 text-xs {outcomeTone(ev.outcome)}">{ev.outcome}</span>{/if}
            {#if ev.cost_usd !== null && ev.cost_usd > 0}<span class="ml-1 text-xs tabular-nums text-mlq-muted">{formatUsd(ev.cost_usd)}</span>{/if}
          {/if}
          {#if ev.timestamp}<span class="ml-2 text-[11px] text-mlq-muted">{formatTime(ev.timestamp)}</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>
