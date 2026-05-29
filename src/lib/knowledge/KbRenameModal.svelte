<script lang="ts">
  import { enhance } from '$app/forms';
  import { X } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import type { KnowledgeBase } from './types';

  let { open, kb, onclose }: { open: boolean; kb: KnowledgeBase; onclose: () => void } = $props();

  let name = $state(untrack(() => kb.name));
  let description = $state(untrack(() => kb.description ?? ''));

  $effect(() => {
    if (open) {
      name = kb.name;
      description = kb.description ?? '';
    }
  });

  $effect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });
</script>

{#if open}
  <div
    role="presentation"
    class="fixed inset-0 z-30 bg-black/40"
    onclick={onclose}
  ></div>
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Rename knowledge base"
    class="fixed left-1/2 top-1/2 z-40 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-mlq-text">Rename knowledge base</h2>
      <button type="button" aria-label="Close" onclick={onclose} class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button>
    </div>

    <form
      method="POST"
      action="?/rename"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') onclose();
      }}
      aria-label="Rename knowledge base"
      class="space-y-3"
    >
      <label class="block text-xs text-mlq-muted">
        Name
        <input
          name="name"
          type="text"
          required
          bind:value={name}
          class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
        />
      </label>
      <label class="block text-xs text-mlq-muted">
        Description
        <textarea
          name="description"
          rows="3"
          bind:value={description}
          class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
        ></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" onclick={onclose} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">Cancel</button>
        <button type="submit" class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">Save</button>
      </div>
    </form>
  </div>
{/if}
