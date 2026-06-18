<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if data.isAdmin}
	<!-- MCP admin panel (Task 3) -->
{/if}
