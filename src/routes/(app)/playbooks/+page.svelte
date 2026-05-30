<script lang="ts">
  import PlaybookRow from '$lib/playbooks/PlaybookRow.svelte';
  import { groupByContractFamily } from '$lib/playbooks/contractFamily';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const families = $derived(groupByContractFamily(data.playbooks));
</script>

<svelte:head><title>Playbooks — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Playbooks</h1>
  {#if families.length === 0}
    <div class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted">No playbooks available.</div>
  {:else}
    {#each families as group (group.family)}
      <h2 class="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-mlq-muted first:mt-0">{group.family}</h2>
      <ul class="rounded-mlq-control border border-mlq-subtle">
        {#each group.playbooks as playbook (playbook.id)}
          <li class="border-b border-mlq-subtle last:border-b-0"><PlaybookRow {playbook} /></li>
        {/each}
      </ul>
    {/each}
  {/if}
</div>
