<script lang="ts">
	import { goto } from '$app/navigation';
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
	import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
	import SegmentedControl from '$lib/preferences/SegmentedControl.svelte';
	import MemoryRow from '$lib/automations/MemoryRow.svelte';
	import { MEMORY_STATES } from '$lib/automations/memory';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const stateOptions = MEMORY_STATES.map((s) => ({
		value: s,
		label: s.charAt(0).toUpperCase() + s.slice(1)
	}));

	function rowError(id: string): string | null {
		if (!form) return null;
		return 'id' in form && form.id === id && form.error ? (form.error as string) : null;
	}

	const offset = $derived(data.offset ?? 0);
	const total = $derived(data.total ?? 0);
	const entries = $derived(data.entries ?? []);
	const state = $derived(data.state ?? 'proposed');

	const emptyMessages: Record<string, string> = {
		proposed: 'No proposed memories. Runs propose memories as they work.',
		kept: 'Nothing kept yet.',
		dismissed: 'Nothing dismissed.'
	};
</script>

<svelte:head><title>Review — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<AutomationsNav active="review" unread={data.unread} />

	{#if !data.autonomousEnabled}
		<AutomationsGate />
	{:else}
		{#if form?.error && !(form && 'id' in form && form.id)}
			<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>
		{/if}

		<h2 class="mb-3 text-base font-medium text-mlq-text">Memory</h2>

		<div class="mb-4">
			<SegmentedControl
				options={stateOptions}
				value={state}
				label="Memory state"
				onchange={(value) => goto(`?state=${value}`)}
			/>
		</div>

		{#if data.error}
			<p role="alert" class="text-sm text-mlq-error">Couldn't load memories — reload to retry.</p>
		{:else if entries.length === 0}
			<p class="text-sm text-mlq-muted">
				{emptyMessages[state] ?? 'No memories.'}
			</p>
		{:else}
			<div class="flex flex-col gap-3">
				{#each entries as m (m.id)}
					<MemoryRow memory={m} error={rowError(m.id)} />
				{/each}
			</div>

			{#if total > 50}
				<div class="mt-4 flex items-center gap-4 text-sm text-mlq-muted">
					<span>Showing {offset + 1}–{offset + entries.length} of {total}</span>
					{#if offset > 0}
						<a href="?state={state}&offset={offset - 50}" class="text-mlq-workflow hover:underline"
							>Prev</a
						>
					{/if}
					{#if offset + entries.length < total}
						<a href="?state={state}&offset={offset + 50}" class="text-mlq-workflow hover:underline"
							>Next</a
						>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</div>
