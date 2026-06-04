<script lang="ts">
  import { untrack } from 'svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import SessionReceiptHeader from '$lib/automations/SessionReceiptHeader.svelte';
  import SessionTimeline from '$lib/automations/SessionTimeline.svelte';
  import { createSessionPoll } from '$lib/automations/pollSession.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // session.id is the route param — fixed for the lifetime of this page.
  const live = createSessionPoll(untrack(() => data.session.id));
  const session = $derived(live.session ?? data.session);
  const receipt = $derived(live.session ? live.receipt : data.receipt);

  // Live-poll a running session to terminal; re-evaluates if a fresh load changes status.
  $effect(() => {
    if (data.session.status === 'running') {
      live.start();
      return () => live.stop();
    }
  });
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to sessions -->
  <a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Sessions</a>
  <div class="flex flex-col gap-4">
    <SessionReceiptHeader {session} {receipt} />
    {#if session.status === 'running'}
      <p class="text-xs text-sky-400">Running — live updating…</p>
    {/if}
    <SessionTimeline {receipt} />
  </div>
</div>
