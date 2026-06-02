<script lang="ts">
  import { trustPosture, type TrustFormat } from './preferences';
  import type { ChatModelOption } from '$lib/models/types';

  let { option, format }: { option: ChatModelOption | null; format: TrustFormat } = $props();
  const posture = $derived(option ? trustPosture(option) : null);
  // Green = local/self-hosted; amber = cloud.
  const tone = $derived(
    posture?.tone === 'local'
      ? 'border-mlq-success/40 bg-mlq-success/10 text-mlq-success'
      : 'border-mlq-caveats/40 bg-mlq-caveats/10 text-mlq-caveats'
  );
</script>

{#if posture}
  <span
    data-testid="trust-pill"
    title={`${posture.label} — ${posture.detail}`}
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-5 {tone}"
  >
    <span aria-hidden="true">●</span>{#if format === 'labels'}<span>{posture.label}</span>{/if}
  </span>
{/if}
