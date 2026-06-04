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
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'running':
      return 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
    case 'halted':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'failed':
      return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
    default:
      return 'bg-mlq-subtle text-mlq-muted border border-mlq-subtle';
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
      return 'text-emerald-400';
    case 'started':
      return 'text-mlq-muted';
    default:
      return 'text-amber-400';
  }
}
