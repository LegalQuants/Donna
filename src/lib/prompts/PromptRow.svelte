<script lang="ts">
	import type { SavedPrompt } from './types';
	let {
		prompt,
		onedit,
		ondelete
	}: { prompt: SavedPrompt; onedit: () => void; ondelete: () => void } = $props();
</script>

<div class="flex items-start gap-3 px-3 py-2">
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="truncate text-sm font-medium text-mlq-text">{prompt.name}</span>
			{#each prompt.tags ?? [] as t (t)}<span
					class="shrink-0 rounded bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text">{t}</span
				>{/each}
		</div>
		<p class="mt-0.5 line-clamp-2 text-xs text-mlq-muted">{prompt.prompt_text}</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<button
			type="button"
			onclick={onedit}
			class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:border-mlq-workflow"
			>Edit</button
		>
		<button
			type="button"
			onclick={ondelete}
			class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-error"
			>Delete</button
		>
	</div>
</div>
