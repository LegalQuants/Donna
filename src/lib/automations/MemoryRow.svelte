<!-- src/lib/automations/MemoryRow.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { stateChipClass } from './display';
	import { formatWhen } from './display';
	import type { MemoryEntry } from './memory';

	let { memory, error = null }: { memory: MemoryEntry; error?: string | null } = $props();
	let editing = $state(false);
	let confirmingDelete = $state(false);
	const actionable = $derived(memory.state === 'proposed');
</script>

<div class="flex flex-col gap-2 rounded-mlq-control border border-mlq-subtle p-3">
	<!-- Header row: state chip + category badge + meta -->
	<div class="flex flex-wrap items-center gap-2">
		<span
			class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {stateChipClass(memory.state)}"
			>{memory.state}</span
		>
		<span class="rounded-mlq-control bg-mlq-subtle px-1.5 py-0.5 text-[11px] text-mlq-muted"
			>{memory.category}</span
		>
		<span class="ml-auto shrink-0 text-xs text-mlq-muted">{formatWhen(memory.created_at)}</span>
	</div>

	<!-- Content -->
	<p class="text-sm text-mlq-text">{memory.content}</p>

	<!-- Meta row: From run link -->
	{#if memory.source_session_id}
		<a
			href="/automations/{memory.source_session_id}"
			class="text-xs text-mlq-workflow hover:underline">From run</a
		>
	{/if}

	<!-- Error alert -->
	{#if error}
		<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>
	{/if}

	<!-- Actions -->
	{#if actionable}
		<!-- proposed: Keep / Edit & keep toggle / Dismiss -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- Keep -->
			<form method="POST" action="?/keep" use:enhance class="shrink-0">
				<input type="hidden" name="id" value={memory.id} />
				<button type="submit" class="text-xs font-medium text-mlq-success hover:underline"
					>Keep</button
				>
			</form>

			<!-- Edit & keep toggle -->
			{#if editing}
				<form method="POST" action="?/keep" use:enhance class="flex w-full flex-col gap-2">
					<input type="hidden" name="id" value={memory.id} />
					<textarea
						name="content"
						rows="3"
						class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-sm text-mlq-text"
						>{memory.content}</textarea
					>
					<div class="flex items-center gap-2">
						<button type="submit" class="text-xs font-medium text-mlq-success hover:underline"
							>Save & keep</button
						>
						<button
							type="button"
							onclick={() => (editing = false)}
							class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
						>
					</div>
				</form>
			{:else}
				<button
					type="button"
					onclick={() => (editing = true)}
					class="shrink-0 text-xs text-mlq-workflow hover:underline">Edit & keep</button
				>
			{/if}

			<!-- Dismiss -->
			<form method="POST" action="?/dismiss" use:enhance class="shrink-0">
				<input type="hidden" name="id" value={memory.id} />
				<button type="submit" class="text-xs text-mlq-muted hover:text-mlq-text">Dismiss</button>
			</form>
		</div>
	{:else}
		<!-- kept / dismissed / unknown: two-step delete -->
		{#if confirmingDelete}
			<div class="flex items-center gap-2">
				<span class="text-xs text-mlq-text">Delete memory?</span>
				<form method="POST" action="?/delete" use:enhance class="shrink-0">
					<input type="hidden" name="id" value={memory.id} />
					<button type="submit" class="text-xs font-medium text-mlq-error hover:underline"
						>Confirm delete</button
					>
				</form>
				<button
					type="button"
					onclick={() => (confirmingDelete = false)}
					class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
				>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (confirmingDelete = true)}
				class="w-fit text-xs text-mlq-error hover:underline">Delete</button
			>
		{/if}
	{/if}
</div>
