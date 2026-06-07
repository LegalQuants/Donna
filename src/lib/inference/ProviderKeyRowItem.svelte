<!-- src/lib/inference/ProviderKeyRowItem.svelte -->
<!-- One provider's key row: status line + masked set/replace form + (runtime
     only) two-step revoke. The key value is write-only — the backend returns
     at most last4 and this component clears the input after a save. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { sourceLabel, canRevoke, type ProviderKeyRow } from './providerKeys';

	let { row, error = null }: { row: ProviderKeyRow; error?: string | null } = $props();

	let keyValue = $state('');
	let status = $state<'idle' | 'saving' | 'saved'>('idle');
	let confirmingRevoke = $state(false);

	const statusText = $derived(
		row.configured
			? `✓ Configured · ${sourceLabel(row)}${row.last4 ? ` · ••••${row.last4}` : ''}`
			: row.source === 'env'
				? 'Not set'
				: 'No key'
	);

	const submitKey: SubmitFunction = () => {
		status = 'saving';
		return async ({ result, update }) => {
			if (result.type === 'success') {
				status = 'saved';
				keyValue = ''; // write-only: never keep the secret around
			} else {
				status = 'idle';
			}
			await update(); // refresh statuses (hot-applied) + surface failure payload
		};
	};

	const submitRevoke: SubmitFunction = () => {
		confirmingRevoke = false;
		return async ({ update }) => {
			await update();
		};
	};
</script>

<div class="border-b border-mlq-subtle px-4 py-3 last:border-b-0">
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-mlq-text">{row.provider}</span>
		{#if row.type}<span
				class="rounded-mlq-control border border-mlq-subtle px-1.5 text-xs text-mlq-muted"
				>{row.type}</span
			>{/if}
		<span class="text-xs {row.configured ? 'text-mlq-success' : 'text-mlq-muted'}"
			>{statusText}</span
		>
	</div>
	{#if row.source === 'env'}
		<p class="mt-0.5 text-xs text-mlq-muted">
			{row.configured
				? "This key is managed by your deployment's environment."
				: "Defined by your deployment's environment, but the variable is empty — set it there, or add a runtime key here."}
		</p>
	{/if}

	<div class="mt-2 flex flex-wrap items-center gap-2">
		<form method="POST" action="?/setKey" use:enhance={submitKey} class="flex items-center gap-2">
			<input type="hidden" name="provider" value={row.provider} />
			<input
				type="password"
				name="api_key"
				autocomplete="new-password"
				aria-label="API key for {row.provider}"
				placeholder={row.configured ? 'New key' : 'Paste key'}
				bind:value={keyValue}
				class="w-56 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-xs text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow"
			/>
			<button
				type="submit"
				disabled={!keyValue.trim()}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50 disabled:opacity-60"
			>
				{row.configured ? 'Replace key' : 'Add key'}
			</button>
			{#if status === 'saving'}<span class="text-xs text-mlq-muted">Saving…</span>
			{:else if status === 'saved'}<span class="text-xs text-mlq-success">Saved</span>{/if}
		</form>

		{#if canRevoke(row)}
			{#if confirmingRevoke}
				<span class="text-xs text-mlq-text">Revoke key?</span>
				<form method="POST" action="?/revokeKey" use:enhance={submitRevoke} class="inline">
					<input type="hidden" name="provider" value={row.provider} />
					<button
						type="submit"
						class="rounded-mlq-control border border-mlq-error px-2.5 py-1 text-xs text-mlq-error hover:bg-mlq-error/10"
						>Confirm revoke</button
					>
				</form>
				<button
					type="button"
					onclick={() => (confirmingRevoke = false)}
					class="text-xs text-mlq-muted hover:text-mlq-text">Cancel</button
				>
			{:else}
				<button
					type="button"
					onclick={() => (confirmingRevoke = true)}
					class="text-xs text-mlq-muted hover:text-mlq-error">Revoke</button
				>
			{/if}
		{/if}
	</div>

	{#if row.source === 'env'}
		<p class="mt-1 text-xs text-mlq-muted/80">
			Saving a key here takes over management from the environment.
		</p>
	{/if}
	{#if error}
		<p role="alert" class="mt-1 text-xs text-mlq-error">{error}</p>
	{/if}
</div>
