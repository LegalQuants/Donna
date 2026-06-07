<script lang="ts">
	import { X } from '@lucide/svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import { statusBadge } from '$lib/matters/files/uploadFile';
	import type { createTabularBuilder } from './tabularBuilder.svelte';
	import type { createTabularUploads } from './tabularUploads.svelte';

	let {
		builder,
		uploads,
		matters,
		matterFiles,
		selectedMatterId,
		onmatter
	}: {
		builder: ReturnType<typeof createTabularBuilder>;
		uploads: ReturnType<typeof createTabularUploads>;
		matters: { id: string; name: string }[];
		matterFiles: { document_id: string; name: string }[];
		selectedMatterId: string | null;
		onmatter: (id: string | null) => void;
	} = $props();

	let tab = $state<'matter' | 'upload'>('matter');
	// eslint-disable-next-line svelte/no-reactive-reassignment
	let matterId = $state<string | null>(null);
	// Initialise once from the SSR-provided prop; the page owns subsequent updates via onmatter.
	$effect.pre(() => {
		matterId = selectedMatterId;
	});

	$effect(() => {
		if (matterId !== selectedMatterId) onmatter(matterId);
	});

	function toggle(doc: { document_id: string; name: string }, checked: boolean) {
		if (checked) builder.addDoc(doc);
		else builder.removeDoc(doc.document_id);
	}
</script>

<div class="space-y-3">
	<div class="flex gap-2 text-sm">
		<button
			type="button"
			class="rounded-mlq-control px-2.5 py-1 {tab === 'matter'
				? 'bg-mlq-strong text-white'
				: 'border border-mlq-subtle text-mlq-text'}"
			onclick={() => (tab = 'matter')}
		>
			From a matter
		</button>
		<button
			type="button"
			class="rounded-mlq-control px-2.5 py-1 {tab === 'upload'
				? 'bg-mlq-strong text-white'
				: 'border border-mlq-subtle text-mlq-text'}"
			onclick={() => (tab = 'upload')}
		>
			Upload
		</button>
	</div>

	{#if tab === 'matter'}
		<MatterPicker {matters} bind:selectedId={matterId} placement="down" />
		{#if matterFiles.length}
			<ul class="space-y-1">
				{#each matterFiles as f (f.document_id)}
					<li>
						<label class="flex items-center gap-2 text-sm text-mlq-text">
							<input
								type="checkbox"
								checked={builder.hasDoc(f.document_id)}
								onchange={(e) => toggle(f, e.currentTarget.checked)}
								aria-label={f.name}
							/>
							{f.name}
						</label>
					</li>
				{/each}
			</ul>
		{:else if matterId}
			<p class="text-xs text-mlq-muted">This matter has no ready documents yet.</p>
		{/if}
	{:else}
		<Dropzone onfiles={(files) => uploads.upload(files, (doc) => builder.addDoc(doc))} />
		{#if uploads.items.length}
			<ul class="space-y-1">
				{#each uploads.items as it (it.localId)}
					<li
						class="flex items-center gap-2 text-xs {it.status === 'failed'
							? 'text-mlq-error'
							: 'text-mlq-muted'}"
					>
						{it.name} · {it.status === 'uploading'
							? 'uploading'
							: statusBadge(it.status).label.toLowerCase()}
						<button
							type="button"
							aria-label={`Remove ${it.name}`}
							onclick={() => uploads.remove(it.localId)}
							class="text-mlq-muted hover:text-mlq-text"><X size={12} /></button
						>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if builder.docs.length}
		<div>
			<p class="mb-1 text-xs text-mlq-muted">
				{builder.docs.length} document{builder.docs.length === 1 ? '' : 's'} selected
			</p>
			<div class="flex flex-wrap gap-1.5">
				{#each builder.docs as d (d.document_id)}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
					>
						{d.name}
						<button
							type="button"
							aria-label={`Remove ${d.name}`}
							onclick={() => builder.removeDoc(d.document_id)}
							class="text-mlq-muted hover:text-mlq-text"><X size={11} /></button
						>
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
