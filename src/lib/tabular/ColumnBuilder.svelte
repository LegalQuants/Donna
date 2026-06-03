<script lang="ts">
  import { Plus, X } from '@lucide/svelte';
  import type { createTabularBuilder } from './tabularBuilder.svelte';

  let { builder }: { builder: ReturnType<typeof createTabularBuilder> } = $props();
</script>

<div class="space-y-2">
  {#each builder.columns as col (col.id)}
    <div class="flex items-start gap-2">
      <div class="flex-1 space-y-1">
        <input
          value={col.name}
          oninput={(e) => builder.setColumn(col.id, { name: e.currentTarget.value })}
          placeholder="Column name"
          aria-label="Column name"
          class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
        />
        <input
          value={col.query}
          oninput={(e) => builder.setColumn(col.id, { query: e.currentTarget.value })}
          placeholder="What should we extract? e.g. Which state's law governs?"
          aria-label="Column question"
          class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
        />
      </div>
      {#if builder.columns.length > 1}
        <button
          type="button"
          aria-label="Remove column"
          onclick={() => builder.removeColumn(col.id)}
          class="mt-1.5 text-mlq-muted hover:text-mlq-text"
        >
          <X size={16} />
        </button>
      {/if}
    </div>
  {/each}
  <button
    type="button"
    onclick={() => builder.addColumn()}
    class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow"
  >
    <Plus size={13} aria-hidden="true" /> Add column
  </button>
</div>
