<script lang="ts">
	import { enhance } from '$app/forms';
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
	import RunNowForm from '$lib/automations/RunNowForm.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Run an automation — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
		>← Sessions</a
	>

	{#if !data.autonomousEnabled}
		<AutomationsGate />
	{:else}
		<h2 class="mb-3 text-lg font-medium text-mlq-text">Run an automation</h2>
		{#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
		<form method="POST" action="?/run" use:enhance>
			<RunNowForm
				playbookItems={data.playbookItems}
				skillItems={data.skillItems}
				kbs={data.kbs}
				matters={data.matters}
			/>
		</form>
	{/if}
</div>
