<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import type { KnowledgeBase } from '$lib/knowledge/types';
  import CreateKbForm from '$lib/knowledge/CreateKbForm.svelte';

  let { kbs, onpick }: { kbs: KnowledgeBase[]; onpick: (kbId: string) => void } = $props();

  let open = $state(false);
  let mode = $state<'list' | 'create'>('list');
  let q = $state('');
  let root = $state<HTMLElement>();

  const filtered = $derived(
    q.trim() ? kbs.filter((k) => k.name.toLowerCase().includes(q.trim().toLowerCase())) : kbs
  );

  function choose(id: string) {
    onpick(id);
    open = false;
    mode = 'list';
    q = '';
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
      mode = 'list';
    }
  }
  function startCreate() {
    mode = 'create';
  }
  function onCreateSubmit() {
    open = false;
    mode = 'list';
    q = '';
  }
  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) {
        open = false;
        mode = 'list';
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative inline-block" {onkeydown}>
  <button
    type="button"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="Link a knowledge base"
    onclick={() => (open = !open)}
    class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
  >
    <Plus size={13} /> Link a knowledge base
  </button>

  {#if open}
    <div class="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md">
      {#if mode === 'create'}
        <CreateKbForm onsubmit={onCreateSubmit} />
      {:else}
        <button
          type="button"
          onclick={startCreate}
          class="flex w-full items-center gap-1 border-b border-mlq-subtle px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50"
        ><Plus size={12} /> Create new KB</button>
        <input
          type="text"
          placeholder="Search knowledge bases…"
          bind:value={q}
          class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
        />
        {#if kbs.length === 0}
          <p class="px-3 py-3 text-xs text-mlq-muted">No other knowledge bases to link.</p>
        {:else if filtered.length === 0}
          <p class="px-3 py-2 text-xs text-mlq-muted">No matches.</p>
        {:else}
          <ul class="max-h-64 overflow-y-auto">
            {#each filtered as k (k.id)}
              <li>
                <button
                  type="button"
                  onclick={() => choose(k.id)}
                  class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50"
                >
                  <span class="font-medium text-mlq-text">{k.name}</span>
                  <span class="ml-2 text-mlq-muted">{k.file_count} files</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
</div>
