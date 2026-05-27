<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import PdfViewer from './PdfViewer.svelte';
  import UnsupportedFileCard from './UnsupportedFileCard.svelte';
  import type { DocPanel } from './docPanel.svelte';
  import { citeState, tooltipFor } from '$lib/citations/types';
  import { scrollCitedIntoView, clearHighlight } from './pdfHighlight';

  let { docPanel }: { docPanel: DocPanel } = $props();

  let onMove: ((e: PointerEvent) => void) | null = null;
  let onUp: (() => void) | null = null;

  function stopResize() {
    if (onMove) window.removeEventListener('pointermove', onMove);
    if (onUp) window.removeEventListener('pointerup', onUp);
    onMove = null;
    onUp = null;
  }

  // Drag the left edge to resize. Panel is docked right, so a smaller clientX = wider panel.
  function startResize(e: PointerEvent) {
    e.preventDefault();
    stopResize(); // guard against a stuck/duplicate drag
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    onMove = (m: PointerEvent) => docPanel.setWidth(window.innerWidth - m.clientX);
    onUp = () => stopResize();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  onDestroy(stopResize);

  // The 'cite' highlight is a single global registration owned by the active PDF's
  // PdfViewer. When the active tab is not a rendered PDF (non-PDF mime or load
  // error), no PdfViewer is mounted to clear it — do it here so a previous tab's
  // highlight never lingers after switching.
  $effect(() => {
    const t = docPanel.activeTab;
    if (!t || t.mime !== 'application/pdf' || t.status === 'error') clearHighlight();
  });
</script>

<aside
  class="relative flex h-full shrink-0 flex-col border-l border-mlq-subtle bg-mlq-surface"
  style="width:{docPanel.width}px"
  aria-label="Document panel"
>
  <div class="relative flex items-center gap-1 border-b border-mlq-subtle py-1.5 pl-2 pr-1">
    <div
      class="absolute left-0 top-0 h-full w-1 cursor-col-resize"
      onpointerdown={startResize}
      aria-hidden="true"
    ></div>
    <!-- Simple button switcher (aria-current marks the active tab). A full
         role="tablist"/tab + roving-tabindex + arrow-key nav is deferred with
         keyboard tab navigation (out of scope for P3-3). -->
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {#each docPanel.tabs as tab (tab.fileId)}
        <div
          class="flex max-w-[140px] shrink-0 items-center gap-0.5 rounded-mlq-control pl-2 pr-0.5 py-1 text-xs {tab.fileId === docPanel.activeId ? 'bg-mlq-surface-alt font-medium text-mlq-text' : 'text-mlq-muted hover:text-mlq-text'}"
        >
          <button
            type="button"
            aria-current={tab.fileId === docPanel.activeId ? 'true' : undefined}
            onclick={() => docPanel.setActive(tab.fileId)}
            class="min-w-0 truncate"
            title={tab.filename || 'Document'}
          >{tab.filename || 'Document'}</button>
          <button
            type="button"
            onclick={() => docPanel.close(tab.fileId)}
            aria-label="Close {tab.filename || 'document'}"
            class="shrink-0 rounded-mlq-control p-0.5 text-mlq-muted hover:text-mlq-text"
          >
            <X size={12} />
          </button>
        </div>
      {/each}
    </div>
    <button
      type="button"
      onclick={() => docPanel.closePanel()}
      aria-label="Close document panel"
      class="shrink-0 rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"
    >
      <X size={14} />
    </button>
  </div>

  {#if docPanel.activeTab && docPanel.activeTab.mime === 'application/pdf' && docPanel.activeTab.status !== 'error'}
    {@const tab = docPanel.activeTab}
    {@const cs = citeState(tab.cite)}
    <div
      class="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] {tab.highlightStatus === 'miss' ? 'border-mlq-caveats/40 bg-mlq-caveats/10' : 'border-mlq-subtle bg-mlq-surface-alt'}"
    >
      {#if tab.page}
        <span class="shrink-0 text-[10px] text-mlq-muted">p.{tab.page}</span>
      {/if}
      <span
        class="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold {cs === 'verified' ? 'bg-mlq-success/15 text-mlq-success' : cs === 'caveats' ? 'bg-mlq-caveats/15 text-mlq-caveats' : 'bg-mlq-error/15 text-mlq-error'}"
        title={tooltipFor(tab.cite)}
      >
        {cs === 'verified' ? '✓ Verified' : cs === 'caveats' ? 'Caveats' : 'Unverified'}
      </span>
      {#if tab.highlightStatus === 'miss'}
        <span class="line-clamp-2 min-w-0 text-mlq-text">Cited passage on this page — couldn't pinpoint the exact span. <span class="italic text-mlq-muted">"{tab.quote}"</span></span>
      {:else}
        <span class="truncate italic text-mlq-muted">"{tab.quote}"</span>
        {#if tab.highlightStatus === 'found'}
          <button
            type="button"
            onclick={() => scrollCitedIntoView()}
            class="ml-auto shrink-0 rounded-mlq-control px-1.5 py-0.5 font-medium text-mlq-workflow hover:underline"
          >
            Jump to ¶
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="relative min-h-0 flex-1">
    {#if docPanel.activeTab}
      {#if docPanel.activeTab.status === 'error'}
        <p class="p-4 text-center text-xs text-mlq-error">Could not load this document.</p>
      {:else if docPanel.activeTab.mime === 'application/pdf'}
        {@const tab = docPanel.activeTab}
        {#key tab.fileId}
          <PdfViewer
            fileId={tab.fileId}
            page={tab.page}
            quote={tab.quote}
            onhighlight={(s) => docPanel.setHighlightStatus(tab.fileId, s)}
          />
        {/key}
      {:else if docPanel.activeTab.status === 'ready'}
        {@const tab = docPanel.activeTab}
        <UnsupportedFileCard fileId={tab.fileId} filename={tab.filename} mime={tab.mime} />
      {/if}
    {/if}
  </div>
</aside>
