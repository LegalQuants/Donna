<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import { deriveSlug } from './deriveSlug';
	import TagInput from './TagInput.svelte';

	type CreateFail = { field?: string; error?: string };
	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const STARTER_BODY =
		'## Instructions\n\nDescribe what Donna should do when this skill is used.\n';

	let displayName = $state('');
	let slug = $state('');
	let slugTouched = $state(false);
	let description = $state('');
	let body = $state(STARTER_BODY);
	let tags = $state<string[]>([]);
	let slashAlias = $state('');
	let serverError = $state<CreateFail | null>(null);

	// Auto-derive the slug from the name until the user edits the slug themselves.
	// (Reads slugTouched + displayName, writes slug only — no reactivity cycle.)
	$effect(() => {
		if (!slugTouched) slug = deriveSlug(displayName);
	});

	const canCreate = $derived(
		displayName.trim() !== '' &&
			description.trim() !== '' &&
			body.trim() !== '' &&
			slug.trim() !== ''
	);

	// Reset to a clean slate every time the modal opens, so a prior failed submit
	// never leaves ghost field values or a stale server error behind on reopen.
	$effect(() => {
		if (!open) return;
		displayName = '';
		slug = '';
		slugTouched = false;
		description = '';
		body = STARTER_BODY;
		tags = [];
		slashAlias = '';
		serverError = null;
	});

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
		aria-label="Create skill"
		class="fixed top-1/2 left-1/2 z-40 max-h-[90vh] w-[34rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-mlq-text">New skill</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button
			>
		</div>

		<form
			method="POST"
			action="?/create"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'failure')
						serverError = (result.data as CreateFail | undefined) ?? null;
				}}
			aria-label="Create skill"
			class="space-y-3"
		>
			<label class="block text-xs text-mlq-muted">
				Name
				<input
					name="display_name"
					type="text"
					required
					bind:value={displayName}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>

			<label class="block text-xs text-mlq-muted">
				Slug
				<input
					name="slug"
					type="text"
					required
					bind:value={slug}
					oninput={() => (slugTouched = true)}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			{#if serverError?.field === 'slug' && serverError?.error}
				<p class="text-xs text-mlq-error">{serverError.error}</p>
			{/if}

			<label class="block text-xs text-mlq-muted">
				Description
				<input
					name="description"
					type="text"
					required
					bind:value={description}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>

			<div class="block text-xs text-mlq-muted">
				Tags
				<div class="mt-1"><TagInput bind:tags /></div>
			</div>

			<label class="block text-xs text-mlq-muted">
				Slash command (optional)
				<input
					name="slash_alias"
					type="text"
					placeholder="/nda"
					bind:value={slashAlias}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			{#if serverError?.field === 'slash_alias' && serverError?.error}
				<p class="text-xs text-mlq-error">{serverError.error}</p>
			{/if}

			<label class="block text-xs text-mlq-muted">
				Body
				<textarea
					name="body"
					rows="8"
					bind:value={body}
					class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				></textarea>
			</label>

			{#if serverError?.error && !serverError?.field}
				<p class="text-xs text-mlq-error">{serverError.error}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={onclose}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
					>Cancel</button
				>
				<button
					type="submit"
					disabled={!canCreate}
					class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface disabled:opacity-50"
					>Create</button
				>
			</div>
		</form>
	</div>
{/if}
