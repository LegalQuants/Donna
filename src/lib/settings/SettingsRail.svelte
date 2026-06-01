<script lang="ts">
  import { page } from '$app/state';

  // Built sections only (no dead UI); later P7 slices add their entry.
  const sections: { href: string; label: string }[] = [
    { href: '/settings/account', label: 'Account' }
  ];
  const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<nav aria-label="Settings sections" class="flex flex-row gap-1 sm:w-44 sm:flex-col">
  {#each sections as s (s.href)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settings section link -->
    <a href={s.href}
       aria-current={isActive(s.href) ? 'page' : undefined}
       class="rounded-mlq-control px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow
              {isActive(s.href) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">
      {s.label}
    </a>
  {/each}
</nav>
