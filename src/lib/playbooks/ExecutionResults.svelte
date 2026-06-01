<script lang="ts">
  import type { ExecutionResults } from './types';
  import { compareByVerdict } from './verdict';
  import ResultSummary from './ResultSummary.svelte';
  import ResultCard from './ResultCard.svelte';
  import RedlineDocument from './RedlineDocument.svelte';

  let { results }: { results: ExecutionResults } = $props();
  const ordered = $derived([...results.positions].sort(compareByVerdict));
  let view = $state<'cards' | 'redlines'>('cards');

  const segClass = (active: boolean) =>
    `rounded-mlq-control px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow ${
      active ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'
    }`;
</script>

<ResultSummary summary={results.summary} />

<div class="mt-3 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1" role="group" aria-label="Results view">
  <button type="button" aria-pressed={view === 'cards'} class={segClass(view === 'cards')} onclick={() => (view = 'cards')}>Verdict cards</button>
  <button type="button" aria-pressed={view === 'redlines'} class={segClass(view === 'redlines')} onclick={() => (view = 'redlines')}>Redlines</button>
</div>

{#if view === 'cards'}
  <div class="mt-4 space-y-3">
    {#each ordered as result (result.position_id)}<ResultCard {result} />{/each}
  </div>
{:else}
  <div class="mt-4"><RedlineDocument {results} /></div>
{/if}
