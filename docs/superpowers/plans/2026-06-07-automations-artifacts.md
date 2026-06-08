# Automations Document-Grade Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a workflow run's document-grade artifacts on its receipt — a "Documents" block with Open (inline-rendered markdown in the doc panel) and Download — plus the `emit_artifacts` opt-in toggles upstream requires.

**Architecture:** Mirror the `memories_total` threading chain from PR #71 end-to-end (`loadRunOutput` → SSR load + poll proxy → `pollSession` → `SessionDetail` → `RunResults`). Extend the doc panel with a `TextViewer` for `text/markdown`/`text/plain` (today it renders PDF only). Opt-in toggles ride the existing form→FormData→body-builder seams.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, vitest + @testing-library/svelte, Playwright live e2e, lq-ai backend pinned @ `c4d4482`.

**Spec:** `docs/superpowers/specs/2026-06-07-automations-artifacts-design.md` (read it first — it carries the verified upstream contract).

**Branch:** `feat/automations-artifacts` (pin bump + spec already committed).

**House rules (apply to EVERY task):**
- TDD: write the failing test first, watch it fail, implement, watch it pass.
- Run a focused vitest per task: `npx vitest run <test-file> --reporter=basic` (full gates run at the end).
- Tabs for indentation (prettier is configured that way — copy neighboring files).
- Commit + push after each task. Commit messages follow the repo's `feat(automations): …` / `test(automations): …` style, ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Zero new svelte-check or eslint warnings — the repo bar is FULLY green, not "no new".

---

### Task 1: `formatBytes` display helper

**Files:**
- Modify: `src/lib/automations/display.ts` (append)
- Test: `src/lib/automations/display.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test** — append to `src/lib/automations/display.test.ts`:

```ts
describe('formatBytes', () => {
	it('formats bytes, KB, and MB at sensible precision', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(842)).toBe('842 B');
		expect(formatBytes(1024)).toBe('1.0 KB');
		expect(formatBytes(4608)).toBe('4.5 KB');
		expect(formatBytes(1048576)).toBe('1.0 MB');
		expect(formatBytes(2621440)).toBe('2.5 MB');
	});
	it('tolerates negative/non-finite input with an em dash', () => {
		expect(formatBytes(-1)).toBe('—');
		expect(formatBytes(Number.NaN)).toBe('—');
	});
});
```

Add `formatBytes` to the existing import from `./display` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/display.test.ts --reporter=basic`
Expected: FAIL — `formatBytes` is not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/automations/display.ts`:

```ts
/** Human-readable size for an artifact row: B < 1 KiB, then one-decimal KB/MB.
 *  Negative or non-finite input (defensive parse) renders an em dash. */
export function formatBytes(n: number): string {
	if (!Number.isFinite(n) || n < 0) return '—';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/automations/display.test.ts --reporter=basic`
Expected: PASS (whole file — existing cases stay green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/display.ts src/lib/automations/display.test.ts
git commit -m "feat(automations): formatBytes helper for artifact rows"
git push
```

---

### Task 2: `artifacts.ts` defensive parser

**Files:**
- Create: `src/lib/automations/artifacts.ts`
- Test: `src/lib/automations/artifacts.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/automations/artifacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseArtifactList } from './artifacts';

const raw = (over: Record<string, unknown> = {}) => ({
	id: 'a1',
	name: 'DPA review memo.md',
	mime: 'text/markdown',
	size_bytes: 4608,
	file_id: 'f1',
	document_id: 'd1',
	created_at: '2026-06-07T10:00:00Z',
	...over
});

describe('parseArtifactList', () => {
	it('parses the artifacts envelope with total_count', () => {
		const out = parseArtifactList({ artifacts: [raw()], total_count: 7 });
		expect(out.artifacts).toEqual([
			{
				id: 'a1',
				name: 'DPA review memo.md',
				mime: 'text/markdown',
				size_bytes: 4608,
				file_id: 'f1',
				document_id: 'd1',
				created_at: '2026-06-07T10:00:00Z'
			}
		]);
		expect(out.total).toBe(7);
	});
	it('normalizes missing nullable refs to null (hard-deleted file)', () => {
		const out = parseArtifactList({
			artifacts: [raw({ file_id: null, document_id: undefined })],
			total_count: 1
		});
		expect(out.artifacts[0].file_id).toBeNull();
		expect(out.artifacts[0].document_id).toBeNull();
	});
	it('drops rows without a string id and falls back total to length', () => {
		const out = parseArtifactList({ artifacts: [raw(), { name: 'no id' }] });
		expect(out.artifacts).toHaveLength(1);
		expect(out.total).toBe(1);
	});
	it('tolerates garbage input', () => {
		expect(parseArtifactList(null)).toEqual({ artifacts: [], total: 0 });
		expect(parseArtifactList('nope')).toEqual({ artifacts: [], total: 0 });
		expect(parseArtifactList({ artifacts: 'nope' })).toEqual({ artifacts: [], total: 0 });
	});
	it('coerces a non-numeric size to 0 (defensive)', () => {
		const out = parseArtifactList({ artifacts: [raw({ size_bytes: 'big' })], total_count: 1 });
		expect(out.artifacts[0].size_bytes).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/artifacts.test.ts --reporter=basic`
Expected: FAIL — module `./artifacts` does not exist.

- [ ] **Step 3: Write minimal implementation** — create `src/lib/automations/artifacts.ts`:

```ts
// src/lib/automations/artifacts.ts
// Defensively-parsed view models for a run's document-grade artifacts
// (lq-ai #138: GET /sessions/{id}/artifacts — references to real KB documents).
// Mirrors the parsing style of findings.ts. `file_id`/`document_id` are
// nullable: a hard file-delete SET-NULLs the refs (name/size survive);
// `document_id` is read-time-enriched upstream and drives "Open".

export interface ArtifactItem {
	id: string;
	name: string;
	mime: string;
	size_bytes: number;
	file_id: string | null;
	document_id: string | null;
	created_at: string | null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseArtifact(raw: unknown): ArtifactItem | null {
	const r = obj(raw);
	if (typeof r.id !== 'string') return null;
	return {
		id: r.id,
		name: str(r.name) ?? '',
		mime: str(r.mime) ?? '',
		size_bytes: typeof r.size_bytes === 'number' ? r.size_bytes : 0,
		file_id: str(r.file_id),
		document_id: str(r.document_id),
		created_at: str(r.created_at)
	};
}

export interface ArtifactList {
	artifacts: ArtifactItem[];
	total: number;
}

export function parseArtifactList(raw: unknown): ArtifactList {
	const r = obj(raw);
	const arr = Array.isArray(r.artifacts) ? r.artifacts : [];
	const artifacts = arr.map(parseArtifact).filter((a): a is ArtifactItem => a !== null);
	const total = typeof r.total_count === 'number' ? r.total_count : artifacts.length;
	return { artifacts, total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/automations/artifacts.test.ts --reporter=basic`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/artifacts.ts src/lib/automations/artifacts.test.ts
git commit -m "feat(automations): defensive parser for run artifact references"
git push
```

---

### Task 3: `loadRunOutput` gains the artifacts fetch

**Files:**
- Modify: `src/lib/automations/runOutput.server.ts`
- Test: `src/lib/automations/runOutput.server.test.ts` (append cases; update existing call-order assertions if needed)

- [ ] **Step 1: Write the failing tests** — append to `src/lib/automations/runOutput.server.test.ts` (note the existing `lqFetch` mock at the top; follow its `mockResolvedValueOnce` queue — order is findings, memories, artifacts):

```ts
const artifactsBody = {
	artifacts: [
		{
			id: 'a1',
			name: 'Memo.md',
			mime: 'text/markdown',
			size_bytes: 100,
			file_id: 'f9',
			document_id: 'd9',
			created_at: 'z'
		}
	],
	total_count: 1
};

describe('loadRunOutput artifacts', () => {
	it('fetches artifacts in the same parallel batch and returns parsed refs', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(artifactsBody), { status: 200 }));
		const out = await loadRunOutput(ev, 's1');
		expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/autonomous/sessions/s1/artifacts?limit=200');
		expect(out.artifacts).toHaveLength(1);
		expect(out.artifacts?.[0].name).toBe('Memo.md');
		expect(out.artifacts_total).toBe(1);
	});
	it('degrades a failed artifacts fetch to null without touching findings/memories', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.artifacts).toBeNull();
		expect(out.artifacts_total).toBeNull();
		expect(out.findings).toHaveLength(1);
		expect(out.memories).toHaveLength(1);
	});
	it('degrades a non-JSON artifacts body to null', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
		const out = await loadRunOutput(ev, 's1');
		expect(out.artifacts).toBeNull();
	});
});
```

The PRE-EXISTING tests in this file queue only two `mockResolvedValueOnce` responses. After this change `loadRunOutput` makes a third call — an unqueued `lqFetch` mock call resolves `undefined`, and `undefined.ok` throws. **Fix the existing tests** by appending a third queued response to each (a degraded one keeps assertions unchanged):

```ts
.mockResolvedValueOnce(new Response('boom', { status: 500 }))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/runOutput.server.test.ts --reporter=basic`
Expected: new cases FAIL (`out.artifacts` undefined; only 2 lqFetch calls).

- [ ] **Step 3: Implement** — `src/lib/automations/runOutput.server.ts` becomes:

```ts
// src/lib/automations/runOutput.server.ts
// Server-side loader for a run's work-product (findings + proposed memories +
// document-grade artifact refs), shared by the [id] SSR load and the [id] poll
// proxy. Degrades each key to null on failure — the receipt page must never
// fail because of Results.
import { lqFetch } from '$lib/server/lqClient';
import {
	parseFindingList,
	parseRunMemories,
	type FindingItem,
	type RunMemoryItem
} from './findings';
import { parseArtifactList, type ArtifactItem } from './artifacts';
import type { RequestEvent } from '@sveltejs/kit';

export interface RunOutput {
	findings: FindingItem[] | null;
	findings_total: number | null;
	memories: RunMemoryItem[] | null;
	memories_total: number | null;
	artifacts: ArtifactItem[] | null;
	artifacts_total: number | null;
}

export async function loadRunOutput(event: RequestEvent, sessionId: string): Promise<RunOutput> {
	const [fRes, mRes, aRes] = await Promise.all([
		lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/findings?limit=200`),
		lqFetch(
			event,
			`/api/v1/autonomous/memory?source_session_id=${encodeURIComponent(sessionId)}&limit=200`
		),
		lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/artifacts?limit=200`)
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
	let memories_total: number | null = null;
	if (mRes.ok) {
		try {
			const parsed = parseRunMemories(await mRes.json());
			memories = parsed.memories;
			memories_total = parsed.total;
		} catch {
			// non-JSON body → sub-section hidden
		}
	}
	let artifacts: ArtifactItem[] | null = null;
	let artifacts_total: number | null = null;
	if (aRes.ok) {
		try {
			const parsed = parseArtifactList(await aRes.json());
			artifacts = parsed.artifacts;
			artifacts_total = parsed.total;
		} catch {
			// non-JSON body → Documents block hidden
		}
	}
	return { findings, findings_total, memories, memories_total, artifacts, artifacts_total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/automations/runOutput.server.test.ts --reporter=basic`
Expected: PASS — all pre-existing + 3 new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/runOutput.server.ts src/lib/automations/runOutput.server.test.ts
git commit -m "feat(automations): loadRunOutput fetches artifact refs (null-degrading)"
git push
```

---

### Task 4: `pollSession` threads artifacts

**Files:**
- Modify: `src/lib/automations/pollSession.svelte.ts`
- Test: `src/lib/automations/pollSession.svelte.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `pollSession.svelte.test.ts`. Follow the file's existing `vi.stubGlobal('fetch', …)` + fake-timers pattern (read the existing tests first — there is a helper that builds the response body; extend the body it returns or stub inline like the existing last-known-good test for findings):

```ts
it('threads artifacts with last-known-good retention', async () => {
	const bodies = [
		{
			session: sessionBody('running'),
			receipt: null,
			artifacts: [
				{
					id: 'a1',
					name: 'Memo.md',
					mime: 'text/markdown',
					size_bytes: 5,
					file_id: 'f1',
					document_id: 'd1',
					created_at: 'x'
				}
			],
			artifacts_total: 1
		},
		// degraded tick: nulls must NOT blank the earlier data
		{ session: sessionBody('completed'), receipt: null, artifacts: null, artifacts_total: null }
	];
	let i = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(bodies[Math.min(i++, bodies.length - 1)])))
	);
	const poll = createSessionPoll('s1', { pollMs: 1 });
	const p = poll.start();
	await vi.advanceTimersByTimeAsync(10);
	await p;
	expect(poll.artifacts).toHaveLength(1);
	expect(poll.artifacts?.[0].name).toBe('Memo.md');
	expect(poll.artifactsTotal).toBe(1);
});
```

If the existing file has no `sessionBody` helper with that exact name, reuse whatever inline session object the existing tests use (the `mockFetchSequence` helper builds `{ id: 's1', status, trigger_kind: 'manual', … }`) — copy that shape verbatim.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts --reporter=basic`
Expected: FAIL — `poll.artifacts` undefined.

- [ ] **Step 3: Implement** — in `src/lib/automations/pollSession.svelte.ts`:

Add the import:

```ts
import type { ArtifactItem } from './artifacts';
```

Add state (after the `memoriesTotal` line):

```ts
let artifacts = $state<ArtifactItem[] | null>(null);
let artifactsTotal = $state<number | null>(null);
```

In `tick()`, extend the body cast:

```ts
const body = (await res.json()) as {
	session?: unknown;
	receipt?: unknown;
	findings?: unknown;
	findings_total?: unknown;
	memories?: unknown;
	memories_total?: unknown;
	artifacts?: unknown;
	artifacts_total?: unknown;
};
```

After the `memoriesTotal` last-known-good block, add (same comment discipline applies — the existing comment above the findings block already explains the pattern):

```ts
const incomingArtifacts = Array.isArray(body.artifacts) ? (body.artifacts as ArtifactItem[]) : null;
if (incomingArtifacts !== null) artifacts = incomingArtifacts;
const incomingArtifactsTotal =
	typeof body.artifacts_total === 'number' ? body.artifacts_total : null;
if (incomingArtifactsTotal !== null) artifactsTotal = incomingArtifactsTotal;
```

Add getters to the returned object (after `memoriesTotal`):

```ts
get artifacts() {
	return artifacts;
},
get artifactsTotal() {
	return artifactsTotal;
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/automations/pollSession.svelte.test.ts --reporter=basic`
Expected: PASS, all.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/pollSession.svelte.ts src/lib/automations/pollSession.svelte.test.ts
git commit -m "feat(automations): poll threads artifact refs (last-known-good)"
git push
```

---

### Task 5: `TextViewer` — inline markdown/plain-text rendering

**Files:**
- Create: `src/lib/docpanel/TextViewer.svelte`
- Test: `src/lib/docpanel/TextViewer.svelte.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/docpanel/TextViewer.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TextViewer from './TextViewer.svelte';

afterEach(() => vi.unstubAllGlobals());

function stubContent(body: string, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(body, { status }))
	);
}

describe('TextViewer', () => {
	it('renders markdown through the sanitized renderer', async () => {
		stubContent('# Memo title\n\nA **bold** point.');
		render(TextViewer, {
			props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' }
		});
		expect(await screen.findByRole('heading', { name: 'Memo title' })).toBeInTheDocument();
		expect(screen.getByText('bold')).toBeInTheDocument();
	});
	it('renders plain text preformatted (no markdown interpretation)', async () => {
		stubContent('# not a heading');
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/plain', filename: 'log.txt' } });
		expect(await screen.findByText('# not a heading')).toBeInTheDocument();
		expect(screen.queryByRole('heading')).not.toBeInTheDocument();
	});
	it('fetch failure → error state with a Download fallback link', async () => {
		stubContent('nope', 500);
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' } });
		expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
		const link = screen.getByRole('link', { name: /download/i });
		expect(link).toHaveAttribute('href', '/files/f1/content');
	});
	it('shows a loading state while the fetch is in flight', () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);
		render(TextViewer, { props: { fileId: 'f1', mime: 'text/markdown', filename: 'memo.md' } });
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/TextViewer.svelte.test.ts --reporter=basic`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement** — create `src/lib/docpanel/TextViewer.svelte`:

```svelte
<!-- src/lib/docpanel/TextViewer.svelte -->
<!-- Inline viewer for text documents (autonomous-run artifacts are always
     text/markdown — lq-ai #138 pins the mime server-side). Markdown renders
     through the house renderer (markdown-it + DOMPurify via Markdown.svelte);
     text/plain renders preformatted. Errors degrade to a Download link —
     never a crash (the doc-panel contract). -->
<script lang="ts">
	import { Download } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	let { fileId, mime, filename }: { fileId: string; mime: string; filename: string } = $props();

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let text = $state('');

	// Re-fetch when the tab's file changes (the panel reuses one viewer per active tab).
	$effect(() => {
		const id = fileId;
		status = 'loading';
		text = '';
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/files/${id}/content`);
				if (!res.ok) throw new Error(String(res.status));
				const body = await res.text();
				if (cancelled) return;
				text = body;
				status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if status === 'loading'}
	<p class="p-4 text-center text-xs text-mlq-muted">Loading…</p>
{:else if status === 'error'}
	<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
		<p class="text-xs text-mlq-error">Could not load this document.</p>
		<a
			href="/files/{fileId}/content"
			download={filename || undefined}
			class="inline-flex items-center gap-1.5 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
		>
			<Download size={14} /> Download
		</a>
	</div>
{:else if mime === 'text/markdown'}
	<div class="h-full overflow-y-auto p-4">
		<Markdown content={text} />
	</div>
{:else}
	<pre
		class="h-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-mlq-text">{text}</pre>
{/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/docpanel/TextViewer.svelte.test.ts --reporter=basic`
Expected: PASS, 4 tests. (If the prose class on the markdown wrapper trips the heading query, note `Markdown.svelte` emits `.prose-mlq` with raw HTML — `findByRole('heading')` works on the rendered `<h1>`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/docpanel/TextViewer.svelte src/lib/docpanel/TextViewer.svelte.test.ts
git commit -m "feat(docpanel): TextViewer — inline markdown/plain-text rendering"
git push
```

---

### Task 6: `DocumentPanel` text-mime branch

**Files:**
- Modify: `src/lib/docpanel/DocumentPanel.svelte:173-176` (the non-PDF fallback)
- Test: `src/lib/docpanel/DocumentPanel.svelte.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `DocumentPanel.svelte.test.ts` (read the file's existing setup first — it builds a `docPanel` store/mock; reuse its helper for an open tab, setting `mime: 'text/markdown'`, `status: 'ready'`):

```ts
it('renders TextViewer for a ready text/markdown tab (not the unsupported card)', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('# Hello memo'))
	);
	const docPanel = panelWithTab({ mime: 'text/markdown', status: 'ready', filename: 'memo.md' });
	render(DocumentPanel, { props: { docPanel } });
	expect(await screen.findByRole('heading', { name: 'Hello memo' })).toBeInTheDocument();
	expect(screen.queryByText(/preview isn't available/i)).not.toBeInTheDocument();
});
it('still renders the unsupported card for other mimes', () => {
	const docPanel = panelWithTab({ mime: 'application/zip', status: 'ready', filename: 'x.zip' });
	render(DocumentPanel, { props: { docPanel } });
	expect(screen.getByText(/preview isn't available/i)).toBeInTheDocument();
});
```

`panelWithTab` stands for however the existing tests construct a panel with one ready tab — REUSE the existing helper/pattern in that file verbatim (likely `createDocPanel()` + a stubbed fetch + `await open(...)`, or a hand-built object). Do not invent a new harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts --reporter=basic`
Expected: the markdown case FAILS (unsupported card shown instead).

- [ ] **Step 3: Implement** — in `DocumentPanel.svelte`:

Add the import:

```svelte
import TextViewer from './TextViewer.svelte';
```

Replace the final fallback branch (lines 173-176):

```svelte
{:else if docPanel.activeTab.status === 'ready'}
	{@const tab = docPanel.activeTab}
	{#if tab.mime === 'text/markdown' || tab.mime === 'text/plain'}
		{#key tab.fileId}
			<TextViewer fileId={tab.fileId} mime={tab.mime} filename={tab.filename} />
		{/key}
	{:else}
		<UnsupportedFileCard fileId={tab.fileId} filename={tab.filename} mime={tab.mime} />
	{/if}
{/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts --reporter=basic`
Expected: PASS — new + all pre-existing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/DocumentPanel.svelte.test.ts
git commit -m "feat(docpanel): route text/markdown + text/plain tabs to TextViewer"
git push
```

---

### Task 7: `RunResults` Documents block

**Files:**
- Modify: `src/lib/automations/RunResults.svelte`
- Test: `src/lib/automations/RunResults.svelte.test.ts` (append)

- [ ] **Step 1: Write the failing tests** — append to `RunResults.svelte.test.ts` (extend the `base` fixture object with `artifacts: null as ArtifactItem[] | null, artifactsTotal: null as number | null`; import `ArtifactItem` from `./artifacts`):

```ts
const a = (id: string, over: Partial<ArtifactItem> = {}): ArtifactItem => ({
	id,
	name: 'DPA memo.md',
	mime: 'text/markdown',
	size_bytes: 4608,
	file_id: 'f1',
	document_id: 'd1',
	created_at: '2026-06-07T10:00:00Z',
	...over
});

describe('RunResults documents', () => {
	it('hidden when artifacts are null or empty', () => {
		render(RunResults, { props: { ...base, artifacts: null } });
		expect(screen.queryByText('Documents')).not.toBeInTheDocument();
		render(RunResults, { props: { ...base, artifacts: [] } });
		expect(screen.queryByText('Documents')).not.toBeInTheDocument();
	});
	it('renders a row with name, size, Open, and Download', async () => {
		const onopenartifact = vi.fn();
		render(RunResults, {
			props: { ...base, artifacts: [a('a1')], artifactsTotal: 1, onopenartifact }
		});
		expect(screen.getByText('Documents')).toBeInTheDocument();
		expect(screen.getByText('DPA memo.md')).toBeInTheDocument();
		expect(screen.getByText('4.5 KB')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
			'href',
			'/files/f1/content'
		);
		await fireEvent.click(screen.getByRole('button', { name: /open/i }));
		expect(onopenartifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
	});
	it('deleted-file row: metadata only, no actions', () => {
		render(RunResults, {
			props: {
				...base,
				artifacts: [a('a1', { file_id: null, document_id: null })],
				artifactsTotal: 1
			}
		});
		expect(screen.getByText('DPA memo.md')).toBeInTheDocument();
		expect(screen.getByText(/file deleted/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
	});
	it('overflow note when total exceeds the fetched page', () => {
		render(RunResults, {
			props: { ...base, artifacts: [a('a1')], artifactsTotal: 3 }
		});
		expect(screen.getByText('+2 more documents not shown.')).toBeInTheDocument();
	});
});
```

Add `vi` and `fireEvent` to the vitest/testing-library imports at the top of the file if not present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/RunResults.svelte.test.ts --reporter=basic`
Expected: FAIL — unknown props / no Documents markup. (Pre-existing tests keep passing — the new props are optional.)

- [ ] **Step 3: Implement** — in `RunResults.svelte`:

Script additions (imports + props + derived):

```ts
import { FileText, Download } from '@lucide/svelte';
import type { ArtifactItem } from './artifacts';
import { formatBytes } from './display';
```

Extend the props destructuring + type (new optional props keep existing call sites compiling):

```ts
let {
	findings,
	findingsTotal,
	memories,
	memoriesTotal = null,
	artifacts = null,
	artifactsTotal = null,
	onopenartifact,
	running
}: {
	findings: FindingItem[] | null;
	findingsTotal: number | null;
	memories: RunMemoryItem[] | null;
	memoriesTotal?: number | null;
	artifacts?: ArtifactItem[] | null;
	artifactsTotal?: number | null;
	onopenartifact?: (artifact: ArtifactItem) => void;
	running: boolean;
} = $props();
```

Add the derived overflow (next to the other overflow deriveds):

```ts
const artifactsOverflow = $derived(
	artifactsTotal !== null && artifacts !== null && artifactsTotal > artifacts.length
		? artifactsTotal - artifacts.length
		: 0
);
```

Markup — insert BETWEEN the section header `<div>` and the `{#if findings === null}` block (Documents sit above findings per the spec):

```svelte
{#if artifacts && artifacts.length > 0}
	<div class="mb-1">
		<h3 class="mb-1 text-xs font-medium text-mlq-muted">Documents</h3>
		<ul class="flex flex-col gap-1">
			{#each artifacts as artifact (artifact.id)}
				<li
					class="flex items-center gap-2 rounded-mlq-control border border-mlq-subtle px-2 py-1.5"
				>
					<FileText size={14} class="shrink-0 text-mlq-muted" aria-hidden="true" />
					<span class="min-w-0 flex-1 truncate text-sm text-mlq-text" title={artifact.name}
						>{artifact.name}</span
					>
					<span class="shrink-0 text-xs text-mlq-muted">{formatBytes(artifact.size_bytes)}</span>
					{#if artifact.file_id}
						<button
							type="button"
							onclick={() => onopenartifact?.(artifact)}
							class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-mlq-workflow hover:underline"
							>Open</button
						>
						<a
							href="/files/{artifact.file_id}/content"
							download={artifact.name || undefined}
							class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-mlq-muted hover:text-mlq-text"
							><Download size={12} /> Download</a
						>
					{:else}
						<span class="shrink-0 text-xs text-mlq-muted italic">file deleted</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if artifactsOverflow > 0}
			<p class="mt-1 text-xs text-mlq-muted">+{artifactsOverflow} more documents not shown.</p>
		{/if}
	</div>
{/if}
```

Also update the component's top comment (line 2-4) to mention documents: `findings in emission order … + the documents (artifacts) it saved to the target KB + the memories it proposed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/automations/RunResults.svelte.test.ts --reporter=basic`
Expected: PASS — 4 new + all pre-existing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/RunResults.svelte src/lib/automations/RunResults.svelte.test.ts
git commit -m "feat(automations): Documents block on run Results (Open/Download per artifact)"
git push
```

---

### Task 8: `SessionDetail` + receipt page host the doc panel

**Files:**
- Modify: `src/lib/automations/SessionDetail.svelte`
- Modify: `src/routes/(app)/automations/[id]/+page.svelte`
- Test: `src/lib/automations/SessionDetail.svelte.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `SessionDetail.svelte.test.ts` (reuse the file's existing initial-props fixture; add the two new props):

```ts
it('threads initial artifacts into the Documents block and bubbles open', async () => {
	const onopenartifact = vi.fn();
	render(SessionDetail, {
		props: {
			...baseProps, // the file's existing completed-session fixture
			initialArtifacts: [
				{
					id: 'a1',
					name: 'Memo.md',
					mime: 'text/markdown',
					size_bytes: 100,
					file_id: 'f1',
					document_id: 'd1',
					created_at: 'x'
				}
			],
			initialArtifactsTotal: 1,
			onopenartifact
		}
	});
	expect(screen.getByText('Documents')).toBeInTheDocument();
	await fireEvent.click(screen.getByRole('button', { name: /open/i }));
	expect(onopenartifact).toHaveBeenCalled();
});
```

(If the file names its fixture differently, reuse whatever the existing tests spread — completed status so the poll never starts.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations/SessionDetail.svelte.test.ts --reporter=basic`
Expected: FAIL — unknown props, no Documents block.

- [ ] **Step 3: Implement**

`SessionDetail.svelte` — add to imports:

```ts
import type { ArtifactItem } from './artifacts';
```

Extend props (after `initialMemoriesTotal`):

```ts
initialArtifacts = null,
initialArtifactsTotal = null,
onopenartifact
```

with types:

```ts
initialArtifacts?: ArtifactItem[] | null;
initialArtifactsTotal?: number | null;
onopenartifact?: (artifact: ArtifactItem) => void;
```

Add deriveds (after `memoriesTotal`):

```ts
const artifacts = $derived(pick(live.artifacts, initialArtifacts));
const artifactsTotal = $derived(pick(live.artifactsTotal, initialArtifactsTotal));
```

Pass through to `RunResults`:

```svelte
<RunResults
	{findings}
	{findingsTotal}
	{memories}
	{memoriesTotal}
	{artifacts}
	{artifactsTotal}
	{onopenartifact}
	running={session.status === 'running'}
/>
```

`src/routes/(app)/automations/[id]/+page.svelte` — full new version (hosting pattern copied from the chats page: flex row, content `flex-1`, panel as right sibling; `Citation` cast pattern from the tabular page, `verificationApplicable: false` because an artifact open has no citation/verification context):

```svelte
<script lang="ts">
	import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
	import SessionDetail from '$lib/automations/SessionDetail.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import type { Citation } from '$lib/citations/types';
	import type { ArtifactItem } from '$lib/automations/artifacts';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const docPanel = createDocPanel();

	// An artifact is a real KB document — open it by file id. No citation context,
	// so suppress the verification chip (the tabular precedent for non-cite opens).
	function openArtifact(a: ArtifactItem) {
		if (!a.file_id) return;
		docPanel.open({ source_file_id: a.file_id, verificationApplicable: false } as Citation);
	}
</script>

<svelte:head><title>Automation session — Donna</title></svelte:head>

<div class="flex h-full min-h-0">
	<div class="min-w-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-4 py-6">
			<h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
			<WorkflowsNav active="automations" />
			<a href="/automations" class="mb-3 inline-block text-xs text-mlq-muted hover:text-mlq-text"
				>← Sessions</a
			>
			{#if form?.error}
				<p role="alert" class="mb-2 text-xs text-mlq-error">{form.error}</p>
			{/if}
			{#key data.session.id}
				<SessionDetail
					initialSession={data.session}
					initialReceipt={data.receipt}
					initialFindings={data.findings}
					initialFindingsTotal={data.findings_total}
					initialMemories={data.memories}
					initialMemoriesTotal={data.memories_total}
					initialArtifacts={data.artifacts}
					initialArtifactsTotal={data.artifacts_total}
					onopenartifact={openArtifact}
				/>
			{/key}
		</div>
	</div>
	{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
</div>
```

(No `+page.server.ts` change needed — `loadRunOutput` is already spread into the load's return from Task 3.)

- [ ] **Step 4: Run test + check**

Run: `npx vitest run src/lib/automations/SessionDetail.svelte.test.ts --reporter=basic`
Expected: PASS.
Run: `npm run check`
Expected: 0 errors 0 warnings (vendor ERR_MODULE_NOT_FOUND stderr is harmless).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/SessionDetail.svelte "src/routes/(app)/automations/[id]/+page.svelte" src/lib/automations/SessionDetail.svelte.test.ts
git commit -m "feat(automations): receipt hosts the doc panel; artifacts thread to Results"
git push
```

---

### Task 9: `emit_artifacts` in body builders + run-now action

**Files:**
- Modify: `src/lib/automations/schedules.ts` (`buildScheduleBody`)
- Modify: `src/lib/automations/watches.ts` (`buildWatchBody`)
- Modify: `src/routes/(app)/automations/new/+page.server.ts` (the `run` action)
- Test: `src/lib/automations/schedules.test.ts`, `src/lib/automations/watches.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `schedules.test.ts` (use the file's existing FormData-building helper/pattern):

```ts
it('create: emit_artifacts defaults false and follows the checkbox', () => {
	const fd = new FormData();
	fd.set('source_mode', 'playbook');
	fd.set('playbook_id', 'p1');
	fd.set('cron_expr', '0 9 * * *');
	const off = buildScheduleBody(fd, 'create');
	expect(off.ok && off.body.emit_artifacts).toBe(false);
	fd.set('emit_artifacts', 'true');
	const on = buildScheduleBody(fd, 'create');
	expect(on.ok && on.body.emit_artifacts).toBe(true);
});
it('update: emit_artifacts is always an explicit boolean (false persists, never null)', () => {
	const fd = new FormData();
	fd.set('source_mode', 'playbook');
	fd.set('playbook_id', 'p1');
	fd.set('cron_expr', '0 9 * * *');
	fd.set('emit_artifacts', 'false');
	const r = buildScheduleBody(fd, 'update');
	expect(r.ok && r.body.emit_artifacts).toBe(false);
});
```

Append the analogous two tests to `watches.test.ts` (`buildWatchBody`, with `knowledge_base_id` set for create — copy the file's existing valid-FormData fixture).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/automations/schedules.test.ts src/lib/automations/watches.test.ts --reporter=basic`
Expected: FAIL — `emit_artifacts` undefined on the body.

- [ ] **Step 3: Implement**

`schedules.ts` — in `buildScheduleBody`, read the field with the other form reads:

```ts
const emitArtifacts = String(form.get('emit_artifacts') ?? 'false') === 'true';
```

and include it in the body construction line:

```ts
const body: Record<string, unknown> = { cron_expr: cronExpr, enabled, emit_artifacts: emitArtifacts };
```

Update the function's doc comment: add a line ``emit_artifacts` is always sent as an explicit boolean — required on create (lq-ai #138), and on update an explicit false persists (null would be a no-op).`

`watches.ts` — same two changes in `buildWatchBody`:

```ts
const emitArtifacts = String(form.get('emit_artifacts') ?? 'false') === 'true';
…
const body: Record<string, unknown> = { enabled, emit_artifacts: emitArtifacts };
```

`src/routes/(app)/automations/new/+page.server.ts` — in the `run` action: the body is currently `Record<string, string>`; `emit_artifacts` is a boolean, so widen it and add the field (AutonomousManualRunRequest REQUIRES it):

```ts
const emitArtifacts = String(form.get('emit_artifacts') ?? 'false') === 'true';
…
const body: Record<string, unknown> = { target_kb_id: targetKbId, emit_artifacts: emitArtifacts };
```

(keep every subsequent `body.x = …` line unchanged — they assign strings, which `unknown` accepts).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/automations/schedules.test.ts src/lib/automations/watches.test.ts --reporter=basic`
Expected: PASS. Then `npm run check` → 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/schedules.ts src/lib/automations/watches.ts "src/routes/(app)/automations/new/+page.server.ts" src/lib/automations/schedules.test.ts src/lib/automations/watches.test.ts
git commit -m "feat(automations): emit_artifacts in schedule/watch/run-now request bodies"
git push
```

---

### Task 10: `emit_artifacts` form toggles

**Files:**
- Modify: `src/lib/automations/ScheduleForm.svelte` (+ its `ScheduleInitial` interface + parse seam)
- Modify: `src/lib/automations/WatchForm.svelte` (+ its `WatchInitial` interface)
- Modify: `src/lib/automations/RunNowForm.svelte`
- Modify: `src/lib/automations/schedules.ts` (`ScheduleSummary` + `parseSchedule`), `src/lib/automations/watches.ts` (`WatchSummary` + `parseWatch`) — read-model field for edit prefill
- Test: `ScheduleForm.svelte.test.ts`, `WatchForm.svelte.test.ts`, `RunNowForm.svelte.test.ts`, plus 1-line additions to `schedules.test.ts`/`watches.test.ts` parse cases

- [ ] **Step 1: Write the failing tests**

Append to `ScheduleForm.svelte.test.ts` (reuse the file's existing render fixture):

```ts
it('emit_artifacts toggle: off by default, hidden field follows the checkbox', async () => {
	render(ScheduleForm, { props: { ...baseProps } });
	const checkbox = screen.getByRole('checkbox', { name: /save run documents/i });
	expect(checkbox).not.toBeChecked();
	expect(document.querySelector('input[name="emit_artifacts"]')).toHaveValue('false');
	await fireEvent.click(checkbox);
	expect(document.querySelector('input[name="emit_artifacts"]')).toHaveValue('true');
});
it('edit mode prefills emit_artifacts from initial', () => {
	render(ScheduleForm, {
		props: { ...baseProps, initial: { ...baseInitial, emit_artifacts: true } }
	});
	expect(screen.getByRole('checkbox', { name: /save run documents/i })).toBeChecked();
});
```

(`baseProps`/`baseInitial` stand for the file's existing fixtures — reuse them; `baseInitial` needs the new `emit_artifacts` field added where it's defined.)

Append the analogous two tests to `WatchForm.svelte.test.ts`.

Append to `RunNowForm.svelte.test.ts`:

```ts
it('emit_artifacts toggle present with the KB hint, hidden field follows it', async () => {
	render(RunNowForm, { props: { ...baseProps } });
	const checkbox = screen.getByRole('checkbox', { name: /save run documents/i });
	expect(checkbox).not.toBeChecked();
	expect(document.querySelector('input[name="emit_artifacts"]')).toHaveValue('false');
	await fireEvent.click(checkbox);
	expect(document.querySelector('input[name="emit_artifacts"]')).toHaveValue('true');
});
```

Append to the parse tests in `schedules.test.ts` / `watches.test.ts` — extend one existing happy-path `parseSchedule`/`parseWatch` case to assert `emit_artifacts: true` parses and a missing value parses `false`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/automations/ScheduleForm.svelte.test.ts src/lib/automations/WatchForm.svelte.test.ts src/lib/automations/RunNowForm.svelte.test.ts --reporter=basic`
Expected: FAIL — no such checkbox.

- [ ] **Step 3: Implement**

`schedules.ts` — `ScheduleSummary` gains `emit_artifacts: boolean;` and `parseSchedule` returns `emit_artifacts: r.emit_artifacts === true`. Same for `watches.ts` (`WatchSummary` + `parseWatch`).

`ScheduleForm.svelte`:
- `ScheduleInitial` gains `emit_artifacts: boolean;`
- seed state: `let emitArtifacts = $state(seed?.emit_artifacts ?? false);`
- Insert the toggle directly after the "Target knowledge base (optional)" block (documents land in that KB — adjacency explains the dependency):

```svelte
<label class="flex items-start gap-2 text-sm text-mlq-text">
	<input type="checkbox" bind:checked={emitArtifacts} class="mt-0.5 accent-mlq-workflow" />
	<span>
		Save run documents to the knowledge base
		<span class="block text-xs text-mlq-muted">
			When the run produces a document-grade result (a memo), save it to the target knowledge
			base and link it on the run's receipt.
		</span>
	</span>
</label>
```

- Hidden field (with the other hidden fields):

```svelte
<input type="hidden" name="emit_artifacts" value={emitArtifacts ? 'true' : 'false'} />
```

`WatchForm.svelte` — same four changes (`WatchInitial` field, seed state, toggle after the watched-KB block, hidden field). Watch helper copy: `Documents are saved to the watched knowledge base.` — a watch's target KB is the watched KB.

`RunNowForm.svelte` — same state + toggle + hidden field (no `initial`); place the toggle after the "Target knowledge base" block, and extend the helper copy with the hint:

```svelte
<span class="block text-xs text-mlq-muted">
	When the run produces a document-grade result (a memo), save it to the target knowledge base
	and link it on the run's receipt. Documents need a target knowledge base.
</span>
```

**Callers of the forms:** the schedule/watch edit pages build `initial` from the parsed summaries — `npm run check` will flag any object literal now missing `emit_artifacts`; fix by passing the parsed value through (it is on the summary after the parse change). Find them with `grep -rn "ScheduleInitial\|WatchInitial\|initial={" src/routes src/lib/automations --include="*.svelte" --include="*.ts"`.

- [ ] **Step 4: Run tests + check**

Run: `npx vitest run src/lib/automations --reporter=basic` (the whole automations dir)
Expected: PASS, all files.
Run: `npm run check`
Expected: 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations "src/routes/(app)/automations" 
git commit -m "feat(automations): emit_artifacts opt-in toggles on schedule/watch/run-now forms"
git push
```

---

### Task 11: About touch

**Files:**
- Modify: `src/routes/(app)/about/automations/+page.svelte` (the "Results: what the run produced" paragraph, ~line 81)
- Test: none (the about e2e asserts page renders; copy-only change)

- [ ] **Step 1: Edit the paragraph** — in the Results `<p>`, after the findings sentence (before "A run can also propose <strong>memories</strong>"), insert:

```svelte
Runs that opt in to <strong>Save run documents</strong> can also produce document-grade
results — memos saved to the run's target knowledge base, listed under
<strong>Documents</strong> on the receipt, where you can open them inline or download them.
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: 0/0.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/about/automations/+page.svelte"
git commit -m "docs(about): documents (artifacts) mention in the automations Results section"
git push
```

---

### Task 12: Live e2e — seeded artifacts on a real receipt

**Files:**
- Create: `tests/automations-artifacts.spec.ts`

Prereqs: full stack up on the new pin (api + arq-worker + donna-web rebuilt), `.env` loaded by the runner (`POSTGRES_USER=lq_ai`, db `lq_ai`, `DONNA_E2E_PASSWORD`). **Rebuild donna-web first** (`docker compose up -d --build donna-web`) so the container runs this branch's code.

Strategy (per spec): artifact **emission** is model-discretionary, so CI seeds rows deterministically — the marker-row pattern from `tests/automations-memory-review.spec.ts`. The seeded artifact points at an EXISTING KB file (a PDF), which exercises the full Open seam (panel opens, metadata fetch, viewer mounts); TextViewer's markdown path is unit-tested (Task 5) and manually verified (final checklist).

- [ ] **Step 1: Write the spec** — create `tests/automations-artifacts.spec.ts`:

```ts
import { execSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// SQL seeding via docker compose exec postgres psql — the house pattern from
// automations-memory-review.spec.ts. Name marker keeps cleanup hermetic.
const SEED_PREFIX = 'e2e-artifact';

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

function cleanupSeeds(): void {
	sql(`DELETE FROM autonomous_artifacts WHERE name LIKE '${SEED_PREFIX}%'`);
}

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

// Seeded artifacts on a real completed session: the Documents block renders,
// Download serves bytes, Open mounts the doc panel; a deleted-file row shows
// metadata only.
test('receipt shows seeded artifacts with Open + Download and a deleted-file row', async ({
	page
}) => {
	const sessionId = sql(`SELECT id FROM autonomous_sessions WHERE status='completed' LIMIT 1`);
	if (!sessionId) test.skip(true, 'No completed autonomous session in the dev DB.');
	const fileId = sql(
		`SELECT f.id FROM files f JOIN users u ON f.user_id = u.id WHERE u.email = '${EMAIL}' LIMIT 1`
	);
	if (!fileId) test.skip(true, 'No file owned by the e2e user in the dev DB.');

	cleanupSeeds();
	sql(
		`INSERT INTO autonomous_artifacts (session_id, file_id, name, mime, size_bytes)` +
			` VALUES ('${sessionId}', '${fileId}', '${SEED_PREFIX}-memo.md', 'text/markdown', 4608)`
	);
	sql(
		`INSERT INTO autonomous_artifacts (session_id, file_id, name, mime, size_bytes)` +
			` VALUES ('${sessionId}', NULL, '${SEED_PREFIX}-deleted.md', 'text/markdown', 100)`
	);

	try {
		await login(page);
		await page.goto(`/automations/${sessionId}`);

		const results = page.getByRole('region', { name: 'Results' });
		await expect(results.getByText('Documents')).toBeVisible();

		// Live row: name + size + actions.
		const row = results.locator('li', { hasText: `${SEED_PREFIX}-memo.md` });
		await expect(row.getByText('4.5 KB')).toBeVisible();
		await expect(row.getByRole('link', { name: /download/i })).toHaveAttribute(
			'href',
			`/files/${fileId}/content`
		);

		// Download actually serves bytes through the proxy.
		const dl = await page.request.get(`/files/${fileId}/content`);
		expect(dl.ok()).toBe(true);

		// Open mounts the doc panel (aside landmark) with a tab for the file.
		await row.getByRole('button', { name: /open/i }).click();
		await expect(page.getByRole('complementary', { name: 'Document panel' })).toBeVisible();

		// Deleted-file row: metadata only.
		const deleted = results.locator('li', { hasText: `${SEED_PREFIX}-deleted.md` });
		await expect(deleted.getByText(/file deleted/i)).toBeVisible();
		await expect(deleted.getByRole('button', { name: /open/i })).toBeHidden();
	} finally {
		cleanupSeeds();
	}
});

// Backend integration (not UI): the artifacts endpoint is wired through the
// receipt's server load — a session with zero artifacts hides the block.
test('a session with no artifacts shows no Documents block', async ({ page }) => {
	const sessionId = sql(
		`SELECT s.id FROM autonomous_sessions s WHERE s.status='completed'` +
			` AND NOT EXISTS (SELECT 1 FROM autonomous_artifacts a WHERE a.session_id = s.id) LIMIT 1`
	);
	if (!sessionId) test.skip(true, 'No artifact-free completed session in the dev DB.');
	await login(page);
	await page.goto(`/automations/${sessionId}`);
	const results = page.getByRole('region', { name: 'Results' });
	await expect(results).toBeVisible();
	await expect(results.getByText('Documents')).toBeHidden();
});
```

- [ ] **Step 2: Run it live**

```bash
docker compose up -d --build donna-web
set -a; . ./.env; set +a; npx playwright test tests/automations-artifacts.spec.ts --reporter=line
```

Expected: 2 passed (or a skip with a clear reason if the dev DB lacks a completed session — then trigger one run-now first and re-run).

- [ ] **Step 3: Commit**

```bash
git add tests/automations-artifacts.spec.ts
git commit -m "test(automations): live e2e — seeded artifact rows on a real receipt"
git push
```

---

### Final verification checklist (orchestrator, not a subagent)

- [ ] `npm run check` → 0 errors 0 warnings · `npm run lint` → fully green · `npx vitest run` → baseline 1285 + all new pass.
- [ ] **Manual live — artifacts end-to-end:** `/automations/new` → pick a playbook + KB + tick "Save run documents" + cost cap → Run → wait terminal → either a Documents row (Open renders markdown inline via TextViewer; Download works) or the honest-fallback finding. Notification body mentions "document(s)" when `artifact_count > 0`.
- [ ] **Ask #9 acceptance:** `/automations/new` → source **Skill** → `dpa-checklist-review` + KB + cost cap → Run → session reaches `completed` (NOT failed-with-`skill registry not initialised`). Check `docker compose logs arq-worker | grep -i skill` shows the registry installing at startup.
- [ ] Whole-branch review (house loop) → PR with merge-commit instructions (squash would orphan `.git-blame-ignore-revs` entries).
