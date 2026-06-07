<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let { content = '' }: { content?: string } = $props();

	const html = $derived(renderMarkdown(content));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown outputs sanitized HTML from DOMPurify; no user-controlled raw HTML reaches this point -->
<div class="prose-mlq">{@html html}</div>
