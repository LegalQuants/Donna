<script lang="ts">
  import { Plus, FolderKanban } from '@lucide/svelte';
  import MatterForm from '$lib/matters/MatterForm.svelte';
  import PrivilegedChip from '$lib/matters/PrivilegedChip.svelte';

  let { data, form } = $props();
  let showCreate = $state(false);

  $effect(() => {
    if (!showCreate) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') showCreate = false; };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  });
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="font-serif text-2xl text-mlq-strong">Matters</h1>
    <button type="button" onclick={() => (showCreate = true)}
            class="inline-flex items-center gap-1.5 rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white">
      <Plus size={14} /> New matter
    </button>
  </div>

  {#if data.matters.length === 0}
    <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-10 text-center">
      <FolderKanban size={28} class="mx-auto text-mlq-muted" />
      <p class="mt-3 text-sm text-mlq-muted">No matters yet — create one to organize chats and documents.</p>
    </div>
  {:else}
    <ul class="divide-y divide-mlq-subtle rounded-mlq-control border border-mlq-subtle">
      {#each data.matters as m (m.id)}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app matter link -->
          <a href="/matters/{m.id}" class="flex items-center gap-3 px-4 py-3 hover:bg-mlq-surface-alt">
            <div class="min-w-0">
              <div class="flex items-center gap-2 font-serif text-sm text-mlq-text">
                <span class="truncate">{m.name}</span>
                {#if m.privileged}<PrivilegedChip />{/if}
              </div>
              {#if m.description}<div class="truncate text-xs text-mlq-muted">{m.description}</div>{/if}
            </div>
            <span class="ml-auto shrink-0 text-xs text-mlq-muted">{new Date(m.updated_at).toLocaleDateString()}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if showCreate}
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showCreate = false; }}>
    <div class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg" role="dialog" aria-modal="true" aria-label="New matter">
      <h2 class="mb-4 font-serif text-lg text-mlq-strong">New matter</h2>
      <MatterForm action="?/create" submitLabel="Create matter" error={form?.error ?? ''} />
    </div>
  </div>
{/if}
