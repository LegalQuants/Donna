<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import PlaybookRow from '$lib/playbooks/PlaybookRow.svelte';
  import { groupByContractFamily } from '$lib/playbooks/contractFamily';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const families = $derived(groupByContractFamily(data.playbooks));

  let menuOpen = $state(false);
  $effect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') menuOpen = false; };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>

<svelte:head><title>Playbooks — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <WorkflowsNav active="playbooks" />
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
    <div class="relative">
      <button type="button" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen} aria-haspopup="menu"
        class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New playbook</button>
      {#if menuOpen}
        <div role="presentation" class="fixed inset-0 z-30" onclick={() => (menuOpen = false)}></div>
        <div class="absolute right-0 z-40 mt-1 w-56 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-1 shadow-xl">
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app generate link -->
          <a href="/playbooks/new" class="block rounded-mlq-control px-2.5 py-1.5 text-sm text-mlq-text hover:bg-mlq-subtle">Generate from documents</a>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app manual link -->
          <a href="/playbooks/new/manual" class="block rounded-mlq-control px-2.5 py-1.5 text-sm text-mlq-text hover:bg-mlq-subtle">Start from scratch</a>
        </div>
      {/if}
    </div>
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
