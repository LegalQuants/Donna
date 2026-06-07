<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import SessionList from '$lib/automations/SessionList.svelte';
  import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
  import { createUnreadPoll } from '$lib/automations/unreadPoll.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const unread = createUnreadPoll(untrack(() => data.unread));
  onMount(() => { unread.start(); return () => unread.stop(); });
</script>

<svelte:head><title>Automations — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="sessions" unread={unread.count} />
  {#if data.autonomousEnabled}
    <div class="mb-3">
      <a href="/automations/new" class="inline-block rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow">Run now</a>
    </div>
    <SessionList sessions={data.sessions} />
  {:else}
    <AutomationsGate />
    {#if data.sessions.length > 0}<div class="mt-4"><SessionList sessions={data.sessions} /></div>{/if}
  {/if}
</div>
