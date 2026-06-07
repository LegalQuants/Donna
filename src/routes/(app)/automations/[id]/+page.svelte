<script lang="ts">
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import SessionDetail from '$lib/automations/SessionDetail.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
		>← Sessions</a
	>
	{#if form?.error}
		<p role="alert" class="mb-2 text-xs text-mlq-error">{form.error}</p>
	{/if}
	{#key data.session.id}
		<SessionDetail
			initialSession={data.session}
			initialReceipt={data.receipt}
			initialFindings={data.findings}
			initialFindingsTotal={data.findings_total}
			initialMemories={data.memories}
			initialMemoriesTotal={data.memories_total}
		/>
	{/key}
</div>
