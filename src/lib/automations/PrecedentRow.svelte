<!-- src/lib/automations/PrecedentRow.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { stateChipClass, formatWhen } from './display';
	import type { PrecedentEntry } from './precedents';
	import type { MatterSummary } from '$lib/matters/types';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		precedent,
		matters,
		error = null
	}: {
		precedent: PrecedentEntry;
		matters: MatterSummary[];
		error?: string | null;
	} = $props();

	let confirmingDismiss = $state(false);
	let promoting = $state(false);
	let projectId = $state<string | null>(null);

	const canPromote = $derived(projectId !== null);

	const submitFn: SubmitFunction =
		() =>
		async ({ update, result }) => {
			await update();
			if (result.type === 'failure') {
				await invalidateAll();
			}
		};
</script>

<div class="flex flex-col gap-2 rounded-mlq-control border border-mlq-subtle p-3">
	<!-- Header row: pattern_kind chip + meta -->
	<div class="flex flex-wrap items-center gap-2">
		<span
			class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {stateChipClass(
				precedent.pattern_kind
			)}">{precedent.pattern_kind}</span
		>
		<span class="text-xs text-mlq-muted">seen {precedent.observed_count}×</span>
		<span class="ml-auto shrink-0 text-xs text-mlq-muted">{formatWhen(precedent.created_at)}</span>
	</div>

	<!-- Content -->
	<p class="text-sm text-mlq-text">{precedent.summary}</p>

	<!-- From run link -->
	{#if precedent.source_session_id}
		<a
			href="/automations/{precedent.source_session_id}"
			class="text-xs text-mlq-workflow hover:underline">From run</a
		>
	{/if}

	<!-- Error alert -->
	{#if error}
		<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>
	{/if}

	<!-- Actions -->
	<div class="flex flex-wrap items-start gap-2">
		<!-- Dismiss (two-step) -->
		{#if confirmingDismiss}
			<div class="flex items-center gap-2">
				<span class="text-xs text-mlq-text">Dismiss precedent?</span>
				<form method="POST" action="?/dismissPrecedent" use:enhance={submitFn} class="shrink-0">
					<input type="hidden" name="id" value={precedent.id} />
					<button type="submit" class="text-xs font-medium text-mlq-error hover:underline"
						>Confirm dismiss</button
					>
				</form>
				<button
					type="button"
					onclick={() => (confirmingDismiss = false)}
					class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
				>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => {
					confirmingDismiss = true;
					promoting = false;
				}}
				class="shrink-0 text-xs text-mlq-muted hover:text-mlq-text">Dismiss</button
			>
		{/if}

		<!-- Promote panel toggle -->
		{#if !confirmingDismiss}
			{#if promoting}
				<div class="flex w-full flex-col gap-2">
					<form method="POST" action="?/promote" use:enhance={submitFn} class="flex flex-col gap-2">
						<input type="hidden" name="id" value={precedent.id} />
						{#if projectId}
							<input type="hidden" name="project_id" value={projectId} />
						{/if}
						<MatterPicker {matters} bind:selectedId={projectId} placement="down" />
						<div class="flex items-center gap-2">
							<button
								type="submit"
								disabled={!canPromote}
								class="rounded-mlq-control bg-mlq-workflow px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
								>Create proposal</button
							>
							<button
								type="button"
								onclick={() => {
									promoting = false;
									projectId = null;
								}}
								class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
							>
						</div>
					</form>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (promoting = true)}
					class="shrink-0 text-xs text-mlq-workflow hover:underline">Promote…</button
				>
			{/if}
		{/if}
	</div>
</div>
