<script lang="ts">
	import type { PageData } from './$types';
	import { createResearch } from '$lib/research/researchStore.svelte';
	import { textFieldLabel } from '$lib/research/research';
	import ResearchGate from '$lib/research/ResearchGate.svelte';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
	import ResearchStarters from '$lib/research/ResearchStarters.svelte';

	let { data }: { data: PageData } = $props();
	const r = createResearch();
	const docPanel = createDocPanel();
	let q = $state('');
	let court = $state('');
	let orderBy = $state('');
	let citeText = $state('');
	let activeOpinion = $state<{ id: number; name: string } | null>(null);
	let findQuery = $state('');
</script>

<svelte:head><title>Research · Donna</title></svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<h1 class="text-lg font-semibold text-mlq-text">Case-law research</h1>

	{#if !data.capabilities.enabled}
		<div class="mt-4"><ResearchGate /></div>
	{:else}
		<form
			class="mt-4 flex flex-col gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				r.search(q, { court, order_by: orderBy });
			}}
		>
			<div class="flex gap-2">
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
			</div>
			<div class="flex gap-2">
				<input
					type="text"
					aria-label="Court filter"
					bind:value={court}
					placeholder="Court (e.g. scotus)"
					class="flex-1 rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
				/>
				<select
					aria-label="Sort order"
					bind:value={orderBy}
					class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
				>
					<option value="">Relevance</option>
					<option value="dateFiled desc">Newest first</option>
					<option value="dateFiled asc">Oldest first</option>
				</select>
			</div>
		</form>

		{#if r.count === null && !r.loading}
			<ResearchStarters
				onpick={(query) => {
					q = query;
					r.search(query, { court, order_by: orderBy });
				}}
			/>
		{/if}

		{#if r.error}<p role="alert" class="mt-3 text-xs text-mlq-error">{r.error}</p>{/if}

		<div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
			<section>
				<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">
					Results{#if r.count !== null}
						({r.count}){/if}
				</h2>
				<ul class="mt-2 space-y-2">
					{#each r.results as item (item.cluster_id ?? item.case_name ?? item.absolute_url)}
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
				{#if r.nextCursor}
					<button
						type="button"
						onclick={() => r.loadMore()}
						disabled={r.loading}
						class="mt-3 w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 text-sm text-mlq-text hover:bg-mlq-surface-alt disabled:opacity-60"
					>
						{r.loading ? 'Loading…' : 'Load more'}
					</button>
				{/if}
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
									onclick={() => {
										const caseName = r.cluster!.cluster.case_name ?? `Opinion #${op.opinion_id}`;
										docPanel.openOpinion({ opinionId: op.opinion_id, caseName });
										activeOpinion = { id: op.opinion_id, name: caseName };
										findQuery = '';
									}}
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

		{#if activeOpinion}
			<section class="mt-8">
				<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Find in opinion</h2>
				<p class="mt-0.5 text-xs text-mlq-muted">{activeOpinion.name}</p>
				<form
					class="mt-2 flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						r.findInCase(activeOpinion!.id, findQuery);
					}}
				>
					<input
						type="text"
						aria-label="Find in opinion"
						bind:value={findQuery}
						placeholder="Search within this opinion…"
						class="flex-1 rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
					/>
					<button
						type="submit"
						class="rounded-mlq-control border border-mlq-subtle px-3 py-2 text-sm text-mlq-text hover:bg-mlq-surface-alt"
						>Find</button
					>
				</form>
				{#if r.matches.length}
					<ul class="mt-3 space-y-2">
						{#each r.matches as m (m.position)}
							<li class="rounded-mlq-control border border-mlq-subtle p-3">
								<span class="block text-xs text-mlq-muted">Position {m.position}</span>
								<span class="mt-0.5 block text-sm text-mlq-text">{m.snippet}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

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
