<script lang="ts">
  import { lqLearnSections } from '$lib/about/lqLearnSections';
  import LqLearnSection from '$lib/about/LqLearnSection.svelte';
</script>

<svelte:head><title>Powered by LQ-AI — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Donna is powered by LQ-AI, an open source legal operating system. Donna uses some, but not all, of
  the functionality available in LQ-AI. The interactive surfaces below walk through how LQ-AI (and
  Donna) work, from a request to a verified, cited answer.
</p>

<div class="mt-8">
  {#each lqLearnSections as section (section.number)}
    <LqLearnSection {section} />
  {/each}
</div>
