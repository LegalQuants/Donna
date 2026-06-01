<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import SkillRow from '$lib/skills/authoring/SkillRow.svelte';
  import CreateSkillModal from '$lib/skills/authoring/CreateSkillModal.svelte';
  import ForkConfirmModal from '$lib/skills/authoring/ForkConfirmModal.svelte';
  import type { SkillSummary } from '$lib/skills/authoring/types';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let creating = $state(false);
  let forkTarget = $state<SkillSummary | null>(null);
  let builtinQ = $state('');

  const filteredBuiltins = $derived(
    builtinQ.trim()
      ? data.builtins.filter((s) => (s.title + ' ' + (s.description ?? '')).toLowerCase().includes(builtinQ.trim().toLowerCase()))
      : data.builtins
  );
</script>

<svelte:head><title>Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <WorkflowsNav active="skills" />
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Skills</h1>
    <button type="button" onclick={() => (creating = true)}
      class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"><Plus size={13} /> New skill</button>
  </div>

  <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Your skills</h2>
  {#if data.skills.length === 0}
    <div class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted">
      No skills yet. Create one, or fork a built-in below to tweak.
    </div>
  {:else}
    <ul class="rounded-mlq-control border border-mlq-subtle">
      {#each data.skills as s (s.id)}
        <li class="border-b border-mlq-subtle last:border-b-0"><SkillRow skill={s} /></li>
      {/each}
    </ul>
  {/if}

  <h2 class="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-mlq-muted">Built-in skills</h2>
  {#if data.builtins.length === 0}
    <p class="text-sm text-mlq-muted">No built-in skills available.</p>
  {:else}
    <input type="text" aria-label="Search built-in skills" placeholder="Search built-in skills…" bind:value={builtinQ}
      class="mb-2 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none placeholder:text-mlq-muted focus:border-mlq-workflow" />
    {#if filteredBuiltins.length === 0}
      <p class="px-3 py-2 text-xs text-mlq-muted">No matches.</p>
    {:else}
      <ul class="rounded-mlq-control border border-mlq-subtle">
        {#each filteredBuiltins as b (b.name)}
          <li class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-mlq-text">{b.title}</span>
              {#if b.description}<span class="block truncate text-xs text-mlq-muted">{b.description}</span>{/if}
            </span>
            {#if b.tags?.length}<span class="shrink-0 text-xs text-mlq-muted">{b.tags.slice(0, 3).join(' · ')}</span>{/if}
            <button type="button" aria-label="Fork {b.title}" onclick={() => (forkTarget = b)}
              class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50">Fork</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <CreateSkillModal open={creating} onclose={() => (creating = false)} />
  <ForkConfirmModal open={forkTarget !== null} skill={forkTarget} onclose={() => (forkTarget = null)} />
</div>
