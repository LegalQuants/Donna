<!-- src/lib/components/CitationPopover.svelte -->
<script lang="ts">
  import { citeState, tooltipFor, type Citation } from '$lib/citations/types';
  import { fileName } from '$lib/citations/files';

  let { citation, index }: { citation: Citation | undefined; index: number } = $props();

  const cstate = $derived(citeState(citation));
  const label = $derived(tooltipFor(citation));
  let filename: string | null = $state(null);

  $effect(() => {
    filename = null;
    const fid = citation?.source_file_id;
    if (!fid) return;
    let cancelled = false;
    fileName(fid).then((n) => { if (!cancelled) filename = n; });
    return () => { cancelled = true; };
  });
</script>

<!-- non-modal: click-to-open detail panel; CitationView (Task 8) mounts/unmounts it -->
<div class="pop pop-{cstate}" role="dialog" aria-modal="false" aria-label={`Citation ${index} detail`}>
  <div class="bar">{label}</div>
  {#if citation}
    <blockquote class="quote">{citation.source_text}</blockquote>
    <div class="meta">
      {#if filename}<span>{filename}</span>{/if}
      {#if citation.source_page != null}<span>Page {citation.source_page}</span>{/if}
    </div>
  {:else}
    <p class="empty">This citation could not be matched to a source.</p>
  {/if}
</div>

<style>
  .pop { width: 360px; max-width: 88vw; background: var(--color-mlq-surface);
    border: 1px solid var(--color-mlq-subtle); border-radius: 10px;
    box-shadow: 0 8px 28px rgb(0 0 0 / 12%); overflow: hidden; font-family: var(--font-sans); }
  .bar { padding: 0.55rem 0.8rem; font-size: 12.5px; font-weight: 600; border-bottom: 1px solid var(--color-mlq-subtle); }
  .pop-verified .bar { background: #eef4ef; color: #2f6b43; }
  .pop-caveats .bar { background: #f8f3e2; color: #8a6d1c; }
  .pop-unverified .bar { background: #f9eae8; color: #a23b32; }
  .quote { font-family: var(--font-serif); font-size: 14px; color: var(--color-mlq-text);
    border-left: 3px solid var(--color-mlq-subtle); margin: 0.7rem 0.8rem; padding-left: 0.7rem; line-height: 1.5; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.9rem; padding: 0 0.8rem 0.7rem; font-size: 11.5px; color: var(--color-mlq-muted); }
  .empty { padding: 0.7rem 0.8rem; font-size: 13px; color: var(--color-mlq-muted); }
</style>
