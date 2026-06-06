<!-- src/lib/automations/RunResults.svelte -->
<!-- The run's work-product: findings in emission order (created_at ASC — the
     run's output sequence, intentionally not severity-grouped) + the memories
     it proposed (read-only; keep/dismiss is a future slice). -->
<script lang="ts">
  import FindingCard from './FindingCard.svelte';
  import { severitySummary, type FindingItem, type RunMemoryItem } from './findings';

  let { findings, findingsTotal, memories, running }: {
    findings: FindingItem[] | null;
    findingsTotal: number | null;
    memories: RunMemoryItem[] | null;
    running: boolean;
  } = $props();

  const summary = $derived(findings && findings.length > 0 ? severitySummary(findings) : '');
  const overflow = $derived(
    findings !== null && findingsTotal !== null && findingsTotal > findings.length
      ? findingsTotal - findings.length : 0
  );
  function stateChipClass(state: string): string {
    if (state === 'proposed') return 'bg-mlq-workflow/10 text-mlq-workflow';
    if (state === 'kept') return 'bg-mlq-success/10 text-mlq-success';
    if (state === 'dismissed') return 'bg-mlq-subtle text-mlq-muted';
    return 'border border-mlq-subtle text-mlq-muted';
  }
</script>

<section aria-label="Results" class="flex flex-col gap-2">
  <div>
    <h2 class="text-sm font-medium text-mlq-strong">Results</h2>
    <p class="text-xs text-mlq-muted">{running ? 'Results so far — the run is still working.' : 'What this run produced.'}</p>
  </div>

  {#if findings === null}
    <p class="text-xs text-mlq-muted">Results unavailable right now.</p>
  {:else if findings.length === 0}
    <p class="text-xs text-mlq-muted">{running ? 'No findings yet.' : 'This run recorded no findings.'}</p>
  {:else}
    {#if summary}<p class="text-xs text-mlq-text">{summary}</p>{/if}
    <div class="flex flex-col gap-2">
      {#each findings as finding (finding.id)}
        <FindingCard {finding} />
      {/each}
    </div>
    {#if overflow > 0}
      <p class="text-xs text-mlq-muted">+{overflow} more findings not shown.</p>
    {/if}
  {/if}

  {#if memories && memories.length > 0}
    <div class="mt-2">
      <h3 class="mb-1 text-xs font-medium text-mlq-muted">Memories this run proposed</h3>
      <ul class="flex flex-col gap-1">
        {#each memories as memory (memory.id)}
          <li class="flex items-start gap-2 rounded-mlq-control border border-mlq-subtle p-2">
            <span class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {stateChipClass(memory.state)}">{memory.state}</span>
            <div class="min-w-0">
              <span class="text-xs text-mlq-muted">{memory.category}</span>
              <p class="text-sm text-mlq-text">{memory.content}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
