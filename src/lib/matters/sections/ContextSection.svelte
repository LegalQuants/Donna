<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';

	let { value: initial = '' }: { value?: string } = $props();

	let value = $state(untrack(() => initial));

	const bytes = $derived(new TextEncoder().encode(value).length);
	const overCap = $derived(bytes > 102_400);
	const dirty = $derived(value !== initial);
	const canSave = $derived(dirty && !overCap);
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Context</h2>
	<p class="mb-2 text-xs text-mlq-muted">
		Markdown notes the assistant sees on every chat in this matter. Optional, max 100 KiB.
	</p>

	<form
		method="POST"
		action="?/saveContext"
		use:enhance
		aria-label="Matter context"
		class="space-y-2"
	>
		<textarea
			name="context_md"
			bind:value
			rows="4"
			aria-label="Matter context"
			class="block max-h-96 w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		></textarea>
		<div class="flex items-center justify-between">
			<p
				data-testid="context-bytes"
				class={overCap ? 'text-xs text-mlq-error' : 'text-xs text-mlq-muted'}
			>
				{bytes} / 102400 bytes
			</p>
			<button
				type="submit"
				disabled={!canSave}
				class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
				>Save context</button
			>
		</div>
	</form>
</section>
