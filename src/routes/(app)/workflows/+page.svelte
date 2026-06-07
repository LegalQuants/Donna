<script lang="ts">
  import { ScrollText, Library, BookMarked, Bot } from '@lucide/svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';

  const cards = [
    { href: '/skills', icon: ScrollText, name: 'Skills', desc: 'Reusable instructions you attach to a chat to shape how Donna responds. Author your own or fork a built-in.' },
    { href: '/playbooks', icon: Library, name: 'Playbooks', desc: 'Standard negotiation positions Donna applies to a contract — verdicts and redlines, position by position.' },
    { href: '/prompts', icon: BookMarked, name: 'Prompts', desc: 'Saved prompt snippets you drop into the composer to reuse wording you rely on.' },
    { href: '/automations', icon: Bot, name: 'Automations', desc: 'Sessions Donna runs on its own — see exactly what the agent did, what it cost, and why it stopped.' }
  ];
</script>

<svelte:head><title>Workflows — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active={null} />
  <div data-testid="workflows-cards" class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each cards as c (c.href)}
      <a href={c.href} class="block rounded-mlq-control border border-mlq-subtle p-4 hover:bg-mlq-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow">
        <c.icon size={22} class="mb-2 text-mlq-workflow" />
        <span class="block text-sm font-medium text-mlq-text">{c.name}</span>
        <span class="mt-1 block text-xs text-mlq-muted">{c.desc}</span>
      </a>
    {/each}
  </div>
</div>
