<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function enable() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const res = await fetch('/settings/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autonomous_enabled: true })
      });
      if (!res.ok) { error = "Couldn't enable — try again."; return; }
      await invalidateAll();
    } catch {
      error = "Couldn't enable — try again.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-5">
  <div class="text-sm font-medium text-mlq-text">Automations are off</div>
  <p class="mt-1 text-xs text-mlq-muted">
    Let Donna run skills &amp; playbooks on its own. You control cost and can halt a run anytime.
  </p>
  {#if error}<p role="status" aria-live="polite" class="mt-2 text-xs text-mlq-error">{error}</p>{/if}
  <button
    type="button"
    onclick={enable}
    disabled={busy}
    class="mt-3 rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow disabled:opacity-60"
  >{busy ? 'Enabling…' : 'Enable automations'}</button>
</div>
