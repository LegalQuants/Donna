<script lang="ts">
  import type { Redline } from './types';
  import RedlineChange from './RedlineChange.svelte';
  let { redline }: { redline: Redline } = $props();
</script>

<div class="space-y-1">
  <RedlineChange {redline} />
  {#if redline.justification}
    <p class="text-xs text-mlq-muted">{redline.justification}</p>
  {/if}
</div>
