<script lang="ts">
  import { enhance } from '$app/forms';
  import PositionCard from '$lib/playbooks/PositionCard.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const positions = $derived(
    [...(data.playbook.positions ?? [])].sort((a, b) => (a.position_order ?? 0) - (b.position_order ?? 0))
  );

  let confirmingDelete = $state(false);
  $effect(() => {
    if (!confirmingDelete) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') confirmingDelete = false; };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>

<svelte:head><title>{data.playbook.name} — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app back link -->
  <a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
  <div class="mt-2 flex items-start justify-between gap-3">
    <h1 class="font-serif text-2xl text-mlq-strong">{data.playbook.name}</h1>
    <div class="flex shrink-0 items-center gap-2">
      {#if data.isOwner}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app edit link -->
        <a href="/playbooks/{data.playbook.id}/edit" class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow">Edit</a>
        <button type="button" onclick={() => (confirmingDelete = true)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-error">Delete</button>
      {/if}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app duplicate link -->
      <a href="/playbooks/new/manual?from={data.playbook.id}" class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow">Duplicate</a>
    </div>
  </div>
  <div class="mt-1 text-sm text-mlq-muted">
    {data.playbook.contract_type}{#if data.playbook.version} · v{data.playbook.version}{/if} · {positions.length} position{positions.length === 1 ? '' : 's'}
  </div>
  {#if data.isAdmin}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app run link -->
    <a href="/playbooks/{data.playbook.id}/run" class="mt-3 inline-block rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface hover:opacity-90">Apply to a document</a>
  {:else}
    <p class="mt-3 text-xs text-mlq-muted">Running built-in playbooks requires an admin account in this version.</p>
  {/if}
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

{#if confirmingDelete}
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => (confirmingDelete = false)}></div>
  <div role="dialog" aria-modal="true" aria-label="Delete playbook"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <h2 class="mb-2 text-sm font-medium text-mlq-text">Delete "{data.playbook.name}"?</h2>
    <p class="mb-4 text-xs text-mlq-muted">This permanently removes the playbook and its positions. This can't be undone.</p>
    <form method="POST" action="?/delete" use:enhance class="flex justify-end gap-2">
      <button type="button" onclick={() => (confirmingDelete = false)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">Cancel</button>
      <button type="submit" class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Delete</button>
    </form>
  </div>
{/if}
