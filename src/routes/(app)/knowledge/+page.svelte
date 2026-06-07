<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Knowledge — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Knowledge</h1>

	{#if data.kbs.length === 0}
		<div
			class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
		>
			No knowledge bases yet. Create one from a matter's Knowledge section.
		</div>
	{:else}
		<ul class="rounded-mlq-control border border-mlq-subtle">
			{#each data.kbs as k (k.id)}
				<li class="border-b border-mlq-subtle last:border-b-0">
					<a
						href="/knowledge/{k.id}"
						class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50"
					>
						<span class="min-w-0 flex-1 truncate text-sm text-mlq-text">{k.name}</span>
						<span class="shrink-0 text-xs text-mlq-muted"
							>{k.file_count} files · {k.chunk_count} chunks</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
