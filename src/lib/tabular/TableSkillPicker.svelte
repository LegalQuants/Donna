<script lang="ts">
  import type { TableSkillSummary } from './types';

  let { skills, selected, onselect }: {
    skills: TableSkillSummary[];
    selected: TableSkillSummary | null;
    onselect: (s: TableSkillSummary) => void;
  } = $props();

  let q = $state('');
  const filtered = $derived(
    q.trim() ? skills.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase())) : skills
  );
</script>

{#if skills.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle px-3 py-6 text-center text-xs text-mlq-muted">
    No table skills available. Create a skill with <code>output_format: table</code> to use one here.
  </div>
{:else}
  <div class="rounded-mlq-control border border-mlq-subtle">
    <input
      type="text"
      aria-label="Search table skills"
      placeholder="Search table skills…"
      bind:value={q}
      class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
    />
    <ul class="max-h-64 overflow-y-auto">
      {#each filtered as s (s.name)}
        <li>
          <button
            type="button"
            onclick={() => onselect(s)}
            class="block w-full px-3 py-2 text-left hover:bg-mlq-subtle/50 {selected?.name === s.name ? 'bg-mlq-subtle/40' : ''}"
          >
            <span class="block truncate text-sm text-mlq-text">{s.title}</span>
            {#if s.description}<span class="block truncate text-xs text-mlq-muted">{s.description}</span>{/if}
          </button>
        </li>
      {/each}
      {#if filtered.length === 0}
        <li class="px-3 py-2 text-xs text-mlq-muted">No table skills match.</li>
      {/if}
    </ul>
  </div>
{/if}
