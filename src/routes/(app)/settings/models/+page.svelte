<script lang="ts">
  import CategoryRow from '$lib/inference/CategoryRow.svelte';
  import LocalModelsCard from '$lib/inference/LocalModelsCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Models — Settings — Donna</title></svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-medium text-mlq-text">Models</h1>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app settings link -->
    <p class="mt-1 text-sm text-mlq-muted">Choose which model backs each inference category. See <a class="underline" href="/settings/trust">Trust</a> for where your data goes.</p>
  </div>

  {#if data.modelsError}
    <div class="rounded-mlq-control border border-mlq-subtle px-4 py-6 text-center text-sm text-mlq-muted">Could not load models right now.</div>
  {:else}
    <section class="rounded-mlq-control border border-mlq-subtle">
      <h2 class="border-b border-mlq-subtle px-4 py-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Inference categories</h2>
      {#each data.categories as c (c.name)}
        <CategoryRow category={c} targets={data.targets} isAdmin={data.isAdmin} />
      {/each}
      {#if !data.isAdmin}
        <p class="px-4 py-2 text-xs text-mlq-muted">Changing model routing requires an admin account.</p>
      {/if}
    </section>

    <LocalModelsCard localModels={data.localModels} />

    <section class="rounded-mlq-control border border-mlq-subtle px-4 py-3">
      <h2 class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Provider keys</h2>
      <p class="mt-1 text-sm text-mlq-muted">Provider API keys are set via your deployment's environment. In-app key management is coming.</p>
    </section>
  {/if}
</div>
