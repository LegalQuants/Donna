<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { TabularCell } from './types';

  let { column, cell, onclose }: { column: string; cell: TabularCell; onclose: () => void } = $props();

  $effect(() => {
    function onkey(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('keydown', onkey);
    return () => document.removeEventListener('keydown', onkey);
  });
</script>

<div class="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-mlq-subtle bg-mlq-surface p-5 shadow-lg" role="dialog" aria-label="Cell detail">
  <div class="flex items-start justify-between">
    <h3 class="font-serif text-base text-mlq-strong">{column}</h3>
    <button type="button" aria-label="Close" onclick={onclose} class="text-mlq-muted hover:text-mlq-text"><X size={16} /></button>
  </div>
  {#if cell.confidence === 'failed'}
    <p class="mt-3 text-sm text-mlq-error">(failed){cell.error ? ` — ${cell.error}` : ''}</p>
  {:else}
    <p class="mt-3 whitespace-pre-wrap text-sm text-mlq-text">{cell.value}</p>
    <p class="mt-3 text-xs text-mlq-muted">Confidence: {cell.confidence}</p>
    <p class="text-xs text-mlq-muted">{cell.cited_chunk_ids.length} citation{cell.cited_chunk_ids.length === 1 ? '' : 's'}</p>
  {/if}
</div>
