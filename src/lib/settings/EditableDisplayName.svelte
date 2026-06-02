<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { rebrandName } from '$lib/brand';

  // The raw stored display_name (i.e. user.display_name). May carry the "LQ.AI" brand.
  let { name }: { name: string | null | undefined } = $props();
  const MAX_DISPLAY_NAME_LENGTH = 200;

  let editing = $state(false);
  let nameInput = $state('');
  let msg = $state<string | null>(null);
  let msgIsError = $state(false);

  const trimmed = $derived(nameInput.trim());
  // Compare against the RAW stored name (not the rebranded pre-fill): saving the rebranded
  // value over an "LQ.AI" name is a real change, while re-saving the true stored value is a no-op.
  const canSave = $derived(trimmed.length > 0 && trimmed.length <= MAX_DISPLAY_NAME_LENGTH && trimmed !== (name ?? ''));

  function startEdit() {
    nameInput = rebrandName(name);
    msg = null;
    msgIsError = false;
    editing = true;
  }

  function cancel() {
    editing = false;
    msg = null;
    msgIsError = false;
  }

  const submit: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'success') {
      editing = false;
      msg = 'Name updated.';
      msgIsError = false;
      await invalidateAll();
    } else if (result.type === 'failure') {
      msg = (result.data?.profileError as string | undefined) ?? 'Could not update your name.';
      msgIsError = true;
    }
  };
</script>

<div class="flex items-start justify-between px-4 py-2">
  <dt class="text-mlq-muted">Name</dt>
  <dd class="m-0 flex flex-col items-end gap-1 text-mlq-text">
    {#if editing}
      <form method="POST" action="?/updateProfile" use:enhance={submit} class="flex items-center gap-2">
        <input
          name="display_name"
          bind:value={nameInput}
          maxlength={MAX_DISPLAY_NAME_LENGTH}
          aria-label="Display name"
          class="rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
        />
        <button type="submit" disabled={!canSave} class="rounded-mlq-control bg-mlq-strong px-2.5 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">Save</button>
        <button type="button" onclick={cancel} class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle/50">Cancel</button>
      </form>
    {:else}
      <span class="flex items-center gap-2">
        {rebrandName(name) || '—'}
        <button type="button" onclick={startEdit} class="rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text hover:bg-mlq-subtle/50">Edit</button>
      </span>
    {/if}
    {#if msg}<p role="status" aria-live="polite" class="text-xs {msgIsError ? 'text-mlq-error' : 'text-mlq-muted'}">{msg}</p>{/if}
  </dd>
</div>
