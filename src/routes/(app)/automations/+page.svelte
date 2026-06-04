<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import SessionList from '$lib/automations/SessionList.svelte';
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
  <SessionList sessions={data.sessions} />
</div>
