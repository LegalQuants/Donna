<!-- src/lib/chat/ConnectedBanner.svelte -->
<script lang="ts">
	let {
		server = null,
		error = null,
		onretry
	}: { server?: string | null; error?: string | null; onretry: () => void } = $props();
</script>

{#if error}
	<div
		role="alert"
		class="mx-auto mb-3 max-w-2xl rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 px-3 py-2 text-xs text-mlq-text"
	>
		Couldn't connect to <span class="font-medium">{error}</span>. Please try again.
	</div>
{:else if server}
	<div
		role="status"
		class="mx-auto mb-3 flex max-w-2xl items-center justify-between gap-3 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 px-3 py-2 text-xs text-mlq-text"
	>
		<span>Connected to <span class="font-medium">{server}</span> — re-send your message?</span>
		<button
			type="button"
			onclick={onretry}
			class="rounded-mlq-control bg-mlq-workflow px-3 py-1 font-medium text-white hover:opacity-90"
			>Retry</button
		>
	</div>
{/if}
