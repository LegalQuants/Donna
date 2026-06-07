<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { X } from '@lucide/svelte';

	let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();
	let error = $state<string | null>(null);

	// Reset the error each time the modal opens (self-contained — avoids stale-error-on-reopen).
	$effect(() => {
		if (open) error = null;
	});

	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose?.();
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});

	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') {
				await invalidateAll();
				onclose?.();
			} else if (result.type === 'failure') {
				error = (result.data?.mfaError as string | undefined) ?? 'Could not disable two-factor.';
			} else {
				await update();
			}
		};
</script>

{#if open}
	<div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => onclose?.()}></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Disable two-factor authentication"
		class="fixed top-1/2 left-1/2 z-40 w-[26rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-mlq-text">Disable two-factor authentication</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={() => onclose?.()}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={16} /></button
			>
		</div>
		<p class="mb-3 text-xs text-mlq-muted">
			Enter your password and a current authentication code to turn off two-factor.
		</p>
		<form method="POST" action="?/disableMfa" use:enhance={submit}>
			<label class="block text-xs text-mlq-muted" for="mfa-pw">Password</label>
			<input
				id="mfa-pw"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="mt-1 mb-2 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
			<label class="block text-xs text-mlq-muted" for="mfa-code">Authentication code</label>
			<input
				id="mfa-code"
				name="code"
				inputmode="numeric"
				autocomplete="one-time-code"
				required
				class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
			/>
			{#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => onclose?.()}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
					>Cancel</button
				>
				<button
					type="submit"
					class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white">Disable</button
				>
			</div>
		</form>
	</div>
{/if}
