# Automations — Run Output Surfacing ("Results" Section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a run's actual work-product — persisted findings + the memories it proposed — as a "Results" section on the receipt page at `/automations/[id]`, live-updating while the run executes.

**Architecture:** Pin bump `fc832ca → 0097b01` (lq-ai #135) exposes `GET /sessions/{id}/findings` + `?source_session_id=` on `/memory`. A shared server helper (`runOutput.server.ts`) fetches both in parallel and parses them; the SSR `load` AND the existing poll proxy (`[id]/+server.ts`) fold the parsed result into the receipt payload, so the existing 2s live poll streams findings while a run executes with no new routes. `SessionDetail` mounts a new `RunResults` component (summary line + emission-ordered `FindingCard`s + read-only memories sub-section) between the receipt header and the timeline.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + @testing-library/svelte, Playwright live e2e, openapi-typescript codegen, vendored lq-ai submodule.

**Spec:** `docs/superpowers/specs/2026-06-05-automations-run-results-design.md`

**Branch:** `feat/automations-run-results` (already created, stacked on `feat/automations-editable-matter`).

**Upstream contract (verified against vendored source @ `0097b01`):**
- `GET /api/v1/autonomous/sessions/{id}/findings?limit=&offset=` → `{ findings: [{id, session_id, severity, title, content, created_at}], total_count, limit, offset }`. Owner-gated (404 id-probing-safe), `limit` clamped [1,200], ordered `created_at` ASC (emission order — preserve in UI). `severity` free-text (intended `info|warn|critical`; unknown → neutral badge, never crash).
- `GET /api/v1/autonomous/memory?source_session_id=&limit=` → `{ entries: [...], total_count, limit, offset }` — envelope key is **`entries`**, ordered `created_at` DESC, all states unless `?state=`. `AutonomousMemoryRead = {id, user_id, state: proposed|kept|dismissed, category, content, source_session_id?, ...}`.
- No backfill (old sessions → zero findings); findings cascade-delete with the session.

---

### Task 1: Pin bump `fc832ca → 0097b01` + `gen:api` + pin-doc + RESOLVED banner

**Files:**
- Modify: `vendor/lq-ai` (submodule pointer)
- Regenerate: `src/lib/api/backend.d.ts`
- Modify: `docs/decisions/lq-ai-pin.md` (header + one bump-log entry)
- Modify: `docs/upstream-requests/lq-ai-autonomous-run-output.md` (RESOLVED banner)

- [ ] **Step 1: Bump the submodule**

```bash
cd vendor/lq-ai && git fetch && git checkout 0097b01 && cd ../..
git -C vendor/lq-ai log --oneline -1
```

Expected: `0097b01 feat(autonomous): persist + expose run findings (work-product surfacing) (#135)`

- [ ] **Step 2: Regenerate API types and inspect the diff**

```bash
npm run gen:api
git diff --stat src/lib/api/
git diff src/lib/api/backend.d.ts | grep -E "AutonomousFinding|source_session_id" | head -20
```

Expected: additive diff — `AutonomousFindingRead` + `AutonomousFindingListResponse` schemas, the `/api/v1/autonomous/sessions/{session_id}/findings` path, and a `source_session_id` query param on `/api/v1/autonomous/memory`. `gateway.d.ts` unchanged. If fields are REMOVED, STOP and report BLOCKED.

- [ ] **Step 3: Update `docs/decisions/lq-ai-pin.md`**

Header line becomes:

```markdown
- Pinned SHA: `0097b01` (bumped 2026-06-05 from `fc832ca`)
```

Add at the TOP of the `### Bump log` section:

```markdown
- `fc832ca` → `0097b01` (2026-06-05): lq-ai **#135** (Donna ask `lq-ai-autonomous-run-output.md`) —
  **run findings persisted + readable**: new `autonomous_findings` table (cascade-delete with the
  session) + paginated, owner-gated `GET /sessions/{id}/findings` (limit clamped [1,200],
  `created_at` ASC = emission order; `severity` free-text — intended `info|warn|critical`), plus
  `?source_session_id=` on `GET /memory` ("memories this run proposed"). Precedents deliberately
  NOT session-filterable (recurrence-aggregated) — deferred upstream. `npm run gen:api` → additive
  diff (typed `AutonomousFindingRead`/`AutonomousFindingListResponse` + the new path + the query
  param). **Unblocks the run-output-surfacing slice** (this bump ships with it): the "Results"
  section on `/automations/[id]`.
```

- [ ] **Step 4: Add the RESOLVED banner to the ask doc**

In `docs/upstream-requests/lq-ai-autonomous-run-output.md`, insert immediately after the `# LQ-AI ask — …` title line:

```markdown

> **✅ RESOLVED upstream — lq-ai #135, pin `0097b01` (2026-06-05).** Ask #1 shipped as the
> `autonomous_findings` table + paginated `GET /api/v1/autonomous/sessions/{id}/findings`
> (owner-gated, `created_at` ASC, limit clamped [1,200]; `severity` free-text). Ask #2 shipped
> **scoped to memories** (`?source_session_id=` on `GET /memory`); precedents were flagged
> recurrence-aggregated (one precedent ↔ many runs) and deliberately deferred — re-scope upstream
> if "precedents this run touched" is ever needed. No backfill: pre-#135 sessions return zero
> findings. Consumed by the Donna "Results" receipt section
> (`docs/superpowers/specs/2026-06-05-automations-run-results-design.md`).
```

- [ ] **Step 5: Verify clean**

```bash
npm run check
npx vitest run --silent 2>&1 | tail -3
```

Expected: check 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless); all tests pass (~1117).

- [ ] **Step 6: Commit**

```bash
git add vendor/lq-ai src/lib/api/ docs/decisions/lq-ai-pin.md docs/upstream-requests/lq-ai-autonomous-run-output.md
git commit -m "chore(pin): bump lq-ai fc832ca -> 0097b01 (run findings readable); mark run-output ask resolved"
```

---

### Task 2: Data layer — `src/lib/automations/findings.ts`

**Files:**
- Create: `src/lib/automations/findings.ts`
- Test: `src/lib/automations/findings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automations/findings.test.ts`:

```ts
// src/lib/automations/findings.test.ts
import { describe, it, expect } from 'vitest';
import { parseFindingList, parseRunMemories, severityKind, severitySummary, type FindingItem } from './findings';

const finding = (over: Record<string, unknown> = {}) => ({
  id: 'f1', session_id: 's1', severity: 'info', title: 'Clause found', content: 'Body text', created_at: '2026-06-05T10:00:00Z', ...over
});

describe('parseFindingList', () => {
  it('parses the findings envelope + total_count', () => {
    const out = parseFindingList({ findings: [finding(), finding({ id: 'f2', severity: 'critical' })], total_count: 7, limit: 200, offset: 0 });
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toEqual({ id: 'f1', severity: 'info', title: 'Clause found', content: 'Body text', created_at: '2026-06-05T10:00:00Z' });
    expect(out.total).toBe(7);
  });
  it('drops malformed rows and tolerates missing fields', () => {
    const out = parseFindingList({ findings: [{ bad: true }, finding({ severity: null, title: null, content: null, created_at: null })], total_count: 2 });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toEqual({ id: 'f1', severity: '', title: '', content: '', created_at: null });
  });
  it('falls back to the row count when total_count is absent', () => {
    expect(parseFindingList({ findings: [finding()] }).total).toBe(1);
    expect(parseFindingList(null)).toEqual({ findings: [], total: 0 });
  });
});

describe('parseRunMemories', () => {
  it('parses the entries envelope (NOT "memories")', () => {
    const out = parseRunMemories({ entries: [{ id: 'm1', state: 'proposed', category: 'preference', content: 'Likes brevity', created_at: '2026-06-05T10:01:00Z' }], total_count: 1 });
    expect(out).toEqual([{ id: 'm1', state: 'proposed', category: 'preference', content: 'Likes brevity', created_at: '2026-06-05T10:01:00Z' }]);
  });
  it('drops malformed rows; keeps unknown states verbatim', () => {
    const out = parseRunMemories({ entries: [{ id: 'm1', state: 'weird', category: null, content: null, created_at: null }, { nope: 1 }] });
    expect(out).toEqual([{ id: 'm1', state: 'weird', category: '', content: '', created_at: null }]);
  });
  it('returns [] for a non-object', () => {
    expect(parseRunMemories('x')).toEqual([]);
  });
});

describe('severityKind', () => {
  it.each([
    ['critical', 'critical'], ['Critical', 'critical'], [' WARN ', 'warn'], ['info', 'info'],
    ['notice', 'other'], ['', 'other']
  ])('%s -> %s', (input, expected) => {
    expect(severityKind(input)).toBe(expected);
  });
});

describe('severitySummary', () => {
  const f = (severity: string): FindingItem => ({ id: severity + Math.random(), severity, title: '', content: '', created_at: null });
  it('counts kinds in fixed order, skipping zero kinds', () => {
    expect(severitySummary([f('critical'), f('critical'), f('warn'), f('info'), f('info'), f('info'), f('info')]))
      .toBe('2 critical · 1 warning · 4 info');
  });
  it('pluralizes warnings and includes other', () => {
    expect(severitySummary([f('warn'), f('warn'), f('notice')])).toBe('2 warnings · 1 other');
  });
  it('returns empty string for no findings', () => {
    expect(severitySummary([])).toBe('');
  });
});
```

(Note: `f()` uses `Math.random()` for unique ids in a TEST file — fine; the Workflow-script restriction does not apply to vitest.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/automations/findings.test.ts
```

Expected: FAIL — module `./findings` not found.

- [ ] **Step 3: Implement `src/lib/automations/findings.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/automations/findings.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/findings.ts src/lib/automations/findings.test.ts
git commit -m "feat(automations): findings/run-memories data layer (parsers + severity normalization)"
```

---

### Task 3: Server — `runOutput.server.ts` + widened receipt payload

**Files:**
- Create: `src/lib/automations/runOutput.server.ts`
- Create: `src/lib/automations/runOutput.server.test.ts`
- Modify: `src/routes/(app)/automations/[id]/+page.server.ts`
- Modify: `src/routes/(app)/automations/[id]/+server.ts`
- Test: `src/routes/(app)/automations/[id]/page.server.test.ts`, `src/routes/(app)/automations/[id]/server.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/lib/automations/runOutput.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { loadRunOutput } from './runOutput.server';
const ev = {} as never;
beforeEach(() => lqFetch.mockReset());

const findingsBody = { findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }], total_count: 1 };
const memoriesBody = { entries: [{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'y' }], total_count: 1 };

describe('loadRunOutput', () => {
  it('fetches findings + memories in parallel and returns parsed output', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1/findings?limit=200');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/autonomous/memory?source_session_id=s1&limit=200');
    expect(out.findings).toHaveLength(1);
    expect(out.findings_total).toBe(1);
    expect(out.memories).toHaveLength(1);
  });
  it('degrades a failed findings fetch to null without touching memories', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toBeNull();
    expect(out.findings_total).toBeNull();
    expect(out.memories).toHaveLength(1);
  });
  it('degrades a failed memories fetch to null without touching findings', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toHaveLength(1);
    expect(out.memories).toBeNull();
  });
  it('degrades non-JSON bodies to null', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toBeNull();
    expect(out.memories).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/lib/automations/runOutput.server.test.ts
```

Expected: FAIL — module `./runOutput.server` not found.

- [ ] **Step 3: Implement `src/lib/automations/runOutput.server.ts`**

```ts
// src/lib/automations/runOutput.server.ts
// Server-side loader for a run's work-product (findings + proposed memories),
// shared by the [id] SSR load and the [id] poll proxy. Degrades each key to
// null on failure — the receipt page must never fail because of Results.
import { lqFetch } from '$lib/server/lqClient';
import { parseFindingList, parseRunMemories, type FindingItem, type RunMemoryItem } from './findings';
import type { RequestEvent } from '@sveltejs/kit';

export interface RunOutput {
  findings: FindingItem[] | null;
  findings_total: number | null;
  memories: RunMemoryItem[] | null;
}

export async function loadRunOutput(event: RequestEvent, sessionId: string): Promise<RunOutput> {
  const [fRes, mRes] = await Promise.all([
    lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/findings?limit=200`),
    lqFetch(event, `/api/v1/autonomous/memory?source_session_id=${sessionId}&limit=200`)
  ]);
  let findings: FindingItem[] | null = null;
  let findings_total: number | null = null;
  if (fRes.ok) {
    try {
      const parsed = parseFindingList(await fRes.json());
      findings = parsed.findings;
      findings_total = parsed.total;
    } catch {
      // non-JSON body → Results unavailable
    }
  }
  let memories: RunMemoryItem[] | null = null;
  if (mRes.ok) {
    try {
      memories = parseRunMemories(await mRes.json());
    } catch {
      // non-JSON body → sub-section hidden
    }
  }
  return { findings, findings_total, memories };
}
```

(If `lqFetch`'s event parameter is typed narrower than `RequestEvent`, match whatever `optin.server.ts`/`unread.server.ts` use — they are the in-folder precedents for event-taking server helpers.)

- [ ] **Step 4: Run helper tests**

```bash
npx vitest run src/lib/automations/runOutput.server.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Write the failing route tests**

In `src/routes/(app)/automations/[id]/page.server.test.ts`, the existing 3 tests mock ONE lqFetch call. The load will now make 3 (session, findings, memories — in that call order). Add a helper at the top (after `beforeEach`) and update ALL existing tests to use it, then add the new assertions:

```ts
const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
/** Queue the findings+memories responses that follow the session response. */
function mockOutput(findingsBody: unknown = { findings: [], total_count: 0 }, memoriesBody: unknown = { entries: [], total_count: 0 }) {
  lqFetch.mockResolvedValueOnce(okJson(findingsBody)).mockResolvedValueOnce(okJson(memoriesBody));
}
```

- Test 1 (`returns the parsed session summary and receipt`): after the existing `mockResolvedValueOnce(...)` for the session, add `mockOutput();` and extend the assertions:

```ts
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/autonomous/sessions/s1/findings?limit=200');
    expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/autonomous/memory?source_session_id=s1&limit=200');
```

- Test 2 (`passes a null receipt through`): add `mockOutput();` after the session mock.
- Test 3 (`throws 404`): the load fires all three fetches before checking `res.ok`, so queue harmless extras: after the 404 session mock add `lqFetch.mockResolvedValue(new Response('x', { status: 404 }));`.
- New tests in the same describe:

```ts
  it('returns parsed findings, total, and memories', async () => {
    lqFetch.mockResolvedValueOnce(okJson({
      session: { id: 's1', status: 'completed', trigger_kind: 'manual', current_phase: 'delivery', cost_total_usd: '0', created_at: 'x' },
      receipt: null
    }));
    mockOutput(
      { findings: [{ id: 'f1', severity: 'critical', title: 'T', content: 'C', created_at: 'x' }], total_count: 5 },
      { entries: [{ id: 'm1', state: 'kept', category: 'pref', content: 'M', created_at: 'y' }] }
    );
    const out = (await load(ev())) as { findings: unknown[]; findings_total: number; memories: unknown[] };
    expect(out.findings).toHaveLength(1);
    expect(out.findings_total).toBe(5);
    expect(out.memories).toHaveLength(1);
  });
  it('degrades findings/memories failures to null without failing the page', async () => {
    lqFetch.mockResolvedValueOnce(okJson({
      session: { id: 's1', status: 'completed', trigger_kind: 'manual', current_phase: 'delivery', cost_total_usd: '0', created_at: 'x' },
      receipt: null
    }));
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const out = (await load(ev())) as { findings: null; memories: null };
    expect(out.findings).toBeNull();
    expect(out.memories).toBeNull();
  });
```

In `src/routes/(app)/automations/[id]/server.test.ts`, same treatment: existing test 1 adds two `mockResolvedValueOnce(okJson(...))` for empty output (define the same `okJson` helper) and asserts the widened body; the 404/502 test queues `lqFetch.mockResolvedValue(new Response('x', { status: 404 }));` after each error mock. Extend test 1's assertions:

```ts
    const body = await res.json();
    expect(body.session.status).toBe('running');
    expect(body.findings).toEqual([]);
    expect(body.findings_total).toBe(0);
    expect(body.memories).toEqual([]);
```

- [ ] **Step 6: Run route tests to verify they fail**

```bash
npx vitest run "src/routes/(app)/automations/[id]/page.server.test.ts" "src/routes/(app)/automations/[id]/server.test.ts"
```

Expected: new assertions FAIL (payload lacks `findings`/`memories`; only 1 upstream call made).

- [ ] **Step 7: Implement the route changes**

`src/routes/(app)/automations/[id]/+page.server.ts` becomes:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseReceipt, parseSessionSummary } from '$lib/automations/types';
import { loadRunOutput } from '$lib/automations/runOutput.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [res, output] = await Promise.all([
    lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
    loadRunOutput(event, event.params.id)
  ]);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(502, 'Could not load the session.');
  }
  const body = (await res.json()) as { session?: unknown; receipt?: unknown };
  const session = parseSessionSummary(body.session);
  if (!session) throw error(502, 'Malformed session response.');
  return { session, receipt: parseReceipt(body.receipt), ...output };
};
```

`src/routes/(app)/automations/[id]/+server.ts` becomes:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { loadRunOutput } from '$lib/automations/runOutput.server';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const [res, output] = await Promise.all([
    lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
    loadRunOutput(event, event.params.id)
  ]);
  if (!res.ok) {
    if (res.status === 404) throw error(404, 'Session not found.');
    throw error(res.status === 503 || res.status === 504 ? res.status : 502, 'Could not load the session.');
  }
  const body = (await res.json()) as Record<string, unknown>;
  return json({ ...body, ...output });
};
```

- [ ] **Step 8: Run tests + check**

```bash
npx vitest run "src/routes/(app)/automations/[id]" src/lib/automations/runOutput.server.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/automations/runOutput.server.ts src/lib/automations/runOutput.server.test.ts "src/routes/(app)/automations/[id]/+page.server.ts" "src/routes/(app)/automations/[id]/+server.ts" "src/routes/(app)/automations/[id]/page.server.test.ts" "src/routes/(app)/automations/[id]/server.test.ts"
git commit -m "feat(automations): widen receipt payload with findings + run memories (SSR + poll proxy)"
```

---

### Task 4: Poll controller — widen `pollSession.svelte.ts`

**Files:**
- Modify: `src/lib/automations/pollSession.svelte.ts`
- Test: `src/lib/automations/pollSession.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/automations/pollSession.svelte.test.ts`, the `mockFetchSequence` body lacks the new keys. Update it to include them so existing tests double as wire-shape coverage — add to the JSON object inside `mockFetchSequence`:

```ts
      findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }],
      findings_total: 1,
      memories: []
```

Then add a new test to the describe block:

```ts
  it('exposes findings, findingsTotal, and memories from the widened payload', async () => {
    mockFetchSequence(['completed']);
    const poll = createSessionPoll('s1', { pollMs: 1000 });
    poll.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(poll.findings).toHaveLength(1);
    expect(poll.findings?.[0].id).toBe('f1');
    expect(poll.findingsTotal).toBe(1);
    expect(poll.memories).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/automations/pollSession.svelte.test.ts
```

Expected: new test FAILS (`poll.findings` undefined); existing tests still pass.

- [ ] **Step 3: Implement**

In `src/lib/automations/pollSession.svelte.ts`:

Add to the imports:

```ts
import type { FindingItem, RunMemoryItem } from './findings';
```

Add state after the existing `receipt` declaration:

```ts
  let findings = $state<FindingItem[] | null>(null);
  let findingsTotal = $state<number | null>(null);
  let memories = $state<RunMemoryItem[] | null>(null);
```

In `tick()`, the body type widens and the new keys are read after `receipt = parseReceipt(body.receipt);` (the proxy already returns them parsed — this is a shape guard, not a re-parse):

```ts
    const body = (await res.json()) as {
      session?: unknown; receipt?: unknown;
      findings?: unknown; findings_total?: unknown; memories?: unknown;
    };
```

```ts
    findings = Array.isArray(body.findings) ? (body.findings as FindingItem[]) : null;
    findingsTotal = typeof body.findings_total === 'number' ? body.findings_total : null;
    memories = Array.isArray(body.memories) ? (body.memories as RunMemoryItem[]) : null;
```

Add to the returned object (after `get receipt()`):

```ts
    get findings() { return findings; },
    get findingsTotal() { return findingsTotal; },
    get memories() { return memories; },
```

- [ ] **Step 4: Run tests + check**

```bash
npx vitest run src/lib/automations/pollSession.svelte.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/pollSession.svelte.ts src/lib/automations/pollSession.svelte.test.ts
git commit -m "feat(automations): poll controller exposes findings + memories from the widened payload"
```

---

### Task 5: `FindingCard.svelte`

**Files:**
- Create: `src/lib/automations/FindingCard.svelte`
- Test: `src/lib/automations/FindingCard.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automations/FindingCard.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FindingCard from './FindingCard.svelte';
import type { FindingItem } from './findings';

const f = (over: Partial<FindingItem> = {}): FindingItem => ({
  id: 'f1', severity: 'critical', title: 'Missing indemnity cap', content: 'Line 1\nLine 2', created_at: '2026-06-05T10:00:00Z', ...over
});

describe('FindingCard', () => {
  it('renders badge, title, multi-line content, and timestamp', () => {
    render(FindingCard, { props: { finding: f() } });
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('Missing indemnity cap')).toBeInTheDocument();
    // whitespace-pre-wrap content keeps the newline in one node
    expect(screen.getByText(/Line 1\s+Line 2/)).toBeInTheDocument();
  });
  it('shows an unknown severity verbatim (lowercased, truncated) as a neutral badge', () => {
    render(FindingCard, { props: { finding: f({ severity: 'Needs-Partner-Review-Immediately-Long' }) } });
    expect(screen.getByText('needs-partner-review-immedi')).toBeInTheDocument(); // 24 chars + ellipsis-free cut
  });
  it('falls back to "note" for an empty severity', () => {
    render(FindingCard, { props: { finding: f({ severity: '' }) } });
    expect(screen.getByText('note')).toBeInTheDocument();
  });
});
```

(The truncation assertion expects the first 24 characters of `needs-partner-review-immediately-long` → `needs-partner-review-imm` is 24… count carefully when implementing: `'needs-partner-review-immediately-long'.slice(0, 24)` = `needs-partner-review-imm`. Use THAT exact string in the test, not the one above — verify with `node -e "console.log('needs-partner-review-immediately-long'.slice(0,24))"` before writing.)

- [ ] **Step 2: Run to verify they fail**

```bash
node -e "console.log('needs-partner-review-immediately-long'.slice(0,24))"
npx vitest run src/lib/automations/FindingCard.svelte.test.ts
```

Expected: prints the exact truncated string (fix the test to match); tests FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/automations/FindingCard.svelte`**

```svelte
<!-- src/lib/automations/FindingCard.svelte -->
<script lang="ts">
  import { severityKind, type FindingItem } from './findings';
  import { formatWhen } from './display';

  let { finding }: { finding: FindingItem } = $props();

  const kind = $derived(severityKind(finding.severity));
  // Free-text severity beyond the three intended values renders the raw value
  // (lowercased, truncated) on the neutral badge — never dropped, never a crash.
  const badgeLabel = $derived(
    kind === 'other' ? finding.severity.trim().toLowerCase().slice(0, 24) || 'note' : kind
  );
  const badgeClass = {
    critical: 'bg-mlq-error text-white',
    warn: 'bg-mlq-caveats text-white',
    info: 'bg-mlq-subtle text-mlq-text',
    other: 'border border-mlq-subtle text-mlq-muted'
  }[kind];
</script>

<div class="rounded-mlq-control border border-mlq-subtle p-3">
  <div class="mb-1 flex items-center gap-2">
    <span class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {badgeClass}">{badgeLabel}</span>
    <span class="min-w-0 truncate text-sm font-medium text-mlq-text">{finding.title}</span>
    <span class="ml-auto shrink-0 text-[11px] text-mlq-muted">{formatWhen(finding.created_at)}</span>
  </div>
  <p class="whitespace-pre-wrap text-sm text-mlq-text">{finding.content}</p>
</div>
```

(Token sanity: `mlq-error`/`mlq-caveats`/`mlq-subtle` follow `src/lib/playbooks/SeverityBadge.svelte` precedent — check it if a class looks off.)

- [ ] **Step 4: Run tests + check**

```bash
npx vitest run src/lib/automations/FindingCard.svelte.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/FindingCard.svelte src/lib/automations/FindingCard.svelte.test.ts
git commit -m "feat(automations): FindingCard with severity badge (free-text-safe)"
```

---

### Task 6: `RunResults.svelte`

**Files:**
- Create: `src/lib/automations/RunResults.svelte`
- Test: `src/lib/automations/RunResults.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automations/RunResults.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RunResults from './RunResults.svelte';
import type { FindingItem, RunMemoryItem } from './findings';

const f = (id: string, severity: string, title: string): FindingItem =>
  ({ id, severity, title, content: 'body', created_at: '2026-06-05T10:00:00Z' });
const m = (id: string, state: string): RunMemoryItem =>
  ({ id, state, category: 'preference', content: 'Likes brevity', created_at: '2026-06-05T10:01:00Z' });
const base = { findings: [] as FindingItem[] | null, findingsTotal: 0 as number | null, memories: [] as RunMemoryItem[] | null, running: false };

describe('RunResults', () => {
  it('renders findings in emission order with a severity summary', () => {
    render(RunResults, { props: { ...base, findings: [f('f1', 'info', 'First emitted'), f('f2', 'critical', 'Second emitted')], findingsTotal: 2 } });
    expect(screen.getByText('1 critical · 1 info')).toBeInTheDocument();
    const titles = screen.getAllByText(/emitted$/).map((el) => el.textContent);
    expect(titles).toEqual(['First emitted', 'Second emitted']); // ASC emission order — NOT severity-grouped
  });
  it('shows the overflow note when total exceeds the fetched page', () => {
    render(RunResults, { props: { ...base, findings: [f('f1', 'info', 'Only one shown')], findingsTotal: 250 } });
    expect(screen.getByText('+249 more findings not shown.')).toBeInTheDocument();
  });
  it('terminal + zero findings → recorded-none empty state', () => {
    render(RunResults, { props: { ...base } });
    expect(screen.getByText('This run recorded no findings.')).toBeInTheDocument();
  });
  it('running + zero findings → "No findings yet." and running sub-copy', () => {
    render(RunResults, { props: { ...base, running: true } });
    expect(screen.getByText('No findings yet.')).toBeInTheDocument();
    expect(screen.getByText(/still working/)).toBeInTheDocument();
  });
  it('null findings → unavailable message', () => {
    render(RunResults, { props: { ...base, findings: null, findingsTotal: null } });
    expect(screen.getByText('Results unavailable right now.')).toBeInTheDocument();
  });
  it('renders the memories sub-section with state chips only when non-empty', () => {
    const { rerender } = render(RunResults, { props: { ...base, memories: [m('m1', 'proposed'), m('m2', 'kept')] } });
    expect(screen.getByText('Memories this run proposed')).toBeInTheDocument();
    expect(screen.getByText('proposed')).toBeInTheDocument();
    expect(screen.getByText('kept')).toBeInTheDocument();
    rerender({ ...base, memories: [] });
    expect(screen.queryByText('Memories this run proposed')).toBeNull();
  });
  it('hides the memories sub-section when memories is null (fetch failed)', () => {
    render(RunResults, { props: { ...base, memories: null } });
    expect(screen.queryByText('Memories this run proposed')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/lib/automations/RunResults.svelte.test.ts
```

Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/automations/RunResults.svelte`**

```svelte
<!-- src/lib/automations/RunResults.svelte -->
<!-- The run's work-product: findings in emission order (created_at ASC — the
     run's output sequence, intentionally not severity-grouped) + the memories
     it proposed (read-only; keep/dismiss is a future slice). -->
<script lang="ts">
  import FindingCard from './FindingCard.svelte';
  import { severitySummary, type FindingItem, type RunMemoryItem } from './findings';

  let { findings, findingsTotal, memories, running }: {
    findings: FindingItem[] | null;
    findingsTotal: number | null;
    memories: RunMemoryItem[] | null;
    running: boolean;
  } = $props();

  const summary = $derived(findings && findings.length > 0 ? severitySummary(findings) : '');
  const overflow = $derived(
    findings !== null && findingsTotal !== null && findingsTotal > findings.length
      ? findingsTotal - findings.length : 0
  );
  function stateChipClass(state: string): string {
    if (state === 'proposed') return 'bg-mlq-workflow/10 text-mlq-workflow';
    if (state === 'kept') return 'bg-mlq-success/10 text-mlq-success';
    if (state === 'dismissed') return 'bg-mlq-subtle text-mlq-muted';
    return 'border border-mlq-subtle text-mlq-muted';
  }
</script>

<section aria-label="Results" class="flex flex-col gap-2">
  <div>
    <h2 class="text-sm font-medium text-mlq-strong">Results</h2>
    <p class="text-xs text-mlq-muted">{running ? 'Results so far — the run is still working.' : 'What this run produced.'}</p>
  </div>

  {#if findings === null}
    <p class="text-xs text-mlq-muted">Results unavailable right now.</p>
  {:else if findings.length === 0}
    <p class="text-xs text-mlq-muted">{running ? 'No findings yet.' : 'This run recorded no findings.'}</p>
  {:else}
    {#if summary}<p class="text-xs text-mlq-text">{summary}</p>{/if}
    <div class="flex flex-col gap-2">
      {#each findings as finding (finding.id)}
        <FindingCard {finding} />
      {/each}
    </div>
    {#if overflow > 0}
      <p class="text-xs text-mlq-muted">+{overflow} more findings not shown.</p>
    {/if}
  {/if}

  {#if memories && memories.length > 0}
    <div class="mt-2">
      <h3 class="mb-1 text-xs font-medium text-mlq-muted">Memories this run proposed</h3>
      <ul class="flex flex-col gap-1">
        {#each memories as memory (memory.id)}
          <li class="flex items-start gap-2 rounded-mlq-control border border-mlq-subtle p-2">
            <span class="shrink-0 rounded-mlq-control px-1.5 py-0.5 text-[11px] {stateChipClass(memory.state)}">{memory.state}</span>
            <div class="min-w-0">
              <span class="text-xs text-mlq-muted">{memory.category}</span>
              <p class="text-sm text-mlq-text">{memory.content}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
```

- [ ] **Step 4: Run tests + check**

```bash
npx vitest run src/lib/automations/RunResults.svelte.test.ts
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/RunResults.svelte src/lib/automations/RunResults.svelte.test.ts
git commit -m "feat(automations): RunResults section (findings + read-only run memories)"
```

---

### Task 7: Thread through `SessionDetail` + the `[id]` page

**Files:**
- Modify: `src/lib/automations/SessionDetail.svelte`
- Modify: `src/routes/(app)/automations/[id]/+page.svelte`
- Create: `src/lib/automations/SessionDetail.svelte.test.ts`
- Modify: `src/routes/(app)/automations/[id]/page.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automations/SessionDetail.svelte.test.ts` (a terminal session never starts the poll, so jsdom needs no fetch mock):

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionDetail from './SessionDetail.svelte';
import type { SessionSummary } from './types';

const session: SessionSummary = {
  id: 's1', trigger_kind: 'manual', current_phase: 'delivery', status: 'completed', halt_state: 'running',
  cost_total_usd: 0.1, max_cost_usd: 2, cost_cap_reached: false,
  created_at: '2026-06-05T09:00:00Z', completed_at: '2026-06-05T09:04:00Z', last_activity_at: null, error: null
};

describe('SessionDetail', () => {
  it('renders Results (from initial props) between the header and the timeline', () => {
    render(SessionDetail, {
      props: {
        initialSession: session, initialReceipt: null,
        initialFindings: [{ id: 'f1', severity: 'critical', title: 'Indemnity gap', content: 'C', created_at: 'x' }],
        initialFindingsTotal: 1, initialMemories: []
      }
    });
    expect(screen.getByText('Indemnity gap')).toBeInTheDocument();
    expect(screen.getByText('1 critical')).toBeInTheDocument();
    // Results section precedes the timeline in the DOM
    const results = screen.getByRole('region', { name: 'Results' });
    const timelineHeading = screen.getByText(/Timeline|timeline/);
    expect(results.compareDocumentPosition(timelineHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('terminal session with no findings shows the recorded-none state', () => {
    render(SessionDetail, {
      props: { initialSession: session, initialReceipt: null, initialFindings: [], initialFindingsTotal: 0, initialMemories: [] }
    });
    expect(screen.getByText('This run recorded no findings.')).toBeInTheDocument();
  });
});
```

(Before finalizing the DOM-order assertion, check what visible text `SessionTimeline` renders for a `null` receipt — read `src/lib/automations/SessionTimeline.svelte` and target a string that is actually there; if it renders nothing for null, pass a minimal receipt object instead, copying the shape from `SessionReceiptView.svelte.test.ts`.)

In `src/routes/(app)/automations/[id]/page.svelte.test.ts`, widen `mk()` so the page's `data` prop satisfies the new shape — add to the returned object after `receipt: null`:

```ts
  findings: [] as never[], findings_total: 0, memories: [] as never[]
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/lib/automations/SessionDetail.svelte.test.ts "src/routes/(app)/automations/[id]/page.svelte.test.ts"
```

Expected: SessionDetail tests FAIL (unknown props / no Results section). Page test may pass already (extra data keys are ignored until the page passes them) — that's fine; it locks the data shape.

- [ ] **Step 3: Implement**

`src/lib/automations/SessionDetail.svelte` becomes:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import SessionReceiptHeader from './SessionReceiptHeader.svelte';
  import SessionTimeline from './SessionTimeline.svelte';
  import RunResults from './RunResults.svelte';
  import { createSessionPoll } from './pollSession.svelte';
  import type { SessionSummary, SessionReceipt } from './types';
  import type { FindingItem, RunMemoryItem } from './findings';

  let { initialSession, initialReceipt, initialFindings, initialFindingsTotal, initialMemories }: {
    initialSession: SessionSummary;
    initialReceipt: SessionReceipt | null;
    initialFindings: FindingItem[] | null;
    initialFindingsTotal: number | null;
    initialMemories: RunMemoryItem[] | null;
  } = $props();

  // Live-poll a running session to terminal; swap in fresh data as it arrives.
  // untrack the id read so the initial-prop access isn't a reactive dependency.
  const live = createSessionPoll(untrack(() => initialSession.id));
  const session = $derived(live.session ?? initialSession);
  const receipt = $derived(live.session ? live.receipt : initialReceipt);
  const findings = $derived(live.session ? live.findings : initialFindings);
  const findingsTotal = $derived(live.session ? live.findingsTotal : initialFindingsTotal);
  const memories = $derived(live.session ? live.memories : initialMemories);

  $effect(() => {
    if (initialSession.status === 'running') {
      live.start();
      return () => live.stop();
    }
  });
</script>

<div class="flex flex-col gap-4">
  <SessionReceiptHeader {session} {receipt} />
  {#if session.status === 'running'}
    <p class="text-xs text-mlq-workflow">Running — live updating…</p>
  {/if}
  <RunResults {findings} {findingsTotal} {memories} running={session.status === 'running'} />
  <SessionTimeline {receipt} />
</div>
```

`src/routes/(app)/automations/[id]/+page.svelte` — widen the `SessionDetail` mount:

```svelte
    <SessionDetail
      initialSession={data.session}
      initialReceipt={data.receipt}
      initialFindings={data.findings}
      initialFindingsTotal={data.findings_total}
      initialMemories={data.memories}
    />
```

- [ ] **Step 4: Run tests + check**

```bash
npx vitest run src/lib/automations/ "src/routes/(app)/automations/[id]"
npm run check
```

Expected: all PASS; check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/SessionDetail.svelte src/lib/automations/SessionDetail.svelte.test.ts "src/routes/(app)/automations/[id]/+page.svelte" "src/routes/(app)/automations/[id]/page.svelte.test.ts"
git commit -m "feat(automations): mount RunResults on the receipt page (SSR + live poll threading)"
```

---

### Task 8: Live e2e + full verification

**Files:**
- Create: `tests/automations-run-results.spec.ts`

- [ ] **Step 1: Prep the dev stack**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
docker compose ps --format '{{.Name}} {{.State}}' | grep -E 'arq-worker|donna-web|api'
```

Expected: `arq-worker` and `donna-web` running (the autonomous job runs on `arq-worker`). Give `donna-web` ~30s to warm after a rebuild.

- [ ] **Step 2: Write the e2e**

Create `tests/automations-run-results.spec.ts`. Before writing, confirm two labels from the source: the run-now submit button text in `src/lib/automations/RunNowForm.svelte` (search for the submit `<button>`) and the cost-cap input's label. Template (adjust ONLY those two selectors if they differ):

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('/');
}

// A real autonomous run: run-now (cost-capped) → receipt → wait terminal →
// the Results section shows the work-product (findings or the recorded-none state).
test('run-now → receipt shows the Results section after the run completes', async ({ page }) => {
  test.setTimeout(420_000); // a real run takes minutes (intake→…→notify on arq-worker)
  await login(page);

  await page.goto('/automations/new');
  // Source: flat searchable list — pick a built-in playbook.
  await page.getByRole('button', { name: /DPA — GDPR/ }).click();
  // KB (required): dropdown trigger → search → option (substring is safe pre-selection).
  await page.getByRole('button', { name: 'Choose a knowledge base' }).click();
  await page.getByPlaceholder(/search/i).last().fill('Adopt');
  await page.getByRole('button', { name: /Adopt a Pupper/ }).last().click();
  await page.getByLabel(/cost cap/i).fill('1.00');
  await page.getByRole('button', { name: /run now/i }).click();

  // Redirects to the live receipt.
  await page.waitForURL(/\/automations\/[0-9a-f-]+$/, { timeout: 20_000 });

  // Results section exists immediately (running state).
  const results = page.getByRole('region', { name: 'Results' });
  await expect(results).toBeVisible();

  // Wait for the run to reach terminal (the live-updating line disappears).
  await expect(page.getByText('Running — live updating…')).toBeHidden({ timeout: 360_000 });

  // Terminal: Results shows findings (severity badge + title cards) or the recorded-none state.
  const hasFindings = await results.locator('text=/critical|warning|info/').first().isVisible().catch(() => false);
  if (!hasFindings) {
    await expect(results.getByText('This run recorded no findings.')).toBeVisible();
  }
  // Typical run-now proposes no memories — the sub-section stays absent.
  // (Populated rendering is unit-tested; tolerate its presence if the model did propose some.)
});
```

- [ ] **Step 3: Run the e2e**

```bash
npx playwright test tests/automations-run-results.spec.ts --reporter=line
```

Expected: 1 passed (takes minutes — a real LLM run). If it fails on a selector, fix the selector against the live DOM, not the assertion intent. If the run never reaches terminal in 6 min, check `docker compose logs arq-worker --tail 50` and report BLOCKED with the log tail.

- [ ] **Step 4: Full-suite verification**

```bash
npx vitest run --silent 2>&1 | tail -3
npm run check
npx eslint src/lib/automations/ "src/routes/(app)/automations/" tests/automations-run-results.spec.ts
```

Expected: all unit tests green; check 0/0; no eslint errors in touched paths.

- [ ] **Step 5: Commit**

```bash
git add tests/automations-run-results.spec.ts
git commit -m "test(automations): live e2e — run-now to terminal receipt with Results section"
```
