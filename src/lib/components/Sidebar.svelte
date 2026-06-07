<script lang="ts">
  import { page } from '$app/state';
  import { MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut, Settings, Info } from '@lucide/svelte';
  import { loadSidebar, persistSidebar } from './sidebar';

  let { displayName = 'Account' }: { displayName?: string } = $props();
  let open = $state(loadSidebar());

  type NavItem = { href: string; label: string; icon: typeof MessageSquare; match?: string[] };
  const nav: NavItem[] = [
    { href: '/', label: 'Assistant', icon: MessageSquare },
    { href: '/matters', label: 'Projects', icon: FolderKanban },
    { href: '/workflows', label: 'Workflows', icon: Workflow, match: ['/workflows', '/skills', '/playbooks', '/prompts', '/automations'] },
    { href: '/tabular', label: 'Tabular', icon: Table }
  ];

  function toggle() { open = !open; persistSidebar(open); }
  // `match` entries are matched by path prefix — keep them unambiguous (e.g. don't add `/work`).
  const isActive = (item: NavItem) =>
    item.href === '/'
      ? page.url.pathname === '/'
      : (item.match ?? [item.href]).some((p) => page.url.pathname.startsWith(p));
</script>

<aside class="flex h-full flex-col border-r border-mlq-subtle bg-mlq-surface-alt transition-all {open ? 'w-64' : 'w-16'}">
  <div class="flex items-center justify-between px-3 py-4">
    {#if open}<span class="font-serif text-lg text-mlq-strong">Donna</span>{/if}
    <button onclick={toggle} aria-label="Toggle sidebar" class="rounded-mlq-control p-2 hover:bg-mlq-subtle">
      <PanelLeft size={18} />
    </button>
  </div>

  <nav class="flex-1 space-y-1 px-2">
    {#each nav as item (item.href)}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- sidebar nav link -->
      <a href={item.href}
         aria-current={isActive(item) ? 'page' : undefined}
         class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
                {isActive(item) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
        <item.icon size={18} />
        {#if open}<span>{item.label}</span>{/if}
      </a>
    {/each}
  </nav>

  <div class="space-y-1 border-t border-mlq-subtle p-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- about link -->
    <a href="/about"
       aria-current={page.url.pathname.startsWith('/about') ? 'page' : undefined}
       class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
              {page.url.pathname.startsWith('/about') ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
      <Info size={18} />
      {#if open}<span>About</span>{/if}
    </a>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settings link -->
    <a href="/settings"
       aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
       class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
              {page.url.pathname.startsWith('/settings') ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
      <Settings size={18} />
      {#if open}<span>Settings</span>{/if}
    </a>
    <form method="POST" action="/logout">
      <button type="submit"
              class="flex w-full items-center gap-3 rounded-mlq-control px-3 py-2 text-sm text-mlq-text hover:bg-mlq-subtle">
        <LogOut size={18} />
        {#if open}<span>{displayName} · Sign out</span>{/if}
      </button>
    </form>
  </div>
</aside>
