<script lang="ts">
	import type { NotificationItem } from './types';
	import NotificationRow from './NotificationRow.svelte';
	let { notifications, unreadOnly }: { notifications: NotificationItem[]; unreadOnly: boolean } =
		$props();
</script>

<nav
	aria-label="Notification filters"
	class="mb-3 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1 text-sm"
>
	<a
		href="/automations/notifications"
		aria-current={!unreadOnly ? 'page' : undefined}
		class="rounded-mlq-control px-3 py-1 {!unreadOnly
			? 'bg-mlq-subtle text-mlq-strong'
			: 'text-mlq-text hover:bg-mlq-subtle/50'}">All</a
	>
	<a
		href="/automations/notifications?unread=true"
		aria-current={unreadOnly ? 'page' : undefined}
		class="rounded-mlq-control px-3 py-1 {unreadOnly
			? 'bg-mlq-subtle text-mlq-strong'
			: 'text-mlq-text hover:bg-mlq-subtle/50'}">Unread</a
	>
</nav>

{#if notifications.length === 0}
	<div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
		<p class="text-sm font-medium text-mlq-text">
			{unreadOnly ? 'No unread notifications' : 'No notifications yet'}
		</p>
		<p class="mt-1 text-xs text-mlq-muted">
			When an automation finishes, its report-back lands here.
		</p>
	</div>
{:else}
	<ul class="flex flex-col gap-2">
		{#each notifications as n (n.id)}
			<li><NotificationRow notification={n} /></li>
		{/each}
	</ul>
{/if}
