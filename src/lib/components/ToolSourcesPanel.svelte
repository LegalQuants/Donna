<script lang="ts">
	import { Scale } from '@lucide/svelte';
	import type { ToolSource } from '$lib/citations/sources';

	let { sources }: { sources: ToolSource[] } = $props();
</script>

{#if sources.length > 0}
	<div class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs">
		<p class="mb-2 flex items-center gap-1 font-medium text-mlq-text">
			<Scale size={13} aria-hidden="true" /> Sources consulted ({sources.length})
		</p>
		<p class="mb-2 text-mlq-muted">External sources the assistant looked up for this answer.</p>
		<ul class="space-y-2">
			{#each sources as s (s.id || s.external_ref || s.label)}
				<li>
					<span class="block font-medium text-mlq-text">{s.label}</span>
					{#if s.subtitle}<span class="block text-mlq-muted">{s.subtitle}</span>{/if}
					{#if s.url}
						<a
							href={s.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-mlq-workflow hover:underline">View on CourtListener →</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
