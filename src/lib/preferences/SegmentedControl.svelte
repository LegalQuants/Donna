<script lang="ts">
  type Option = { value: string; label: string };
  let { options, value, label, onchange }:
    { options: Option[]; value: string; label: string; onchange?: (value: string) => void } = $props();
</script>

<div role="radiogroup" aria-label={label} class="inline-flex overflow-hidden rounded-mlq-control border border-mlq-subtle text-xs">
  {#each options as o, i (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      onclick={() => { if (value !== o.value) onchange?.(o.value); }}
      class="px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow
             {i > 0 ? 'border-l border-mlq-subtle' : ''}
             {value === o.value ? 'bg-mlq-strong text-white' : 'text-mlq-text hover:bg-mlq-subtle/50'}"
    >{o.label}</button>
  {/each}
</div>
