<script lang="ts">
  import { FolderKanban } from '@lucide/svelte';
  import type { MatterSummary } from './types';

  let { matter }: { matter: MatterSummary | null } = $props();
</script>

{#if matter}
  <a href="/matters/{matter.id}"
     class="inline-flex items-center gap-1.5 rounded-full bg-mlq-surface-alt px-2.5 py-1 text-xs text-mlq-text hover:bg-mlq-subtle">
    <FolderKanban size={13} /> {matter.name}
  </a>
{:else}
  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-mlq-muted">
    <FolderKanban size={13} /> No matter
  </span>
{/if}
