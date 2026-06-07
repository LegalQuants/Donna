<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import TabularExecutionRow from '$lib/tabular/TabularExecutionRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Tabular reviews — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Tabular reviews</h1>
    <a href="/tabular/new" class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New review</a>
  </div>

  {#if data.executions.length === 0}
    <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-10 text-center">
      <p class="text-sm text-mlq-muted">No tabular reviews yet — start one to ask the same questions across many documents.</p>
      <a href="/tabular/new" class="mt-3 inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New review</a>
    </div>
  {:else}
    <ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
      {#each data.executions as execution (execution.id)}
        <li><TabularExecutionRow summary={execution} /></li>
      {/each}
    </ul>
  {/if}
</div>
