<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import GenDocumentPicker from '$lib/playbooks/GenDocumentPicker.svelte';
	import GenProgress from '$lib/playbooks/GenProgress.svelte';
	import PlaybookEditor from '$lib/playbooks/editor/PlaybookEditor.svelte';
	import { isValidDraft } from '$lib/playbooks/editorDraft';
	import { createGenFlow, type DocSelection } from '$lib/playbooks/genFlow.svelte';
	import type { PlaybookCreate } from '$lib/playbooks/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const flow = createGenFlow({
		onGenerationStarted: (id) => {
			const url = new URL(page.url);
			url.searchParams.set('generation', id);
			replaceState(`${url.pathname}${url.search}`, {});
		}
	});

	let selected = $state<(DocSelection & { filename: string })[]>([]);
	let contractType = $state('');
	let edited = $state<PlaybookCreate | null>(null);

	const canGenerate = $derived(selected.length > 0 && contractType.trim().length > 0);
	const canSave = $derived(!!edited && isValidDraft(edited));

	let resumed = false;
	$effect(() => {
		if (data.generation && !resumed) {
			resumed = true;
			// Cast: the schema types draft_playbook loosely; resume accepts the same shape at runtime
			flow.resume(data.generation as Parameters<typeof flow.resume>[0]);
		}
	});
</script>

<svelte:head><title>New playbook — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<a href="/playbooks" class="text-xs text-mlq-muted hover:underline">← Playbooks</a>
	<h1 class="mt-2 font-serif text-2xl text-mlq-strong">Generate a playbook from documents</h1>

	{#if flow.phase === 'idle'}
		<div class="mt-6 space-y-4">
			<div>
				<label for="ct" class="block text-xs font-medium tracking-wide text-mlq-muted uppercase"
					>Contract type</label
				>
				<input
					id="ct"
					bind:value={contractType}
					list="ct-options"
					placeholder="NDA, MSA-SaaS, DPA-GDPR, …"
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text"
				/>
				<datalist id="ct-options"
					><option value="NDA"></option><option value="MSA-SaaS"></option><option
						value="MSA-Commercial-Purchase"
					></option><option value="DPA-GDPR"></option></datalist
				>
			</div>
			<GenDocumentPicker matters={data.matters} matterFiles={data.matterFiles} bind:selected />
			<button
				type="button"
				disabled={!canGenerate}
				onclick={() => flow.generate(selected, contractType)}
				class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40"
				>Generate playbook</button
			>
		</div>
	{:else if flow.phase !== 'review'}
		<div class="mt-6"><GenProgress phase={flow.phase} error={flow.error} stuck={flow.stuck} /></div>
	{/if}

	{#if flow.phase === 'review' && flow.draft}
		<div class="mt-6">
			<PlaybookEditor initial={flow.draft} onchange={(v) => (edited = v)} />
			{#if form?.error}<p class="mt-3 text-sm text-mlq-error">{form.error}</p>{/if}
			<form method="POST" action="?/save" use:enhance class="mt-4">
				<input type="hidden" name="draft" value={edited ? JSON.stringify(edited) : ''} />
				<button
					type="submit"
					disabled={!canSave}
					class="rounded-mlq-control bg-mlq-text px-3 py-1.5 text-sm text-mlq-surface disabled:opacity-40"
					>Save playbook</button
				>
			</form>
		</div>
	{/if}
</div>
