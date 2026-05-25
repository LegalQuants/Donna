import type { ReceiptEvent } from './types';

export interface EventView {
  label: string;
  detail: string;
  tone: 'default' | 'error';
  tier?: number;
}

const num = (d: Record<string, unknown>, k: string): number | undefined =>
  typeof d[k] === 'number' ? (d[k] as number) : undefined;
const str = (d: Record<string, unknown>, k: string): string | undefined =>
  typeof d[k] === 'string' ? (d[k] as string) : undefined;

export function describeEvent(e: ReceiptEvent): EventView {
  const d = e.detail ?? {};
  switch (e.kind) {
    case 'message': {
      const assistant = d.role === 'assistant' || d.message_kind === 'ai';
      const parts: string[] = [];
      const pt = num(d, 'prompt_tokens');
      const ct = num(d, 'completion_tokens');
      if (pt != null) parts.push(`${pt} prompt`);
      if (ct != null) parts.push(`${ct} completion`);
      return {
        label: assistant ? 'Assistant' : 'You',
        detail: parts.length ? `${parts.join(' · ')} tokens` : 'message',
        tone: 'default'
      };
    }
    case 'retrieval': {
      const det = (d.details ?? {}) as Record<string, unknown>;
      const chunks = num(det, 'chunk_count');
      const kbs = Array.isArray(det.kb_ids) ? (det.kb_ids as unknown[]).length : undefined;
      const qt = num(det, 'query_token_estimate');
      const bits: string[] = [];
      if (chunks != null) bits.push(`${chunks} chunk${chunks === 1 ? '' : 's'}`);
      if (kbs != null) bits.push(`from ${kbs} KB${kbs === 1 ? '' : 's'}`);
      if (qt != null) bits.push(`~${qt} query tokens`);
      return { label: 'Knowledge-base retrieval', detail: bits.join(' · ') || 'retrieved context', tone: 'default' };
    }
    case 'inference':
    case 'error': {
      const tier = num(d, 'tier');
      if (e.kind === 'error' || d.refused === true) {
        return { label: 'Inference refused', detail: str(d, 'refusal_reason') ?? 'inference refused', tone: 'error', tier };
      }
      const ti = num(d, 'tokens_in');
      const to = num(d, 'tokens_out');
      const lat = num(d, 'latency_ms');
      const bits: string[] = [];
      const provider = str(d, 'provider');
      if (provider) bits.push(provider);
      if (ti != null && to != null) bits.push(`${ti}→${to} tokens`);
      if (lat != null) bits.push(`${(lat / 1000).toFixed(1)}s`);
      return { label: str(d, 'model') ?? 'inference', detail: bits.join(' · '), tone: 'default', tier };
    }
    case 'skill':
      return { label: 'Skill applied', detail: str(d, 'name') ?? str(d, 'skill') ?? str(d, 'skill_name') ?? 'skill', tone: 'default' };
    case 'audit':
      return { label: 'Audit', detail: str(d, 'action') ?? 'audit event', tone: 'default' };
    default:
      return { label: String(e.kind || 'event'), detail: '', tone: 'default' };
  }
}

/** Anonymization status for an inference/error event, or null for other kinds. */
export function anonStatus(e: ReceiptEvent): 'applied' | 'none' | null {
  if (e.kind !== 'inference' && e.kind !== 'error') return null;
  const a = e.detail?.anonymization_applied;
  if (a === true) return 'applied';
  if (a === false) return 'none';
  return null;
}

/** message_id → anonymization_applied, from inference/error events that carry both. */
export function anonymizedByMessage(events: ReceiptEvent[]): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const e of events) {
    if (e.kind !== 'inference' && e.kind !== 'error') continue;
    const mid = e.detail?.message_id;
    const a = e.detail?.anonymization_applied;
    if (typeof mid === 'string' && typeof a === 'boolean') m.set(mid, a);
  }
  return m;
}
