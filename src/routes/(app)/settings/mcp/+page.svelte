<!-- src/routes/(app)/settings/mcp/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import McpServerCard from '$lib/mcp/McpServerCard.svelte';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>MCP · Settings · Donna</title></svelte:head>

<div>
	<h1 class="text-lg font-semibold text-mlq-text">MCP tools</h1>
	<p class="mt-1 text-xs text-mlq-muted">
		Model Context Protocol servers your operator has connected. Enable the tools you want available.
	</p>

	{#if !data.isAdmin}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			MCP tools are managed by your administrator.
		</div>
	{:else if data.mcpError}
		<div
			class="mt-4 rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-4 text-xs text-mlq-muted"
		>
			MCP configuration is unavailable right now.
		</div>
	{:else if data.servers.length === 0}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			No MCP servers configured — declare them in <code>mcp.yaml</code>.
		</div>
	{:else}
		<div class="mt-4 space-y-4">
			{#each data.servers as server (server.name)}
				<McpServerCard {server} />
			{/each}
		</div>
	{/if}
</div>
