<script lang="ts">
  import { FolderKanban, ChevronDown } from '@lucide/svelte';
  import type { MatterSummary } from './types';

  let { matters, selectedId = $bindable<string | null>(null), placement = 'up' }:
    { matters: MatterSummary[]; selectedId?: string | null; placement?: 'up' | 'down' } = $props();

  let open = $state(false);
  let q = $state('');
  let root = $state<HTMLElement>();

  const current = $derived(matters.find((m) => m.id === selectedId) ?? null);
  const filtered = $derived(
    q.trim() ? matters.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())) : matters
  );

  function choose(id: string | null) {
    selectedId = id;
    open = false;
    q = '';
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative" {onkeydown}>
  <button
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="Choose matter"
    onclick={() => (open = !open)}
    class="inline-flex max-w-[180px] items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs {current ? 'text-mlq-text' : 'text-mlq-muted'}"
  >
    <FolderKanban size={13} />
    <span class="truncate">{current ? current.name : 'Matter'}</span>
    <ChevronDown size={12} />
  </button>

  {#if open}
    <div class="absolute {placement === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'} left-0 z-20 w-64 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md">
      <input
        type="text"
        aria-label="Search matters"
        placeholder="Search matters…"
        bind:value={q}
        class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
      />
      <ul class="max-h-64 overflow-y-auto">
        <li>
          <button type="button" onclick={() => choose(null)}
                  class="block w-full px-3 py-2 text-left text-xs text-mlq-muted hover:bg-mlq-subtle/50 {selectedId === null ? 'bg-mlq-subtle/40' : ''}">
            No matter (general)
          </button>
        </li>
        {#each filtered as m (m.id)}
          <li>
            <button type="button" onclick={() => choose(m.id)}
                    class="block w-full truncate px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50 {selectedId === m.id ? 'bg-mlq-subtle/40' : ''}">
              {m.name}
            </button>
          </li>
        {/each}
        {#if filtered.length === 0}
          <li class="px-3 py-2 text-xs text-mlq-muted">No matters found.</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
