<script lang="ts">
  import type { FallbackTier } from '../types';

  let { tiers = $bindable<FallbackTier[]>([]) }: { tiers?: FallbackTier[] } = $props();

  function add() {
    tiers = [...tiers, { rank: tiers.length + 1, description: '', language: '' }];
  }
  function remove(i: number) {
    tiers = tiers.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, rank: idx + 1 }));
  }
</script>

<div class="space-y-2">
  {#each tiers as tier, i (i)}
    <div class="rounded-mlq-control border border-mlq-subtle p-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Tier {tier.rank}</span>
        <button type="button" onclick={() => remove(i)} aria-label={`Remove tier ${tier.rank}`} class="text-xs text-mlq-muted hover:text-mlq-error">Remove</button>
      </div>
      <input bind:value={tier.description} placeholder="When this tier applies (short label)" aria-label={`Tier ${tier.rank} description`}
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text" />
      <textarea bind:value={tier.language} rows="2" placeholder="Fallback clause language" aria-label={`Tier ${tier.rank} language`}
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text"></textarea>
    </div>
  {/each}
  <button type="button" onclick={add} class="text-xs text-mlq-workflow hover:underline">+ Add fallback tier</button>
</div>
