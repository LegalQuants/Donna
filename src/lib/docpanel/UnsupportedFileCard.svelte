<script lang="ts">
  import { FileText, Download } from '@lucide/svelte';

  let { fileId, filename, mime }: { fileId: string; filename: string; mime: string } = $props();

  // Extension badge from the filename (last dot segment), capped; empty when none.
  const ext = $derived((filename.includes('.') ? (filename.split('.').pop() ?? '') : '').toUpperCase().slice(0, 5));
</script>

<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
  <div class="relative text-mlq-muted">
    <FileText size={44} strokeWidth={1.25} />
    {#if ext}
      <span class="absolute inset-x-0 bottom-1 text-[8px] font-semibold tracking-wide text-mlq-muted">{ext}</span>
    {/if}
  </div>
  <p class="max-w-full break-words text-sm font-medium text-mlq-text">{filename || 'Document'}</p>
  <p class="text-xs text-mlq-muted">
    Preview isn't available for this file type{mime ? ` (${mime})` : ''}.
  </p>
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- download link, not SvelteKit navigation -->
  <a href="/files/{fileId}/content"
    download={filename || undefined}
    class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
  >
    <Download size={14} /> Download
  </a>
</div>
