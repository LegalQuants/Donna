<!-- src/lib/automations/ScheduleForm.svelte -->
<script lang="ts">
  import type { SourceItem, SourceMode } from './runNow';
  import type { KnowledgeBase } from '$lib/knowledge/types';
  import type { MatterSummary } from '$lib/matters/types';
  import SourcePicker from './SourcePicker.svelte';
  import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';
  import MatterPicker from '$lib/matters/MatterPicker.svelte';
  import CronInput from './CronInput.svelte';
  import { untrack } from 'svelte';
  import { looksValid } from './cron';

  export interface ScheduleInitial {
    name: string | null;
    cron_expr: string;
    playbook_id: string | null;
    skill_ref: string | null;
    target_kb_id: string | null;
    project_id: string | null;
    max_cost_usd: string | null;
    enabled: boolean;
  }

  let {
    playbookItems,
    skillItems,
    kbs,
    matters,
    initial = null,
    submitLabel = 'Save schedule',
    cronError = null
  }: {
    playbookItems: SourceItem[];
    skillItems: SourceItem[];
    kbs: KnowledgeBase[];
    matters: MatterSummary[];
    initial?: ScheduleInitial | null;
    submitLabel?: string;
    cronError?: string | null;
  } = $props();

  // Seed local form state from `initial` once (edit-mode prefill). It is captured
  // by value via untrack — the form should not reactively re-sync if the parent
  // swaps `initial`, and this keeps svelte-check at zero state_referenced_locally warnings.
  const seed = untrack(() => initial);
  let mode = $state<SourceMode>(seed?.skill_ref ? 'skill' : 'playbook');
  let sourceValue = $state<string | null>(seed?.skill_ref ?? seed?.playbook_id ?? null);
  let kbId = $state<string | null>(seed?.target_kb_id ?? null);
  let projectId = $state<string | null>(seed?.project_id ?? null);
  let maxCost = $state(seed?.max_cost_usd ?? '');
  let name = $state(seed?.name ?? '');
  let cronExpr = $state(seed?.cron_expr ?? '0 9 * * *');
  let enabled = $state(seed?.enabled ?? true);

  const items = $derived(mode === 'playbook' ? playbookItems : skillItems);
  const kbName = $derived(kbs.find((k) => k.id === kbId)?.name ?? null);
  const canSave = $derived(sourceValue !== null && looksValid(cronExpr));

  // Edit mode: the form always emits project_id (empty = cleared) so the update
  // action can send an explicit null (unassign) vs omit (untouched, create mode).
  const editing = $derived(initial !== null);

  function setMode(next: SourceMode) {
    if (next === mode) return;
    mode = next;
    sourceValue = null; // a source from the other mode is no longer valid
  }
</script>

<div class="flex flex-col gap-4">
  <div>
    <label for="schedule-name" class="mb-1 block text-xs font-medium text-mlq-muted">Name (optional)</label>
    <input id="schedule-name" bind:value={name} placeholder="e.g. Weekly summary"
      class="w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow" />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Run a</div>
    <div role="radiogroup" aria-label="Run a" class="inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1">
      <button type="button" role="radio" aria-checked={mode === 'playbook'} onclick={() => setMode('playbook')}
        class="rounded-mlq-control px-3 py-1 text-sm {mode === 'playbook' ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">Playbook</button>
      <button type="button" role="radio" aria-checked={mode === 'skill'} onclick={() => setMode('skill')}
        class="rounded-mlq-control px-3 py-1 text-sm {mode === 'skill' ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">Skill</button>
    </div>
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">{mode === 'playbook' ? 'Playbook' : 'Skill'}</div>
    <SourcePicker
      items={items}
      selectedValue={sourceValue}
      label={mode === 'playbook' ? 'Choose a playbook' : 'Choose a skill'}
      emptyNote={mode === 'playbook' ? 'No playbooks yet.' : 'No skills yet.'}
      onselect={(v) => (sourceValue = v)}
    />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Schedule <span class="text-mlq-error">*</span></div>
    <CronInput value={cronExpr} error={cronError} onchange={(v) => (cronExpr = v)} />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Target knowledge base (optional)</div>
    {#if kbs.length === 0}
      <p class="text-xs text-mlq-muted">No knowledge bases yet.</p>
    {:else}
      <!-- triggerLabel reflects the current selection so an edit-mode (or just-picked) KB is visible on the trigger itself. -->
      <KbPicker {kbs} triggerLabel={kbName ? `Knowledge base: ${kbName}` : 'Choose a knowledge base'} onpick={(id) => (kbId = id)} />
    {/if}
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
    <MatterPicker {matters} bind:selectedId={projectId} placement="down" />
  </div>

  <div>
    <label for="schedule-cost-cap" class="mb-1 block text-xs font-medium text-mlq-muted">Cost cap (optional, USD)</label>
    <!-- type=text (not number): number-binding coerces to a number and breaks maxCost.trim(). -->
    <input id="schedule-cost-cap" type="text" inputmode="decimal" bind:value={maxCost}
      placeholder="e.g. 2.00"
      class="w-32 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow" />
  </div>

  <label class="flex items-center gap-2 text-sm text-mlq-text">
    <input type="checkbox" bind:checked={enabled} class="accent-mlq-workflow" />
    Enabled
  </label>

  <!-- Hidden fields submitted by the page's <form>. Only the active source key is present. -->
  <input type="hidden" name="source_mode" value={mode} />
  {#if mode === 'playbook' && sourceValue}<input type="hidden" name="playbook_id" value={sourceValue} />{/if}
  {#if mode === 'skill' && sourceValue}<input type="hidden" name="skill_ref" value={sourceValue} />{/if}
  <input type="hidden" name="cron_expr" value={cronExpr} />
  <input type="hidden" name="name" value={name.trim()} />
  {#if kbId}<input type="hidden" name="target_kb_id" value={kbId} />{/if}
  {#if projectId}<input type="hidden" name="project_id" value={projectId} />{:else if editing}<input type="hidden" name="project_id" value="" />{/if}
  {#if maxCost.trim()}<input type="hidden" name="max_cost_usd" value={maxCost.trim()} />{/if}
  <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />

  <div>
    <button type="submit" disabled={!canSave}
      class="rounded-mlq-control bg-mlq-workflow px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow disabled:opacity-60">{submitLabel}</button>
  </div>
</div>
