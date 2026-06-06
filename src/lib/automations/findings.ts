// src/lib/automations/findings.ts
// Defensively-parsed view models for a run's work-product (lq-ai #135):
// findings (GET /sessions/{id}/findings — emission order, free-text severity)
// + the memories a run proposed (GET /memory?source_session_id= — note the
// `entries` envelope). Mirrors the parsing style of types.ts/schedules.ts.

export interface FindingItem {
  id: string;
  severity: string;
  title: string;
  content: string;
  created_at: string | null;
}

export interface RunMemoryItem {
  id: string;
  state: string;
  category: string;
  content: string;
  created_at: string | null;
}

export type SeverityKind = 'critical' | 'warn' | 'info' | 'other';

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Normalize the free-text severity to a badge kind. The backend stores
 *  whatever the model emits — anything outside the three intended values
 *  renders as a neutral 'other' badge (never crash, never filter out). */
export function severityKind(severity: string): SeverityKind {
  const s = severity.trim().toLowerCase();
  return s === 'critical' || s === 'warn' || s === 'info' ? s : 'other';
}

function parseFinding(raw: unknown): FindingItem | null {
  const r = obj(raw);
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    severity: str(r.severity) ?? '',
    title: str(r.title) ?? '',
    content: str(r.content) ?? '',
    created_at: str(r.created_at)
  };
}

export interface FindingList {
  findings: FindingItem[];
  total: number;
}

export function parseFindingList(raw: unknown): FindingList {
  const r = obj(raw);
  const arr = Array.isArray(r.findings) ? r.findings : [];
  const findings = arr.map(parseFinding).filter((f): f is FindingItem => f !== null);
  const total = typeof r.total_count === 'number' ? r.total_count : findings.length;
  return { findings, total };
}

export function parseRunMemories(raw: unknown): RunMemoryItem[] {
  const arr = obj(raw).entries;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((m) => {
      const r = obj(m);
      if (typeof r.id !== 'string') return null;
      return {
        id: r.id,
        state: str(r.state) ?? 'proposed',
        category: str(r.category) ?? '',
        content: str(r.content) ?? '',
        created_at: str(r.created_at)
      };
    })
    .filter((m): m is RunMemoryItem => m !== null);
}

/** One-line severity count summary in fixed kind order, zero kinds skipped:
 *  "2 critical · 1 warning · 4 info · 1 other". */
export function severitySummary(findings: FindingItem[]): string {
  const counts: Record<SeverityKind, number> = { critical: 0, warn: 0, info: 0, other: 0 };
  for (const f of findings) counts[severityKind(f.severity)]++;
  const parts: string[] = [];
  if (counts.critical) parts.push(`${counts.critical} critical`);
  if (counts.warn) parts.push(`${counts.warn} ${counts.warn === 1 ? 'warning' : 'warnings'}`);
  if (counts.info) parts.push(`${counts.info} info`);
  if (counts.other) parts.push(`${counts.other} other`);
  return parts.join(' · ');
}
