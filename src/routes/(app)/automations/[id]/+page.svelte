<script lang="ts">
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import SessionDetail from '$lib/automations/SessionDetail.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to sessions -->
  <a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Sessions</a>
  {#key data.session.id}
    <SessionDetail initialSession={data.session} initialReceipt={data.receipt} />
  {/key}
</div>
