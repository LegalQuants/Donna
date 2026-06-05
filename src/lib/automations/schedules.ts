// src/lib/automations/schedules.ts
// Defensively-parsed view models + form helpers for autonomous schedules
// (lq-ai /api/v1/autonomous/schedules). Mirrors the style of types.ts.
export { sourceLabel } from './sourceLabel';

export interface ScheduleSummary {
  id: string;
  name: string | null;
  cron_expr: string;
  playbook_id: string | null;
  skill_ref: string | null;
  target_kb_id: string | null;
  project_id: string | null;
  max_cost_usd: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseSchedule(raw: unknown): ScheduleSummary | null {
  const r = obj(raw);
  if (typeof r.id !== 'string' || typeof r.cron_expr !== 'string') return null;
  return {
    id: r.id,
    name: str(r.name),
    cron_expr: r.cron_expr,
    playbook_id: str(r.playbook_id),
    skill_ref: str(r.skill_ref),
    target_kb_id: str(r.target_kb_id),
    project_id: str(r.project_id),
    max_cost_usd: str(r.max_cost_usd),
    enabled: r.enabled === true,
    next_run_at: str(r.next_run_at),
    last_run_at: str(r.last_run_at)
  };
}

export function parseScheduleList(raw: unknown): ScheduleSummary[] {
  const envelope = obj(raw).schedules;
  const arr = Array.isArray(raw) ? raw : Array.isArray(envelope) ? (envelope as unknown[]) : [];
  return arr.map(parseSchedule).filter((s): s is ScheduleSummary => s !== null);
}

export type ScheduleBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false };

/** Build the create/update request body from a submitted form. Enforces the
 *  "exactly one source + a cron" rule; cron validity itself is the backend's
 *  job (422). Shared by the list (?/create) and edit (?/update) actions. */
export function buildScheduleBody(form: FormData): ScheduleBodyResult {
  const mode = String(form.get('source_mode') ?? 'playbook');
  const playbookId = String(form.get('playbook_id') ?? '');
  const skillRef = String(form.get('skill_ref') ?? '');
  const cronExpr = String(form.get('cron_expr') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  const targetKbId = String(form.get('target_kb_id') ?? '');
  const projectId = String(form.get('project_id') ?? '');
  const maxCost = String(form.get('max_cost_usd') ?? '').trim();
  const enabled = String(form.get('enabled') ?? 'true') === 'true';

  const sourceOk = mode === 'skill' ? Boolean(skillRef) : Boolean(playbookId);
  if (!sourceOk || !cronExpr) return { ok: false };

  const body: Record<string, unknown> = { cron_expr: cronExpr, enabled };
  if (mode === 'skill') body.skill_ref = skillRef;
  else body.playbook_id = playbookId;
  if (name) body.name = name;
  if (targetKbId) body.target_kb_id = targetKbId;
  if (projectId) body.project_id = projectId;
  if (maxCost && Number.isFinite(Number(maxCost)) && Number(maxCost) >= 0) body.max_cost_usd = maxCost;
  return { ok: true, body };
}
