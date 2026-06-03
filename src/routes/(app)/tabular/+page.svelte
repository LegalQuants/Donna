<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import DocumentMultiPicker from '$lib/tabular/DocumentMultiPicker.svelte';
  import ColumnBuilder from '$lib/tabular/ColumnBuilder.svelte';
  import CostPreviewModal from '$lib/tabular/CostPreviewModal.svelte';
  import { createTabularBuilder } from '$lib/tabular/tabularBuilder.svelte';
  import { createTabularUploads } from '$lib/tabular/tabularUploads.svelte';
  import type { TabularPreviewCostResponse, TabularExecution } from '$lib/tabular/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const builder = createTabularBuilder();
  const uploads = createTabularUploads();
  onDestroy(() => uploads.dispose());

  let preview = $state<TabularPreviewCostResponse | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  function onmatter(id: string | null) {
    goto(id ? `/tabular?matter=${id}` : '/tabular', { keepFocus: true, noScroll: true });
  }

  async function openPreview() {
    if (!builder.canRun || busy) return;
    error = null;
    busy = true;
    try {
      const res = await fetch('/tabular/preview-cost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document_ids: builder.docs.map((d) => d.document_id), columns: builder.validColumns() })
      });
      if (!res.ok) {
        error = 'Could not estimate the cost. Please try again.';
        return;
      }
      preview = (await res.json()) as TabularPreviewCostResponse;
    } catch {
      error = 'Could not estimate the cost. Please try again.';
    } finally {
      busy = false;
    }
  }

  async function confirmRun() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const res = await fetch('/tabular/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          document_ids: builder.docs.map((d) => d.document_id),
          columns: builder.validColumns(),
          confirmed_cost_usd: preview?.estimated_cost_usd
        })
      });
      if (!res.ok) {
        error = 'Could not start the review. Please try again.';
        busy = false;
        return;
      }
      const exec = (await res.json()) as TabularExecution;
      preview = null;
      await goto(`/tabular/${exec.id}`);
    } catch {
      error = 'Could not start the review. Please try again.';
      busy = false;
    }
  }
</script>

<div class="mx-auto max-w-5xl px-6 py-8 pb-28">
  <h1 class="font-serif text-2xl text-mlq-strong">New tabular review</h1>
  <p class="mt-1 text-sm text-mlq-muted">Ask the same questions across many documents and get a cited table.</p>

  <div class="mt-6 grid gap-8 md:grid-cols-2">
    <section>
      <h2 class="mb-2 text-sm font-semibold text-mlq-strong">Documents</h2>
      <DocumentMultiPicker
        {builder}
        {uploads}
        matters={data.matters}
        matterFiles={data.matterFiles}
        selectedMatterId={data.selectedMatterId}
        {onmatter}
      />
    </section>
    <section>
      <h2 class="mb-2 text-sm font-semibold text-mlq-strong">Columns</h2>
      <ColumnBuilder {builder} />
    </section>
  </div>

  {#if error}<p class="mt-4 text-sm text-mlq-error">{error}</p>{/if}
</div>

<div class="fixed inset-x-0 bottom-0 border-t border-mlq-subtle bg-mlq-surface px-6 py-3">
  <div class="mx-auto flex max-w-5xl items-center justify-between">
    <span class="text-sm text-mlq-muted">{builder.docs.length} docs × {builder.validColumns().length} cols = {builder.cellCount} cells</span>
    <button
      type="button"
      onclick={openPreview}
      disabled={!builder.canRun || busy}
      class="rounded-mlq-control bg-mlq-strong px-4 py-2 text-sm text-white disabled:opacity-40"
    >
      Preview cost
    </button>
  </div>
</div>

{#if preview}
  <CostPreviewModal {preview} {busy} onconfirm={confirmRun} oncancel={() => (preview = null)} />
{/if}
