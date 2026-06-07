<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { TabularCell, TabularCitation } from './types';

	let {
		column,
		cell,
		onclose,
		onactivatecitation
	}: {
		column: string;
		cell: TabularCell;
		onclose: () => void;
		onactivatecitation?: (c: TabularCitation) => void;
	} = $props();

	$effect(() => {
		function onkey(e: KeyboardEvent) {
			if (e.key === 'Escape') onclose();
		}
		document.addEventListener('keydown', onkey);
		return () => document.removeEventListener('keydown', onkey);
	});
</script>

<div
	class="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
	role="dialog"
	aria-label="Cell detail"
>
	<div class="flex items-start justify-between">
		<h3 class="font-serif text-base text-mlq-strong">{column}</h3>
		<button
			type="button"
			aria-label="Close"
			onclick={onclose}
			class="text-mlq-muted hover:text-mlq-text"><X size={16} /></button
		>
	</div>
	{#if cell.confidence === 'failed'}
		<p class="mt-3 text-sm text-mlq-error">(failed){cell.error ? ` — ${cell.error}` : ''}</p>
	{:else}
		<p class="mt-3 text-sm whitespace-pre-wrap text-mlq-text">{cell.value}</p>
		<p class="mt-3 text-xs text-mlq-muted">Confidence: {cell.confidence}</p>
		{#if cell.citations.length > 0}
			<p class="mt-2 text-xs font-medium text-mlq-text">
				{cell.citations.length} citation{cell.citations.length === 1 ? '' : 's'}
			</p>
			<ul class="mt-1 space-y-1">
				{#each cell.citations as c, i (i)}
					<li>
						<button
							type="button"
							aria-label="Open source, page {c.source_page ?? 'unknown'}"
							class="w-full rounded border border-mlq-subtle px-2 py-1 text-left text-xs text-mlq-text hover:bg-mlq-surface-alt"
							onclick={() => onactivatecitation?.(c)}
						>
							<span class="font-medium">Source · p.{c.source_page ?? '—'}</span>
							{#if c.source_text}
								<span class="mt-0.5 block truncate text-mlq-muted">{c.source_text}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-xs text-mlq-muted">
				{cell.cited_chunk_ids.length} citation{cell.cited_chunk_ids.length === 1 ? '' : 's'}
			</p>
		{/if}
	{/if}
</div>
