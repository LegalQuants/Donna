<script lang="ts">
	import MfaDisableModal from '$lib/settings/MfaDisableModal.svelte';
	import EditableDisplayName from '$lib/settings/EditableDisplayName.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const user = $derived(data.user);
	let mfaModalOpen = $state(false);

	const fmtMonthYear = (s: string | null | undefined) =>
		s ? new Date(s).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
	const fmtDate = (s: string | null | undefined) =>
		s
			? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			: '—';
</script>

<svelte:head><title>Account — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Account</h1>

<section class="rounded-mlq-control border border-mlq-subtle">
	<h2
		class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium tracking-wide text-mlq-muted uppercase"
	>
		Profile
	</h2>
	<dl class="divide-y divide-mlq-subtle text-sm">
		<EditableDisplayName name={user?.display_name} />
		<div class="flex justify-between px-4 py-2">
			<dt class="text-mlq-muted">Email</dt>
			<dd class="text-mlq-text">{user?.email ?? '—'}</dd>
		</div>
		<div class="flex justify-between px-4 py-2">
			<dt class="text-mlq-muted">Role</dt>
			<dd class="text-mlq-text capitalize">{user?.role}</dd>
		</div>
		<div class="flex justify-between px-4 py-2">
			<dt class="text-mlq-muted">Member since</dt>
			<dd class="text-mlq-text">{fmtMonthYear(user?.created_at)}</dd>
		</div>
		<div class="flex justify-between px-4 py-2">
			<dt class="text-mlq-muted">Last sign-in</dt>
			<dd class="text-mlq-text">{fmtDate(user?.last_login_at)}</dd>
		</div>
	</dl>
	<p class="px-4 py-2 text-xs text-mlq-muted">Your email isn't editable here yet.</p>
</section>

<section class="mt-6 rounded-mlq-control border border-mlq-subtle">
	<h2
		class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium tracking-wide text-mlq-muted uppercase"
	>
		Security
	</h2>
	<div class="flex items-center justify-between px-4 py-3 text-sm">
		<div>
			<div class="text-mlq-text">Password</div>
			<div class="text-xs text-mlq-muted">
				Changing your password signs you out of other sessions.
			</div>
		</div>
		<a
			href="/change-password"
			class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
			>Change</a
		>
	</div>
	<div class="flex items-center justify-between border-t border-mlq-subtle px-4 py-3 text-sm">
		<div>
			<div class="text-mlq-text">Two-factor authentication</div>
			<div class="text-xs text-mlq-muted">{user?.mfa_enabled ? 'On' : 'Off'}</div>
		</div>
		{#if user?.mfa_enabled}
			<button
				type="button"
				onclick={() => (mfaModalOpen = true)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50"
				>Disable</button
			>
		{/if}
	</div>
</section>

<MfaDisableModal open={mfaModalOpen} onclose={() => (mfaModalOpen = false)} />
