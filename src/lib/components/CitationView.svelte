<!-- src/lib/components/CitationView.svelte -->
<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';
  import { transformCitations } from '$lib/citations/transform';
  import CitationPopover from './CitationPopover.svelte';
  import type { Citation } from '$lib/citations/types';

  let { content = '', citations = [], onopen }: { content?: string; citations?: Citation[]; onopen?: (c: Citation) => void } = $props();

  // renderMarkdown sanitizes (DOMPurify); transformCitations only adds static pill markup.
  const html = $derived(transformCitations(renderMarkdown(content), citations));

  let container = $state<HTMLElement | null>(null);
  let openIndex = $state<number | null>(null);
  let anchor = $state<HTMLElement | null>(null);
  let popStyle = $state('position:absolute;');

  function position() {
    if (openIndex === null || !anchor || !container) return;
    const a = anchor.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(a.left - c.left, c.width - 360));
    popStyle = `position:absolute;top:${a.bottom - c.top + 6}px;left:${left}px;z-index:40;`;
  }

  function openFrom(el: HTMLElement) {
    const n = Number(el.dataset.citeIndex);
    const c = citations[n - 1];
    if (c) onopen?.(c);
    if (openIndex === n) { close(); return; }
    openIndex = n;
    anchor = el;
    position();
  }
  function close() { openIndex = null; anchor = null; }

  function onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-cite-index]') as HTMLElement | null;
    if (t) { e.preventDefault(); openFrom(t); }
    else if (openIndex !== null) close();
  }
  function onKeydown(e: KeyboardEvent) {
    const t = (e.target as HTMLElement).closest('[data-cite-index]') as HTMLElement | null;
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFrom(t); }
    else if (e.key === 'Escape' && openIndex !== null) { const a = anchor; close(); a?.focus(); }
  }

  // While a popover is open, close on Escape (anywhere) or an outside click.
  $effect(() => {
    if (openIndex === null) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { const a = anchor; close(); a?.focus(); }
    };
    const onDocClick = (e: MouseEvent) => {
      if (container && !container.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onDocKey, true);
    document.addEventListener('click', onDocClick, true);
    return () => {
      document.removeEventListener('keydown', onDocKey, true);
      document.removeEventListener('click', onDocClick, true);
    };
  });
</script>

<div bind:this={container} class="cite-view" style="position:relative">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- input is DOMPurify-sanitized in renderMarkdown -->
  <div class="prose-mlq" onclick={onClick} onkeydown={onKeydown}>{@html html}</div>
  {#if openIndex !== null}
    <div style={popStyle}>
      <CitationPopover index={openIndex} citation={citations[openIndex - 1]} />
    </div>
  {/if}
</div>
