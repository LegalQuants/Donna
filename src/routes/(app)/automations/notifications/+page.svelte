<script lang="ts">
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
	import NotificationsInbox from '$lib/automations/NotificationsInbox.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Automations · Notifications — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
	<WorkflowsNav active="automations" />
	<AutomationsNav active="notifications" unread={data.unread} />
	<NotificationsInbox notifications={data.notifications} unreadOnly={data.unreadOnly} />
</div>
