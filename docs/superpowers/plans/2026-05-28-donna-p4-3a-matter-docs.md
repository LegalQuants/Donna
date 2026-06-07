# Donna P4-3a — Matter docs / skills / context / KB linking: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new sections to Donna's matter detail page (`/matters/{id}`) — Files (upload + attach + list + remove), Knowledge (link/unlink existing KBs), Skills (attach/detach), Context (Markdown editor) — all wired through SvelteKit form actions on `[id]/+page.server.ts`.

**Architecture:** Section subcomponents in `src/lib/matters/sections/` driven by per-section form actions. Per-feature lib folders (`src/lib/matters/files/`, `.../knowledge/`, `.../skills/`) hold the non-trivial helpers. The detail page becomes a thin orchestrator: load fans out the matter + chats + per-file metadata + KB fetches in parallel, then renders the four sections plus the existing chats list. File upload uses a multipart form action with `DataTransfer.files` assigned to a hidden `<input type="file">` so drag-drop and click-to-pick share the same submission path.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind v4 (`@theme` block in `src/app.css`), `@lucide/svelte` icons, vitest + `@testing-library/svelte` + `userEvent`/`fireEvent` for unit/component tests, Playwright for live e2e against the Docker stack on `localhost:13002`.

**Preconditions:**

- On branch `p4-3a-matter-docs` (already created off `main`; spec commit `5d29d99`).
- Docker stack up: `set -a; . ./.env; set +a && docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker`.
- Vendor pin verified: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
- Quality bar: `npm run check` = 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npx eslint <touched-files>` clean. **Rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`).

---

## Task 1: `uploadFile.ts` — pure byte-formatter + status-badge resolver

**Why first:** Pure functions with no dependencies; everything else uses them. TDD bottom-up.

**Files:**

- Create: `src/lib/matters/files/uploadFile.ts`
- Create: `src/lib/matters/files/uploadFile.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/files/uploadFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatBytes, statusBadge } from './uploadFile';

describe('formatBytes', () => {
	it('renders 0 B', () => {
		expect(formatBytes(0)).toBe('0 B');
	});
	it('renders raw bytes under 1 KB', () => {
		expect(formatBytes(512)).toBe('512 B');
	});
	it('renders KB with one decimal for kilobytes', () => {
		expect(formatBytes(1536)).toBe('1.5 KB');
	});
	it('renders MB with one decimal for megabytes', () => {
		expect(formatBytes(2 * 1024 * 1024 + 512 * 1024)).toBe('2.5 MB');
	});
	it('rounds KB down to whole numbers when no fractional part', () => {
		expect(formatBytes(2048)).toBe('2 KB');
	});
});

describe('statusBadge', () => {
	it('maps "ready" to a success-toned badge', () => {
		expect(statusBadge('ready')).toEqual({ label: 'Ready', tone: 'success' });
	});
	it('maps "pending" to a muted badge', () => {
		expect(statusBadge('pending')).toEqual({ label: 'Pending', tone: 'muted' });
	});
	it('maps "processing" to a muted badge', () => {
		expect(statusBadge('processing')).toEqual({ label: 'Processing', tone: 'muted' });
	});
	it('maps "failed" to an error-toned badge', () => {
		expect(statusBadge('failed')).toEqual({ label: 'Failed', tone: 'error' });
	});
	it('maps undefined/null to a muted "Pending" badge (defensive default)', () => {
		expect(statusBadge(undefined)).toEqual({ label: 'Pending', tone: 'muted' });
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/files/uploadFile.test.ts`
Expected: FAIL with "cannot find module './uploadFile'".

- [ ] **Step 3: Implement the helpers**

Create `src/lib/matters/files/uploadFile.ts`:

```ts
/** Human-friendly size formatter for file rows. Switches between B / KB / MB
 *  at the conventional 1024 boundaries; one decimal place unless the value is
 *  a whole number (e.g. "2 KB" not "2.0 KB"). */
export function formatBytes(n: number): string {
	if (n === 0) return '0 B';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${formatOne(n / 1024)} KB`;
	return `${formatOne(n / 1024 / 1024)} MB`;
}

function formatOne(v: number): string {
	// Strip trailing ".0" so "2 KB" reads cleaner than "2.0 KB".
	const rounded = Math.round(v * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type IngestionStatus = 'pending' | 'processing' | 'ready' | 'failed' | undefined;
export type BadgeTone = 'success' | 'muted' | 'error';

/** Resolve a File's ingestion_status into a presentational label + tone. */
export function statusBadge(s: IngestionStatus): { label: string; tone: BadgeTone } {
	switch (s) {
		case 'ready':
			return { label: 'Ready', tone: 'success' };
		case 'failed':
			return { label: 'Failed', tone: 'error' };
		case 'processing':
			return { label: 'Processing', tone: 'muted' };
		case 'pending':
		default:
			return { label: 'Pending', tone: 'muted' };
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/files/uploadFile.test.ts`
Expected: 10/10 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 with "0 errors and 0 warnings" line.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/files/uploadFile.ts src/lib/matters/files/uploadFile.test.ts
git commit -m "feat(p4-3a): formatBytes + statusBadge helpers for matter files

Pure functions for the FileRow presentation layer. formatBytes switches
between B/KB/MB at conventional 1024 boundaries with one decimal except
for whole numbers; statusBadge maps the backend's ingestion_status enum
(plus undefined) to a {label, tone} pair the row component consumes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `Dropzone.svelte` — drag-drop + click drop target

**Why now:** Leaf presentational component; FilesSection composes it. Independent of any server interaction.

**Files:**

- Create: `src/lib/matters/files/Dropzone.svelte`
- Create: `src/lib/matters/files/Dropzone.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/files/Dropzone.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Dropzone from './Dropzone.svelte';

function makeDataTransfer(files: File[]): DataTransfer {
	// jsdom doesn't construct DataTransfer; minimal stub is enough for the drop event.
	return { files: files as unknown as FileList } as unknown as DataTransfer;
}

describe('Dropzone', () => {
	it('renders the prompt and is keyboard-focusable', () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		expect(btn).toBeInTheDocument();
		expect(btn).toHaveTextContent(/drag.*pdfs.*contracts.*click to browse/i);
	});

	it('clicking the prompt opens the hidden file input', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const input = screen.getByTestId('dropzone-input') as HTMLInputElement;
		const clickSpy = vi.spyOn(input, 'click');
		await userEvent.click(screen.getByRole('button', { name: /upload files/i }));
		expect(clickSpy).toHaveBeenCalled();
	});

	it('Enter key on the prompt opens the hidden file input', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const input = screen.getByTestId('dropzone-input') as HTMLInputElement;
		const clickSpy = vi.spyOn(input, 'click');
		const btn = screen.getByRole('button', { name: /upload files/i });
		btn.focus();
		await userEvent.keyboard('{Enter}');
		expect(clickSpy).toHaveBeenCalled();
	});

	it('dropping files emits onfiles with the File[] from the DataTransfer', () => {
		const onfiles = vi.fn();
		render(Dropzone, { props: { onfiles } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		const file = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' });
		fireEvent.drop(btn, { dataTransfer: makeDataTransfer([file]) });
		expect(onfiles).toHaveBeenCalledWith([file]);
	});

	it('toggles a dragging visual state on dragenter / dragleave', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		expect(btn.className).not.toMatch(/ring-2/);
		await fireEvent.dragEnter(btn);
		expect(btn.className).toMatch(/ring-2/);
		await fireEvent.dragLeave(btn);
		expect(btn.className).not.toMatch(/ring-2/);
	});

	it('prevents default on dragover so the drop event fires', () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		const ev = new Event('dragover', { cancelable: true });
		btn.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/files/Dropzone.svelte.test.ts`
Expected: FAIL with "cannot find module './Dropzone.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/files/Dropzone.svelte`:

```svelte
<script lang="ts">
	import { UploadCloud } from '@lucide/svelte';

	let { onfiles }: { onfiles: (files: File[]) => void } = $props();

	let input = $state<HTMLInputElement>();
	let dragging = $state(false);

	function openPicker() {
		input?.click();
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openPicker();
		}
	}
	function ondragenter(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}
	function ondragover(e: DragEvent) {
		e.preventDefault();
	}
	function ondragleave(e: DragEvent) {
		e.preventDefault();
		dragging = false;
	}
	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) onfiles(files);
	}
	function onchange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const files = Array.from(target.files ?? []);
		if (files.length) onfiles(files);
		target.value = ''; // allow re-picking the same file later
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<button
	type="button"
	aria-label="Upload files to this matter"
	onclick={openPicker}
	{onkeydown}
	{ondragenter}
	{ondragover}
	{ondragleave}
	{ondrop}
	class="flex w-full flex-col items-center justify-center gap-2 rounded-mlq-control border-2 border-dashed border-mlq-subtle px-6 py-10 text-mlq-muted hover:border-mlq-workflow hover:text-mlq-text {dragging
		? 'border-mlq-workflow ring-2 ring-mlq-workflow'
		: ''}"
>
	<UploadCloud size={24} aria-hidden="true" />
	<span class="text-sm">Drag PDFs or contracts here, or click to browse</span>
</button>
<input
	bind:this={input}
	type="file"
	name="file"
	multiple
	data-testid="dropzone-input"
	{onchange}
	class="sr-only"
/>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/files/Dropzone.svelte.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/files/Dropzone.svelte src/lib/matters/files/Dropzone.svelte.test.ts
git commit -m "feat(p4-3a): Dropzone — drag-drop + click + keyboard file picker

Presentational drop target with a hidden <input type=\"file\" multiple>;
emits onfiles(File[]) for either drop or picker selection. Toggles a
ring on dragenter/dragleave for visual feedback; supports keyboard
activation via Enter/Space; clears its own value after each selection
so the user can re-pick the same file later.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `FileRow.svelte` — single attached-file row

**Why now:** Independent leaf component; FilesSection composes it.

**Files:**

- Create: `src/lib/matters/files/FileRow.svelte`
- Create: `src/lib/matters/files/FileRow.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/files/FileRow.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FileRow from './FileRow.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const file = (over = {}) => ({
	id: 'f1',
	owner_id: 'u',
	filename: 'msa.pdf',
	mime_type: 'application/pdf',
	size_bytes: 1536,
	ingestion_status: 'ready' as const,
	created_at: '2026-05-28T00:00:00Z',
	...over
});

describe('FileRow', () => {
	it('renders filename, size, and a Ready badge', () => {
		render(FileRow, { props: { file: file() } });
		expect(screen.getByText('msa.pdf')).toBeInTheDocument();
		expect(screen.getByText('1.5 KB')).toBeInTheDocument();
		expect(screen.getByText('Ready')).toBeInTheDocument();
	});

	it('shows Pending badge when ingestion_status is pending', () => {
		render(FileRow, { props: { file: file({ ingestion_status: 'pending' }) } });
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});

	it('shows Failed badge with error tone when ingestion_status is failed', () => {
		render(FileRow, { props: { file: file({ ingestion_status: 'failed' }) } });
		const badge = screen.getByText('Failed');
		expect(badge.className).toMatch(/text-mlq-error/);
	});

	it('exposes a Download link to the BFF content route', () => {
		render(FileRow, { props: { file: file() } });
		const link = screen.getByRole('link', { name: /download/i }) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/api/v1/files/f1/content');
	});

	it('renders a Remove form that posts to ?/detachFile with the file_id', () => {
		render(FileRow, { props: { file: file() } });
		const form = screen.getByRole('form', { name: /remove file/i });
		expect(form).toHaveAttribute('action', '?/detachFile');
		const hidden = form.querySelector('input[name="file_id"]') as HTMLInputElement;
		expect(hidden.value).toBe('f1');
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/files/FileRow.svelte.test.ts`
Expected: FAIL with "cannot find module './FileRow.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/files/FileRow.svelte`:

```svelte
<script lang="ts">
	import { X } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import type { components } from '$lib/api/backend';
	import { formatBytes, statusBadge } from './uploadFile';

	type File = components['schemas']['File'];

	let { file }: { file: File } = $props();

	const badge = $derived(statusBadge(file.ingestion_status));
	const toneClass = $derived(
		badge.tone === 'success'
			? 'text-mlq-success'
			: badge.tone === 'error'
				? 'text-mlq-error'
				: 'text-mlq-muted'
	);
</script>

<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
	<div class="min-w-0 flex-1">
		<div class="truncate text-sm text-mlq-text">{file.filename}</div>
		<div class="mt-0.5 flex items-center gap-2 text-xs">
			<span class="text-mlq-muted">{formatBytes(file.size_bytes)}</span>
			<span class={`${toneClass}`}>{badge.label}</span>
		</div>
	</div>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- BFF download proxy -->
	<a
		href="/api/v1/files/{file.id}/content"
		target="_blank"
		rel="noopener"
		class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a
	>
	<form method="POST" action="?/detachFile" use:enhance aria-label="Remove file" class="shrink-0">
		<input type="hidden" name="file_id" value={file.id} />
		<button
			type="submit"
			aria-label={`Remove ${file.filename}`}
			class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
		>
			<X size={14} />
		</button>
	</form>
</div>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/files/FileRow.svelte.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/files/FileRow.svelte src/lib/matters/files/FileRow.svelte.test.ts
git commit -m "feat(p4-3a): FileRow — filename + size + status + download + remove

Single attached-file row: filename, formatBytes() size, statusBadge()-
toned ingestion state, Download link to the BFF /files/{id}/content
proxy (target=_blank since the route now returns content-disposition:
attachment per P3-3), and a small Remove form that posts to
?/detachFile with the file_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `KbPicker.svelte` — searchable popover for linking KBs

**Why now:** Leaf component for the Knowledge section. Mirrors `MatterPicker.svelte`'s idiom (root div + open state + outside-click + Escape).

**Files:**

- Create: `src/lib/matters/knowledge/KbPicker.svelte`
- Create: `src/lib/matters/knowledge/KbPicker.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/knowledge/KbPicker.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import KbPicker from './KbPicker.svelte';
import type { components } from '$lib/api/backend';

type KnowledgeBase = components['schemas']['KnowledgeBase'];

const kb = (over: Partial<KnowledgeBase>): KnowledgeBase => ({
	id: 'k1',
	name: 'Standards',
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 3,
	chunk_count: 50,
	created_at: '2026-05-28T00:00:00Z',
	updated_at: '2026-05-28T00:00:00Z',
	...over
});

describe('KbPicker', () => {
	it('renders a Link button by default; popover is hidden', () => {
		render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick: vi.fn() } });
		expect(screen.getByRole('button', { name: /link a knowledge base/i })).toBeInTheDocument();
		expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
	});

	it('opens the popover on click and shows all KBs', async () => {
		render(KbPicker, {
			props: {
				kbs: [kb({ id: 'a', name: 'Alpha' }), kb({ id: 'b', name: 'Beta' })],
				onpick: vi.fn()
			}
		});
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		expect(screen.getByPlaceholderText(/search knowledge bases/i)).toBeInTheDocument();
		expect(screen.getByText('Alpha')).toBeInTheDocument();
		expect(screen.getByText('Beta')).toBeInTheDocument();
	});

	it('filters by case-insensitive substring on the name', async () => {
		render(KbPicker, {
			props: {
				kbs: [kb({ id: 'a', name: 'Alpha' }), kb({ id: 'b', name: 'Beta' })],
				onpick: vi.fn()
			}
		});
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		await fireEvent.input(screen.getByPlaceholderText(/search knowledge bases/i), {
			target: { value: 'bet' }
		});
		expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
		expect(screen.getByText('Beta')).toBeInTheDocument();
	});

	it('calls onpick with the kb id when a result is clicked, then closes', async () => {
		const onpick = vi.fn();
		render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick } });
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		await userEvent.click(screen.getByText('Alpha'));
		expect(onpick).toHaveBeenCalledWith('a');
		expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
	});

	it('shows the deferred-create message when there are no KBs available', async () => {
		render(KbPicker, { props: { kbs: [], onpick: vi.fn() } });
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		expect(screen.getByText(/no other knowledge bases to link/i)).toBeInTheDocument();
		expect(screen.getByText(/creating a kb lands in a follow-up slice/i)).toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick: vi.fn() } });
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		expect(screen.getByPlaceholderText(/search knowledge bases/i)).toBeInTheDocument();
		await userEvent.keyboard('{Escape}');
		expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/knowledge/KbPicker.svelte.test.ts`
Expected: FAIL with "cannot find module './KbPicker.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/knowledge/KbPicker.svelte`:

```svelte
<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import type { components } from '$lib/api/backend';

	type KnowledgeBase = components['schemas']['KnowledgeBase'];

	let { kbs, onpick }: { kbs: KnowledgeBase[]; onpick: (kbId: string) => void } = $props();

	let open = $state(false);
	let q = $state('');
	let root = $state<HTMLElement>();

	const filtered = $derived(
		q.trim() ? kbs.filter((k) => k.name.toLowerCase().includes(q.trim().toLowerCase())) : kbs
	);

	function choose(id: string) {
		onpick(id);
		open = false;
		q = '';
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
	$effect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="relative inline-block" {onkeydown}>
	<button
		type="button"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="Link a knowledge base"
		onclick={() => (open = !open)}
		class="inline-flex items-center gap-1 rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
	>
		<Plus size={13} /> Link a knowledge base
	</button>

	{#if open}
		<div
			class="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-mlq-control border border-mlq-subtle bg-mlq-surface shadow-md"
		>
			<input
				type="text"
				placeholder="Search knowledge bases…"
				bind:value={q}
				class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
			/>
			{#if kbs.length === 0}
				<p class="px-3 py-3 text-xs text-mlq-muted">
					No other knowledge bases to link.
					<span class="block text-[10px]">(Creating a KB lands in a follow-up slice.)</span>
				</p>
			{:else if filtered.length === 0}
				<p class="px-3 py-2 text-xs text-mlq-muted">No matches.</p>
			{:else}
				<ul class="max-h-64 overflow-y-auto">
					{#each filtered as k (k.id)}
						<li>
							<button
								type="button"
								onclick={() => choose(k.id)}
								class="block w-full px-3 py-2 text-left text-xs hover:bg-mlq-subtle/50"
							>
								<span class="font-medium text-mlq-text">{k.name}</span>
								<span class="ml-2 text-mlq-muted">{k.file_count} files</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/knowledge/KbPicker.svelte.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/knowledge/KbPicker.svelte src/lib/matters/knowledge/KbPicker.svelte.test.ts
git commit -m "feat(p4-3a): KbPicker — searchable popover for linking KBs

Mirrors the MatterPicker idiom (root div + open state + outside-click
\$effect + Escape). Substring search on KB name. Empty available list
surfaces 'No other knowledge bases to link. (Creating a KB lands in a
follow-up slice.)' so the deferred-create state is explicit rather
than silently empty. Calls onpick(kbId) on selection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extend `load` to fan out file metadata + KB fetches

**Why now:** All sections need this data. Server-side change first; component sections (later tasks) will consume it.

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `src/routes/(app)/matters/[id]/page.server.test.ts` with the current file's existing contents PLUS a new `describe('/matters/[id] load — files + KBs', ...)` block. First, read the existing file to preserve everything:

Run: `cat 'src/routes/(app)/matters/[id]/page.server.test.ts'` — keep the existing 9 cases verbatim.

Append (just before the final closing of the file) this new describe block:

```ts
describe('/matters/[id] load — files + KBs', () => {
	it('fans out file metadata for each attached_file_id and filters out 404s', async () => {
		const matter = {
			id: 'p1',
			name: 'Acme',
			description: 'd',
			privileged: false,
			minimum_inference_tier: null,
			attached_file_ids: ['a', 'b', 'gone']
		};
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 })) // GET /projects/p1
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 })) // GET /chats?project_id=p1
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'a',
						filename: 'a.pdf',
						size_bytes: 1,
						mime_type: 'application/pdf',
						ingestion_status: 'ready'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'b',
						filename: 'b.pdf',
						size_bytes: 2,
						mime_type: 'application/pdf',
						ingestion_status: 'pending'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response('not found', { status: 404 })) // GET /files/gone → filtered
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // GET /knowledge-bases?project_id=p1
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify([
						{
							id: 'k1',
							name: 'KB',
							owner_id: 'u',
							hybrid_alpha: 0.5,
							file_count: 0,
							chunk_count: 0,
							created_at: '',
							updated_at: ''
						}
					]),
					{ status: 200 }
				)
			); // GET /knowledge-bases
		const out = (await load(loadEv())) as {
			files: { id: string }[];
			kbs: { linked: unknown[]; available: { id: string }[] };
		};
		expect(out.files.map((f) => f.id)).toEqual(['a', 'b']);
		expect(out.kbs.linked).toEqual([]);
		expect(out.kbs.available.map((k) => k.id)).toEqual(['k1']);
	});

	it('subtracts linked KBs from the available picker list', async () => {
		const matter = {
			id: 'p1',
			name: 'Acme',
			privileged: false,
			minimum_inference_tier: null,
			attached_file_ids: []
		};
		const linkedKb = {
			id: 'k1',
			name: 'Linked',
			owner_id: 'u',
			hybrid_alpha: 0.5,
			file_count: 1,
			chunk_count: 1,
			created_at: '',
			updated_at: ''
		};
		const otherKb = {
			id: 'k2',
			name: 'Other',
			owner_id: 'u',
			hybrid_alpha: 0.5,
			file_count: 0,
			chunk_count: 0,
			created_at: '',
			updated_at: ''
		};
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify([linkedKb]), { status: 200 })) // linked
			.mockResolvedValueOnce(new Response(JSON.stringify([linkedKb, otherKb]), { status: 200 })); // all
		const out = (await load(loadEv())) as {
			kbs: { linked: { id: string }[]; available: { id: string }[] };
		};
		expect(out.kbs.linked.map((k) => k.id)).toEqual(['k1']);
		expect(out.kbs.available.map((k) => k.id)).toEqual(['k2']);
	});

	it('degrades gracefully when KB fetches fail (returns empty arrays)', async () => {
		const matter = {
			id: 'p1',
			name: 'Acme',
			privileged: false,
			minimum_inference_tier: null,
			attached_file_ids: []
		};
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
			.mockResolvedValueOnce(new Response('boom', { status: 502 }))
			.mockResolvedValueOnce(new Response('boom', { status: 502 }));
		const out = (await load(loadEv())) as { kbs: { linked: unknown[]; available: unknown[] } };
		expect(out.kbs.linked).toEqual([]);
		expect(out.kbs.available).toEqual([]);
	});
});
```

(The existing `lqFetch` mock + `loadEv` helper are already in scope from the top of the file. The existing `it('loads the matter and its chats', …)` test will need its mock fixture updated to include `attached_file_ids: []` on the matter so the file-fan-out path emits zero calls — adjust it in the same edit.)

In the existing `it('loads the matter and its chats', …)` case (which already mocks the project + chats fetches), append two more `.mockResolvedValueOnce(new Response('[]', { status: 200 }))` calls to satisfy the now-fanned-out KB list calls (linked + available). The asserted shape stays focused on `matter.name` + `chats.length`, so the new keys on the return are silently allowed.

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: the 3 new cases FAIL (load doesn't yet return `files` or `kbs`).

- [ ] **Step 3: Update `+page.server.ts` load**

In `src/routes/(app)/matters/[id]/+page.server.ts`, replace the existing `load` function (preserving all `actions`) with:

```ts
type KnowledgeBase = components['schemas']['KnowledgeBase'];
type ProjectFile = components['schemas']['File'];

export const load: PageServerLoad = async (event) => {
	const [mRes, cRes] = await Promise.all([
		lqFetch(event, `/api/v1/projects/${event.params.id}`),
		lqFetch(event, `/api/v1/chats?project_id=${event.params.id}`)
	]);
	if (!mRes.ok) throw error(mRes.status === 404 ? 404 : 502, 'Could not load this matter.');
	const matter = (await mRes.json()) as Matter;
	const chats = cRes.ok ? (((await cRes.json()) as { items: Chat[] }).items ?? []) : [];

	const [filesArr, kbLinkedRes, kbAllRes] = await Promise.all([
		Promise.all(
			(matter.attached_file_ids ?? []).map(async (id) => {
				const r = await lqFetch(event, `/api/v1/files/${id}`);
				return r.ok ? ((await r.json()) as ProjectFile) : null;
			})
		),
		lqFetch(event, `/api/v1/knowledge-bases?project_id=${event.params.id}`),
		lqFetch(event, '/api/v1/knowledge-bases')
	]);
	const files = filesArr.filter((f): f is ProjectFile => f !== null);
	const linked = kbLinkedRes.ok ? ((await kbLinkedRes.json()) as KnowledgeBase[]) : [];
	const allKbs = kbAllRes.ok ? ((await kbAllRes.json()) as KnowledgeBase[]) : [];
	const linkedIds = new Set(linked.map((k) => k.id));
	const available = allKbs.filter((k) => !linkedIds.has(k.id));

	return { matter, chats, files, kbs: { linked, available } };
};
```

Add `KnowledgeBase` / `ProjectFile` type aliases at the top alongside the existing `Chat` alias. The alias is named `ProjectFile` (not `File`) so it doesn't shadow the global `File` constructor — Task 6's multipart parser uses `v instanceof File` against the runtime global.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: all 12 cases PASS (9 existing + 3 new).

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.server.ts' 'src/routes/(app)/matters/[id]/page.server.test.ts'
git commit -m "feat(p4-3a): matter load fans out files + KB (linked & available)

After the existing matter + chats fetches, parallel-fetch each
attached_file_id via GET /files/{id} (404s filtered out) and both
GET /knowledge-bases?project_id={id} (linked) and unfiltered
GET /knowledge-bases (then subtract linked to derive 'available'
for the picker). On either KB fetch failing, the page degrades
to empty arrays rather than 502ing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `uploadFile` + `detachFile` server actions

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/matters/[id]/page.server.test.ts` a new helper + describe block (place after the existing file-helpers `ev` / `loadEv`; the existing `formEvent` won't work for multipart, so add a new one):

```ts
const fileEvent = (files: { name: string; type: string; bytes?: number }[], id = 'p1') => {
	const fd = new FormData();
	for (const f of files) {
		fd.append('file', new File([new Uint8Array(f.bytes ?? 8)], f.name, { type: f.type }));
	}
	return {
		params: { id },
		request: new Request('http://x', { method: 'POST', body: fd })
	} as never;
};
const detachEvent = (file_id: string, id = 'p1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ file_id }) })
	}) as never;

describe('/matters/[id] uploadFile action', () => {
	it('uploads one file then attaches it; redirects via { uploaded: 1 }', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'newfile1' }), { status: 201 })) // POST /files
			.mockResolvedValueOnce(new Response(null, { status: 204 })); // POST /projects/p1/files
		const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', type: 'application/pdf' }]));
		expect(r).toEqual({ uploaded: 1 });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData);
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/projects/p1/files');
		expect(JSON.parse(lqFetch.mock.calls[1][2].body)).toEqual({ file_id: 'newfile1' });
	});

	it('uploads multiple files in order', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f2' }), { status: 201 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const r = await actions.uploadFile(
			fileEvent([
				{ name: 'a.pdf', type: 'application/pdf' },
				{ name: 'b.pdf', type: 'application/pdf' }
			])
		);
		expect(r).toEqual({ uploaded: 2 });
		expect(JSON.parse(lqFetch.mock.calls[1][2].body)).toEqual({ file_id: 'f1' });
		expect(JSON.parse(lqFetch.mock.calls[3][2].body)).toEqual({ file_id: 'f2' });
	});

	it('returns 413 with the formatted MB limit when the backend returns 413 on upload', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					details: { limit_bytes: 100 * 1024 * 1024, received_bytes: 200 * 1024 * 1024 }
				}),
				{ status: 413 }
			)
		);
		const r = await actions.uploadFile(fileEvent([{ name: 'huge.pdf', type: 'application/pdf' }]));
		expect(r).toMatchObject({
			status: 413,
			data: { error: 'File "huge.pdf" is too large — max 100 MB.' }
		});
	});

	it('falls back to "max 100 MB" when the 413 body is unparseable', async () => {
		lqFetch.mockResolvedValueOnce(new Response('garbage', { status: 413 }));
		const r = await actions.uploadFile(fileEvent([{ name: 'huge.pdf', type: 'application/pdf' }]));
		expect(r).toMatchObject({
			status: 413,
			data: { error: 'File "huge.pdf" is too large — max 100 MB.' }
		});
	});

	it('returns 502 with the failing filename when the backend errors mid-batch (file 2 fails on upload)', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 })) // file 1 upload
			.mockResolvedValueOnce(new Response(null, { status: 204 })) // file 1 attach
			.mockResolvedValueOnce(new Response('oops', { status: 500 })); // file 2 upload fails
		const r = await actions.uploadFile(
			fileEvent([
				{ name: 'ok.pdf', type: 'application/pdf' },
				{ name: 'bad.pdf', type: 'application/pdf' }
			])
		);
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not upload "bad.pdf".' } });
	});

	it('silently treats 409 on the attach step as success', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }))
			.mockResolvedValueOnce(new Response(null, { status: 409 }));
		const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', type: 'application/pdf' }]));
		expect(r).toEqual({ uploaded: 1 });
	});
});

describe('/matters/[id] detachFile action', () => {
	it('DELETEs the project-file join and returns success', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const r = await actions.detachFile(detachEvent('f1'));
		expect(r).toEqual({ success: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1/files/f1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('treats 404 as silent success (idempotent from the UI POV)', async () => {
		lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
		const r = await actions.detachFile(detachEvent('f1'));
		expect(r).toEqual({ success: true });
	});

	it('returns 502 on other backend failures', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.detachFile(detachEvent('f1'));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not remove the file.' } });
	});
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: the 9 new cases FAIL (`actions.uploadFile` / `actions.detachFile` don't exist).

- [ ] **Step 3: Add the two actions**

In `src/routes/(app)/matters/[id]/+page.server.ts`, add inside the `actions` object (alongside `rename`, `archive`, `newChat`):

```ts
  uploadFile: async (event) => {
    const data = await event.request.formData();
    const blobs = data.getAll('file').filter((v): v is File => v instanceof File && v.size > 0);
    let uploaded = 0;
    for (const blob of blobs) {
      const fd = new FormData();
      fd.append('file', blob, blob.name);
      const upRes = await lqFetch(event, '/api/v1/files', { method: 'POST', body: fd });
      if (!upRes.ok) {
        if (upRes.status === 413) {
          let limitMb = 100;
          try {
            const body = (await upRes.json()) as { details?: { limit_bytes?: number } };
            if (body.details?.limit_bytes) limitMb = Math.round(body.details.limit_bytes / 1024 / 1024);
          } catch {
            /* keep default 100 MB */
          }
          return fail(413, { error: `File "${blob.name}" is too large — max ${limitMb} MB.` });
        }
        return fail(502, { error: `Could not upload "${blob.name}".` });
      }
      const { id: file_id } = (await upRes.json()) as { id: string };
      const attRes = await lqFetch(event, `/api/v1/projects/${event.params.id}/files`, {
        method: 'POST',
        body: JSON.stringify({ file_id })
      });
      // 204 = success; 409 = already attached (treat as success — race).
      if (!attRes.ok && attRes.status !== 409) {
        return fail(502, { error: `Could not upload "${blob.name}".` });
      }
      uploaded += 1;
    }
    return { uploaded };
  },

  detachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/files/${file_id}`, { method: 'DELETE' });
    // 204 or 404 → idempotent success.
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not remove the file.' });
    }
    return { success: true };
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: all 21 cases PASS (12 prior + 9 new).

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.server.ts' 'src/routes/(app)/matters/[id]/page.server.test.ts'
git commit -m "feat(p4-3a): uploadFile + detachFile server actions

uploadFile reads multipart form data, for each entry named 'file' POSTs
to /api/v1/files then to /api/v1/projects/{id}/files; maps 413 to a
friendly 'File X is too large — max N MB.' parsed from the response
body's details.limit_bytes (with 100 MB fallback); aborts the batch on
any other 4xx/5xx and reports the failing filename; treats 409 on the
attach step as silent success. detachFile DELETEs the project↔file
join (idempotent: 204 + 404 both return success).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `linkKb` + `unlinkKb` server actions

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/matters/[id]/page.server.test.ts`:

```ts
const kbEvent = (kb_id: string, id = 'p1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ kb_id }) })
	}) as never;

describe('/matters/[id] linkKb / unlinkKb actions', () => {
	it('linkKb PATCHes the KB with the matter id', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
		const r = await actions.linkKb(kbEvent('k1'));
		expect(r).toEqual({ success: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
	});

	it('linkKb maps 404 to a friendly error', async () => {
		lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
		const r = await actions.linkKb(kbEvent('k1'));
		expect(r).toMatchObject({ status: 404, data: { error: 'Knowledge base no longer exists.' } });
	});

	it('linkKb maps other failures to a 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.linkKb(kbEvent('k1'));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not link the knowledge base.' } });
	});

	it('unlinkKb PATCHes the KB with project_id: null', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
		const r = await actions.unlinkKb(kbEvent('k1'));
		expect(r).toEqual({ success: true });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: null });
	});

	it('unlinkKb treats 404 as silent success', async () => {
		lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
		const r = await actions.unlinkKb(kbEvent('k1'));
		expect(r).toEqual({ success: true });
	});

	it('unlinkKb maps other failures to a 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.unlinkKb(kbEvent('k1'));
		expect(r).toMatchObject({
			status: 502,
			data: { error: 'Could not unlink the knowledge base.' }
		});
	});
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: the 6 new cases FAIL (`actions.linkKb` / `unlinkKb` don't exist).

- [ ] **Step 3: Add the two actions**

In `src/routes/(app)/matters/[id]/+page.server.ts`, append inside the `actions` object:

```ts
  linkKb: async (event) => {
    const data = await event.request.formData();
    const kb_id = String(data.get('kb_id') ?? '');
    if (!kb_id) return fail(400, { error: 'Missing kb_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${kb_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ project_id: event.params.id })
    });
    if (!res.ok) {
      if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
      return fail(502, { error: 'Could not link the knowledge base.' });
    }
    return { success: true };
  },

  unlinkKb: async (event) => {
    const data = await event.request.formData();
    const kb_id = String(data.get('kb_id') ?? '');
    if (!kb_id) return fail(400, { error: 'Missing kb_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${kb_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ project_id: null })
    });
    // 200 + 404 → success (already gone is fine for the UI).
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not unlink the knowledge base.' });
    }
    return { success: true };
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: all 27 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.server.ts' 'src/routes/(app)/matters/[id]/page.server.test.ts'
git commit -m "feat(p4-3a): linkKb + unlinkKb server actions

KB↔matter linkage is a property of the KB row (KnowledgeBase.project_id);
both actions PATCH /api/v1/knowledge-bases/{kb_id}. linkKb sets
project_id to the matter id, maps 404 to a friendly 'no longer exists'
message. unlinkKb sets project_id: null, treats 404 as silent success
(already unlinked is fine for the UI). Other failures → 502 with the
appropriate friendly fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `attachSkill` + `detachSkill` server actions

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/matters/[id]/page.server.test.ts`:

```ts
const skillEvent = (skill_name: string, id = 'p1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ skill_name }) })
	}) as never;

describe('/matters/[id] attachSkill / detachSkill actions', () => {
	it('attachSkill POSTs { skill_name } to /projects/{id}/skills', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const r = await actions.attachSkill(skillEvent('contract-redline'));
		expect(r).toEqual({ success: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1/skills');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ skill_name: 'contract-redline' });
	});

	it('attachSkill maps 404 to a friendly error', async () => {
		lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
		const r = await actions.attachSkill(skillEvent('ghost'));
		expect(r).toMatchObject({ status: 404, data: { error: 'Skill no longer exists.' } });
	});

	it('attachSkill treats 409 as silent success', async () => {
		lqFetch.mockResolvedValue(new Response('already', { status: 409 }));
		const r = await actions.attachSkill(skillEvent('contract-redline'));
		expect(r).toEqual({ success: true });
	});

	it('attachSkill maps other failures to a 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.attachSkill(skillEvent('x'));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not attach the skill.' } });
	});

	it('detachSkill DELETEs /projects/{id}/skills/{name}', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const r = await actions.detachSkill(skillEvent('contract-redline'));
		expect(r).toEqual({ success: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1/skills/contract-redline');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('detachSkill treats 404 as silent success', async () => {
		lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
		const r = await actions.detachSkill(skillEvent('contract-redline'));
		expect(r).toEqual({ success: true });
	});

	it('detachSkill maps other failures to a 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.detachSkill(skillEvent('x'));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not detach the skill.' } });
	});
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: the 7 new cases FAIL.

- [ ] **Step 3: Add the two actions**

In `src/routes/(app)/matters/[id]/+page.server.ts`, append inside the `actions` object:

```ts
  attachSkill: async (event) => {
    const data = await event.request.formData();
    const skill_name = String(data.get('skill_name') ?? '');
    if (!skill_name) return fail(400, { error: 'Missing skill_name.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({ skill_name })
    });
    // 204 = success; 409 = already attached (silent success — race).
    if (!res.ok && res.status !== 409) {
      if (res.status === 404) return fail(404, { error: 'Skill no longer exists.' });
      return fail(502, { error: 'Could not attach the skill.' });
    }
    return { success: true };
  },

  detachSkill: async (event) => {
    const data = await event.request.formData();
    const skill_name = String(data.get('skill_name') ?? '');
    if (!skill_name) return fail(400, { error: 'Missing skill_name.' });
    const res = await lqFetch(event, `/api/v1/projects/${event.params.id}/skills/${skill_name}`, { method: 'DELETE' });
    // 204 + 404 → silent success.
    if (!res.ok && res.status !== 404) {
      return fail(502, { error: 'Could not detach the skill.' });
    }
    return { success: true };
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: all 34 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.server.ts' 'src/routes/(app)/matters/[id]/page.server.test.ts'
git commit -m "feat(p4-3a): attachSkill + detachSkill server actions

attachSkill POSTs { skill_name } to /api/v1/projects/{id}/skills.
404 → 'Skill no longer exists', 409 → silent success (already
attached), other failures → 502. detachSkill DELETEs
/api/v1/projects/{id}/skills/{skill_name}; 204 + 404 both return
success (idempotent).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `saveContext` server action

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/(app)/matters/[id]/page.server.test.ts`:

```ts
const ctxEvent = (context_md: string, id = 'p1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ context_md }) })
	}) as never;

describe('/matters/[id] saveContext action', () => {
	it('PATCHes the matter with the non-empty context_md', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
		const r = await actions.saveContext(ctxEvent('## Notes\n- thing'));
		expect(r).toEqual({ success: true });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ context_md: '## Notes\n- thing' });
	});

	it('sends context_md: null when the input is empty (clear case)', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
		const r = await actions.saveContext(ctxEvent(''));
		expect(r).toEqual({ success: true });
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ context_md: null });
	});

	it('pre-checks the 100 KiB byte cap without calling the backend', async () => {
		const huge = 'A'.repeat(102_401); // 102_401 ASCII bytes > 102_400-byte cap
		const r = await actions.saveContext(ctxEvent(huge));
		expect(r).toMatchObject({ status: 422, data: { error: 'Context exceeds the 100 KiB limit.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps a backend 422 to the same friendly oversize message', async () => {
		lqFetch.mockResolvedValue(new Response('{}', { status: 422 }));
		const r = await actions.saveContext(ctxEvent('within-cap'));
		expect(r).toMatchObject({ status: 422, data: { error: 'Context exceeds the 100 KiB limit.' } });
	});

	it('maps other failures to a 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		const r = await actions.saveContext(ctxEvent('x'));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not save the context.' } });
	});
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: the 5 new cases FAIL.

- [ ] **Step 3: Add the action**

In `src/routes/(app)/matters/[id]/+page.server.ts`, append inside the `actions` object:

```ts
saveContext: async (event) => {
	const data = await event.request.formData();
	const raw = String(data.get('context_md') ?? '');
	if (new TextEncoder().encode(raw).length > 102_400) {
		return fail(422, { error: 'Context exceeds the 100 KiB limit.' });
	}
	const body = { context_md: raw === '' ? null : raw };
	const res = await lqFetch(event, `/api/v1/projects/${event.params.id}`, {
		method: 'PATCH',
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		if (res.status === 422) return fail(422, { error: 'Context exceeds the 100 KiB limit.' });
		return fail(502, { error: 'Could not save the context.' });
	}
	return { success: true };
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run 'src/routes/(app)/matters/[id]/page.server.test.ts'`
Expected: all 39 cases PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.server.ts' 'src/routes/(app)/matters/[id]/page.server.test.ts'
git commit -m "feat(p4-3a): saveContext server action

PATCHes the matter's context_md via /api/v1/projects/{id}. Pre-checks
the 100 KiB byte cap (UTF-8 via TextEncoder) and returns 422 before
hitting the backend; backend 422 maps to the same friendly message.
Empty input is sent as context_md: null (clear). Other failures → 502.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `FilesSection.svelte` — compose Dropzone, FileRow, the upload form

**Files:**

- Create: `src/lib/matters/sections/FilesSection.svelte`
- Create: `src/lib/matters/sections/FilesSection.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/sections/FilesSection.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FilesSection from './FilesSection.svelte';
import type { components } from '$lib/api/backend';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

type File = components['schemas']['File'];

const file = (over: Partial<File>): File => ({
	id: 'f1',
	owner_id: 'u',
	filename: 'msa.pdf',
	mime_type: 'application/pdf',
	size_bytes: 1024,
	ingestion_status: 'ready',
	created_at: '2026-05-28T00:00:00Z',
	...over
});

describe('FilesSection', () => {
	it('renders the Files heading', () => {
		render(FilesSection, { props: { files: [] } });
		expect(screen.getByRole('heading', { name: /files/i })).toBeInTheDocument();
	});

	it('empty state shows the Dropzone prompt and no rows', () => {
		render(FilesSection, { props: { files: [] } });
		expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
		expect(screen.queryByText(/msa\.pdf/)).not.toBeInTheDocument();
	});

	it('populated state shows one row per file plus an "Add file" button', () => {
		render(FilesSection, {
			props: { files: [file({ id: 'a', filename: 'a.pdf' }), file({ id: 'b', filename: 'b.pdf' })] }
		});
		expect(screen.getByText('a.pdf')).toBeInTheDocument();
		expect(screen.getByText('b.pdf')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /add file/i })).toBeInTheDocument();
	});

	it('"Add file" button opens the hidden file input', async () => {
		render(FilesSection, { props: { files: [file({})] } });
		// The hidden input is the form's; the Dropzone is hidden in populated state.
		const inputs = document.querySelectorAll('input[type="file"]');
		expect(inputs.length).toBeGreaterThanOrEqual(1);
		const clickSpy = vi.spyOn(inputs[0] as HTMLInputElement, 'click');
		await userEvent.click(screen.getByRole('button', { name: /add file/i }));
		expect(clickSpy).toHaveBeenCalled();
	});

	it('wraps the upload input in a form pointing at ?/uploadFile with multipart enctype', () => {
		render(FilesSection, { props: { files: [] } });
		const form = screen.getByRole('form', { name: /upload files/i });
		expect(form).toHaveAttribute('action', '?/uploadFile');
		expect(form).toHaveAttribute('enctype', 'multipart/form-data');
	});

	it('surfaces a server error message via the error prop', () => {
		render(FilesSection, { props: { files: [], error: 'File "x" is too large — max 100 MB.' } });
		expect(screen.getByText(/file "x" is too large/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/sections/FilesSection.svelte.test.ts`
Expected: FAIL with "cannot find module './FilesSection.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/sections/FilesSection.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { components } from '$lib/api/backend';
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import FileRow from '$lib/matters/files/FileRow.svelte';

	type ProjectFile = components['schemas']['File'];

	let { files, error = '' }: { files: ProjectFile[]; error?: string } = $props();

	let form = $state<HTMLFormElement>();
	let input = $state<HTMLInputElement>();

	function openPicker() {
		input?.click();
	}
	function submitWith(droppedFiles: File[]) {
		if (!form || !input) return;
		const dt = new DataTransfer();
		for (const f of droppedFiles) dt.items.add(f);
		input.files = dt.files;
		form.requestSubmit();
	}
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Files</h2>

	<form
		bind:this={form}
		method="POST"
		action="?/uploadFile"
		enctype="multipart/form-data"
		use:enhance
		aria-label="Upload files"
	>
		<input
			bind:this={input}
			type="file"
			name="file"
			multiple
			onchange={() => form?.requestSubmit()}
			class="sr-only"
		/>

		{#if files.length === 0}
			<Dropzone onfiles={(fs) => submitWith(fs)} />
		{:else}
			<div class="rounded-mlq-control border border-mlq-subtle">
				{#each files as f (f.id)}
					<FileRow file={f} />
				{/each}
			</div>
			<div class="mt-2">
				<button
					type="button"
					onclick={openPicker}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
					>+ Add file</button
				>
			</div>
		{/if}

		{#if error}<p class="mt-2 text-xs text-mlq-error">{error}</p>{/if}
	</form>
</section>
```

Note: this component uses two `<input type="file">` elements when in the empty state — the form's hidden one (`name="file"`) AND the Dropzone's internal one. The Dropzone calls `onfiles` (which builds a `DataTransfer` and assigns to the form's input, then submits) so both paths converge on the same form submission.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/sections/FilesSection.svelte.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/sections/FilesSection.svelte src/lib/matters/sections/FilesSection.svelte.test.ts
git commit -m "feat(p4-3a): FilesSection — empty Dropzone / populated list + Add

Composes Dropzone + FileRow inside a single <form action='?/uploadFile'
enctype='multipart/form-data' use:enhance>. The hidden input owns the
'file' field; drag-drop builds a DataTransfer and assigns it before
calling form.requestSubmit() so click-to-pick and drop share the same
submission path. Server error surfaces inline via the optional 'error'
prop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `KnowledgeSection.svelte` — empty / linked + picker

**Files:**

- Create: `src/lib/matters/sections/KnowledgeSection.svelte`
- Create: `src/lib/matters/sections/KnowledgeSection.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/sections/KnowledgeSection.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import KnowledgeSection from './KnowledgeSection.svelte';
import type { components } from '$lib/api/backend';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

type KnowledgeBase = components['schemas']['KnowledgeBase'];

const kb = (over: Partial<KnowledgeBase>): KnowledgeBase => ({
	id: 'k1',
	name: 'Standards',
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 3,
	chunk_count: 50,
	created_at: '2026-05-28T00:00:00Z',
	updated_at: '2026-05-28T00:00:00Z',
	...over
});

describe('KnowledgeSection', () => {
	it('renders the Knowledge heading', () => {
		render(KnowledgeSection, { props: { kbs: { linked: [], available: [] } } });
		expect(screen.getByRole('heading', { name: /knowledge/i })).toBeInTheDocument();
	});

	it('empty linked state shows the helper line + Link button', () => {
		render(KnowledgeSection, { props: { kbs: { linked: [], available: [kb({ id: 'a' })] } } });
		expect(screen.getByText(/no knowledge bases linked/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /link a knowledge base/i })).toBeInTheDocument();
	});

	it('linked state shows rows with file_count and an Unlink form per row', () => {
		render(KnowledgeSection, {
			props: {
				kbs: { linked: [kb({ id: 'k1', name: 'Linked KB', file_count: 5 })], available: [] }
			}
		});
		expect(screen.getByText('Linked KB')).toBeInTheDocument();
		expect(screen.getByText(/5 files/i)).toBeInTheDocument();
		const form = screen.getByRole('form', { name: /unlink linked kb/i });
		expect(form).toHaveAttribute('action', '?/unlinkKb');
		expect((form.querySelector('input[name="kb_id"]') as HTMLInputElement).value).toBe('k1');
	});

	it('opens the picker and submits ?/linkKb with the chosen kb_id', async () => {
		render(KnowledgeSection, {
			props: { kbs: { linked: [], available: [kb({ id: 'a', name: 'Alpha' })] } }
		});
		await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		// Picker shows Alpha; click it. The component should populate a hidden link form and submit.
		// We can verify by checking that a form for linkKb exists with the kb_id after the click.
		const alpha = screen.getByText('Alpha');
		await userEvent.click(alpha);
		const linkForm = screen.getByTestId('link-kb-form') as HTMLFormElement;
		expect(linkForm.getAttribute('action')).toBe('?/linkKb');
		expect((linkForm.querySelector('input[name="kb_id"]') as HTMLInputElement).value).toBe('a');
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/sections/KnowledgeSection.svelte.test.ts`
Expected: FAIL with "cannot find module './KnowledgeSection.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/sections/KnowledgeSection.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import type { components } from '$lib/api/backend';
	import KbPicker from '$lib/matters/knowledge/KbPicker.svelte';

	type KnowledgeBase = components['schemas']['KnowledgeBase'];

	let { kbs }: { kbs: { linked: KnowledgeBase[]; available: KnowledgeBase[] } } = $props();

	let linkForm = $state<HTMLFormElement>();
	let pendingKbId = $state('');

	function pick(kbId: string) {
		pendingKbId = kbId;
		// tick happens via Svelte's DOM update; requestSubmit fires the form once the value is in.
		queueMicrotask(() => linkForm?.requestSubmit());
	}
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Knowledge</h2>

	{#if kbs.linked.length === 0}
		<div
			class="flex items-center justify-between gap-3 rounded-mlq-control border border-mlq-subtle px-3 py-3"
		>
			<p class="text-xs text-mlq-muted">
				No knowledge bases linked. Linking a KB makes its documents available to chats in this
				matter.
			</p>
			<KbPicker kbs={kbs.available} onpick={pick} />
		</div>
	{:else}
		<div class="rounded-mlq-control border border-mlq-subtle">
			{#each kbs.linked as k (k.id)}
				<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
					<span class="min-w-0 flex-1 truncate text-sm text-mlq-text">{k.name}</span>
					<span class="shrink-0 text-xs text-mlq-muted">{k.file_count} files</span>
					<form
						method="POST"
						action="?/unlinkKb"
						use:enhance
						aria-label={`Unlink ${k.name}`}
						class="shrink-0"
					>
						<input type="hidden" name="kb_id" value={k.id} />
						<button
							type="submit"
							aria-label={`Unlink ${k.name}`}
							class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"
							><X size={14} /></button
						>
					</form>
				</div>
			{/each}
		</div>
		<div class="mt-2 flex justify-end">
			<KbPicker kbs={kbs.available} onpick={pick} />
		</div>
	{/if}

	<!-- Single hidden form for the picker; its kb_id is set just before requestSubmit. -->
	<form
		bind:this={linkForm}
		method="POST"
		action="?/linkKb"
		use:enhance
		data-testid="link-kb-form"
		class="hidden"
	>
		<input type="hidden" name="kb_id" value={pendingKbId} />
	</form>
</section>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/sections/KnowledgeSection.svelte.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/sections/KnowledgeSection.svelte src/lib/matters/sections/KnowledgeSection.svelte.test.ts
git commit -m "feat(p4-3a): KnowledgeSection — link existing KBs, unlink per row

Empty state: helper line + KbPicker trigger. Linked state: a row per
KB with file_count and a per-row Unlink form (?/unlinkKb). The KbPicker
calls onpick(kbId), which feeds a single hidden ?/linkKb form via a
\$state-backed kb_id + queueMicrotask requestSubmit — keeping all KB
mutations driven by SvelteKit form actions instead of imperative fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `createMatterSkillAttach.svelte.ts` — matter-scoped controller

**Why now:** SkillsSection needs this controller to drive the reused `SkillAttach.svelte` popover. Independent of the section, so test it standalone first.

**Files:**

- Create: `src/lib/matters/skills/createMatterSkillAttach.svelte.ts`
- Create: `src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createMatterSkillAttach } from './createMatterSkillAttach.svelte';

describe('createMatterSkillAttach', () => {
	it('open() fetches /skills/autocomplete with empty q and exposes results', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ results: [{ slug: 'r1', title: 'Redline', scope: 'builtin' }] }),
					{ status: 200 }
				)
			);
		const c = createMatterSkillAttach({ onattach: vi.fn() });
		await c.open(fetchFn);
		flushSync();
		expect(fetchFn).toHaveBeenCalledWith('/skills/autocomplete?q=&limit=8');
		expect(c.results.map((r) => r.slug)).toEqual(['r1']);
		expect(c.loading).toBe(false);
		expect(c.error).toBe(false);
	});

	it('search(q) fetches with the encoded q', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
		const c = createMatterSkillAttach({ onattach: vi.fn() });
		await c.search('contract redline', fetchFn);
		expect(fetchFn).toHaveBeenCalledWith('/skills/autocomplete?q=contract%20redline&limit=8');
	});

	it('sets error: true and empties results on a non-ok response', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }));
		const c = createMatterSkillAttach({ onattach: vi.fn() });
		await c.open(fetchFn);
		flushSync();
		expect(c.error).toBe(true);
		expect(c.results).toEqual([]);
	});

	it('attach(s) calls the onattach callback with the slug', () => {
		const onattach = vi.fn();
		const c = createMatterSkillAttach({ onattach });
		c.attach({ slug: 'redline', title: 'Redline', scope: 'builtin' });
		expect(onattach).toHaveBeenCalledWith('redline');
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts`
Expected: FAIL with "cannot find module './createMatterSkillAttach.svelte'".

- [ ] **Step 3: Implement the controller**

Create `src/lib/matters/skills/createMatterSkillAttach.svelte.ts`:

```ts
import type { SkillSuggestion } from '$lib/skills/types';

/** Matter-scoped controller for the reused composer SkillAttach.svelte popover.
 *  Mirrors the composer's controller's reactive surface ({ results, loading,
 *  error, open, search, attach }) but delegates attach to a caller-provided
 *  callback — which submits the matter form action — instead of holding local
 *  attached state. The persistent 'attached' list comes from
 *  matter.attached_skill_names on every load. */
export function createMatterSkillAttach({ onattach }: { onattach: (slug: string) => void }) {
	let results = $state<SkillSuggestion[]>([]);
	let loading = $state(false);
	let error = $state(false);

	async function fetchResults(q: string, fetchFn: typeof fetch) {
		loading = true;
		error = false;
		try {
			const res = await fetchFn(`/skills/autocomplete?q=${encodeURIComponent(q)}&limit=8`);
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { results: SkillSuggestion[] };
			results = body.results ?? [];
		} catch {
			error = true;
			results = [];
		} finally {
			loading = false;
		}
	}

	return {
		get results() {
			return results;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
		search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
		attach(s: SkillSuggestion) {
			onattach(s.slug);
		}
	};
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/skills/createMatterSkillAttach.svelte.ts src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts
git commit -m "feat(p4-3a): createMatterSkillAttach — matter-scoped controller

Mirrors the composer's createSkillAttach reactive surface (results,
loading, error, open, search) but delegates attach to a caller-provided
callback so the matter section can submit ?/attachSkill instead of
holding local attached state. The attached list comes from
matter.attached_skill_names on every SSR load.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `SkillsSection.svelte` — chips + reused `SkillAttach.svelte` popover

**Files:**

- Create: `src/lib/matters/sections/SkillsSection.svelte`
- Create: `src/lib/matters/sections/SkillsSection.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/sections/SkillsSection.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SkillsSection from './SkillsSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('SkillsSection', () => {
	it('renders the Skills heading', () => {
		render(SkillsSection, { props: { attached: [] } });
		expect(screen.getByRole('heading', { name: /skills/i })).toBeInTheDocument();
	});

	it('empty state shows the ⊕ Skill trigger and no chips', () => {
		render(SkillsSection, { props: { attached: [] } });
		expect(screen.getByRole('button', { name: /attach skill/i })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
	});

	it('renders one chip per attached skill', () => {
		render(SkillsSection, { props: { attached: ['redline', 'summarize'] } });
		expect(screen.getByText('redline')).toBeInTheDocument();
		expect(screen.getByText('summarize')).toBeInTheDocument();
	});

	it('each chip has a Remove form that posts ?/detachSkill with the skill_name', () => {
		render(SkillsSection, { props: { attached: ['redline'] } });
		const form = screen.getByRole('form', { name: /remove redline/i });
		expect(form).toHaveAttribute('action', '?/detachSkill');
		expect((form.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe(
			'redline'
		);
	});

	it('opening the picker fetches /skills/autocomplete; clicking a result populates the attach form and submits', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ results: [{ slug: 'redline', title: 'Redline', scope: 'builtin' }] }),
					{ status: 200 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		render(SkillsSection, { props: { attached: [] } });
		await userEvent.click(screen.getByRole('button', { name: /attach skill/i }));
		// The autocomplete fires; await a tick.
		await new Promise((r) => setTimeout(r, 0));
		await userEvent.click(screen.getByText('Redline'));
		const attachForm = screen.getByTestId('attach-skill-form') as HTMLFormElement;
		expect(attachForm.getAttribute('action')).toBe('?/attachSkill');
		expect((attachForm.querySelector('input[name="skill_name"]') as HTMLInputElement).value).toBe(
			'redline'
		);
		vi.unstubAllGlobals();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/sections/SkillsSection.svelte.test.ts`
Expected: FAIL with "cannot find module './SkillsSection.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/sections/SkillsSection.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import SkillAttach from '$lib/components/SkillAttach.svelte';
	import { createMatterSkillAttach } from '$lib/matters/skills/createMatterSkillAttach.svelte';

	let { attached }: { attached: string[] } = $props();

	let attachForm = $state<HTMLFormElement>();
	let pendingSlug = $state('');

	const controller = createMatterSkillAttach({
		onattach: (slug) => {
			pendingSlug = slug;
			queueMicrotask(() => attachForm?.requestSubmit());
		}
	});
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Skills</h2>

	<div class="flex flex-wrap items-center gap-2">
		{#each attached as slug (slug)}
			<form
				method="POST"
				action="?/detachSkill"
				use:enhance
				aria-label={`Remove ${slug}`}
				class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
			>
				<input type="hidden" name="skill_name" value={slug} />
				<span>{slug}</span>
				<button
					type="submit"
					aria-label={`Remove ${slug}`}
					class="text-mlq-muted hover:text-mlq-text"><X size={12} /></button
				>
			</form>
		{/each}
		<SkillAttach
			results={controller.results}
			loading={controller.loading}
			error={controller.error}
			onopen={controller.open}
			onsearch={controller.search}
			onattach={(s) => controller.attach(s)}
		/>
	</div>

	<!-- Single hidden form for picker-driven attaches. -->
	<form
		bind:this={attachForm}
		method="POST"
		action="?/attachSkill"
		use:enhance
		data-testid="attach-skill-form"
		class="hidden"
	>
		<input type="hidden" name="skill_name" value={pendingSlug} />
	</form>
</section>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/sections/SkillsSection.svelte.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/sections/SkillsSection.svelte src/lib/matters/sections/SkillsSection.svelte.test.ts
git commit -m "feat(p4-3a): SkillsSection — attached chips + reused SkillAttach popover

Renders one chip per attached_skill_name (each chip is its own little
?/detachSkill form). Drives the composer's SkillAttach.svelte (purely
presentational; no changes needed) with a new createMatterSkillAttach
controller that submits ?/attachSkill via a single hidden form on
selection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `ContextSection.svelte` — Markdown editor + byte counter

**Files:**

- Create: `src/lib/matters/sections/ContextSection.svelte`
- Create: `src/lib/matters/sections/ContextSection.svelte.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/matters/sections/ContextSection.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ContextSection from './ContextSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('ContextSection', () => {
	it('renders the Context heading and the helper line', () => {
		render(ContextSection, { props: { value: '' } });
		expect(screen.getByRole('heading', { name: /context/i })).toBeInTheDocument();
		expect(screen.getByText(/markdown notes the assistant sees/i)).toBeInTheDocument();
	});

	it('seeds the textarea from the value prop', () => {
		render(ContextSection, { props: { value: '## Notes' } });
		expect(
			(screen.getByRole('textbox', { name: /matter context/i }) as HTMLTextAreaElement).value
		).toBe('## Notes');
	});

	it('Save button is disabled when the value equals the seeded value', () => {
		render(ContextSection, { props: { value: 'init' } });
		expect(screen.getByRole('button', { name: /save context/i })).toBeDisabled();
	});

	it('Save button enables when the textarea changes', async () => {
		render(ContextSection, { props: { value: 'init' } });
		await fireEvent.input(screen.getByRole('textbox', { name: /matter context/i }), {
			target: { value: 'changed' }
		});
		expect(screen.getByRole('button', { name: /save context/i })).toBeEnabled();
	});

	it('shows a byte counter and goes red over the 102_400-byte cap', async () => {
		render(ContextSection, { props: { value: '' } });
		const ta = screen.getByRole('textbox', { name: /matter context/i });
		await fireEvent.input(ta, { target: { value: 'A'.repeat(50) } });
		const counter = screen.getByTestId('context-bytes');
		expect(counter).toHaveTextContent('50 / 102400 bytes');
		expect(counter.className).not.toMatch(/text-mlq-error/);

		await fireEvent.input(ta, { target: { value: 'A'.repeat(102_401) } });
		expect(counter.className).toMatch(/text-mlq-error/);
		expect(screen.getByRole('button', { name: /save context/i })).toBeDisabled();
	});

	it('counts UTF-8 bytes (not characters) for multi-byte input', async () => {
		render(ContextSection, { props: { value: '' } });
		await fireEvent.input(screen.getByRole('textbox', { name: /matter context/i }), {
			target: { value: '日' }
		}); // 3 UTF-8 bytes
		expect(screen.getByTestId('context-bytes')).toHaveTextContent('3 / 102400 bytes');
	});

	it('wraps the form posting to ?/saveContext', () => {
		render(ContextSection, { props: { value: '' } });
		const form = screen.getByRole('form', { name: /matter context/i });
		expect(form).toHaveAttribute('action', '?/saveContext');
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/sections/ContextSection.svelte.test.ts`
Expected: FAIL with "cannot find module './ContextSection.svelte'".

- [ ] **Step 3: Implement the component**

Create `src/lib/matters/sections/ContextSection.svelte`:

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';

	let { value: initial = '' }: { value?: string } = $props();

	let value = $state(untrack(() => initial));

	const bytes = $derived(new TextEncoder().encode(value).length);
	const overCap = $derived(bytes > 102_400);
	const dirty = $derived(value !== initial);
	const canSave = $derived(dirty && !overCap);
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Context</h2>
	<p class="mb-2 text-xs text-mlq-muted">
		Markdown notes the assistant sees on every chat in this matter. Optional, max 100 KiB.
	</p>

	<form
		method="POST"
		action="?/saveContext"
		use:enhance
		aria-label="Matter context"
		class="space-y-2"
	>
		<textarea
			name="context_md"
			bind:value
			rows="4"
			aria-label="Matter context"
			class="block max-h-96 w-full resize-y rounded-mlq-control border border-mlq-subtle bg-mlq-surface px-3 py-2 text-sm text-mlq-text outline-none"
		></textarea>
		<div class="flex items-center justify-between">
			<p
				data-testid="context-bytes"
				class={overCap ? 'text-xs text-mlq-error' : 'text-xs text-mlq-muted'}
			>
				{bytes} / 102400 bytes
			</p>
			<button
				type="submit"
				disabled={!canSave}
				class="rounded-mlq-control bg-mlq-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
				>Save context</button
			>
		</div>
	</form>
</section>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/sections/ContextSection.svelte.test.ts`
Expected: 7/7 PASS.

- [ ] **Step 5: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matters/sections/ContextSection.svelte src/lib/matters/sections/ContextSection.svelte.test.ts
git commit -m "feat(p4-3a): ContextSection — Markdown editor + UTF-8 byte counter

Seeds from the value prop via untrack (codebase idiom). \$derived
state tracks bytes (via TextEncoder so non-ASCII counts correctly),
overCap (> 102_400 bytes), dirty (value differs from initial), and
canSave (dirty && !overCap). Counter renders red over the cap; Save
button disables. Form posts to ?/saveContext.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Wire the four sections into the matter detail page

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.svelte`

- [ ] **Step 1: Add imports**

In `src/routes/(app)/matters/[id]/+page.svelte`, find the `<script lang="ts">` opening and the existing two component imports:

```svelte
import MatterForm from '$lib/matters/MatterForm.svelte'; import PrivilegedChip from
'$lib/matters/PrivilegedChip.svelte';
```

Append the four section imports immediately below them:

```svelte
import FilesSection from '$lib/matters/sections/FilesSection.svelte'; import KnowledgeSection from
'$lib/matters/sections/KnowledgeSection.svelte'; import SkillsSection from
'$lib/matters/sections/SkillsSection.svelte'; import ContextSection from
'$lib/matters/sections/ContextSection.svelte';
```

- [ ] **Step 2: Render the four sections between the existing buttons row and the chats list**

Find the closing `</div>` of the buttons block (immediately after `<button … Archive</button>`):

```svelte
      <button type="button" onclick={() => (confirmArchive = true)} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error">Archive</button>
    </div>
  </div>

  <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Chats · {data.chats.length}</h2>
```

Insert the four sections in between, immediately after the `</div>` that closes `mb-6 border-b border-mlq-subtle pb-5` and before the `Chats` `<h2>`:

```svelte
      <button type="button" onclick={() => (confirmArchive = true)} class="rounded-mlq-control border border-mlq-subtle px-3 py-1.5 text-xs text-mlq-error">Archive</button>
    </div>
  </div>

  <FilesSection files={data.files} error={form?.error ?? ''} />
  <KnowledgeSection kbs={data.kbs} />
  <SkillsSection attached={data.matter.attached_skill_names ?? []} />
  <ContextSection value={data.matter.context_md ?? ''} />

  <h2 class="mt-8 mb-2 text-xs font-medium uppercase tracking-wide text-mlq-muted">Chats · {data.chats.length}</h2>
```

(Note: change the `Chats` `<h2>` class from `mb-2` to `mt-8 mb-2` so the chats heading gets some breathing room below the new ContextSection.)

- [ ] **Step 3: Run the full unit suite — expect no regressions**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 4: Verify `npm run check` clean**

Run: `npm run check`
Expected: exit 0 / 0 errors / 0 warnings.

- [ ] **Step 5: ESLint clean on the touched file**

Run: `npx eslint 'src/routes/(app)/matters/[id]/+page.svelte'`
Expected: no output / exit 0.

- [ ] **Step 6: Commit**

```bash
git add 'src/routes/(app)/matters/[id]/+page.svelte'
git commit -m "feat(p4-3a): wire FilesSection / KnowledgeSection / SkillsSection / ContextSection into matter detail

Renders the four new sections between the existing buttons row and the
chats list. FilesSection consumes data.files (load fan-out from
attached_file_ids) and surfaces form?.error for upload-level errors.
KnowledgeSection takes data.kbs ({linked, available}). SkillsSection
gets attached_skill_names. ContextSection seeds from context_md. The
chats heading gains mt-8 so it doesn't crowd the new Context section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Live e2e — `tests/matter-files.spec.ts`

**Files:**

- Create: `tests/matter-files.spec.ts`

- [ ] **Step 1: Rebuild `donna-web`**

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` is rebuilt and shows healthy in `docker compose ps`.

- [ ] **Step 2: Write the spec file**

Create `tests/matter-files.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';

async function token(): Promise<string> {
	return (
		await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		}).then((r) => r.json())
	).access_token;
}
async function api(tok: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${tok}`, ...(init.headers || {}) }
	});
}
async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('matter docs surface — upload + list + remove a file, edit context, link/unlink a KB', async ({
	page
}) => {
	test.setTimeout(180_000);
	const tok = await token();

	// Seed: a fresh matter + a fresh KB (the KB is the only "other KB to link" so the picker shows it).
	const unique = `E2E Docs ${Date.now()}`;
	const pid = (
		await api(tok, '/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: unique })
		}).then((r) => r.json())
	).id as string;
	const kbName = `E2E KB ${Date.now()}`;
	const kid = (
		await api(tok, '/knowledge-bases', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: kbName })
		}).then((r) => r.json())
	).id as string;

	try {
		await login(page);
		await page.goto(`/matters/${pid}`);

		// All four section headings render.
		await expect(page.getByRole('heading', { name: /files/i })).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('heading', { name: /knowledge/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /skills/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /context/i })).toBeVisible();

		// Files: empty state shows the Dropzone.
		await expect(page.getByRole('button', { name: /upload files/i })).toBeVisible();

		// Upload spike.pdf via the hidden file input (which carries name="file").
		const fileChooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: /upload files/i }).click();
		const chooser = await fileChooserPromise;
		await chooser.setFiles(PDF);

		// After the form submits + SvelteKit reloads, the row appears.
		await expect(page.getByText(/spike\.pdf/i)).toBeVisible({ timeout: 30000 });

		// Remove the file: the Dropzone returns.
		await page.getByRole('button', { name: /remove spike\.pdf/i }).click();
		await expect(page.getByRole('button', { name: /upload files/i })).toBeVisible({
			timeout: 15000
		});

		// Edit + save context_md.
		const ctx = page.getByRole('textbox', { name: /matter context/i });
		await ctx.fill('# Matter notes\n- thing');
		await page.getByRole('button', { name: /save context/i }).click();
		// After reload, the textarea retains the value.
		await page.reload();
		await expect(page.getByRole('textbox', { name: /matter context/i })).toHaveValue(
			'# Matter notes\n- thing'
		);

		// Link the seeded KB.
		await page.getByRole('button', { name: /link a knowledge base/i }).click();
		await page.getByText(kbName, { exact: true }).click();
		await expect(page.getByText(kbName, { exact: true })).toBeVisible({ timeout: 15000 });

		// Unlink it.
		await page.getByRole('button', { name: new RegExp(`unlink ${kbName}`, 'i') }).click();
		await expect(page.getByText(kbName, { exact: true })).toHaveCount(0, { timeout: 15000 });
	} finally {
		// Unconditional cleanup.
		await api(tok, `/projects/${pid}`, { method: 'DELETE' });
		await api(tok, `/knowledge-bases/${kid}`, { method: 'DELETE' });
	}
});
```

- [ ] **Step 3: Run only this spec**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test tests/matter-files.spec.ts --reporter=line
```

Expected: 1 passed. If a transient cold-start fails the first run, retry once.

- [ ] **Step 4: Confirm cleanup left no leftovers**

```bash
set -a; . ./.env; set +a
TOK=$(curl -s "${DONNA_LQ_AI_API:-http://localhost:18000/api/v1}/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$DONNA_E2E_EMAIL\",\"password\":\"$DONNA_E2E_PASSWORD\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -s "${DONNA_LQ_AI_API:-http://localhost:18000/api/v1}/projects" -H "authorization: Bearer $TOK" | python3 -c 'import json,sys; print([m["name"] for m in json.load(sys.stdin) if m["name"].startswith("E2E Docs ")])'
curl -s "${DONNA_LQ_AI_API:-http://localhost:18000/api/v1}/knowledge-bases" -H "authorization: Bearer $TOK" | python3 -c 'import json,sys; print([k["name"] for k in json.load(sys.stdin) if k["name"].startswith("E2E KB ")])'
```

Expected: both `[]` outputs (no leftover `E2E Docs …` matters or `E2E KB …` KBs).

- [ ] **Step 5: ESLint clean on the file**

Run: `npx eslint tests/matter-files.spec.ts`
Expected: no output / exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/matter-files.spec.ts
git commit -m "test(p4-3a): live e2e — matter docs surface end-to-end

Seeds a fresh matter + a fresh KB via the API; asserts the four
section headings render, uploads spike.pdf via the file picker and
asserts the row appears, removes it and asserts the Dropzone returns,
edits + saves context_md and asserts it persists across reload, links
the seeded KB via the picker, then unlinks it. Self-cleans (archives
both seeded rows in try/finally) so the shared admin account doesn't
accumulate state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Final quality bar pass + PR

- [ ] **Step 1: Rebuild `donna-web` against the final code**

Run:

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web
```

Expected: `donna-web` rebuilt and healthy.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Full svelte-check**

Run: `npm run check`
Expected: exit 0 / "0 errors and 0 warnings" (vendor `ERR_MODULE_NOT_FOUND` stderr harmless).

- [ ] **Step 4: ESLint clean on touched files**

Run:

```bash
npx eslint \
  src/lib/matters/files/uploadFile.ts \
  src/lib/matters/files/uploadFile.test.ts \
  src/lib/matters/files/Dropzone.svelte \
  src/lib/matters/files/Dropzone.svelte.test.ts \
  src/lib/matters/files/FileRow.svelte \
  src/lib/matters/files/FileRow.svelte.test.ts \
  src/lib/matters/knowledge/KbPicker.svelte \
  src/lib/matters/knowledge/KbPicker.svelte.test.ts \
  src/lib/matters/skills/createMatterSkillAttach.svelte.ts \
  src/lib/matters/skills/createMatterSkillAttach.svelte.test.ts \
  src/lib/matters/sections/FilesSection.svelte \
  src/lib/matters/sections/FilesSection.svelte.test.ts \
  src/lib/matters/sections/KnowledgeSection.svelte \
  src/lib/matters/sections/KnowledgeSection.svelte.test.ts \
  src/lib/matters/sections/SkillsSection.svelte \
  src/lib/matters/sections/SkillsSection.svelte.test.ts \
  src/lib/matters/sections/ContextSection.svelte \
  src/lib/matters/sections/ContextSection.svelte.test.ts \
  "src/routes/(app)/matters/[id]/+page.server.ts" \
  "src/routes/(app)/matters/[id]/+page.svelte" \
  "src/routes/(app)/matters/[id]/page.server.test.ts" \
  tests/matter-files.spec.ts
```

Expected: no output / exit 0. (Repo-wide `npm run lint` stays pre-existingly red — the gate is touched files.)

- [ ] **Step 5: Re-run the full Playwright suite**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test --reporter=line
```

Expected: all specs green, including `tests/matter-files.spec.ts` and `tests/matter-privilege.spec.ts`. `tests/citation-pills.spec.ts` and `tests/citation-live.spec.ts` are **pre-existingly broken on `main`** (P3-2 changed click semantics; see `donna-phase-status` memory) — those failures are not introduced by this PR. `tests/citation-highlight.spec.ts` should pass (P3-polish PR #16 made it more robust). Per `donna-dev-stack` memory, the citation-live spec is timing-sensitive on embeddings — pass on retry once embeddings settle.

- [ ] **Step 6: Fix-up commit if anything came up**

Run:

```bash
git status
# If working tree is clean, skip this step. Otherwise:
git add -A
git commit -m "chore(p4-3a): final quality-bar fixups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Push and open the PR**

Run:

```bash
git push -u origin p4-3a-matter-docs
gh pr create --base main --title "P4-3a: matter docs / skills / context / KB linking" --body "$(cat <<'EOF'
First P4-3 sub-slice. Adds four sections to the matter detail page: **Files** (upload via multipart form action with drop-zone-replaces-section-when-empty UX, attach, list, remove), **Knowledge** (link/unlink existing KBs against the user's catalog), **Skills** (attach/detach via the composer's reused SkillAttach.svelte popover and a new matter-scoped controller), **Context** (Markdown editor with a UTF-8 byte counter and 422 fallback). All seven new server actions live on the existing matter `[id]/+page.server.ts`.

## Artifacts
- **Spec:** `docs/superpowers/specs/2026-05-28-donna-p4-3a-matter-docs-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-28-donna-p4-3a-matter-docs.md`

## Backend
No changes — every endpoint touched is already in the generated contract (`vendor/lq-ai` @ `438198c`). Pin unchanged. **Handoff drift correction:** KB↔matter linkage is on the KB row (`PATCH /knowledge-bases/{kb_id}` `{project_id}`), not via a non-existent `/projects/{id}/knowledge-bases` endpoint the P4 handoff implied.

## Quality bar
- `npm run check` — **0 errors, 0 warnings**.
- `npx vitest run` — green.
- `npx eslint <touched files>` — clean on every touched file.
- `npx playwright test tests/matter-files.spec.ts` — green; self-cleans via `try/finally` (archives the seeded matter and KB via API).

### Pre-existing failures (not from this PR)
`tests/citation-pills.spec.ts` and `tests/citation-live.spec.ts` fail on `origin/main` HEAD with the same error pattern; documented in `donna-phase-status` memory. Out of scope for P4-3a.

## Process
17 TDD tasks via subagent-driven-development with two-stage review (spec compliance → code quality) per task.

## What's deferred (next slice — P4-3b)
KB **creation** + KB **upload** with ingestion-status polling — the picker already surfaces "Creating a KB lands in a follow-up slice" when there are no available KBs to link, so the deferred state is visible rather than silently empty.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `main`.

---

## Self-review — spec coverage check

| Spec section                     | Implemented in                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 Goal — four sections          | Tasks 10 (Files), 11 (Knowledge), 13 (Skills), 14 (Context) + Task 15 (wiring)                                                                                                                                                                                                                                  |
| §2 Backend contract              | Tasks 5 (load fan-out), 6 (files actions — 413 mapping), 7 (KB PATCH), 8 (skills POST/DELETE), 9 (context_md PATCH + 422)                                                                                                                                                                                       |
| §3 Decisions (Q1–Q5)             | Q1 split → spec only; Q2 dropzone-when-empty → Task 10; Q3 SkillAttach reuse → Tasks 12+13; Q4 plain textarea → Task 14; Q5 link-only → Tasks 4+7+11 (deferred-create copy in Task 4 picker)                                                                                                                    |
| §4 Architecture — file structure | All Tasks 1–14 follow the file layout in §4.1/§4.2; Task 15 wires them in                                                                                                                                                                                                                                       |
| §5 Files section behavior        | Task 1 (helpers) + Task 2 (Dropzone) + Task 3 (FileRow) + Task 6 (actions) + Task 10 (composer); 413 mapping (Task 6); 409 silent success (Task 6); detach idempotent (Task 6)                                                                                                                                  |
| §6 Knowledge section             | Task 4 (picker) + Task 7 (actions) + Task 11 (composer); deferred-create copy in picker (Task 4); 404 friendly on link / silent on unlink (Task 7)                                                                                                                                                              |
| §7 Skills section                | Task 8 (actions) + Task 12 (controller) + Task 13 (composer); reuses composer `SkillAttach.svelte` directly (verified at plan time: it's purely presentational)                                                                                                                                                 |
| §8 Context section               | Task 9 (action with pre-check + 422 mapping) + Task 14 (UI with UTF-8 byte counter via TextEncoder)                                                                                                                                                                                                             |
| §9 File-level change map         | Tasks 1–14 + 15 + 16 cover every file in §9                                                                                                                                                                                                                                                                     |
| §10 Testing strategy             | Per-section unit tests in Tasks 2–4, 10–14 + helper test in Task 1 + controller test in Task 12; load test extension in Task 5; per-action tests in Tasks 6–9; live e2e in Task 16; full quality bar in Task 17                                                                                                 |
| §11 Risks & edges                | N+1 file fetches (Task 5 — filtered for 404), no polling (acknowledged), skills POST body **verified literal `{ skill_name }` at plan time**, deferred-create explicit copy (Task 4), keyboard a11y on Dropzone (Task 2), abort-on-first-error in multi-file upload (Task 6), multipart in form action (Task 6) |
| §12 Out of scope                 | Not implemented (correctly)                                                                                                                                                                                                                                                                                     |

No gaps. No placeholders. Type/property names verified consistent: `files: File[]`, `kbs: { linked; available }`, `attached: string[]` (skills slugs), `value: string` (context_md), `skill_name`, `kb_id`, `file_id`, `context_md` all match across actions and components.
