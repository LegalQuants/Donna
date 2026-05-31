<script lang="ts">
  import type { GenPhase } from './genFlow.svelte.ts';
  let { phase, error = null, stuck = false }: { phase: GenPhase; error?: string | null; stuck?: boolean } = $props();
</script>

{#if phase === 'error'}
  <p class="text-sm text-mlq-error">⚠ {error ?? 'Generation failed.'}</p>
{:else}
  <div class="flex items-center gap-2 text-sm text-mlq-text">
    <span class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-mlq-workflow align-middle" aria-label="Working"></span>
    {#if phase === 'preparing'}
      <span>Preparing documents…</span>
    {:else}
      <span>Generating playbook from your documents…</span>
    {/if}
  </div>
  {#if stuck}
    <p class="mt-2 text-xs text-mlq-muted">Still generating — you can reload to resume.</p>
  {/if}
{/if}
