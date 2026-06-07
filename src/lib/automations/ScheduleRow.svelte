<!-- src/lib/automations/ScheduleRow.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ScheduleSummary } from './schedules';
  import { describeCron } from './cron';
  import { formatWhen } from './display';

  let { schedule, sourceLabel }: { schedule: ScheduleSummary; sourceLabel: string } = $props();

  // Title is the name when set, else the source. The subtitle repeats the source
  // only when a distinct name is shown, so unnamed rows don't show it twice. Built
  // as one string so it stays a single text node.
  const subtitle = $derived(
    schedule.name ? `${describeCron(schedule.cron_expr)} · ${sourceLabel}` : describeCron(schedule.cron_expr)
  );

  // Two-step confirm so an accidental click can't delete a schedule.
  let confirmingDelete = $state(false);
</script>

<div class="flex items-center gap-3 rounded-mlq-control border border-mlq-subtle p-3">
  <div class="min-w-0">
    <div class="truncate text-sm text-mlq-text">{schedule.name ?? sourceLabel}</div>
    <div class="truncate text-xs text-mlq-muted">{subtitle}</div>
  </div>

  <span class="ml-auto shrink-0 text-xs text-mlq-muted">next: {formatWhen(schedule.next_run_at)}</span>

  <form method="POST" action="?/toggle" use:enhance class="shrink-0">
    <input type="hidden" name="id" value={schedule.id} />
    <input type="hidden" name="enabled" value={schedule.enabled ? 'false' : 'true'} />
    <button type="submit" aria-pressed={schedule.enabled}
      class="rounded-full px-2 py-0.5 text-xs font-medium {schedule.enabled ? 'bg-mlq-success/15 text-mlq-success' : 'bg-mlq-subtle text-mlq-muted'}">
      {schedule.enabled ? 'On' : 'Off'}
    </button>
  </form>

  <a href="/automations/schedules/{schedule.id}" class="shrink-0 text-xs text-mlq-workflow hover:underline">Edit</a>

  {#if confirmingDelete}
    <form method="POST" action="?/delete" use:enhance class="flex shrink-0 items-center gap-2">
      <input type="hidden" name="id" value={schedule.id} />
      <button type="submit" class="text-xs font-medium text-mlq-error hover:underline">Confirm</button>
      <button type="button" onclick={() => (confirmingDelete = false)} class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button>
    </form>
  {:else}
    <button type="button" onclick={() => (confirmingDelete = true)} class="shrink-0 text-xs text-mlq-error hover:underline">Delete</button>
  {/if}
</div>
