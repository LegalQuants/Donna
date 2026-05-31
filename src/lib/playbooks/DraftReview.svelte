<script lang="ts">
  import { untrack } from 'svelte';
  import type { DraftPlaybook, PlaybookCreate, PositionCreate } from './types';
  import PositionCard from './PositionCard.svelte';

  let { draft, onchange }: { draft: DraftPlaybook; onchange: (value: PlaybookCreate) => void } = $props();

  const positions = untrack(() => draft.positions ?? []);
  let name = $state(untrack(() => draft.name));
  let contractType = $state(untrack(() => draft.contract_type));
  let description = $state(untrack(() => draft.description ?? ''));
  let kept = $state(positions.map(() => true));

  const value = $derived<PlaybookCreate>({
    name,
    contract_type: contractType,
    description,
    version: draft.version,
    positions: positions.filter((_: PositionCreate, i: number) => kept[i])
  });
  $effect(() => onchange(value));
</script>

<div class="space-y-3">
  <div>
    <label for="pb-name" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Playbook name</label>
    <input id="pb-name" bind:value={name} class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text" />
  </div>
  <div class="flex gap-3">
    <div class="flex-1">
      <label for="pb-type" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Contract type</label>
      <input id="pb-type" bind:value={contractType} class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text" />
    </div>
  </div>
  <div>
    <label for="pb-desc" class="block text-xs font-medium uppercase tracking-wide text-mlq-muted">Description</label>
    <textarea id="pb-desc" bind:value={description} rows="2" class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text"></textarea>
  </div>

  <p class="text-xs text-mlq-muted">{kept.filter(Boolean).length} of {positions.length} positions kept — uncheck any to drop before saving.</p>
  <div class="space-y-2">
    {#each positions as position, i (i)}
      <div class="flex items-start gap-2 {kept[i] ? '' : 'opacity-50'}">
        <input type="checkbox" class="mt-4" bind:checked={kept[i]} aria-label={`keep ${position.issue}`} />
        <div class="min-w-0 flex-1"><PositionCard {position} /></div>
      </div>
    {/each}
  </div>
</div>
