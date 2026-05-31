<script lang="ts">
  import { BookMarked } from '@lucide/svelte';
  import TagInput from '$lib/skills/authoring/TagInput.svelte';
  import type { SavedPrompt, SavedPromptInput } from './types';

  let { prompts, loading = false, error = null, draft, onopen, oninsert, onsave }: {
    prompts: SavedPrompt[];
    loading?: boolean;
    error?: string | null;
    draft: string;
    onopen: () => void;
    oninsert: (text: string) => void;
    onsave: (input: SavedPromptInput) => Promise<boolean>;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let query = $state('');
  let saving = $state(false);
  let savingDraft = $state(false);
  let newName = $state('');
  let newTags = $state<string[]>([]);

  const filtered = $derived(
    query.trim()
      ? prompts.filter((p) => (p.name + ' ' + (p.tags ?? []).join(' ')).toLowerCase().includes(query.trim().toLowerCase()))
      : prompts
  );
  const canSaveDraft = $derived(newName.trim().length > 0 && draft.trim().length > 0 && !saving);

  function toggle() {
    open = !open;
    if (open) { onopen(); query = ''; savingDraft = false; }
  }
  function pick(p: SavedPrompt) {
    oninsert(p.prompt_text);
    open = false;
  }
  async function saveDraft() {
    if (!canSaveDraft) return;
    saving = true;
    const ok = await onsave({ name: newName.trim(), prompt_text: draft, tags: newTags });
    saving = false;
    if (ok) { newName = ''; newTags = []; savingDraft = false; }
  }

  $effect(() => {
    if (!open) return;
    const onkey = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    const onclick = (e: MouseEvent) => { if (root && !root.contains(e.target as Node)) open = false; };
    document.addEventListener('keydown', onkey);
    document.addEventListener('mousedown', onclick);
    return () => { document.removeEventListener('keydown', onkey); document.removeEventListener('mousedown', onclick); };
  });
</script>

<div bind:this={root} class="relative">
  <button type="button" data-testid="prompt-picker" aria-haspopup="dialog" aria-expanded={open} aria-label="Prompts" onclick={toggle}
    class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"><BookMarked size={13} /> Prompts</button>

  {#if open}
    <div class="absolute bottom-full left-0 z-20 mb-1 w-80 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md">
      <input type="text" placeholder="Search prompts…" bind:value={query}
        class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted" />
      {#if error}
        <p class="px-3 py-2 text-xs text-mlq-error">{error}</p>
      {:else if loading}
        <p class="px-3 py-2 text-xs text-mlq-muted">Loading…</p>
      {:else if filtered.length === 0}
        <p class="px-3 py-2 text-xs text-mlq-muted">No saved prompts.</p>
      {:else}
        <ul class="max-h-56 overflow-y-auto">
          {#each filtered as p (p.id)}
            <li>
              <button type="button" aria-label={`Insert ${p.name}`} onclick={() => pick(p)} class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50">
                <span class="font-medium text-mlq-text">{p.name}</span>
                <span class="mt-0.5 block truncate text-mlq-muted">{p.prompt_text}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="border-t border-mlq-subtle p-2">
        {#if !savingDraft}
          <button type="button" onclick={() => (savingDraft = true)} disabled={draft.trim().length === 0}
            class="w-full rounded-mlq-control px-2 py-1 text-left text-xs text-mlq-workflow hover:bg-mlq-subtle/50 disabled:opacity-40">+ Save current draft as a prompt</button>
        {:else}
          <input type="text" placeholder="Name this prompt…" bind:value={newName}
            class="mb-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-xs text-mlq-text outline-none" />
          <div class="mb-1"><TagInput bind:tags={newTags} /></div>
          <div class="flex justify-end gap-2">
            <button type="button" onclick={() => (savingDraft = false)} class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text">Cancel</button>
            <button type="button" onclick={saveDraft} disabled={!canSaveDraft} class="rounded-mlq-control bg-mlq-strong px-2 py-0.5 text-xs text-white disabled:opacity-40">Save</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
