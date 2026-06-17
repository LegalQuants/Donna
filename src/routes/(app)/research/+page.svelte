<script lang="ts">
	import type { PageData } from './$types';
	import { createResearch } from '$lib/research/researchStore.svelte';
	import { textFieldLabel } from '$lib/research/research';
	import ResearchGate from '$lib/research/ResearchGate.svelte';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';

	let { data }: { data: PageData } = $props();
	const r = createResearch();
	const docPanel = createDocPanel();
	let q = $state('');
	let citeText = $state('');
</script>

<svelte:head><title>Research · Donna</title></svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<h1 class="text-lg font-semibold text-mlq-text">Case-law research</h1>

	{#if !data.capabilities.enabled}
		<div class="mt-4"><ResearchGate /></div>
	{:else}
		<form
			class="mt-4 flex gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				r.search(q);
			}}
		>
			<input
				type="search"
				aria-label="Search case law"
				bind:value={q}
				placeholder="Search case law (e.g. Chevron deference)"
				class="flex-1 rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
			/>
			<button
				type="submit"
				disabled={r.loading}
				class="rounded-mlq-control bg-mlq-workflow px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
			>
				{r.loading ? 'Searching…' : 'Search'}
			</button>
		</form>

		{#if r.error}<p role="alert" class="mt-3 text-xs text-mlq-error">{r.error}</p>{/if}

		<div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
			<section>
				<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
					Results{#if r.count !== null}
						({r.count}){/if}
				</h2>
				<ul class="mt-2 space-y-2">
					{#each r.results as item (item.cluster_id ?? item.case_name)}
						<li>
							<button
								type="button"
								onclick={() => item.cluster_id && r.openCluster(item.cluster_id)}
								class="w-full rounded-mlq-control border border-mlq-subtle p-3 text-left hover:bg-mlq-surface-alt"
							>
								<div class="text-sm font-medium text-mlq-text">{item.case_name ?? 'Untitled'}</div>
								<div class="text-xs text-mlq-muted">{item.court ?? ''} {item.date_filed ?? ''}</div>
								{#if item.snippet}<div class="mt-1 text-xs text-mlq-muted">{item.snippet}</div>{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>

			<section>
				{#if r.cluster}
					<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
						{r.cluster.cluster.case_name ?? 'Case'}
					</h2>
					<ul class="mt-2 space-y-2">
						{#each r.cluster.opinions as op (op.opinion_id)}
							<li
								class="flex items-center justify-between rounded-mlq-control border border-mlq-subtle p-3"
							>
								<div class="text-xs text-mlq-muted">
									Opinion #{op.opinion_id}
									{#if textFieldLabel(op.text_field_used)}
										· {textFieldLabel(op.text_field_used)}{/if}
								</div>
								<button
									type="button"
									onclick={() =>
										docPanel.openOpinion({
											opinionId: op.opinion_id,
											caseName: r.cluster!.cluster.case_name ?? `Opinion #${op.opinion_id}`
										})}
									class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt"
								>
									Open
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<section class="mt-8">
			<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Verify citations</h2>
			<form
				class="mt-2"
				onsubmit={(e) => {
					e.preventDefault();
					r.verify(citeText);
				}}
			>
				<textarea
					bind:value={citeText}
					rows="3"
					placeholder="Paste text containing reporter citations…"
					class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
				></textarea>
				<button
					type="submit"
					class="mt-2 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt"
					>Verify</button
				>
			</form>
			<ul class="mt-3 space-y-1">
				{#each r.citations as c (c.citation)}
					<li class="text-xs text-mlq-text">
						<span class="font-medium">{c.citation}</span>
						{#if c.clusters.length}
							— <button
								type="button"
								onclick={() => c.clusters[0].id && r.openCluster(c.clusters[0].id)}
								class="text-mlq-workflow hover:underline"
								>{c.clusters[0].case_name ?? 'view'}</button
							>
						{:else}<span class="text-mlq-muted"> — not found</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
