# Automations — Slice F: Schedules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing CRUD for autonomous **schedules** (cron-triggered runs) over LQ-AI's `/api/v1/autonomous/schedules` — a friendly cron input, a reusable schedule form, a list with enable/disable/delete, and an edit page, all gated on the slice-C `autonomous_enabled` opt-in.

**Architecture:** SvelteKit `(app)` routes under `/automations/schedules`. Two pure lib modules (`cron.ts`, `schedules.ts`) carry all logic and are unit-tested in isolation. Svelte components (`CronInput`, `ScheduleForm`, `ScheduleList`, `ScheduleRow`) compose the existing slice-C pickers (`SourcePicker`, `KbPicker`, `MatterPicker`) — the shipped `RunNowForm` is **not** modified. Server `load` + form actions talk to the backend via `lqFetch`; the existing `arq-worker` dispatcher fires schedules with no new service.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes (`$props`/`$state`/`$derived`/`$effect`), TypeScript, Tailwind (mlq design tokens), Vitest + `@testing-library/svelte`, `lqFetch` server client.

**Spec:** `docs/superpowers/specs/2026-06-04-automations-schedules-design.md`. **Pin:** `vendor/lq-ai` @ `541bd6f` (no bump). **Branch:** `feat/automations-schedules`.

**Key facts confirmed against the codebase:**
- Backend `AutonomousScheduleCreate` (in `vendor/lq-ai/api/app/schemas/autonomous.py`) has: `cron_expr` (req), `name?`, `playbook_id?`, `skill_ref?`, `target_kb_id?`, `project_id?`, `enabled` (default true), **`max_cost_usd?`**. `target_kb_id` is **optional** for schedules (run-now required it). Exactly one of `playbook_id`/`skill_ref`.
- `/api/v1/autonomous/schedules/{schedule_id}` exposes only **PATCH** and **DELETE** (DELETE → **200** with the soft-deleted `AutonomousScheduleRead`). **There is no GET-single** — the edit page loads the list and finds by id (404 if absent). Path param is `schedule_id`.
- List response is the envelope `AutonomousScheduleListResponse` `{ schedules[], total_count, limit, offset }`.
- Invalid `cron_expr` → **422**; missing opt-in → **403**; cross-user id → **404**.
- `max_cost_usd` is a real backend field (Pydantic `AutonomousScheduleCreate` + migration `0045` + `tests/autonomous/test_watch_schedule_max_cost_field.py`) but is **missing from the OpenAPI YAML sketch** (`vendor/lq-ai/docs/api/backend-openapi.yaml`) that `gen:api` reads — so it is **not** in the generated `AutonomousScheduleCreate` type. The schedule form posts it in an **untyped** JSON body (`buildScheduleBody` returns `Record<string, unknown>`), exactly as run-now does (`RunNowForm`'s action builds an untyped body too) — works at runtime, no generated type required. **No `gen:api` run is needed** (`backend.d.ts` already carries the schedule schemas). The doc drift is filed upstream in Task 1.
- Cron field bounds (from `vendor/lq-ai/api/app/autonomous/cron.py`): minute 0–59, hour 0–23, day-of-month 1–31, month 1–12, day-of-week 0–7; tokens support `*`, lists `1,2`, ranges `1-5`, steps `*/5`.

---

## File structure

**Create:**
- `src/lib/automations/cron.ts` — `PRESETS`, `describeCron`, `looksValid` (pure).
- `src/lib/automations/cron.test.ts`
- `src/lib/automations/schedules.ts` — `ScheduleSummary`, `parseSchedule`/`parseScheduleList`, `sourceLabel`, `buildScheduleBody` (pure).
- `src/lib/automations/schedules.test.ts`
- `src/lib/automations/CronInput.svelte` + `.svelte.test.ts`
- `src/lib/automations/ScheduleForm.svelte` + `.svelte.test.ts`
- `src/lib/automations/ScheduleList.svelte` + `.svelte.test.ts`
- `src/lib/automations/ScheduleRow.svelte` + `.svelte.test.ts`
- `src/routes/(app)/automations/schedules/+page.server.ts` + `page.server.test.ts`
- `src/routes/(app)/automations/schedules/+page.svelte` + `page.svelte.test.ts`
- `src/routes/(app)/automations/schedules/[id]/+page.server.ts` + `page.server.test.ts`
- `src/routes/(app)/automations/schedules/[id]/+page.svelte` + `page.svelte.test.ts`

**Modify:**
- `src/lib/automations/AutomationsNav.svelte` (+ `.svelte.test.ts`) — add the Schedules tab.

**Note (no codegen):** `gen:api` reads the static OpenAPI YAML sketches, which lag the backend for the schedule `max_cost_usd` field — running it would NOT add that field and is unnecessary (the schedule schemas are already in `backend.d.ts`). Task 1 instead records the drift for the upstream lq-ai fix.

---

## Task 1: File the upstream OpenAPI drift note (no codegen)

**Decision (user, 2026-06-04):** Keep the schedule cost cap, post it untyped (works at runtime), and record the OpenAPI-sketch drift for the upstream lq-ai fix. Do **not** edit vendored files or run `gen:api`.

**Files:**
- Create: `docs/superpowers/notes/2026-06-04-upstream-lq-ai-schedule-maxcost-openapi-drift.md`

- [ ] **Step 1: Confirm the drift (both sides)**

Run: `grep -n "max_cost_usd" vendor/lq-ai/api/app/schemas/autonomous.py`
Expected: present under `class AutonomousScheduleCreate` (and `AutonomousWatchCreate`).

Run: `awk '/AutonomousScheduleCreate:/,/AutonomousScheduleUpdate:/' vendor/lq-ai/docs/api/backend-openapi.yaml | grep -c max_cost_usd`
Expected: `0` — the YAML sketch omits it (drift confirmed).

- [ ] **Step 2: Write the upstream note**

```markdown
# Upstream lq-ai drift — schedule `max_cost_usd` missing from OpenAPI sketch

**Date:** 2026-06-04 · **Found during:** Donna Automations slice F (schedules).

**Drift:** `api/app/schemas/autonomous.py::AutonomousScheduleCreate` (and `AutonomousScheduleUpdate`)
expose `max_cost_usd: Decimal | None` (added by migration `0045_autonomous_per_trigger_max_cost.py`,
covered by `tests/autonomous/test_watch_schedule_max_cost_field.py`). The hand-maintained OpenAPI sketch
`docs/api/backend-openapi.yaml` does **not** list `max_cost_usd` on those two schemas — though it
correctly lists it on `AutonomousManualRunRequest` (run-now). The same likely applies to the watch
create/update schemas (verify when slice G lands).

**Impact on Donna:** `gen:api` reads the sketch, so the generated `AutonomousScheduleCreate` type lacks
the field. Donna posts `max_cost_usd` in an untyped request body, so it works at runtime; only
compile-time typing is missing.

**Upstream fix:** add `max_cost_usd: {type: string, nullable: true}` to `AutonomousScheduleCreate`,
`AutonomousScheduleUpdate` (and the watch create/update) in `docs/api/backend-openapi.yaml`, matching the
`AutonomousManualRunRequest` precedent. After the pin bumps past that fix, Donna can drop the untyped cast.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/2026-06-04-upstream-lq-ai-schedule-maxcost-openapi-drift.md
git commit -m "docs(automations): note upstream lq-ai schedule max_cost_usd OpenAPI drift"
```

---

## Task 2: `cron.ts` — presets, describe, light validation (pure, TDD)

**Files:**
- Create: `src/lib/automations/cron.ts`
- Test: `src/lib/automations/cron.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/cron.test.ts
import { describe, it, expect } from 'vitest';
import { PRESETS, describeCron, looksValid } from './cron';

describe('PRESETS', () => {
  it('exposes friendly presets that each pass looksValid', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of PRESETS) expect(looksValid(p.expr)).toBe(true);
  });
});

describe('describeCron', () => {
  it('maps an exact preset expression to its friendly label', () => {
    expect(describeCron('0 9 * * *')).toBe('Every day at 9:00');
    expect(describeCron('0 9 * * 1-5')).toBe('Every weekday at 9:00');
  });
  it('normalizes whitespace before matching', () => {
    expect(describeCron('  0   9 * * *  ')).toBe('Every day at 9:00');
  });
  it('falls back to the normalized raw string for non-presets', () => {
    expect(describeCron('15 6 1 * *')).toBe('15 6 1 * *');
  });
});

describe('looksValid', () => {
  it('accepts well-formed 5-field expressions', () => {
    expect(looksValid('0 9 * * *')).toBe(true);
    expect(looksValid('*/5 0-12 1,15 1-12 1-5')).toBe(true);
  });
  it('rejects wrong field counts', () => {
    expect(looksValid('0 9 * *')).toBe(false);
    expect(looksValid('0 9 * * * *')).toBe(false);
    expect(looksValid('')).toBe(false);
  });
  it('rejects out-of-bounds values', () => {
    expect(looksValid('60 9 * * *')).toBe(false); // minute > 59
    expect(looksValid('0 24 * * *')).toBe(false); // hour > 23
    expect(looksValid('0 9 0 * *')).toBe(false);  // day-of-month < 1
    expect(looksValid('0 9 * 13 *')).toBe(false); // month > 12
    expect(looksValid('0 9 * * 8')).toBe(false);  // day-of-week > 7
  });
  it('rejects malformed tokens and descending ranges', () => {
    expect(looksValid('a 9 * * *')).toBe(false);
    expect(looksValid('5-1 9 * * *')).toBe(false);
    expect(looksValid('*/0 9 * * *')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/cron.test.ts`
Expected: FAIL — `./cron` cannot be resolved.

- [ ] **Step 3: Implement `cron.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/cron.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/cron.ts src/lib/automations/cron.test.ts
git commit -m "feat(automations): cron presets, describeCron, looksValid"
```

---

## Task 3: `schedules.ts` — parse, source label, form body (pure, TDD)

**Files:**
- Create: `src/lib/automations/schedules.ts`
- Test: `src/lib/automations/schedules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/schedules.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchedule, parseScheduleList, sourceLabel, buildScheduleBody } from './schedules';
import type { SourceItem } from './runNow';

const raw = {
  id: 's1', name: 'Weekly summary', cron_expr: '0 9 * * 1',
  playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: 'm1',
  enabled: true, next_run_at: '2026-06-08T09:00:00Z', last_run_at: null
};

describe('parseSchedule / parseScheduleList', () => {
  it('parses a well-formed schedule', () => {
    const s = parseSchedule(raw);
    expect(s).not.toBeNull();
    expect(s!.id).toBe('s1');
    expect(s!.enabled).toBe(true);
    expect(s!.next_run_at).toBe('2026-06-08T09:00:00Z');
  });
  it('returns null when id or cron_expr is missing', () => {
    expect(parseSchedule({ id: 's1' })).toBeNull();
    expect(parseSchedule({ cron_expr: '0 9 * * *' })).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });
  it('reads the {schedules:[...]} envelope and a bare array', () => {
    expect(parseScheduleList({ schedules: [raw] })).toHaveLength(1);
    expect(parseScheduleList([raw, { bad: true }])).toHaveLength(1);
    expect(parseScheduleList({})).toEqual([]);
  });
});

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA Review' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver' }];

describe('sourceLabel', () => {
  it('resolves a playbook id to its label', () => {
    expect(sourceLabel(parseSchedule(raw)!, playbookItems, skillItems)).toBe('NDA Review');
  });
  it('resolves a skill ref to its label, falling back to the ref', () => {
    const s = parseSchedule({ ...raw, playbook_id: null, skill_ref: 'comms' })!;
    expect(sourceLabel(s, playbookItems, skillItems)).toBe('Comms Improver');
    const s2 = parseSchedule({ ...raw, playbook_id: null, skill_ref: 'unknown' })!;
    expect(sourceLabel(s2, playbookItems, skillItems)).toBe('unknown');
  });
});

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('buildScheduleBody', () => {
  it('builds a playbook body with cron + optional fields', () => {
    const out = buildScheduleBody(fd({
      source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *',
      name: 'Daily', target_kb_id: 'kb1', project_id: 'm1', max_cost_usd: '2.00', enabled: 'true'
    }));
    expect(out.ok).toBe(true);
    expect(out.ok && out.body).toEqual({
      cron_expr: '0 9 * * *', enabled: true, playbook_id: 'p1',
      name: 'Daily', target_kb_id: 'kb1', project_id: 'm1', max_cost_usd: '2.00'
    });
  });
  it('builds a skill body and honors enabled=false', () => {
    const out = buildScheduleBody(fd({ source_mode: 'skill', skill_ref: 'comms', cron_expr: '0 9 * * *', enabled: 'false' }));
    expect(out.ok && out.body).toEqual({ cron_expr: '0 9 * * *', enabled: false, skill_ref: 'comms' });
  });
  it('fails when the source or cron is missing', () => {
    expect(buildScheduleBody(fd({ source_mode: 'playbook', cron_expr: '0 9 * * *' })).ok).toBe(false);
    expect(buildScheduleBody(fd({ source_mode: 'playbook', playbook_id: 'p1' })).ok).toBe(false);
  });
  it('drops a non-numeric or negative max_cost_usd', () => {
    const out = buildScheduleBody(fd({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *', max_cost_usd: 'abc' }));
    expect(out.ok && 'max_cost_usd' in out.body).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/schedules.test.ts`
Expected: FAIL — `./schedules` cannot be resolved.

- [ ] **Step 3: Implement `schedules.ts`**

```ts
// src/lib/automations/schedules.ts
// Defensively-parsed view models + form helpers for autonomous schedules
// (lq-ai /api/v1/autonomous/schedules). Mirrors the style of types.ts.
import type { SourceItem } from './runNow';

export interface ScheduleSummary {
  id: string;
  name: string | null;
  cron_expr: string;
  playbook_id: string | null;
  skill_ref: string | null;
  target_kb_id: string | null;
  project_id: string | null;
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

/** Human label for a schedule's source, resolved against the loaded libraries. */
export function sourceLabel(s: ScheduleSummary, playbookItems: SourceItem[], skillItems: SourceItem[]): string {
  if (s.playbook_id) return playbookItems.find((i) => i.value === s.playbook_id)?.label ?? 'Playbook';
  if (s.skill_ref) return skillItems.find((i) => i.value === s.skill_ref)?.label ?? s.skill_ref;
  return '—';
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/schedules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/schedules.ts src/lib/automations/schedules.test.ts
git commit -m "feat(automations): schedule parse, sourceLabel, buildScheduleBody"
```

---

## Task 4: `CronInput.svelte` — presets + advanced + preview (TDD)

**Files:**
- Create: `src/lib/automations/CronInput.svelte`
- Test: `src/lib/automations/CronInput.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/CronInput.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import CronInput from './CronInput.svelte';

describe('CronInput', () => {
  it('shows the humanized preview for the current value', () => {
    render(CronInput, { props: { value: '0 9 * * *', onchange: () => {} } });
    expect(screen.getByText(/Every day at 9:00/)).toBeInTheDocument();
  });

  it('emits the preset expression when a preset chip is clicked', async () => {
    const onchange = vi.fn();
    render(CronInput, { props: { value: '0 9 * * *', onchange } });
    await fireEvent.click(screen.getByRole('button', { name: /Every weekday at 9:00/ }));
    expect(onchange).toHaveBeenCalledWith('0 9 * * 1-5');
  });

  it('reveals the raw cron input under Advanced and emits on input', async () => {
    const onchange = vi.fn();
    render(CronInput, { props: { value: '0 9 * * *', onchange } });
    expect(screen.queryByLabelText(/cron expression/i)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    const input = screen.getByLabelText(/cron expression/i);
    await fireEvent.input(input, { target: { value: '15 6 1 * *' } });
    expect(onchange).toHaveBeenCalledWith('15 6 1 * *');
  });

  it('renders a backend error when provided', () => {
    render(CronInput, { props: { value: 'nope', error: 'That cron expression is not valid.', onchange: () => {} } });
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/CronInput.svelte.test.ts`
Expected: FAIL — `./CronInput.svelte` cannot be resolved.

- [ ] **Step 3: Implement `CronInput.svelte`**

```svelte
<!-- src/lib/automations/CronInput.svelte -->
<script lang="ts">
  import { PRESETS, describeCron, looksValid } from './cron';

  let { value, error = null, onchange }: {
    value: string;
    error?: string | null;
    onchange: (expr: string) => void;
  } = $props();

  let advanced = $state(false);
  const norm = $derived(value.trim().replace(/\s+/g, ' '));
  const preview = $derived(describeCron(value));
  const shapeOk = $derived(looksValid(value));
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap gap-2">
    {#each PRESETS as p (p.expr)}
      <button
        type="button"
        aria-pressed={norm === p.expr}
        onclick={() => onchange(p.expr)}
        class="rounded-mlq-control border px-2.5 py-1 text-xs transition-colors {norm === p.expr
          ? 'border-mlq-workflow bg-mlq-workflow/10 text-mlq-strong'
          : 'border-mlq-subtle text-mlq-text hover:bg-mlq-subtle/50'}"
      >{p.label}</button>
    {/each}
  </div>

  <button type="button" onclick={() => (advanced = !advanced)} class="self-start text-xs text-mlq-muted hover:text-mlq-text">
    {advanced ? '▾' : '▸'} Advanced (raw cron)
  </button>

  {#if advanced}
    <input
      aria-label="Cron expression"
      {value}
      oninput={(e) => onchange((e.currentTarget as HTMLInputElement).value)}
      spellcheck="false"
      class="w-full rounded-mlq-control border bg-transparent px-2 py-1 font-mono text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow {shapeOk
        ? 'border-mlq-subtle'
        : 'border-mlq-error'}"
    />
    <div class="flex gap-4 font-mono text-[10px] text-mlq-muted">
      <span>min</span><span>hour</span><span>day</span><span>month</span><span>weekday</span>
    </div>
  {/if}

  <p class="text-xs {shapeOk ? 'text-mlq-success' : 'text-mlq-muted'}">
    {shapeOk ? `✓ ${preview}` : 'Enter a 5-field cron expression'}
  </p>
  {#if error}<p role="alert" class="text-xs text-mlq-error">{error}</p>{/if}
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/CronInput.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/CronInput.svelte src/lib/automations/CronInput.svelte.test.ts
git commit -m "feat(automations): CronInput — presets + advanced raw + preview"
```

---

## Task 5: `ScheduleForm.svelte` — composed form (TDD)

**Files:**
- Create: `src/lib/automations/ScheduleForm.svelte`
- Test: `src/lib/automations/ScheduleForm.svelte.test.ts`

**Note:** Composes the existing `SourcePicker`, `KbPicker` (`triggerLabel` prop), `MatterPicker`, plus `CronInput`. Owns all state and renders the hidden inputs the page's `<form>` submits — exactly the `RunNowForm` pattern. `target_kb_id` is **optional** here (schedules allow it null). Save is enabled when a source is chosen AND `looksValid(cronExpr)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations/ScheduleForm.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ScheduleForm from './ScheduleForm.svelte';
import type { SourceItem } from './runNow';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { MatterSummary } from '$lib/matters/types';

const playbookItems: SourceItem[] = [{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }];
const skillItems: SourceItem[] = [{ value: 'comms', label: 'Comms Improver', sub: 'builtin' }];
const kbs: KnowledgeBase[] = [{ id: 'kb1', name: 'Contracts KB', owner_id: 'u1', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
const matters: MatterSummary[] = [{ id: 'm1', name: 'Acme' }];

const base = { playbookItems, skillItems, kbs, matters };

describe('ScheduleForm', () => {
  it('enables Save only once a source is chosen and the cron is valid', async () => {
    render(ScheduleForm, { props: base });
    const save = screen.getByRole('button', { name: /save schedule/i });
    expect(save).toBeDisabled(); // default cron is valid, but no source yet
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    expect(save).not.toBeDisabled();
  });

  it('emits playbook_id + cron_expr + enabled hidden inputs', async () => {
    const { container } = render(ScheduleForm, { props: base });
    await fireEvent.click(screen.getByRole('button', { name: /NDA — Mutual/ }));
    expect((container.querySelector('input[name="playbook_id"]') as HTMLInputElement).value).toBe('p1');
    expect((container.querySelector('input[name="cron_expr"]') as HTMLInputElement).value).toBe('0 9 * * *');
    expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe('true');
    expect(container.querySelector('input[name="skill_ref"]')).toBeNull();
  });

  it('prefills from initial in edit mode (skill source) and shows the given submit label', () => {
    const { container } = render(ScheduleForm, {
      props: {
        ...base,
        submitLabel: 'Save changes',
        initial: { name: 'Weekly', cron_expr: '0 9 * * 1', playbook_id: null, skill_ref: 'comms', target_kb_id: 'kb1', project_id: null, enabled: false }
      }
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect((container.querySelector('input[name="cron_expr"]') as HTMLInputElement).value).toBe('0 9 * * 1');
    expect((container.querySelector('input[name="skill_ref"]') as HTMLInputElement).value).toBe('comms');
    expect((container.querySelector('input[name="enabled"]') as HTMLInputElement).value).toBe('false');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/ScheduleForm.svelte.test.ts`
Expected: FAIL — `./ScheduleForm.svelte` cannot be resolved.

- [ ] **Step 3: Implement `ScheduleForm.svelte`**

```svelte
<!-- src/lib/automations/ScheduleForm.svelte -->
<script lang="ts">
  import type { SourceItem, SourceMode } from './runNow';
  import type { KnowledgeBase } from '$lib/knowledge/types';
  import type { MatterSummary } from '$lib/matters/types';
  import SourcePicker from './SourcePicker.svelte';
  import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';
  import MatterPicker from '$lib/matters/MatterPicker.svelte';
  import CronInput from './CronInput.svelte';
  import { looksValid } from './cron';

  export interface ScheduleInitial {
    name: string | null;
    cron_expr: string;
    playbook_id: string | null;
    skill_ref: string | null;
    target_kb_id: string | null;
    project_id: string | null;
    enabled: boolean;
  }

  let {
    playbookItems,
    skillItems,
    kbs,
    matters,
    initial = null,
    submitLabel = 'Save schedule',
    cronError = null
  }: {
    playbookItems: SourceItem[];
    skillItems: SourceItem[];
    kbs: KnowledgeBase[];
    matters: MatterSummary[];
    initial?: ScheduleInitial | null;
    submitLabel?: string;
    cronError?: string | null;
  } = $props();

  let mode = $state<SourceMode>(initial?.skill_ref ? 'skill' : 'playbook');
  let sourceValue = $state<string | null>(initial?.skill_ref ?? initial?.playbook_id ?? null);
  let kbId = $state<string | null>(initial?.target_kb_id ?? null);
  let projectId = $state<string | null>(initial?.project_id ?? null);
  let maxCost = $state('');
  let name = $state(initial?.name ?? '');
  let cronExpr = $state(initial?.cron_expr ?? '0 9 * * *');
  let enabled = $state(initial?.enabled ?? true);

  const items = $derived(mode === 'playbook' ? playbookItems : skillItems);
  const kbName = $derived(kbs.find((k) => k.id === kbId)?.name ?? null);
  const canSave = $derived(sourceValue !== null && looksValid(cronExpr));

  function setMode(next: SourceMode) {
    if (next === mode) return;
    mode = next;
    sourceValue = null; // a source from the other mode is no longer valid
  }
</script>

<div class="flex flex-col gap-4">
  <div>
    <label for="schedule-name" class="mb-1 block text-xs font-medium text-mlq-muted">Name (optional)</label>
    <input id="schedule-name" bind:value={name} placeholder="e.g. Weekly summary"
      class="w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow" />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Run a</div>
    <div role="radiogroup" aria-label="Run a" class="inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1">
      <button type="button" role="radio" aria-checked={mode === 'playbook'} onclick={() => setMode('playbook')}
        class="rounded-mlq-control px-3 py-1 text-sm {mode === 'playbook' ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">Playbook</button>
      <button type="button" role="radio" aria-checked={mode === 'skill'} onclick={() => setMode('skill')}
        class="rounded-mlq-control px-3 py-1 text-sm {mode === 'skill' ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">Skill</button>
    </div>
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">{mode === 'playbook' ? 'Playbook' : 'Skill'}</div>
    <SourcePicker
      items={items}
      selectedValue={sourceValue}
      label={mode === 'playbook' ? 'Choose a playbook' : 'Choose a skill'}
      emptyNote={mode === 'playbook' ? 'No playbooks yet.' : 'No skills yet.'}
      onselect={(v) => (sourceValue = v)}
    />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Schedule <span class="text-mlq-error">*</span></div>
    <CronInput value={cronExpr} error={cronError} onchange={(v) => (cronExpr = v)} />
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Target knowledge base (optional)</div>
    {#if kbs.length === 0}
      <p class="text-xs text-mlq-muted">No knowledge bases yet.</p>
    {:else}
      <KbPicker {kbs} triggerLabel="Choose a knowledge base" onpick={(id) => (kbId = id)} />
      {#if kbName}<p class="mt-1 text-xs text-mlq-muted">Selected: {kbName}</p>{/if}
    {/if}
  </div>

  <div>
    <div class="mb-1 text-xs font-medium text-mlq-muted">Matter (optional)</div>
    <MatterPicker {matters} bind:selectedId={projectId} placement="down" />
  </div>

  <div>
    <label for="schedule-cost-cap" class="mb-1 block text-xs font-medium text-mlq-muted">Cost cap (optional, USD)</label>
    <input id="schedule-cost-cap" type="number" min="0" step="0.01" inputmode="decimal" bind:value={maxCost}
      placeholder="e.g. 2.00"
      class="w-32 rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow" />
  </div>

  <label class="flex items-center gap-2 text-sm text-mlq-text">
    <input type="checkbox" bind:checked={enabled} class="accent-mlq-workflow" />
    Enabled
  </label>

  <!-- Hidden fields submitted by the page's <form>. Only the active source key is present. -->
  <input type="hidden" name="source_mode" value={mode} />
  {#if mode === 'playbook' && sourceValue}<input type="hidden" name="playbook_id" value={sourceValue} />{/if}
  {#if mode === 'skill' && sourceValue}<input type="hidden" name="skill_ref" value={sourceValue} />{/if}
  <input type="hidden" name="cron_expr" value={cronExpr} />
  <input type="hidden" name="name" value={name.trim()} />
  {#if kbId}<input type="hidden" name="target_kb_id" value={kbId} />{/if}
  {#if projectId}<input type="hidden" name="project_id" value={projectId} />{/if}
  {#if maxCost.trim()}<input type="hidden" name="max_cost_usd" value={maxCost.trim()} />{/if}
  <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />

  <div>
    <button type="submit" disabled={!canSave}
      class="rounded-mlq-control bg-mlq-workflow px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow disabled:opacity-60">{submitLabel}</button>
  </div>
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/ScheduleForm.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/ScheduleForm.svelte src/lib/automations/ScheduleForm.svelte.test.ts
git commit -m "feat(automations): ScheduleForm composes pickers + cron + enabled"
```

---

## Task 6: `ScheduleRow.svelte` + `ScheduleList.svelte` (TDD)

**Files:**
- Create: `src/lib/automations/ScheduleRow.svelte`, `src/lib/automations/ScheduleList.svelte`
- Test: `src/lib/automations/ScheduleRow.svelte.test.ts`, `src/lib/automations/ScheduleList.svelte.test.ts`

**Note:** Rows carry the toggle/delete as `use:enhance` mini-forms posting to the page's `?/toggle` / `?/delete` actions. The toggle's hidden `enabled` carries the **new** value (`!current`). The empty state seeds the example use-cases from the spec.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/automations/ScheduleRow.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ScheduleRow from './ScheduleRow.svelte';
import type { ScheduleSummary } from './schedules';

const schedule: ScheduleSummary = {
  id: 's1', name: 'Weekly summary', cron_expr: '0 9 * * 1',
  playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: null,
  enabled: true, next_run_at: '2026-06-08T09:00:00Z', last_run_at: null
};

describe('ScheduleRow', () => {
  it('shows the name, humanized cadence and source, and an On toggle', () => {
    const { container } = render(ScheduleRow, { props: { schedule, sourceLabel: 'NDA Review' } });
    expect(screen.getByText('Weekly summary')).toBeInTheDocument();
    expect(screen.getByText(/Every Monday at 9:00 · NDA Review/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^on$/i })).toBeInTheDocument();
    // toggle posts the NEGATED enabled value
    expect((container.querySelector('form[action="?/toggle"] input[name="enabled"]') as HTMLInputElement).value).toBe('false');
    expect((container.querySelector('form[action="?/toggle"] input[name="id"]') as HTMLInputElement).value).toBe('s1');
  });

  it('links to the edit page and exposes a delete form', () => {
    const { container } = render(ScheduleRow, { props: { schedule: { ...schedule, enabled: false }, sourceLabel: 'NDA Review' } });
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', '/automations/schedules/s1');
    expect(container.querySelector('form[action="?/delete"] input[name="id"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
  });
});
```

```ts
// src/lib/automations/ScheduleList.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ScheduleList from './ScheduleList.svelte';
import type { ScheduleSummary } from './schedules';

const schedule: ScheduleSummary = {
  id: 's1', name: 'Weekly summary', cron_expr: '0 9 * * 1',
  playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: null,
  enabled: true, next_run_at: '2026-06-08T09:00:00Z', last_run_at: null
};

describe('ScheduleList', () => {
  it('renders an empty state with example use-cases', () => {
    render(ScheduleList, { props: { rows: [] } });
    expect(screen.getByText(/No schedules yet/)).toBeInTheDocument();
    expect(screen.getByText(/weekly summary document/i)).toBeInTheDocument();
  });

  it('renders one row per schedule', () => {
    render(ScheduleList, { props: { rows: [{ schedule, label: 'NDA Review' }] } });
    expect(screen.getByText('Weekly summary')).toBeInTheDocument();
    expect(screen.queryByText(/No schedules yet/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/automations/ScheduleRow.svelte.test.ts src/lib/automations/ScheduleList.svelte.test.ts`
Expected: FAIL — components cannot be resolved.

- [ ] **Step 3: Implement `ScheduleRow.svelte`**

```svelte
<!-- src/lib/automations/ScheduleRow.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ScheduleSummary } from './schedules';
  import { describeCron } from './cron';
  import { formatWhen } from './display';

  let { schedule, sourceLabel }: { schedule: ScheduleSummary; sourceLabel: string } = $props();
</script>

<div class="flex items-center gap-3 rounded-mlq-control border border-mlq-subtle p-3">
  <div class="min-w-0">
    <div class="truncate text-sm text-mlq-text">{schedule.name || sourceLabel}</div>
    <div class="truncate text-xs text-mlq-muted">{describeCron(schedule.cron_expr)} · {sourceLabel}</div>
  </div>

  <span class="ml-auto shrink-0 text-xs text-mlq-muted">next: {formatWhen(schedule.next_run_at)}</span>

  <form method="POST" action="?/toggle" use:enhance class="shrink-0">
    <input type="hidden" name="id" value={schedule.id} />
    <input type="hidden" name="enabled" value={schedule.enabled ? 'false' : 'true'} />
    <button type="submit" aria-pressed={schedule.enabled}
      class="rounded-full px-2 py-0.5 text-xs font-medium {schedule.enabled ? 'bg-mlq-success/15 text-mlq-success' : 'bg-mlq-subtle text-mlq-muted'}">
      {schedule.enabled ? 'On' : 'Off'}
    </button>
  </form>

  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- edit schedule link -->
  <a href="/automations/schedules/{schedule.id}" class="shrink-0 text-xs text-mlq-workflow hover:underline">Edit</a>

  <form method="POST" action="?/delete" use:enhance class="shrink-0">
    <input type="hidden" name="id" value={schedule.id} />
    <button type="submit" class="text-xs text-mlq-error hover:underline">Delete</button>
  </form>
</div>
```

- [ ] **Step 4: Implement `ScheduleList.svelte`**

```svelte
<!-- src/lib/automations/ScheduleList.svelte -->
<script lang="ts">
  import type { ScheduleSummary } from './schedules';
  import ScheduleRow from './ScheduleRow.svelte';

  let { rows }: { rows: { schedule: ScheduleSummary; label: string }[] } = $props();
</script>

{#if rows.length === 0}
  <div class="rounded-mlq-control border border-dashed border-mlq-subtle p-8 text-center">
    <p class="text-sm font-medium text-mlq-text">No schedules yet</p>
    <p class="mt-1 text-xs text-mlq-muted">
      A schedule runs a playbook or skill on a recurring cadence — handing a standing chore to Donna.
    </p>
    <ul class="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-mlq-muted">
      <li>• Drop documents into a knowledge base through the week, then generate a <strong>weekly summary document</strong> every Friday.</li>
      <li>• Regenerate a <strong>dashboard / digest document</strong> from your latest files on a cadence.</li>
      <li>• Automate any recurring “every week I have to compile X” report.</li>
    </ul>
  </div>
{:else}
  <ul class="flex flex-col gap-2">
    {#each rows as row (row.schedule.id)}
      <li><ScheduleRow schedule={row.schedule} sourceLabel={row.label} /></li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/automations/ScheduleRow.svelte.test.ts src/lib/automations/ScheduleList.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/ScheduleRow.svelte src/lib/automations/ScheduleList.svelte src/lib/automations/ScheduleRow.svelte.test.ts src/lib/automations/ScheduleList.svelte.test.ts
git commit -m "feat(automations): ScheduleList + ScheduleRow with example empty state"
```

---

## Task 7: Add the Schedules tab to `AutomationsNav` (TDD)

**Files:**
- Modify: `src/lib/automations/AutomationsNav.svelte`
- Modify: `src/lib/automations/AutomationsNav.svelte.test.ts`

- [ ] **Step 1: Add a failing test case**

Append to `src/lib/automations/AutomationsNav.svelte.test.ts`:

```ts
it('renders a Schedules tab linking to /automations/schedules, current when active', () => {
  render(AutomationsNav, { props: { active: 'schedules' } });
  const link = screen.getByRole('link', { name: /schedules/i });
  expect(link).toHaveAttribute('href', '/automations/schedules');
  expect(link).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`
Expected: FAIL — no Schedules link / `active: 'schedules'` not assignable.

- [ ] **Step 3: Modify `AutomationsNav.svelte`**

Replace the `View` type and `tabs` array:

```svelte
  type View = 'sessions' | 'schedules' | 'notifications';
  let { active, unread = 0 }: { active: View; unread?: number } = $props();

  const tabs: { id: View; label: string; href: string }[] = [
    { id: 'sessions', label: 'Sessions', href: '/automations' },
    { id: 'schedules', label: 'Schedules', href: '/automations/schedules' },
    { id: 'notifications', label: 'Notifications', href: '/automations/notifications' }
  ];
```

(The existing `{#each tabs}` markup and the notifications-only `UnreadBadge` are unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations/AutomationsNav.svelte.test.ts`
Expected: PASS (existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/AutomationsNav.svelte src/lib/automations/AutomationsNav.svelte.test.ts
git commit -m "feat(automations): add Schedules tab to AutomationsNav"
```

---

## Task 8: `/automations/schedules` route — list + inline create (TDD)

**Files:**
- Create: `src/routes/(app)/automations/schedules/+page.server.ts`
- Create: `src/routes/(app)/automations/schedules/+page.svelte`
- Test: `src/routes/(app)/automations/schedules/page.server.test.ts`
- Test: `src/routes/(app)/automations/schedules/page.svelte.test.ts`

**Note:** `load` gates on `isAutonomousEnabled`; when off it returns empty data (page shows the gate). When on, it fetches the schedules list + the same libraries as run-now + `unreadCount` (for the nav badge). Actions: `create` / `toggle` / `delete`, all via `lqFetch`. The 422 path tags the failure with `field: 'cron'` so the form routes the message into `CronInput`.

- [ ] **Step 1: Write the failing server test**

```ts
// src/routes/(app)/automations/schedules/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const formEvent = (fields: Record<string, string>) =>
  ({ request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;

describe('/automations/schedules load', () => {
  it('returns the gate-only shape when not opted in (no list fetch)', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 })); // isAutonomousEnabled
    const out = (await load({} as never)) as { autonomousEnabled: boolean; schedules: unknown[] };
    expect(out.autonomousEnabled).toBe(false);
    expect(out.schedules).toEqual([]);
    expect(lqFetch).toHaveBeenCalledTimes(1); // only the preferences probe
  });

  it('loads schedules + libraries when opted in', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })) // isAutonomousEnabled
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
      .mockResolvedValueOnce(new Response(JSON.stringify({ schedules: [{ id: 's1', cron_expr: '0 9 * * 1', playbook_id: 'p1', enabled: true }] }), { status: 200 })) // schedules
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })) // playbooks
      .mockResolvedValueOnce(new Response(JSON.stringify([{ slug: 'mine', display_name: 'Mine' }]), { status: 200 })) // user-skills
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: 'comms', title: 'Comms' }]), { status: 200 })) // builtins
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })) // kbs
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })); // matters
    const out = (await load({} as never)) as { autonomousEnabled: boolean; schedules: unknown[]; playbookItems: unknown[] };
    expect(out.autonomousEnabled).toBe(true);
    expect(out.schedules).toHaveLength(1);
    expect(out.playbookItems).toHaveLength(1);
  });
});

describe('/automations/schedules actions', () => {
  it('create POSTs a schedule body and returns created', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's9' }), { status: 201 }));
    const out = await actions.create(formEvent({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 9 * * *', enabled: 'true' }));
    expect(out).toMatchObject({ created: true });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toMatchObject({ cron_expr: '0 9 * * *', playbook_id: 'p1', enabled: true });
  });
  it('create fails 400 without a source', async () => {
    const out = await actions.create(formEvent({ source_mode: 'playbook', cron_expr: '0 9 * * *' }));
    expect(out).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });
  it('create surfaces a 422 cron error tagged for the field', async () => {
    lqFetch.mockResolvedValueOnce(new Response('bad cron', { status: 422 }));
    const out = await actions.create(formEvent({ source_mode: 'playbook', playbook_id: 'p1', cron_expr: '99 9 * * *' }));
    expect(out).toMatchObject({ status: 422, data: { field: 'cron' } });
  });
  it('toggle PATCHes the new enabled value', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's1', enabled: false }), { status: 200 }));
    const out = await actions.toggle(formEvent({ id: 's1', enabled: 'false' }));
    expect(out).toMatchObject({ toggled: true });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules/s1');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ enabled: false });
  });
  it('delete DELETEs the schedule', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's1', deleted_at: 'x' }), { status: 200 }));
    const out = await actions.delete(formEvent({ id: 's1' }));
    expect(out).toMatchObject({ deleted: true });
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });
});
```

> Note: `fail(status, data)` returns `{ status, data }` — assertions read `out.status` and `out.data`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/routes/(app)/automations/schedules/page.server.test.ts`
Expected: FAIL — `./+page.server` cannot be resolved.

- [ ] **Step 3: Implement `+page.server.ts`**

```ts
import { fail, error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { unreadCount } from '$lib/automations/unread.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseScheduleList, buildScheduleBody } from '$lib/automations/schedules';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try { return (await res.json()) as T; } catch { return fallback; }
}

export const load: PageServerLoad = async (event) => {
  const autonomousEnabled = await isAutonomousEnabled(event);
  if (!autonomousEnabled) {
    return { autonomousEnabled, unread: 0, schedules: [], playbookItems: [], skillItems: [], kbs: [], matters: [] };
  }

  const [unread, schedulesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] = await Promise.all([
    unreadCount(event),
    lqFetch(event, '/api/v1/autonomous/schedules'),
    lqFetch(event, '/api/v1/playbooks'),
    lqFetch(event, '/api/v1/user-skills?scope=user'),
    lqFetch(event, '/api/v1/skills?scope=builtin'),
    lqFetch(event, '/api/v1/knowledge-bases'),
    lqFetch(event, '/api/v1/projects')
  ]);
  if (!schedulesRes.ok) throw error(502, 'Could not load schedules.');

  const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(playbooksRes, []);
  const userSkills = (await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, []))
    .filter((s) => Boolean(s.slug));
  const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(builtinsRes, []);
  const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
  const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

  return {
    autonomousEnabled,
    unread,
    schedules: parseScheduleList(await schedulesRes.json()),
    playbookItems: toPlaybookItems(playbooks),
    skillItems: toSkillItems(userSkills, builtins),
    kbs,
    matters: matters.map((m) => ({ id: m.id, name: m.name }))
  };
};

export const actions: Actions = {
  create: async (event) => {
    const built = buildScheduleBody(await event.request.formData());
    if (!built.ok) return fail(400, { error: 'Choose a source and a schedule.' });
    const res = await lqFetch(event, '/api/v1/autonomous/schedules', { method: 'POST', body: JSON.stringify(built.body) });
    if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
    if (res.status === 422) return fail(422, { error: 'That cron expression is not valid.', field: 'cron' });
    if (!res.ok) return fail(502, { error: 'Could not save the schedule.' });
    return { created: true };
  },
  toggle: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    if (!id) return fail(400, { error: 'Missing schedule id.' });
    const res = await lqFetch(event, `/api/v1/autonomous/schedules/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) return fail(res.status === 403 ? 403 : 502, { error: 'Could not update the schedule.' });
    return { toggled: true };
  },
  delete: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing schedule id.' });
    const res = await lqFetch(event, `/api/v1/autonomous/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) return fail(res.status === 403 ? 403 : 502, { error: 'Could not delete the schedule.' });
    return { deleted: true };
  }
};
```

- [ ] **Step 4: Run to verify the server test passes**

Run: `npx vitest run src/routes/(app)/automations/schedules/page.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

```ts
// src/routes/(app)/automations/schedules/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const libs = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/schedules page', () => {
  it('shows the opt-in gate when autonomous is off', () => {
    render(Page, { props: { data: { autonomousEnabled: false, unread: 0, schedules: [], ...libs }, form: null } });
    expect(screen.getByText(/Automations are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new schedule/i })).toBeNull();
  });

  it('shows the New schedule control and the list when opted in', () => {
    const schedule = { id: 's1', name: 'Weekly', cron_expr: '0 9 * * 1', playbook_id: 'p1', skill_ref: null, target_kb_id: null, project_id: null, enabled: true, next_run_at: null, last_run_at: null };
    render(Page, { props: { data: { autonomousEnabled: true, unread: 0, schedules: [schedule], playbookItems: [{ value: 'p1', label: 'NDA' }], skillItems: [], kbs: [], matters: [] }, form: null } });
    expect(screen.getByRole('button', { name: /new schedule/i })).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/routes/(app)/automations/schedules/page.svelte.test.ts`
Expected: FAIL — `./+page.svelte` cannot be resolved.

- [ ] **Step 7: Implement `+page.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import AutomationsGate from '$lib/automations/AutomationsGate.svelte';
  import ScheduleForm from '$lib/automations/ScheduleForm.svelte';
  import ScheduleList from '$lib/automations/ScheduleList.svelte';
  import { sourceLabel } from '$lib/automations/schedules';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showForm = $state(false);
  $effect(() => {
    if (form?.created) showForm = false;
  });

  const rows = $derived(
    data.schedules.map((s) => ({ schedule: s, label: sourceLabel(s, data.playbookItems, data.skillItems) }))
  );
</script>

<svelte:head><title>Schedules — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="schedules" unread={data.unread} />

  {#if !data.autonomousEnabled}
    <AutomationsGate />
  {:else}
    <div class="mb-3">
      <button type="button" onclick={() => (showForm = !showForm)}
        class="rounded-mlq-control bg-mlq-workflow px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mlq-workflow">
        {showForm ? 'Cancel' : 'New schedule'}
      </button>
    </div>

    {#if showForm}
      {#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
      <form method="POST" action="?/create" use:enhance class="mb-6 rounded-mlq-control border border-mlq-subtle p-4">
        <ScheduleForm
          playbookItems={data.playbookItems}
          skillItems={data.skillItems}
          kbs={data.kbs}
          matters={data.matters}
          cronError={form?.field === 'cron' ? form.error : null}
        />
      </form>
    {/if}

    <ScheduleList {rows} />
  {/if}
</div>
```

- [ ] **Step 8: Run to verify the page test passes**

Run: `npx vitest run src/routes/(app)/automations/schedules/page.svelte.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/automations/schedules/+page.server.ts" "src/routes/(app)/automations/schedules/+page.svelte" "src/routes/(app)/automations/schedules/page.server.test.ts" "src/routes/(app)/automations/schedules/page.svelte.test.ts"
git commit -m "feat(automations): /automations/schedules list + inline create"
```

---

## Task 9: `/automations/schedules/[id]` — edit page (TDD)

**Files:**
- Create: `src/routes/(app)/automations/schedules/[id]/+page.server.ts`
- Create: `src/routes/(app)/automations/schedules/[id]/+page.svelte`
- Test: `src/routes/(app)/automations/schedules/[id]/page.server.test.ts`
- Test: `src/routes/(app)/automations/schedules/[id]/page.svelte.test.ts`

**Note:** No GET-single endpoint exists — `load` fetches the list and finds by `event.params.id` (404 if absent). `update` PATCHes; on success redirect to `/automations/schedules`; 422 tags `field: 'cron'`.

- [ ] **Step 1: Write the failing server test**

```ts
// src/routes/(app)/automations/schedules/[id]/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const ev = (id: string, fields?: Record<string, string>) =>
  ({
    params: { id },
    request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields ?? {}) })
  }) as never;

const sched = { id: 's1', cron_expr: '0 9 * * 1', playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: null, enabled: true, name: 'Weekly', next_run_at: null, last_run_at: null };

function loadMocks(found: boolean) {
  lqFetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })) // isAutonomousEnabled
    .mockResolvedValueOnce(new Response(JSON.stringify({ schedules: found ? [sched] : [] }), { status: 200 })) // schedules
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })) // playbooks
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // user-skills
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // builtins
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })) // kbs
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters
}

describe('/automations/schedules/[id] load', () => {
  it('finds the schedule by id', async () => {
    loadMocks(true);
    const out = (await load(ev('s1'))) as { schedule: { id: string } };
    expect(out.schedule.id).toBe('s1');
  });
  it('throws 404 when the id is not in the list', async () => {
    loadMocks(false);
    await expect(load(ev('missing'))).rejects.toMatchObject({ status: 404 });
  });
  it('throws 403 when not opted in', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 }));
    await expect(load(ev('s1'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('/automations/schedules/[id] update', () => {
  it('PATCHes and redirects to the list', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 's1' }), { status: 200 }));
    await expect(actions.update(ev('s1', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '0 8 * * *', enabled: 'true' })))
      .rejects.toMatchObject({ status: 303, location: '/automations/schedules' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/schedules/s1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
  });
  it('surfaces a 422 cron error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('bad', { status: 422 }));
    const out = await actions.update(ev('s1', { source_mode: 'playbook', playbook_id: 'p1', cron_expr: '99 9 * * *' }));
    expect(out).toMatchObject({ status: 422, data: { field: 'cron' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/schedules/[id]/page.server.test.ts"`
Expected: FAIL — `./+page.server` cannot be resolved.

- [ ] **Step 3: Implement `[id]/+page.server.ts`**

```ts
import { fail, error, redirect } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { isAutonomousEnabled } from '$lib/automations/optin.server';
import { toPlaybookItems, toSkillItems } from '$lib/automations/runNow';
import { parseScheduleList, buildScheduleBody } from '$lib/automations/schedules';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad, Actions } from './$types';

async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try { return (await res.json()) as T; } catch { return fallback; }
}

export const load: PageServerLoad = async (event) => {
  if (!(await isAutonomousEnabled(event))) throw error(403, 'Automations are turned off.');

  const [schedulesRes, playbooksRes, userSkillsRes, builtinsRes, kbsRes, mattersRes] = await Promise.all([
    lqFetch(event, '/api/v1/autonomous/schedules'),
    lqFetch(event, '/api/v1/playbooks'),
    lqFetch(event, '/api/v1/user-skills?scope=user'),
    lqFetch(event, '/api/v1/skills?scope=builtin'),
    lqFetch(event, '/api/v1/knowledge-bases'),
    lqFetch(event, '/api/v1/projects')
  ]);
  if (!schedulesRes.ok) throw error(502, 'Could not load schedules.');

  const schedule = parseScheduleList(await schedulesRes.json()).find((s) => s.id === event.params.id);
  if (!schedule) throw error(404, 'Schedule not found.');

  const playbooks = await jsonOr<{ id: string; name: string; contract_type?: string }[]>(playbooksRes, []);
  const userSkills = (await jsonOr<{ slug: string; display_name: string; description?: string }[]>(userSkillsRes, []))
    .filter((s) => Boolean(s.slug));
  const builtins = await jsonOr<{ name: string; title: string; description?: string }[]>(builtinsRes, []);
  const kbs = await jsonOr<KnowledgeBase[]>(kbsRes, []);
  const matters = await jsonOr<{ id: string; name: string }[]>(mattersRes, []);

  return {
    schedule,
    playbookItems: toPlaybookItems(playbooks),
    skillItems: toSkillItems(userSkills, builtins),
    kbs,
    matters: matters.map((m) => ({ id: m.id, name: m.name }))
  };
};

export const actions: Actions = {
  update: async (event) => {
    const built = buildScheduleBody(await event.request.formData());
    if (!built.ok) return fail(400, { error: 'Choose a source and a schedule.' });
    const res = await lqFetch(event, `/api/v1/autonomous/schedules/${event.params.id}`, { method: 'PATCH', body: JSON.stringify(built.body) });
    if (res.status === 403) return fail(403, { error: 'Automations are turned off.' });
    if (res.status === 404) return fail(404, { error: 'Schedule not found.' });
    if (res.status === 422) return fail(422, { error: 'That cron expression is not valid.', field: 'cron' });
    if (!res.ok) return fail(502, { error: 'Could not save the schedule.' });
    throw redirect(303, '/automations/schedules');
  }
};
```

- [ ] **Step 4: Run to verify the server test passes**

Run: `npx vitest run "src/routes/(app)/automations/schedules/[id]/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

```ts
// src/routes/(app)/automations/schedules/[id]/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const schedule = { id: 's1', name: 'Weekly', cron_expr: '0 9 * * 1', playbook_id: 'p1', skill_ref: null, target_kb_id: 'kb1', project_id: null, enabled: true, next_run_at: null, last_run_at: null };

describe('/automations/schedules/[id] page', () => {
  it('renders the edit form with a Save changes button', () => {
    render(Page, { props: { data: { schedule, playbookItems: [{ value: 'p1', label: 'NDA' }], skillItems: [], kbs: [], matters: [] }, form: null } });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run "src/routes/(app)/automations/schedules/[id]/page.svelte.test.ts"`
Expected: FAIL — `./+page.svelte` cannot be resolved.

- [ ] **Step 7: Implement `[id]/+page.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
  import AutomationsNav from '$lib/automations/AutomationsNav.svelte';
  import ScheduleForm from '$lib/automations/ScheduleForm.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const initial = $derived({
    name: data.schedule.name,
    cron_expr: data.schedule.cron_expr,
    playbook_id: data.schedule.playbook_id,
    skill_ref: data.schedule.skill_ref,
    target_kb_id: data.schedule.target_kb_id,
    project_id: data.schedule.project_id,
    enabled: data.schedule.enabled
  });
</script>

<svelte:head><title>Edit schedule — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active="automations" />
  <AutomationsNav active="schedules" />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back link to schedules -->
  <a href="/automations/schedules" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text">← Schedules</a>

  <h2 class="mb-3 text-lg font-medium text-mlq-text">Edit schedule</h2>
  {#if form?.error}<p role="alert" class="mb-3 text-sm text-mlq-error">{form.error}</p>{/if}
  <form method="POST" action="?/update" use:enhance>
    <ScheduleForm
      playbookItems={data.playbookItems}
      skillItems={data.skillItems}
      kbs={data.kbs}
      matters={data.matters}
      {initial}
      submitLabel="Save changes"
      cronError={form?.field === 'cron' ? form.error : null}
    />
  </form>
</div>
```

- [ ] **Step 8: Run to verify the page test passes**

Run: `npx vitest run "src/routes/(app)/automations/schedules/[id]/page.svelte.test.ts"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/automations/schedules/[id]"
git commit -m "feat(automations): /automations/schedules/[id] edit page"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck — the gate**

Run: `npm run check`
Expected: **0 errors, 0 warnings** (vendor `ERR_MODULE_NOT_FOUND` on stderr is harmless).

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all green (new schedule tests included; ~1000+ pass).

- [ ] **Step 3: Lint — no new errors**

Run: `npx eslint src/lib/automations src/routes/\(app\)/automations`
Expected: no **new** errors vs `main`. Internal `<a href>` links must carry `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` directly above the `href` line (already in `ScheduleRow` and the edit/back links).

- [ ] **Step 4: Manual smoke (dev stack)**

Cold start per the spec/handoff, then:
```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker arq-worker
```
Rebuild `donna-web` if FE changed. Then at http://localhost:13002 (admin `admin@lq.ai` / `$DONNA_E2E_PASSWORD`):
1. With automations **off**, visit `/automations/schedules` → opt-in gate shows.
2. Enable automations on `/settings/preferences`, return → "New schedule" appears.
3. Create with a **preset** (e.g. "Every weekday at 9:00") + a playbook → row shows the humanized cadence + `next:` time; it appears in the list.
4. Open **Advanced**, type an invalid cron (e.g. `99 9 * * *`) and save → inline 422 message under the cron input; valid expressions save.
5. Toggle a row **On/Off** (PATCH) and **Delete** (row disappears).
6. **Edit** a row → form prefilled; change the time → saves and redirects to the list.

- [ ] **Step 5: Sync the plan + push**

If any review/manual step changed the executed code, reflect it in this plan and the spec. Then the branch is ready for the whole-branch Opus review → `finishing-a-development-branch` → PR (per `[[donna-workflow]]`).

```bash
git push -u origin feat/automations-schedules
```

---

## Self-review notes (coverage vs spec)
- **Backend contract / OpenAPI drift filed** → Task 1 (no codegen; cost cap posted untyped). **Gate (403) / opt-in reuse** → Tasks 8–9 (`isAutonomousEnabled`, `AutomationsGate`). **List envelope** → `parseScheduleList` (Task 3). **`max_cost_usd` kept (untyped body)** → `buildScheduleBody` + form cost field (Tasks 3, 5).
- **IA: Schedules tab** → Task 7. **Routes: list+inline create, `[id]` edit** → Tasks 8–9.
- **Cron input (presets + advanced + preview + 422)** → Task 4; **`cron.ts` unit** → Task 2; **cadence preset-reverse-map + raw fallback** → `describeCron` (Task 2), used in rows (Task 6).
- **Reuse without refactoring RunNowForm** → `ScheduleForm` composes `SourcePicker`/`KbPicker`/`MatterPicker` directly (Task 5).
- **Example use-cases copy (weekly summary / dashboard / admin chore; markdown-doc framing)** → `ScheduleList` empty state (Task 6); slide-deck deferred to docs-polish.
- **Error mapping 422/403/404** → Tasks 8–9 actions. **Tests across units/components/actions** → every task. **Quality bar (check 0/0, vitest, lint)** → Task 10.
