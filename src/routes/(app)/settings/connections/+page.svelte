<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { oauthExpiry, type OAuthServerStatus } from '$lib/mcp/oauth';

	let { data }: { data: PageData } = $props();

	// Only show a banner for a server actually in the current list (ignore stale query).
	const banner = $derived(
		data.result && data.servers.some((s) => s.server === data.result!.server) ? data.result : null
	);

	function statusLabel(s: OAuthServerStatus): string {
		if (!s.connected) return 'Not connected';
		const e = oauthExpiry(s.expires_at);
		if (e === 'expired') return 'Connection expired';
		if (e === 'expiring') return 'Connected — expiring soon';
		return 'Connected';
	}
</script>

<svelte:head><title>Connections · Settings · Donna</title></svelte:head>

<div>
	<h1 class="text-lg font-semibold text-mlq-text">Connections</h1>
	<p class="mt-1 text-xs text-mlq-muted">
		Connect your account to the OAuth-protected MCP tool servers your operator has enabled.
	</p>
	<div
		class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs text-mlq-text"
	>
		<strong>What this is.</strong> Some tool servers ask you to sign in with your own account. Connect
		once here and the assistant can use them for you in chat — nothing runs without your sign-in.
	</div>

	{#if banner}
		{#if banner.status === 'connected'}
			<div
				role="status"
				class="mt-4 rounded-mlq-control border border-mlq-workflow/40 bg-mlq-workflow/5 p-3 text-xs text-mlq-text"
			>
				Connected to <span class="font-medium">{banner.server}</span>.
			</div>
		{:else}
			<div
				role="alert"
				class="mt-4 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 p-3 text-xs text-mlq-text"
			>
				Couldn't connect to <span class="font-medium">{banner.server}</span>. Please try again.
			</div>
		{/if}
	{/if}

	{#if data.loadError}
		<div
			class="mt-4 rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-4 text-xs text-mlq-muted"
		>
			Your connections are unavailable right now.
		</div>
	{:else if data.servers.length === 0}
		<div class="mt-4 rounded-mlq-control border border-mlq-subtle p-4 text-xs text-mlq-muted">
			No OAuth MCP servers are configured.
		</div>
	{:else}
		<div class="mt-4 space-y-3">
			{#each data.servers as s (s.server)}
				<section
					class="flex items-center justify-between rounded-mlq-control border border-mlq-subtle p-4"
				>
					<div class="min-w-0">
						<div class="text-sm font-medium text-mlq-text">{s.server}</div>
						<div class="text-xs text-mlq-muted">
							<span>{statusLabel(s)}</span>{#if s.connected && s.scopes.length}
								<span>· {s.scopes.join(', ')}</span>{/if}
						</div>
					</div>
					{#if s.connected}
						<div class="flex gap-2">
							<a
								href="/settings/connections/{s.server}/connect"
								data-sveltekit-reload
								class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
								>Reconnect</a
							>
							<form method="POST" action="?/disconnect" use:enhance>
								<input type="hidden" name="server" value={s.server} />
								<button
									type="submit"
									class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error hover:bg-mlq-surface-alt"
									>Disconnect</button
								>
							</form>
						</div>
					{:else}
						<a
							href="/settings/connections/{s.server}/connect"
							data-sveltekit-reload
							class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
							>Connect</a
						>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>
