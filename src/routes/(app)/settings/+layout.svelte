<script lang="ts">
	import SettingsRail from '$lib/settings/SettingsRail.svelte';
	let { children } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:flex-row">
	<SettingsRail />
	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
