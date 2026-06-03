<script lang="ts">
  import type { TabularPreviewCostResponse } from './types';

  let {
    preview,
    busy,
    onconfirm,
    oncancel
  }: {
    preview: TabularPreviewCostResponse;
    busy: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  $effect(() => {
    function onkey(e: KeyboardEvent) {
      if (e.key === 'Escape') oncancel();
    }
    document.addEventListener('keydown', onkey);
    return () => document.removeEventListener('keydown', onkey);
  });

  const tiers = $derived(Object.entries(preview.per_tier_breakdown ?? {}));
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
  <div role="dialog" aria-modal="true" aria-label="Confirm review cost" class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg">
    <h2 class="font-serif text-lg text-mlq-strong">Run this review?</h2>
    <p class="mt-2 text-sm text-mlq-text">
      <span class="font-semibold">{preview.cells_count} cells</span> · estimated
      <span class="font-semibold">${preview.estimated_cost_usd}</span>
    </p>
    {#if tiers.length}
      <ul class="mt-3 space-y-0.5 text-xs text-mlq-muted">
        {#each tiers as [tier, count] (tier)}
          <li>{tier}: {count}</li>
        {/each}
      </ul>
    {/if}
    <p class="mt-3 text-xs text-mlq-muted">Cost is an estimate. You'll be able to cancel a running review.</p>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" onclick={oncancel} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text">Cancel</button>
      <button type="button" aria-label="Run review" onclick={onconfirm} disabled={busy} class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-sm text-white disabled:opacity-40">
        {busy ? 'Starting…' : 'Run review'}
      </button>
    </div>
  </div>
</div>
