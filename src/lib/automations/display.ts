// src/lib/automations/display.ts
export function formatUsd(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(2)}`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

/** Tailwind classes for a status pill. Standard palette; align with existing pills if a shared one lands. */
export function statusTone(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-mlq-success/15 text-mlq-success';
    case 'running':
      return 'bg-mlq-workflow/15 text-mlq-workflow';
    case 'halted':
      return 'bg-mlq-caveats/20 text-mlq-caveats';
    case 'failed':
      return 'bg-mlq-error/15 text-mlq-error';
    default:
      return 'bg-mlq-subtle text-mlq-muted';
  }
}

const HUMANIZE: Record<string, string> = {
  completed: 'Completed',
  cost_cap_reached: 'Cost cap reached',
  external_halt: 'Halted',
  idle_timeout: 'Idle timeout'
};
export function terminalReasonLabel(reason: string | null): string {
  if (!reason) return 'In progress';
  return HUMANIZE[reason] ?? reason.replace(/_/g, ' ');
}

export function phaseLabel(phase: string | null): string {
  return (phase ?? 'unknown').replace(/_/g, ' ');
}
export function triggerLabel(kind: string): string {
  return kind.replace(/_/g, ' ');
}

/** Tailwind text color for a tool-call outcome. Real values seen: `started`, `success`
 *  (see receipt spike notes). `success` → positive; `started` → neutral; else → warning. */
export function outcomeTone(outcome: string): string {
  switch (outcome) {
    case 'success':
      return 'text-mlq-success';
    case 'started':
      return 'text-mlq-muted';
    default:
      return 'text-mlq-caveats';
  }
}
