<script lang="ts">
	import { page } from '$app/state';

	// Built sections only (no dead UI); later P7 slices add their entry.
	const sections: { href: string; label: string }[] = [
		{ href: '/settings/account', label: 'Account' },
		{ href: '/settings/data', label: 'Data & privacy' },
		{ href: '/settings/preferences', label: 'Preferences' },
		{ href: '/settings/trust', label: 'Trust' },
		{ href: '/settings/models', label: 'Models' }
	];
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<nav aria-label="Settings sections" class="flex flex-row gap-1 sm:w-44 sm:flex-col">
	{#each sections as s (s.href)}
		<a
			href={s.href}
			aria-current={isActive(s.href) ? 'page' : undefined}
			class="rounded-mlq-control px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none
              {isActive(s.href)
				? 'bg-mlq-subtle text-mlq-strong'
				: 'text-mlq-text hover:bg-mlq-subtle/50'}"
		>
			{s.label}
		</a>
	{/each}
</nav>
