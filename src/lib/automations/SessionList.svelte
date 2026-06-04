<script lang="ts">
  import type { SessionSummary } from './types';
  import SessionRow from './SessionRow.svelte';
  let { sessions }: { sessions: SessionSummary[] } = $props();
</script>

{#if sessions.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
    <p class="text-sm font-medium text-mlq-text">No automations yet</p>
    <p class="mt-1 text-xs text-mlq-muted">
      Automations are tasks Donna runs on its own — on a schedule or when new documents arrive.
      When one runs, you'll see exactly what it did, what it cost, and why it stopped, right here.
    </p>
  </div>
{:else}
  <ul class="flex flex-col gap-2">
    {#each sessions as session (session.id)}
      <li><SessionRow {session} /></li>
    {/each}
  </ul>
{/if}
