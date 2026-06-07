# P6 Tabular Reviews — Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core tabular-review vertical — build a review (pick documents + define ad-hoc columns), preview & confirm cost, run it asynchronously (with cancel), see a cited compact-spreadsheet grid, and export it to xlsx/csv.

**Architecture:** A `/tabular` **builder page** (SSR `load` for matters/matter-files; client state via two rune controllers — `createTabularBuilder` for docs+columns, `createTabularUploads` for upload→poll-to-`document_id`) calls thin BFF proxies (`/tabular/preview-cost`, `/tabular/execute`, and execution-scoped `/tabular-executions/[id]{,/cancel,/export}`) that forward to the lq-ai backend via `lqFetch`. Run → preview-cost → confirm modal → execute → `goto('/tabular/<id>')`. The **run page** SSR-loads the execution by id and a `createRunPoll` controller polls to terminal, then renders `TabularGrid` + export.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind (`mlq-*` tokens), Vitest + @testing-library/svelte (fake timers for polling), Playwright. Reuses `lqFetch` (`$lib/server/lqClient`), `Dropzone` (`$lib/matters/files/Dropzone.svelte`), `MatterPicker` (`$lib/matters/MatterPicker.svelte`), `statusBadge` (`$lib/matters/files/uploadFile`), and the generated `$lib/api/backend` contract.

**Reference:** Spec `docs/superpowers/specs/2026-06-02-donna-p6-tabular-slice-a-design.md`. Backend doc `vendor/lq-ai/docs/tabular-review.md`.

---

## File Structure

**New — `src/lib/tabular/`:**

- `types.ts` — backend re-exports + hand-typed `m3-c2-v1` grid + `SelectedDoc`/`ColumnDraft` + `parseTabularResults`.
- `tabularBuilder.svelte.ts` (+ `.test.ts`) — docs+columns state controller (no I/O).
- `tabularUploads.svelte.ts` (+ `.test.ts`) — upload→poll-until-`document_id` controller.
- `runPoll.svelte.ts` (+ `.test.ts`) — execution poll controller (2 s, visibility-paused, 5-min stuck).
- `ColumnBuilder.svelte` (+ `.test.ts`) — name+query rows.
- `DocumentMultiPicker.svelte` (+ `.test.ts`) — matter-tab checkboxes + upload-tab Dropzone + chips.
- `CostPreviewModal.svelte` (+ `.test.ts`) — confirm dialog.
- `TabularGrid.svelte` (+ `.test.ts`) — compact spreadsheet.
- `CellDetail.svelte` (+ `.test.ts`) — click-cell detail panel.
- `ExportMenu.svelte` (+ `.test.ts`) — Export ▾ xlsx/csv.

**New — routes:**

- `src/routes/(app)/tabular/preview-cost/+server.ts` (+ `server.test.ts`) — POST proxy.
- `src/routes/(app)/tabular/execute/+server.ts` (+ `server.test.ts`) — POST proxy.
- `src/routes/(app)/tabular-executions/[id]/+server.ts` (+ `server.test.ts`) — GET poll proxy.
- `src/routes/(app)/tabular-executions/[id]/cancel/+server.ts` (+ `server.test.ts`) — POST proxy.
- `src/routes/(app)/tabular-executions/[id]/export/+server.ts` (+ `server.test.ts`) — GET binary proxy.
- `src/routes/(app)/tabular/+page.server.ts` (+ `page.server.test.ts`) — builder load (matters + `?matter=` files).
- `src/routes/(app)/tabular/+page.svelte` — builder page (REPLACES the stub).
- `src/routes/(app)/tabular/[executionId]/+page.server.ts` (+ `page.server.test.ts`) — run-page load.
- `src/routes/(app)/tabular/[executionId]/+page.svelte` — run/results page.

**New — e2e:** `tests/tabular-review.spec.ts`.

**Unchanged:** the sidebar already has a `/tabular` entry (`src/lib/components/Sidebar.svelte`) — do not touch it.

---

## Task 1: Types + `parseTabularResults`

**Files:**

- Create: `src/lib/tabular/types.ts`
- Test: `src/lib/tabular/types.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/tabular/types.ts`:

```ts
import type { components } from '$lib/api/backend';

/** Ad-hoc column spec sent to the backend (name + query; advanced fields deferred to Slice C). */
export type ColumnSpec = components['schemas']['ColumnSpec'];
export type TabularExecution = components['schemas']['TabularExecution'];
export type TabularExecutionCreate = components['schemas']['TabularExecutionCreate'];
export type TabularPreviewCostRequest = components['schemas']['TabularPreviewCostRequest'];
export type TabularPreviewCostResponse = components['schemas']['TabularPreviewCostResponse'];

/** Terminal execution statuses (no more polling once reached). */
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export type ExecutionStatus = TabularExecution['status'];

export function isTerminal(status: ExecutionStatus): boolean {
	return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Per-cell confidence from the m3-c2-v1 results grid. */
export type CellConfidence = 'high' | 'medium' | 'low' | 'failed';

export interface TabularCell {
	value: string;
	cited_chunk_ids: string[];
	confidence: CellConfidence;
	error?: string | null;
}

export interface TabularRow {
	document_id: string;
	document_name: string;
	cells: Record<string, TabularCell>;
}

export interface TabularResults {
	schema_version: string;
	rows: TabularRow[];
	summary: { total_cells: number; failed_cells: number };
}

/** A document selected as a grid row (resolved to its parsed-content document_id). */
export interface SelectedDoc {
	document_id: string;
	name: string;
}

/** An in-progress ad-hoc column in the builder. */
export interface ColumnDraft {
	id: string;
	name: string;
	query: string;
}

/**
 * Narrow the loosely-typed `TabularExecution.results` ({ [k]: unknown }) into a
 * typed grid, or null if the payload is missing/malformed. Tolerant: filters out
 * non-object rows and coerces missing cell fields to safe defaults.
 */
export function parseTabularResults(raw: unknown): TabularResults | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (!Array.isArray(r.rows)) return null;
	const rows: TabularRow[] = [];
	for (const row of r.rows) {
		if (!row || typeof row !== 'object') continue;
		const ro = row as Record<string, unknown>;
		if (typeof ro.document_id !== 'string') continue;
		const cellsIn =
			ro.cells && typeof ro.cells === 'object' ? (ro.cells as Record<string, unknown>) : {};
		const cells: Record<string, TabularCell> = {};
		for (const [col, c] of Object.entries(cellsIn)) {
			const co = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
			const confidence = (
				['high', 'medium', 'low', 'failed'].includes(co.confidence as string)
					? (co.confidence as CellConfidence)
					: 'failed'
			) as CellConfidence;
			cells[col] = {
				value: typeof co.value === 'string' ? co.value : '',
				cited_chunk_ids: Array.isArray(co.cited_chunk_ids)
					? co.cited_chunk_ids.filter((x): x is string => typeof x === 'string')
					: [],
				confidence,
				error: typeof co.error === 'string' ? co.error : null
			};
		}
		rows.push({
			document_id: ro.document_id,
			document_name: typeof ro.document_name === 'string' ? ro.document_name : ro.document_id,
			cells
		});
	}
	const summaryIn = (r.summary && typeof r.summary === 'object' ? r.summary : {}) as Record<
		string,
		unknown
	>;
	return {
		schema_version: typeof r.schema_version === 'string' ? r.schema_version : '',
		rows,
		summary: {
			total_cells: typeof summaryIn.total_cells === 'number' ? summaryIn.total_cells : 0,
			failed_cells: typeof summaryIn.failed_cells === 'number' ? summaryIn.failed_cells : 0
		}
	};
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/tabular/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTabularResults, isTerminal } from './types';

describe('isTerminal', () => {
	it('is true for completed/failed/cancelled and false otherwise', () => {
		expect(isTerminal('completed')).toBe(true);
		expect(isTerminal('failed')).toBe(true);
		expect(isTerminal('cancelled')).toBe(true);
		expect(isTerminal('running')).toBe(false);
		expect(isTerminal('pending')).toBe(false);
	});
});

describe('parseTabularResults', () => {
	it('returns null for null/non-object/missing rows', () => {
		expect(parseTabularResults(null)).toBeNull();
		expect(parseTabularResults('x')).toBeNull();
		expect(parseTabularResults({})).toBeNull();
	});

	it('parses a well-formed grid', () => {
		const out = parseTabularResults({
			schema_version: 'm3-c2-v1',
			rows: [
				{
					document_id: 'd1',
					document_name: 'a.pdf',
					cells: {
						Term: {
							value: '3 years',
							cited_chunk_ids: ['c1', 'c2'],
							confidence: 'high',
							error: null
						}
					}
				}
			],
			summary: { total_cells: 1, failed_cells: 0 }
		});
		expect(out?.rows[0].document_name).toBe('a.pdf');
		expect(out?.rows[0].cells.Term.value).toBe('3 years');
		expect(out?.rows[0].cells.Term.cited_chunk_ids).toEqual(['c1', 'c2']);
		expect(out?.summary).toEqual({ total_cells: 1, failed_cells: 0 });
	});

	it('coerces malformed cells and defaults document_name to the id', () => {
		const out = parseTabularResults({
			rows: [{ document_id: 'd2', cells: { Col: { confidence: 'nope' } } }]
		});
		expect(out?.rows[0].document_name).toBe('d2');
		expect(out?.rows[0].cells.Col.value).toBe('');
		expect(out?.rows[0].cells.Col.cited_chunk_ids).toEqual([]);
		expect(out?.rows[0].cells.Col.confidence).toBe('failed');
		expect(out?.summary).toEqual({ total_cells: 0, failed_cells: 0 });
	});

	it('drops rows without a string document_id', () => {
		const out = parseTabularResults({ rows: [{ cells: {} }, { document_id: 'ok', cells: {} }] });
		expect(out?.rows.length).toBe(1);
		expect(out?.rows[0].document_id).toBe('ok');
	});
});
```

- [ ] **Step 3: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/types.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Run to verify PASS** (types.ts written in Step 1)

Run: `npx vitest run src/lib/tabular/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr harmless). No `any`/`!`.

```bash
git add src/lib/tabular/types.ts src/lib/tabular/types.test.ts
git commit -m "feat(tabular): types + parseTabularResults grid narrowing"
```

---

## Task 2: Verb BFF proxies (`preview-cost`, `execute`)

**Files:**

- Create: `src/routes/(app)/tabular/preview-cost/+server.ts`
- Create: `src/routes/(app)/tabular/execute/+server.ts`
- Test: `src/routes/(app)/tabular/preview-cost/server.test.ts`
- Test: `src/routes/(app)/tabular/execute/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/routes/(app)/tabular/preview-cost/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		request: new Request('http://x/tabular/preview-cost', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('POST /tabular/preview-cost', () => {
	it('forwards the body and returns the backend JSON', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					cells_count: 6,
					estimated_tokens: 1200,
					estimated_cost_usd: '0.12',
					per_tier_breakdown: { default: 6 }
				}),
				{ status: 200 }
			)
		);
		const res = await POST(
			event({ document_ids: ['d1'], columns: [{ name: 'Term', query: 'q' }] })
		);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/preview-cost');
		expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('POST');
		const json = await res.json();
		expect(json.cells_count).toBe(6);
	});

	it('maps a backend 500 to 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(POST(event({ document_ids: [], columns: [] }))).rejects.toMatchObject({
			status: 502
		});
	});

	it('passes through 503', async () => {
		lqFetch.mockResolvedValue(new Response('down', { status: 503 }));
		await expect(POST(event({ document_ids: [], columns: [] }))).rejects.toMatchObject({
			status: 503
		});
	});
});
```

Create `src/routes/(app)/tabular/execute/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		request: new Request('http://x/tabular/execute', { method: 'POST', body: JSON.stringify(body) })
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('POST /tabular/execute', () => {
	it('forwards the body and returns the created execution', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: 'ex1', status: 'pending' }), { status: 202 })
		);
		const res = await POST(
			event({
				document_ids: ['d1'],
				columns: [{ name: 'Term', query: 'q' }],
				confirmed_cost_usd: '0.12'
			})
		);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/execute');
		const json = await res.json();
		expect(json.id).toBe('ex1');
	});

	it('maps a backend 400 to 502 (and passes 503/504)', async () => {
		lqFetch.mockResolvedValue(new Response('bad', { status: 400 }));
		await expect(POST(event({}))).rejects.toMatchObject({ status: 502 });
		lqFetch.mockResolvedValue(new Response('to', { status: 504 }));
		await expect(POST(event({}))).rejects.toMatchObject({ status: 504 });
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/tabular/preview-cost/server.test.ts" "src/routes/(app)/tabular/execute/server.test.ts"`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the proxies**

Create `src/routes/(app)/tabular/preview-cost/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/tabular/preview-cost', { method: 'POST', body });
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not estimate the review cost.'
		);
	return json(await res.json());
};
```

Create `src/routes/(app)/tabular/execute/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/tabular/execute', { method: 'POST', body });
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not start the review.'
		);
	return json(await res.json());
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/tabular/preview-cost/server.test.ts" "src/routes/(app)/tabular/execute/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add "src/routes/(app)/tabular/preview-cost" "src/routes/(app)/tabular/execute"
git commit -m "feat(tabular): preview-cost + execute BFF proxies"
```

---

## Task 3: Execution-scoped BFF proxies (poll, cancel, export)

**Files:**

- Create: `src/routes/(app)/tabular-executions/[id]/+server.ts`
- Create: `src/routes/(app)/tabular-executions/[id]/cancel/+server.ts`
- Create: `src/routes/(app)/tabular-executions/[id]/export/+server.ts`
- Test: `src/routes/(app)/tabular-executions/[id]/server.test.ts`
- Test: `src/routes/(app)/tabular-executions/[id]/cancel/server.test.ts`
- Test: `src/routes/(app)/tabular-executions/[id]/export/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/routes/(app)/tabular-executions/[id]/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({ params: { id: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /tabular-executions/[id]', () => {
	it('forwards to the backend execution endpoint', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: 'ex1', status: 'running' }), { status: 200 })
		);
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1');
		expect((await res.json()).status).toBe('running');
	});

	it('maps 404 to 404 and 500 to 502', async () => {
		lqFetch.mockResolvedValue(new Response('nope', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
```

Create `src/routes/(app)/tabular-executions/[id]/cancel/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = () => ({ params: { id: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /tabular-executions/[id]/cancel', () => {
	it('forwards the cancel and returns the updated execution', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: 'ex1', status: 'cancelled' }), { status: 200 })
		);
		const res = await POST(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/cancel');
		expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('POST');
		expect((await res.json()).status).toBe('cancelled');
	});

	it('passes 409 (already terminal) through', async () => {
		lqFetch.mockResolvedValue(new Response('terminal', { status: 409 }));
		await expect(POST(event())).rejects.toMatchObject({ status: 409 });
	});
});
```

Create `src/routes/(app)/tabular-executions/[id]/export/server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (format?: string) =>
	({
		params: { id: 'ex1' },
		url: new URL(`http://x/tabular-executions/ex1/export${format ? `?format=${format}` : ''}`)
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /tabular-executions/[id]/export', () => {
	it('streams the binary with an attachment disposition (default xlsx)', async () => {
		lqFetch.mockResolvedValue(
			new Response('PK', {
				status: 200,
				headers: {
					'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				}
			})
		);
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/export?format=xlsx');
		expect(res.headers.get('content-disposition')).toContain('attachment');
		expect(res.headers.get('content-type')).toContain('spreadsheetml');
	});

	it('passes the csv format through', async () => {
		lqFetch.mockResolvedValue(
			new Response('a,b', { status: 200, headers: { 'content-type': 'text/csv' } })
		);
		await GET(event('csv'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/export?format=csv');
	});

	it('maps a 409 (not completed) through', async () => {
		lqFetch.mockResolvedValue(new Response('not done', { status: 409 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 409 });
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/tabular-executions/[id]/server.test.ts" "src/routes/(app)/tabular-executions/[id]/cancel/server.test.ts" "src/routes/(app)/tabular-executions/[id]/export/server.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the proxies**

Create `src/routes/(app)/tabular-executions/[id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/tabular/executions/${event.params.id}`);
	if (!res.ok)
		throw error(
			res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load the review.'
		);
	return json(await res.json());
};
```

Create `src/routes/(app)/tabular-executions/[id]/cancel/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/tabular/executions/${event.params.id}/cancel`, {
		method: 'POST'
	});
	if (!res.ok)
		throw error(
			[404, 409, 503, 504].includes(res.status) ? res.status : 502,
			'Could not cancel the review.'
		);
	return json(await res.json());
};
```

Create `src/routes/(app)/tabular-executions/[id]/export/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const format = event.url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
	const res = await lqFetch(
		event,
		`/api/v1/tabular/executions/${event.params.id}/export?format=${format}`
	);
	if (!res.ok)
		throw error(
			[404, 409, 503, 504].includes(res.status) ? res.status : 502,
			'Could not export the review.'
		);
	return new Response(res.body, {
		status: res.status,
		headers: {
			'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
			'content-disposition': `attachment; filename="tabular-review.${format}"`,
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/tabular-executions/[id]/server.test.ts" "src/routes/(app)/tabular-executions/[id]/cancel/server.test.ts" "src/routes/(app)/tabular-executions/[id]/export/server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add "src/routes/(app)/tabular-executions"
git commit -m "feat(tabular): execution poll/cancel/export BFF proxies"
```

---

## Task 4: `createTabularBuilder` (docs + columns state)

**Files:**

- Create: `src/lib/tabular/tabularBuilder.svelte.ts`
- Test: `src/lib/tabular/tabularBuilder.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/tabularBuilder.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTabularBuilder } from './tabularBuilder.svelte';

describe('createTabularBuilder', () => {
	it('starts with no docs and one empty column; cannot run', () => {
		const b = createTabularBuilder();
		expect(b.docs).toEqual([]);
		expect(b.columns.length).toBe(1);
		expect(b.columns[0].name).toBe('');
		expect(b.cellCount).toBe(0);
		expect(b.canRun).toBe(false);
	});

	it('addDoc is idempotent by document_id and drives cellCount', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.addDoc({ document_id: 'd2', name: 'b.pdf' });
		expect(b.docs.length).toBe(2);
		expect(b.hasDoc('d1')).toBe(true);
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'How long?' });
		expect(b.cellCount).toBe(2);
		expect(b.canRun).toBe(true);
	});

	it('removeDoc removes by id', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.removeDoc('d1');
		expect(b.docs).toEqual([]);
	});

	it('addColumn/removeColumn manage the column list (never below one)', () => {
		const b = createTabularBuilder();
		const first = b.columns[0].id;
		b.addColumn();
		expect(b.columns.length).toBe(2);
		b.removeColumn(first);
		expect(b.columns.length).toBe(1);
		b.removeColumn(b.columns[0].id);
		expect(b.columns.length).toBe(1); // floor of one
	});

	it('validColumns trims and drops incomplete rows; canRun needs a valid column + a doc', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: '  ', query: 'q' }); // blank name
		expect(b.validColumns()).toEqual([]);
		expect(b.canRun).toBe(false);
		b.setColumn(b.columns[0].id, { name: 'Term ', query: ' How long? ' });
		expect(b.validColumns()).toEqual([{ name: 'Term', query: 'How long?' }]);
		expect(b.canRun).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the controller**

Create `src/lib/tabular/tabularBuilder.svelte.ts`:

```ts
import type { SelectedDoc, ColumnDraft } from './types';

export function createTabularBuilder() {
	let docs = $state<SelectedDoc[]>([]);
	let columns = $state<ColumnDraft[]>([{ id: crypto.randomUUID(), name: '', query: '' }]);

	function validColumns(): { name: string; query: string }[] {
		return columns
			.map((c) => ({ name: c.name.trim(), query: c.query.trim() }))
			.filter((c) => c.name.length > 0 && c.query.length > 0);
	}

	return {
		get docs() {
			return docs;
		},
		get columns() {
			return columns;
		},
		get cellCount() {
			return docs.length * validColumns().length;
		},
		get canRun() {
			return docs.length > 0 && validColumns().length > 0;
		},
		hasDoc(documentId: string) {
			return docs.some((d) => d.document_id === documentId);
		},
		addDoc(doc: SelectedDoc) {
			if (!docs.some((d) => d.document_id === doc.document_id)) docs = [...docs, doc];
		},
		removeDoc(documentId: string) {
			docs = docs.filter((d) => d.document_id !== documentId);
		},
		addColumn() {
			columns = [...columns, { id: crypto.randomUUID(), name: '', query: '' }];
		},
		removeColumn(id: string) {
			if (columns.length <= 1) return; // keep at least one row
			columns = columns.filter((c) => c.id !== id);
		},
		setColumn(id: string, patch: Partial<Pick<ColumnDraft, 'name' | 'query'>>) {
			columns = columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
		},
		validColumns
	};
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/tabularBuilder.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add src/lib/tabular/tabularBuilder.svelte.ts src/lib/tabular/tabularBuilder.svelte.test.ts
git commit -m "feat(tabular): createTabularBuilder docs+columns state controller"
```

---

## Task 5: `createTabularUploads` (upload → poll until `document_id`)

**Files:**

- Create: `src/lib/tabular/tabularUploads.svelte.ts`
- Test: `src/lib/tabular/tabularUploads.svelte.test.ts`

This mirrors P1.2's `createFileAttach` mechanics but resolves the parsed-content `document_id` (polls `/files/{id}` until `document_id` is non-null — ingest `ready` alone is not enough; the Easy-Playbook wizard uses the same "poll until `document_id`" contract). On resolution it invokes an `onresolved({document_id, name})` callback (the builder adds it as a row).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/tabularUploads.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTabularUploads } from './tabularUploads.svelte';

const uploadRes = (status: string, id = 'f1') =>
	new Response(JSON.stringify({ id, filename: 'a.pdf', ingestion_status: status }), {
		status: 201
	});
const metaRes = (status: string, documentId: string | null, id = 'f1') =>
	new Response(JSON.stringify({ id, ingestion_status: status, document_id: documentId }), {
		status: 200
	});
const file = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTabularUploads', () => {
	it('uploads, polls until document_id is non-null, then resolves', async () => {
		const resolved: { document_id: string; name: string }[] = [];
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValueOnce(metaRes('processing', null))
			.mockResolvedValueOnce(metaRes('ready', 'doc-1'));
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('processing');
		expect(up.items[0].documentId).toBeNull();
		await vi.advanceTimersByTimeAsync(2000);
		expect(resolved).toEqual([]); // ready false / document_id null still
		await vi.advanceTimersByTimeAsync(2000);
		expect(up.items[0].status).toBe('ready');
		expect(up.items[0].documentId).toBe('doc-1');
		expect(resolved).toEqual([{ document_id: 'doc-1', name: 'a.pdf' }]);
		expect(f.mock.calls[1][0]).toBe('/files/f1');
	});

	it('resolves immediately when the upload already returns ready with a document_id', async () => {
		const resolved: { document_id: string; name: string }[] = [];
		const up = createTabularUploads();
		const f = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'f1',
					filename: 'a.pdf',
					ingestion_status: 'ready',
					document_id: 'doc-9'
				}),
				{ status: 201 }
			)
		);
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('ready');
		expect(resolved).toEqual([{ document_id: 'doc-9', name: 'a.pdf' }]);
	});

	it('marks failed on a non-OK upload and never resolves', async () => {
		const resolved: unknown[] = [];
		const up = createTabularUploads();
		const f = vi.fn().mockResolvedValue(new Response('too big', { status: 413 }));
		await up.upload([file()], (d) => resolved.push(d), f);
		expect(up.items[0].status).toBe('failed');
		expect(up.items[0].error).toBe('File is too large.');
		expect(resolved).toEqual([]);
	});

	it('marks failed when ingestion fails', async () => {
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValueOnce(metaRes('failed', null));
		await up.upload([file()], () => {}, f);
		await vi.advanceTimersByTimeAsync(2000);
		expect(up.items[0].status).toBe('failed');
	});

	it('remove stops the poll; dispose stops all polls', async () => {
		const up = createTabularUploads();
		const f = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValue(metaRes('processing', null));
		await up.upload([file()], () => {}, f);
		const localId = up.items[0].localId;
		const before = f.mock.calls.length;
		up.remove(localId);
		await vi.advanceTimersByTimeAsync(6000);
		expect(f.mock.calls.length).toBe(before);
		expect(up.items).toEqual([]);

		const up2 = createTabularUploads();
		const g = vi
			.fn()
			.mockResolvedValueOnce(uploadRes('processing'))
			.mockResolvedValue(metaRes('processing', null));
		await up2.upload([file()], () => {}, g);
		const before2 = g.mock.calls.length;
		up2.dispose();
		await vi.advanceTimersByTimeAsync(6000);
		expect(g.mock.calls.length).toBe(before2);
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/tabularUploads.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the controller**

Create `src/lib/tabular/tabularUploads.svelte.ts`:

```ts
import type { SelectedDoc } from './types';
import type { components } from '$lib/api/backend';

type FileMeta = components['schemas']['File'];

const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 min

export interface UploadItem {
	localId: string;
	name: string;
	status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
	documentId: string | null;
	fileId?: string;
	error?: string;
}

export function createTabularUploads() {
	let items = $state<UploadItem[]>([]);
	const timers = new Map<string, ReturnType<typeof setInterval>>();

	const entry = (localId: string) => items.find((i) => i.localId === localId);

	function clearTimer(localId: string) {
		const t = timers.get(localId);
		if (t) {
			clearInterval(t);
			timers.delete(localId);
		}
	}

	function settle(e: UploadItem, meta: FileMeta, onresolved: (doc: SelectedDoc) => void): boolean {
		const status = meta.ingestion_status ?? 'pending';
		if (status === 'failed') {
			e.status = 'failed';
			e.error = meta.ingestion_error ?? 'Could not process this file.';
			return true;
		}
		if (meta.document_id) {
			e.status = 'ready';
			e.documentId = meta.document_id;
			onresolved({ document_id: meta.document_id, name: e.name });
			return true;
		}
		e.status = status === 'ready' ? 'processing' : status; // ready-but-no-doc: keep polling
		return false;
	}

	function startPoll(
		localId: string,
		fetchFn: typeof fetch,
		onresolved: (doc: SelectedDoc) => void
	) {
		let polls = 0;
		const t = setInterval(async () => {
			polls += 1;
			const e = entry(localId);
			if (!e) {
				clearTimer(localId);
				return;
			}
			if (polls > MAX_POLLS) {
				e.status = 'failed';
				e.error = 'Timed out processing this file.';
				clearTimer(localId);
				return;
			}
			try {
				const res = await fetchFn(`/files/${e.fileId}`);
				if (!res.ok) return;
				const meta = (await res.json()) as FileMeta;
				if (settle(e, meta, onresolved)) clearTimer(localId);
			} catch {
				/* tolerate; keep polling */
			}
		}, POLL_MS);
		timers.set(localId, t);
	}

	async function uploadOne(
		localId: string,
		file: File,
		fetchFn: typeof fetch,
		onresolved: (doc: SelectedDoc) => void
	) {
		const e = entry(localId);
		if (!e) return;
		try {
			const fd = new FormData();
			fd.append('file', file, file.name);
			const res = await fetchFn('/files', { method: 'POST', body: fd });
			if (!res.ok) {
				e.status = 'failed';
				e.error = res.status === 413 ? 'File is too large.' : 'Upload failed.';
				return;
			}
			const meta = (await res.json()) as FileMeta;
			e.fileId = meta.id;
			if (!settle(e, meta, onresolved)) startPoll(localId, fetchFn, onresolved);
		} catch {
			e.status = 'failed';
			e.error = 'Upload failed.';
		}
	}

	return {
		get items() {
			return items;
		},
		async upload(
			files: File[],
			onresolved: (doc: SelectedDoc) => void,
			fetchFn: typeof fetch = fetch
		) {
			for (const file of files) {
				const localId = crypto.randomUUID();
				items = [...items, { localId, name: file.name, status: 'uploading', documentId: null }];
				await uploadOne(localId, file, fetchFn, onresolved);
			}
		},
		remove(localId: string) {
			clearTimer(localId);
			items = items.filter((i) => i.localId !== localId);
		},
		dispose() {
			for (const t of timers.values()) clearInterval(t);
			timers.clear();
		}
	};
}
```

NOTE: `startPoll` reads `e.fileId` inside the interval (set by `uploadOne` from the upload response's
`meta.id`). The `fileId?: string` field on `UploadItem` is what makes `/files/{fileId}` polling work.

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/tabularUploads.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0. No `any`/`!`.

```bash
git add src/lib/tabular/tabularUploads.svelte.ts src/lib/tabular/tabularUploads.svelte.test.ts
git commit -m "feat(tabular): createTabularUploads — upload + poll to document_id"
```

---

## Task 6: Builder page `load` (`/tabular/+page.server.ts`)

**Files:**

- Create: `src/routes/(app)/tabular/+page.server.ts`
- Test: `src/routes/(app)/tabular/page.server.test.ts`

Mirrors the Playbooks `[id]/run` load: fetch the user's matters; when `?matter=<id>` is present, resolve that matter's `attached_file_ids` to ready files with a `document_id`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/tabular/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = (matter?: string) =>
	({ url: new URL(`http://x/tabular${matter ? `?matter=${matter}` : ''}`) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular load', () => {
	it('returns matters and no matterFiles without ?matter=', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
		);
		const out = (await load(ev())) as { matters: { id: string }[]; matterFiles: unknown[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
		expect(out.matters).toEqual([{ id: 'm1', name: 'Acme' }]);
		expect(out.matterFiles).toEqual([]);
	});

	it('resolves ready matter files (only ready + with document_id) when ?matter= is set', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: 'm1', name: 'Acme' }]), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ attached_file_ids: ['f1', 'f2', 'f3'] }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f1',
						filename: 'a.pdf',
						ingestion_status: 'ready',
						document_id: 'doc1'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f2',
						filename: 'b.pdf',
						ingestion_status: 'processing',
						document_id: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'f3',
						filename: 'c.pdf',
						ingestion_status: 'ready',
						document_id: null
					}),
					{ status: 200 }
				)
			);
		const out = (await load(ev('m1'))) as { matterFiles: { document_id: string; name: string }[] };
		expect(out.matterFiles).toEqual([{ document_id: 'doc1', name: 'a.pdf' }]);
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/tabular/page.server.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the load**

Create `src/routes/(app)/tabular/+page.server.ts`:

```ts
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { components } from '$lib/api/backend';

type FileMeta = components['schemas']['File'];

export const load: PageServerLoad = async (event) => {
	const mRes = await lqFetch(event, '/api/v1/projects');
	const matters = (mRes.ok ? ((await mRes.json()) as { id: string; name: string }[]) : []).map(
		(m) => ({
			id: m.id,
			name: m.name
		})
	);

	let matterFiles: { document_id: string; name: string }[] = [];
	const matterId = event.url.searchParams.get('matter');
	if (matterId) {
		const projRes = await lqFetch(event, `/api/v1/projects/${matterId}`);
		if (projRes.ok) {
			const proj = (await projRes.json()) as { attached_file_ids?: string[] };
			const metas = await Promise.all(
				(proj.attached_file_ids ?? []).map(async (fid) => {
					const r = await lqFetch(event, `/api/v1/files/${fid}`);
					return r.ok ? ((await r.json()) as FileMeta) : null;
				})
			);
			matterFiles = metas
				.filter(
					(f): f is FileMeta => f !== null && f.ingestion_status === 'ready' && !!f.document_id
				)
				.map((f) => ({ document_id: f.document_id as string, name: f.filename }));
		}
	}

	return { matters, matterFiles, selectedMatterId: matterId };
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/tabular/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add "src/routes/(app)/tabular/+page.server.ts" "src/routes/(app)/tabular/page.server.test.ts"
git commit -m "feat(tabular): builder page load (matters + ?matter= file resolution)"
```

---

## Task 7: `ColumnBuilder.svelte`

**Files:**

- Create: `src/lib/tabular/ColumnBuilder.svelte`
- Test: `src/lib/tabular/ColumnBuilder.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/ColumnBuilder.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnBuilder from './ColumnBuilder.svelte';
import { createTabularBuilder } from './tabularBuilder.svelte';

describe('ColumnBuilder', () => {
	it('renders a name + query input per column and an Add column control', () => {
		const b = createTabularBuilder();
		render(ColumnBuilder, { props: { builder: b } as never });
		expect(screen.getByPlaceholderText('Column name')).toBeInTheDocument();
		expect(screen.getByPlaceholderText(/what should we extract/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /add column/i })).toBeInTheDocument();
	});

	it('typing updates the builder column and Add column appends a row', async () => {
		const b = createTabularBuilder();
		render(ColumnBuilder, { props: { builder: b } as never });
		await fireEvent.input(screen.getByPlaceholderText('Column name'), {
			target: { value: 'Term' }
		});
		expect(b.columns[0].name).toBe('Term');
		await fireEvent.click(screen.getByRole('button', { name: /add column/i }));
		expect(b.columns.length).toBe(2);
	});

	it('shows a remove control once there is more than one column', async () => {
		const b = createTabularBuilder();
		b.addColumn();
		render(ColumnBuilder, { props: { builder: b } as never });
		const removes = screen.getAllByRole('button', { name: /remove column/i });
		expect(removes.length).toBe(2);
		await fireEvent.click(removes[0]);
		expect(b.columns.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/ColumnBuilder.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `src/lib/tabular/ColumnBuilder.svelte`:

```svelte
<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import type { createTabularBuilder } from './tabularBuilder.svelte';

	let { builder }: { builder: ReturnType<typeof createTabularBuilder> } = $props();
</script>

<div class="space-y-2">
	{#each builder.columns as col (col.id)}
		<div class="flex items-start gap-2">
			<div class="flex-1 space-y-1">
				<input
					value={col.name}
					oninput={(e) => builder.setColumn(col.id, { name: e.currentTarget.value })}
					placeholder="Column name"
					aria-label="Column name"
					class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
				/>
				<input
					value={col.query}
					oninput={(e) => builder.setColumn(col.id, { query: e.currentTarget.value })}
					placeholder="What should we extract? e.g. Which state's law governs?"
					aria-label="Column question"
					class="w-full rounded-mlq-control border border-mlq-subtle px-2.5 py-1.5 text-sm text-mlq-text"
				/>
			</div>
			{#if builder.columns.length > 1}
				<button
					type="button"
					aria-label="Remove column"
					onclick={() => builder.removeColumn(col.id)}
					class="mt-1.5 text-mlq-muted hover:text-mlq-text"
				>
					<X size={16} />
				</button>
			{/if}
		</div>
	{/each}
	<button
		type="button"
		onclick={() => builder.addColumn()}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:border-mlq-workflow"
	>
		<Plus size={13} aria-hidden="true" /> Add column
	</button>
</div>
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/ColumnBuilder.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add src/lib/tabular/ColumnBuilder.svelte src/lib/tabular/ColumnBuilder.svelte.test.ts
git commit -m "feat(tabular): ColumnBuilder name+query rows"
```

---

## Task 8: `DocumentMultiPicker.svelte`

**Files:**

- Create: `src/lib/tabular/DocumentMultiPicker.svelte`
- Test: `src/lib/tabular/DocumentMultiPicker.svelte.test.ts`

Two tabs: _From a matter_ (a `MatterPicker` to choose the matter — selecting it calls `onmatter(id)` so the page can `goto('?matter=id')` and SSR-load that matter's files — then a checkbox list over `matterFiles`) and _Upload_ (a `Dropzone` whose files go to `uploads.upload(...)`). Selected docs and upload chips both reflect into `builder`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/DocumentMultiPicker.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DocumentMultiPicker from './DocumentMultiPicker.svelte';
import { createTabularBuilder } from './tabularBuilder.svelte';
import { createTabularUploads } from './tabularUploads.svelte';

const props = (over: Record<string, unknown> = {}) => ({
	builder: createTabularBuilder(),
	uploads: createTabularUploads(),
	matters: [{ id: 'm1', name: 'Acme' }],
	matterFiles: [
		{ document_id: 'doc1', name: 'a.pdf' },
		{ document_id: 'doc2', name: 'b.pdf' }
	],
	selectedMatterId: 'm1',
	onmatter: vi.fn(),
	...over
});

describe('DocumentMultiPicker', () => {
	it("lists a matter's ready files as checkboxes and selecting one adds it to the builder", async () => {
		const p = props();
		render(DocumentMultiPicker, { props: p as never });
		const cb = screen.getByRole('checkbox', { name: 'a.pdf' });
		await fireEvent.click(cb);
		expect(p.builder.hasDoc('doc1')).toBe(true);
		await fireEvent.click(cb);
		expect(p.builder.hasDoc('doc1')).toBe(false);
	});

	it('shows a selected-count and the chosen documents as chips', async () => {
		const p = props();
		p.builder.addDoc({ document_id: 'doc1', name: 'a.pdf' });
		render(DocumentMultiPicker, { props: p as never });
		expect(screen.getByText('1 document selected')).toBeInTheDocument();
	});

	it('switching to the Upload tab shows the dropzone', async () => {
		render(DocumentMultiPicker, { props: props() as never });
		await fireEvent.click(screen.getByRole('button', { name: /upload/i }));
		expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/DocumentMultiPicker.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `src/lib/tabular/DocumentMultiPicker.svelte`:

```svelte
<script lang="ts">
	import { X } from '@lucide/svelte';
	import MatterPicker from '$lib/matters/MatterPicker.svelte';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import { statusBadge } from '$lib/matters/files/uploadFile';
	import type { createTabularBuilder } from './tabularBuilder.svelte';
	import type { createTabularUploads } from './tabularUploads.svelte';

	let {
		builder,
		uploads,
		matters,
		matterFiles,
		selectedMatterId,
		onmatter
	}: {
		builder: ReturnType<typeof createTabularBuilder>;
		uploads: ReturnType<typeof createTabularUploads>;
		matters: { id: string; name: string }[];
		matterFiles: { document_id: string; name: string }[];
		selectedMatterId: string | null;
		onmatter: (id: string | null) => void;
	} = $props();

	let tab = $state<'matter' | 'upload'>('matter');
	let matterId = $state(selectedMatterId);

	$effect(() => {
		if (matterId !== selectedMatterId) onmatter(matterId);
	});

	function toggle(doc: { document_id: string; name: string }, checked: boolean) {
		if (checked) builder.addDoc(doc);
		else builder.removeDoc(doc.document_id);
	}
</script>

<div class="space-y-3">
	<div class="flex gap-2 text-sm">
		<button
			type="button"
			class="rounded-mlq-control px-2.5 py-1 {tab === 'matter'
				? 'bg-mlq-strong text-white'
				: 'border border-mlq-subtle text-mlq-text'}"
			onclick={() => (tab = 'matter')}
		>
			From a matter
		</button>
		<button
			type="button"
			class="rounded-mlq-control px-2.5 py-1 {tab === 'upload'
				? 'bg-mlq-strong text-white'
				: 'border border-mlq-subtle text-mlq-text'}"
			onclick={() => (tab = 'upload')}
		>
			Upload
		</button>
	</div>

	{#if tab === 'matter'}
		<MatterPicker {matters} bind:selectedId={matterId} />
		{#if matterFiles.length}
			<ul class="space-y-1">
				{#each matterFiles as f (f.document_id)}
					<li>
						<label class="flex items-center gap-2 text-sm text-mlq-text">
							<input
								type="checkbox"
								checked={builder.hasDoc(f.document_id)}
								onchange={(e) => toggle(f, e.currentTarget.checked)}
								aria-label={f.name}
							/>
							{f.name}
						</label>
					</li>
				{/each}
			</ul>
		{:else if matterId}
			<p class="text-xs text-mlq-muted">This matter has no ready documents yet.</p>
		{/if}
	{:else}
		<Dropzone onfiles={(files) => uploads.upload(files, (doc) => builder.addDoc(doc))} />
		{#if uploads.items.length}
			<ul class="space-y-1">
				{#each uploads.items as it (it.localId)}
					<li
						class="flex items-center gap-2 text-xs {it.status === 'failed'
							? 'text-mlq-error'
							: 'text-mlq-muted'}"
					>
						{it.name} · {it.status === 'uploading'
							? 'uploading'
							: statusBadge(it.status).label.toLowerCase()}
						<button
							type="button"
							aria-label={`Remove ${it.name}`}
							onclick={() => uploads.remove(it.localId)}
							class="text-mlq-muted hover:text-mlq-text"><X size={12} /></button
						>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if builder.docs.length}
		<div>
			<p class="mb-1 text-xs text-mlq-muted">
				{builder.docs.length} document{builder.docs.length === 1 ? '' : 's'} selected
			</p>
			<div class="flex flex-wrap gap-1.5">
				{#each builder.docs as d (d.document_id)}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
					>
						{d.name}
						<button
							type="button"
							aria-label={`Remove ${d.name}`}
							onclick={() => builder.removeDoc(d.document_id)}
							class="text-mlq-muted hover:text-mlq-text"><X size={11} /></button
						>
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/DocumentMultiPicker.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0 (confirm no a11y warning; the checkbox uses a wrapping `<label>`).

```bash
git add src/lib/tabular/DocumentMultiPicker.svelte src/lib/tabular/DocumentMultiPicker.svelte.test.ts
git commit -m "feat(tabular): DocumentMultiPicker (matter checkboxes + upload)"
```

---

## Task 9: `CostPreviewModal.svelte`

**Files:**

- Create: `src/lib/tabular/CostPreviewModal.svelte`
- Test: `src/lib/tabular/CostPreviewModal.svelte.test.ts`

A confirm dialog (role=dialog, Escape to cancel). Props: `preview: TabularPreviewCostResponse`, `busy: boolean`, `onconfirm()`, `oncancel()`. Shows cells count, estimated cost, per-tier breakdown.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/CostPreviewModal.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CostPreviewModal from './CostPreviewModal.svelte';

const preview = {
	cells_count: 6,
	estimated_tokens: 1200,
	estimated_cost_usd: '0.12',
	per_tier_breakdown: { default: 6 }
};

describe('CostPreviewModal', () => {
	it('shows the cell count and estimated cost', () => {
		render(CostPreviewModal, {
			props: { preview, busy: false, onconfirm: vi.fn(), oncancel: vi.fn() } as never
		});
		expect(screen.getByText(/6 cells/i)).toBeInTheDocument();
		expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
	});

	it('fires onconfirm and oncancel', async () => {
		const onconfirm = vi.fn();
		const oncancel = vi.fn();
		render(CostPreviewModal, { props: { preview, busy: false, onconfirm, oncancel } as never });
		await fireEvent.click(screen.getByRole('button', { name: /run review/i }));
		expect(onconfirm).toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
		expect(oncancel).toHaveBeenCalled();
	});

	it('disables the confirm button while busy', () => {
		render(CostPreviewModal, {
			props: { preview, busy: true, onconfirm: vi.fn(), oncancel: vi.fn() } as never
		});
		expect(screen.getByRole('button', { name: /run review/i })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/CostPreviewModal.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `src/lib/tabular/CostPreviewModal.svelte`:

```svelte
<script lang="ts">
	import type { TabularPreviewCostResponse } from './types';

	let {
		preview,
		busy,
		onconfirm,
		oncancel
	}: {
		preview: TabularPreviewCostResponse;
		busy: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	$effect(() => {
		function onkey(e: KeyboardEvent) {
			if (e.key === 'Escape') oncancel();
		}
		document.addEventListener('keydown', onkey);
		return () => document.removeEventListener('keydown', onkey);
	});

	const tiers = $derived(Object.entries(preview.per_tier_breakdown ?? {}));
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Confirm review cost"
		class="w-full max-w-md rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
	>
		<h2 class="font-serif text-lg text-mlq-strong">Run this review?</h2>
		<p class="mt-2 text-sm text-mlq-text">
			<span class="font-semibold">{preview.cells_count} cells</span> · estimated
			<span class="font-semibold">${preview.estimated_cost_usd}</span>
		</p>
		{#if tiers.length}
			<ul class="mt-3 space-y-0.5 text-xs text-mlq-muted">
				{#each tiers as [tier, count] (tier)}
					<li>{tier}: {count} cell{count === 1 ? '' : 's'}</li>
				{/each}
			</ul>
		{/if}
		<p class="mt-3 text-xs text-mlq-muted">
			Cost is an estimate. You'll be able to cancel a running review.
		</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				onclick={oncancel}
				class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text"
				>Cancel</button
			>
			<button
				type="button"
				aria-label="Run review"
				onclick={onconfirm}
				disabled={busy}
				class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-sm text-white disabled:opacity-40"
			>
				{busy ? 'Starting…' : 'Run review'}
			</button>
		</div>
	</div>
</div>
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/CostPreviewModal.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add src/lib/tabular/CostPreviewModal.svelte src/lib/tabular/CostPreviewModal.svelte.test.ts
git commit -m "feat(tabular): CostPreviewModal confirm dialog"
```

---

## Task 10: Builder page `/tabular/+page.svelte`

**Files:**

- Create: `src/routes/(app)/tabular/+page.svelte` (REPLACES the 4-line stub)

Composes the builder: documents (`DocumentMultiPicker`) + columns (`ColumnBuilder`) + a sticky run bar (live cell count + Preview cost / Run) + the `CostPreviewModal`. Run → POST `/tabular/preview-cost` → show modal → confirm → POST `/tabular/execute` → `goto('/tabular/<id>')`. There is no unit test for the page wiring (covered by the live e2e); keep logic thin and lean on the tested controllers/components.

- [ ] **Step 1: Implement the page**

Create `src/routes/(app)/tabular/+page.svelte`:

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import DocumentMultiPicker from '$lib/tabular/DocumentMultiPicker.svelte';
	import ColumnBuilder from '$lib/tabular/ColumnBuilder.svelte';
	import CostPreviewModal from '$lib/tabular/CostPreviewModal.svelte';
	import { createTabularBuilder } from '$lib/tabular/tabularBuilder.svelte';
	import { createTabularUploads } from '$lib/tabular/tabularUploads.svelte';
	import type { TabularPreviewCostResponse, TabularExecution } from '$lib/tabular/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const builder = createTabularBuilder();
	const uploads = createTabularUploads();
	onDestroy(() => uploads.dispose());

	let preview = $state<TabularPreviewCostResponse | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function onmatter(id: string | null) {
		goto(id ? `/tabular?matter=${id}` : '/tabular', { keepFocus: true, noScroll: true });
	}

	async function openPreview() {
		if (!builder.canRun || busy) return;
		error = null;
		busy = true;
		try {
			const res = await fetch('/tabular/preview-cost', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					document_ids: builder.docs.map((d) => d.document_id),
					columns: builder.validColumns()
				})
			});
			if (!res.ok) {
				error = 'Could not estimate the cost. Please try again.';
				return;
			}
			preview = (await res.json()) as TabularPreviewCostResponse;
		} catch {
			error = 'Could not estimate the cost. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function confirmRun() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const res = await fetch('/tabular/execute', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					document_ids: builder.docs.map((d) => d.document_id),
					columns: builder.validColumns(),
					confirmed_cost_usd: preview?.estimated_cost_usd
				})
			});
			if (!res.ok) {
				error = 'Could not start the review. Please try again.';
				busy = false;
				return;
			}
			const exec = (await res.json()) as TabularExecution;
			preview = null;
			await goto(`/tabular/${exec.id}`);
		} catch {
			error = 'Could not start the review. Please try again.';
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8 pb-28">
	<h1 class="font-serif text-2xl text-mlq-strong">New tabular review</h1>
	<p class="mt-1 text-sm text-mlq-muted">
		Ask the same questions across many documents and get a cited table.
	</p>

	<div class="mt-6 grid gap-8 md:grid-cols-2">
		<section>
			<h2 class="mb-2 text-sm font-semibold text-mlq-strong">Documents</h2>
			<DocumentMultiPicker
				{builder}
				{uploads}
				matters={data.matters}
				matterFiles={data.matterFiles}
				selectedMatterId={data.selectedMatterId}
				{onmatter}
			/>
		</section>
		<section>
			<h2 class="mb-2 text-sm font-semibold text-mlq-strong">Columns</h2>
			<ColumnBuilder {builder} />
		</section>
	</div>

	{#if error}<p class="mt-4 text-sm text-mlq-error">{error}</p>{/if}
</div>

<div class="fixed inset-x-0 bottom-0 border-t border-mlq-subtle bg-mlq-surface px-6 py-3">
	<div class="mx-auto flex max-w-5xl items-center justify-between">
		<span class="text-sm text-mlq-muted"
			>{builder.docs.length} docs × {builder.validColumns().length} cols = {builder.cellCount} cells</span
		>
		<button
			type="button"
			onclick={openPreview}
			disabled={!builder.canRun || busy}
			class="rounded-mlq-control bg-mlq-strong px-4 py-2 text-sm text-white disabled:opacity-40"
		>
			Preview cost
		</button>
	</div>
</div>

{#if preview}
	<CostPreviewModal {preview} {busy} onconfirm={confirmRun} oncancel={() => (preview = null)} />
{/if}
```

- [ ] **Step 2: Gate**

Run: `npm run check` → 0/0. Run `npx vitest run` → full suite still green.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/tabular/+page.svelte"
git commit -m "feat(tabular): builder page — documents + columns + cost-preview run bar"
```

---

## Task 11: `createRunPoll` (execution poll controller)

**Files:**

- Create: `src/lib/tabular/runPoll.svelte.ts`
- Test: `src/lib/tabular/runPoll.svelte.test.ts`

Polls `/tabular-executions/[id]` every 2 s, visibility-paused, 5-min stuck flag, stops on terminal status. Seeded with an optional initial execution.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/runPoll.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunPoll } from './runPoll.svelte';
import type { TabularExecution } from './types';

const exec = (status: string): TabularExecution =>
	({
		id: 'ex1',
		status,
		document_ids: [],
		document_names: [],
		columns: [],
		created_at: ''
	}) as TabularExecution;
const res = (status: string) => new Response(JSON.stringify(exec(status)), { status: 200 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createRunPoll', () => {
	it('does not poll when seeded with a terminal execution', async () => {
		const f = vi.fn();
		const p = createRunPoll('ex1', exec('completed'));
		p.start(f);
		await vi.advanceTimersByTimeAsync(4000);
		expect(f).not.toHaveBeenCalled();
		expect(p.status).toBe('completed');
		p.stop();
	});

	it('polls until a terminal status then stops', async () => {
		const f = vi.fn().mockResolvedValueOnce(res('running')).mockResolvedValueOnce(res('completed'));
		const p = createRunPoll('ex1', exec('pending'));
		p.start(f);
		await vi.advanceTimersByTimeAsync(2000);
		expect(p.status).toBe('running');
		await vi.advanceTimersByTimeAsync(2000);
		expect(p.status).toBe('completed');
		const calls = f.mock.calls.length;
		await vi.advanceTimersByTimeAsync(4000);
		expect(f.mock.calls.length).toBe(calls); // stopped
		expect(f.mock.calls[0][0]).toBe('/tabular-executions/ex1');
		p.stop();
	});

	it('flags stuck after 5 minutes without reaching terminal', async () => {
		const f = vi.fn().mockResolvedValue(res('running'));
		const p = createRunPoll('ex1', exec('pending'));
		p.start(f);
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 2000);
		expect(p.stuck).toBe(true);
		p.stop();
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/runPoll.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the controller**

Create `src/lib/tabular/runPoll.svelte.ts`:

```ts
import { isTerminal, type TabularExecution } from './types';

const POLL_MS = 2000;
const STUCK_MS = 5 * 60 * 1000;

export function createRunPoll(executionId: string, initial: TabularExecution | null = null) {
	let execution = $state<TabularExecution | null>(initial);
	let stuck = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;
	let stuckTimer: ReturnType<typeof setTimeout> | null = null;

	function stop() {
		if (timer) clearInterval(timer);
		if (stuckTimer) clearTimeout(stuckTimer);
		timer = null;
		stuckTimer = null;
	}

	return {
		get execution() {
			return execution;
		},
		get status() {
			return execution?.status ?? 'pending';
		},
		get stuck() {
			return stuck;
		},
		start(fetchFn: typeof fetch = fetch) {
			if (execution && isTerminal(execution.status)) return;
			stuckTimer = setTimeout(() => {
				if (!execution || !isTerminal(execution.status)) stuck = true;
			}, STUCK_MS);
			timer = setInterval(async () => {
				if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
				try {
					const res = await fetchFn(`/tabular-executions/${executionId}`);
					if (!res.ok) return;
					const next = (await res.json()) as TabularExecution;
					execution = next;
					if (isTerminal(next.status)) stop();
				} catch {
					/* tolerate; keep polling */
				}
			}, POLL_MS);
		},
		stop
	};
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/runPoll.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add src/lib/tabular/runPoll.svelte.ts src/lib/tabular/runPoll.svelte.test.ts
git commit -m "feat(tabular): createRunPoll execution poll controller"
```

---

## Task 12: `TabularGrid` + `CellDetail` + `ExportMenu`

**Files:**

- Create: `src/lib/tabular/CellDetail.svelte`
- Create: `src/lib/tabular/ExportMenu.svelte`
- Create: `src/lib/tabular/TabularGrid.svelte`
- Test: `src/lib/tabular/TabularGrid.svelte.test.ts`
- Test: `src/lib/tabular/ExportMenu.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tabular/ExportMenu.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExportMenu from './ExportMenu.svelte';

describe('ExportMenu', () => {
	it('exposes xlsx and csv export links for the execution', async () => {
		render(ExportMenu, { props: { executionId: 'ex1' } as never });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		const xlsx = screen.getByRole('link', { name: /excel/i });
		const csv = screen.getByRole('link', { name: /csv/i });
		expect(xlsx).toHaveAttribute('href', '/tabular-executions/ex1/export?format=xlsx');
		expect(csv).toHaveAttribute('href', '/tabular-executions/ex1/export?format=csv');
	});
});
```

Create `src/lib/tabular/TabularGrid.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TabularGrid from './TabularGrid.svelte';
import type { TabularResults } from './types';

const results: TabularResults = {
	schema_version: 'm3-c2-v1',
	rows: [
		{
			document_id: 'd1',
			document_name: 'a.pdf',
			cells: {
				'Governing law': {
					value: 'Delaware',
					cited_chunk_ids: ['c1', 'c2'],
					confidence: 'high',
					error: null
				},
				Term: { value: '', cited_chunk_ids: [], confidence: 'failed', error: 'no answer' }
			}
		}
	],
	summary: { total_cells: 2, failed_cells: 1 }
};

describe('TabularGrid', () => {
	it('renders document rows, column headers and cell values', () => {
		render(TabularGrid, {
			props: { results, columns: ['Governing law', 'Term'], executionId: 'ex1' } as never
		});
		expect(screen.getByText('a.pdf')).toBeInTheDocument();
		expect(screen.getByText('Governing law')).toBeInTheDocument();
		expect(screen.getByText('Delaware')).toBeInTheDocument();
	});

	it('shows a citation count and a (failed) marker, plus the summary', () => {
		render(TabularGrid, {
			props: { results, columns: ['Governing law', 'Term'], executionId: 'ex1' } as never
		});
		expect(screen.getByText('2')).toBeInTheDocument(); // citation count for the Delaware cell
		expect(screen.getByText('(failed)')).toBeInTheDocument();
		expect(screen.getByText(/2 cells · 1 failed/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/lib/tabular/ExportMenu.svelte.test.ts src/lib/tabular/TabularGrid.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the components**

Create `src/lib/tabular/CellDetail.svelte`:

```svelte
<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { TabularCell } from './types';

	let { column, cell, onclose }: { column: string; cell: TabularCell; onclose: () => void } =
		$props();

	$effect(() => {
		function onkey(e: KeyboardEvent) {
			if (e.key === 'Escape') onclose();
		}
		document.addEventListener('keydown', onkey);
		return () => document.removeEventListener('keydown', onkey);
	});
</script>

<div
	class="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-mlq-subtle bg-mlq-surface p-5 shadow-lg"
	role="dialog"
	aria-label="Cell detail"
>
	<div class="flex items-start justify-between">
		<h3 class="font-serif text-base text-mlq-strong">{column}</h3>
		<button
			type="button"
			aria-label="Close"
			onclick={onclose}
			class="text-mlq-muted hover:text-mlq-text"><X size={16} /></button
		>
	</div>
	{#if cell.confidence === 'failed'}
		<p class="mt-3 text-sm text-mlq-error">(failed){cell.error ? ` — ${cell.error}` : ''}</p>
	{:else}
		<p class="mt-3 text-sm whitespace-pre-wrap text-mlq-text">{cell.value}</p>
		<p class="mt-3 text-xs text-mlq-muted">Confidence: {cell.confidence}</p>
		<p class="text-xs text-mlq-muted">
			{cell.cited_chunk_ids.length} citation{cell.cited_chunk_ids.length === 1 ? '' : 's'}
		</p>
	{/if}
</div>
```

Create `src/lib/tabular/ExportMenu.svelte`:

```svelte
<script lang="ts">
	import { Download } from '@lucide/svelte';

	let { executionId }: { executionId: string } = $props();
	let open = $state(false);
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text"
	>
		<Download size={14} aria-hidden="true" /> Export ▾
	</button>
	{#if open}
		<div
			class="absolute right-0 z-10 mt-1 w-40 rounded-mlq-control border border-mlq-subtle bg-mlq-surface py-1 shadow-md"
		>
			<a
				href={`/tabular-executions/${executionId}/export?format=xlsx`}
				class="block px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt"
				onclick={() => (open = false)}>Excel (.xlsx)</a
			>
			<a
				href={`/tabular-executions/${executionId}/export?format=csv`}
				class="block px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt"
				onclick={() => (open = false)}>CSV (.csv)</a
			>
		</div>
	{/if}
</div>
```

Create `src/lib/tabular/TabularGrid.svelte`:

```svelte
<script lang="ts">
	import ExportMenu from './ExportMenu.svelte';
	import CellDetail from './CellDetail.svelte';
	import type { TabularResults, TabularCell, CellConfidence } from './types';

	let {
		results,
		columns,
		executionId
	}: { results: TabularResults; columns: string[]; executionId: string } = $props();

	let detail = $state<{ column: string; cell: TabularCell } | null>(null);

	const dot: Record<CellConfidence, string> = {
		high: 'bg-mlq-success',
		medium: 'bg-mlq-caveats',
		low: 'bg-mlq-error',
		failed: 'bg-mlq-muted'
	};
</script>

<div>
	<div class="mb-2 flex items-center justify-between">
		<p class="text-sm text-mlq-muted">
			{results.summary.total_cells} cells · {results.summary.failed_cells} failed
		</p>
		<ExportMenu {executionId} />
	</div>
	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-left text-xs">
			<thead>
				<tr>
					<th
						class="sticky left-0 z-10 border border-mlq-subtle bg-mlq-surface-alt px-2 py-1.5 text-mlq-strong"
						>Document</th
					>
					{#each columns as col (col)}
						<th class="border border-mlq-subtle bg-mlq-surface-alt px-2 py-1.5 text-mlq-strong"
							>{col}</th
						>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each results.rows as row (row.document_id)}
					<tr>
						<td
							class="sticky left-0 z-10 border border-mlq-subtle bg-mlq-surface px-2 py-1.5 font-semibold whitespace-nowrap text-mlq-text"
							>{row.document_name}</td
						>
						{#each columns as col (col)}
							{@const cell = row.cells[col]}
							<td class="border border-mlq-subtle px-2 py-1.5 align-top">
								{#if cell}
									<button
										type="button"
										class="flex w-full items-start gap-1 text-left"
										onclick={() => (detail = { column: col, cell })}
									>
										<span
											class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full {dot[cell.confidence]}"
										></span>
										{#if cell.confidence === 'failed'}
											<span class="text-mlq-error">(failed)</span>
										{:else}
											<span class="line-clamp-2 text-mlq-text">{cell.value}</span>
											{#if cell.cited_chunk_ids.length}<span
													class="ml-auto shrink-0 text-mlq-workflow"
													>{cell.cited_chunk_ids.length}</span
												>{/if}
										{/if}
									</button>
								{:else}
									<span class="text-mlq-muted">—</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if detail}
	<CellDetail column={detail.column} cell={detail.cell} onclose={() => (detail = null)} />
{/if}
```

NOTE on `line-clamp-2`: this is a stock Tailwind utility (the `@tailwindcss/line-clamp` behaviour is built into Tailwind ≥3.3). If `npm run check`/build flags it as unknown, replace it with an inline style `style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"` on that `<span>`. The implementer should confirm which the project supports and use the one that keeps `npm run check` clean.

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/lib/tabular/ExportMenu.svelte.test.ts src/lib/tabular/TabularGrid.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → 0/0.

```bash
git add src/lib/tabular/CellDetail.svelte src/lib/tabular/ExportMenu.svelte src/lib/tabular/TabularGrid.svelte src/lib/tabular/ExportMenu.svelte.test.ts src/lib/tabular/TabularGrid.svelte.test.ts
git commit -m "feat(tabular): TabularGrid + CellDetail + ExportMenu"
```

---

## Task 13: Run page (`/tabular/[executionId]`)

**Files:**

- Create: `src/routes/(app)/tabular/[executionId]/+page.server.ts`
- Create: `src/routes/(app)/tabular/[executionId]/+page.svelte`
- Test: `src/routes/(app)/tabular/[executionId]/page.server.test.ts`

- [ ] **Step 1: Write the failing load test**

Create `src/routes/(app)/tabular/[executionId]/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = () => ({ params: { executionId: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular/[executionId] load', () => {
	it('loads the execution by id', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'ex1',
					status: 'running',
					columns: [{ name: 'Term', query: 'q' }],
					document_ids: [],
					document_names: [],
					created_at: ''
				}),
				{ status: 200 }
			)
		);
		const out = (await load(ev())) as { execution: { id: string } };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1');
		expect(out.execution.id).toBe('ex1');
	});

	it('throws 404 when the execution is missing', async () => {
		lqFetch.mockResolvedValue(new Response('nope', { status: 404 }));
		await expect(load(ev())).rejects.toMatchObject({ status: 404 });
	});
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run "src/routes/(app)/tabular/[executionId]/page.server.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the load**

Create `src/routes/(app)/tabular/[executionId]/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PageServerLoad } from './$types';
import type { TabularExecution } from '$lib/tabular/types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, `/api/v1/tabular/executions/${event.params.executionId}`);
	if (res.status === 404) throw error(404, 'Review not found.');
	if (!res.ok) throw error(502, 'Could not load this review.');
	const execution = (await res.json()) as TabularExecution;
	return { execution };
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run "src/routes/(app)/tabular/[executionId]/page.server.test.ts"`
Expected: PASS.

- [ ] **Step 5: Implement the run page**

Create `src/routes/(app)/tabular/[executionId]/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import TabularGrid from '$lib/tabular/TabularGrid.svelte';
	import { createRunPoll } from '$lib/tabular/runPoll.svelte';
	import { parseTabularResults, isTerminal, type TabularExecution } from '$lib/tabular/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const poll = createRunPoll(data.execution.id, data.execution);
	onMount(() => poll.start());
	onDestroy(() => poll.stop());

	const current = $derived((poll.execution ?? data.execution) as TabularExecution);
	const columns = $derived(current.columns.map((c) => c.name));
	const results = $derived(parseTabularResults(current.results));
	let cancelling = $state(false);

	async function cancel() {
		if (cancelling) return;
		cancelling = true;
		try {
			await fetch(`/tabular-executions/${current.id}/cancel`, { method: 'POST' });
		} catch {
			/* the poll will reconcile the status */
		} finally {
			cancelling = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
	<h1 class="font-serif text-2xl text-mlq-strong">Tabular review</h1>

	{#if !isTerminal(current.status)}
		<div class="mt-6 flex items-center gap-4">
			<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-mlq-workflow"></span>
			<span class="text-sm text-mlq-text"
				>Running… extracting {current.document_ids.length} document{current.document_ids.length ===
				1
					? ''
					: 's'} × {current.columns.length} column{current.columns.length === 1 ? '' : 's'}.</span
			>
			<button
				type="button"
				onclick={cancel}
				disabled={cancelling}
				class="rounded-mlq-control border border-mlq-subtle px-3 py-1 text-sm text-mlq-text disabled:opacity-40"
				>Cancel</button
			>
		</div>
		{#if poll.stuck}
			<p class="mt-3 text-xs text-mlq-muted">
				This is taking longer than expected. The review keeps running — reload to check again.
			</p>
		{/if}
	{:else if current.status === 'failed'}
		<p class="mt-6 text-sm text-mlq-error">
			This review failed{current.error_text ? `: ${current.error_text}` : '.'}
		</p>
	{:else if current.status === 'cancelled'}
		<p class="mt-6 text-sm text-mlq-muted">This review was cancelled.</p>
	{:else if results}
		<div class="mt-6">
			<TabularGrid {results} {columns} executionId={current.id} />
		</div>
	{:else}
		<p class="mt-6 text-sm text-mlq-muted">No results to show.</p>
	{/if}
</div>
```

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → 0/0. Run `npx vitest run` → full suite green.

```bash
git add "src/routes/(app)/tabular/[executionId]"
git commit -m "feat(tabular): run/results page — poll, cancel, grid"
```

---

## Task 14: Live e2e

**Files:**

- Create: `tests/tabular-review.spec.ts`

- [ ] **Step 1: Rebuild donna-web** (the container serves built code; this branch added routes):

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

- [ ] **Step 2: Write the e2e**

Create `tests/tabular-review.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

// Plain .txt does NOT ingest on this stack (unsupported_type); generate a tiny PDF.
function pdfFixture(): string {
	const p = join(tmpdir(), 'donna-tabular.pdf');
	if (!existsSync(p)) execSync(`cupsfilter /etc/hosts > "${p}" 2>/dev/null`);
	return p;
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('tabular: upload a doc, add a column, preview, run, see a cell, export', async ({ page }) => {
	test.setTimeout(300_000);
	await login(page);
	await page.goto('/tabular');

	// Upload tab → drop a PDF; wait for it to resolve to a selected-document chip.
	await page.getByRole('button', { name: /^Upload$/ }).click();
	await page.getByTestId('dropzone-input').setInputFiles(pdfFixture());
	await expect(page.getByText(/document selected/i)).toBeVisible({ timeout: 120_000 });

	// Define one column.
	await page.getByPlaceholder('Column name').fill('Governing law');
	await page
		.getByLabel('Column question')
		.fill("Which state's or country's law governs this document?");

	// Preview → confirm.
	await page.getByRole('button', { name: 'Preview cost' }).click();
	const dialog = page.getByRole('dialog', { name: /confirm review cost/i });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Run review' }).click();

	// Run page: poll to a populated grid.
	await page.waitForURL(/\/tabular\/[0-9a-f-]+$/i, { timeout: 15_000 });
	await expect(page.getByText('Governing law')).toBeVisible({ timeout: 180_000 });
	await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 180_000 });

	// Export menu exposes the download links.
	await page.getByRole('button', { name: /export/i }).click();
	await expect(page.getByRole('link', { name: /excel/i })).toHaveAttribute(
		'href',
		/export\?format=xlsx/
	);
});
```

- [ ] **Step 3: Run**

```bash
set -a; . ./.env; set +a
npx playwright test tests/tabular-review.spec.ts
```

Expected: PASS. If the PDF never resolves to a selected-doc chip, confirm `cupsfilter` produced a non-empty PDF and that the ingest-worker + arq-worker are up (tabular execution runs on `arq:m3a6`). Do NOT loosen assertions to hide a real failure; if the backend genuinely never returns a populated grid for an ingested doc, report it as a backend-contract issue.

- [ ] **Step 4: Commit**

```bash
git add tests/tabular-review.spec.ts
git commit -m "test(tabular): live e2e — upload, column, preview, run, grid, export"
```

---

## Final Verification (after all tasks)

- [ ] `npm run check` → 0 errors / 0 warnings.
- [ ] `npx vitest run` → full suite green.
- [ ] `set -a; . ./.env; set +a; docker compose up -d --build donna-web && npx playwright test tests/tabular-review.spec.ts` → green.
- [ ] Manual: `/tabular` builds (matter-pick + upload), live cell count updates, Preview cost shows the modal, Run navigates to `/tabular/<id>`, the grid renders with confidence dots + citation counts, a cell opens the detail panel, Export downloads xlsx/csv, Cancel works mid-run.

## Acceptance criteria (from the spec)

- [ ] Single builder page: matter-pick + upload (multi-select), ad-hoc name+query columns, live cell count.
- [ ] Preview-then-confirm cost (cells · est. cost · per-tier); `confirmed_cost_usd` sent on execute.
- [ ] Async run with 2 s visibility-paused poll, 5-min stuck flag, and Cancel.
- [ ] Compact-spreadsheet grid: sticky header + first column, confidence dot, clipped value, citation **count**, `(failed)` cells, summary; click-cell detail panel (counts only — no source nav).
- [ ] xlsx/csv export via binary BFF proxy (attachment download); enabled only when completed.
- [ ] `npm run check` 0/0; eslint clean (no `any`/`!`); unit/component/server tests green; live e2e green.
- [ ] Out of scope confirmed absent: history list, skill columns, advanced per-column options, cell→source nav, column reorder.
