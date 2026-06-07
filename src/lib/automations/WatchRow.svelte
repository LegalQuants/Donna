<!-- src/lib/automations/WatchRow.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { WatchSummary } from './watches';

  let { watch, kbLabel, sourceLabel }: { watch: WatchSummary; kbLabel: string; sourceLabel: string } = $props();

  // Two-step confirm so an accidental click can't delete a watch.
  let confirmingDelete = $state(false);
</script>

<div class="flex items-center gap-3 rounded-mlq-control border border-mlq-subtle p-3">
  <div class="min-w-0">
    <div class="truncate text-sm text-mlq-text">{kbLabel}</div>
    <div class="truncate text-xs text-mlq-muted">{sourceLabel} · watches for new documents</div>
  </div>

  <form method="POST" action="?/toggle" use:enhance class="ml-auto shrink-0">
    <input type="hidden" name="id" value={watch.id} />
    <input type="hidden" name="enabled" value={watch.enabled ? 'false' : 'true'} />
    <button type="submit" aria-pressed={watch.enabled}
      class="rounded-full px-2 py-0.5 text-xs font-medium {watch.enabled ? 'bg-mlq-success/15 text-mlq-success' : 'bg-mlq-subtle text-mlq-muted'}">
      {watch.enabled ? 'On' : 'Off'}
    </button>
  </form>

  <a href="/automations/watches/{watch.id}" class="shrink-0 text-xs text-mlq-workflow hover:underline">Edit</a>

  {#if confirmingDelete}
    <form method="POST" action="?/delete" use:enhance class="flex shrink-0 items-center gap-2">
      <input type="hidden" name="id" value={watch.id} />
      <button type="submit" class="text-xs font-medium text-mlq-error hover:underline">Confirm</button>
      <button type="button" onclick={() => (confirmingDelete = false)} class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button>
    </form>
  {:else}
    <button type="button" onclick={() => (confirmingDelete = true)} class="shrink-0 text-xs text-mlq-error hover:underline">Delete</button>
  {/if}
</div>
