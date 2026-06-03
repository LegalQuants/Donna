<script lang="ts">
  import type { TabularExecutionSummary, ExecutionStatus } from './types';

  let { summary }: { summary: TabularExecutionSummary } = $props();

  const badge: Record<ExecutionStatus, string> = {
    completed: 'bg-mlq-success',
    failed: 'bg-mlq-error',
    cancelled: 'bg-mlq-muted',
    running: 'bg-mlq-workflow',
    pending: 'bg-mlq-workflow'
  };

  const docCols = $derived(
    `${summary.document_count} doc${summary.document_count === 1 ? '' : 's'} · ` +
      `${summary.column_count} col${summary.column_count === 1 ? '' : 's'}`
  );
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app execution link -->
<a href="/tabular/{summary.id}" class="flex items-center gap-3 px-4 py-3 hover:bg-mlq-surface-alt">
  <span class="inline-flex shrink-0 items-center gap-1.5 text-xs text-mlq-muted">
    <span class="inline-block h-2 w-2 rounded-full {badge[summary.status]}"></span>
    {summary.status}
  </span>
  <span class="min-w-0 truncate text-sm text-mlq-text">{docCols}</span>
  {#if summary.cost_estimate_usd}
    <span class="shrink-0 text-xs text-mlq-muted">est. ${summary.cost_estimate_usd}</span>
  {/if}
  <span class="ml-auto shrink-0 text-xs text-mlq-muted">{new Date(summary.created_at).toLocaleDateString()}</span>
</a>
