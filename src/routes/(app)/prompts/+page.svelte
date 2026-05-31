<script lang="ts">
  import { untrack } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import PromptRow from '$lib/prompts/PromptRow.svelte';
  import PromptModal from '$lib/prompts/PromptModal.svelte';
  import { createPromptLibrary } from '$lib/prompts/promptLibrary.svelte';
  import type { SavedPrompt, SavedPromptInput } from '$lib/prompts/types';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const lib = createPromptLibrary();
  untrack(() => lib.seed(data.prompts));

  let editing = $state<SavedPrompt | null>(null);
  let modalOpen = $state(false);
  let modalKey = $state(0);
  let confirmingDelete = $state<SavedPrompt | null>(null);

  function openCreate() { editing = null; modalKey++; modalOpen = true; }
  function openEdit(p: SavedPrompt) { editing = p; modalKey++; modalOpen = true; }
  function save(input: SavedPromptInput) {
    return editing ? lib.update(editing.id, input) : lib.create(input);
  }
  async function doDelete() {
    if (!confirmingDelete) return;
    await lib.remove(confirmingDelete.id);
    confirmingDelete = null;
  }

  $effect(() => {
    if (!confirmingDelete) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') confirmingDelete = null; };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>

<svelte:head><title>Prompts — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Prompts</h1>
    <button type="button" onclick={openCreate} class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New prompt</button>
  </div>

  {#if lib.prompts.length === 0}
    <div class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted">No saved prompts yet. Create one, or save a draft from the composer.</div>
  {:else}
    <ul class="rounded-mlq-control border border-mlq-subtle">
      {#each lib.prompts as p (p.id)}
        <li class="border-b border-mlq-subtle last:border-b-0"><PromptRow prompt={p} onedit={() => openEdit(p)} ondelete={() => (confirmingDelete = p)} /></li>
      {/each}
    </ul>
  {/if}
  {#if lib.error}<p class="mt-3 text-sm text-mlq-error">{lib.error}</p>{/if}
</div>

{#key modalKey}
  <PromptModal open={modalOpen} prompt={editing} onsave={save} onclose={() => (modalOpen = false)} />
{/key}

{#if confirmingDelete}
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => (confirmingDelete = null)}></div>
  <div role="dialog" aria-modal="true" aria-label="Delete prompt"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <h2 class="mb-2 text-sm font-medium text-mlq-text">Delete "{confirmingDelete.name}"?</h2>
    <p class="mb-4 text-xs text-mlq-muted">This permanently removes the saved prompt.</p>
    <div class="flex justify-end gap-2">
      <button type="button" onclick={() => (confirmingDelete = null)} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">Cancel</button>
      <button type="button" onclick={doDelete} class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Delete</button>
    </div>
  </div>
{/if}
