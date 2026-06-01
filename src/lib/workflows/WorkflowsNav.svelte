<script lang="ts">
  type Tool = 'skills' | 'playbooks' | 'prompts';
  let { active }: { active: Tool | null } = $props();

  const segments: { id: Tool; label: string; href: string }[] = [
    { id: 'skills', label: 'Skills', href: '/skills' },
    { id: 'playbooks', label: 'Playbooks', href: '/playbooks' },
    { id: 'prompts', label: 'Prompts', href: '/prompts' }
  ];
</script>

<nav aria-label="Workflows sections" class="mb-4 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1">
  {#each segments as seg (seg.id)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- workflows sub-nav link -->
    <a href={seg.href}
       aria-current={active === seg.id ? 'page' : undefined}
       class="rounded-mlq-control px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow
              {active === seg.id ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">
      {seg.label}
    </a>
  {/each}
</nav>
