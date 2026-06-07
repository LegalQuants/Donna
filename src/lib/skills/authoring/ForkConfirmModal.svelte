<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import { deriveSlug } from './deriveSlug';
	import type { SkillSummary } from './types';

	let { open, skill, onclose }: { open: boolean; skill: SkillSummary | null; onclose: () => void } =
		$props();

	let slug = $state('');
	let forkError = $state<string | null>(null);

	// Pre-fill the slug from the selected built-in each time the modal opens.
	$effect(() => {
		if (open && skill) {
			slug = deriveSlug(skill.title);
			forkError = null;
		}
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

{#if open && skill}
	<div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={onclose}></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Fork skill"
		class="fixed top-1/2 left-1/2 z-40 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-mlq-text">Fork "{skill.title}"</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button
			>
		</div>
		<p class="mb-3 text-xs text-mlq-muted">
			Creates an editable copy in your skills. Pick an id (slug) — this can't be changed later.
		</p>
		<form
			method="POST"
			action="?/fork"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'failure')
						forkError =
							(result.data as { error?: string } | undefined)?.error ?? 'Could not fork the skill.';
				}}
			aria-label="Fork skill"
			class="space-y-3"
		>
			<input type="hidden" name="skill_name" value={skill.name} />
			<label class="block text-xs text-mlq-muted">
				Slug
				<input
					name="new_name"
					type="text"
					required
					bind:value={slug}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			{#if forkError}
				<p class="text-xs text-mlq-error">{forkError}</p>
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
					class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">Fork</button
				>
			</div>
		</form>
	</div>
{/if}
