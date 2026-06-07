# Donna P3-1 — Document panel shell + PDF rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a verified citation pill opens a right-docked, resizable panel that renders the cited PDF (no highlight yet).

**Architecture:** Two thin BFF proxies expose the lq-ai `/files/{id}` metadata and `/files/{id}/content` bytes. A `docPanel` rune controller (created by the chat page) tracks open tabs + active doc + panel width. `DocumentPanel.svelte` is the docked shell (single doc, resize, close) hosting `PdfViewer.svelte`, which fetches the bytes and delegates actual canvas+text-layer rendering to `pdfRender.ts` (lazy `pdfjs-dist`, isolated so the orchestration stays unit-testable). The citation pill click is threaded from `CitationView` → `Message` → chat page → `docPanel.open`.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), `pdfjs-dist` (new, lazy-loaded), Vitest + @testing-library/svelte, Playwright.

**Reference patterns (read before starting):**

- BFF JSON proxy + gateway-error mapping: `src/routes/(app)/models/+server.ts` and its test `src/routes/(app)/models/server.test.ts`.
- BFF byte/stream passthrough: `src/routes/(app)/chats/[id]/receipts/export.jsonl/+server.ts`.
- Rune controller (closure factory, injectable `fetchFn`): `src/lib/enhance/enhance.svelte.ts`.
- Citation pill rendering + click handling: `src/lib/components/CitationView.svelte` (pills carry `data-cite-index`; the citation for index `n` is `citations[n-1]`).
- Message → CitationView wiring: `src/lib/components/Message.svelte:48`.
- Chat page host: `src/routes/(app)/chats/[id]/+page.svelte` (creates `createChatStream`/`createSkillAttach`/`createEnhance`; renders `Message` and `ReceiptsDrawer`).
- `Citation` type: `src/lib/citations/types.ts` (`source_file_id`, `source_page?`, `source_text`, …).

**Quality bar:** `npm run check` = 0 errors, 0 warnings. Unit: `npx vitest run`. Annotate test fixtures so literal-union types don't widen. Only add a `<!-- svelte-ignore <exact_rule> -->` where a real warning fires.

---

## Task 1: BFF file-metadata proxy (`GET /files/[id]`)

**Files:**

- Create: `src/routes/(app)/files/[id]/+server.ts`
- Test: `src/routes/(app)/files/[id]/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/files/[id]/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id = 'f1') => ({ params: { id } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /files/[id]', () => {
	it('proxies the file-metadata endpoint and returns the body', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf' }), {
				status: 200
			})
		);
		const res = await GET(event('f1'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files/f1');
		expect(await res.json()).toEqual({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf' });
	});

	it('passes through 404 (missing/cross-user file)', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
	});

	it('passes through 503/504 and maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 503 });
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/\(app\)/files/\[id\]/server.test.ts`
Expected: FAIL — cannot resolve `./+server` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/(app)/files/[id]/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/files/${event.params.id}`);
	if (!res.ok) {
		// 404 (missing/soft-deleted/cross-user) and the gateway 503/504 signals pass
		// through; anything else becomes 502.
		const status =
			res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
		throw error(status, 'Could not load file metadata.');
	}
	return json(await res.json());
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/\(app\)/files/\[id\]/server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/files/[id]/+server.ts" "src/routes/(app)/files/[id]/server.test.ts"
git commit -m "feat(p3-1): BFF file-metadata proxy GET /files/[id]"
```

---

## Task 2: BFF file-content byte proxy (`GET /files/[id]/content`)

**Files:**

- Create: `src/routes/(app)/files/[id]/content/+server.ts`
- Test: `src/routes/(app)/files/[id]/content/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/(app)/files/[id]/content/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id = 'f1') => ({ params: { id } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /files/[id]/content', () => {
	it('streams the upstream bytes through with the upstream content-type', async () => {
		const upstream = new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
			status: 200,
			headers: { 'content-type': 'application/pdf', 'content-length': '4' }
		});
		lqFetch.mockResolvedValue(upstream);
		const res = await GET(event('f1'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files/f1/content');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/pdf');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([0x25, 0x50, 0x44, 0x46])
		);
	});

	it('passes through 404 and maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/\(app\)/files/\[id\]/content/server.test.ts`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/(app)/files/[id]/content/+server.ts
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/files/${event.params.id}/content`);
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load file content.');
	// Pass the upstream bytes straight through (no buffering); preserve the stored
	// MIME type so the client can choose PDF.js vs. a fallback. Like the SSE/export routes.
	return new Response(res.body, {
		status: res.status,
		headers: {
			'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/\(app\)/files/\[id\]/content/server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/files/[id]/content/+server.ts" "src/routes/(app)/files/[id]/content/server.test.ts"
git commit -m "feat(p3-1): BFF file-content byte proxy GET /files/[id]/content"
```

---

## Task 3: `docPanel` rune controller

**Files:**

- Create: `src/lib/docpanel/types.ts`
- Create: `src/lib/docpanel/docPanel.svelte.ts`
- Test: `src/lib/docpanel/docPanel.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/docpanel/docPanel.svelte.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDocPanel } from './docPanel.svelte';
import type { Citation } from '$lib/citations/types';

const cite = (over: Partial<Citation> = {}): Citation => ({
	id: 'c1',
	source_file_id: 'f1',
	source_page: 1,
	source_text: 'hello',
	verified: true,
	partial: false,
	...over
});

const meta = (over = {}) =>
	new Response(
		JSON.stringify({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf', ...over }),
		{ status: 200 }
	);

beforeEach(() => localStorage.clear());

describe('createDocPanel', () => {
	it('opens a tab from a citation, sets it active, and records the pending highlight', async () => {
		const fetchFn = vi.fn().mockResolvedValue(meta());
		const dp = createDocPanel();
		await dp.open(
			cite({ source_file_id: 'f1', source_page: 3, source_text: 'clause text' }),
			fetchFn
		);
		expect(fetchFn).toHaveBeenCalledWith('/files/f1');
		expect(dp.open_).toBe(true);
		expect(dp.tabs).toHaveLength(1);
		expect(dp.activeId).toBe('f1');
		expect(dp.activeTab).toMatchObject({
			fileId: 'f1',
			filename: 'a.pdf',
			mime: 'application/pdf',
			status: 'ready',
			page: 3,
			quote: 'clause text'
		});
	});

	it('dedupes by source_file_id and just refocuses the existing tab', async () => {
		const fetchFn = vi.fn().mockResolvedValue(meta());
		const dp = createDocPanel();
		await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
		await dp.open(cite({ source_file_id: 'f1', source_page: 9, source_text: 'other' }), fetchFn);
		expect(dp.tabs).toHaveLength(1);
		expect(dp.activeTab).toMatchObject({ fileId: 'f1', page: 9, quote: 'other' });
	});

	it('marks the tab status error when metadata fetch fails', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		const dp = createDocPanel();
		await dp.open(cite(), fetchFn);
		expect(dp.activeTab?.status).toBe('error');
	});

	it('closes a tab; closing the last tab closes the panel', async () => {
		const fetchFn = vi.fn().mockResolvedValue(meta());
		const dp = createDocPanel();
		await dp.open(cite({ source_file_id: 'f1' }), fetchFn);
		dp.close('f1');
		expect(dp.tabs).toHaveLength(0);
		expect(dp.open_).toBe(false);
	});

	it('persists width to localStorage and restores it on a fresh controller', () => {
		const dp = createDocPanel();
		dp.setWidth(620);
		expect(localStorage.getItem('donna.docpanel.width')).toBe('620');
		expect(createDocPanel().width).toBe(620);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts`
Expected: FAIL — cannot resolve `./docPanel.svelte`.

- [ ] **Step 3: Write the types**

```ts
// src/lib/docpanel/types.ts
export type DocTabStatus = 'loading' | 'ready' | 'error';

export interface DocTab {
	fileId: string;
	filename: string;
	mime: string;
	status: DocTabStatus;
	/** 1-based page the cited span lives on (used for highlight in P3-2). */
	page: number | null;
	/** Verbatim cited text (used for highlight in P3-2). */
	quote: string;
}
```

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/docpanel/docPanel.svelte.ts
import type { Citation } from '$lib/citations/types';
import type { DocTab } from './types';

const WIDTH_KEY = 'donna.docpanel.width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

function readWidth(): number {
	try {
		const v = Number(localStorage.getItem(WIDTH_KEY));
		return Number.isFinite(v) && v > 0 ? v : DEFAULT_WIDTH;
	} catch {
		return DEFAULT_WIDTH;
	}
}

export function createDocPanel() {
	let open_ = $state(false);
	let tabs = $state<DocTab[]>([]);
	let activeId = $state<string | null>(null);
	let width = $state(readWidth());

	const activeTab = $derived(tabs.find((t) => t.fileId === activeId) ?? null);

	async function open(c: Citation, fetchFn: typeof fetch = fetch) {
		const fileId = c.source_file_id;
		const page = c.source_page ?? null;
		const quote = c.source_text ?? '';
		open_ = true;

		const existing = tabs.find((t) => t.fileId === fileId);
		if (existing) {
			existing.page = page;
			existing.quote = quote;
			activeId = fileId;
			return;
		}

		const tab: DocTab = { fileId, filename: '', mime: '', status: 'loading', page, quote };
		tabs = [...tabs, tab];
		activeId = fileId;

		try {
			const res = await fetchFn(`/files/${fileId}`);
			if (!res.ok) throw new Error(String(res.status));
			const meta = (await res.json()) as { filename?: string; mime_type?: string };
			tab.filename = meta.filename ?? '';
			tab.mime = meta.mime_type ?? '';
			tab.status = 'ready';
		} catch {
			tab.status = 'error';
		}
	}

	function setActive(id: string) {
		if (tabs.some((t) => t.fileId === id)) activeId = id;
	}

	function close(id: string) {
		tabs = tabs.filter((t) => t.fileId !== id);
		if (activeId === id) activeId = tabs.at(-1)?.fileId ?? null;
		if (tabs.length === 0) open_ = false;
	}

	function closePanel() {
		open_ = false;
	}

	function setWidth(px: number) {
		width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));
		try {
			localStorage.setItem(WIDTH_KEY, String(width));
		} catch {
			/* storage unavailable — keep in-memory width */
		}
	}

	return {
		get open_() {
			return open_;
		},
		get tabs() {
			return tabs;
		},
		get activeId() {
			return activeId;
		},
		get activeTab() {
			return activeTab;
		},
		get width() {
			return width;
		},
		open,
		setActive,
		close,
		closePanel,
		setWidth
	};
}

export type DocPanel = ReturnType<typeof createDocPanel>;
```

> Note: the getter is named `open_` (trailing underscore) because `open` is already the async method name; keep both distinct.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/docpanel/docPanel.svelte.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/docpanel/types.ts src/lib/docpanel/docPanel.svelte.ts src/lib/docpanel/docPanel.svelte.test.ts
git commit -m "feat(p3-1): docPanel controller (tabs, active, width persistence, pending highlight)"
```

---

## Task 4: Add `pdfjs-dist` + isolated `pdfRender.ts`

**Files:**

- Modify: `package.json` (add `pdfjs-dist` dependency)
- Create: `src/lib/docpanel/pdfRender.ts`

This task isolates all `pdfjs-dist` usage in one browser-only module so the rest of the panel stays unit-testable. Actual rendering is validated by the Task 8 live e2e (canvas/text-layer don't render under jsdom).

- [ ] **Step 1: Install the dependency**

Run: `npm install pdfjs-dist`
Expected: `pdfjs-dist` appears under `dependencies` in `package.json`; lockfile updates.

- [ ] **Step 2: Write the render module**

```ts
// src/lib/docpanel/pdfRender.ts
// All pdfjs-dist usage lives here, lazily imported so the ~1MB worker stays off
// the chat page's critical path. Browser-only — never called during SSR.

export interface RenderedPdf {
	numPages: number;
}

/**
 * Render every page of a PDF (canvas + selectable text layer) into `container`.
 * P3-2 will extend this to locate + highlight the cited span; P3-1 only renders.
 */
export async function renderPdf(container: HTMLElement, bytes: ArrayBuffer): Promise<RenderedPdf> {
	const pdfjs = await import('pdfjs-dist');
	const { TextLayer } = pdfjs;
	// Resolve the worker as a URL through Vite so it is emitted as a real asset.
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
	container.replaceChildren();

	for (let n = 1; n <= doc.numPages; n++) {
		const page = await doc.getPage(n);
		const viewport = page.getViewport({ scale: 1.4 });

		const pageEl = document.createElement('div');
		pageEl.className = 'pdf-page';
		pageEl.dataset.pageNumber = String(n);
		pageEl.style.position = 'relative';
		pageEl.style.width = `${viewport.width}px`;
		pageEl.style.height = `${viewport.height}px`;
		pageEl.style.margin = '0 auto 12px';

		const canvas = document.createElement('canvas');
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		const ctx = canvas.getContext('2d')!;
		pageEl.appendChild(canvas);

		const textLayerEl = document.createElement('div');
		textLayerEl.className = 'textLayer';
		pageEl.appendChild(textLayerEl);

		container.appendChild(pageEl);

		await page.render({ canvasContext: ctx, viewport, canvas }).promise;
		const textContent = await page.getTextContent();
		const textLayer = new TextLayer({
			textContentSource: textContent,
			container: textLayerEl,
			viewport
		});
		await textLayer.render();
	}

	return { numPages: doc.numPages };
}
```

> If the installed `pdfjs-dist` major version does not export `TextLayer` or changes the `render()` signature, adapt to the installed version's API (check `node_modules/pdfjs-dist/types/src/pdf.d.ts`). The contract this plan depends on is only: "render all pages into `container` and produce a `.textLayer` element per page." The text layer is required so P3-2 can search for the cited text.

- [ ] **Step 3: Verify the project still type-checks and builds the worker asset**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings". (The vendor `ERR_MODULE_NOT_FOUND` stderr is harmless.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/docpanel/pdfRender.ts
git commit -m "feat(p3-1): add pdfjs-dist + isolated pdfRender module (canvas + text layer)"
```

---

## Task 5: `PdfViewer.svelte` (fetch bytes → render)

**Files:**

- Create: `src/lib/docpanel/PdfViewer.svelte`
- Test: `src/lib/docpanel/PdfViewer.svelte.test.ts`

`PdfViewer` orchestrates: fetch `/files/{id}/content` → ArrayBuffer → call `renderPdf`. `renderPdf` is an injectable prop (defaults to the real one) so the test can verify orchestration without a real PDF engine.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/docpanel/PdfViewer.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import PdfViewer from './PdfViewer.svelte';

describe('PdfViewer', () => {
	it('fetches the file content and hands the bytes to renderPdf', async () => {
		const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } })
			);
		const renderPdf = vi.fn().mockResolvedValue({ numPages: 2 });

		render(PdfViewer, { props: { fileId: 'f1', fetchFn, renderPdf } });
		// allow the onMount async chain to settle
		await vi.waitFor(() => expect(renderPdf).toHaveBeenCalledTimes(1));

		expect(fetchFn).toHaveBeenCalledWith('/files/f1/content');
		const passedBytes = new Uint8Array(renderPdf.mock.calls[0][1]);
		expect(passedBytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
	});

	it('shows an error state when the content fetch fails', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 502 }));
		const renderPdf = vi.fn();
		render(PdfViewer, { props: { fileId: 'f1', fetchFn, renderPdf } });
		await vi.waitFor(() => expect(screen.getByTestId('pdf-error')).toBeInTheDocument());
		expect(renderPdf).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/PdfViewer.svelte.test.ts`
Expected: FAIL — cannot resolve `./PdfViewer.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/docpanel/PdfViewer.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { renderPdf as defaultRenderPdf, type RenderedPdf } from './pdfRender';

	let {
		fileId,
		fetchFn = fetch,
		renderPdf = defaultRenderPdf
	}: {
		fileId: string;
		fetchFn?: typeof fetch;
		renderPdf?: (container: HTMLElement, bytes: ArrayBuffer) => Promise<RenderedPdf>;
	} = $props();

	let container = $state<HTMLElement | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetchFn(`/files/${fileId}/content`);
				if (!res.ok) throw new Error(String(res.status));
				const bytes = await res.arrayBuffer();
				if (cancelled || !container) return;
				await renderPdf(container, bytes);
				if (!cancelled) status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="relative h-full overflow-auto bg-mlq-surface-alt">
	{#if status === 'loading'}
		<p data-testid="pdf-loading" class="p-4 text-center text-xs text-mlq-muted">
			Loading document…
		</p>
	{:else if status === 'error'}
		<p data-testid="pdf-error" class="p-4 text-center text-xs text-mlq-error">
			Could not load this document.
		</p>
	{/if}
	<div bind:this={container} data-testid="pdf-pages" class="py-3"></div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/docpanel/PdfViewer.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docpanel/PdfViewer.svelte src/lib/docpanel/PdfViewer.svelte.test.ts
git commit -m "feat(p3-1): PdfViewer fetches content bytes and renders via pdfRender"
```

---

## Task 6: `DocumentPanel.svelte` shell (resize + close)

**Files:**

- Create: `src/lib/docpanel/DocumentPanel.svelte`
- Test: `src/lib/docpanel/DocumentPanel.svelte.test.ts`

The panel takes a `docPanel` controller as a prop. It renders the active tab's filename, a close button (calls `closePanel`), a drag handle that calls `setWidth`, and hosts `PdfViewer` for the active PDF tab. Tabs UI (multiple) lands in P3-3 — here there is one active doc.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/docpanel/DocumentPanel.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DocumentPanel from './DocumentPanel.svelte';
import type { DocPanel } from './docPanel.svelte';

// A hand-rolled stub controller (plain object) matching the DocPanel surface the panel uses.
function stub(over: Partial<DocPanel> = {}): DocPanel {
	return {
		open_: true,
		tabs: [
			{
				fileId: 'f1',
				filename: 'spike.pdf',
				mime: 'application/pdf',
				status: 'ready',
				page: 1,
				quote: 'x'
			}
		],
		activeId: 'f1',
		activeTab: {
			fileId: 'f1',
			filename: 'spike.pdf',
			mime: 'application/pdf',
			status: 'ready',
			page: 1,
			quote: 'x'
		},
		width: 480,
		open: vi.fn(),
		setActive: vi.fn(),
		close: vi.fn(),
		closePanel: vi.fn(),
		setWidth: vi.fn(),
		...over
	} as unknown as DocPanel;
}

describe('DocumentPanel', () => {
	it('renders the active tab filename', () => {
		render(DocumentPanel, { props: { docPanel: stub() } });
		expect(screen.getByText('spike.pdf')).toBeInTheDocument();
	});

	it('calls closePanel when the close button is clicked', async () => {
		const dp = stub();
		render(DocumentPanel, { props: { docPanel: dp } });
		await userEvent.click(screen.getByRole('button', { name: /close document panel/i }));
		expect(dp.closePanel).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: FAIL — cannot resolve `./DocumentPanel.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/docpanel/DocumentPanel.svelte -->
<script lang="ts">
	import { X } from '@lucide/svelte';
	import PdfViewer from './PdfViewer.svelte';
	import type { DocPanel } from './docPanel.svelte';

	let { docPanel }: { docPanel: DocPanel } = $props();

	// Drag the left edge to resize. Panel is docked right, so a smaller clientX = wider panel.
	function startResize(e: PointerEvent) {
		e.preventDefault();
		const onMove = (m: PointerEvent) => docPanel.setWidth(window.innerWidth - m.clientX);
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}
</script>

<aside
	class="relative flex h-full shrink-0 flex-col border-l border-mlq-subtle bg-mlq-surface"
	style="width:{docPanel.width}px"
	aria-label="Document panel"
>
	<div class="flex items-center gap-2 border-b border-mlq-subtle px-3 py-2">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute top-0 left-0 h-full w-1 cursor-col-resize"
			onpointerdown={startResize}
			aria-hidden="true"
		></div>
		<span class="truncate text-xs font-medium text-mlq-text"
			>{docPanel.activeTab?.filename || 'Document'}</span
		>
		{#if docPanel.activeTab?.page}
			<span class="text-[10px] text-mlq-muted">p.{docPanel.activeTab.page}</span>
		{/if}
		<button
			type="button"
			onclick={() => docPanel.closePanel()}
			aria-label="Close document panel"
			class="ml-auto rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"
		>
			<X size={14} />
		</button>
	</div>

	<div class="relative min-h-0 flex-1">
		{#if docPanel.activeTab}
			{#if docPanel.activeTab.status === 'error'}
				<p class="p-4 text-center text-xs text-mlq-error">Could not load this document.</p>
			{:else if docPanel.activeTab.mime === 'application/pdf'}
				{#key docPanel.activeTab.fileId}
					<PdfViewer fileId={docPanel.activeTab.fileId} />
				{/key}
			{:else if docPanel.activeTab.status === 'ready'}
				<!-- Non-PDF fallback card lands in P3-3. -->
				<p class="p-4 text-center text-xs text-mlq-muted">
					Preview not available for this file type.
				</p>
			{/if}
		{/if}
	</div>
</aside>
```

> The resize handle is `position:absolute`; the `<aside>` is `relative` so the handle anchors to the panel's left edge and spans its full height (`left-0 top-0 h-full`). If svelte-check flags the static handler, the single targeted `a11y_no_static_element_interactions` ignore above suppresses exactly that warning. Remove it if no warning fires.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/docpanel/DocumentPanel.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify no check warnings**

Run: `npm run check`
Expected: exit 0, "0 errors and 0 warnings". If the resize handle's `svelte-ignore` is dead (no warning), delete that comment line and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/lib/docpanel/DocumentPanel.svelte src/lib/docpanel/DocumentPanel.svelte.test.ts
git commit -m "feat(p3-1): DocumentPanel shell (resize, close, hosts PdfViewer)"
```

---

## Task 7: Thread the pill click through to `docPanel.open`

**Files:**

- Modify: `src/lib/components/CitationView.svelte` (add `onopen` prop; call it on pill activation)
- Modify: `src/lib/components/Message.svelte` (pass `onopencitation` through)
- Modify: `src/routes/(app)/chats/[id]/+page.svelte` (create `docPanel`, render `DocumentPanel` in a split, pass the callback)
- Test: `src/lib/components/CitationView.svelte.test.ts` (new or extend existing)

Interim behavior (per spec §4): pill click opens the panel **and** today's popover still works; P3-2 splits hover-vs-click.

- [ ] **Step 1: Write the failing test for `CitationView` onopen**

```ts
// src/lib/components/CitationView.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CitationView from './CitationView.svelte';
import type { Citation } from '$lib/citations/types';

const citations: Citation[] = [
	{
		id: 'c1',
		source_file_id: 'f1',
		source_page: 1,
		source_text: 'cited clause',
		verified: true,
		partial: false
	}
];

describe('CitationView onopen', () => {
	it('calls onopen with the citation when a pill is activated', async () => {
		const onopen = vi.fn();
		// content references citation [1] so transformCitations renders a pill with data-cite-index="1"
		render(CitationView, { props: { content: 'See the clause [1].', citations, onopen } });
		const pill = document.querySelector('[data-cite-index="1"]') as HTMLElement;
		expect(pill).toBeTruthy();
		await userEvent.click(pill);
		expect(onopen).toHaveBeenCalledWith(citations[0]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts`
Expected: FAIL — `onopen` is not called (prop/wiring doesn't exist yet).

> If `transformCitations('See the clause [1].', citations)` does not produce a `data-cite-index="1"` pill, open `src/lib/citations/transform.ts` to confirm the exact pill syntax it recognizes (e.g. `[1]`) and adjust the test `content` to match. Do not change `transform.ts`.

- [ ] **Step 3: Add the `onopen` prop to `CitationView`**

In `src/lib/components/CitationView.svelte`, extend the props and invoke the callback inside `openFrom` (which already resolves the clicked pill's index):

```svelte
  let {
    content = '',
    citations = [],
    onopen
  }: { content?: string; citations?: Citation[]; onopen?: (c: Citation) => void } = $props();
```

Then in `openFrom`, after computing `n`, call the callback with the corresponding citation (pills are 1-based; the citation is `citations[n-1]`):

```svelte
  function openFrom(el: HTMLElement) {
    const n = Number(el.dataset.citeIndex);
    const c = citations[n - 1];
    if (c) onopen?.(c);
    if (openIndex === n) { close(); return; }
    openIndex = n;
    anchor = el;
    position();
  }
```

- [ ] **Step 4: Run the CitationView test to verify it passes**

Run: `npx vitest run src/lib/components/CitationView.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the callback through `Message`**

In `src/lib/components/Message.svelte`, add the prop and pass it to `CitationView`:

```svelte
  let { message, onretry, onopencitation }: { message: ChatMessage; onretry?: () => void; onopencitation?: (c: Citation) => void } = $props();
```

Change the `CitationView` usage (currently line ~48) to:

```svelte
        <CitationView content={message.content} citations={message.citations as Citation[]} onopen={onopencitation} />
```

- [ ] **Step 6: Wire the chat page**

In `src/routes/(app)/chats/[id]/+page.svelte`:

1. Add imports near the other component/controller imports:

```svelte
import DocumentPanel from '$lib/docpanel/DocumentPanel.svelte'; import {createDocPanel} from '$lib/docpanel/docPanel.svelte';
import type {Citation} from '$lib/citations/types';
```

2. Create the controller alongside the others (e.g. after `enhance`):

```svelte
const docPanel = createDocPanel();
```

3. Wrap the existing top-level column and the panel in a horizontal split. Replace the outermost `<div class="flex h-full flex-col">` open/close with:

```svelte
<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- …existing header bar, scroller, composer, ReceiptsDrawer unchanged… -->
	</div>
	{#if docPanel.open_}
		<DocumentPanel {docPanel} />
	{/if}
</div>
```

4. Pass the open callback to each `Message`:

```svelte
        <Message message={m} onretry={retry} onopencitation={(c: Citation) => docPanel.open(c)} />
```

- [ ] **Step 7: Verify unit tests + check pass**

Run: `npx vitest run && npm run check`
Expected: all unit tests PASS; check exit 0, "0 errors and 0 warnings".

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/CitationView.svelte src/lib/components/CitationView.svelte.test.ts src/lib/components/Message.svelte "src/routes/(app)/chats/[id]/+page.svelte"
git commit -m "feat(p3-1): pill click opens the document panel (CitationView onopen → docPanel)"
```

---

## Task 8: Live e2e — clicking a citation renders the PDF

**Files:**

- Create: `tests/document-panel.spec.ts`

Reuses the `citation-live` seeding pattern (project + KB + PDF + project-backed chat). Requires the stack up, `.env` populated, and `/tmp/spike.pdf` present (the same fixture the citation-live e2e uses — if absent, copy from that test's expectation or regenerate a tiny PDF).

- [ ] **Step 1: Confirm the seed fixture exists**

Run: `ls -l ${DONNA_SPIKE_PDF:-/tmp/spike.pdf}`
Expected: the PDF exists. If not, the `citation-live` spec documents how it is provided; create a minimal PDF containing the termination clause before running.

- [ ] **Step 2: Write the e2e**

```ts
// tests/document-panel.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

async function api(token: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) }
	});
}

// Same seeding flow as tests/citation-live.spec.ts.
async function seedCitedChat(): Promise<string> {
	const tok = await fetch(`${API}/auth/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD })
	})
		.then((r) => r.json())
		.then((d) => d.access_token);

	const pid = await api(tok, '/projects', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'E2E DocPanel Matter' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	const kid = await api(tok, '/knowledge-bases', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'E2E DocPanel KB' })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	await api(tok, `/projects/${pid}/knowledge-bases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ knowledge_base_id: kid })
	});

	const fd = new FormData();
	fd.append('file', new Blob([readFileSync(PDF)], { type: 'application/pdf' }), 'spike.pdf');
	const fid = await api(tok, '/files', { method: 'POST', body: fd })
		.then((r) => r.json())
		.then((d) => d.id);

	for (let i = 0; i < 60; i++) {
		const st = await api(tok, `/files/${fid}`)
			.then((r) => r.json())
			.then((d) => d.ingestion_status);
		if (st === 'ready') break;
		if (st === 'failed') throw new Error('ingestion failed');
		await new Promise((r) => setTimeout(r, 2000));
	}
	await api(tok, `/knowledge-bases/${kid}/files`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ file_id: fid })
	});

	for (let i = 0; i < 60; i++) {
		const res = await api(tok, `/knowledge-bases/${kid}/query`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'termination convenience notice', top_k: 1 })
		}).then((r) => r.json());
		if ((res.results ?? []).length > 0) break;
		await new Promise((r) => setTimeout(r, 2000));
	}

	const cid = await api(tok, '/chats', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'E2E docpanel chat', project_id: pid })
	})
		.then((r) => r.json())
		.then((d) => d.id);
	const q = 'What is the termination-for-convenience notice period? Quote the operative clause.';
	await api(tok, `/chats/${cid}/messages`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ content: q, model: 'smart', stream: false })
	});
	return cid;
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('clicking a verified citation opens the document panel and renders the PDF', async ({
	page
}) => {
	test.setTimeout(180_000);
	const cid = await seedCitedChat();
	await login(page);
	await page.goto(`/chats/${cid}`);
	await page.waitForLoadState('networkidle');

	const tab = page.locator('.cite-tab').first();
	await expect(tab).toBeVisible({ timeout: 15000 });
	await tab.click();

	// The docked panel appears, labeled with the source filename…
	const panel = page.getByRole('complementary', { name: /document panel/i });
	await expect(panel).toBeVisible();
	await expect(panel.getByText(/spike\.pdf/i)).toBeVisible();

	// …and PDF.js renders at least one page canvas inside it.
	await expect(panel.locator('canvas').first()).toBeVisible({ timeout: 15000 });
});
```

> The pill selector `.cite-tab` and its click are copied from `tests/citation-live.spec.ts`. If P3-1's interim wiring means the click both opens the popover and the panel, that is expected — assert only on the panel (`role=complementary`) and its canvas, not on popover absence.

- [ ] **Step 3: Run the e2e against the live stack**

Run: `set -a; . ./.env; set +a; npx playwright test tests/document-panel.spec.ts`
Expected: PASS. Embeddings are async — if it fails on the first run because retrieval hadn't settled, re-run once (documented timing-sensitivity, same as `citation-live`).

- [ ] **Step 4: Commit**

```bash
git add tests/document-panel.spec.ts
git commit -m "test(p3-1): live e2e — citation click opens panel and renders the PDF"
```

---

## Final verification (before opening the PR)

- [ ] `npm run check` → exit 0, "0 errors and 0 warnings".
- [ ] `npx vitest run` → all unit suites pass.
- [ ] `set -a; . ./.env; set +a; npx playwright test` → full e2e suite passes (re-run once if the citation-live/document-panel timing-sensitive specs flake on embeddings).
- [ ] Manual smoke at http://localhost:13002: open the seeded cited chat, click a citation pill → panel docks right, PDF renders, drag the left edge resizes, reload preserves width, close button dismisses.

## Self-review notes (spec → plan coverage)

- Spec §3 BFF routes → Tasks 1, 2. ✓
- Spec §3 `docPanel` controller (tabs/active/width/pending-highlight) → Task 3. ✓
- Spec §3 `PdfViewer` (client-only, lazy pdfjs, canvas+text layer) → Tasks 4, 5. ✓ (text layer rendered now; **highlight search is P3-2**, intentionally deferred.)
- Spec §3 `DocumentPanel` (docked-right, resize, close) → Task 6. ✓
- Spec §3 chat-page wiring + interim pill behavior (§4) → Task 7. ✓
- Spec §6 testing (unit + live e2e) → every task + Task 8. ✓
- Spec §5 dependency justification → Task 4 isolates pdfjs + lazy-loads. ✓
- **Deferred to later slices (correctly out of scope here):** highlight + popover hover/click split (P3-2); multi-tab UI + `UnsupportedFileCard` (P3-3). `DocumentPanel` shows a plain "preview not available" line for non-PDF in the interim.
