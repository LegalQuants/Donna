<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';

  let { content = '' }: { content?: string } = $props();

  const html = $derived(renderMarkdown(content));
</script>

<div class="prose-mlq">{@html html}</div>
