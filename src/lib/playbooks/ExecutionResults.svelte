<script lang="ts">
  import type { ExecutionResults } from './types';
  import { compareByVerdict } from './verdict';
  import ResultSummary from './ResultSummary.svelte';
  import ResultCard from './ResultCard.svelte';

  let { results }: { results: ExecutionResults } = $props();
  const ordered = $derived([...results.positions].sort(compareByVerdict));
</script>

<ResultSummary summary={results.summary} />
<div class="mt-4 space-y-3">
  {#each ordered as result (result.position_id)}<ResultCard {result} />{/each}
</div>
