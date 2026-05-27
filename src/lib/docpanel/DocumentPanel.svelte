<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import PdfViewer from './PdfViewer.svelte';
  import type { DocPanel } from './docPanel.svelte';

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

  <div class="relative min-h-0 flex-1">
    {#if docPanel.activeTab}
      {#if docPanel.activeTab.status === 'error'}
        <p class="p-4 text-center text-xs text-mlq-error">Could not load this document.</p>
      {:else if docPanel.activeTab.mime === 'application/pdf'}
        {#key docPanel.activeTab.fileId}
          <PdfViewer fileId={docPanel.activeTab.fileId} />
        {/key}
      {:else if docPanel.activeTab.status === 'ready'}
        <!-- Non-PDF fallback card lands in P3-3. -->
        <p class="p-4 text-center text-xs text-mlq-muted">Preview not available for this file type.</p>
      {/if}
    {/if}
  </div>
</aside>
