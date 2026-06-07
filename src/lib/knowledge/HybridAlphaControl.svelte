<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { KnowledgeBase } from './types';

	let { kb }: { kb: KnowledgeBase } = $props();
	let value = $state(untrack(() => kb.hybrid_alpha));
	let form = $state<HTMLFormElement>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const DEBOUNCE_MS = 400;

	function onInput(e: Event) {
		value = Number((e.currentTarget as HTMLInputElement).value);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			// queueMicrotask gives Svelte time to flush the value into the hidden input.
			queueMicrotask(() => form?.requestSubmit());
		}, DEBOUNCE_MS);
	}
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Advanced</h2>
	<div class="rounded-mlq-control border border-mlq-subtle px-3 py-3">
		<div class="mb-1 flex items-center justify-between text-xs text-mlq-muted">
			<span>Hybrid alpha</span>
			<span class="text-mlq-text">{value.toFixed(2)}</span>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-[10px] text-mlq-muted">Vector</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				{value}
				oninput={onInput}
				class="flex-1"
				aria-label="Hybrid alpha"
			/>
			<span class="text-[10px] text-mlq-muted">FTS</span>
		</div>
		<form bind:this={form} method="POST" action="?/setHybridAlpha" use:enhance class="hidden">
			<input type="hidden" name="hybrid_alpha" {value} />
		</form>
	</div>
</section>
