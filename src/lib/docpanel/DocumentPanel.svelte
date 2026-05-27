<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import PdfViewer from './PdfViewer.svelte';
  import type { DocPanel } from './docPanel.svelte';
  import { citeState, tooltipFor } from '$lib/citations/types';
  import { scrollCitedIntoView } from './pdfHighlight';

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
</script>

<aside
  class="relative flex h-full shrink-0 flex-col border-l border-mlq-subtle bg-mlq-surface"
  style="width:{docPanel.width}px"
  aria-label="Document panel"
>
  <div class="flex items-center gap-2 border-b border-mlq-subtle px-3 py-2">
    <div
      class="absolute left-0 top-0 h-full w-1 cursor-col-resize"
      onpointerdown={startResize}
      aria-hidden="true"
    ></div>
    <span class="truncate text-xs font-medium text-mlq-text">{docPanel.activeTab?.filename || 'Document'}</span>
    {#if docPanel.activeTab?.page}
      <span class="text-[10px] text-mlq-muted">p.{docPanel.activeTab.page}</span>
    {/if}
    <button
      type="button"
      onclick={() => docPanel.closePanel()}
      aria-label="Close document panel"
      class="ml-auto rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"
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
        <!-- Non-PDF fallback card lands in P3-3. -->
        <p class="p-4 text-center text-xs text-mlq-muted">Preview not available for this file type.</p>
      {/if}
    {/if}
  </div>
</aside>
