<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import {
		MATTER_ROLE_HINTS,
		MATTER_ROLE_LABELS,
		SHARE_SCOPE_HINTS,
		SHARE_SCOPE_LABELS,
		personLabel,
		type DirectoryEntry,
		type MatterMember,
		type MatterRole,
		type ShareScope
	} from '$lib/matters/types';

	let {
		members,
		directory = [],
		shareScope,
		canManage,
		privileged = false,
		error = ''
	}: {
		members: MatterMember[];
		directory?: DirectoryEntry[];
		shareScope: ShareScope;
		canManage: boolean;
		privileged?: boolean;
		error?: string;
	} = $props();

	// Screened people are listed apart from the working team. They are not
	// "members with a lesser role" — they are the record of a wall, and
	// mixing them into the roster makes the wall easy to miss.
	const team = $derived(members.filter((m) => m.role !== 'blocked'));
	const screened = $derived(members.filter((m) => m.role === 'blocked'));

	const ASSIGNABLE: MatterRole[] = ['lead', 'contributor', 'reader'];
	const SCOPES: ShareScope[] = ['personal', 'members', 'org'];

	let addOpen = $state(false);
	let addUserId = $state('');
	let addRole = $state<MatterRole>('contributor');

	// Anyone already on the roster — including screened people — is off the
	// picker; the backend would 409 and the list would be misleading.
	const onRoster = $derived(new Set(members.map((m) => m.user_id)));
	const candidates = $derived(directory.filter((p) => !onRoster.has(p.id)));

	const label = personLabel;
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">
		People · {team.length}
	</h2>

	{#if error}
		<p class="mb-2 text-xs text-mlq-error">{error}</p>
	{/if}

	<!-- Who can reach this matter at all -->
	<div class="mb-3 rounded-mlq-control border border-mlq-subtle px-3 py-3">
		{#if canManage}
			<form
				method="POST"
				action="?/setShareScope"
				use:enhance
				class="flex flex-wrap items-center gap-2"
			>
				<label for="share-scope" class="text-xs text-mlq-muted">Who can see this matter</label>
				<select
					id="share-scope"
					name="share_scope"
					value={shareScope}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
				>
					{#each SCOPES as s (s)}
						<option value={s}>{SHARE_SCOPE_LABELS[s]}</option>
					{/each}
				</select>
				<span class="text-xs text-mlq-muted">{SHARE_SCOPE_HINTS[shareScope]}</span>
			</form>
			{#if privileged && shareScope === 'org'}
				<p class="mt-2 text-xs text-mlq-muted">
					This matter is marked privileged and readable firm-wide. If someone must be walled off it,
					screen them below — a screen overrides firm-wide access.
				</p>
			{/if}
		{:else}
			<p class="text-xs text-mlq-muted">
				<span class="text-mlq-text">{SHARE_SCOPE_LABELS[shareScope]}</span> ·
				{SHARE_SCOPE_HINTS[shareScope]}
			</p>
		{/if}
	</div>

	<!-- The working team -->
	<div class="rounded-mlq-control border border-mlq-subtle">
		{#each team as m (m.user_id)}
			<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
				<div class="min-w-0 flex-1">
					<span class="block truncate text-sm text-mlq-text">{label(m)}</span>
					{#if m.display_name}
						<span class="block truncate text-xs text-mlq-muted">{m.email}</span>
					{/if}
				</div>

				{#if m.is_owner}
					<span class="shrink-0 text-xs text-mlq-muted">Owner · Lead</span>
				{:else if canManage}
					<form method="POST" action="?/changeMemberRole" use:enhance class="shrink-0">
						<input type="hidden" name="user_id" value={m.user_id} />
						<select
							name="role"
							value={m.role}
							aria-label={`Role for ${label(m)}`}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
							class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
						>
							{#each ASSIGNABLE as r (r)}
								<option value={r}>{MATTER_ROLE_LABELS[r]}</option>
							{/each}
							<option value="blocked">{MATTER_ROLE_LABELS.blocked}</option>
						</select>
					</form>
					<form
						method="POST"
						action="?/removeMember"
						use:enhance
						aria-label={`Remove ${label(m)}`}
						class="shrink-0"
					>
						<input type="hidden" name="user_id" value={m.user_id} />
						<button
							type="submit"
							aria-label={`Remove ${label(m)}`}
							class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
							><X size={14} /></button
						>
					</form>
				{:else}
					<span class="shrink-0 text-xs text-mlq-muted">{MATTER_ROLE_LABELS[m.role]}</span>
				{/if}
			</div>
		{/each}
	</div>

	{#if canManage}
		<div class="mt-2 flex justify-end">
			{#if addOpen}
				<form
					method="POST"
					action="?/addMember"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							addOpen = false;
							addUserId = '';
						};
					}}
					class="flex flex-wrap items-center gap-2"
				>
					<label for="add-user-id" class="sr-only">Person</label>
					<select
						id="add-user-id"
						name="user_id"
						bind:value={addUserId}
						required
						class="w-72 rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
					>
						<option value="" disabled>Choose someone…</option>
						{#each candidates as p (p.id)}
							<option value={p.id}>{label(p)}</option>
						{/each}
					</select>
					<label for="add-role" class="sr-only">Role</label>
					<select
						id="add-role"
						name="role"
						bind:value={addRole}
						class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
					>
						{#each ASSIGNABLE as r (r)}
							<option value={r}>{MATTER_ROLE_LABELS[r]}</option>
						{/each}
						<option value="blocked">{MATTER_ROLE_LABELS.blocked}</option>
					</select>
					<button
						type="submit"
						class="rounded-mlq-control bg-mlq-strong px-3 py-1 text-xs font-medium text-white"
						>Add</button
					>
					<button
						type="button"
						onclick={() => (addOpen = false)}
						class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-xs text-mlq-text"
						>Cancel</button
					>
					<span class="w-full text-right text-xs text-mlq-muted">{MATTER_ROLE_HINTS[addRole]}</span>
				</form>
			{:else if candidates.length > 0}
				<button
					type="button"
					onclick={() => (addOpen = true)}
					class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-xs text-mlq-text"
					>+ Add someone</button
				>
			{:else}
				<p class="text-xs text-mlq-muted">Everyone in the firm is already on this matter.</p>
			{/if}
		</div>
	{/if}

	{#if screened.length > 0}
		<h3 class="mt-4 mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">
			Screened · {screened.length}
		</h3>
		<div class="rounded-mlq-control border border-mlq-error/40">
			{#each screened as m (m.user_id)}
				<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
					<div class="min-w-0 flex-1">
						<span class="block truncate text-sm text-mlq-text">{label(m)}</span>
						<span class="block truncate text-xs text-mlq-muted">
							Cannot see this matter, whatever else grants access.
						</span>
					</div>
					{#if canManage}
						<form method="POST" action="?/removeMember" use:enhance class="shrink-0">
							<input type="hidden" name="user_id" value={m.user_id} />
							<button
								type="submit"
								class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
								>Lift screen</button
							>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
