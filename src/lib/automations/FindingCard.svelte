<!-- src/lib/automations/FindingCard.svelte -->
<script lang="ts">
  import { severityKind, type FindingItem } from './findings';
  import { formatWhen } from './display';

  let { finding }: { finding: FindingItem } = $props();

  const kind = $derived(severityKind(finding.severity));
  // Free-text severity beyond the three intended values renders the raw value
  // (lowercased, truncated) on the neutral badge — never dropped, never a crash.
  const badgeLabel = $derived(
    kind === 'other' ? finding.severity.trim().toLowerCase().slice(0, 24) || 'note' : kind
  );
  const badgeClass = $derived(
    ({
      critical: 'bg-mlq-error text-white',
      warn: 'bg-mlq-caveats text-white',
      info: 'bg-mlq-subtle text-mlq-text',
      other: 'border border-mlq-subtle text-mlq-muted'
    })[kind]
  );
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-3">
  <div class="mb-1 flex items-center gap-2">
    <span class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {badgeClass}">{badgeLabel}</span>
    <span class="min-w-0 truncate text-sm font-medium text-mlq-text">{finding.title}</span>
    <span class="ml-auto shrink-0 text-[11px] text-mlq-muted">{formatWhen(finding.created_at)}</span>
  </div>
  <p class="whitespace-pre-wrap text-sm text-mlq-text">{finding.content}</p>
</div>
