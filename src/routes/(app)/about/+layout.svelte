<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';
  import { page } from '$app/state';
  import AboutRail from '$lib/about/AboutRail.svelte';
  let { children } = $props();

  // The callout points at /about/lq-ai, so hide it when we're already there.
  const showCallout = $derived(!page.url.pathname.startsWith('/about/lq-ai'));

  // The LQ-AI page embeds wide interactive playgrounds, so give it the widest container. The prose
  // guide pages use max-w-5xl so the text reaches its full readable width (paragraphs stay capped at
  // max-w-prose) instead of the cramped, over-centered max-w-3xl.
  const wide = $derived(page.url.pathname.startsWith('/about/lq-ai'));
</script>

<!-- The callout always sits full-width above the rail/content row (hence the outer flex-col). -->
<div class="mx-auto flex flex-col gap-4 px-4 py-6 {wide ? 'max-w-6xl' : 'max-w-5xl'}">
  {#if showCallout}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- powered-by callout -->
    <a href="/about/lq-ai"
       class="flex items-center justify-between gap-3 rounded-mlq-control border border-mlq-subtle bg-mlq-subtle/30 px-4 py-3 text-sm transition-colors hover:bg-mlq-subtle/60">
      <span class="text-mlq-text">Donna is powered by <span class="font-medium text-mlq-strong">LQ-AI</span>, an open-source legal operating system — learn how it works.</span>
      <ArrowRight size={16} class="shrink-0 text-mlq-muted" />
    </a>
  {/if}
  <div class="flex flex-col gap-6 sm:flex-row">
    <AboutRail />
    <div class="min-w-0 flex-1">{@render children()}</div>
  </div>
</div>
