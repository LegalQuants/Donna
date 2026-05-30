<script lang="ts">
  import PositionCard from '$lib/playbooks/PositionCard.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const positions = $derived(
    [...(data.playbook.positions ?? [])].sort((a, b) => (a.position_order ?? 0) - (b.position_order ?? 0))
  );
</script>

<svelte:head><title>{data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <h1 class="mt-2 font-serif text-2xl text-mlq-strong">{data.playbook.name}</h1>
  <div class="mt-1 text-sm text-mlq-muted">
    {data.playbook.contract_type}{#if data.playbook.version} · v{data.playbook.version}{/if} · {positions.length} position{positions.length === 1 ? '' : 's'}
  </div>
  {#if data.playbook.description}
    <p class="mt-2 text-sm text-mlq-text">{data.playbook.description}</p>
  {/if}

  {#if positions.length === 0}
    <p class="mt-6 text-sm text-mlq-muted">No positions defined.</p>
  {:else}
    <div class="mt-6 space-y-3">
      {#each positions as position (position.id)}<PositionCard {position} />{/each}
    </div>
  {/if}
</div>
