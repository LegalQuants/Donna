<!-- src/lib/automations/AutomationsNav.svelte -->
<script lang="ts">
	import UnreadBadge from './UnreadBadge.svelte';
	type View = 'sessions' | 'schedules' | 'watches' | 'notifications' | 'review';
	let { active, unread = 0 }: { active: View; unread?: number } = $props();

	const tabs: { id: View; label: string; href: string }[] = [
		{ id: 'sessions', label: 'Sessions', href: '/automations' },
		{ id: 'schedules', label: 'Schedules', href: '/automations/schedules' },
		{ id: 'watches', label: 'Watches', href: '/automations/watches' },
		{ id: 'notifications', label: 'Notifications', href: '/automations/notifications' },
		{ id: 'review', label: 'Review', href: '/automations/review' }
	];
</script>

<nav
	aria-label="Automations views"
	class="mb-4 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1"
>
	{#each tabs as tab (tab.id)}
		<a
			href={tab.href}
			aria-current={active === tab.id ? 'page' : undefined}
			class="inline-flex items-center rounded-mlq-control px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none
              {active === tab.id
				? 'bg-mlq-subtle text-mlq-strong'
				: 'text-mlq-text hover:bg-mlq-subtle/50'}"
		>
			{tab.label}
			{#if tab.id === 'notifications'}<UnreadBadge count={unread} />{/if}
		</a>
	{/each}
</nav>
