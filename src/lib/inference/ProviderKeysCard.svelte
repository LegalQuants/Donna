<!-- src/lib/inference/ProviderKeysCard.svelte -->
<!-- Admin-gated BYOK card for /settings/models. Non-admins get a note (the
     API itself is admin-only). `form` is the page's ActionData — failures
     carry { provider, message } so the error lands on the right row. -->
<script lang="ts">
  import ProviderKeyRowItem from './ProviderKeyRowItem.svelte';
  import type { ProviderKeyRow } from './providerKeys';

  let { isAdmin, providerKeys, form }: {
    isAdmin: boolean;
    providerKeys: ProviderKeyRow[] | null;
    form: { provider?: string; message?: string } | null | undefined;
  } = $props();

  function rowError(provider: string): string | null {
    return form?.message && form.provider === provider ? form.message : null;
  }
</script>

<section class="rounded-mlq-control border border-mlq-subtle">
  <div class="border-b border-mlq-subtle px-4 py-2">
    <h2 class="text-xs font-medium uppercase tracking-wide text-mlq-muted">Provider keys</h2>
    {#if isAdmin}
      <p class="mt-1 text-xs text-mlq-muted">Keys are encrypted at rest in the gateway and applied immediately — no restart. The full key is never shown again after saving.</p>
    {/if}
  </div>
  {#if !isAdmin}
    <p class="px-4 py-3 text-sm text-mlq-muted">Provider API keys are managed by your administrator.</p>
  {:else if providerKeys === null}
    <p class="px-4 py-3 text-sm text-mlq-muted">Could not load provider keys right now.</p>
  {:else if providerKeys.length === 0}
    <p class="px-4 py-3 text-sm text-mlq-muted">No providers are configured in the gateway.</p>
  {:else}
    {#each providerKeys as row (row.provider)}
      <ProviderKeyRowItem {row} error={rowError(row.provider)} />
    {/each}
  {/if}
</section>
