<script lang="ts">
	import { onMount } from 'svelte';
	import { renderPdf as defaultRenderPdf, type RenderedPdf } from './pdfRender';
	import { highlightQuote as defaultHighlightQuote } from './pdfHighlight';

	let {
		fileId,
		page = null,
		quote = '',
		fetchFn = fetch,
		renderPdf = defaultRenderPdf,
		highlightQuote = defaultHighlightQuote,
		onhighlight
	}: {
		fileId: string;
		page?: number | null;
		quote?: string;
		fetchFn?: typeof fetch;
		renderPdf?: (container: HTMLElement, bytes: ArrayBuffer) => Promise<RenderedPdf>;
		highlightQuote?: (pageEl: HTMLElement, quote: string) => 'found' | 'miss';
		onhighlight?: (status: 'found' | 'miss') => void;
	} = $props();

	let container = $state<HTMLElement | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetchFn(`/files/${fileId}/content`);
				if (!res.ok) throw new Error(String(res.status));
				const bytes = await res.arrayBuffer();
				if (cancelled) return;
				if (!container) throw new Error('container unmounted before render');
				await renderPdf(container, bytes);
				if (!cancelled) status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// After render, locate the cited page + highlight. Re-runs when page/quote change
	// — so re-navigating within an already-open doc re-highlights without re-render.
	$effect(() => {
		if (status !== 'ready' || !container || page == null || !quote) return;
		const pageEl = container.querySelector<HTMLElement>(`.pdf-page[data-page-number="${page}"]`);
		if (!pageEl) {
			onhighlight?.('miss');
			return;
		}
		onhighlight?.(highlightQuote(pageEl, quote));
	});
</script>

<div class="relative h-full overflow-auto bg-mlq-surface-alt">
	{#if status === 'loading'}
		<p data-testid="pdf-loading" class="p-4 text-center text-xs text-mlq-muted">
			Loading document…
		</p>
	{:else if status === 'error'}
		<p data-testid="pdf-error" class="p-4 text-center text-xs text-mlq-error">
			Could not load this document.
		</p>
	{/if}
	<div bind:this={container} data-testid="pdf-pages" class="py-3"></div>
</div>
