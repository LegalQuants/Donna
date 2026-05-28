<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';

  let {
    action,
    submitLabel,
    name: initialName = '',
    description: initialDesc = '',
    error = ''
  }: { action: string; submitLabel: string; name?: string; description?: string; error?: string } = $props();

  // untrack: intentional one-time seed from props (uncontrolled input pattern).
  let nameValue = $state(untrack(() => initialName));
  let descValue = $state(untrack(() => initialDesc));
</script>

<form method="POST" {action} use:enhance aria-label="Matter" class="space-y-3">
  <div>
    <label for="matter-name" class="mb-1 block text-xs font-medium text-mlq-text">Matter name <span class="text-mlq-error">*</span></label>
    <input id="matter-name" name="name" bind:value={nameValue} required
           class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none" />
  </div>
  <div>
    <label for="matter-desc" class="mb-1 block text-xs font-medium text-mlq-text">Description <span class="text-mlq-muted">(optional)</span></label>
    <textarea id="matter-desc" name="description" bind:value={descValue} rows="3"
              class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"></textarea>
  </div>
  {#if error}<p class="text-xs text-mlq-error">{error}</p>{/if}
  <div class="flex justify-end">
    <button type="submit" disabled={!nameValue.trim()}
            class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{submitLabel}</button>
  </div>
</form>
