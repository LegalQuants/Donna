<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { X } from '@lucide/svelte';
  import type { DeletionSchedule } from './dataPrivacy';

  let { open = false, onclose, ondeleted }:
    { open?: boolean; onclose?: () => void; ondeleted?: (info: DeletionSchedule) => void } = $props();

  const CONFIRM_WORD = 'DELETE';
  let confirmText = $state('');
  let error = $state<string | null>(null);
  const canDelete = $derived(confirmText === CONFIRM_WORD);

  // Reset on open — avoids stale text/error when reopened.
  $effect(() => { if (open) { confirmText = ''; error = null; } });

  $effect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose?.(); };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });

  const submit: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'success' && result.data?.deletion) {
      ondeleted?.(result.data.deletion as DeletionSchedule);
    } else {
      error = (result.type === 'failure' ? (result.data?.deleteError as string | undefined) : undefined)
        ?? 'Could not schedule deletion. Please try again.';
    }
    // No update()/invalidateAll: the action cleared our session cookies, so a
    // reload would bounce to /login before the page can show the confirmation.
  };
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={() => onclose?.()}></div>
  <div role="dialog" aria-modal="true" aria-label="Delete your account"
    class="fixed left-1/2 top-1/2 z-40 w-[26rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-mlq-text">Delete your account?</h2>
      <button type="button" aria-label="Close" onclick={() => onclose?.()} class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={16} /></button>
    </div>
    <p class="mb-3 text-xs text-mlq-muted">This schedules permanent deletion after a grace period and signs you out everywhere. You can cancel during the grace window.</p>
    <form method="POST" action="?/requestDeletion" use:enhance={submit}>
      <label class="block text-xs text-mlq-muted" for="delete-confirm">Type DELETE to confirm</label>
      <input id="delete-confirm" name="confirm" bind:value={confirmText} autocomplete="off"
        class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text outline-none focus:border-mlq-error" />
      {#if error}<p class="mt-2 text-sm text-mlq-error">{error}</p>{/if}
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick={() => onclose?.()} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Cancel</button>
        <button type="submit" disabled={!canDelete} class="rounded-mlq-control bg-mlq-error px-2.5 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">Delete account</button>
      </div>
    </form>
  </div>
{/if}
