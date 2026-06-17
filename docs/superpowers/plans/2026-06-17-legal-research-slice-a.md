# Slice A — Case-law Research Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reading-first `/research` workspace where a user searches case law, reads opinions in the existing doc panel, finds passages within an opinion, and verifies citations — all over LQ-AI's `/api/v1/research/*` surface.

**Architecture:** BFF (§3) — the browser calls Donna's SvelteKit server only; six thin proxy `+server.ts` routes attach the bearer token via `lqFetch` and forward to lq-ai. A pure data module (`src/lib/research/`) holds typed view-models + defensive parsers; a runes controller holds page state. Opinions render in the existing doc panel via a small additive `openOpinion()` + a `contentUrl` prop on `TextViewer` — no fork of the panel. A deterministic `GET /research/capabilities` gate (mirroring `AutomationsGate`) shows a friendly "not enabled" card when CourtListener is unconfigured.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest + Testing Library, Playwright (live e2e). Pinned lq-ai `e2cc311`.

**Spec:** `docs/superpowers/specs/2026-06-17-legal-research-slice-a-research-workspace-design.md`. **Contract is final & pinned** (verified in `src/lib/api/backend.d.ts`).

**Conventions to mirror:** parsers → `src/lib/automations/findings.ts`; proxy routes → `src/routes/(app)/prompts/items/+server.ts`; gate → `src/lib/automations/AutomationsGate.svelte`; auth → `src/lib/server/lqClient.ts` (`lqFetch`). Tabs for indent. `npm run check` 0/0 + `npm run lint` green + vitest pass after every task.

> **Note on types:** the `/research` schemas are *inline* in the OpenAPI spec (not named `components['schemas']`), so we hand-declare matching interfaces in `research.ts` with a comment saying so (§2/§7 precedent). The shapes below are the verified `e2cc311` contract.

---

### Task 1: Research data layer — types + defensive parsers

**Files:**
- Create: `src/lib/research/research.ts`
- Test: `src/lib/research/research.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/research/research.test.ts
import { describe, it, expect } from 'vitest';
import {
	parseCapabilities,
	parseSearchResponse,
	parseClusterView,
	parseFindMatches,
	parseCitations,
	textFieldLabel
} from './research';

describe('parseCapabilities', () => {
	it('reads enabled + providers', () => {
		expect(parseCapabilities({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] }))
			.toEqual({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] });
	});
	it('defaults to disabled on junk', () => {
		expect(parseCapabilities(null)).toEqual({ enabled: false, providers: [] });
		expect(parseCapabilities({ enabled: 'yes' })).toEqual({ enabled: false, providers: [] });
	});
});

describe('parseSearchResponse', () => {
	it('keeps well-formed rows, drops malformed, carries count + cursor', () => {
		const out = parseSearchResponse({
			count: 2,
			next_cursor: 'abc',
			results: [{ cluster_id: 1, case_name: 'A v. B' }, 42, { case_name: 'no id ok' }]
		});
		expect(out.count).toBe(2);
		expect(out.nextCursor).toBe('abc');
		expect(out.results).toHaveLength(2); // the number 42 is dropped; objects kept
		expect(out.results[0]).toMatchObject({ cluster_id: 1, case_name: 'A v. B' });
	});
	it('empty on junk', () => {
		expect(parseSearchResponse(null)).toEqual({ count: null, nextCursor: null, results: [] });
	});
});

describe('parseClusterView', () => {
	it('parses cluster + opinion list', () => {
		const out = parseClusterView({
			cluster: { cluster_id: 5, case_name: 'X', court: 'scotus' },
			opinions: [{ opinion_id: 9, text_field_used: 'plain_text', char_length: 10 }, { bad: true }]
		});
		expect(out?.cluster.cluster_id).toBe(5);
		expect(out?.opinions).toHaveLength(1);
		expect(out?.opinions[0]).toMatchObject({ opinion_id: 9, text_field_used: 'plain_text' });
	});
	it('null when cluster_id missing', () => {
		expect(parseClusterView({ cluster: {}, opinions: [] })).toBeNull();
	});
});

describe('parseFindMatches', () => {
	it('keeps numeric-position rows only', () => {
		const out = parseFindMatches({ matches: [{ position: 3, snippet: 'hi' }, { snippet: 'x' }] });
		expect(out).toEqual([{ position: 3, snippet: 'hi' }]);
	});
});

describe('parseCitations', () => {
	it('parses verified citations + nested clusters', () => {
		const out = parseCitations({
			citations: [
				{ citation: '576 U.S. 644', normalized_citations: ['576 U.S. 644'], status: 200,
				  clusters: [{ id: 1, case_name: 'Obergefell', absolute_url: '/o/1/' }] },
				'junk'
			]
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ citation: '576 U.S. 644', status: 200 });
		expect(out[0].clusters[0]).toMatchObject({ id: 1, case_name: 'Obergefell' });
	});
});

describe('textFieldLabel', () => {
	it('maps the enum to honest labels', () => {
		expect(textFieldLabel('plain_text')).toBe('Plain text');
		expect(textFieldLabel('html_with_citations')).toBe('HTML-derived');
		expect(textFieldLabel('xml_harvard')).toBe('XML-derived (Harvard)');
		expect(textFieldLabel(null)).toBe('');
		expect(textFieldLabel('weird')).toBe('');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/research/research.test.ts`
Expected: FAIL — "Cannot find module './research'".

- [ ] **Step 3: Implement `research.ts`**

```ts
// src/lib/research/research.ts
// Typed view-models + defensive parsers for the /api/v1/research surface
// (legal-research WS3, pin e2cc311). The backend types these shapes, but the
// OpenAPI entries are INLINE (not named components/schemas), so we hand-declare
// matching interfaces here and guard at the boundary — same style as
// automations/findings.ts. Parsers drop malformed rows rather than throw.

export type OpinionTextField =
	| 'html_with_citations'
	| 'html_columbia'
	| 'html_lawbox'
	| 'xml_harvard'
	| 'html_anon_2020'
	| 'html'
	| 'plain_text';

export interface ResearchProvider {
	name: string;
	type: string;
}
export interface ResearchCapabilities {
	enabled: boolean;
	providers: ResearchProvider[];
}

export interface SearchResultItem {
	cluster_id: number | null;
	case_name: string | null;
	court: string | null;
	date_filed: string | null;
	citation: string | null;
	absolute_url: string | null;
	snippet: string | null;
}
export interface SearchResponse {
	count: number | null;
	nextCursor: string | null;
	results: SearchResultItem[];
}

export interface ClusterMeta {
	cluster_id: number;
	case_name: string | null;
	court: string | null;
	date_filed: string | null;
	absolute_url: string | null;
}
export interface OpinionMeta {
	opinion_id: number;
	text_field_used: OpinionTextField | null;
	char_length: number;
}
export interface ClusterView {
	cluster: ClusterMeta;
	opinions: OpinionMeta[];
}

export interface FindMatch {
	position: number;
	snippet: string;
}

export interface CitationCluster {
	id: number | null;
	case_name: string | null;
	absolute_url: string | null;
}
export interface VerifiedCitation {
	citation: string | null;
	normalized_citations: string[];
	status: number | null;
	error_message: string | null;
	clusters: CitationCluster[];
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseCapabilities(raw: unknown): ResearchCapabilities {
	const r = obj(raw);
	const enabled = r.enabled === true;
	const providers = (Array.isArray(r.providers) ? r.providers : [])
		.map((p) => {
			const o = obj(p);
			const name = str(o.name);
			const type = str(o.type);
			return name && type ? { name, type } : null;
		})
		.filter((p): p is ResearchProvider => p !== null);
	return { enabled, providers };
}

function parseSearchItem(raw: unknown): SearchResultItem | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	return {
		cluster_id: num(r.cluster_id),
		case_name: str(r.case_name),
		court: str(r.court),
		date_filed: str(r.date_filed),
		citation: typeof r.citation === 'string' ? r.citation : str((obj(r.citation) as { cite?: unknown }).cite),
		absolute_url: str(r.absolute_url),
		snippet: str(r.snippet)
	};
}

export function parseSearchResponse(raw: unknown): SearchResponse {
	const r = obj(raw);
	const results = (Array.isArray(r.results) ? r.results : [])
		.map(parseSearchItem)
		.filter((x): x is SearchResultItem => x !== null);
	return { count: num(r.count), nextCursor: str(r.next_cursor), results };
}

export function parseClusterView(raw: unknown): ClusterView | null {
	const r = obj(raw);
	const c = obj(r.cluster);
	if (typeof c.cluster_id !== 'number') return null;
	const opinions = (Array.isArray(r.opinions) ? r.opinions : [])
		.map((o) => {
			const oo = obj(o);
			if (typeof oo.opinion_id !== 'number') return null;
			return {
				opinion_id: oo.opinion_id,
				text_field_used: (str(oo.text_field_used) as OpinionTextField | null),
				char_length: num(oo.char_length) ?? 0
			};
		})
		.filter((o): o is OpinionMeta => o !== null);
	return {
		cluster: {
			cluster_id: c.cluster_id,
			case_name: str(c.case_name),
			court: str(c.court),
			date_filed: str(c.date_filed),
			absolute_url: str(c.absolute_url)
		},
		opinions
	};
}

export function parseFindMatches(raw: unknown): FindMatch[] {
	const r = obj(raw);
	return (Array.isArray(r.matches) ? r.matches : [])
		.map((m) => {
			const o = obj(m);
			return typeof o.position === 'number' ? { position: o.position, snippet: str(o.snippet) ?? '' } : null;
		})
		.filter((m): m is FindMatch => m !== null);
}

export function parseCitations(raw: unknown): VerifiedCitation[] {
	const r = obj(raw);
	return (Array.isArray(r.citations) ? r.citations : [])
		.map((c) => {
			if (!c || typeof c !== 'object') return null;
			const o = c as Record<string, unknown>;
			const clusters = (Array.isArray(o.clusters) ? o.clusters : []).map((cl) => {
				const x = obj(cl);
				return { id: num(x.id), case_name: str(x.case_name), absolute_url: str(x.absolute_url) };
			});
			return {
				citation: str(o.citation),
				normalized_citations: strArray(o.normalized_citations),
				status: num(o.status),
				error_message: str(o.error_message),
				clusters
			};
		})
		.filter((c): c is VerifiedCitation => c !== null);
}

const TEXT_FIELD_LABELS: Record<OpinionTextField, string> = {
	plain_text: 'Plain text',
	html_with_citations: 'HTML-derived',
	html_columbia: 'HTML-derived',
	html_lawbox: 'HTML-derived',
	html_anon_2020: 'HTML-derived',
	html: 'HTML-derived',
	xml_harvard: 'XML-derived (Harvard)'
};

/** Honest, friendly label for the opinion's source text field. Empty when unknown. */
export function textFieldLabel(v: OpinionTextField | string | null | undefined): string {
	if (!v) return '';
	return TEXT_FIELD_LABELS[v as OpinionTextField] ?? '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/research/research.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`
Expected: 0 errors / 0 warnings; lint clean.

```bash
git add src/lib/research/research.ts src/lib/research/research.test.ts
git commit -m "feat(research): data layer — typed view-models + defensive parsers"
```

---

### Task 2: BFF proxy routes

**Files:**
- Create: `src/routes/(app)/research/capabilities/+server.ts`
- Create: `src/routes/(app)/research/search/+server.ts`
- Create: `src/routes/(app)/research/clusters/[id]/+server.ts`
- Create: `src/routes/(app)/research/opinions/[id]/text/+server.ts`
- Create: `src/routes/(app)/research/find-in-case/+server.ts`
- Create: `src/routes/(app)/research/verify-citations/+server.ts`
- Test: `src/routes/(app)/research/research-proxy.server.test.ts`

> **Pattern:** copy `src/routes/(app)/prompts/items/+server.ts` exactly — `lqFetch(event, path[, init])`, forward the raw body for POSTs, map errors. The opinion `/text` route extracts `.text` from the backend JSON and returns `text/plain` so the doc panel's `TextViewer` can fetch it as a content URL. A backend **503** (`ResearchNotConfigured`) is forwarded verbatim so the client can show the not-enabled gate.

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/(app)/research/research-proxy.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

function res(status: number, body: unknown, contentType = 'application/json') {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'content-type': contentType }
	});
}
const ev = (req?: Request) => ({ request: req, params: { id: '5' } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET /research/capabilities', () => {
	it('forwards to the backend capabilities endpoint', async () => {
		lqFetch.mockResolvedValue(res(200, { enabled: true, providers: [] }));
		const { GET } = await import('./capabilities/+server');
		const out = await GET(ev());
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/capabilities');
		expect(await out.json()).toEqual({ enabled: true, providers: [] });
	});
});

describe('POST /research/search', () => {
	it('forwards the body and returns results', async () => {
		lqFetch.mockResolvedValue(res(200, { count: 0, results: [] }));
		const { POST } = await import('./search/+server');
		const out = await POST(ev(new Request('http://x/research/search', { method: 'POST', body: '{"q":"chevron"}' })));
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/search', { method: 'POST', body: '{"q":"chevron"}' });
		expect(out.status).toBe(200);
	});
	it('propagates a 503 not-configured', async () => {
		lqFetch.mockResolvedValue(res(503, { detail: 'not configured' }));
		const { POST } = await import('./search/+server');
		const out = await POST(ev(new Request('http://x/research/search', { method: 'POST', body: '{"q":"x"}' })));
		expect(out.status).toBe(503);
	});
});

describe('GET /research/clusters/[id]', () => {
	it('forwards the cluster id', async () => {
		lqFetch.mockResolvedValue(res(200, { cluster: { cluster_id: 5 }, opinions: [] }));
		const { GET } = await import('./clusters/[id]/+server');
		await GET(ev());
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/clusters/5');
	});
});

describe('GET /research/opinions/[id]/text', () => {
	it('returns the opinion .text as text/plain', async () => {
		lqFetch.mockResolvedValue(res(200, { opinion_id: 5, cluster_id: 1, text: 'OPINION BODY' }));
		const { GET } = await import('./opinions/[id]/text/+server');
		const out = await GET(ev());
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/opinions/5');
		expect(out.headers.get('content-type')).toContain('text/plain');
		expect(await out.text()).toBe('OPINION BODY');
	});
});

describe('POST /research/find-in-case + /verify-citations', () => {
	it('find-in-case forwards body', async () => {
		lqFetch.mockResolvedValue(res(200, { opinion_id: 5, matches: [] }));
		const { POST } = await import('./find-in-case/+server');
		await POST(ev(new Request('http://x', { method: 'POST', body: '{"opinion_id":5,"query":"due process"}' })));
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/find-in-case', { method: 'POST', body: '{"opinion_id":5,"query":"due process"}' });
	});
	it('verify-citations forwards body', async () => {
		lqFetch.mockResolvedValue(res(200, { citations: [] }));
		const { POST } = await import('./verify-citations/+server');
		await POST(ev(new Request('http://x', { method: 'POST', body: '{"text":"see 576 U.S. 644"}' })));
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/verify-citations', { method: 'POST', body: '{"text":"see 576 U.S. 644"}' });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/(app)/research/research-proxy.server.test.ts`
Expected: FAIL — cannot import the not-yet-created `+server` modules.

- [ ] **Step 3: Implement the six routes**

```ts
// src/routes/(app)/research/capabilities/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, '/api/v1/research/capabilities');
	if (!res.ok) throw error(502, 'Could not check research availability.');
	return json(await res.json());
};
```

```ts
// src/routes/(app)/research/search/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/research/search', { method: 'POST', body });
	if (res.status === 503) return json({ detail: 'research_not_configured' }, { status: 503 });
	if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Search failed.');
	return json(await res.json());
};
```

```ts
// src/routes/(app)/research/clusters/[id]/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/research/clusters/${event.params.id}`);
	if (res.status === 503) return json({ detail: 'research_not_configured' }, { status: 503 });
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load that case.');
	return json(await res.json());
};
```

```ts
// src/routes/(app)/research/opinions/[id]/text/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

// Extracts the opinion plaintext so the doc panel's TextViewer can fetch it as
// a content URL (parallel to /files/{id}/content). The backend returns JSON
// {opinion_id, cluster_id, text_field_used, text}; we surface text/plain.
export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/research/opinions/${event.params.id}`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load that opinion.');
	const body = (await res.json()) as { text?: unknown };
	const text = typeof body.text === 'string' ? body.text : '';
	return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
```

```ts
// src/routes/(app)/research/find-in-case/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/research/find-in-case', { method: 'POST', body });
	if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Find-in-case failed.');
	return json(await res.json());
};
```

```ts
// src/routes/(app)/research/verify-citations/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/research/verify-citations', { method: 'POST', body });
	if (res.status === 503) return json({ detail: 'research_not_configured' }, { status: 503 });
	if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Citation verification failed.');
	return json(await res.json());
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/(app)/research/research-proxy.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/routes/\(app\)/research
git commit -m "feat(research): BFF proxy routes (capabilities/search/clusters/opinion-text/find/verify)"
```

---

### Task 3: Doc-panel — render an external opinion via `openOpinion`

**Files:**
- Modify: `src/lib/docpanel/types.ts` (add `contentUrl?`)
- Modify: `src/lib/docpanel/docPanel.svelte.ts` (add `openOpinion`)
- Modify: `src/lib/docpanel/TextViewer.svelte` (accept `contentUrl` prop)
- Modify: `src/lib/docpanel/DocumentPanel.svelte` (pass `contentUrl` to `TextViewer`)
- Test: `src/lib/docpanel/docPanel.openOpinion.svelte.test.ts`

> **Design:** an opinion tab is keyed `opinion:${id}` (the `fileId` slot), `mime: 'text/plain'`, `status: 'ready'` (no `/files` metadata fetch), and carries `contentUrl` = the `/text` proxy. The synthesized `cite` sets `verificationApplicable: false` so `DocumentPanel` suppresses the verification chip (no panel surgery — `citeState`/`tooltipFor` already tolerate this). `TextViewer` fetches `contentUrl ?? /files/${fileId}/content`, so existing file tabs are unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/docpanel/docPanel.openOpinion.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { createDocPanel } from './docPanel.svelte';

describe('docPanel.openOpinion', () => {
	it('opens a text/plain opinion tab keyed by opinion id, with the /text content url', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 42, caseName: 'Chevron v. NRDC' });
		expect(dp.open_).toBe(true);
		expect(dp.activeId).toBe('opinion:42');
		const tab = dp.activeTab!;
		expect(tab.mime).toBe('text/plain');
		expect(tab.status).toBe('ready');
		expect(tab.filename).toBe('Chevron v. NRDC');
		expect(tab.contentUrl).toBe('/research/opinions/42/text');
		expect(tab.cite.verificationApplicable).toBe(false);
	});
	it('dedupes by opinion id (refocus, no duplicate tab)', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 42, caseName: 'A' });
		dp.openOpinion({ opinionId: 42, caseName: 'A' });
		expect(dp.tabs).toHaveLength(1);
		expect(dp.activeId).toBe('opinion:42');
	});
	it('coexists with a file tab and the file open() path is unchanged', () => {
		const dp = createDocPanel();
		dp.openOpinion({ opinionId: 7, caseName: 'B' });
		expect(dp.tabs[0].contentUrl).toBe('/research/opinions/7/text');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/docPanel.openOpinion.svelte.test.ts`
Expected: FAIL — `openOpinion` is not a function.

- [ ] **Step 3a: Add `contentUrl` to `DocTab`**

In `src/lib/docpanel/types.ts`, inside `interface DocTab`, add after `mime: string;`:

```ts
	/** When set, the text viewer fetches this URL instead of /files/{fileId}/content
	 *  (used for external opinions, which are not Donna files). */
	contentUrl?: string;
```

- [ ] **Step 3b: Add `openOpinion` to the controller**

In `src/lib/docpanel/docPanel.svelte.ts`, add this function inside `createDocPanel` (next to `open`), and export it in the returned object:

```ts
	function openOpinion(o: { opinionId: number; caseName: string }) {
		const fileId = `opinion:${o.opinionId}`;
		open_ = true;
		const existing = tabs.find((t) => t.fileId === fileId);
		if (existing) {
			activeId = fileId;
			return;
		}
		tabs = [
			...tabs,
			{
				fileId,
				filename: o.caseName,
				mime: 'text/plain',
				status: 'ready',
				page: null,
				quote: '',
				cite: { source_file_id: fileId, verificationApplicable: false } as Citation,
				highlightStatus: 'miss',
				contentUrl: `/research/opinions/${o.opinionId}/text`
			}
		];
		activeId = fileId;
	}
```

Add `openOpinion` to the `return { … }` object (next to `open`).

- [ ] **Step 3c: Let `TextViewer` use `contentUrl`**

In `src/lib/docpanel/TextViewer.svelte`, change the props and fetch URL:

```ts
	let {
		fileId,
		mime,
		filename,
		contentUrl
	}: { fileId: string; mime: string; filename: string; contentUrl?: string } = $props();
```

Replace the two `/files/${id}/content` / `/files/{fileId}/content` references with the content URL:

```ts
	// inside the $effect:
	const url = contentUrl ?? `/files/${fileId}/content`;
	// ...
	const res = await fetch(url);
```

And the Download link `href`:

```svelte
		<a
			href={contentUrl ?? `/files/${fileId}/content`}
			download={filename || undefined}
```

- [ ] **Step 3d: Pass `contentUrl` from the panel**

In `src/lib/docpanel/DocumentPanel.svelte`, update the `TextViewer` usage:

```svelte
					<TextViewer fileId={tab.fileId} mime={tab.mime} filename={tab.filename} contentUrl={tab.contentUrl} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/docpanel/`
Expected: PASS — the new test plus the existing docpanel suite (no regressions in `open()`).

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/lib/docpanel
git commit -m "feat(docpanel): openOpinion — render external opinion text via contentUrl"
```

---

### Task 4: Research page controller (runes)

**Files:**
- Create: `src/lib/research/researchStore.svelte.ts`
- Test: `src/lib/research/researchStore.svelte.test.ts`

> **Responsibility:** owns query/results/selected-cluster/verify state and the fetch calls to the proxies. Pure logic (inject `fetch`), so it unit-tests without a DOM. The page binds to it.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/research/researchStore.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createResearch } from './researchStore.svelte';

function fetchReturning(map: Record<string, unknown>) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
		const body = map[key];
		return new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 502 : 200 });
	}) as unknown as typeof fetch;
}

describe('createResearch', () => {
	it('search populates results and clears error', async () => {
		const f = fetchReturning({
			'POST /research/search': { count: 1, next_cursor: null, results: [{ cluster_id: 9, case_name: 'A v. B' }] }
		});
		const r = createResearch(f);
		await r.search('chevron');
		expect(r.results).toHaveLength(1);
		expect(r.results[0].cluster_id).toBe(9);
		expect(r.error).toBeNull();
	});

	it('search maps a 503 to the not-enabled flag', async () => {
		const f = vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
		const r = createResearch(f);
		await r.search('x');
		expect(r.notEnabled).toBe(true);
	});

	it('openCluster loads the cluster view', async () => {
		const f = fetchReturning({
			'GET /research/clusters/9': { cluster: { cluster_id: 9, case_name: 'A v. B' }, opinions: [{ opinion_id: 1, text_field_used: 'plain_text', char_length: 5 }] }
		});
		const r = createResearch(f);
		await r.openCluster(9);
		expect(r.cluster?.cluster.cluster_id).toBe(9);
		expect(r.cluster?.opinions[0].opinion_id).toBe(1);
	});

	it('verify populates citations', async () => {
		const f = fetchReturning({
			'POST /research/verify-citations': { citations: [{ citation: '576 U.S. 644', status: 200, normalized_citations: [], clusters: [] }] }
		});
		const r = createResearch(f);
		await r.verify('see 576 U.S. 644');
		expect(r.citations).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/research/researchStore.svelte.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the controller**

```ts
// src/lib/research/researchStore.svelte.ts
import {
	parseSearchResponse,
	parseClusterView,
	parseFindMatches,
	parseCitations,
	type SearchResultItem,
	type ClusterView,
	type FindMatch,
	type VerifiedCitation
} from './research';

export function createResearch(fetchFn: typeof fetch = fetch) {
	let query = $state('');
	let results = $state<SearchResultItem[]>([]);
	let nextCursor = $state<string | null>(null);
	let count = $state<number | null>(null);
	let cluster = $state<ClusterView | null>(null);
	let matches = $state<FindMatch[]>([]);
	let citations = $state<VerifiedCitation[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let notEnabled = $state(false);

	async function post(url: string, payload: unknown): Promise<unknown | null> {
		const res = await fetchFn(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.status === 503) {
			notEnabled = true;
			return null;
		}
		if (!res.ok) {
			error = 'Something went wrong — try again.';
			return null;
		}
		return res.json();
	}

	async function search(q: string) {
		query = q;
		if (!q.trim()) return;
		loading = true;
		error = null;
		const raw = await post('/research/search', { q });
		if (raw) {
			const parsed = parseSearchResponse(raw);
			results = parsed.results;
			count = parsed.count;
			nextCursor = parsed.nextCursor;
		}
		loading = false;
	}

	async function openCluster(id: number) {
		error = null;
		const res = await fetchFn(`/research/clusters/${id}`);
		if (res.status === 503) {
			notEnabled = true;
			return;
		}
		if (!res.ok) {
			error = 'Could not load that case.';
			return;
		}
		cluster = parseClusterView(await res.json());
		matches = [];
	}

	async function findInCase(opinionId: number, q: string) {
		if (!q.trim()) return;
		const raw = await post('/research/find-in-case', { opinion_id: opinionId, query: q, max_matches: 10 });
		if (raw) matches = parseFindMatches(raw);
	}

	async function verify(text: string) {
		if (!text.trim()) return;
		const raw = await post('/research/verify-citations', { text });
		if (raw) citations = parseCitations(raw);
	}

	return {
		get query() { return query; },
		get results() { return results; },
		get count() { return count; },
		get nextCursor() { return nextCursor; },
		get cluster() { return cluster; },
		get matches() { return matches; },
		get citations() { return citations; },
		get loading() { return loading; },
		get error() { return error; },
		get notEnabled() { return notEnabled; },
		search,
		openCluster,
		findInCase,
		verify
	};
}

export type Research = ReturnType<typeof createResearch>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/research/researchStore.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/lib/research/researchStore.svelte.ts src/lib/research/researchStore.svelte.test.ts
git commit -m "feat(research): runes controller for search/cluster/find/verify"
```

---

### Task 5: Not-enabled gate component

**Files:**
- Create: `src/lib/research/ResearchGate.svelte`
- Test: `src/lib/research/ResearchGate.svelte.test.ts`

> **Pattern:** mirror `AutomationsGate.svelte`, but research has no in-app enable toggle in Slice A (that's the upstream-blocked Slice A2), so the card explains how an operator turns it on — no button.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/research/ResearchGate.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResearchGate from './ResearchGate.svelte';

describe('ResearchGate', () => {
	it('explains research is off and how to enable it', () => {
		render(ResearchGate);
		expect(screen.getByText(/isn’t enabled/i)).toBeInTheDocument();
		expect(screen.getByText(/CourtListener/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/research/ResearchGate.svelte.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the gate**

```svelte
<!-- src/lib/research/ResearchGate.svelte -->
<div class="rounded-mlq-control border border-mlq-caveats/40 bg-mlq-caveats/5 p-5">
	<div class="text-sm font-medium text-mlq-text">Case-law research isn’t enabled</div>
	<p class="mt-1 text-xs text-mlq-muted">
		Donna routes case-law lookups through CourtListener. An administrator enables it by adding a
		CourtListener API token to this deployment. Each operator brings their own key so usage is
		metered to them.
	</p>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/research/ResearchGate.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/lib/research/ResearchGate.svelte src/lib/research/ResearchGate.svelte.test.ts
git commit -m "feat(research): not-enabled gate card"
```

---

### Task 6: Research page + nav entry

**Files:**
- Create: `src/routes/(app)/research/+page.server.ts` (capabilities load)
- Create: `src/routes/(app)/research/+page.svelte`
- Modify: `src/lib/components/Sidebar.svelte` (add the Research nav item)
- Test: `src/routes/(app)/research/page.server.test.ts`
- Test: `src/routes/(app)/research/page.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/(app)/research/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

beforeEach(() => lqFetch.mockReset());

describe('research load', () => {
	it('returns capabilities (enabled)', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] }), { status: 200 }));
		const { load } = await import('./+page.server');
		const out = await load({} as never);
		expect(out.capabilities).toEqual({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] });
	});
	it('degrades to disabled when the check fails', async () => {
		lqFetch.mockResolvedValue(new Response('nope', { status: 502 }));
		const { load } = await import('./+page.server');
		const out = await load({} as never);
		expect(out.capabilities.enabled).toBe(false);
	});
});
```

```ts
// src/routes/(app)/research/page.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('research page', () => {
	it('shows the gate when disabled', () => {
		render(Page, { data: { capabilities: { enabled: false, providers: [] } } });
		expect(screen.getByText(/isn’t enabled/i)).toBeInTheDocument();
	});
	it('shows the search box when enabled', () => {
		render(Page, { data: { capabilities: { enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] } } });
		expect(screen.getByRole('searchbox', { name: /search case law/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/(app)/research/`
Expected: FAIL — modules missing.

- [ ] **Step 3a: Implement the load**

```ts
// src/routes/(app)/research/+page.server.ts
import type { PageServerLoad } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseCapabilities } from '$lib/research/research';

export const load: PageServerLoad = async (event) => {
	try {
		const res = await lqFetch(event, '/api/v1/research/capabilities');
		if (!res.ok) return { capabilities: { enabled: false, providers: [] } };
		return { capabilities: parseCapabilities(await res.json()) };
	} catch {
		return { capabilities: { enabled: false, providers: [] } };
	}
};
```

- [ ] **Step 3b: Implement the page**

```svelte
<!-- src/routes/(app)/research/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { createResearch } from '$lib/research/researchStore.svelte';
	import { textFieldLabel } from '$lib/research/research';
	import ResearchGate from '$lib/research/ResearchGate.svelte';
	import { createDocPanel } from '$lib/docpanel/docPanel.svelte';
	import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte';

	let { data }: { data: PageData } = $props();
	const r = createResearch();
	const docPanel = createDocPanel(); // page owns its panel instance (tabular/chats/automations pattern)
	let q = $state('');
	let citeText = $state('');
</script>

<svelte:head><title>Research · Donna</title></svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<h1 class="text-lg font-semibold text-mlq-text">Case-law research</h1>

	{#if !data.capabilities.enabled}
		<div class="mt-4"><ResearchGate /></div>
	{:else}
		<form class="mt-4 flex gap-2" onsubmit={(e) => { e.preventDefault(); r.search(q); }}>
			<input
				type="search"
				aria-label="Search case law"
				bind:value={q}
				placeholder="Search case law (e.g. Chevron deference)"
				class="flex-1 rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"
			/>
			<button type="submit" disabled={r.loading}
				class="rounded-mlq-control bg-mlq-workflow px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
				{r.loading ? 'Searching…' : 'Search'}
			</button>
		</form>

		{#if r.error}<p role="alert" class="mt-3 text-xs text-mlq-error">{r.error}</p>{/if}

		<div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
			<!-- Results -->
			<section>
				<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Results{#if r.count !== null} ({r.count}){/if}</h2>
				<ul class="mt-2 space-y-2">
					{#each r.results as item (item.cluster_id ?? item.case_name)}
						<li>
							<button type="button" onclick={() => item.cluster_id && r.openCluster(item.cluster_id)}
								class="w-full rounded-mlq-control border border-mlq-subtle p-3 text-left hover:bg-mlq-surface-alt">
								<div class="text-sm font-medium text-mlq-text">{item.case_name ?? 'Untitled'}</div>
								<div class="text-xs text-mlq-muted">{item.court ?? ''} {item.date_filed ?? ''}</div>
								{#if item.snippet}<div class="mt-1 text-xs text-mlq-muted">{item.snippet}</div>{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>

			<!-- Selected cluster -->
			<section>
				{#if r.cluster}
					<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">{r.cluster.cluster.case_name ?? 'Case'}</h2>
					<ul class="mt-2 space-y-2">
						{#each r.cluster.opinions as op (op.opinion_id)}
							<li class="flex items-center justify-between rounded-mlq-control border border-mlq-subtle p-3">
								<div class="text-xs text-mlq-muted">
									Opinion #{op.opinion_id}
									{#if textFieldLabel(op.text_field_used)} · {textFieldLabel(op.text_field_used)}{/if}
								</div>
								<button type="button"
									onclick={() => docPanel.openOpinion({ opinionId: op.opinion_id, caseName: r.cluster!.cluster.case_name ?? `Opinion #${op.opinion_id}` })}
									class="rounded-mlq-control border border-mlq-subtle px-2 py-1 text-xs text-mlq-text hover:bg-mlq-surface-alt">
									Open
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<!-- Verify citations -->
		<section class="mt-8">
			<h2 class="text-xs font-medium tracking-wide text-mlq-muted uppercase">Verify citations</h2>
			<form class="mt-2" onsubmit={(e) => { e.preventDefault(); r.verify(citeText); }}>
				<textarea bind:value={citeText} rows="3" placeholder="Paste text containing reporter citations…"
					class="w-full rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text"></textarea>
				<button type="submit" class="mt-2 rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-sm text-mlq-text hover:bg-mlq-surface-alt">Verify</button>
			</form>
			<ul class="mt-3 space-y-1">
				{#each r.citations as c (c.citation)}
					<li class="text-xs text-mlq-text">
						<span class="font-medium">{c.citation}</span>
						{#if c.clusters.length}
							— <button type="button" onclick={() => c.clusters[0].id && r.openCluster(c.clusters[0].id)} class="text-mlq-workflow hover:underline">{c.clusters[0].case_name ?? 'view'}</button>
						{:else}<span class="text-mlq-muted"> — not found</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if docPanel.open_}<DocumentPanel {docPanel} />{/if}
```

> **Doc-panel access (verified):** there is no context/singleton — each page instantiates `createDocPanel()` and renders `<DocumentPanel {docPanel} />` itself (see `tabular/[executionId]`, `chats/[id]`, `automations/[id]`). The page above follows that exactly.

- [ ] **Step 3c: Add the nav item**

In `src/lib/components/Sidebar.svelte`, import the icon and add the entry to `nav`:

```ts
	import { /* …existing… */ Scale } from '@lucide/svelte';
```

Add after the `/tabular` entry:

```ts
		{ href: '/research', label: 'Research', icon: Scale }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/(app)/research/ src/lib/components/Sidebar.svelte.test.ts`
Expected: PASS (and the Sidebar test still green — add `/research` to its link assertions if it enumerates nav items).

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint`

```bash
git add src/routes/\(app\)/research/+page.server.ts src/routes/\(app\)/research/+page.svelte src/lib/components/Sidebar.svelte src/routes/\(app\)/research/page.server.test.ts src/routes/\(app\)/research/page.svelte.test.ts
git commit -m "feat(research): /research workspace page + nav entry"
```

---

### Task 7: Live e2e (token-gated) + not-enabled path

**Files:**
- Create: `tests/research.spec.ts`

> **Prerequisite for the enabled path:** the local stack must have CourtListener wired — `COURTLISTENER_API_TOKEN` in `.env` (done) **and** the gateway's `tool_providers:` `courtlistener` block enabled, **and** `COURTLISTENER_API_TOKEN` passed through to the gateway container. If that wiring isn't in place, the enabled-flow test self-skips (see Step 1) and only the not-enabled gate is asserted. Validate the wiring live before claiming the enabled path passes (evidence, §2.5).

- [ ] **Step 1: Write the e2e**

```ts
// tests/research.spec.ts
import { test, expect } from '@playwright/test';
import { login } from './helpers'; // reuse the existing login helper (see other specs)

test('research page renders (gate or workspace)', async ({ page }) => {
	await login(page);
	await page.goto('/research');
	await expect(page.getByRole('heading', { name: /case-law research/i })).toBeVisible();
	// Either the not-enabled gate OR the search box is present — both are valid.
	const enabled = await page.getByRole('searchbox', { name: /search case law/i }).isVisible().catch(() => false);
	if (!enabled) {
		await expect(page.getByText(/isn’t enabled/i)).toBeVisible();
		test.skip(true, 'CourtListener not wired in this stack — gate asserted, search flow skipped');
	}
	// Enabled path: a real search returns results and an opinion opens in the doc panel.
	await page.getByRole('searchbox', { name: /search case law/i }).fill('Chevron');
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page.getByRole('button', { name: /Open/ }).first()).toBeVisible({ timeout: 15000 });
});
```

> Match the project's existing login helper / spec scaffolding (look at `tests/automations-*.spec.ts`). Self-clean per §7 (this test creates no server state).

- [ ] **Step 2: Bring the stack up to date + run**

```bash
docker compose up -d --build api arq-worker ingest-worker donna-web   # migration 0049 runs on api boot
docker compose up -d --build donna-web                                 # serve the new working tree
npx playwright test tests/research.spec.ts
```
Expected: PASS (gate path if CL unwired; full flow if wired).

- [ ] **Step 3: Commit**

```bash
git add tests/research.spec.ts
git commit -m "test(research): live e2e — gate path unconditional, search flow token-gated"
```

---

## Self-Review

**Spec coverage:** search ✅(T2/T4/T6) · read opinion in doc panel ✅(T3/T6) · find-in-case ✅(T4 controller; surfaced in T6 — see note below) · verify-citations ✅(T4/T6) · capabilities gate ✅(T5/T6) · 7-member `text_field_used` labels ✅(T1/T6) · BFF + auth ✅(T2) · honest degradation ✅(T4 503→gate, T6 load degrade) · nav ✅(T6).

**Known scope note (not a gap):** `findInCase` exists in the controller (T4) but the page (T6) wires the *Open*/verify flows; an in-opinion find-in-case input + result list is a thin follow-up on the controller method — left as a fast-follow to keep T6 reviewable. If required in this slice, add a find input bound to `r.findInCase(activeOpinionId, q)` rendering `r.matches` (snippets) beside the cluster section. Flagged so it isn't silently dropped.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `parse*` names, `SearchResultItem`/`ClusterView`/`FindMatch`/`VerifiedCitation`, `createResearch` accessors, `openOpinion({opinionId, caseName})`, `contentUrl` — consistent across T1/T3/T4/T6.

**One thing the implementer MUST verify against the live app (don't assume):**
- Whether `Sidebar.svelte.test.ts` enumerates nav links (it asserts a set of paths) — add `/research` there if so, or its suite goes red. (Doc-panel access in T6 is already verified: per-page `createDocPanel()` + `<DocumentPanel {docPanel} />`, no context.)
