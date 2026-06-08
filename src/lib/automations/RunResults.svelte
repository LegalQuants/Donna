<!-- src/lib/automations/RunResults.svelte -->
<!-- The run's work-product: findings in emission order (created_at ASC — the
     run's output sequence, intentionally not severity-grouped) + the documents
     (artifacts) the run saved to its target KB + the memories it proposed
     (inline keep/dismiss for proposed; overflow note to Review). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { FileText, Download } from '@lucide/svelte';
	import FindingCard from './FindingCard.svelte';
	import { severitySummary, type FindingItem, type RunMemoryItem } from './findings';
	import { stateChipClass, formatBytes } from './display';
	import type { ArtifactItem } from './artifacts';

	let {
		findings,
		findingsTotal,
		memories,
		memoriesTotal = null,
		running,
		artifacts = null,
		artifactsTotal = null,
		onopenartifact
	}: {
		findings: FindingItem[] | null;
		findingsTotal: number | null;
		memories: RunMemoryItem[] | null;
		memoriesTotal?: number | null;
		running: boolean;
		artifacts?: ArtifactItem[] | null;
		artifactsTotal?: number | null;
		onopenartifact?: (artifact: ArtifactItem) => void;
	} = $props();

	const summary = $derived(findings && findings.length > 0 ? severitySummary(findings) : '');
	const overflow = $derived(
		findings !== null && findingsTotal !== null && findingsTotal > findings.length
			? findingsTotal - findings.length
			: 0
	);
	const memoriesOverflow = $derived(
		memoriesTotal !== null && memories !== null && memoriesTotal > memories.length
			? memoriesTotal - memories.length
			: 0
	);
	const artifactsOverflow = $derived(
		artifactsTotal !== null && artifacts !== null && artifactsTotal > artifacts.length
			? artifactsTotal - artifacts.length
			: 0
	);
</script>

<section aria-label="Results" class="flex flex-col gap-2">
	<div>
		<h2 class="text-sm font-medium text-mlq-strong">Results</h2>
		<p class="text-xs text-mlq-muted">
			{running ? 'Results so far — the run is still working.' : 'What this run produced.'}
		</p>
	</div>

	{#if artifacts && artifacts.length > 0}
		<div class="mb-1">
			<h3 class="mb-1 text-xs font-medium text-mlq-muted">Documents</h3>
			<ul class="flex flex-col gap-1">
				{#each artifacts as artifact (artifact.id)}
					<li
						class="flex items-center gap-2 rounded-mlq-control border border-mlq-subtle px-2 py-1.5"
					>
						<FileText size={14} class="shrink-0 text-mlq-muted" aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate text-sm text-mlq-text" title={artifact.name}
							>{artifact.name}</span
						>
						<span class="shrink-0 text-xs text-mlq-muted">{formatBytes(artifact.size_bytes)}</span>
						{#if artifact.file_id}
							<button
								type="button"
								aria-label="Open {artifact.name}"
								onclick={() => onopenartifact?.(artifact)}
								class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-mlq-workflow hover:underline"
								>Open</button
							>
							<a
								href="/files/{artifact.file_id}/content"
								download={artifact.name || undefined}
								aria-label="Download {artifact.name}"
								class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-mlq-muted hover:text-mlq-text"
								><Download size={12} aria-hidden="true" /> Download</a
							>
						{:else}
							<span class="shrink-0 text-xs text-mlq-muted italic">file deleted</span>
						{/if}
					</li>
				{/each}
			</ul>
			{#if artifactsOverflow > 0}
				<p class="mt-1 text-xs text-mlq-muted">+{artifactsOverflow} more documents not shown.</p>
			{/if}
		</div>
	{/if}

	{#if findings === null}
		<p class="text-xs text-mlq-muted">Results unavailable right now.</p>
	{:else if findings.length === 0}
		<p class="text-xs text-mlq-muted">
			{running ? 'No findings yet.' : 'This run recorded no findings.'}
		</p>
	{:else}
		{#if summary}<p class="text-xs text-mlq-text">{summary}</p>{/if}
		<div class="flex flex-col gap-2">
			{#each findings as finding (finding.id)}
				<FindingCard {finding} />
			{/each}
		</div>
		{#if overflow > 0}
			<p class="text-xs text-mlq-muted">+{overflow} more findings not shown.</p>
		{/if}
	{/if}

	{#if memories && memories.length > 0}
		<div class="mt-2">
			<h3 class="mb-1 text-xs font-medium text-mlq-muted">Memories this run proposed</h3>
			<ul class="flex flex-col gap-1">
				{#each memories as memory (memory.id)}
					<li class="flex items-start gap-2 rounded-mlq-control border border-mlq-subtle p-2">
						<span
							class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {stateChipClass(
								memory.state
							)}">{memory.state}</span
						>
						<div class="min-w-0 flex-1">
							<span class="text-xs text-mlq-muted">{memory.category}</span>
							<p class="text-sm text-mlq-text">{memory.content}</p>
						</div>
						{#if memory.state === 'proposed'}
							<div class="flex shrink-0 gap-1">
								<form method="POST" action="?/keepMemory" use:enhance>
									<input type="hidden" name="id" value={memory.id} />
									<button
										type="submit"
										class="rounded px-1.5 py-0.5 text-xs font-medium text-mlq-success hover:underline"
										>Keep</button
									>
								</form>
								<form method="POST" action="?/dismissMemory" use:enhance>
									<input type="hidden" name="id" value={memory.id} />
									<button
										type="submit"
										class="rounded px-1.5 py-0.5 text-xs text-mlq-muted hover:text-mlq-text"
										>Dismiss</button
									>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if memoriesOverflow > 0}
				<p class="mt-1 text-xs text-mlq-muted">
					+{memoriesOverflow} more — review all in
					<a href="/automations/review" class="text-mlq-workflow underline-offset-2 hover:underline"
						>Automations → Review</a
					>
				</p>
			{/if}
		</div>
	{/if}
</section>
