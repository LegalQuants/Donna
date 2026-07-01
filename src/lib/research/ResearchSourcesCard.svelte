<!-- src/lib/research/ResearchSourcesCard.svelte -->
<!-- Read-only registry of authoritative legal sources this instance can reach
     (GET /research/sources). Mirrors the ProviderKeysCard section idiom.
     Registered-but-unconfigured sources render as "Unavailable", never hidden. -->
<script lang="ts">
	import { sourceTitle, type ResearchSource } from './sources';

	let { sources }: { sources: ResearchSource[] | null } = $props();
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
	<div class="border-b border-mlq-subtle px-4 py-2">
		<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
			Authoritative sources
		</h2>
		<p class="mt-1 text-xs text-mlq-muted">
			The legal sources this instance can verify quotes against. Unavailable sources are registered
			but not configured on this deployment.
		</p>
	</div>
	{#if !sources}
		<p class="px-4 py-3 text-sm text-mlq-muted">Could not load source availability right now.</p>
	{:else if sources.length === 0}
		<p class="px-4 py-3 text-sm text-mlq-muted">No authoritative sources are registered.</p>
	{:else}
		<ul>
			{#each sources as s (s.type + (s.name ?? ''))}
				<li
					class="flex items-start justify-between gap-3 border-b border-mlq-subtle px-4 py-3 last:border-b-0"
				>
					<div class="min-w-0">
						<div class="text-sm font-medium text-mlq-text">{sourceTitle(s)}</div>
						{#if s.coverage}<div class="mt-0.5 text-xs text-mlq-muted">{s.coverage}</div>{/if}
						<div class="mt-1 flex flex-wrap items-center gap-1">
							{#each s.content_kinds as k (k)}
								<span class="rounded bg-mlq-surface-alt px-1.5 py-0.5 text-[10px] text-mlq-muted"
									>{k}</span
								>
							{/each}
							{#if s.jurisdiction}<span class="text-[10px] text-mlq-muted">· {s.jurisdiction}</span
								>{/if}
						</div>
					</div>
					<span
						class="shrink-0 text-[11px] font-medium {s.enabled
							? 'text-mlq-success'
							: 'text-mlq-muted'}"
					>
						{s.enabled ? '● Available' : '○ Unavailable'}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
