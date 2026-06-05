<!-- src/lib/automations/ScheduleList.svelte -->
<script lang="ts">
  import type { ScheduleSummary } from './schedules';
  import ScheduleRow from './ScheduleRow.svelte';

  let { rows }: { rows: { schedule: ScheduleSummary; label: string }[] } = $props();
</script>

{#if rows.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
    <p class="text-sm font-medium text-mlq-text">No schedules yet</p>
    <p class="mt-1 text-xs text-mlq-muted">
      A schedule runs a playbook or skill on a recurring cadence — handing a standing chore to Donna.
    </p>
    <ul class="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-mlq-muted">
      <li>• Drop documents into a knowledge base through the week, then generate a <strong>weekly summary document</strong> every Friday.</li>
      <li>• Regenerate a <strong>dashboard / digest document</strong> from your latest files on a cadence.</li>
      <li>• Automate any recurring "every week I have to compile X" report.</li>
    </ul>
  </div>
{:else}
  <ul class="flex flex-col gap-2">
    {#each rows as row (row.schedule.id)}
      <li><ScheduleRow schedule={row.schedule} sourceLabel={row.label} /></li>
    {/each}
  </ul>
{/if}
