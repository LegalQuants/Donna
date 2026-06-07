<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';
	import DataExportCard from '$lib/settings/DataExportCard.svelte';
	import DeleteAccountModal from '$lib/settings/DeleteAccountModal.svelte';
	import type { DeletionSchedule } from '$lib/settings/dataPrivacy';

	let { data }: PageProps = $props();

	let deleteOpen = $state(false);
	let scheduled = $state<DeletionSchedule | null>(null);
	let cancelMsg = $state<string | null>(null);

	// Server truth (P1.4, GET /users/me): non-null while a deletion is pending, else null.
	const pendingDeletionAt = $derived(data.user?.deletion_scheduled_at ?? null);

	const fmtDate = (s: string) =>
		new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	const cancelSubmit: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type === 'success') {
				// Refresh data.user → deletion_scheduled_at clears → the whole banner unmounts,
				// so success needs no message (its disappearance is the confirmation).
				await invalidateAll();
			} else if (result.type === 'failure')
				cancelMsg =
					(result.data?.cancelMessage as string | undefined) ??
					(result.data?.cancelError as string | undefined) ??
					'Could not cancel.';
		};

	function onDeleted(info: DeletionSchedule) {
		deleteOpen = false;
		scheduled = info;
	}

	function returnToLogin() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- post-delete sign-out
		goto('/login');
	}
</script>

<svelte:head><title>Data & privacy — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Data & privacy</h1>

{#if scheduled}
	<section class="rounded-mlq-control border border-mlq-subtle p-4 text-sm">
		<h2 class="text-mlq-text">Account scheduled for deletion</h2>
		<p class="mt-1 text-mlq-muted">
			Your account is scheduled for permanent deletion on <strong
				>{fmtDate(scheduled.scheduled_deletion_at)}</strong
			>. You can cancel by signing back in within {scheduled.grace_period_days} days.
		</p>
		<button
			type="button"
			onclick={returnToLogin}
			class="mt-4 rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
			>Return to sign in</button
		>
	</section>
{:else if pendingDeletionAt}
	<DataExportCard />

	<section class="mt-6 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5 p-4 text-sm">
		<h2 class="font-medium text-mlq-error">Pending deletion</h2>
		<p class="mt-1 text-mlq-muted">
			Scheduled for <strong>{fmtDate(pendingDeletionAt)}</strong>; cancel to keep your account.
		</p>
		<form method="POST" action="?/cancelDeletion" use:enhance={cancelSubmit} class="mt-3">
			<button type="submit" class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white"
				>Cancel scheduled deletion</button
			>
		</form>
		{#if cancelMsg}<p role="status" aria-live="polite" class="mt-2 text-mlq-text">
				{cancelMsg}
			</p>{/if}
	</section>
{:else}
	<DataExportCard />

	<section class="mt-6 rounded-mlq-control border border-mlq-error/40 bg-mlq-error/5">
		<h2
			class="border-b border-mlq-error/30 px-4 py-2 text-xs font-medium tracking-wide text-mlq-error uppercase"
		>
			Danger zone
		</h2>
		<div class="px-4 py-3 text-sm">
			<div class="text-mlq-text">Delete account</div>
			<p class="mt-0.5 mb-3 text-xs text-mlq-muted">
				Schedules your account for permanent deletion after a grace period. You'll be signed out on
				all devices.
			</p>
			<button
				type="button"
				onclick={() => (deleteOpen = true)}
				class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white"
				>Delete my account</button
			>
		</div>
	</section>

	<DeleteAccountModal
		open={deleteOpen}
		onclose={() => (deleteOpen = false)}
		ondeleted={onDeleted}
	/>
{/if}
