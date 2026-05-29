<script lang="ts">
  import { Plus, GitFork } from '@lucide/svelte';
  import SkillRow from '$lib/skills/authoring/SkillRow.svelte';
  import CreateSkillModal from '$lib/skills/authoring/CreateSkillModal.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let creating = $state(false);
  let forking = $state(false);
</script>

<svelte:head><title>Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Skills</h1>
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => (forking = true)}
        class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
      ><GitFork size={13} /> Browse &amp; fork</button>
      <button
        type="button"
        onclick={() => (creating = true)}
        class="inline-flex items-center gap-1 rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface"
      ><Plus size={13} /> New skill</button>
    </div>
  </div>

  {#if data.skills.length === 0}
    <div class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted">
      No skills yet. Create one, or fork a built-in to tweak.
    </div>
  {:else}
    <ul class="rounded-mlq-control border border-mlq-subtle">
      {#each data.skills as s (s.id)}
        <li class="border-b border-mlq-subtle last:border-b-0"><SkillRow skill={s} /></li>
      {/each}
    </ul>
  {/if}

  <CreateSkillModal open={creating} onclose={() => (creating = false)} />
  {#if forking}<!-- ForkBrowser mounts here (Task 8) -->{/if}
</div>
