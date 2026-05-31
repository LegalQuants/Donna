<script lang="ts">
  import type { Position, PositionCreate } from './types';
  import SeverityBadge from './SeverityBadge.svelte';

  let { position }: { position: Position | PositionCreate } = $props();
  let expanded = $state(false);

  const hasInternals = $derived(
    (position.fallback_tiers?.length ?? 0) > 0 ||
      !!position.redline_strategy ||
      (position.detection_keywords?.length ?? 0) > 0 ||
      (position.detection_examples?.length ?? 0) > 0
  );
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex items-start justify-between gap-3">
    <h3 class="font-serif text-mlq-strong">{position.issue}</h3>
    <SeverityBadge severity={position.severity_if_missing} />
  </div>
  {#if position.description}
    <p class="mt-1 text-sm text-mlq-text">{position.description}</p>
  {/if}
  <div class="mt-2 border-l-2 border-mlq-subtle pl-3 text-sm text-mlq-text">{position.standard_language}</div>

  {#if hasInternals}
    <button type="button" onclick={() => (expanded = !expanded)} aria-expanded={expanded}
      class="mt-3 text-xs text-mlq-workflow hover:underline">
      {expanded ? 'Hide matching details' : 'Show matching details'}
    </button>
    {#if expanded}
      <div class="mt-2 space-y-3 text-sm">
        {#if position.fallback_tiers?.length}
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Fallback tiers</div>
            {#each position.fallback_tiers as tier (tier.rank)}
              <div class="mt-1 text-mlq-text">
                <span class="font-medium">Tier {tier.rank}{#if tier.description} — {tier.description}{/if}:</span>
                <span class="border-l-2 border-mlq-subtle pl-2"> {tier.language}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if position.redline_strategy}
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Redline strategy</div>
            <p class="mt-1 text-mlq-text">{position.redline_strategy}</p>
          </div>
        {/if}
        {#if position.detection_keywords?.length}
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Detection keywords</div>
            <div class="mt-1">
              {#each position.detection_keywords as kw (kw)}<span class="mr-1 mb-1 inline-block rounded bg-mlq-subtle px-1.5 py-0.5 text-xs text-mlq-text">{kw}</span>{/each}
            </div>
          </div>
        {/if}
        {#if position.detection_examples?.length}
          <div>
            <div class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Detection examples</div>
            <ul class="mt-1 list-disc pl-5 text-mlq-text">
              {#each position.detection_examples as ex (ex)}<li>{ex}</li>{/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
