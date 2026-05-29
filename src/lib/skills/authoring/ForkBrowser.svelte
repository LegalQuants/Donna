<script lang="ts">
  import { enhance } from '$app/forms';
  import { X } from '@lucide/svelte';
  import type { SkillSummary } from './types';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let items = $state<SkillSummary[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let q = $state('');
  let selected = $state<SkillSummary | null>(null);
  let newName = $state('');
  let forkError = $state<string | null>(null);

  const filtered = $derived(
    q.trim()
      ? items.filter((s) => (s.title + ' ' + (s.description ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
      : items
  );

  async function fetchBuiltins() {
    loading = true;
    failed = false;
    try {
      const res = await fetch('/skills/builtins');
      if (!res.ok) throw new Error(String(res.status));
      items = (await res.json()) as SkillSummary[];
    } catch {
      failed = true;
      items = [];
    } finally {
      loading = false;
    }
  }

  function choose(s: SkillSummary) {
    selected = s;
    newName = s.title;
    forkError = null;
  }

  // Load on open; reset transient state to a clean slate when closed.
  $effect(() => {
    if (open) {
      void fetchBuiltins();
    } else {
      selected = null;
      q = '';
      forkError = null;
      newName = '';
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
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={onclose}></div>
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Browse and fork a skill"
    class="fixed left-1/2 top-1/2 z-40 max-h-[80vh] w-[30rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-xl"
  >
    <div class="flex items-center justify-between border-b border-mlq-subtle px-3 py-2">
      <h2 class="text-sm font-medium text-mlq-text">{selected ? 'Fork skill' : 'Fork a built-in skill'}</h2>
      <button type="button" aria-label="Close" onclick={onclose} class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button>
    </div>

    {#if selected}
      <form
        method="POST"
        action="?/fork"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'failure') forkError = (result.data as { error?: string } | undefined)?.error ?? 'Could not fork the skill.';
        }}
        aria-label="Fork skill"
        class="space-y-3 p-3"
      >
        <input type="hidden" name="skill_name" value={selected.name} />
        <label class="block text-xs text-mlq-muted">
          New name
          <input name="new_name" type="text" bind:value={newName}
            class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow" />
        </label>
        {#if forkError}
          <p class="text-xs text-mlq-error">{forkError}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => { selected = null; forkError = null; }} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text">Back</button>
          <button type="submit" class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">Fork</button>
        </div>
      </form>
    {:else}
      <input
        type="text"
        aria-label="Search built-in skills"
        placeholder="Search built-in skills…"
        bind:value={q}
        class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none placeholder:text-mlq-muted focus:border-mlq-workflow"
      />
      {#if loading}
        <p class="px-3 py-3 text-xs text-mlq-muted">Loading…</p>
      {:else if failed}
        <p class="px-3 py-3 text-xs text-mlq-error">Couldn't load built-in skills.</p>
      {:else if filtered.length === 0}
        <p class="px-3 py-3 text-xs text-mlq-muted">No matches.</p>
      {:else}
        <ul class="max-h-[50vh] overflow-y-auto">
          {#each filtered as s (s.name)}
            <li class="flex items-center gap-2 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-mlq-text">{s.title}</span>
                {#if s.description}<span class="block truncate text-xs text-mlq-muted">{s.description}</span>{/if}
              </span>
              <button type="button" aria-label="Fork {s.title}" onclick={() => choose(s)} class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50">Fork</button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}
