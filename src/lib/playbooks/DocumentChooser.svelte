<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Dropzone from '$lib/matters/files/Dropzone.svelte';
  import MatterPicker from '$lib/matters/MatterPicker.svelte';

  type MatterSummary = { id: string; name: string };
  type IngestedFile = { id: string; filename: string; document_id: string };

  let {
    matters,
    matterFiles,
    onupload,
    onpick
  }: {
    matters: MatterSummary[];
    matterFiles: IngestedFile[];
    onupload: (file: File) => void;
    onpick: (documentId: string) => void;
  } = $props();

  let tab = $state<'upload' | 'matter'>('upload');
  let selectedMatter = $state<string | null>(page.url.searchParams.get('matter'));

  // When the matter selection changes, reflect it in the URL so the server load
  // fetches that matter's files (?matter=).
  function syncMatterToUrl(id: string | null) {
    const url = new URL(page.url);
    if (id) url.searchParams.set('matter', id);
    else url.searchParams.delete('matter');
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- reactive URL sync for SSR load; no anchor element involved
    goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
  }
  $effect(() => {
    syncMatterToUrl(selectedMatter);
  });

  function handleFiles(files: File[]) {
    if (files[0]) onupload(files[0]);
  }
</script>

<div role="tablist" class="flex gap-1 border-b border-mlq-subtle text-sm">
  <button role="tab" type="button" aria-selected={tab === 'upload'} onclick={() => (tab = 'upload')}
    class="px-3 py-2 {tab === 'upload' ? 'border-b-2 border-mlq-text font-medium text-mlq-text' : 'text-mlq-muted'}">Upload a document</button>
  <button role="tab" type="button" aria-selected={tab === 'matter'} onclick={() => (tab = 'matter')}
    class="px-3 py-2 {tab === 'matter' ? 'border-b-2 border-mlq-text font-medium text-mlq-text' : 'text-mlq-muted'}">Choose from a matter</button>
</div>

<div class="mt-3">
  {#if tab === 'upload'}
    <Dropzone onfiles={handleFiles} />
  {:else}
    <MatterPicker {matters} bind:selectedId={selectedMatter} />
    <div class="mt-3">
      {#if matterFiles.length === 0 && !selectedMatter}
        <p class="text-sm text-mlq-muted">Pick a matter to see its documents.</p>
      {:else if matterFiles.length === 0}
        <p class="text-sm text-mlq-muted">No ingested documents in this matter yet.</p>
      {:else}
        <ul class="rounded-mlq-control border border-mlq-subtle">
          {#each matterFiles as f (f.id)}
            <li class="flex items-center justify-between gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
              <span class="truncate text-sm text-mlq-text">{f.filename}</span>
              <button type="button" onclick={() => onpick(f.document_id)}
                class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle"
                aria-label={`Select ${f.filename}`}>Select</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
