<script lang="ts">
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import SessionDetail from '$lib/automations/SessionDetail.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import type { Citation } from '$lib/citations/types';
	import type { ArtifactItem } from '$lib/automations/artifacts';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const docPanel = createDocPanel();

	// An artifact is a real KB document — open it by file id. No citation context,
	// so suppress the verification chip (the tabular precedent for non-cite opens).
	function openArtifact(a: ArtifactItem) {
		if (!a.file_id) return;
		docPanel.open({ source_file_id: a.file_id, verificationApplicable: false } as Citation);
	}
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="flex h-full min-h-0">
	<div class="min-w-0 flex-1 overflow-y-auto">
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
					initialArtifacts={data.artifacts}
					initialArtifactsTotal={data.artifacts_total}
					onopenartifact={openArtifact}
				/>
			{/key}
		</div>
	</div>
	{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
</div>
