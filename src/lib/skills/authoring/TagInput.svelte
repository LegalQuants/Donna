<script lang="ts">
  import { X } from '@lucide/svelte';
  import { deriveSlug } from './deriveSlug';

  let { tags = $bindable([]) }: { tags?: string[] } = $props();
  let draft = $state('');

  function commit() {
    const t = deriveSlug(draft);
    draft = '';
    if (!t || tags.includes(t)) return;
    tags = [...tags, t];
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && tags.length) {
      tags = tags.slice(0, -1);
    }
  }

  function remove(t: string) {
    tags = tags.filter((x) => x !== t);
  }
</script>

<div class="flex flex-wrap items-center gap-1 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 focus-within:border-mlq-workflow">
  {#each tags as t (t)}
    <span class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text">
      {t}
      <input type="hidden" name="tags" value={t} />
      <button type="button" aria-label="Remove tag {t}" onclick={() => remove(t)} class="text-mlq-muted hover:text-mlq-text"><X size={11} /></button>
    </span>
  {/each}
  <input
    type="text"
    aria-label="Add a tag"
    placeholder="Add a tag…"
    bind:value={draft}
    {onkeydown}
    onblur={commit}
    class="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-mlq-text outline-none placeholder:text-mlq-muted"
  />
</div>
