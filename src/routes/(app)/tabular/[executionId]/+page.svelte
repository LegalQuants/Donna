<script lang="ts">
  import { untrack, onMount, onDestroy } from 'svelte';
  import TabularGrid from '$lib/tabular/TabularGrid.svelte';
  import { createRunPoll } from '$lib/tabular/runPoll.svelte';
  import { parseTabularResults, isTerminal, type TabularExecution, type TabularCitation } from '$lib/tabular/types';
  import type { PageData } from './$types';
  import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
  import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
  import type { Citation } from '$lib/citations/types';

  let { data }: { data: PageData } = $props();
  // untrack: intentional one-time seed — data.execution won't change without navigation.
  const poll = untrack(() => createRunPoll(data.execution.id, data.execution));
  const docPanel = createDocPanel();

  function openCitation(c: TabularCitation) {
    // Ensemble-verified cells carry a verification_method → show the green "✓ Verified" chip.
    // Non-ensemble cells have no verification concept (trust comes from the grid's confidence dot),
    // so suppress the chip rather than mislabel them "Unverified" (closes P6-B.1).
    const verified = c.verification_method != null;
    docPanel.open({
      source_file_id: c.source_file_id,
      source_page: c.source_page,
      source_text: c.source_text,
      ...(verified
        ? { verified: true, verification_method: c.verification_method ?? undefined }
        : { verificationApplicable: false })
    } as Citation);
  }
  onMount(() => poll.start());
  onDestroy(() => poll.stop());

  const current = $derived((poll.execution ?? data.execution) as TabularExecution);
  const columns = $derived(current.columns.map((c) => c.name));
  const documentNamesById = $derived(
    Object.fromEntries(current.document_ids.map((id, i) => [id, current.document_names[i]]))
  );
  const results = $derived(parseTabularResults(current.results, documentNamesById));
  let cancelling = $state(false);

  async function cancel() {
    if (cancelling) return;
    cancelling = true;
    try {
      await fetch(`/tabular-executions/${current.id}/cancel`, { method: 'POST' });
    } catch {
      /* the poll will reconcile the status */
    } finally {
      cancelling = false;
    }
  }
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <h1 class="font-serif text-2xl text-mlq-strong">Tabular review</h1>

  {#if !isTerminal(current.status)}
    <div class="mt-6 flex items-center gap-4">
      <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-mlq-workflow"></span>
      <span class="text-sm text-mlq-text">Running… extracting {current.document_ids.length} document{current.document_ids.length === 1 ? '' : 's'} × {current.columns.length} column{current.columns.length === 1 ? '' : 's'}.</span>
      <button type="button" onclick={cancel} disabled={cancelling} class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-sm text-mlq-text disabled:opacity-40">Cancel</button>
    </div>
    {#if poll.stuck}
      <p class="mt-3 text-xs text-mlq-muted">This is taking longer than expected. The review keeps running — reload to check again.</p>
    {/if}
  {:else if current.status === 'failed'}
    <p class="mt-6 text-sm text-mlq-error">This review failed{current.error_text ? `: ${current.error_text}` : '.'}</p>
  {:else if current.status === 'cancelled'}
    <p class="mt-6 text-sm text-mlq-muted">This review was cancelled.</p>
  {:else if results}
    <div class="mt-6">
      <TabularGrid {results} {columns} executionId={current.id} onactivatecitation={openCitation} />
    </div>
  {:else}
    <p class="mt-6 text-sm text-mlq-muted">No results to show.</p>
  {/if}
</div>
{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
