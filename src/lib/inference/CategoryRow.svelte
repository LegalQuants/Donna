<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { CategoryView, ModelTarget } from './types';

  let { category, targets, isAdmin }: { category: CategoryView; targets: ModelTarget[]; isAdmin: boolean } = $props();

  let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let formEl = $state<HTMLFormElement>();

  const cloud = $derived(targets.filter((t) => t.group === 'cloud'));
  const local = $derived(targets.filter((t) => t.group === 'local'));
  // True when the current backing maps to a selectable target. When false (stale/removed
  // backing, or none set) we render a disabled placeholder so the select doesn't silently
  // show the first real option as if it were the backing.
  const knownTarget = $derived(
    category.currentTargetId != null &&
      category.currentTargetId !== '' &&
      targets.some((t) => t.id === category.currentTargetId)
  );

  const submit: SubmitFunction = () => {
    status = 'saving';
    return async ({ result, update }) => {
      if (result.type === 'success') { status = 'saved'; await update(); }
      else { status = 'error'; }
    };
  };
</script>

<div class="flex items-center justify-between gap-3 border-b border-mlq-subtle px-4 py-3 last:border-b-0">
  <div class="min-w-0">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-mlq-text">{category.name}</span>
      <span class="rounded-full border border-mlq-subtle px-1.5 text-xs text-mlq-muted">{category.group === 'local' ? 'Local' : 'Cloud'}{category.tier ? ` · tier ${category.tier}` : ''}</span>
    </div>
    <div class="truncate text-xs text-mlq-muted">Backed by {category.backingLabel || '—'}</div>
  </div>
  {#if isAdmin}
    <form method="POST" action="?/reassign" use:enhance={submit} bind:this={formEl} class="flex items-center gap-2">
      <input type="hidden" name="name" value={category.name} />
      <select
        name="target_id"
        aria-label="Model for {category.name}"
        value={category.currentTargetId ?? ''}
        onchange={() => formEl?.requestSubmit()}
        class="rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-2 py-1 text-xs text-mlq-text"
      >
        {#if !knownTarget}
          <option value={category.currentTargetId ?? ''} disabled>
            {category.currentTargetId ? `${category.backingLabel || category.currentTargetId} (unavailable)` : 'Select a model…'}
          </option>
        {/if}
        {#if cloud.length}
          <optgroup label="Cloud">
            {#each cloud as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
          </optgroup>
        {/if}
        {#if local.length}
          <optgroup label="Local">
            {#each local as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
          </optgroup>
        {/if}
      </select>
      {#if status === 'saving'}<span class="text-xs text-mlq-muted">Saving…</span>
      {:else if status === 'saved'}<span class="text-xs text-mlq-success">Saved</span>
      {:else if status === 'error'}<span class="text-xs text-mlq-error">Failed</span>{/if}
    </form>
  {/if}
</div>
