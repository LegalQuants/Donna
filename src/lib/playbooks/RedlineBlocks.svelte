<script lang="ts">
  import type { Redline } from './types';
  let { redline }: { redline: Redline } = $props();
</script>

<div class="space-y-1">
  <div class="border-l-2 border-mlq-error/40 bg-mlq-error/5 px-2 py-1 text-xs text-mlq-error line-through">{redline.old_text}</div>
  <div class="border-l-2 border-mlq-success/40 bg-mlq-success/5 px-2 py-1 text-xs text-mlq-success">{redline.new_text}</div>
  {#if redline.justification}
    <p class="text-xs text-mlq-muted">{redline.justification}</p>
  {/if}
</div>
