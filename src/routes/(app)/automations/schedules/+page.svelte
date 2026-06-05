<script lang="ts">
  import { enhance } from '$app/forms';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
  import ScheduleForm from '$lib/automations/ScheduleForm.svelte';
  import ScheduleList from '$lib/automations/ScheduleList.svelte';
  import { sourceLabel } from '$lib/automations/schedules';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showForm = $state(false);
  $effect(() => {
    if (form?.created) showForm = false;
  });

  const rows = $derived(
    data.schedules.map((s) => ({ schedule: s, label: sourceLabel(s, data.playbookItems, data.skillItems) }))
  );
</script>

<svelte:head><title>Schedules — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="schedules" unread={data.unread} />

  {#if !data.autonomousEnabled}
    <AutomationsGate />
  {:else}
    <!-- Page-level errors (failed toggle/delete, or a create 400/502) render here so they're
         visible even when the create form is closed. Cron-field 422s surface inside CronInput. -->
    {#if form?.error && !(form && 'field' in form && form.field === 'cron')}
      <p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>
    {/if}

    <div class="mb-3">
      <button type="button" onclick={() => (showForm = !showForm)}
        class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow">
        {showForm ? 'Cancel' : 'New schedule'}
      </button>
    </div>

    {#if showForm}
      <form method="POST" action="?/create" use:enhance class="mb-6 rounded-mlq-control border border-mlq-subtle p-4">
        <ScheduleForm
          playbookItems={data.playbookItems}
          skillItems={data.skillItems}
          kbs={data.kbs}
          matters={data.matters}
          cronError={form && 'field' in form && form.field === 'cron' ? (form.error ?? null) : null}
        />
      </form>
    {/if}

    <ScheduleList {rows} />
  {/if}
</div>
