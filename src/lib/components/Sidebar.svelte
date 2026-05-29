<script lang="ts">
  import { page } from '$app/state';
  import { MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut, ScrollText } from '@lucide/svelte';
  import { loadSidebar, persistSidebar } from './sidebar';

  let { displayName = 'Account' }: { displayName?: string } = $props();
  let open = $state(loadSidebar());

  const nav = [
    { href: '/', label: 'Assistant', icon: MessageSquare },
    { href: '/matters', label: 'Projects', icon: FolderKanban },
    { href: '/workflows', label: 'Workflows', icon: Workflow },
    { href: '/skills', label: 'Skills', icon: ScrollText },
    { href: '/tabular', label: 'Tabular', icon: Table }
  ];

  function toggle() { open = !open; persistSidebar(open); }
  const isActive = (href: string) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
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
         aria-current={isActive(item.href) ? 'page' : undefined}
         class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
                {isActive(item.href) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
        <item.icon size={18} />
        {#if open}<span>{item.label}</span>{/if}
      </a>
    {/each}
  </nav>

  <form method="POST" action="/logout" class="border-t border-mlq-subtle p-2">
    <button type="submit"
            class="flex w-full items-center gap-3 rounded-mlq-control px-3 py-2 text-sm text-mlq-text hover:bg-mlq-subtle">
      <LogOut size={18} />
      {#if open}<span>{displayName} · Sign out</span>{/if}
    </button>
  </form>
</aside>
