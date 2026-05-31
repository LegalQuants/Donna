<script lang="ts">
  import PlaybookRow from '$lib/playbooks/PlaybookRow.svelte';
  import { groupByContractFamily } from '$lib/playbooks/contractFamily';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const families = $derived(groupByContractFamily(data.playbooks));
</script>

<svelte:head><title>Playbooks — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app new-playbook link -->
    <a href="/playbooks/new" class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">+ New playbook</a>
  </div>
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
