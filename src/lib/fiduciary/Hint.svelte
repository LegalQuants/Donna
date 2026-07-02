<!-- src/lib/fiduciary/Hint.svelte -->
<!-- A small, one-time, dismissable in-context discovery hint (Slice 6-lean).
     Hand-rolled callout (mirrors ConnectedBanner) — no bits-ui. Renders nothing
     once its id is dismissed (persisted via the hintStore). Width is set by the
     parent container, not hardcoded. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Info, X } from '@lucide/svelte';
	import { hintStore } from './hints.svelte';

	let { id, children }: { id: string; children: Snippet } = $props();
</script>

{#if !hintStore.isDismissed(id)}
	<div
		role="note"
		class="mb-3 flex items-start justify-between gap-3 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 px-3 py-2 text-xs text-mlq-text"
	>
		<span class="flex items-start gap-2">
			<Info size={14} class="mt-0.5 shrink-0 text-mlq-workflow" aria-hidden="true" />
			<span>{@render children()}</span>
		</span>
		<button
			type="button"
			onclick={() => hintStore.dismiss(id)}
			aria-label="Dismiss hint"
			class="shrink-0 rounded p-0.5 text-mlq-muted hover:text-mlq-text"
		>
			<X size={14} aria-hidden="true" />
		</button>
	</div>
{/if}
