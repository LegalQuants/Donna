<script lang="ts">
	import { untrack } from 'svelte';
	import TagInput from '$lib/skills/authoring/TagInput.svelte';
	import type { SavedPrompt, SavedPromptInput } from './types';

	let {
		open,
		prompt = null,
		onsave,
		onclose
	}: {
		open: boolean;
		prompt?: SavedPrompt | null;
		onsave: (input: SavedPromptInput) => Promise<boolean>;
		onclose: () => void;
	} = $props();

	let name = $state(untrack(() => prompt?.name ?? ''));
	let promptText = $state(untrack(() => prompt?.prompt_text ?? ''));
	let tags = $state<string[]>(untrack(() => [...(prompt?.tags ?? [])]));
	let saving = $state(false);

	const canSave = $derived(name.trim().length > 0 && promptText.trim().length > 0 && !saving);

	async function submit() {
		if (!canSave) return;
		saving = true;
		const ok = await onsave({ name: name.trim(), prompt_text: promptText, tags });
		saving = false;
		if (ok) onclose();
	}

	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

{#if open}
	<div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={onclose}></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label={prompt ? 'Edit prompt' : 'New prompt'}
		class="fixed top-1/2 left-1/2 z-40 w-[32rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<h2 class="mb-3 text-sm font-medium text-mlq-text">{prompt ? 'Edit prompt' : 'New prompt'}</h2>
		<label class="block text-xs text-mlq-muted"
			>Name
			<input
				bind:value={name}
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
		</label>
		<label class="mt-3 block text-xs text-mlq-muted"
			>Prompt text
			<textarea
				bind:value={promptText}
				rows="6"
				class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			></textarea>
		</label>
		<div class="mt-3 block text-xs text-mlq-muted">
			Tags
			<div class="mt-1"><TagInput bind:tags /></div>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				onclick={onclose}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Cancel</button
			>
			<button
				type="button"
				onclick={submit}
				disabled={!canSave}
				class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white disabled:opacity-40"
				>Save</button
			>
		</div>
	</div>
{/if}
