// src/lib/automations/types.ts
// Defensively-parsed view models for the Automations surface (lq-ai /api/v1/autonomous/*).
// Session/notification rows are typed by gen:api; the session `receipt` is loosely typed
// ({[k]: unknown}, DE-330) so it is hand-typed and parsed here like parseTabularResults.

export interface PhaseTransition {
  to_phase: string | null;
  timestamp: string | null;
}
export interface ToolCall {
  tool: string | null;
  outcome: string | null;
  timestamp: string | null;
  cost_usd: number | null;
}
export interface SessionReceipt {
  session_id: string;
  trigger_kind: string;
  status: string | null;
  halt_state: string | null;
  current_phase: string | null;
  cost_total_usd: number | null;
  max_cost_usd: number | null;
  cost_cap_reached: boolean;
  created_at: string | null;
  completed_at: string | null;
  phase_transitions: PhaseTransition[];
  tool_calls: ToolCall[];
  terminal_reason: string | null;
}
export interface SessionSummary {
  id: string;
  trigger_kind: string;
  current_phase: string;
  status: string;
  halt_state: string;
  cost_total_usd: number;
  max_cost_usd: number | null;
  cost_cap_reached: boolean;
  created_at: string;
  completed_at: string | null;
  last_activity_at: string | null;
  error: string | null;
}
export interface NotificationItem {
  id: string;
  session_id: string;
  channel: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function parseReceipt(raw: unknown): SessionReceipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.session_id !== 'string') return null; // build_receipt_safe → null on failure
  const phases = Array.isArray(r.phase_transitions) ? r.phase_transitions : [];
  const tools = Array.isArray(r.tool_calls) ? r.tool_calls : [];
  return {
    session_id: r.session_id,
    trigger_kind: str(r.trigger_kind) ?? 'manual',
    status: str(r.status),
    halt_state: str(r.halt_state),
    current_phase: str(r.current_phase),
    cost_total_usd: num(r.cost_total_usd),
    max_cost_usd: num(r.max_cost_usd),
    cost_cap_reached: r.cost_cap_reached === true,
    created_at: str(r.created_at),
    completed_at: str(r.completed_at),
    phase_transitions: phases.map((p) => {
      const po = obj(p);
      return { to_phase: str(po.to_phase), timestamp: str(po.timestamp) };
    }),
    tool_calls: tools.map((t) => {
      const to = obj(t);
      return {
        tool: str(to.tool),
        outcome: str(to.outcome),
        timestamp: str(to.timestamp),
        cost_usd: num(to.cost_usd)
      };
    }),
    terminal_reason: str(r.terminal_reason)
  };
}

export function parseSessionSummary(raw: unknown): SessionSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    trigger_kind: str(r.trigger_kind) ?? 'manual',
    current_phase: str(r.current_phase) ?? 'intake',
    status: str(r.status) ?? 'running',
    halt_state: str(r.halt_state) ?? 'running',
    cost_total_usd: num(r.cost_total_usd) ?? 0,
    max_cost_usd: num(r.max_cost_usd),
    cost_cap_reached: r.cost_cap_reached === true,
    created_at: str(r.created_at) ?? '',
    completed_at: str(r.completed_at),
    last_activity_at: str(r.last_activity_at),
    error: str(r.error)
  };
}

function listOf(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const arr = obj(raw)[key];
  return Array.isArray(arr) ? arr : [];
}

export function parseSessionList(raw: unknown): SessionSummary[] {
  return listOf(raw, 'sessions')
    .map(parseSessionSummary)
    .filter((s): s is SessionSummary => s !== null);
}

export function parseNotification(raw: unknown): NotificationItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.session_id !== 'string') return null;
  return {
    id: r.id,
    session_id: r.session_id,
    channel: str(r.channel) ?? 'in_app',
    title: str(r.title) ?? '',
    body: str(r.body) ?? '',
    read_at: str(r.read_at),
    created_at: str(r.created_at) ?? ''
  };
}

export function parseNotificationList(raw: unknown): NotificationItem[] {
  return listOf(raw, 'notifications')
    .map(parseNotification)
    .filter((n): n is NotificationItem => n !== null);
}
