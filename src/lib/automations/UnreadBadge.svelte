<!-- src/lib/automations/UnreadBadge.svelte -->
<script lang="ts">
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <span
    aria-label="{count} unread"
    class="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-mlq-workflow px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
  >{count}</span>
{/if}
