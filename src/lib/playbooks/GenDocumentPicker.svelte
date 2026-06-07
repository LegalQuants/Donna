<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';
	import type { DocSelection } from './genFlow.svelte';
	type MatterSummary = { id: string; name: string };
	type IngestedFile = { id: string; filename: string; document_id: string };
	export type Selected = DocSelection & { filename: string };

	let {
		matters,
		matterFiles,
		selected = $bindable<Selected[]>([]),
		onchange
	}: {
		matters: MatterSummary[];
		matterFiles: IngestedFile[];
		selected?: Selected[];
		onchange?: (s: Selected[]) => void;
	} = $props();

	let tab = $state<'upload' | 'matter'>('upload');
	let selectedMatter = $state<string | null>(page.url.searchParams.get('matter'));

	function emit(next: Selected[]) {
		selected = next;
		onchange?.(next);
	}
	function isPicked(documentId: string) {
		return selected.some((s) => s.kind === 'matter' && s.documentId === documentId);
	}
	function toggleMatterFile(f: IngestedFile) {
		if (isPicked(f.document_id)) {
			emit(selected.filter((s) => !(s.kind === 'matter' && s.documentId === f.document_id)));
		} else {
			emit([...selected, { kind: 'matter', documentId: f.document_id, filename: f.filename }]);
		}
	}
	function addUploads(files: File[]) {
		emit([
			...selected,
			...files.map((file) => ({ kind: 'upload' as const, file, filename: file.name }))
		]);
	}
	function remove(i: number) {
		emit(selected.filter((_, idx) => idx !== i));
	}

	function syncMatterToUrl(id: string | null) {
		const url = new URL(page.url);
		if (id) url.searchParams.set('matter', id);
		else url.searchParams.delete('matter');
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}
	$effect(() => {
		const current = page.url.searchParams.get('matter');
		if (selectedMatter === current) return;
		syncMatterToUrl(selectedMatter);
	});
</script>

<div role="tablist" class="flex gap-1 border-b border-mlq-subtle text-sm">
	<button
		role="tab"
		type="button"
		aria-selected={tab === 'upload'}
		onclick={() => (tab = 'upload')}
		class="px-3 py-2 {tab === 'upload'
			? 'border-b-2 border-mlq-text font-medium text-mlq-text'
			: 'text-mlq-muted'}">Upload documents</button
	>
	<button
		role="tab"
		type="button"
		aria-selected={tab === 'matter'}
		onclick={() => (tab = 'matter')}
		class="px-3 py-2 {tab === 'matter'
			? 'border-b-2 border-mlq-text font-medium text-mlq-text'
			: 'text-mlq-muted'}">Choose from a matter</button
	>
</div>

<div class="mt-3">
	{#if tab === 'upload'}
		<Dropzone onfiles={addUploads} />
	{:else}
		<MatterPicker {matters} bind:selectedId={selectedMatter} />
		<div class="mt-3">
			{#if matterFiles.length === 0 && !selectedMatter}
				<p class="text-sm text-mlq-muted">Pick a matter to see its documents.</p>
			{:else if matterFiles.length === 0}
				<p class="text-sm text-mlq-muted">No ingested documents in this matter yet.</p>
			{:else}
				<ul class="rounded-mlq-control border border-mlq-subtle">
					{#each matterFiles as f (f.id)}
						<li
							class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0"
						>
							<input
								type="checkbox"
								id={`gf-${f.id}`}
								checked={isPicked(f.document_id)}
								onchange={() => toggleMatterFile(f)}
							/>
							<label for={`gf-${f.id}`} class="truncate text-sm text-mlq-text">{f.filename}</label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<div class="mt-3 text-xs text-mlq-muted">{selected.length} selected</div>
{#if selected.length > 0}
	<ul class="mt-1 space-y-1">
		{#each selected as s, i (s.filename + i)}
			<li class="flex items-center justify-between gap-2 text-sm text-mlq-text">
				<span class="truncate">{s.filename}</span>
				<button
					type="button"
					class="text-xs text-mlq-muted hover:underline"
					onclick={() => remove(i)}
					aria-label={`Remove ${s.filename}`}>Remove</button
				>
			</li>
		{/each}
	</ul>
{/if}
