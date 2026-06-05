// src/lib/automations/cron.ts
// Pure cron helpers for the Automations schedule UI. The backend
// (vendor/lq-ai/api/app/autonomous/cron.py) is the source of truth for
// validation (invalid -> 422); looksValid is light client-side feedback only.

export interface CronPreset {
  label: string;
  expr: string;
}

/** Friendly presets shown as chips. Each emits a 5-field cron string. */
export const PRESETS: CronPreset[] = [
  { label: 'Every day at 9:00', expr: '0 9 * * *' },
  { label: 'Every weekday at 9:00', expr: '0 9 * * 1-5' },
  { label: 'Every Monday at 9:00', expr: '0 9 * * 1' },
  { label: 'First of the month at 9:00', expr: '0 9 1 * *' }
];

// Inclusive [lo, hi] bounds per field, mirroring cron.py _FIELD_BOUNDS.
const BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 7] //  day-of-week (Sun=0 or 7 .. Sat=6)
];

function normalize(expr: string): string {
  return expr.trim().replace(/\s+/g, ' ');
}

/** Friendly label when the expression exactly matches a preset, else the normalized raw string. */
export function describeCron(expr: string): string {
  const norm = normalize(expr);
  return PRESETS.find((p) => p.expr === norm)?.label ?? norm;
}

function tokenOk(token: string, lo: number, hi: number): boolean {
  if (token === '') return false;
  let body = token;
  if (token.includes('/')) {
    const [b, step, ...rest] = token.split('/');
    if (rest.length > 0 || !/^\d+$/.test(step) || Number(step) < 1) return false;
    body = b;
  }
  if (body === '*') return true;
  if (body.includes('-')) {
    const [a, b, ...rest] = body.split('-');
    if (rest.length > 0 || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
    const start = Number(a);
    const end = Number(b);
    return start <= end && start >= lo && end <= hi;
  }
  if (!/^\d+$/.test(body)) return false;
  const v = Number(body);
  return v >= lo && v <= hi;
}

function fieldOk(field: string, lo: number, hi: number): boolean {
  if (field === '') return false;
  return field.split(',').every((t) => tokenOk(t, lo, hi));
}

/** Light 5-field shape + bounds check. Does NOT catch in-bounds-but-unsatisfiable
 *  expressions (e.g. Feb 30) — the backend rejects those with a 422. */
export function looksValid(expr: string): boolean {
  const fields = normalize(expr).split(' ');
  if (fields.length !== 5 || fields.some((f) => f === '')) return false;
  return fields.every((f, i) => fieldOk(f, BOUNDS[i][0], BOUNDS[i][1]));
}
