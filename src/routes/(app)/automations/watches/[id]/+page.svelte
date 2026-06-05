<script lang="ts">
  import { enhance } from '$app/forms';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import WatchForm from '$lib/automations/WatchForm.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const initial = $derived({
    playbook_id: data.watch.playbook_id,
    skill_ref: data.watch.skill_ref,
    knowledge_base_id: data.watch.knowledge_base_id,
    project_id: data.watch.project_id,
    max_cost_usd: data.watch.max_cost_usd,
    enabled: data.watch.enabled
  });
</script>

<svelte:head><title>Edit watch — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="watches" unread={data.unread} />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to watches -->
  <a href="/automations/watches" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Watches</a>

  <h2 class="mb-3 text-lg font-medium text-mlq-text">Edit watch</h2>
  {#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
  <form method="POST" action="?/update" use:enhance>
    <WatchForm
      playbookItems={data.playbookItems}
      skillItems={data.skillItems}
      kbs={data.kbs}
      matters={data.matters}
      {initial}
      submitLabel="Save changes"
    />
  </form>
</div>
