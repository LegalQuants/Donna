<script lang="ts">
  import { untrack } from 'svelte';
  import type { PositionCreate } from '../types';
  import FallbackTierEditor from './FallbackTierEditor.svelte';
  import { arrayToLines, linesToArray } from '../editorDraft';

  let { position = $bindable() }: { position: PositionCreate } = $props();

  // Free-text line lists need local text state so typing a trailing newline
  // isn't stripped mid-edit; an effect syncs the parsed array back into the bound position.
  let keywordsText = $state(untrack(() => arrayToLines(position.detection_keywords)));
  let examplesText = $state(untrack(() => arrayToLines(position.detection_examples)));
  $effect(() => { position.detection_keywords = linesToArray(keywordsText); });
  $effect(() => { position.detection_examples = linesToArray(examplesText); });

  const fieldCls = 'mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text';
  const labelCls = 'block text-xs font-medium uppercase tracking-wide text-mlq-muted';
</script>

<div class="space-y-3">
  <label class={labelCls}>Issue
    <input bind:value={position.issue} class={fieldCls} />
  </label>
  <label class={labelCls}>Description
    <input bind:value={position.description} class={fieldCls} />
  </label>
  <label class={labelCls}>Standard language
    <textarea bind:value={position.standard_language} rows="4" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Severity if missing
    <select bind:value={position.severity_if_missing} class={fieldCls}>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
  </label>
  <label class={labelCls}>Redline strategy
    <textarea bind:value={position.redline_strategy} rows="2" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Detection keywords (one per line)
    <textarea bind:value={keywordsText} rows="3" class={fieldCls}></textarea>
  </label>
  <label class={labelCls}>Detection examples (one per line)
    <textarea bind:value={examplesText} rows="3" class={fieldCls}></textarea>
  </label>
  <div class={labelCls}>Fallback tiers
    <div class="mt-1"><FallbackTierEditor bind:tiers={position.fallback_tiers} /></div>
  </div>
</div>
