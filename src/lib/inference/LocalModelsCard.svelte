<script lang="ts">
  import type { ModelTarget } from './types';
  let { localModels }: { localModels: ModelTarget[] } = $props();
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
  <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Installed local models</h2>
  <div class="px-4 py-3">
    {#if localModels.length === 0}
      <p class="text-sm text-mlq-muted">No local models detected. Install <a class="underline" href="https://ollama.com">Ollama</a> and run <code>ollama pull &lt;model&gt;</code> to add one.</p>
    {:else}
      <ul class="space-y-1">
        {#each localModels as m (m.id)}
          <li class="text-sm text-mlq-text">{m.label} <span class="text-xs text-mlq-muted">({m.id})</span></li>
        {/each}
      </ul>
      <p class="mt-2 text-xs text-mlq-muted">Detected via Ollama on your system. Run <code>ollama pull &lt;model&gt;</code> to add more.</p>
    {/if}
  </div>
</section>
