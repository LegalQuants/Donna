<!-- src/lib/mcp/McpServerCard.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { toolBadges, type McpServer } from './mcp';

	let { server }: { server: McpServer } = $props();

	const badgeClass = (kind: string) =>
		kind === 'danger'
			? 'bg-mlq-error/10 text-mlq-error'
			: kind === 'warn'
				? 'bg-mlq-caveats/10 text-mlq-caveats'
				: 'bg-mlq-subtle text-mlq-muted';
</script>

<section class="rounded-mlq-control border border-mlq-subtle p-4">
	<div class="flex items-center justify-between">
		<div>
			<span class="text-sm font-medium text-mlq-text">{server.name}</span>
			<span class="ml-2 text-xs text-mlq-muted">{server.type}</span>
			{#if server.auth === 'oauth'}
				<span
					class="ml-2 rounded bg-mlq-workflow/10 px-1.5 py-0.5 text-[10px] font-medium text-mlq-workflow"
					>OAuth</span
				>
			{/if}
		</div>
		<form method="POST" action="?/refreshServer" use:enhance>
			<input type="hidden" name="server" value={server.name} />
			<button
				type="submit"
				class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt"
				>Refresh</button
			>
		</form>
	</div>

	<ul class="mt-3 space-y-2">
		{#each server.tools as tool (tool.name)}
			<li
				class="flex items-start justify-between gap-3 rounded-mlq-control border border-mlq-subtle/60 p-3"
			>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm font-medium text-mlq-text">{tool.name}</span>
						{#each toolBadges(tool) as b (b.label)}
							<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {badgeClass(b.kind)}"
								>{b.label}</span
							>
						{/each}
					</div>
					{#if tool.description}<p class="mt-0.5 text-xs text-mlq-muted">{tool.description}</p>{/if}
				</div>
				<form method="POST" action="?/toggleTool" use:enhance>
					<input type="hidden" name="server" value={server.name} />
					<input type="hidden" name="tool" value={tool.name} />
					<input type="hidden" name="enabled" value={(!tool.enabled).toString()} />
					<button
						type="submit"
						aria-pressed={tool.enabled}
						class="rounded-mlq-control border px-2 py-1 text-xs {tool.enabled
							? 'border-mlq-workflow bg-mlq-workflow text-white'
							: 'border-mlq-subtle text-mlq-text hover:bg-mlq-surface-alt'}"
						>{tool.enabled ? 'Enabled' : 'Disabled'}</button
					>
				</form>
			</li>
		{/each}
	</ul>
</section>
