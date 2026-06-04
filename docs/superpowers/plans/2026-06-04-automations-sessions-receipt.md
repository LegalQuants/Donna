# Automations — Sessions + Receipt and Notifications (Slices A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 4th Workflows segment, **Automations**, exposing LQ-AI's autonomous layer read-only — a sessions list, a per-session transparency **receipt** view (what the agent did, what it cost, why it stopped), and a notifications inbox.

**Architecture:** Pure extension of Donna's existing Workflows IA. SSR `load` via `lqFetch` for lists; a thin BFF proxy + a Svelte-5 rune poll controller (modeled on `runFlow.svelte.ts`) for live-polling running sessions; form action for mark-read. The session `receipt` is the one loosely-typed (DE-330) payload — hand-typed and defensively parsed like `parseTabularResults`. The receipt renders as a single chronological timeline (phase transitions + tool calls merged by timestamp).

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Vitest 4, `@testing-library/svelte`, Tailwind (`mlq-*` design tokens). Backend contract at pin `541bd6f` (`src/lib/api/backend.d.ts:6842–8144`).

**Spec:** `docs/superpowers/specs/2026-06-04-automations-sessions-receipt-design.md`

---

## Conventions (read once before starting)

- **Gate:** `npm run check` must be **0 errors / 0 warnings** (the bar). `npx vitest run` green. Add **no new** eslint errors (~53 pre-exist on `main`).
- **Internal `<a href>`** must carry `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` on the line directly above (see `WorkflowsNav.svelte`).
- **Test file names drop the `+`:** `+page.server.ts` → `page.server.test.ts`; `+page.svelte` → `page.svelte.test.ts`; `+server.ts` → `server.test.ts`.
- **Server/load/proxy tests** use `// @vitest-environment node` and mock `$lib/server/lqClient`.
- **Component tests** use `@testing-library/svelte` `render(Comp, { props })`.
- **Commit** after every task (atomic). Imperative subject. Append the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Namespace:** everything lives under `src/lib/automations/` and routes under `src/routes/(app)/automations/`. Do **not** reuse the existing chat-`receipts` names (`src/lib/receipts/`, `ReceiptEventRow.svelte`) — those are a different feature.

---

## File Structure

**Library (`src/lib/automations/`):**
- `types.ts` — interfaces + defensive parsers (`parseReceipt`, `parseSessionSummary`, `parseSessionList`, `parseNotification`, `parseNotificationList`).
- `timeline.ts` — `TimelineEvent` + `mergeTimeline(receipt)` (merge phases + tool calls by timestamp).
- `display.ts` — pure label/format helpers (`formatUsd`, `formatWhen`, `statusTone`, `phaseLabel`, `triggerLabel`, `terminalReasonLabel`).
- `pollSession.svelte.ts` — rune poll controller for a running session.
- `AutomationsNav.svelte` — inner sub-nav (Sessions / Notifications `[n]`).
- `SessionList.svelte` / `SessionRow.svelte` — sessions list + empty state.
- `SessionReceiptHeader.svelte` — at-a-glance header.
- `SessionTimeline.svelte` — the unified chronological stream.
- `NotificationsInbox.svelte` / `NotificationRow.svelte` — inbox + row.
- `UnreadBadge.svelte` — count chip used by `AutomationsNav`.

**Routes (`src/routes/(app)/automations/`):**
- `+page.server.ts` / `+page.svelte` — sessions list (`/automations`).
- `[id]/+page.server.ts` / `[id]/+page.svelte` — receipt detail.
- `[id]/+server.ts` — BFF proxy (GET one session) for the poll loop.
- `notifications/+page.server.ts` / `notifications/+page.svelte` — inbox (load + mark-read action).
- `notifications/unread/+server.ts` — BFF proxy returning the unread count (badge poll).

**Modified:**
- `src/lib/workflows/WorkflowsNav.svelte` — add the `automations` segment.
- `src/routes/(app)/workflows/+page.svelte` — add the hub card.
- `src/routes/(app)/workflows/page.svelte.test.ts` — assert the new card (if it enumerates cards).

---

## Task 0: Live confirmation spike (gating; manual)

Confirms the autonomous worker runs end-to-end in the dev stack and captures a **real** receipt + real `tool` / `outcome` / `to_phase` / `skill_ref` values, so Tasks 1–2 type and label against reality. No code lands except a captured sample file.

**Files:**
- Create: `docs/superpowers/plans/artifacts/2026-06-04-receipt-sample.json` (captured output)

- [ ] **Step 1: Bring up the dev stack**

Run:
```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```
Expected: all containers healthy. The `arq-worker` service runs `app.workers.arq_setup.WorkerSettings`, which registers `autonomous_session_job` + the idle-watchdog/schedule-dispatcher crons (`vendor/lq-ai/api/app/workers/arq_setup.py:43–56`).

- [ ] **Step 2: Get an auth token for the admin fixture**

Run:
```bash
TOKEN=$(curl -s -X POST localhost:18000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"admin@lq.ai\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "${TOKEN:0:12}..."
```
Expected: a token prefix prints.

- [ ] **Step 3: Opt the admin user in (resolves blocker #1 live)**

Run:
```bash
curl -s -X PATCH localhost:18000/api/v1/users/me/preferences \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"autonomous_enabled": true}' | python3 -m json.tool
```
Expected: response includes `"autonomous_enabled": true`.

- [ ] **Step 4: Find a playbook id to run**

Run:
```bash
curl -s localhost:18000/api/v1/playbooks -H "authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;[print(p["id"],p.get("name")) for p in json.load(sys.stdin)[:5]]'
```
Expected: at least one `playbook_id`. (If none, create one via the Donna UI first, or substitute a `skill_ref` — record the exact string format you used.)

- [ ] **Step 5: Spawn a manual session**

Run (substitute `<PLAYBOOK_ID>`):
```bash
curl -s -X POST localhost:18000/api/v1/autonomous/run-now \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"playbook_id":"<PLAYBOOK_ID>","max_cost_usd":"2.00"}' | python3 -m json.tool | tee /tmp/session.json
SID=$(python3 -c 'import json;print(json.load(open("/tmp/session.json"))["id"])')
echo "session $SID"
```
Expected: an `AutonomousSessionRead` with `status:"running"` (or queued). Note the `id`.
If you get **403**, the opt-in (Step 3) did not take — re-check. If **422**, you passed zero or both of `playbook_id`/`skill_ref`.

- [ ] **Step 6: Poll to terminal and capture the receipt**

Run:
```bash
for i in $(seq 1 60); do
  curl -s localhost:18000/api/v1/autonomous/sessions/$SID \
    -H "authorization: Bearer $TOKEN" > /tmp/detail.json
  S=$(python3 -c 'import json;print(json.load(open("/tmp/detail.json"))["session"]["status"])')
  echo "poll $i: $S"; [ "$S" != "running" ] && break; sleep 3
done
cp /tmp/detail.json docs/superpowers/plans/artifacts/2026-06-04-receipt-sample.json
python3 -m json.tool docs/superpowers/plans/artifacts/2026-06-04-receipt-sample.json
```
Expected: terminal `status` (`completed`/`halted`/`failed`); the file contains `{ "session": {...}, "receipt": {...} }`.

- [ ] **Step 7: Reconcile against this plan**

Read the captured `receipt`. Confirm its keys match the `SessionReceipt` interface in Task 1 and that `phase_transitions[]`/`tool_calls[]` element shapes match. **Record actual example values** for `tool`, `outcome`, `to_phase`, `terminal_reason`, and the `skill_ref` format (if used) as a short note at the top of the sample file. If any field differs from Task 1's interface, adjust Task 1 before implementing it.

- [ ] **Step 8: Commit the captured sample**

```bash
git add docs/superpowers/plans/artifacts/2026-06-04-receipt-sample.json
git commit -m "chore(automations): capture real autonomous session receipt sample (spike)"
```

> If the session never leaves `running` within ~3 min, the worker may be misconfigured — check `docker compose logs arq-worker` for `autonomous_session_job`. Resolve before proceeding; the receipt view is unbuildable without a real shape.

---

## Task 1: Types + defensive parsers

**Files:**
- Create: `src/lib/automations/types.ts`
- Test: `src/lib/automations/types.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseReceipt,
  parseSessionSummary,
  parseSessionList,
  parseNotification,
  parseNotificationList
} from './types';

describe('parseReceipt', () => {
  it('parses a full receipt and coerces Decimal-string costs to numbers', () => {
    const r = parseReceipt({
      session_id: 's1',
      trigger_kind: 'schedule',
      status: 'completed',
      halt_state: 'running',
      current_phase: 'delivery',
      cost_total_usd: '0.42',
      max_cost_usd: '2.00',
      cost_cap_reached: false,
      created_at: '2026-06-04T09:00:00Z',
      completed_at: '2026-06-04T09:04:00Z',
      phase_transitions: [{ to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' }],
      tool_calls: [{ tool: 'kb.search', outcome: 'ok', timestamp: '2026-06-04T09:01:00Z', cost_usd: 0.01 }],
      terminal_reason: 'completed'
    });
    expect(r).not.toBeNull();
    expect(r!.cost_total_usd).toBe(0.42);
    expect(r!.max_cost_usd).toBe(2);
    expect(r!.phase_transitions[0].to_phase).toBe('intake');
    expect(r!.tool_calls[0].cost_usd).toBe(0.01);
    expect(r!.terminal_reason).toBe('completed');
  });

  it('returns null when the receipt is absent (build_receipt_safe → None)', () => {
    expect(parseReceipt(null)).toBeNull();
    expect(parseReceipt({})).toBeNull(); // no session_id
  });

  it('defaults missing arrays and tolerates sparse/garbage entries', () => {
    const r = parseReceipt({ session_id: 's2', trigger_kind: 'manual' });
    expect(r!.phase_transitions).toEqual([]);
    expect(r!.tool_calls).toEqual([]);
    expect(r!.cost_total_usd).toBeNull();
    const r2 = parseReceipt({ session_id: 's3', tool_calls: [null, { tool: 'x' }, 7] });
    expect(r2!.tool_calls).toHaveLength(3);
    expect(r2!.tool_calls[0].tool).toBeNull();
    expect(r2!.tool_calls[1].tool).toBe('x');
    expect(r2!.tool_calls[1].cost_usd).toBeNull();
  });
});

describe('parseSessionSummary / parseSessionList', () => {
  it('parses a list envelope and drops rows without an id', () => {
    const list = parseSessionList({
      sessions: [
        { id: 'a', trigger_kind: 'manual', current_phase: 'intake', status: 'running',
          halt_state: 'running', cost_total_usd: '0', cost_cap_reached: false, created_at: 'x' },
        { trigger_kind: 'manual' }
      ],
      total_count: 2, limit: 50, offset: 0
    });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a');
    expect(list[0].cost_total_usd).toBe(0);
  });
  it('accepts a bare array too', () => {
    expect(parseSessionList([{ id: 'z' }])).toHaveLength(1);
  });
});

describe('parseNotification / parseNotificationList', () => {
  it('parses a notification with a typed session_id', () => {
    const n = parseNotification({
      id: 'n1', session_id: 's1', channel: 'in_app',
      title: 'Done', body: 'Review ready', read_at: null, created_at: '2026-06-04T09:04:00Z'
    });
    expect(n!.session_id).toBe('s1');
    expect(n!.read_at).toBeNull();
  });
  it('parses the list envelope and drops rows missing id/session_id', () => {
    const list = parseNotificationList({
      notifications: [
        { id: 'n1', session_id: 's1', channel: 'in_app', title: 't', body: 'b', created_at: 'x' },
        { id: 'n2' }
      ],
      total_count: 2, limit: 50, offset: 0
    });
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/automations/types.test.ts`
Expected: FAIL — "Cannot find module './types'".

- [ ] **Step 3: Implement `types.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/automations/types.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/types.ts src/lib/automations/types.test.ts
git commit -m "feat(automations): typed defensive parsers for sessions, receipt, notifications"
```

---

## Task 2: Timeline merge

**Files:**
- Create: `src/lib/automations/timeline.ts`
- Test: `src/lib/automations/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { mergeTimeline } from './timeline';
import type { SessionReceipt } from './types';

const base: SessionReceipt = {
  session_id: 's1', trigger_kind: 'schedule', status: 'completed', halt_state: 'running',
  current_phase: 'delivery', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: null, completed_at: null, phase_transitions: [], tool_calls: [], terminal_reason: 'completed'
};

describe('mergeTimeline', () => {
  it('interleaves phases and tool calls in timestamp order', () => {
    const events = mergeTimeline({
      ...base,
      phase_transitions: [
        { to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' },
        { to_phase: 'analysis', timestamp: '2026-06-04T09:01:00Z' }
      ],
      tool_calls: [{ tool: 'kb.search', outcome: 'ok', timestamp: '2026-06-04T09:00:30Z', cost_usd: 0.01 }]
    });
    expect(events.map((e) => e.kind)).toEqual(['phase', 'tool', 'phase']);
    expect(events[0]).toMatchObject({ kind: 'phase', label: 'intake' });
    expect(events[1]).toMatchObject({ kind: 'tool', label: 'kb.search', outcome: 'ok', cost_usd: 0.01 });
  });

  it('keeps original order for events with null/equal timestamps (stable)', () => {
    const events = mergeTimeline({
      ...base,
      phase_transitions: [{ to_phase: 'intake', timestamp: null }, { to_phase: 'analysis', timestamp: null }],
      tool_calls: [{ tool: 'a', outcome: 'ok', timestamp: null, cost_usd: null }]
    });
    // phases first (added first), then the tool — stable for null timestamps
    expect(events.map((e) => e.label)).toEqual(['intake', 'analysis', 'a']);
  });

  it('returns [] for an empty receipt', () => {
    expect(mergeTimeline(base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/timeline.test.ts`
Expected: FAIL — "Cannot find module './timeline'".

- [ ] **Step 3: Implement `timeline.ts`**

```ts
// src/lib/automations/timeline.ts
import type { SessionReceipt } from './types';

export interface TimelineEvent {
  kind: 'phase' | 'tool';
  label: string;        // phase name or tool name
  outcome: string | null; // tool only
  cost_usd: number | null; // tool only
  timestamp: string | null;
  order: number;        // stable tiebreaker
}

/** Merge phase transitions and tool calls into one chronological stream.
 *  Stable: events with null/equal timestamps keep insertion order
 *  (phases inserted before tools). */
export function mergeTimeline(receipt: SessionReceipt): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let order = 0;
  for (const p of receipt.phase_transitions) {
    events.push({
      kind: 'phase',
      label: p.to_phase ?? 'unknown',
      outcome: null,
      cost_usd: null,
      timestamp: p.timestamp,
      order: order++
    });
  }
  for (const t of receipt.tool_calls) {
    events.push({
      kind: 'tool',
      label: t.tool ?? 'unknown',
      outcome: t.outcome,
      cost_usd: t.cost_usd,
      timestamp: t.timestamp,
      order: order++
    });
  }
  return events.sort((a, b) => {
    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
      return a.timestamp < b.timestamp ? -1 : 1;
    }
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return a.order - b.order;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/timeline.ts src/lib/automations/timeline.test.ts
git commit -m "feat(automations): merge phase transitions and tool calls into one timeline"
```

---

## Task 3: Display helpers

**Files:**
- Create: `src/lib/automations/display.ts`
- Test: `src/lib/automations/display.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/display.test.ts
import { describe, it, expect } from 'vitest';
import { formatUsd, formatWhen, statusTone, terminalReasonLabel, outcomeTone } from './display';

describe('display helpers', () => {
  it('outcomeTone maps started/success/other to distinct classes', () => {
    expect(outcomeTone('success')).toContain('emerald');
    expect(outcomeTone('started')).toContain('muted');
    expect(outcomeTone('error')).toContain('amber');
  });
  it('formatUsd renders dollars or a dash', () => {
    expect(formatUsd(0.42)).toBe('$0.42');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(null)).toBe('—');
  });
  it('formatWhen renders a locale string or a dash', () => {
    expect(formatWhen(null)).toBe('—');
    expect(formatWhen('2026-06-04T09:00:00Z')).toBe(new Date('2026-06-04T09:00:00Z').toLocaleString());
  });
  it('statusTone maps each status to a non-empty class string', () => {
    for (const s of ['running', 'completed', 'halted', 'failed', 'anything']) {
      expect(statusTone(s).length).toBeGreaterThan(0);
    }
  });
  it('terminalReasonLabel humanizes known reasons and passes through null', () => {
    expect(terminalReasonLabel('cost_cap_reached')).toBe('Cost cap reached');
    expect(terminalReasonLabel('external_halt')).toBe('Halted');
    expect(terminalReasonLabel(null)).toBe('In progress');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/display.test.ts`
Expected: FAIL — "Cannot find module './display'".

- [ ] **Step 3: Implement `display.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/display.ts src/lib/automations/display.test.ts
git commit -m "feat(automations): display helpers (cost, time, status tone, labels)"
```

---

## Task 4: WorkflowsNav 4th segment + hub card

**Files:**
- Modify: `src/lib/workflows/WorkflowsNav.svelte`
- Modify: `src/routes/(app)/workflows/+page.svelte`
- Test: `src/routes/(app)/workflows/page.svelte.test.ts` (extend)

- [ ] **Step 1: Write/extend the failing test**

Add to `src/routes/(app)/workflows/page.svelte.test.ts` (create the file with this content if it does not exist):

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/workflows hub', () => {
  it('shows an Automations card linking to /automations', () => {
    render(Page);
    const cards = screen.getByTestId('workflows-cards');
    const link = within(cards).getByRole('link', { name: /automations/i });
    expect(link).toHaveAttribute('href', '/automations');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/workflows/page.svelte.test.ts"`
Expected: FAIL — no link named "automations".

- [ ] **Step 3: Add the segment to `WorkflowsNav.svelte`**

In `src/lib/workflows/WorkflowsNav.svelte`, change the `Tool` type and `segments` array:

```svelte
<script lang="ts">
  type Tool = 'skills' | 'playbooks' | 'prompts' | 'automations';
  let { active }: { active: Tool | null } = $props();

  const segments: { id: Tool; label: string; href: string }[] = [
    { id: 'skills', label: 'Skills', href: '/skills' },
    { id: 'playbooks', label: 'Playbooks', href: '/playbooks' },
    { id: 'prompts', label: 'Prompts', href: '/prompts' },
    { id: 'automations', label: 'Automations', href: '/automations' }
  ];
</script>
```
(Leave the `<nav>` markup unchanged — it iterates `segments`.)

- [ ] **Step 4: Add the hub card in `workflows/+page.svelte`**

In `src/routes/(app)/workflows/+page.svelte`, add the icon import and a 4th card. Change the import line to include `Bot`:

```svelte
  import { ScrollText, Library, BookMarked, Bot } from '@lucide/svelte';
```
Add to the `cards` array (after the prompts entry):
```svelte
    { href: '/automations', icon: Bot, name: 'Automations', desc: 'Sessions Donna runs on its own — see exactly what the agent did, what it cost, and why it stopped.' }
```
Change the grid to fit four cards — update the wrapper class `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4`.

- [ ] **Step 5: Run the test + check**

Run: `npx vitest run "src/routes/(app)/workflows/page.svelte.test.ts" && npm run check`
Expected: PASS; check 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflows/WorkflowsNav.svelte "src/routes/(app)/workflows/+page.svelte" "src/routes/(app)/workflows/page.svelte.test.ts"
git commit -m "feat(automations): add Automations segment to Workflows nav and hub"
```

---

## Task 5: AutomationsNav inner sub-nav

**Files:**
- Create: `src/lib/automations/AutomationsNav.svelte`
- Create: `src/lib/automations/UnreadBadge.svelte`
- Test: `src/lib/automations/AutomationsNav.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/AutomationsNav.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import AutomationsNav from './AutomationsNav.svelte';

describe('AutomationsNav', () => {
  it('marks the active tab and links to both views', () => {
    render(AutomationsNav, { props: { active: 'sessions', unread: 0 } });
    const nav = screen.getByRole('navigation', { name: 'Automations views' });
    expect(within(nav).getByRole('link', { name: /sessions/i })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /notifications/i })).toHaveAttribute('href', '/automations/notifications');
  });
  it('shows an unread count when > 0', () => {
    render(AutomationsNav, { props: { active: 'notifications', unread: 3 } });
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`
Expected: FAIL — cannot find `AutomationsNav.svelte`.

- [ ] **Step 3: Implement `UnreadBadge.svelte`**

```svelte
<!-- src/lib/automations/UnreadBadge.svelte -->
<script lang="ts">
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <span
    aria-label="{count} unread"
    class="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-mlq-workflow px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
  >{count}</span>
{/if}
```

- [ ] **Step 4: Implement `AutomationsNav.svelte`**

```svelte
<!-- src/lib/automations/AutomationsNav.svelte -->
<script lang="ts">
  import UnreadBadge from './UnreadBadge.svelte';
  type View = 'sessions' | 'notifications';
  let { active, unread = 0 }: { active: View; unread?: number } = $props();

  const tabs: { id: View; label: string; href: string }[] = [
    { id: 'sessions', label: 'Sessions', href: '/automations' },
    { id: 'notifications', label: 'Notifications', href: '/automations/notifications' }
  ];
</script>

<nav aria-label="Automations views" class="mb-4 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1">
  {#each tabs as tab (tab.id)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- automations sub-nav link -->
    <a
      href={tab.href}
      aria-current={active === tab.id ? 'page' : undefined}
      class="inline-flex items-center rounded-mlq-control px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow
             {active === tab.id ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}"
    >
      {tab.label}
      {#if tab.id === 'notifications'}<UnreadBadge count={unread} />{/if}
    </a>
  {/each}
</nav>
```

- [ ] **Step 5: Run the test + check**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts && npm run check`
Expected: PASS; check 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/AutomationsNav.svelte src/lib/automations/UnreadBadge.svelte src/lib/automations/AutomationsNav.svelte.test.ts
git commit -m "feat(automations): inner sub-nav (Sessions/Notifications) with unread badge"
```

---

## Task 6: Sessions list route

**Files:**
- Create: `src/routes/(app)/automations/+page.server.ts`
- Create: `src/routes/(app)/automations/+page.svelte`
- Create: `src/lib/automations/SessionRow.svelte`
- Create: `src/lib/automations/SessionList.svelte`
- Test: `src/routes/(app)/automations/page.server.test.ts`
- Test: `src/routes/(app)/automations/page.svelte.test.ts`
- Test: `src/lib/automations/SessionList.svelte.test.ts`

- [ ] **Step 1: Write the failing load test**

```ts
// src/routes/(app)/automations/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/automations load', () => {
  it('GETs sessions + unread count and returns parsed data', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [{ id: 's1', status: 'completed', trigger_kind: 'schedule', current_phase: 'delivery', cost_total_usd: '0.42', created_at: 'x' }], total_count: 1, limit: 50, offset: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [], total_count: 2, limit: 1, offset: 0 }), { status: 200 }));
    const out = (await load(ev())) as { sessions: { id: string }[]; unread: number };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions');
    expect(out.sessions[0].id).toBe('s1');
    expect(out.unread).toBe(2);
  });
  it('throws 502 when the sessions list fails', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 502 });
  });
  it('tolerates a failing unread count (defaults to 0)', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [], total_count: 0, limit: 50, offset: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }));
    const out = (await load(ev())) as { unread: number };
    expect(out.unread).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/page.server.test.ts"`
Expected: FAIL — cannot find `./+page.server`.

- [ ] **Step 3: Implement `+page.server.ts`**

```ts
// src/routes/(app)/automations/+page.server.ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseSessionList } from '$lib/automations/types';
import { unreadCount } from '$lib/automations/unread.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [res, unread] = await Promise.all([
    lqFetch(event, '/api/v1/autonomous/sessions'),
    unreadCount(event) // never throws → safe in Promise.all
  ]);
  if (!res.ok) throw error(502, 'Could not load automations.');
  const sessions = parseSessionList(await res.json());
  return { sessions, unread };
};
```

- [ ] **Step 4: Implement the shared unread helper**

Create `src/lib/automations/unread.server.ts`:

```ts
// src/lib/automations/unread.server.ts
import type { RequestEvent } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

/** Total unread notifications. Best-effort: never throws — returns 0 on any failure
 *  so a flaky count can't break the sessions/inbox pages. Uses limit=1 and reads total_count. */
export async function unreadCount(event: RequestEvent): Promise<number> {
  try {
    const res = await lqFetch(event, '/api/v1/autonomous/notifications?unread=true&limit=1');
    if (!res.ok) return 0;
    const body = (await res.json()) as { total_count?: unknown };
    return typeof body.total_count === 'number' ? body.total_count : 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 5: Run the load test to verify it passes**

Run: `npx vitest run "src/routes/(app)/automations/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 6: Write the failing component test for the list**

```ts
// src/lib/automations/SessionList.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionList from './SessionList.svelte';
import type { SessionSummary } from './types';

const row: SessionSummary = {
  id: 's1', trigger_kind: 'schedule', current_phase: 'delivery', status: 'completed',
  halt_state: 'running', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-04T09:00:00Z', completed_at: '2026-06-04T09:04:00Z', last_activity_at: null, error: null
};

describe('SessionList', () => {
  it('renders an empty state when there are no sessions', () => {
    render(SessionList, { props: { sessions: [] } });
    expect(screen.getByText(/no automations yet/i)).toBeInTheDocument();
  });
  it('renders a row linking to the session receipt', () => {
    render(SessionList, { props: { sessions: [row] } });
    const link = screen.getByRole('link', { name: /schedule/i });
    expect(link).toHaveAttribute('href', '/automations/s1');
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('$0.42')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run src/lib/automations/SessionList.svelte.test.ts`
Expected: FAIL — cannot find `SessionList.svelte`.

- [ ] **Step 8: Implement `SessionRow.svelte`**

```svelte
<!-- src/lib/automations/SessionRow.svelte -->
<script lang="ts">
  import type { SessionSummary } from './types';
  import { formatUsd, formatWhen, statusTone, phaseLabel, triggerLabel } from './display';
  let { session }: { session: SessionSummary } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- automations session link -->
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
```

- [ ] **Step 9: Implement `SessionList.svelte`**

```svelte
<!-- src/lib/automations/SessionList.svelte -->
<script lang="ts">
  import type { SessionSummary } from './types';
  import SessionRow from './SessionRow.svelte';
  let { sessions }: { sessions: SessionSummary[] } = $props();
</script>

{#if sessions.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
    <p class="text-sm font-medium text-mlq-text">No automations yet</p>
    <p class="mt-1 text-xs text-mlq-muted">
      Automations are tasks Donna runs on its own — on a schedule or when new documents arrive.
      When one runs, you'll see exactly what it did, what it cost, and why it stopped, right here.
    </p>
  </div>
{:else}
  <ul class="flex flex-col gap-2">
    {#each sessions as session (session.id)}
      <li><SessionRow {session} /></li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 10: Implement `+page.svelte`**

```svelte
<!-- src/routes/(app)/automations/+page.svelte -->
<script lang="ts">
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import SessionList from '$lib/automations/SessionList.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Automations — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="sessions" unread={data.unread} />
  <SessionList sessions={data.sessions} />
</div>
```

- [ ] **Step 11: Write the page smoke test**

```ts
// src/routes/(app)/automations/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/automations index', () => {
  it('renders Workflows nav with Automations active and the empty state', () => {
    render(Page, { props: { data: { sessions: [], unread: 0 } } as never });
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Automations' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/no automations yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run all of this task's tests + check**

Run: `npx vitest run "src/routes/(app)/automations" src/lib/automations/SessionList.svelte.test.ts && npm run check`
Expected: PASS; check 0/0.

- [ ] **Step 13: Commit**

```bash
git add "src/routes/(app)/automations/+page.server.ts" "src/routes/(app)/automations/+page.svelte" "src/routes/(app)/automations/page.server.test.ts" "src/routes/(app)/automations/page.svelte.test.ts" src/lib/automations/SessionRow.svelte src/lib/automations/SessionList.svelte src/lib/automations/SessionList.svelte.test.ts src/lib/automations/unread.server.ts
git commit -m "feat(automations): sessions list route with empty state and unread count"
```

---

## Task 7: BFF proxy + poll controller

**Files:**
- Create: `src/routes/(app)/automations/[id]/+server.ts`
- Create: `src/lib/automations/pollSession.svelte.ts`
- Test: `src/routes/(app)/automations/[id]/server.test.ts`
- Test: `src/lib/automations/pollSession.svelte.test.ts`

- [ ] **Step 1: Write the failing proxy test**

```ts
// src/routes/(app)/automations/[id]/server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (id = 's1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /automations/[id]', () => {
  it('passes through the session detail JSON', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 's1', status: 'running' }, receipt: null }), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
    expect((await res.json()).session.status).toBe('running');
  });
  it('maps a 404 to 404 and a 500 to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 404 });
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/[id]/server.test.ts"`
Expected: FAIL — cannot find `./+server`.

- [ ] **Step 3: Implement `[id]/+server.ts`**

```ts
// src/routes/(app)/automations/[id]/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load the session.');
  }
  return json(await res.json());
};
```

- [ ] **Step 4: Run the proxy test to verify it passes**

Run: `npx vitest run "src/routes/(app)/automations/[id]/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the failing poll-controller test**

```ts
// src/lib/automations/pollSession.svelte.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionPoll } from './pollSession.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function mockFetchSequence(statuses: string[]) {
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return new Response(JSON.stringify({
      session: { id: 's1', status, trigger_kind: 'manual', current_phase: 'analysis', cost_total_usd: '0.1', created_at: 'x' },
      receipt: { session_id: 's1', trigger_kind: 'manual', status, phase_transitions: [], tool_calls: [] }
    }), { status: 200 });
  }));
}

describe('createSessionPoll', () => {
  it('stops polling once the session reaches a terminal status', async () => {
    mockFetchSequence(['running', 'running', 'completed']);
    const poll = createSessionPoll('s1', { pollMs: 1000 });
    poll.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(poll.session?.status).toBe('completed');
    expect(poll.done).toBe(true);
    const callsAtStop = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(callsAtStop);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts`
Expected: FAIL — cannot find `./pollSession.svelte`.

- [ ] **Step 7: Implement `pollSession.svelte.ts`**

```ts
// src/lib/automations/pollSession.svelte.ts
import { parseReceipt, parseSessionSummary, type SessionReceipt, type SessionSummary } from './types';

const TERMINAL = new Set(['completed', 'halted', 'failed']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PollOpts {
  pollMs?: number;
}

/** Polls the BFF proxy for one session until it reaches a terminal status.
 *  Mirrors the runFlow.svelte.ts pattern (rune state + sleep loop). */
export function createSessionPoll(id: string, opts: PollOpts = {}) {
  const pollMs = opts.pollMs ?? 2000;
  let session = $state<SessionSummary | null>(null);
  let receipt = $state<SessionReceipt | null>(null);
  let done = $state(false);
  let error = $state<string | null>(null);
  let running = false;

  async function tick(): Promise<boolean> {
    const res = await fetch(`/automations/${id}`);
    if (!res.ok) {
      error = 'Lost contact with the session.';
      return true; // stop on error
    }
    const body = (await res.json()) as { session?: unknown; receipt?: unknown };
    session = parseSessionSummary(body.session);
    receipt = parseReceipt(body.receipt);
    return !!session && TERMINAL.has(session.status);
  }

  async function start() {
    if (running) return;
    running = true;
    done = false;
    error = null;
    while (running) {
      const terminal = await tick();
      if (terminal) break;
      await sleep(pollMs);
    }
    done = true;
    running = false;
  }

  function stop() {
    running = false;
  }

  return {
    get session() { return session; },
    get receipt() { return receipt; },
    get done() { return done; },
    get error() { return error; },
    start,
    stop
  };
}
```

- [ ] **Step 8: Run the controller test to verify it passes**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/automations/[id]/+server.ts" "src/routes/(app)/automations/[id]/server.test.ts" src/lib/automations/pollSession.svelte.ts src/lib/automations/pollSession.svelte.test.ts
git commit -m "feat(automations): BFF session proxy and poll-to-terminal controller"
```

---

## Task 8: Receipt detail route

**Files:**
- Create: `src/routes/(app)/automations/[id]/+page.server.ts`
- Create: `src/routes/(app)/automations/[id]/+page.svelte`
- Create: `src/lib/automations/SessionReceiptHeader.svelte`
- Create: `src/lib/automations/SessionTimeline.svelte`
- Test: `src/routes/(app)/automations/[id]/page.server.test.ts`
- Test: `src/lib/automations/SessionReceiptView.svelte.test.ts`

- [ ] **Step 1: Write the failing detail-load test**

```ts
// src/routes/(app)/automations/[id]/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
const ev = (id = 's1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/automations/[id] load', () => {
  it('returns the parsed session summary and receipt', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      session: { id: 's1', status: 'completed', trigger_kind: 'schedule', current_phase: 'delivery', cost_total_usd: '0.42', created_at: 'x' },
      receipt: { session_id: 's1', trigger_kind: 'schedule', status: 'completed', cost_total_usd: '0.42', phase_transitions: [], tool_calls: [], terminal_reason: 'completed' }
    }), { status: 200 }));
    const out = (await load(ev())) as { session: { id: string }; receipt: { terminal_reason: string } | null };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
    expect(out.session.id).toBe('s1');
    expect(out.receipt?.terminal_reason).toBe('completed');
  });
  it('passes a null receipt through (build failure) without erroring', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      session: { id: 's1', status: 'failed', trigger_kind: 'manual', current_phase: 'intake', cost_total_usd: '0', created_at: 'x', error: 'boom' },
      receipt: null
    }), { status: 200 }));
    const out = (await load(ev())) as { session: { error: string | null }; receipt: unknown };
    expect(out.receipt).toBeNull();
    expect(out.session.error).toBe('boom');
  });
  it('throws 404 for a missing/cross-user session', async () => {
    lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/[id]/page.server.test.ts"`
Expected: FAIL — cannot find `./+page.server`.

- [ ] **Step 3: Implement `[id]/+page.server.ts`**

```ts
// src/routes/(app)/automations/[id]/+page.server.ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseReceipt, parseSessionSummary } from '$lib/automations/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const res = await lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(502, 'Could not load the session.');
  }
  const body = (await res.json()) as { session?: unknown; receipt?: unknown };
  const session = parseSessionSummary(body.session);
  if (!session) throw error(502, 'Malformed session response.');
  return { session, receipt: parseReceipt(body.receipt) };
};
```

- [ ] **Step 4: Run the detail-load test to verify it passes**

Run: `npx vitest run "src/routes/(app)/automations/[id]/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Implement `SessionReceiptHeader.svelte`**

```svelte
<!-- src/lib/automations/SessionReceiptHeader.svelte -->
<script lang="ts">
  import type { SessionSummary, SessionReceipt } from './types';
  import { formatUsd, formatWhen, statusTone, terminalReasonLabel, triggerLabel } from './display';
  let { session, receipt }: { session: SessionSummary; receipt: SessionReceipt | null } = $props();
  const capLabel = $derived(session.max_cost_usd === null ? 'no cap' : `${formatUsd(session.max_cost_usd)} cap`);
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-4">
  <div class="flex flex-wrap items-center gap-2">
    <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusTone(session.status)}">{session.status}</span>
    <span class="text-sm text-mlq-text">trigger: {triggerLabel(session.trigger_kind)}</span>
    <span class="text-xs tabular-nums text-mlq-muted">{formatUsd(session.cost_total_usd)} / {capLabel}</span>
    {#if session.cost_cap_reached}<span class="text-xs text-amber-400">cost cap reached</span>{/if}
    <span class="ml-auto text-xs text-mlq-muted">{terminalReasonLabel(receipt?.terminal_reason ?? null)}</span>
  </div>
  <div class="mt-2 text-xs text-mlq-muted">
    started {formatWhen(session.created_at)} · {session.completed_at ? `finished ${formatWhen(session.completed_at)}` : 'running'}
  </div>
  {#if session.error}
    <p class="mt-2 rounded-mlq-control bg-rose-500/10 p-2 text-xs text-rose-300">Error: {session.error}</p>
  {/if}
</div>
```

- [ ] **Step 6: Implement `SessionTimeline.svelte`**

```svelte
<!-- src/lib/automations/SessionTimeline.svelte -->
<script lang="ts">
  import type { SessionReceipt } from './types';
  import { mergeTimeline } from './timeline';
  import { formatUsd, formatTime, phaseLabel, outcomeTone } from './display';
  let { receipt }: { receipt: SessionReceipt | null } = $props();
  const events = $derived(receipt ? mergeTimeline(receipt) : []);
</script>

{#if !receipt}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-6 text-center">
    <p class="text-sm font-medium text-mlq-text">Receipt unavailable</p>
    <p class="mt-1 text-xs text-mlq-muted">This session ended without a transparency receipt. The status and cost above are still accurate.</p>
  </div>
{:else if events.length === 0}
  <p class="px-1 py-4 text-xs text-mlq-muted">No activity recorded yet.</p>
{:else}
  <ol class="relative ml-2 border-l border-mlq-subtle">
    {#each events as ev, i (i)}
      <li class="relative py-2 pl-5">
        <span class="absolute -left-[5px] top-3.5 h-2.5 w-2.5 rounded-full {ev.kind === 'phase' ? 'bg-mlq-workflow' : 'bg-emerald-500'}"></span>
        {#if ev.kind === 'phase'}
          <span class="text-sm font-medium text-mlq-text">phase: {phaseLabel(ev.label)}</span>
        {:else}
          <span class="font-mono text-xs text-mlq-text">{ev.label}</span>
          {#if ev.outcome}<span class="ml-1 text-xs {outcomeTone(ev.outcome)}">{ev.outcome}</span>{/if}
          {#if ev.cost_usd !== null && ev.cost_usd > 0}<span class="ml-1 text-xs tabular-nums text-mlq-muted">{formatUsd(ev.cost_usd)}</span>{/if}
        {/if}
        {#if ev.timestamp}<span class="ml-2 text-[11px] text-mlq-muted">{formatTime(ev.timestamp)}</span>{/if}
      </li>
    {/each}
  </ol>
{/if}
```

- [ ] **Step 7: Implement `[id]/+page.svelte`**

```svelte
<!-- src/routes/(app)/automations/[id]/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import SessionReceiptHeader from '$lib/automations/SessionReceiptHeader.svelte';
  import SessionTimeline from '$lib/automations/SessionTimeline.svelte';
  import { createSessionPoll } from '$lib/automations/pollSession.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // If the session arrived still running, live-poll to terminal and swap in fresh data.
  const live = createSessionPoll(data.session.id);
  const session = $derived(live.session ?? data.session);
  const receipt = $derived(live.session ? live.receipt : data.receipt);

  onMount(() => {
    if (data.session.status === 'running') {
      live.start();
      return () => live.stop();
    }
  });
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to sessions -->
  <a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Sessions</a>
  <div class="flex flex-col gap-4">
    <SessionReceiptHeader {session} {receipt} />
    {#if session.status === 'running'}
      <p class="text-xs text-sky-400">Running — live updating…</p>
    {/if}
    <SessionTimeline {receipt} />
  </div>
</div>
```

- [ ] **Step 8: Write the receipt-view component test**

```ts
// src/lib/automations/SessionReceiptView.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionTimeline from './SessionTimeline.svelte';
import SessionReceiptHeader from './SessionReceiptHeader.svelte';
import type { SessionReceipt, SessionSummary } from './types';

const session: SessionSummary = {
  id: 's1', trigger_kind: 'schedule', current_phase: 'delivery', status: 'completed',
  halt_state: 'running', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-04T09:00:00Z', completed_at: '2026-06-04T09:04:00Z', last_activity_at: null, error: null
};
const receipt: SessionReceipt = {
  session_id: 's1', trigger_kind: 'schedule', status: 'completed', halt_state: 'running',
  current_phase: 'delivery', cost_total_usd: 0.42, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-04T09:00:00Z', completed_at: '2026-06-04T09:04:00Z',
  phase_transitions: [{ to_phase: 'intake', timestamp: '2026-06-04T09:00:00Z' }],
  tool_calls: [{ tool: 'run_playbook', outcome: 'success', timestamp: '2026-06-04T09:01:00Z', cost_usd: 0.005 }],
  terminal_reason: 'completed'
};

describe('Session receipt view', () => {
  it('header shows status, cost vs cap, and terminal reason', () => {
    render(SessionReceiptHeader, { props: { session, receipt } });
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/\$0\.42 \/ \$2\.00 cap/)).toBeInTheDocument();
  });
  it('timeline renders merged phase and tool events', () => {
    render(SessionTimeline, { props: { receipt } });
    expect(screen.getByText(/phase: intake/)).toBeInTheDocument();
    expect(screen.getByText('run_playbook')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });
  it('timeline shows the degraded state for a null receipt', () => {
    render(SessionTimeline, { props: { receipt: null } });
    expect(screen.getByText(/receipt unavailable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run this task's tests + check**

Run: `npx vitest run "src/routes/(app)/automations/[id]" src/lib/automations/SessionReceiptView.svelte.test.ts && npm run check`
Expected: PASS; check 0/0.

- [ ] **Step 10: Commit**

```bash
git add "src/routes/(app)/automations/[id]/+page.server.ts" "src/routes/(app)/automations/[id]/+page.svelte" "src/routes/(app)/automations/[id]/page.server.test.ts" src/lib/automations/SessionReceiptHeader.svelte src/lib/automations/SessionTimeline.svelte src/lib/automations/SessionReceiptView.svelte.test.ts
git commit -m "feat(automations): session receipt detail view with live poll and null/failed states"
```

---

## Task 9: Notifications inbox

**Files:**
- Create: `src/routes/(app)/automations/notifications/+page.server.ts`
- Create: `src/routes/(app)/automations/notifications/+page.svelte`
- Create: `src/lib/automations/NotificationRow.svelte`
- Create: `src/lib/automations/NotificationsInbox.svelte`
- Test: `src/routes/(app)/automations/notifications/page.server.test.ts`
- Test: `src/lib/automations/NotificationsInbox.svelte.test.ts`

- [ ] **Step 1: Write the failing load+action test**

```ts
// src/routes/(app)/automations/notifications/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

describe('/automations/notifications load', () => {
  it('reads the unread filter from the query and lists notifications', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      notifications: [{ id: 'n1', session_id: 's1', channel: 'in_app', title: 't', body: 'b', read_at: null, created_at: 'x' }],
      total_count: 1, limit: 50, offset: 0
    }), { status: 200 }));
    const ev = { url: new URL('http://x/automations/notifications?unread=true') } as never;
    const out = (await load(ev)) as { notifications: { id: string }[]; unreadOnly: boolean };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications?unread=true');
    expect(out.notifications[0].id).toBe('n1');
    expect(out.unreadOnly).toBe(true);
  });
  it('throws 502 on backend failure', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const ev = { url: new URL('http://x/automations/notifications') } as never;
    await expect(load(ev)).rejects.toMatchObject({ status: 502 });
  });
});

describe('mark-read action', () => {
  it('POSTs read for the submitted id', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const ev = { request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ id: 'n1' }) }) } as never;
    const out = await actions.markRead(ev);
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications/n1/read');
    expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'POST' });
    expect(out).toMatchObject({ success: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/notifications/page.server.test.ts"`
Expected: FAIL — cannot find `./+page.server`.

- [ ] **Step 3: Implement `notifications/+page.server.ts`**

```ts
// src/routes/(app)/automations/notifications/+page.server.ts
import { error, fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseNotificationList } from '$lib/automations/types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
  const unreadOnly = event.url.searchParams.get('unread') === 'true';
  const path = unreadOnly
    ? '/api/v1/autonomous/notifications?unread=true'
    : '/api/v1/autonomous/notifications';
  const res = await lqFetch(event, path);
  if (!res.ok) throw error(502, 'Could not load notifications.');
  const notifications = parseNotificationList(await res.json());
  return { notifications, unreadOnly };
};

export const actions: Actions = {
  markRead: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing notification id.' });
    const res = await lqFetch(event, `/api/v1/autonomous/notifications/${id}/read`, { method: 'POST' });
    if (!res.ok) return fail(502, { error: 'Could not mark as read.' });
    return { success: true };
  }
};
```

- [ ] **Step 4: Run the load+action test to verify it passes**

Run: `npx vitest run "src/routes/(app)/automations/notifications/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Implement `NotificationRow.svelte`**

```svelte
<!-- src/lib/automations/NotificationRow.svelte -->
<script lang="ts">
  import type { NotificationItem } from './types';
  import { formatWhen } from './display';
  let { notification }: { notification: NotificationItem } = $props();
  const unread = $derived(notification.read_at === null);
</script>

<div class="flex items-start gap-3 rounded-mlq-control border border-mlq-subtle p-3 {unread ? 'bg-mlq-subtle/30' : ''}">
  {#if unread}<span aria-label="unread" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mlq-workflow"></span>{/if}
  <div class="min-w-0 flex-1">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- notification → session receipt -->
    <a href="/automations/{notification.session_id}" class="text-sm font-medium text-mlq-text hover:underline">{notification.title}</a>
    <p class="truncate text-xs text-mlq-muted">{notification.body}</p>
    <span class="text-[11px] text-mlq-muted">{notification.channel} · {formatWhen(notification.created_at)}</span>
  </div>
  {#if unread}
    <form method="POST" action="?/markRead">
      <input type="hidden" name="id" value={notification.id} />
      <button type="submit" class="shrink-0 text-xs text-mlq-muted hover:text-mlq-text">Mark read</button>
    </form>
  {/if}
</div>
```

- [ ] **Step 6: Implement `NotificationsInbox.svelte`**

```svelte
<!-- src/lib/automations/NotificationsInbox.svelte -->
<script lang="ts">
  import type { NotificationItem } from './types';
  import NotificationRow from './NotificationRow.svelte';
  let { notifications, unreadOnly }: { notifications: NotificationItem[]; unreadOnly: boolean } = $props();
</script>

<div class="mb-3 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1 text-sm">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- notifications filter -->
  <a href="/automations/notifications" aria-current={!unreadOnly ? 'page' : undefined}
     class="rounded-mlq-control px-3 py-1 {!unreadOnly ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">All</a>
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- notifications filter -->
  <a href="/automations/notifications?unread=true" aria-current={unreadOnly ? 'page' : undefined}
     class="rounded-mlq-control px-3 py-1 {unreadOnly ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">Unread</a>
</div>

{#if notifications.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
    <p class="text-sm font-medium text-mlq-text">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</p>
    <p class="mt-1 text-xs text-mlq-muted">When an automation finishes, its report-back lands here.</p>
  </div>
{:else}
  <ul class="flex flex-col gap-2">
    {#each notifications as n (n.id)}
      <li><NotificationRow notification={n} /></li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 7: Implement `notifications/+page.svelte`**

```svelte
<!-- src/routes/(app)/automations/notifications/+page.svelte -->
<script lang="ts">
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import NotificationsInbox from '$lib/automations/NotificationsInbox.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const unread = $derived(data.notifications.filter((n) => n.read_at === null).length);
</script>

<svelte:head><title>Automations · Notifications — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="notifications" {unread} />
  <NotificationsInbox notifications={data.notifications} unreadOnly={data.unreadOnly} />
</div>
```

- [ ] **Step 8: Write the inbox component test**

```ts
// src/lib/automations/NotificationsInbox.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NotificationsInbox from './NotificationsInbox.svelte';
import type { NotificationItem } from './types';

const n: NotificationItem = {
  id: 'n1', session_id: 's1', channel: 'in_app', title: 'Review ready',
  body: 'Your NDA review finished', read_at: null, created_at: '2026-06-04T09:04:00Z'
};

describe('NotificationsInbox', () => {
  it('renders an unread row linking to its session receipt with a mark-read control', () => {
    render(NotificationsInbox, { props: { notifications: [n], unreadOnly: false } });
    expect(screen.getByRole('link', { name: 'Review ready' })).toHaveAttribute('href', '/automations/s1');
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
  });
  it('shows the empty state', () => {
    render(NotificationsInbox, { props: { notifications: [], unreadOnly: true } });
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run this task's tests + check**

Run: `npx vitest run "src/routes/(app)/automations/notifications" src/lib/automations/NotificationsInbox.svelte.test.ts && npm run check`
Expected: PASS; check 0/0.

- [ ] **Step 10: Commit**

```bash
git add "src/routes/(app)/automations/notifications" src/lib/automations/NotificationRow.svelte src/lib/automations/NotificationsInbox.svelte src/lib/automations/NotificationsInbox.svelte.test.ts
git commit -m "feat(automations): notifications inbox with unread filter and mark-read"
```

---

## Task 10: Unread badge live poll

Wires the `[n]` badge so it refreshes (~30 s) while the Automations area is open, beyond the SSR first-paint count.

**Files:**
- Create: `src/routes/(app)/automations/notifications/unread/+server.ts`
- Create: `src/lib/automations/unreadPoll.svelte.ts`
- Test: `src/routes/(app)/automations/notifications/unread/server.test.ts`
- Modify: `src/routes/(app)/automations/+page.svelte` and `.../notifications/+page.svelte` (consume the poll)

- [ ] **Step 1: Write the failing proxy test**

```ts
// src/routes/(app)/automations/notifications/unread/server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /automations/notifications/unread', () => {
  it('returns the unread total_count', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [], total_count: 4, limit: 1, offset: 0 }), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications?unread=true&limit=1');
    expect((await res.json()).unread).toBe(4);
  });
  it('returns 0 on backend failure (never errors)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const res = await GET(ev());
    expect((await res.json()).unread).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/notifications/unread/server.test.ts"`
Expected: FAIL — cannot find `./+server`.

- [ ] **Step 3: Implement `unread/+server.ts`**

```ts
// src/routes/(app)/automations/notifications/unread/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { unreadCount } from '$lib/automations/unread.server';

export const GET: RequestHandler = async (event) => {
  return json({ unread: await unreadCount(event) });
};
```

- [ ] **Step 4: Run the proxy test to verify it passes**

Run: `npx vitest run "src/routes/(app)/automations/notifications/unread/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Implement `unreadPoll.svelte.ts`**

```ts
// src/lib/automations/unreadPoll.svelte.ts
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Light background poll of the unread notification count. Seeds from SSR, then
 *  refreshes every ~30s while the Automations area is mounted. Best-effort. */
export function createUnreadPoll(initial: number, opts: { pollMs?: number } = {}) {
  const pollMs = opts.pollMs ?? 30_000;
  let count = $state(initial);
  let running = false;

  async function start() {
    if (running) return;
    running = true;
    while (running) {
      await sleep(pollMs);
      if (!running) break;
      try {
        const res = await fetch('/automations/notifications/unread');
        if (res.ok) {
          const body = (await res.json()) as { unread?: unknown };
          if (typeof body.unread === 'number') count = body.unread;
        }
      } catch {
        /* ignore — keep last known count */
      }
    }
  }
  function stop() { running = false; }

  return {
    get count() { return count; },
    start,
    stop
  };
}
```

- [ ] **Step 6: Consume the poll in the sessions page**

In `src/routes/(app)/automations/+page.svelte`, replace the script + `AutomationsNav` usage so the badge updates live:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import SessionList from '$lib/automations/SessionList.svelte';
  import { createUnreadPoll } from '$lib/automations/unreadPoll.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const unread = createUnreadPoll(data.unread);
  onMount(() => { unread.start(); return () => unread.stop(); });
</script>

<svelte:head><title>Automations — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="sessions" unread={unread.count} />
  <SessionList sessions={data.sessions} />
</div>
```

- [ ] **Step 7: Run + check (existing page test still passes with seeded count)**

Run: `npx vitest run "src/routes/(app)/automations/notifications/unread" "src/routes/(app)/automations/page.svelte.test.ts" && npm run check`
Expected: PASS; check 0/0. (The page test passes `unread: 0`; the poll seeds from it and only changes after a timer + fetch, which the test doesn't advance.)

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(app)/automations/notifications/unread" src/lib/automations/unreadPoll.svelte.ts "src/routes/(app)/automations/+page.svelte"
git commit -m "feat(automations): live unread-count poll for the notifications badge"
```

---

## Task 11: Whole-branch verification, review, and PR

**Files:** none (verification + handoff)

- [ ] **Step 1: Full gate**

Run:
```bash
npm run check
npx vitest run src/lib/automations "src/routes/(app)/automations" "src/routes/(app)/workflows"
npx eslint "src/lib/automations/**" "src/routes/(app)/automations/**"
```
Expected: check **0/0**; all vitest green; **no new** eslint errors (compare against `main`'s ~53 pre-existing — none should be in `src/lib/automations` or the new routes).

- [ ] **Step 2: Live e2e (rebuild donna-web)**

Run:
```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```
Then in the browser (http://localhost:13002, admin fixture): open **Workflows → Automations**; confirm the spike's session appears; open it and verify the receipt timeline (phases + tool calls), header (status/cost/terminal reason); open **Notifications**, confirm the deep-link into the session and that **Mark read** clears the unread dot and decrements the badge. For a still-running session, confirm the "Running — live updating…" state advances.

- [ ] **Step 3: Whole-branch Opus review**

Use `superpowers:requesting-code-review` for a whole-branch review (the loop has repeatedly caught real issues — `$app/forms` shadowing, stale copy, sidebar defects). Address any findings with follow-up commits, then re-run Step 1.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR. PR body should note: read-only slices A+B; pin `541bd6f` (no bump); the receipt is hand-typed (DE-330); the spike artifact; and that slices C–H are documented in the spec for follow-up.

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- §3 IA (4th segment + inner sub-nav) → Tasks 4, 5. ✔
- §4 data model (hand-typed receipt + parsers) → Task 1. ✔
- §5 data flow (SSR load, BFF proxy, rune poll) → Tasks 6, 7. ✔
- §6 Slice A (list + receipt, running/null/failed/404) → Tasks 6, 8. ✔
- §7 Slice B (inbox, filter, mark-read, badge) → Tasks 9, 10. ✔
- §8 error handling → Tasks 6–10 (502/404/null/empty all covered by tests). ✔
- §9 testing bar → every task ends with vitest + `npm run check`; Task 11 the full gate. ✔
- §11 spike as task 1 → Task 0. ✔
- §10 forward roadmap (C–H) → documentation-only in the spec; correctly **not** a build task here. ✔

**2. Placeholder scan:** No TBD/TODO; every code step shows complete file content; commands have expected output. ✔

**3. Type consistency:** `SessionSummary`, `SessionReceipt`, `NotificationItem`, `TimelineEvent` and the parsers/helpers (`parseReceipt`, `parseSessionList`, `parseNotificationList`, `mergeTimeline`, `formatUsd`, `statusTone`, `unreadCount`, `createSessionPoll`, `createUnreadPoll`) are referenced with consistent names/signatures across tasks. The detail load reads `{ session, receipt }`; the proxy returns the same; the poll controller parses both — consistent. ✔
