<script lang="ts">
  import type { ResultSummary } from './types';
  import { SUMMARY_ROWS, verdictMeta } from './verdict';
  let { summary }: { summary: ResultSummary } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each SUMMARY_ROWS as row (row.verdict)}
    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {verdictMeta(row.verdict).badgeClass}">
      {summary[row.key]} {verdictMeta(row.verdict).label}
    </span>
  {/each}
</div>
