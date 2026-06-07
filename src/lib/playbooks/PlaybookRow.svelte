<script lang="ts">
	import type { Playbook } from './types';
	let { playbook }: { playbook: Playbook } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app playbook link -->
<a href="/playbooks/{playbook.id}" class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50">
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm text-mlq-text">{playbook.name}</span>
		{#if playbook.description}
			<span class="block truncate text-xs text-mlq-muted">{playbook.description}</span>
		{/if}
	</span>
</a>
