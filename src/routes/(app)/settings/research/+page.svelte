<!-- src/routes/(app)/settings/research/+page.svelte -->
<script lang="ts">
	import ResearchSourcesAdminCard from '$lib/research/ResearchSourcesAdminCard.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Research sources — Donna</title></svelte:head>

<div class="flex flex-col gap-4">
	<h1 class="text-lg font-medium text-mlq-text">Research sources</h1>
	<ResearchSourcesAdminCard isAdmin={data.isAdmin} sources={data.sources} {form} />
</div>
