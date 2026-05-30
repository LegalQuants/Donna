<script lang="ts">
  import type { Position } from './types';

  let { severity }: { severity: Position['severity_if_missing'] } = $props();

  const STYLES: Record<Position['severity_if_missing'], string> = {
    critical: 'bg-mlq-error text-white',
    high: 'bg-mlq-caveats text-white',
    medium: 'bg-mlq-muted text-white',
    low: 'border border-mlq-subtle text-mlq-muted'
  };
  const LABELS: Record<Position['severity_if_missing'], string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  };
</script>

<span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide {STYLES[severity]}">{LABELS[severity]}</span>
