<script lang="ts">
	import { enhance } from '$app/forms';
	import KbRenameModal from './KbRenameModal.svelte';
	import type { KnowledgeBase } from './types';

	let { kb }: { kb: KnowledgeBase } = $props();
	let renameOpen = $state(false);
</script>

<header class="border-b border-mlq-subtle pb-4">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-xl font-medium text-mlq-text">{kb.name}</h1>
			<p class="mt-0.5 text-xs text-mlq-muted">
				{kb.file_count} files · {kb.chunk_count} chunks
			</p>
			{#if kb.description}
				<p class="mt-2 text-sm text-mlq-muted">{kb.description}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				onclick={() => (renameOpen = true)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Rename</button
			>
			<form method="POST" action="?/archive" use:enhance aria-label="Archive knowledge base">
				<button
					type="submit"
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:text-mlq-error"
					>Archive</button
				>
			</form>
		</div>
	</div>
</header>

<KbRenameModal open={renameOpen} {kb} onclose={() => (renameOpen = false)} />
