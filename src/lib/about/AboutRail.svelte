<script lang="ts">
	import { page } from '$app/state';

	const sections: { href: string; label: string }[] = [
		{ href: '/about/overview', label: 'Overview' },
		{ href: '/about/assistant', label: 'Assistant' },
		{ href: '/about/projects', label: 'Projects' },
		{ href: '/about/workflows', label: 'Workflows' },
		{ href: '/about/automations', label: 'Automations' },
		{ href: '/about/tabular', label: 'Tabular' },
		{ href: '/about/knowledge', label: 'Knowledge' },
		{ href: '/about/models', label: 'Models' },
		{ href: '/about/trust', label: 'Trust & citations' }
	];
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<nav aria-label="About sections" class="flex flex-row gap-1 sm:w-44 sm:flex-col">
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
