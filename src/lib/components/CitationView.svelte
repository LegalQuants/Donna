<!-- src/lib/components/CitationView.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { renderMarkdown } from '$lib/markdown';
  import { transformCitations } from '$lib/citations/transform';
  import CitationPopover from './CitationPopover.svelte';
  import type { Citation } from '$lib/citations/types';

  let {
    content = '',
    citations = [],
    onactivate
  }: { content?: string; citations?: Citation[]; onactivate?: (c: Citation) => void } = $props();

  // renderMarkdown sanitizes (DOMPurify); transformCitations only adds static pill markup.
  const html = $derived(transformCitations(renderMarkdown(content), citations));

  let container = $state<HTMLElement | null>(null);
  let openIndex = $state<number | null>(null);
  let anchor = $state<HTMLElement | null>(null);
  let popStyle = $state('position:absolute;');
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  function position() {
    if (openIndex === null || !anchor || !container) return;
    const a = anchor.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(a.left - c.left, c.width - 360));
    popStyle = `position:absolute;top:${a.bottom - c.top + 6}px;left:${left}px;z-index:40;`;
  }

  function show(el: HTMLElement) {
    openIndex = Number(el.dataset.citeIndex);
    anchor = el;
    position();
  }
  function hide() {
    openIndex = null;
    anchor = null;
  }
  function pillOf(e: Event): HTMLElement | null {
    return (e.target as HTMLElement).closest('[data-cite-index]');
  }

  // Hover (pointer) → show after a short delay; leaving → hide. Ephemeral, so it
  // re-derives from the hovered pill (fixes the P2b scroll-reanchor bug).
  function onPointerOver(e: PointerEvent) {
    const t = pillOf(e);
    if (!t) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(t), 120);
  }
  function onPointerOut(e: PointerEvent) {
    // Only react when the pointer is leaving a pill (ignore movement over plain prose).
    if (!pillOf(e)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(hide, 120);
  }
  // Keyboard focus → show immediately; blur → hide.
  function onFocusIn(e: FocusEvent) {
    const t = pillOf(e);
    if (t) show(t);
  }
  function onFocusOut(e: FocusEvent) {
    if (pillOf(e)) hide();
  }
  // Click / Enter / Space → open the document panel (no popover toggle).
  function activate(t: HTMLElement) {
    const c = citations[Number(t.dataset.citeIndex) - 1];
    if (c) onactivate?.(c);
  }
  function onClick(e: MouseEvent) {
    const t = pillOf(e);
    if (t) { e.preventDefault(); clearTimeout(hoverTimer); hide(); activate(t); }
  }
  function onKeydown(e: KeyboardEvent) {
    const t = pillOf(e);
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(t); }
    else if (e.key === 'Escape' && openIndex !== null) hide();
  }

  onDestroy(() => clearTimeout(hoverTimer));
</script>

<div bind:this={container} class="cite-view" style="position:relative">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="prose-mlq"
    onclick={onClick}
    onkeydown={onKeydown}
    onpointerover={onPointerOver}
    onpointerout={onPointerOut}
    onfocusin={onFocusIn}
    onfocusout={onFocusOut}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- input is DOMPurify-sanitized in renderMarkdown -->
    {@html html}
  </div>
  {#if openIndex !== null}
    <div style={popStyle}>
      <CitationPopover index={openIndex} citation={citations[openIndex - 1]} />
    </div>
  {/if}
</div>
