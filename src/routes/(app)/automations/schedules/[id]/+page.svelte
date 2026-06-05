<script lang="ts">
  import { enhance } from '$app/forms';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import ScheduleForm from '$lib/automations/ScheduleForm.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const initial = $derived({
    name: data.schedule.name,
    cron_expr: data.schedule.cron_expr,
    playbook_id: data.schedule.playbook_id,
    skill_ref: data.schedule.skill_ref,
    target_kb_id: data.schedule.target_kb_id,
    project_id: data.schedule.project_id,
    max_cost_usd: data.schedule.max_cost_usd,
    enabled: data.schedule.enabled
  });
</script>

<svelte:head><title>Edit schedule — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="schedules" unread={data.unread} />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to schedules -->
  <a href="/automations/schedules" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Schedules</a>

  <h2 class="mb-3 text-lg font-medium text-mlq-text">Edit schedule</h2>
  {#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
  <form method="POST" action="?/update" use:enhance>
    <ScheduleForm
      playbookItems={data.playbookItems}
      skillItems={data.skillItems}
      kbs={data.kbs}
      matters={data.matters}
      {initial}
      submitLabel="Save changes"
      cronError={form && 'field' in form && form.field === 'cron' ? (form.error ?? null) : null}
    />
  </form>
</div>
