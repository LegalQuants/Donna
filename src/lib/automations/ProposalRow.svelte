<!-- src/lib/automations/ProposalRow.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatWhen } from './display';
	import type { ProposalEntry } from './precedents';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		proposal,
		matterName,
		error = null
	}: {
		proposal: ProposalEntry;
		matterName: string | null;
		error?: string | null;
	} = $props();

	let confirmingAccept = $state(false);

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
	<!-- Header: matter name + date -->
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-mlq-text"
			>For matter: {matterName ?? proposal.project_id}</span
		>
		<span class="ml-auto shrink-0 text-xs text-mlq-muted">{formatWhen(proposal.created_at)}</span>
	</div>

	<!-- Suggested markdown content -->
	<pre
		class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-xs whitespace-pre-wrap text-mlq-text">{proposal.suggested_md}</pre>

	<!-- Error alert -->
	{#if error}
		<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>
	{/if}

	<!-- Actions -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Accept (two-step) -->
		{#if confirmingAccept}
			<div class="flex items-center gap-2">
				<span class="text-xs text-mlq-text">Add this to the matter's context?</span>
				<form method="POST" action="?/acceptProposal" use:enhance={submitFn} class="shrink-0">
					<input type="hidden" name="id" value={proposal.id} />
					<button type="submit" class="text-xs font-medium text-mlq-success hover:underline"
						>Confirm accept</button
					>
				</form>
				<button
					type="button"
					onclick={() => (confirmingAccept = false)}
					class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
				>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (confirmingAccept = true)}
				class="shrink-0 text-xs font-medium text-mlq-success hover:underline">Accept</button
			>
		{/if}

		<!-- Reject (single-step) -->
		{#if !confirmingAccept}
			<form method="POST" action="?/rejectProposal" use:enhance={submitFn} class="shrink-0">
				<input type="hidden" name="id" value={proposal.id} />
				<button type="submit" class="text-xs text-mlq-muted hover:text-mlq-text">Reject</button>
			</form>
		{/if}
	</div>
</div>
