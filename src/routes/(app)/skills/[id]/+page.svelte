<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import TagInput from '$lib/skills/authoring/TagInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// One-time seeds from the loaded skill (props refresh on invalidate; $state persists across save).
	let displayName = $state(untrack(() => data.skill.display_name));
	let description = $state(untrack(() => data.skill.description));
	let version = $state(untrack(() => data.skill.version));
	let slashAlias = $state(untrack(() => data.skill.slash_alias ?? ''));
	let tags = $state<string[]>(untrack(() => [...(data.skill.tags ?? [])]));
	let body = $state(untrack(() => data.skill.body));

	const bytes = $derived(new TextEncoder().encode(body).length);
	const canSave = $derived(
		displayName.trim() !== '' && description.trim() !== '' && body.trim() !== ''
	);

	let confirmingArchive = $state(false);

	$effect(() => {
		if (!confirmingArchive) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') confirmingArchive = false;
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

<svelte:head><title>{data.skill.display_name} — Skills — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-sm text-mlq-muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app skills link -->
		<a href="/skills" class="hover:text-mlq-text">Skills</a> › {data.skill.display_name}
	</nav>

	<div class="mb-4 flex items-center gap-2 text-xs text-mlq-muted">
		<span class="font-mono">{data.skill.slug} · v{data.skill.version}</span>
		{#if data.skill.forked_from}
			<span>·</span><span>forked from <span class="font-mono">{data.skill.forked_from}</span></span>
		{/if}
	</div>

	<form method="POST" action="?/save" use:enhance aria-label="Edit skill" class="space-y-4">
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
			Description
			<input
				name="description"
				type="text"
				required
				bind:value={description}
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
		</label>

		<div class="flex gap-4">
			<label class="block w-32 text-xs text-mlq-muted">
				Version
				<input
					name="version"
					type="text"
					bind:value={version}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			<label class="block flex-1 text-xs text-mlq-muted">
				Slash command (optional)
				<input
					name="slash_alias"
					type="text"
					placeholder="/nda"
					bind:value={slashAlias}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
		</div>
		{#if form && 'field' in form && form.field === 'slash_alias' && form.error}
			<p class="text-xs text-mlq-error">{form.error}</p>
		{/if}

		<div class="block text-xs text-mlq-muted">
			Tags
			<div class="mt-1"><TagInput bind:tags /></div>
		</div>

		<label class="block text-xs text-mlq-muted">
			Body
			<textarea
				name="body"
				rows="16"
				bind:value={body}
				class="mt-1 block w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			></textarea>
		</label>

		<div class="flex items-center justify-between">
			<p class="text-xs text-mlq-muted">{bytes} bytes</p>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (confirmingArchive = true)}
					class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error"
					>Archive</button
				>
				<button
					type="submit"
					disabled={!canSave}
					class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
					>Save</button
				>
			</div>
		</div>
	</form>
</div>

{#if confirmingArchive}
	<div
		role="presentation"
		class="fixed inset-0 z-30 bg-black/40"
		onclick={() => (confirmingArchive = false)}
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Archive skill"
		class="fixed top-1/2 left-1/2 z-40 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<h2 class="mb-2 text-sm font-medium text-mlq-text">Archive "{data.skill.display_name}"?</h2>
		<p class="mb-4 text-xs text-mlq-muted">
			It will be removed from your skills and the composer. This can't be undone.
		</p>
		<form method="POST" action="?/archive" use:enhance class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (confirmingArchive = false)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Cancel</button
			>
			<button type="submit" class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white"
				>Archive</button
			>
		</form>
	</div>
{/if}
