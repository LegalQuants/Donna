<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';

	let {
		action,
		submitLabel,
		name: initialName = '',
		description: initialDesc = '',
		privileged: initialPrivileged = false,
		minimumTier: initialTier = null as 1 | 2 | 3 | 4 | 5 | null,
		error = ''
	}: {
		action: string;
		submitLabel: string;
		name?: string;
		description?: string;
		privileged?: boolean;
		minimumTier?: 1 | 2 | 3 | 4 | 5 | null;
		error?: string;
	} = $props();

	// untrack: intentional one-time seed from props (uncontrolled input pattern).
	let nameValue = $state(untrack(() => initialName));
	let descValue = $state(untrack(() => initialDesc));
	let privilegedValue = $state(untrack(() => initialPrivileged));
	// The select binds to a string so the empty "None" option is representable.
	let tierValue = $state<'' | '1' | '2' | '3' | '4' | '5'>(
		untrack(() => (initialTier == null ? '' : (String(initialTier) as '1' | '2' | '3' | '4' | '5')))
	);

	const needsTier = $derived(privilegedValue && tierValue === '');
	const canSubmit = $derived(!!nameValue.trim() && !needsTier);
</script>

<form method="POST" {action} use:enhance aria-label="Matter" class="space-y-3">
	<div>
		<label for="matter-name" class="mb-1 block text-xs font-medium text-mlq-text"
			>Matter name <span class="text-mlq-error">*</span></label
		>
		<input
			id="matter-name"
			name="name"
			bind:value={nameValue}
			required
			class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		/>
	</div>
	<div>
		<label for="matter-desc" class="mb-1 block text-xs font-medium text-mlq-text"
			>Description <span class="text-mlq-muted">(optional)</span></label
		>
		<textarea
			id="matter-desc"
			name="description"
			bind:value={descValue}
			rows="3"
			class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		></textarea>
	</div>

	<div class="space-y-1">
		<label class="flex items-center gap-2 text-xs text-mlq-text">
			<input
				type="checkbox"
				name="privileged"
				bind:checked={privilegedValue}
				aria-describedby={needsTier ? 'tier-required-hint' : undefined}
				class="size-3.5 accent-mlq-privileged"
			/>
			<span class="font-medium">Privileged matter</span>
		</label>
		<p class="pl-5 text-xs text-mlq-muted">
			Flags every chat in this matter as privileged in the audit log and enforces a minimum model
			tier.
		</p>
	</div>

	<div>
		<label for="matter-tier" class="mb-1 block text-xs font-medium text-mlq-text"
			>Minimum model tier</label
		>
		<select
			id="matter-tier"
			name="minimum_inference_tier"
			bind:value={tierValue}
			aria-describedby={needsTier ? 'tier-required-hint' : undefined}
			class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		>
			<option value="">None</option>
			<option value="1">1</option>
			<option value="2">2</option>
			<option value="3">3</option>
			<option value="4">4</option>
			<option value="5">5</option>
		</select>
		<p class="mt-1 text-xs text-mlq-muted">
			Higher tiers require cloud models. Privileged matters require a tier.
		</p>
		{#if needsTier}
			<p id="tier-required-hint" class="mt-1 text-xs text-mlq-error">
				Privileged matters require a minimum tier.
			</p>
		{/if}
	</div>

	{#if error}<p class="text-xs text-mlq-error">{error}</p>{/if}
	<div class="flex justify-end">
		<button
			type="submit"
			disabled={!canSubmit}
			class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
			>{submitLabel}</button
		>
	</div>
</form>
