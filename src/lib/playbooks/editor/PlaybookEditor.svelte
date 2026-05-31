<script lang="ts">
  import { untrack } from 'svelte';
  import type { Playbook, PlaybookCreate } from '../types';
  import PositionEditor from './PositionEditor.svelte';
  import SeverityBadge from '../SeverityBadge.svelte';
  import { normalizeDraft, blankPosition, isPositionValid } from '../editorDraft';

  let { initial, onchange }: { initial: PlaybookCreate | Playbook; onchange: (value: PlaybookCreate) => void } = $props();

  let draft = $state<PlaybookCreate>(untrack(() => normalizeDraft(initial)));
  let expanded = $state<number | null>(0);

  function reseat() {
    draft.positions = (draft.positions ?? []).map((p, i) => ({ ...p, position_order: i }));
  }
  function addPosition() {
    const arr = draft.positions ?? [];
    draft.positions = [...arr, blankPosition(arr.length)];
    expanded = draft.positions.length - 1;
  }
  function removePosition(i: number) {
    draft.positions = (draft.positions ?? []).filter((_, idx) => idx !== i);
    reseat();
    expanded = null;
  }
  function move(i: number, dir: -1 | 1) {
    const arr = [...(draft.positions ?? [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    draft.positions = arr;
    reseat();
    expanded = expanded === i ? j : expanded === j ? i : expanded;
  }
  const fieldCls = 'mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-3 py-2 text-sm text-mlq-text';
  const labelCls = 'block text-xs font-medium uppercase tracking-wide text-mlq-muted';

  $effect(() => onchange($state.snapshot(draft) as PlaybookCreate));
</script>

<div class="space-y-3">
  <div>
    <label for="pb-name" class={labelCls}>Playbook name</label>
    <input id="pb-name" bind:value={draft.name} class={fieldCls} />
  </div>
  <div class="flex gap-3">
    <div class="flex-1">
      <label for="pb-type" class={labelCls}>Contract type</label>
      <input id="pb-type" bind:value={draft.contract_type} class={fieldCls} />
    </div>
    <div class="w-32">
      <label for="pb-version" class={labelCls}>Version</label>
      <input id="pb-version" bind:value={draft.version} class={`${fieldCls} font-mono`} />
    </div>
  </div>
  <div>
    <label for="pb-desc" class={labelCls}>Description</label>
    <textarea id="pb-desc" bind:value={draft.description} rows="2" class={fieldCls}></textarea>
  </div>

  <p class="text-xs text-mlq-muted">{draft.positions?.length ?? 0} position{(draft.positions?.length ?? 0) === 1 ? '' : 's'}</p>
  <div class="space-y-2">
    {#each draft.positions ?? [] as position, i (i)}
      <div class="rounded-mlq-control border border-mlq-subtle">
        <div class="flex items-center gap-2 px-3 py-2">
          <button type="button" onclick={() => (expanded = expanded === i ? null : i)} aria-expanded={expanded === i}
            class="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span class="truncate font-serif text-mlq-strong">{position.issue || 'Untitled position'}</span>
            <SeverityBadge severity={position.severity_if_missing} />
            {#if !isPositionValid(position)}<span class="text-xs text-mlq-error">• incomplete</span>{/if}
          </button>
          <button type="button" onclick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${position.issue || 'position'} up`} class="px-1 text-mlq-muted disabled:opacity-30 hover:text-mlq-text">↑</button>
          <button type="button" onclick={() => move(i, 1)} disabled={i === (draft.positions?.length ?? 0) - 1} aria-label={`Move ${position.issue || 'position'} down`} class="px-1 text-mlq-muted disabled:opacity-30 hover:text-mlq-text">↓</button>
          <button type="button" onclick={() => removePosition(i)} aria-label={`Remove position ${position.issue || ''}`.trim()} class="px-1 text-xs text-mlq-muted hover:text-mlq-error">Remove</button>
        </div>
        {#if expanded === i}
          <div class="border-t border-mlq-subtle p-3"><PositionEditor bind:position={draft.positions![i]} /></div>
        {/if}
      </div>
    {/each}
    <button type="button" onclick={addPosition} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text hover:border-mlq-workflow">+ Add position</button>
  </div>
</div>
