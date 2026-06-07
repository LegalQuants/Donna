<script lang="ts">
  import { untrack } from 'svelte';
  import { X } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { formatBytes, statusBadge, type IngestionStatus } from '$lib/matters/files/uploadFile';
  import type { KBFile, PendingUpload } from './types';

  type Row = KBFile | PendingUpload;
  let { row }: { row: Row } = $props();

  const isAttached = (r: Row): r is KBFile => 'id' in r;
  const fileId = $derived(isAttached(row) ? row.id : row.file_id);

  // Local status snapshot — for attached rows this is just the prop; for
  // pending rows it's updated by the poll loop.
  // untrack: intentional one-time seed from props (uncontrolled state pattern).
  let status = $state<IngestionStatus>(
    untrack(() => (isAttached(row) ? row.ingestion_status : row.status))
  );
  let ingestionError = $state<string | null>(
    untrack(() => row.ingestion_error ?? null)
  );
  let stuck = $state(false);
  let notFound = $state(false);
  let attaching = $state(false);
  let attachForm = $state<HTMLFormElement>();

  const POLL_INTERVAL_MS = 2000;
  const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

  const badge = $derived(statusBadge(status));
  const toneClass = $derived(
    badge.tone === 'success' ? 'text-mlq-success' : badge.tone === 'error' ? 'text-mlq-error' : 'text-mlq-muted'
  );
  const shouldPoll = $derived(
    !isAttached(row) && !notFound && !stuck && (status === 'pending' || status === 'processing')
  );

  // Belt-and-suspenders: shouldPoll's transition to false on `ready` already
  // clears the polling interval before another `ready` can be observed, but
  // the `attaching` flag protects against any future code path that calls
  // fireAttach without going through the $effect cleanup.
  function fireAttach() {
    if (attaching) return;
    attaching = true;
    queueMicrotask(() => attachForm?.requestSubmit());
  }

  $effect(() => {
    if (!shouldPoll) return;

    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/files/${fileId}`);
        if (res.status === 404) {
          notFound = true;
          return;
        }
        if (!res.ok) return; // transient hiccup; keep polling
        const body = (await res.json()) as { ingestion_status: IngestionStatus; ingestion_error?: string | null };
        status = body.ingestion_status;
        ingestionError = body.ingestion_error ?? null;
        if (status === 'ready') fireAttach();
      } catch {
        /* network hiccup; keep polling until stuck timeout */
      }
    };

    const pollId = setInterval(tick, POLL_INTERVAL_MS);
    const stuckId = setTimeout(() => {
      if (status !== 'ready' && status !== 'failed') stuck = true;
    }, STUCK_TIMEOUT_MS);

    return () => {
      clearInterval(pollId);
      clearTimeout(stuckId);
    };
  });

  function refreshNow() {
    stuck = false;
    // Re-arming shouldPoll re-runs the $effect.
  }
</script>

{#if !notFound}
  <div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
    <div class="min-w-0 flex-1">
      <div class="truncate text-sm text-mlq-text">{row.filename}</div>
      <div class="mt-0.5 flex items-center gap-2 text-xs">
        <span class="text-mlq-muted">{formatBytes(row.size_bytes)}</span>
        {#if status === 'failed' && ingestionError}
          <span class={toneClass}>Failed: {ingestionError}</span>
        {:else}
          <span class={toneClass}>{badge.label}</span>
        {/if}
        {#if stuck}
          <button
            type="button"
            onclick={refreshNow}
            class="rounded-mlq-control border border-mlq-subtle px-1.5 py-0.5 text-[10px] text-mlq-text"
          >Refresh</button>
          <span class="text-mlq-muted">Still processing — refresh to check</span>
        {/if}
      </div>
    </div>

    {#if isAttached(row) && status === 'ready'}
      <!-- KB files download via the BFF proxy (/files/{id}/content), same pattern as matter files. -->
      <a href="/files/{fileId}/content" target="_blank" rel="noopener" class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a>
    {/if}

    <form
      method="POST"
      action="?/detachFile"
      use:enhance
      aria-label="Remove file"
      class="shrink-0"
    >
      <input type="hidden" name="file_id" value={fileId} />
      <button
        type="submit"
        aria-label={`Remove ${row.filename}`}
        class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
      ><X size={14} /></button>
    </form>

    <!-- Auto-attach form. Fires once when polling sees status='ready'. -->
    <form
      bind:this={attachForm}
      method="POST"
      action="?/attachFile"
      use:enhance
      class="hidden"
    >
      <input type="hidden" name="file_id" value={fileId} />
    </form>
  </div>
{/if}
