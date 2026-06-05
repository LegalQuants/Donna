<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import SegmentedControl from '$lib/preferences/SegmentedControl.svelte';
  import TrustPill from '$lib/preferences/TrustPill.svelte';
  import { TRUST_OPTIONS, PROVENANCE_OPTIONS, type TrustFormat, type ProvenanceMode } from '$lib/preferences/preferences';
  import type { ChatModelOption } from '$lib/models/types';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  // untrack: intentional one-time seed from server data (uncontrolled local state pattern).
  let trust = $state<TrustFormat>(untrack(() => data.trustPills));
  let provenance = $state<ProvenanceMode>(untrack(() => data.provenancePills));
  let error = $state<string | null>(null);

  // Sample option to drive the live trust-pill preview.
  const sampleLocal: ChatModelOption = { id: 'preview-local', label: 'Llama 3', resolvedModel: 'ollama/llama3', group: 'local', tier: 1 };

  let autonomousEnabled = $state<boolean>(untrack(() => data.autonomousEnabled));
  function onAutonomous() {
    const prev = autonomousEnabled;
    autonomousEnabled = !prev;
    save('autonomous_enabled', autonomousEnabled, () => (autonomousEnabled = prev));
  }

  async function save(field: 'trust_pills' | 'provenance_pills' | 'autonomous_enabled', value: string | boolean, revert: () => void) {
    error = null;
    try {
      const res = await fetch('/settings/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      if (!res.ok) { revert(); error = "Couldn't save — try again."; return; }
      await invalidateAll();
    } catch {
      revert();
      error = "Couldn't save — try again.";
    }
  }

  function onTrust(v: string) { const prev = trust; trust = v as TrustFormat; save('trust_pills', v, () => (trust = prev)); }
  function onProvenance(v: string) { const prev = provenance; provenance = v as ProvenanceMode; save('provenance_pills', v, () => (provenance = prev)); }
</script>

<svelte:head><title>Preferences — Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Preferences</h1>

{#if error}<p role="status" aria-live="polite" class="mb-3 text-sm text-mlq-error">{error}</p>{/if}

<section class="rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <div class="text-sm font-medium text-mlq-text">Trust indicator</div>
      <div class="mt-0.5 text-xs text-mlq-muted">How the "where inference runs" pill shows in the composer.</div>
    </div>
    <SegmentedControl options={TRUST_OPTIONS} value={trust} label="Trust indicator" onchange={onTrust} />
  </div>
  <div class="mt-3 flex items-center gap-2 border-t border-dashed border-mlq-subtle pt-3">
    <span class="text-[11px] text-mlq-muted">Preview</span>
    <TrustPill option={sampleLocal} format={trust} />
  </div>
</section>

<section class="mt-4 rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <div class="text-sm font-medium text-mlq-text">Message details</div>
      <div class="mt-0.5 text-xs text-mlq-muted">The tier / anonymized / applied-skills pills under each answer.</div>
    </div>
    <SegmentedControl options={PROVENANCE_OPTIONS} value={provenance} label="Message details" onchange={onProvenance} />
  </div>
  <p class="mt-3 border-t border-dashed border-mlq-subtle pt-3 text-[11px] text-mlq-muted">
    {provenance === 'always' ? 'Shown under each answer.' : 'Hidden behind a "Details" toggle on each answer.'}
  </p>
</section>

<section class="mt-4 rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <div class="text-sm font-medium text-mlq-text">Automations</div>
      <div class="mt-0.5 text-xs text-mlq-muted">Let Donna run skills &amp; playbooks on its own — on demand, on a schedule, or when documents arrive. You control cost and can halt anytime.</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={autonomousEnabled}
      aria-label="Enable automations"
      onclick={onAutonomous}
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow {autonomousEnabled ? 'bg-mlq-workflow' : 'bg-mlq-subtle'}"
    >
      <span class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform {autonomousEnabled ? 'translate-x-5' : 'translate-x-0.5'}"></span>
    </button>
  </div>
</section>

<p class="mt-4 text-xs text-mlq-muted">Changes save automatically.</p>
