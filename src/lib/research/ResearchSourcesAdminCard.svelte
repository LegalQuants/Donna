<!-- src/lib/research/ResearchSourcesAdminCard.svelte -->
<!-- Admin-gated card for /settings/research: enable/disable authority sources +
     set the keyed ones' API keys, hot-applied via form actions. Mirrors
     ProviderKeysCard. Status comes from GET /admin/tool-providers (DE-383), not
     /research/sources. Secrets are write-only — has_key is a bool, never a key. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { sourceLabel, keyStatus, type ToolProviderRow } from './toolProviders';

	let {
		isAdmin,
		sources,
		form
	}: {
		isAdmin: boolean;
		sources: ToolProviderRow[] | null;
		form: { type?: string; message?: string; success?: boolean } | null | undefined;
	} = $props();

	// Which keyed row has its key editor open.
	let editing = $state<string | null>(null);
	function rowError(type: string): string | null {
		return form?.message && form.type === type ? form.message : null;
	}
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
	<div class="border-b border-mlq-subtle px-4 py-2">
		<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Research sources</h2>
		{#if isAdmin}
			<p class="mt-1 text-xs text-mlq-muted">
				The authority sources Donna can cite. Keys are encrypted at rest in the gateway and applied
				immediately — no restart. A key is never shown after saving.
			</p>
		{/if}
	</div>

	{#if !isAdmin}
		<p class="px-4 py-3 text-sm text-mlq-muted">
			Research sources are managed by your administrator.
		</p>
	{:else if sources === null}
		<p class="px-4 py-3 text-sm text-mlq-muted">Could not load research sources right now.</p>
	{:else if sources.length === 0}
		<p class="px-4 py-3 text-sm text-mlq-muted">No authority sources are registered.</p>
	{:else}
		<ul>
			{#each sources as row (row.type)}
				{@const ks = keyStatus(row)}
				<li class="border-b border-mlq-subtle px-4 py-3 last:border-b-0">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="min-w-0">
							<div class="text-sm font-medium text-mlq-text">{sourceLabel(row.type)}</div>
							<div class="mt-0.5 flex items-center gap-2 text-xs">
								{#if row.enabled}
									<span class="font-medium text-mlq-success">● <span>Available</span></span>
								{:else}
									<span class="text-mlq-muted">○ <span>Unavailable</span></span>
								{/if}
								<span class="text-mlq-muted">
									·
									{#if ks === 'no_key_needed'}No key needed{:else if ks === 'key_set'}Key set{:else}No
										key{/if}
								</span>
							</div>
						</div>
						<div class="flex items-center gap-2">
							{#if row.key_required}
								<button
									type="button"
									onclick={() => (editing = editing === row.type ? null : row.type)}
									class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt"
								>
									{row.has_key ? 'Replace key' : 'Set key'}
								</button>
							{:else if !row.enabled}
								<form method="POST" action="?/enable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control bg-mlq-workflow px-2 py-1 text-xs font-medium text-white"
										>Enable</button
									>
								</form>
							{/if}
							{#if row.key_required && row.has_key && !row.enabled}
								<form method="POST" action="?/reenable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control bg-mlq-workflow px-2 py-1 text-xs font-medium text-white"
										>Enable</button
									>
								</form>
							{/if}
							{#if row.enabled}
								<form method="POST" action="?/disable" use:enhance>
									<input type="hidden" name="type" value={row.type} />
									<button
										type="submit"
										class="rounded-mlq-control border border-mlq-error/40 px-2 py-1 text-xs text-mlq-error hover:bg-mlq-surface-alt"
										>Disable</button
									>
								</form>
							{/if}
						</div>
					</div>

					{#if editing === row.type && row.key_required}
						<form
							method="POST"
							action="?/setKey"
							use:enhance={() =>
								async ({ update }) => {
									await update();
									editing = null;
								}}
							class="mt-2 flex flex-wrap items-end gap-2"
						>
							<input type="hidden" name="type" value={row.type} />
							<label class="flex flex-col gap-1 text-xs text-mlq-muted">
								API key for {sourceLabel(row.type)}
								<input
									name="api_key"
									type="password"
									autocomplete="off"
									placeholder="Paste the key"
									class="w-72 max-w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-sm text-mlq-text"
								/>
							</label>
							<button
								type="submit"
								class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
								>Save key</button
							>
							<button
								type="button"
								onclick={() => (editing = null)}
								class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
								>Cancel</button
							>
						</form>
					{/if}

					{#if rowError(row.type)}
						<p role="alert" class="mt-1 text-xs text-mlq-error">{rowError(row.type)}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
