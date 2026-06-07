<script lang="ts">
  import type { SessionSummary } from './types';
  import { formatUsd, formatWhen, statusTone, phaseLabel, triggerLabel } from './display';
  let { session }: { session: SessionSummary } = $props();
</script>

<a href="/automations/{session.id}"
  aria-label="{triggerLabel(session.trigger_kind)} session, {session.status}"
  class="flex items-center gap-3 rounded-mlq-control border border-mlq-subtle p-3 hover:bg-mlq-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow"
>
  <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusTone(session.status)}">{session.status}</span>
  <span class="text-sm text-mlq-text">{triggerLabel(session.trigger_kind)}</span>
  <span class="text-xs text-mlq-muted">phase: {phaseLabel(session.current_phase)}</span>
  <span class="ml-auto text-xs tabular-nums text-mlq-muted">{formatUsd(session.cost_total_usd)}</span>
  <span class="shrink-0 text-xs text-mlq-muted">{formatWhen(session.created_at)}</span>
</a>
