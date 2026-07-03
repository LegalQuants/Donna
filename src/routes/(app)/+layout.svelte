<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { rebrandName } from '$lib/brand';
	import { canAudit } from '$lib/audit/gate';
	let { data, children } = $props();
	const displayName = $derived(
		rebrandName(data.user?.display_name) || data.user?.email?.split('@')[0] || 'Account'
	);
	const showAudit = $derived(canAudit(data.user));
</script>

<div class="flex h-screen overflow-hidden">
	<Sidebar {displayName} canAudit={showAudit} />
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
