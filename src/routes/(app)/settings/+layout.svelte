<script lang="ts">
	import SettingsRail from '$lib/settings/SettingsRail.svelte';
	import type { LayoutData } from './$types';
	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:flex-row">
	<SettingsRail isAdmin={data.isAdmin} />
	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
