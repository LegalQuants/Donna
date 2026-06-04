<script lang="ts">
  import { untrack } from 'svelte';
  import SessionReceiptHeader from './SessionReceiptHeader.svelte';
  import SessionTimeline from './SessionTimeline.svelte';
  import { createSessionPoll } from './pollSession.svelte';
  import type { SessionSummary, SessionReceipt } from './types';

  let { initialSession, initialReceipt }: { initialSession: SessionSummary; initialReceipt: SessionReceipt | null } = $props();

  // Live-poll a running session to terminal; swap in fresh data as it arrives.
  // untrack the id read so the initial-prop access isn't a reactive dependency.
  const live = createSessionPoll(untrack(() => initialSession.id));
  const session = $derived(live.session ?? initialSession);
  const receipt = $derived(live.session ? live.receipt : initialReceipt);

  $effect(() => {
    if (initialSession.status === 'running') {
      live.start();
      return () => live.stop();
    }
  });
</script>

<div class="flex flex-col gap-4">
  <SessionReceiptHeader {session} {receipt} />
  {#if session.status === 'running'}
    <p class="text-xs text-mlq-workflow">Running — live updating…</p>
  {/if}
  <SessionTimeline {receipt} />
</div>
