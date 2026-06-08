<!-- src/lib/docpanel/TextViewer.svelte -->
<!-- Inline viewer for text documents (autonomous-run artifacts are always
     text/markdown — lq-ai #138 pins the mime server-side). Markdown renders
     through the house renderer (markdown-it + DOMPurify via Markdown.svelte);
     text/plain renders preformatted. Errors degrade to a Download link —
     never a crash (the doc-panel contract). -->
<script lang="ts">
	import { Download } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	let { fileId, mime, filename }: { fileId: string; mime: string; filename: string } = $props();

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let text = $state('');

	// Re-fetch when the tab's file changes (the panel reuses one viewer per active tab).
	$effect(() => {
		const id = fileId;
		status = 'loading';
		text = '';
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/files/${id}/content`);
				if (!res.ok) throw new Error(String(res.status));
				const body = await res.text();
				if (cancelled) return;
				text = body;
				status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if status === 'loading'}
	<p class="p-4 text-center text-xs text-mlq-muted">Loading…</p>
{:else if status === 'error'}
	<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
		<p class="text-xs text-mlq-error">Could not load this document.</p>
		<a
			href="/files/{fileId}/content"
			download={filename || undefined}
			class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
		>
			<Download size={14} /> Download
		</a>
	</div>
{:else if mime === 'text/markdown'}
	<div class="h-full overflow-y-auto p-4">
		<Markdown content={text} />
	</div>
{:else}
	<pre
		class="h-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-mlq-text">{text}</pre>
{/if}
