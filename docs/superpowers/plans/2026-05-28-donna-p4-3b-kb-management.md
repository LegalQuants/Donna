# Donna P4-3b — KB creation + KB management: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cohesive KB management surface to Donna — KB create from the matter Knowledge section (single-call create-and-link via `project_id`), dedicated `/knowledge/[id]` route with file upload + ingestion polling + auto-attach, rename, archive, and a hybrid_alpha slider, plus a top-level `/knowledge` index of all the user's KBs.

**Architecture:** Two new SvelteKit routes (`/knowledge` index + `/knowledge/[id]` detail) with 6 form actions on the detail route + 1 added action on the existing matter detail route. A new `src/lib/knowledge/` component library mirrors `src/lib/matters/` shape. The ingestion-polling surface is the only novel piece: a per-row Svelte 5 `$effect` polls the existing `/files/[id]` BFF passthrough every 2 s (visibility-paused, 5-min timeout) and auto-fires a hidden `?/attachFile` form on the `ready` transition. Failures surface `ingestion_error` inline; double-attach is guarded by a per-row `attaching` flag plus the backend's 409-idempotent semantics.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind v4 (`@theme` block in `src/app.css`), `@lucide/svelte` icons, vitest + `@testing-library/svelte` + `userEvent`/`fireEvent` for unit/component tests, Playwright for live e2e against the Docker stack on `localhost:13002`.

**Preconditions:**

- On branch `p4-3b-kb-management` (already created off `main`; spec commit `907dcfa`).
- Docker stack up: `set -a; . ./.env; set +a && docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker`.
- Vendor pin verified: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`.
- Quality bar: `npm run check` = 0 errors / 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless). `npx eslint <touched-files>` clean. **Rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`).
- Per-task workflow (memory `donna-workflow`): commit + push after each task; subagent two-stage review (spec-compliance then code-quality) for non-trivial bites; final whole-branch review.

**Spec:** `docs/superpowers/specs/2026-05-28-donna-p4-3b-kb-management-design.md`

---

## Task 1: `src/lib/knowledge/types.ts` — type aliases

**Why first:** Pure type-export file with no runtime; every component and action below imports from it. Trivial bite to start the branch warm.

**Files:**

- Create: `src/lib/knowledge/types.ts`

- [ ] **Step 1: Create the type aliases file**

Create `src/lib/knowledge/types.ts`:

```ts
import type { components } from '$lib/api/backend';

export type KnowledgeBase = components['schemas']['KnowledgeBase'];
export type KBFile = components['schemas']['KBFile'];

/**
 * Client-side shape for a file uploaded but not yet attached to the KB.
 * Lives in `KbFilesSection`'s `$state.pendingUploads` until the poll loop
 * sees `ingestion_status='ready'` and the auto-attach succeeds, at which
 * point the next `invalidateAll()` lands the file in the server-supplied
 * `KBFile[]` list and the pending row is filtered out.
 */
export type PendingUpload = {
	file_id: string;
	filename: string;
	size_bytes: number;
	status: 'pending' | 'processing' | 'ready' | 'failed';
	ingestion_error?: string | null;
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check 2>&1 | grep -E "error|warning" | head -20`
Expected: no new errors/warnings introduced by this file.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/knowledge/types.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): types.ts — KnowledgeBase, KBFile, PendingUpload aliases

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 2: `/knowledge/[id]/+page.server.ts` skeleton + `uploadFile` action

**Files:**

- Create: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Create: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Write failing tests for `uploadFile`**

Create `src/routes/(app)/knowledge/[id]/page.server.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions } from './+page.server';

const fileEvent = (files: { name: string; bytes: Uint8Array }[], id = 'k1') => {
	const fd = new FormData();
	for (const f of files)
		fd.append('file', new File([f.bytes], f.name, { type: 'application/pdf' }));
	return {
		params: { id },
		request: new Request('http://x', { method: 'POST', body: fd })
	} as never;
};

beforeEach(() => lqFetch.mockReset());

describe('/knowledge/[id] actions — uploadFile', () => {
	it('POSTs each blob to /api/v1/files as multipart and returns { uploaded: PendingUpload[] }', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: 'f1',
					filename: 'a.pdf',
					size_bytes: 11,
					ingestion_status: 'pending'
				}),
				{ status: 201 }
			)
		);
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: 'f2',
					filename: 'b.pdf',
					size_bytes: 22,
					ingestion_status: 'pending'
				}),
				{ status: 201 }
			)
		);
		const r = (await actions.uploadFile(
			fileEvent([
				{ name: 'a.pdf', bytes: new Uint8Array(11) },
				{ name: 'b.pdf', bytes: new Uint8Array(22) }
			])
		)) as { uploaded: { file_id: string; filename: string; size_bytes: number; status: string }[] };
		expect(lqFetch).toHaveBeenCalledTimes(2);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData);
		expect(r.uploaded).toEqual([
			{ file_id: 'f1', filename: 'a.pdf', size_bytes: 11, status: 'pending' },
			{ file_id: 'f2', filename: 'b.pdf', size_bytes: 22, status: 'pending' }
		]);
	});

	it('skips empty file slots (size 0) without calling the backend', async () => {
		const fd = new FormData();
		fd.append('file', new File([], 'empty.pdf'));
		const r = await actions.uploadFile({
			params: { id: 'k1' },
			request: new Request('http://x', { method: 'POST', body: fd })
		} as never);
		expect(lqFetch).not.toHaveBeenCalled();
		expect(r).toEqual({ uploaded: [] });
	});

	it('maps a 413 to a per-file size-limit fail with the backend-reported MB cap', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ details: { limit_bytes: 100 * 1024 * 1024 } }), { status: 413 })
		);
		const r = await actions.uploadFile(fileEvent([{ name: 'big.pdf', bytes: new Uint8Array(11) }]));
		expect(r).toMatchObject({
			status: 413,
			data: { error: 'File "big.pdf" is too large — max 100 MB.' }
		});
	});

	it('falls back to a default 100 MB cap when the 413 body is malformed', async () => {
		lqFetch.mockResolvedValueOnce(new Response('not-json', { status: 413 }));
		const r = await actions.uploadFile(fileEvent([{ name: 'big.pdf', bytes: new Uint8Array(11) }]));
		expect(r).toMatchObject({
			status: 413,
			data: { error: 'File "big.pdf" is too large — max 100 MB.' }
		});
	});

	it('maps any other backend failure to a generic 502 with the filename', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.uploadFile(fileEvent([{ name: 'a.pdf', bytes: new Uint8Array(11) }]));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not upload "a.pdf".' } });
	});

	it('bails on the first failure and does not attempt subsequent blobs', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.uploadFile(
			fileEvent([
				{ name: 'a.pdf', bytes: new Uint8Array(11) },
				{ name: 'b.pdf', bytes: new Uint8Array(22) }
			])
		);
		expect(lqFetch).toHaveBeenCalledTimes(1);
		expect(r).toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL with "cannot find module './+page.server'".

- [ ] **Step 3: Implement the action**

Create `src/routes/(app)/knowledge/[id]/+page.server.ts`:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { PendingUpload } from '$lib/knowledge/types';

export const actions: Actions = {
	uploadFile: async (event) => {
		const data = await event.request.formData();
		const blobs = data.getAll('file').filter((v): v is File => v instanceof File && v.size > 0);
		const uploaded: PendingUpload[] = [];
		for (const blob of blobs) {
			const fd = new FormData();
			fd.append('file', blob, blob.name);
			const upRes = await lqFetch(event, '/api/v1/files', { method: 'POST', body: fd });
			if (!upRes.ok) {
				if (upRes.status === 413) {
					let limitMb = 100;
					try {
						const body = (await upRes.json()) as { details?: { limit_bytes?: number } };
						if (body.details?.limit_bytes)
							limitMb = Math.round(body.details.limit_bytes / 1024 / 1024);
					} catch {
						/* keep default 100 MB */
					}
					return fail(413, { error: `File "${blob.name}" is too large — max ${limitMb} MB.` });
				}
				return fail(502, { error: `Could not upload "${blob.name}".` });
			}
			const f = (await upRes.json()) as { id: string };
			uploaded.push({
				file_id: f.id,
				filename: blob.name,
				size_bytes: blob.size,
				status: 'pending'
			});
		}
		return { uploaded };
	}
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/+page.server.ts src/routes/\(app\)/knowledge/\[id\]/page.server.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] uploadFile action + tests

Multipart upload via POST /api/v1/files per blob. 413 → per-file
size-limit fail with backend-reported MB cap (default 100 MB on
malformed body); other failures → generic 502. Bail-on-first
matches P4-3a's matter-files behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 3: `attachFile` action

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for `attachFile`**

Append to `src/routes/(app)/knowledge/[id]/page.server.test.ts` (inside a new describe block):

```ts
const urlEv = (fields: Record<string, string>, id = 'k1') =>
	({
		params: { id },
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) })
	}) as never;

describe('/knowledge/[id] actions — attachFile', () => {
	it('POSTs { file_id } to /knowledge-bases/{kb_id}/files and returns success on 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1/files');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ file_id: 'f1' });
		expect(r).toMatchObject({ success: true });
	});

	it('treats 409 (already attached) as success — race protection', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
		const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({ success: true });
	});

	it('returns fail(422, { retry: true }) when the file is not ready (race)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 422 }));
		const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({ status: 422, data: { retry: true } });
	});

	it('returns fail(404) when the KB or file is missing', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({
			status: 404,
			data: { error: 'Knowledge base or file no longer exists.' }
		});
	});

	it('returns fail(502) for other backend failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.attachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not attach the file.' } });
	});

	it('returns fail(400) when file_id is missing without calling the backend', async () => {
		const r = await actions.attachFile(urlEv({}));
		expect(r).toMatchObject({ status: 400, data: { error: 'Missing file_id.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests — expect failure on the new describe block**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL with "actions.attachFile is not a function".

- [ ] **Step 3: Add `attachFile` to the actions export**

In `src/routes/(app)/knowledge/[id]/+page.server.ts`, add to the `Actions` object (after `uploadFile`):

```ts
  attachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}/files`, {
      method: 'POST',
      body: JSON.stringify({ file_id })
    });
    // 204 success; 409 = already attached → treat as success (race protection).
    if (res.ok || res.status === 409) return { success: true };
    if (res.status === 422) return fail(422, { retry: true });
    if (res.status === 404) return fail(404, { error: 'Knowledge base or file no longer exists.' });
    return fail(502, { error: 'Could not attach the file.' });
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (all 12 tests across both describe blocks).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] attachFile action + tests

Auto-attach companion to the client poll loop. 204 → success;
409 (already attached) → success (race protection mirrors the
matter-files uploadFile path); 422 → fail with retry:true so the
client resumes polling; 404 → KB/file gone; other → 502.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 4: `detachFile` action

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for `detachFile`**

Append to the test file (new describe block):

```ts
describe('/knowledge/[id] actions — detachFile', () => {
	it('DELETEs /knowledge-bases/{kb_id}/files/{file_id} and returns success on 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1/files/f1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
		expect(r).toMatchObject({ success: true });
	});

	it('treats 404 (not attached) as success — idempotent', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({ success: true });
	});

	it('returns fail(502) for other backend failures', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.detachFile(urlEv({ file_id: 'f1' }));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not remove the file.' } });
	});

	it('returns fail(400) when file_id is missing without calling the backend', async () => {
		const r = await actions.detachFile(urlEv({}));
		expect(r).toMatchObject({ status: 400, data: { error: 'Missing file_id.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL (detachFile undefined).

- [ ] **Step 3: Implement `detachFile`**

Append to the `Actions` object in `+page.server.ts`:

```ts
  detachFile: async (event) => {
    const data = await event.request.formData();
    const file_id = String(data.get('file_id') ?? '');
    if (!file_id) return fail(400, { error: 'Missing file_id.' });
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}/files/${file_id}`, { method: 'DELETE' });
    // 204 or 404 → idempotent success.
    if (res.ok || res.status === 404) return { success: true };
    return fail(502, { error: 'Could not remove the file.' });
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] detachFile action + tests

DELETE /knowledge-bases/{kb_id}/files/{file_id}. 204/404 →
idempotent success; other → 502.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 5: `rename` action

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for `rename`**

Append to the test file:

```ts
describe('/knowledge/[id] actions — rename', () => {
	it('PATCHes name + description', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const r = await actions.rename(urlEv({ name: 'New name', description: 'desc' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			name: 'New name',
			description: 'desc'
		});
		expect(r).toMatchObject({ success: true });
	});

	it('sends description as null when empty', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		await actions.rename(urlEv({ name: 'N', description: '' }));
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'N', description: null });
	});

	it('rejects empty name without calling the backend', async () => {
		const r = await actions.rename(urlEv({ name: '  ' }));
		expect(r).toMatchObject({ status: 400, data: { error: 'Name is required.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps 404 to KB-gone fail', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.rename(urlEv({ name: 'N' }));
		expect(r).toMatchObject({ status: 404, data: { error: 'Knowledge base no longer exists.' } });
	});

	it('maps other backend failures to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.rename(urlEv({ name: 'N' }));
		expect(r).toMatchObject({
			status: 502,
			data: { error: 'Could not rename the knowledge base.' }
		});
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `rename`**

Append to the `Actions` object:

```ts
  rename: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    const descriptionRaw = String(data.get('description') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const body = { name, description: descriptionRaw === '' ? null : descriptionRaw };
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
    return fail(502, { error: 'Could not rename the knowledge base.' });
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] rename action + tests

PATCH /knowledge-bases/{kb_id} with name + nullable description.
Pre-validates empty name; 404 → KB gone; other → 502.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 6: `archive` action

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for `archive`**

Append to the test file:

```ts
describe('/knowledge/[id] actions — archive', () => {
	it('DELETEs the KB and redirects to /knowledge on 204', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await expect(actions.archive(urlEv({}))).rejects.toMatchObject({
			status: 303,
			location: '/knowledge'
		});
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
		expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
	});

	it('returns fail(502) when the backend fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.archive(urlEv({}));
		expect(r).toMatchObject({
			status: 502,
			data: { error: 'Could not archive the knowledge base.' }
		});
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `archive`**

At the top of `+page.server.ts`, extend the imports:

```ts
import { fail, redirect, type Actions } from '@sveltejs/kit';
```

Append to the `Actions` object:

```ts
  archive: async (event) => {
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, { method: 'DELETE' });
    if (!res.ok) return fail(502, { error: 'Could not archive the knowledge base.' });
    throw redirect(303, '/knowledge');
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] archive action + tests

DELETE the KB and redirect to /knowledge on success; 502 otherwise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 7: `setHybridAlpha` action

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for `setHybridAlpha`**

Append to the test file:

```ts
describe('/knowledge/[id] actions — setHybridAlpha', () => {
	it('PATCHes hybrid_alpha as a number', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const r = await actions.setHybridAlpha(urlEv({ hybrid_alpha: '0.7' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ hybrid_alpha: 0.7 });
		expect(r).toMatchObject({ success: true });
	});

	it('rejects out-of-range values without calling the backend', async () => {
		for (const v of ['-0.1', '1.1', 'NaN', '']) {
			lqFetch.mockReset();
			const r = await actions.setHybridAlpha(urlEv({ hybrid_alpha: v }));
			expect(r).toMatchObject({
				status: 422,
				data: { error: 'hybrid_alpha must be a number between 0 and 1.' }
			});
			expect(lqFetch).not.toHaveBeenCalled();
		}
	});

	it('maps 404 to KB-gone fail', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.setHybridAlpha(urlEv({ hybrid_alpha: '0.5' }));
		expect(r).toMatchObject({ status: 404, data: { error: 'Knowledge base no longer exists.' } });
	});

	it('maps other backend failures to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.setHybridAlpha(urlEv({ hybrid_alpha: '0.5' }));
		expect(r).toMatchObject({ status: 502, data: { error: 'Could not save the hybrid alpha.' } });
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `setHybridAlpha`**

Append to the `Actions` object:

```ts
  setHybridAlpha: async (event) => {
    const data = await event.request.formData();
    const raw = String(data.get('hybrid_alpha') ?? '');
    const value = Number(raw);
    // Defensive: slider client-constrains to [0,1] per ADR 0008; reject anything else.
    if (raw === '' || !Number.isFinite(value) || value < 0 || value > 1) {
      return fail(422, { error: 'hybrid_alpha must be a number between 0 and 1.' });
    }
    const res = await lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hybrid_alpha: value })
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Knowledge base no longer exists.' });
    return fail(502, { error: 'Could not save the hybrid alpha.' });
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (27 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] setHybridAlpha action + tests

PATCH hybrid_alpha as a clamped [0,1] number. Pre-validates range
defensively (per ADR 0008). 404 → KB gone; other → 502.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 8: `/knowledge/[id]/+page.server.ts` load function

**Files:**

- Modify: `src/routes/(app)/knowledge/[id]/+page.server.ts`
- Modify: `src/routes/(app)/knowledge/[id]/page.server.test.ts`

- [ ] **Step 1: Add failing tests for the `load` function**

Append to the test file (new describe block at the top, just below the existing describes):

```ts
import { load } from './+page.server';
const loadEv = (id = 'k1') => ({ params: { id } }) as never;

describe('/knowledge/[id] load', () => {
	it('parallel-fetches KB + files and returns { kb, files }', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'k1',
						name: 'KB',
						owner_id: 'u',
						hybrid_alpha: 0.5,
						file_count: 2,
						chunk_count: 9,
						created_at: '',
						updated_at: ''
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify([
						{
							id: 'f1',
							owner_id: 'u',
							filename: 'a.pdf',
							mime_type: 'application/pdf',
							size_bytes: 1,
							hash_sha256: 'h',
							ingestion_status: 'ready',
							created_at: '',
							attached_at: ''
						}
					]),
					{ status: 200 }
				)
			);
		const out = (await load(loadEv())) as { kb: { name: string }; files: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases/k1');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/knowledge-bases/k1/files');
		expect(out.kb.name).toBe('KB');
		expect(out.files.map((f) => f.id)).toEqual(['f1']);
	});

	it('throws 404 when the KB is missing', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response('not found', { status: 404 }))
			.mockResolvedValueOnce(new Response('[]', { status: 200 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 404 });
	});

	it('returns empty files when the file list endpoint fails non-fatally', async () => {
		lqFetch
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'k1',
						name: 'KB',
						owner_id: 'u',
						hybrid_alpha: 0.5,
						file_count: 0,
						chunk_count: 0,
						created_at: '',
						updated_at: ''
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response('boom', { status: 502 }));
		const out = (await load(loadEv())) as { files: unknown[] };
		expect(out.files).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: FAIL (load not exported).

- [ ] **Step 3: Add the `load` function**

In `src/routes/(app)/knowledge/[id]/+page.server.ts`, replace the top-of-file imports with this consolidated set (preserves `fail`/`redirect`/`Actions`/`lqFetch`/`PendingUpload` added in earlier tasks; adds `error`, `PageServerLoad`, `KnowledgeBase`, `KBFile` for the load function):

```ts
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { KnowledgeBase, KBFile, PendingUpload } from '$lib/knowledge/types';
import type { PageServerLoad } from './$types';
```

Add the `load` function above the `actions` export:

```ts
export const load: PageServerLoad = async (event) => {
	const [kbRes, filesRes] = await Promise.all([
		lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}`),
		lqFetch(event, `/api/v1/knowledge-bases/${event.params.id}/files`)
	]);
	if (!kbRes.ok)
		throw error(kbRes.status === 404 ? 404 : 502, 'Could not load this knowledge base.');
	const kb = (await kbRes.json()) as KnowledgeBase;
	const files = filesRes.ok ? ((await filesRes.json()) as KBFile[]) : [];
	return { kb, files };
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/\\[id\\]/page.server.test.ts`
Expected: PASS (30 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id] load function + tests

Parallel GET /knowledge-bases/{id} + /knowledge-bases/{id}/files.
KB 404 → throw error(404); files non-OK degrades to [] (mirrors
matter-files load tolerance).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 9: `KbFileRow.svelte` — polling component (the hard one)

**Why this size:** This is the only component with real-time behavior (poll + visibility-pause + auto-attach + timeout + double-attach guard). It gets its own commit and its own thorough test surface so subsequent visual changes can't quietly break the polling invariants.

**Files:**

- Create: `src/lib/knowledge/KbFileRow.svelte`
- Create: `src/lib/knowledge/KbFileRow.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/KbFileRow.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import KbFileRow from './KbFileRow.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const attached = (over = {}) => ({
	id: 'f1',
	owner_id: 'u',
	filename: 'msa.pdf',
	mime_type: 'application/pdf',
	size_bytes: 1536,
	hash_sha256: 'h',
	ingestion_status: 'ready' as const,
	created_at: '2026-05-28T00:00:00Z',
	attached_at: '2026-05-28T00:00:00Z',
	...over
});

const pending = (over = {}) => ({
	file_id: 'f1',
	filename: 'msa.pdf',
	size_bytes: 1536,
	status: 'pending' as const,
	...over
});

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('KbFileRow — attached row (KBFile)', () => {
	it('renders filename, size, and a Ready badge for attached files', () => {
		render(KbFileRow, { props: { row: attached() } });
		expect(screen.getByText('msa.pdf')).toBeInTheDocument();
		expect(screen.getByText('1.5 KB')).toBeInTheDocument();
		expect(screen.getByText('Ready')).toBeInTheDocument();
	});

	it('renders a Remove form posting to ?/detachFile with the file_id', () => {
		render(KbFileRow, { props: { row: attached() } });
		const form = screen.getByRole('form', { name: /remove file/i });
		expect(form).toHaveAttribute('action', '?/detachFile');
		const hidden = form.querySelector('input[name="file_id"]') as HTMLInputElement;
		expect(hidden.value).toBe('f1');
	});

	it('exposes a Download link to the BFF /files/[id]/content route', () => {
		render(KbFileRow, { props: { row: attached() } });
		const link = screen.getByRole('link', { name: /download/i }) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/files/f1/content');
	});

	it('does NOT poll for attached ready rows', async () => {
		render(KbFileRow, { props: { row: attached() } });
		await vi.advanceTimersByTimeAsync(5000);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('KbFileRow — pending row (PendingUpload) polling', () => {
	it('polls /files/{id} every 2 s while status is pending/processing', async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 })
		);
		render(KbFileRow, { props: { row: pending() } });
		await vi.advanceTimersByTimeAsync(2000);
		expect(fetch).toHaveBeenCalledWith('/files/f1');
		await vi.advanceTimersByTimeAsync(2000);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('renders status transitions: Pending → Processing → Ready', async () => {
		(fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'f1', ingestion_status: 'ready' }), { status: 200 })
			);
		render(KbFileRow, { props: { row: pending() } });
		expect(screen.getByText('Pending')).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(2000);
		await waitFor(() => expect(screen.getByText('Processing')).toBeInTheDocument());
		await vi.advanceTimersByTimeAsync(2000);
		await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
	});

	it('fires exactly ONE ?/attachFile form submit on the ready transition (double-attach guard)', async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(JSON.stringify({ id: 'f1', ingestion_status: 'ready' }), { status: 200 })
		);
		const { container } = render(KbFileRow, { props: { row: pending() } });
		const submitSpy = vi.fn((e: Event) => e.preventDefault());
		container.addEventListener('submit', submitSpy, true);

		await vi.advanceTimersByTimeAsync(2000); // first poll → ready → submit
		await vi.advanceTimersByTimeAsync(2000); // would re-fire without the guard
		await vi.advanceTimersByTimeAsync(2000);
		expect(submitSpy).toHaveBeenCalledTimes(1);
		const form = submitSpy.mock.calls[0][0].target as HTMLFormElement;
		expect(form.action).toContain('?/attachFile');
		expect((form.querySelector('input[name="file_id"]') as HTMLInputElement).value).toBe('f1');
	});

	it('renders ingestion_error and stops polling on failed status', async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'f1',
					ingestion_status: 'failed',
					ingestion_error: 'unsupported_type'
				}),
				{ status: 200 }
			)
		);
		render(KbFileRow, { props: { row: pending() } });
		await vi.advanceTimersByTimeAsync(2000);
		await waitFor(() => expect(screen.getByText(/failed: unsupported_type/i)).toBeInTheDocument());
		(fetch as ReturnType<typeof vi.fn>).mockClear();
		await vi.advanceTimersByTimeAsync(4000);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('stops polling and shows Refresh after the 5-minute stuck threshold', async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(JSON.stringify({ id: 'f1', ingestion_status: 'processing' }), { status: 200 })
		);
		render(KbFileRow, { props: { row: pending() } });
		// 5 min @ 2s = 150 ticks
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		expect(await screen.findByRole('button', { name: /refresh/i })).toBeInTheDocument();
		(fetch as ReturnType<typeof vi.fn>).mockClear();
		await vi.advanceTimersByTimeAsync(4000);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('drops the row silently on poll 404 (file deleted elsewhere)', async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('gone', { status: 404 }));
		const { container } = render(KbFileRow, { props: { row: pending() } });
		await vi.advanceTimersByTimeAsync(2000);
		await waitFor(() => expect(container.textContent).not.toContain('msa.pdf'));
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/KbFileRow.svelte.test.ts`
Expected: FAIL (component does not exist).

- [ ] **Step 3: Implement `KbFileRow.svelte`**

Create `src/lib/knowledge/KbFileRow.svelte`:

```svelte
<script lang="ts">
	import { X } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { formatBytes, statusBadge, type IngestionStatus } from '$lib/matters/files/uploadFile';
	import type { KBFile, PendingUpload } from './types';

	type Row = KBFile | PendingUpload;
	let { row }: { row: Row } = $props();

	const isAttached = (r: Row): r is KBFile => 'id' in r;
	const fileId = $derived(isAttached(row) ? row.id : row.file_id);

	// Local status snapshot — for attached rows this is just the prop; for
	// pending rows it's updated by the poll loop.
	let status = $state<IngestionStatus>(isAttached(row) ? row.ingestion_status : row.status);
	let ingestionError = $state<string | null>(
		isAttached(row) ? (row.ingestion_error ?? null) : (row.ingestion_error ?? null)
	);
	let stuck = $state(false);
	let dropped = $state(false);
	let attaching = $state(false);
	let attachForm = $state<HTMLFormElement>();
	let attachInput = $state<HTMLInputElement>();

	const POLL_INTERVAL_MS = 2000;
	const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

	const badge = $derived(statusBadge(status));
	const toneClass = $derived(
		badge.tone === 'success'
			? 'text-mlq-success'
			: badge.tone === 'error'
				? 'text-mlq-error'
				: 'text-mlq-muted'
	);
	const shouldPoll = $derived(
		!isAttached(row) && !dropped && !stuck && (status === 'pending' || status === 'processing')
	);

	// Trigger the auto-attach submit. Uses queueMicrotask so the
	// file_id $state binding is reflected in the DOM before requestSubmit
	// reads it (same pattern as KnowledgeSection/SkillsSection in P4-3a).
	function fireAttach() {
		if (attaching) return;
		attaching = true;
		queueMicrotask(() => attachForm?.requestSubmit());
	}

	$effect(() => {
		if (!shouldPoll) return;
		const startedAt = performance.now();

		const tick = async () => {
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
			try {
				const res = await fetch(`/files/${fileId}`);
				if (res.status === 404) {
					dropped = true;
					return;
				}
				if (!res.ok) return; // transient hiccup; keep polling
				const body = (await res.json()) as {
					ingestion_status: IngestionStatus;
					ingestion_error?: string | null;
				};
				status = body.ingestion_status;
				ingestionError = body.ingestion_error ?? null;
				if (status === 'ready') fireAttach();
			} catch {
				/* network hiccup; keep polling until STUCK_TIMEOUT_MS */
			} finally {
				if (
					performance.now() - startedAt > STUCK_TIMEOUT_MS &&
					status !== 'ready' &&
					status !== 'failed'
				) {
					stuck = true;
				}
			}
		};

		const id = setInterval(tick, POLL_INTERVAL_MS);
		return () => clearInterval(id);
	});

	function refreshNow() {
		stuck = false;
		// Re-arming shouldPoll re-runs the $effect.
	}
</script>

{#if !dropped}
	<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm text-mlq-text">{row.filename}</div>
			<div class="mt-0.5 flex items-center gap-2 text-xs">
				<span class="text-mlq-muted">{formatBytes(row.size_bytes)}</span>
				{#if status === 'failed' && ingestionError}
					<span class={toneClass}>Failed: {ingestionError}</span>
				{:else}
					<span class={toneClass}>{badge.label}</span>
				{/if}
				{#if stuck}
					<button
						type="button"
						onclick={refreshNow}
						class="rounded-mlq-control border border-mlq-subtle px-1.5 py-0.5 text-[10px] text-mlq-text"
						>Refresh</button
					>
					<span class="text-mlq-muted">Still processing — refresh to check</span>
				{/if}
			</div>
		</div>

		{#if isAttached(row) && status === 'ready'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- BFF download proxy -->
			<a
				href="/files/{fileId}/content"
				target="_blank"
				rel="noopener"
				class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a
			>
		{/if}

		<form method="POST" action="?/detachFile" use:enhance aria-label="Remove file" class="shrink-0">
			<input type="hidden" name="file_id" value={fileId} />
			<button
				type="submit"
				aria-label={`Remove ${row.filename}`}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"><X size={14} /></button
			>
		</form>

		<!-- Auto-attach form. Fires once when polling sees status='ready'. -->
		<form bind:this={attachForm} method="POST" action="?/attachFile" use:enhance class="hidden">
			<input bind:this={attachInput} type="hidden" name="file_id" value={fileId} />
		</form>
	</div>
{/if}
```

Also export `IngestionStatus` from the existing `uploadFile.ts` if it isn't already (it is — verified during exploration). No change needed there.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/KbFileRow.svelte.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Verify type-check + lint**

```bash
npm run check 2>&1 | grep -E "error|warning" | head -20
npx eslint src/lib/knowledge/KbFileRow.svelte
```

Expected: 0 errors / 0 warnings introduced by these files.

- [ ] **Step 6: Commit + push**

```bash
git add src/lib/knowledge/KbFileRow.svelte src/lib/knowledge/KbFileRow.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): KbFileRow with polling + auto-attach + stuck timeout

Per-row $effect polls /files/[id] every 2s while pending/processing
(visibility-paused via document.visibilityState). Fires exactly one
?/attachFile submit on the ready transition (attaching boolean +
queueMicrotask + 409-idempotent backend = no double-attach).
Renders ingestion_error on failed; surfaces a Refresh button after
5 min stuck; drops silently on poll 404.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 10: `KbFilesSection.svelte`

**Files:**

- Create: `src/lib/knowledge/KbFilesSection.svelte`
- Create: `src/lib/knowledge/KbFilesSection.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/KbFilesSection.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbFilesSection from './KbFilesSection.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('KbFilesSection', () => {
	it('renders the Dropzone when there are zero attached files and zero pending uploads', () => {
		render(KbFilesSection, { props: { files: [] } });
		expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
	});

	it('renders the upload form with multipart enctype + name="file" hidden input', () => {
		const { container } = render(KbFilesSection, { props: { files: [] } });
		const form = container.querySelector('form[action="?/uploadFile"]') as HTMLFormElement;
		expect(form.getAttribute('enctype')).toBe('multipart/form-data');
		const input = form.querySelector('input[type="file"][name="file"]') as HTMLInputElement;
		expect(input).not.toBeNull();
		expect(input.multiple).toBe(true);
	});

	it('regression: the nested Dropzone <input> has NO name attribute (P4-3a bug-fix invariant)', () => {
		const { container } = render(KbFilesSection, { props: { files: [] } });
		const dz = container.querySelector('[data-testid="dropzone-input"]') as HTMLInputElement;
		expect(dz).not.toBeNull();
		expect(dz.hasAttribute('name')).toBe(false);
	});

	it('renders attached file rows and an "Add file" button when files are present', () => {
		render(KbFilesSection, {
			props: {
				files: [
					{
						id: 'f1',
						owner_id: 'u',
						filename: 'msa.pdf',
						mime_type: 'application/pdf',
						size_bytes: 1024,
						hash_sha256: 'h',
						ingestion_status: 'ready' as const,
						created_at: '',
						attached_at: ''
					}
				]
			}
		});
		expect(screen.getByText('msa.pdf')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /add file/i })).toBeInTheDocument();
	});

	it('renders an inline error when the error prop is set', () => {
		render(KbFilesSection, { props: { files: [], error: 'Too large' } });
		expect(screen.getByText('Too large')).toBeInTheDocument();
	});

	it('renders pending upload rows from the `pendingUploads` prop alongside attached rows', () => {
		render(KbFilesSection, {
			props: {
				files: [
					{
						id: 'f1',
						owner_id: 'u',
						filename: 'msa.pdf',
						mime_type: 'application/pdf',
						size_bytes: 1024,
						hash_sha256: 'h',
						ingestion_status: 'ready' as const,
						created_at: '',
						attached_at: ''
					}
				],
				pendingUploads: [
					{ file_id: 'p1', filename: 'pending.pdf', size_bytes: 2048, status: 'pending' as const }
				]
			}
		});
		expect(screen.getByText('msa.pdf')).toBeInTheDocument();
		expect(screen.getByText('pending.pdf')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/KbFilesSection.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `KbFilesSection.svelte`**

Create `src/lib/knowledge/KbFilesSection.svelte`:

```svelte
<script lang="ts">
	import Dropzone from '$lib/matters/files/Dropzone.svelte';
	import KbFileRow from './KbFileRow.svelte';
	import type { KBFile, PendingUpload } from './types';

	let {
		files,
		pendingUploads = [],
		error = ''
	}: { files: KBFile[]; pendingUploads?: PendingUpload[]; error?: string } = $props();

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

		{#if files.length === 0 && pendingUploads.length === 0}
			<Dropzone onfiles={(fs) => submitWith(fs)} />
		{:else}
			<div class="rounded-mlq-control border border-mlq-subtle">
				{#each pendingUploads as p (p.file_id)}
					<KbFileRow row={p} />
				{/each}
				{#each files as f (f.id)}
					<KbFileRow row={f} />
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

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/KbFilesSection.svelte.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/knowledge/KbFilesSection.svelte src/lib/knowledge/KbFilesSection.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): KbFilesSection — Dropzone empty state + unified row list

Same pattern as FilesSection in P4-3a, but renders pending uploads
(client $state, not yet attached) alongside attached KBFile rows.
Regression test pins the Dropzone-no-name invariant from
ebb7752 (P4-3a) — a second consumer must not re-introduce it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 11: `KbRenameModal.svelte`

**Files:**

- Create: `src/lib/knowledge/KbRenameModal.svelte`
- Create: `src/lib/knowledge/KbRenameModal.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/KbRenameModal.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbRenameModal from './KbRenameModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'KB',
	description: null,
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '',
	updated_at: '',
	...over
});

describe('KbRenameModal', () => {
	it('does not render when open is false', () => {
		render(KbRenameModal, { props: { open: false, kb: kb(), onclose: () => {} } });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders a dialog with the KB name prefilled', () => {
		render(KbRenameModal, { props: { open: true, kb: kb({ name: 'Acme' }), onclose: () => {} } });
		const dialog = screen.getByRole('dialog');
		expect(dialog).toBeInTheDocument();
		const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
		expect(nameInput.value).toBe('Acme');
	});

	it('calls onclose on backdrop click', async () => {
		const onclose = vi.fn();
		const { container } = render(KbRenameModal, { props: { open: true, kb: kb(), onclose } });
		const backdrop = container.querySelector('[role="presentation"]') as HTMLElement;
		await fireEvent.click(backdrop);
		expect(onclose).toHaveBeenCalled();
	});

	it('calls onclose on Escape', async () => {
		const onclose = vi.fn();
		render(KbRenameModal, { props: { open: true, kb: kb(), onclose } });
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(onclose).toHaveBeenCalled();
	});

	it('renders a form posting to ?/rename with name + description', () => {
		render(KbRenameModal, {
			props: { open: true, kb: kb({ name: 'Acme', description: 'd' }), onclose: () => {} }
		});
		const form = screen.getByRole('form', { name: /rename knowledge base/i });
		expect(form).toHaveAttribute('action', '?/rename');
		expect((form.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('Acme');
		expect((form.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value).toBe(
			'd'
		);
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/KbRenameModal.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `KbRenameModal.svelte`**

Create `src/lib/knowledge/KbRenameModal.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { X } from '@lucide/svelte';
	import type { KnowledgeBase } from './types';

	let { open, kb, onclose }: { open: boolean; kb: KnowledgeBase; onclose: () => void } = $props();

	let name = $state(kb.name);
	let description = $state(kb.description ?? '');

	$effect(() => {
		if (open) {
			name = kb.name;
			description = kb.description ?? '';
		}
	});

	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div role="presentation" class="fixed inset-0 z-30 bg-black/40" onclick={onclose}></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Rename knowledge base"
		class="fixed top-1/2 left-1/2 z-40 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-mlq-control border border-mlq-subtle bg-mlq-surface p-4 shadow-xl"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-mlq-text">Rename knowledge base</h2>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-text"><X size={14} /></button
			>
		</div>

		<form
			method="POST"
			action="?/rename"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') onclose();
				}}
			aria-label="Rename knowledge base"
			class="space-y-3"
		>
			<label class="block text-xs text-mlq-muted">
				Name
				<input
					name="name"
					type="text"
					required
					bind:value={name}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				/>
			</label>
			<label class="block text-xs text-mlq-muted">
				Description
				<textarea
					name="description"
					rows="3"
					bind:value={description}
					class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
				></textarea>
			</label>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={onclose}
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
					>Cancel</button
				>
				<button
					type="submit"
					class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface">Save</button
				>
			</div>
		</form>
	</div>
{/if}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/KbRenameModal.svelte.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/knowledge/KbRenameModal.svelte src/lib/knowledge/KbRenameModal.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): KbRenameModal — name + description, Escape/backdrop close

Mirrors the ReceiptsDrawer modal idiom (role=dialog + role=presentation
backdrop + capture-phase Escape). Submits ?/rename via use:enhance;
closes on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 12: `KbHeader.svelte`

**Files:**

- Create: `src/lib/knowledge/KbHeader.svelte`
- Create: `src/lib/knowledge/KbHeader.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/KbHeader.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbHeader from './KbHeader.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'Acme',
	description: 'd',
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 6,
	chunk_count: 412,
	created_at: '',
	updated_at: '',
	...over
});

describe('KbHeader', () => {
	it('renders the KB name and counts', () => {
		render(KbHeader, { props: { kb: kb() } });
		expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
		expect(screen.getByText(/6 files/i)).toBeInTheDocument();
		expect(screen.getByText(/412 chunks/i)).toBeInTheDocument();
	});

	it('opens the rename modal on Rename click', async () => {
		render(KbHeader, { props: { kb: kb() } });
		await fireEvent.click(screen.getByRole('button', { name: /rename/i }));
		expect(screen.getByRole('dialog', { name: /rename knowledge base/i })).toBeInTheDocument();
	});

	it('renders an Archive form posting to ?/archive', () => {
		render(KbHeader, { props: { kb: kb() } });
		const form = screen.getByRole('form', { name: /archive/i });
		expect(form).toHaveAttribute('action', '?/archive');
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/KbHeader.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `KbHeader.svelte`**

Create `src/lib/knowledge/KbHeader.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import KbRenameModal from './KbRenameModal.svelte';
	import type { KnowledgeBase } from './types';

	let { kb }: { kb: KnowledgeBase } = $props();
	let renameOpen = $state(false);
</script>

<header class="border-b border-mlq-subtle pb-4">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-xl font-medium text-mlq-text">{kb.name}</h1>
			<p class="mt-0.5 text-xs text-mlq-muted">
				{kb.file_count} files · {kb.chunk_count} chunks
			</p>
			{#if kb.description}
				<p class="mt-2 text-sm text-mlq-muted">{kb.description}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				onclick={() => (renameOpen = true)}
				class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text"
				>Rename</button
			>
			<form method="POST" action="?/archive" use:enhance aria-label="Archive knowledge base">
				<button
					type="submit"
					class="rounded-mlq-control border border-mlq-subtle px-2.5 py-1 text-xs text-mlq-text hover:text-mlq-error"
					>Archive</button
				>
			</form>
		</div>
	</div>
</header>

<KbRenameModal open={renameOpen} {kb} onclose={() => (renameOpen = false)} />
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/KbHeader.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/knowledge/KbHeader.svelte src/lib/knowledge/KbHeader.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): KbHeader — name + counts + Rename + Archive

Owns the modal-open state for KbRenameModal; Archive is a simple
enhance form to ?/archive (the action redirects to /knowledge).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 13: `HybridAlphaControl.svelte`

**Files:**

- Create: `src/lib/knowledge/HybridAlphaControl.svelte`
- Create: `src/lib/knowledge/HybridAlphaControl.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/HybridAlphaControl.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HybridAlphaControl from './HybridAlphaControl.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'KB',
	description: null,
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '',
	updated_at: '',
	...over
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HybridAlphaControl', () => {
	it('renders a range slider initialized to kb.hybrid_alpha', () => {
		render(HybridAlphaControl, { props: { kb: kb({ hybrid_alpha: 0.7 }) } });
		const slider = screen.getByRole('slider') as HTMLInputElement;
		expect(slider.value).toBe('0.7');
		expect(slider.min).toBe('0');
		expect(slider.max).toBe('1');
	});

	it('renders Vector and FTS endpoint labels', () => {
		render(HybridAlphaControl, { props: { kb: kb() } });
		expect(screen.getByText(/vector/i)).toBeInTheDocument();
		expect(screen.getByText(/fts/i)).toBeInTheDocument();
	});

	it('fires exactly one form submit after 400 ms of slider settle (debounce)', async () => {
		const { container } = render(HybridAlphaControl, { props: { kb: kb() } });
		const submitSpy = vi.fn((e: Event) => e.preventDefault());
		container.addEventListener('submit', submitSpy, true);
		const slider = screen.getByRole('slider') as HTMLInputElement;

		await fireEvent.input(slider, { target: { value: '0.6' } });
		await fireEvent.input(slider, { target: { value: '0.7' } });
		await fireEvent.input(slider, { target: { value: '0.8' } });
		expect(submitSpy).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(400);
		expect(submitSpy).toHaveBeenCalledTimes(1);
		const form = submitSpy.mock.calls[0][0].target as HTMLFormElement;
		expect(form.action).toContain('?/setHybridAlpha');
		expect((form.querySelector('input[name="hybrid_alpha"]') as HTMLInputElement).value).toBe(
			'0.8'
		);
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/HybridAlphaControl.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `HybridAlphaControl.svelte`**

Create `src/lib/knowledge/HybridAlphaControl.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { KnowledgeBase } from './types';

	let { kb }: { kb: KnowledgeBase } = $props();
	let value = $state(kb.hybrid_alpha);
	let form = $state<HTMLFormElement>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const DEBOUNCE_MS = 400;

	function onInput(e: Event) {
		value = Number((e.currentTarget as HTMLInputElement).value);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			// queueMicrotask gives Svelte time to flush the value into the hidden input.
			queueMicrotask(() => form?.requestSubmit());
		}, DEBOUNCE_MS);
	}
</script>

<section class="mt-6">
	<h2 class="mb-2 text-xs font-medium tracking-wide text-mlq-muted uppercase">Advanced</h2>
	<div class="rounded-mlq-control border border-mlq-subtle px-3 py-3">
		<div class="mb-1 flex items-center justify-between text-xs text-mlq-muted">
			<span>Hybrid alpha</span>
			<span class="text-mlq-text">{value.toFixed(2)}</span>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-[10px] text-mlq-muted">Vector</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				{value}
				oninput={onInput}
				class="flex-1"
				aria-label="Hybrid alpha"
			/>
			<span class="text-[10px] text-mlq-muted">FTS</span>
		</div>
		<form bind:this={form} method="POST" action="?/setHybridAlpha" use:enhance class="hidden">
			<input type="hidden" name="hybrid_alpha" {value} />
		</form>
	</div>
</section>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/HybridAlphaControl.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/knowledge/HybridAlphaControl.svelte src/lib/knowledge/HybridAlphaControl.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): HybridAlphaControl — debounced slider

400ms debounce on slider input; queueMicrotask flush before
requestSubmit (P4-3a pattern). Vector/FTS endpoint labels per
ADR 0008.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 14: `/knowledge/[id]/+page.svelte` — assemble the detail page

**Files:**

- Create: `src/routes/(app)/knowledge/[id]/+page.svelte`

- [ ] **Step 1: Write the page**

Create `src/routes/(app)/knowledge/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import KbHeader from '$lib/knowledge/KbHeader.svelte';
	import KbFilesSection from '$lib/knowledge/KbFilesSection.svelte';
	import HybridAlphaControl from '$lib/knowledge/HybridAlphaControl.svelte';
	import type { PendingUpload } from '$lib/knowledge/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Client-side pending uploads — populated by the ?/uploadFile action's
	// `uploaded` return value. KbFileRow's polling drives each row to
	// ready/failed; once attach succeeds, the next invalidateAll() lands
	// the file in `data.files` and we filter the matching pending out.
	let pendingUploads = $state<PendingUpload[]>([]);

	$effect(() => {
		if (form && 'uploaded' in form && Array.isArray(form.uploaded)) {
			pendingUploads = [...pendingUploads, ...(form.uploaded as PendingUpload[])];
		}
	});

	$effect(() => {
		const attachedIds = new Set(data.files.map((f) => f.id));
		pendingUploads = pendingUploads.filter((p) => !attachedIds.has(p.file_id));
	});

	const uploadError = $derived(
		form && 'error' in form && typeof form.error === 'string' ? form.error : ''
	);
</script>

<svelte:head><title>{data.kb.name} — Knowledge — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<nav class="mb-4 text-xs text-mlq-muted">
		<a href="/knowledge" class="hover:text-mlq-text">Knowledge</a>
		<span class="mx-1">·</span>
		<span>{data.kb.name}</span>
	</nav>

	<KbHeader kb={data.kb} />

	<KbFilesSection files={data.files} {pendingUploads} error={uploadError} />

	<HybridAlphaControl kb={data.kb} />
</div>
```

- [ ] **Step 2: Verify type-check + lint**

```bash
npm run check 2>&1 | grep -E "error|warning" | head -20
npx eslint src/routes/\(app\)/knowledge/\[id\]/+page.svelte
```

Expected: 0 errors / 0 warnings on these files.

- [ ] **Step 3: Smoke-test in browser** (manual)

```bash
docker compose up -d --build donna-web
```

Visit `http://localhost:13002/knowledge/<any-existing-kb-id>`. The page should render header, empty file list, and α slider. (No e2e here yet — full e2e in Task 21.)

- [ ] **Step 4: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/\[id\]/+page.svelte
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge/[id]/+page.svelte — assemble KB detail page

Thin orchestrator: KbHeader + KbFilesSection + HybridAlphaControl.
Manages the pendingUploads $state lifecycle (append on uploadFile
action return; filter out once the file lands in data.files via
invalidateAll).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 15: `/knowledge/+page.{server.ts,svelte}` — top-level index

**Files:**

- Create: `src/routes/(app)/knowledge/+page.server.ts`
- Create: `src/routes/(app)/knowledge/page.server.test.ts`
- Create: `src/routes/(app)/knowledge/+page.svelte`

- [ ] **Step 1: Write failing test for the index load**

Create `src/routes/(app)/knowledge/page.server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const loadEv = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/knowledge load', () => {
	it('GETs /knowledge-bases and returns { kbs }', async () => {
		lqFetch.mockResolvedValueOnce(
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
		);
		const out = (await load(loadEv())) as { kbs: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases');
		expect(out.kbs.map((k) => k.id)).toEqual(['k1']);
	});

	it('throws error(502) when the backend fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
	});
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/page.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the index load**

Create `src/routes/(app)/knowledge/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import type { KnowledgeBase } from '$lib/knowledge/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const res = await lqFetch(event, '/api/v1/knowledge-bases');
	if (!res.ok) throw error(502, 'Could not load knowledge bases.');
	const kbs = (await res.json()) as KnowledgeBase[];
	return { kbs };
};
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/knowledge/page.server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the index Svelte page**

Create `src/routes/(app)/knowledge/+page.svelte`:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Knowledge — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-4 text-xl font-medium text-mlq-text">Knowledge</h1>

	{#if data.kbs.length === 0}
		<div
			class="rounded-mlq-control border border-mlq-subtle px-3 py-6 text-center text-sm text-mlq-muted"
		>
			No knowledge bases yet. Create one from a matter's Knowledge section.
		</div>
	{:else}
		<ul class="rounded-mlq-control border border-mlq-subtle">
			{#each data.kbs as k (k.id)}
				<li class="border-b border-mlq-subtle last:border-b-0">
					<a
						href="/knowledge/{k.id}"
						class="flex items-center gap-3 px-3 py-2 hover:bg-mlq-subtle/50"
					>
						<span class="min-w-0 flex-1 truncate text-sm text-mlq-text">{k.name}</span>
						<span class="shrink-0 text-xs text-mlq-muted"
							>{k.file_count} files · {k.chunk_count} chunks</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
```

- [ ] **Step 6: Verify type-check**

```bash
npm run check 2>&1 | grep -E "error|warning" | head -20
```

Expected: clean.

- [ ] **Step 7: Commit + push**

```bash
git add src/routes/\(app\)/knowledge/+page.server.ts src/routes/\(app\)/knowledge/page.server.test.ts src/routes/\(app\)/knowledge/+page.svelte
git commit -m "$(cat <<'EOF'
feat(p4-3b): /knowledge index — list all the user's KBs

GET /knowledge-bases → simple linked list of KB cards. Empty state
directs the user back to a matter's Knowledge section for create.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 16: `CreateKbForm.svelte`

**Files:**

- Create: `src/lib/knowledge/CreateKbForm.svelte`
- Create: `src/lib/knowledge/CreateKbForm.svelte.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/knowledge/CreateKbForm.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CreateKbForm from './CreateKbForm.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('CreateKbForm', () => {
	it('renders a form posting to ?/createKb with a required name field', () => {
		render(CreateKbForm, { props: { onsubmit: () => {} } });
		const form = screen.getByRole('form', { name: /create knowledge base/i });
		expect(form).toHaveAttribute('action', '?/createKb');
		const name = form.querySelector('input[name="name"]') as HTMLInputElement;
		expect(name.required).toBe(true);
	});

	it('disables the Create button when the name is empty / whitespace', async () => {
		render(CreateKbForm, { props: { onsubmit: () => {} } });
		const create = screen.getByRole('button', { name: /create/i });
		expect(create).toBeDisabled();
		const name = screen.getByLabelText(/name/i) as HTMLInputElement;
		await fireEvent.input(name, { target: { value: '   ' } });
		expect(create).toBeDisabled();
		await fireEvent.input(name, { target: { value: 'Acme' } });
		expect(create).not.toBeDisabled();
	});

	it('calls onsubmit when the form is submitted', async () => {
		const onsubmit = vi.fn();
		const { container } = render(CreateKbForm, { props: { onsubmit } });
		const name = screen.getByLabelText(/name/i) as HTMLInputElement;
		await fireEvent.input(name, { target: { value: 'Acme' } });
		const form = container.querySelector('form') as HTMLFormElement;
		form.addEventListener('submit', (e) => e.preventDefault(), true);
		await fireEvent.submit(form);
		expect(onsubmit).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/lib/knowledge/CreateKbForm.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `CreateKbForm.svelte`**

Create `src/lib/knowledge/CreateKbForm.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let { onsubmit }: { onsubmit: () => void } = $props();
	let name = $state('');
	const disabled = $derived(name.trim() === '');
</script>

<form
	method="POST"
	action="?/createKb"
	use:enhance
	aria-label="Create knowledge base"
	{onsubmit}
	class="p-3"
>
	<label class="block text-xs text-mlq-muted">
		Name
		<input
			name="name"
			type="text"
			required
			bind:value={name}
			placeholder="e.g. Acme Master Agreements"
			class="mt-1 block w-full rounded-mlq-control border border-mlq-subtle bg-transparent px-2 py-1 text-sm text-mlq-text outline-none focus:border-mlq-workflow"
		/>
	</label>
	<div class="mt-2 flex justify-end">
		<button
			type="submit"
			{disabled}
			class="rounded-mlq-control bg-mlq-text px-2.5 py-1 text-xs text-mlq-surface disabled:opacity-50"
			>Create</button
		>
	</div>
</form>
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/knowledge/CreateKbForm.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/knowledge/CreateKbForm.svelte src/lib/knowledge/CreateKbForm.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): CreateKbForm — inline create form for the KbPicker

Posts to ?/createKb on the parent route (matter detail wires
project_id via a hidden input). Disabled state for empty/whitespace
name; onsubmit callback closes the parent picker.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 17: Update `KbPicker.svelte` — add "Create new KB" affordance

**Files:**

- Modify: `src/lib/matters/knowledge/KbPicker.svelte`
- Modify: `src/lib/matters/knowledge/KbPicker.svelte.test.ts` (if it exists)
- Create: `src/lib/matters/knowledge/KbPicker.svelte.test.ts` (if missing)

- [ ] **Step 1: Check whether tests exist**

```bash
ls src/lib/matters/knowledge/KbPicker.svelte.test.ts 2>&1 || echo "no test file yet"
```

- [ ] **Step 2: Write/extend tests**

Either create or extend `src/lib/matters/knowledge/KbPicker.svelte.test.ts` to include:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import KbPicker from './KbPicker.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
	id: 'k1',
	name: 'KB',
	description: null,
	owner_id: 'u',
	hybrid_alpha: 0.5,
	file_count: 0,
	chunk_count: 0,
	created_at: '',
	updated_at: '',
	...over
});

describe('KbPicker — create affordance (P4-3b)', () => {
	it('renders a "+ Create new KB" affordance when opened', async () => {
		render(KbPicker, { props: { kbs: [kb({ id: 'k1', name: 'Existing' })], onpick: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		expect(screen.getByRole('button', { name: /create new kb/i })).toBeInTheDocument();
	});

	it('renders the affordance in the empty-KB state too', async () => {
		render(KbPicker, { props: { kbs: [], onpick: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		expect(screen.getByRole('button', { name: /create new kb/i })).toBeInTheDocument();
		// The deferred-create copy is gone.
		expect(screen.queryByText(/lands in a follow-up slice/i)).not.toBeInTheDocument();
	});

	it('clicking "+ Create new KB" swaps the search list for the create form', async () => {
		render(KbPicker, { props: { kbs: [kb({ id: 'k1' })], onpick: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
		await fireEvent.click(screen.getByRole('button', { name: /create new kb/i }));
		expect(screen.getByRole('form', { name: /create knowledge base/i })).toBeInTheDocument();
		expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `npx vitest run src/lib/matters/knowledge/KbPicker.svelte.test.ts`
Expected: FAIL (no Create affordance yet).

- [ ] **Step 4: Update `KbPicker.svelte`**

Rewrite `src/lib/matters/knowledge/KbPicker.svelte`:

```svelte
<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import type { KnowledgeBase } from '$lib/knowledge/types';
	import CreateKbForm from '$lib/knowledge/CreateKbForm.svelte';

	let { kbs, onpick }: { kbs: KnowledgeBase[]; onpick: (kbId: string) => void } = $props();

	let open = $state(false);
	let mode = $state<'list' | 'create'>('list');
	let q = $state('');
	let root = $state<HTMLElement>();

	const filtered = $derived(
		q.trim() ? kbs.filter((k) => k.name.toLowerCase().includes(q.trim().toLowerCase())) : kbs
	);

	function choose(id: string) {
		onpick(id);
		open = false;
		mode = 'list';
		q = '';
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			mode = 'list';
		}
	}
	function startCreate() {
		mode = 'create';
	}
	function onCreateSubmit() {
		open = false;
		mode = 'list';
		q = '';
	}
	$effect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) {
				open = false;
				mode = 'list';
			}
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
			{#if mode === 'create'}
				<CreateKbForm onsubmit={onCreateSubmit} />
			{:else}
				<button
					type="button"
					onclick={startCreate}
					class="flex w-full items-center gap-1 border-b border-mlq-subtle px-3 py-2 text-left text-xs text-mlq-text hover:bg-mlq-subtle/50"
					><Plus size={12} /> Create new KB</button
				>
				<input
					type="text"
					placeholder="Search knowledge bases…"
					bind:value={q}
					class="w-full border-b border-mlq-subtle bg-transparent px-3 py-2 text-xs text-mlq-text outline-none placeholder:text-mlq-muted"
				/>
				{#if kbs.length === 0}
					<p class="px-3 py-3 text-xs text-mlq-muted">No other knowledge bases to link.</p>
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
			{/if}
		</div>
	{/if}
</div>
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run src/lib/matters/knowledge/KbPicker.svelte.test.ts`
Expected: PASS (3 new tests + any prior tests stay green).

- [ ] **Step 6: Commit + push**

```bash
git add src/lib/matters/knowledge/KbPicker.svelte src/lib/matters/knowledge/KbPicker.svelte.test.ts
git commit -m "$(cat <<'EOF'
feat(p4-3b): KbPicker — "+ Create new KB" affordance + inline form

Mode toggles between 'list' (search + existing-KB picker) and
'create' (inline CreateKbForm). Empty-KB state no longer carries
the deferred-create disclaimer; create is now reachable from
both states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 18: Add `createKb` action on `/matters/[id]` + Manage link in `KnowledgeSection`

**Files:**

- Modify: `src/routes/(app)/matters/[id]/+page.server.ts`
- Modify: `src/routes/(app)/matters/[id]/page.server.test.ts`
- Modify: `src/lib/matters/sections/KnowledgeSection.svelte`
- Modify: `src/lib/matters/sections/KnowledgeSection.svelte.test.ts` (if it exists)

- [ ] **Step 1: Add failing tests for `createKb`**

Append to `src/routes/(app)/matters/[id]/page.server.test.ts` (new describe block):

```ts
describe('/matters/[id] actions — createKb (P4-3b)', () => {
	it('POSTs name + project_id + default hybrid_alpha and returns success on 201', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'kNew' }), { status: 201 }));
		const r = await actions.createKb(ev({ name: 'Acme' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
			name: 'Acme',
			project_id: 'p1',
			hybrid_alpha: 0.5
		});
		expect(r).toMatchObject({ success: true });
	});

	it('rejects empty name without calling the backend', async () => {
		const r = await actions.createKb(ev({ name: '  ' }));
		expect(r).toMatchObject({ status: 400, data: { error: 'Name is required.' } });
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('maps 404 to matter-gone fail', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const r = await actions.createKb(ev({ name: 'Acme' }));
		expect(r).toMatchObject({ status: 404, data: { error: 'Matter no longer exists.' } });
	});

	it('maps other backend failures to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const r = await actions.createKb(ev({ name: 'Acme' }));
		expect(r).toMatchObject({
			status: 502,
			data: { error: 'Could not create the knowledge base.' }
		});
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run src/routes/\\(app\\)/matters/\\[id\\]/page.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `createKb`**

In `src/routes/(app)/matters/[id]/+page.server.ts`, append to the `Actions` object (after `saveContext`):

```ts
  createKb: async (event) => {
    const data = await event.request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const res = await lqFetch(event, '/api/v1/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name, project_id: event.params.id, hybrid_alpha: 0.5 })
    });
    if (res.ok) return { success: true };
    if (res.status === 404) return fail(404, { error: 'Matter no longer exists.' });
    return fail(502, { error: 'Could not create the knowledge base.' });
  },
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/routes/\\(app\\)/matters/\\[id\\]/page.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `KnowledgeSection.svelte` to add a Manage link**

Modify `src/lib/matters/sections/KnowledgeSection.svelte`. Replace the linked-row span with a link:

```svelte
<div class="flex items-center gap-3 border-b border-mlq-subtle px-3 py-2 last:border-b-0">
	<a href="/knowledge/{k.id}" class="min-w-0 flex-1 truncate text-sm text-mlq-text hover:underline"
		>{k.name}</a
	>
	<span class="shrink-0 text-xs text-mlq-muted">{k.file_count} files</span>
	<a
		href="/knowledge/{k.id}"
		class="shrink-0 rounded-mlq-control border border-mlq-subtle px-2 py-0.5 text-xs text-mlq-text"
		>Manage</a
	>
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
			class="rounded-mlq-control p-1 text-mlq-muted hover:text-mlq-error"><X size={14} /></button
		>
	</form>
</div>
```

(Replace the corresponding block in the existing file.)

- [ ] **Step 6: Update KnowledgeSection tests if any**

```bash
ls src/lib/matters/sections/KnowledgeSection.svelte.test.ts 2>&1
```

If the test file exists, update assertions that check for a plain `<span>` to look for a `<a href="/knowledge/{k.id}">` link instead. Add a new test:

```ts
it('renders a Manage link to /knowledge/[id] for each linked KB', () => {
	render(KnowledgeSection, {
		props: {
			kbs: {
				linked: [
					{
						id: 'k1',
						name: 'Acme',
						owner_id: 'u',
						hybrid_alpha: 0.5,
						file_count: 1,
						chunk_count: 1,
						created_at: '',
						updated_at: ''
					}
				],
				available: []
			}
		}
	});
	const manage = screen.getByRole('link', { name: /manage/i }) as HTMLAnchorElement;
	expect(manage.getAttribute('href')).toBe('/knowledge/k1');
});
```

- [ ] **Step 7: Run all KnowledgeSection tests — expect pass**

Run: `npx vitest run src/lib/matters/sections/KnowledgeSection.svelte.test.ts src/routes/\\(app\\)/matters/\\[id\\]/page.server.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit + push**

```bash
git add src/routes/\(app\)/matters/\[id\]/ src/lib/matters/sections/KnowledgeSection.svelte src/lib/matters/sections/KnowledgeSection.svelte.test.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(p4-3b): matter createKb action + KnowledgeSection Manage link

POST /knowledge-bases with project_id pre-links the new KB to the
matter in a single round-trip (no follow-up linkKb). KnowledgeSection
gives each linked KB row a Manage link to /knowledge/[id].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 19: While-here fix — `FileRow.svelte` download URL

**Why:** Discovered during P4-3b exploration that `/api/v1/files/{id}/content` 404s (no `/api/v1` route in Donna). The actual route is `/files/{id}/content`. Smoke-tested live: `/api/v1/files/.../content` → 404; `/files/.../content` → 303 to login (working). Touching the same code path in Task 9 above (KbFileRow already uses `/files/{id}/content`); fix the matter-files counterpart in the same PR.

**Files:**

- Modify: `src/lib/matters/files/FileRow.svelte`
- Modify: `src/lib/matters/files/FileRow.svelte.test.ts`

- [ ] **Step 1: Update the test expectation**

In `src/lib/matters/files/FileRow.svelte.test.ts`, change:

```ts
expect(link.getAttribute('href')).toBe('/api/v1/files/f1/content');
```

to:

```ts
expect(link.getAttribute('href')).toBe('/files/f1/content');
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run src/lib/matters/files/FileRow.svelte.test.ts`
Expected: FAIL on the URL assertion.

- [ ] **Step 3: Fix the URL in `FileRow.svelte`**

In `src/lib/matters/files/FileRow.svelte`, change line 26:

```svelte
<a
	href="/api/v1/files/{file.id}/content"
	target="_blank"
	rel="noopener"
	class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a
>
```

to:

```svelte
<a
	href="/files/{file.id}/content"
	target="_blank"
	rel="noopener"
	class="shrink-0 text-xs text-mlq-workflow hover:underline">Download</a
>
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run src/lib/matters/files/FileRow.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/matters/files/FileRow.svelte src/lib/matters/files/FileRow.svelte.test.ts
git commit -m "$(cat <<'EOF'
fix(p4-3a): FileRow download URL points at the BFF route

/api/v1/files/{id}/content has no matching SvelteKit route (no
/api/v1 group). The actual BFF passthrough is at /files/{id}/content
under the (app) route group. Discovered while wiring KbFileRow
which already uses the correct URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 20: Live e2e — `tests/kb-management.spec.ts`

**Files:**

- Create: `tests/kb-management.spec.ts`

- [ ] **Step 1: Pre-flight — rebuild donna-web**

```bash
docker compose up -d --build donna-web
```

Wait for healthy: `docker compose ps donna-web` shows `healthy`.

- [ ] **Step 2: Write the live e2e spec**

Create `tests/kb-management.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

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

test('KB management — create from matter, upload + auto-attach, rename, α, detach, archive', async ({
	page
}) => {
	test.setTimeout(300_000);
	const tok = await token();

	const ts = Date.now();
	const matterName = `E2E KB-Mgmt Matter ${ts}`;
	const kbName = `E2E KB ${ts}`;
	const renamedKb = `E2E KB Renamed ${ts}`;
	const pid = (
		await api(tok, '/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: matterName })
		}).then((r) => r.json())
	).id as string;

	let createdKbId: string | null = null;

	try {
		await login(page);
		await page.goto(`/matters/${pid}`);

		// Create the KB from the matter's Knowledge section.
		await page.getByRole('button', { name: /link a knowledge base/i }).click();
		await page.getByRole('button', { name: /create new kb/i }).click();
		await page.getByLabel(/name/i).fill(kbName);
		await page.getByRole('button', { name: 'Create', exact: true }).click();
		await expect(page.getByText(kbName, { exact: true })).toBeVisible({ timeout: 15_000 });

		// Resolve the KB id via API for cleanup + navigation assertion.
		const kbs = await api(tok, '/knowledge-bases?project_id=' + pid).then((r) => r.json());
		const found = (kbs as Array<{ id: string; name: string }>).find((k) => k.name === kbName);
		if (!found) throw new Error('Seeded KB not visible in API list');
		createdKbId = found.id;

		// Navigate to KB detail via Manage.
		await page.getByRole('link', { name: /manage/i }).click();
		await page.waitForURL(new RegExp(`/knowledge/${createdKbId}$`));
		await expect(page.getByRole('heading', { name: kbName })).toBeVisible();

		// Upload spike.pdf via the hidden multipart input.
		const fileChooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: /upload files/i }).click();
		const chooser = await fileChooserPromise;
		await chooser.setFiles(PDF);

		// Pending → Processing → Ready (the auto-attach happens on ready).
		await expect(page.getByText('Pending')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Ready')).toBeVisible({ timeout: 180_000 });

		// Rename via modal.
		await page.getByRole('button', { name: 'Rename', exact: true }).click();
		const renameDialog = page.getByRole('dialog', { name: /rename knowledge base/i });
		await expect(renameDialog).toBeVisible();
		await renameDialog.getByLabel(/name/i).fill(renamedKb);
		await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByRole('heading', { name: renamedKb })).toBeVisible({ timeout: 15_000 });

		// Hybrid α: drag slider to 0.8 + reload + assert persistence.
		const slider = page.getByRole('slider', { name: /hybrid alpha/i });
		await slider.fill('0.8');
		// Wait for debounce + save round-trip.
		await page.waitForTimeout(1500);
		await page.reload();
		await expect(page.getByRole('slider', { name: /hybrid alpha/i })).toHaveValue('0.8');

		// Detach the attached file.
		await page.getByRole('button', { name: /remove spike\.pdf/i }).click();
		await expect(page.getByText(/spike\.pdf/i)).toHaveCount(0, { timeout: 15_000 });

		// Archive the KB → redirect to /knowledge, KB no longer listed.
		await page.getByRole('button', { name: 'Archive', exact: true }).click();
		await page.waitForURL('**/knowledge');
		await expect(page.getByText(renamedKb, { exact: true })).toHaveCount(0, { timeout: 10_000 });
	} finally {
		// Unconditional cleanup.
		await api(tok, `/projects/${pid}`, { method: 'DELETE' });
		if (createdKbId) await api(tok, `/knowledge-bases/${createdKbId}`, { method: 'DELETE' });
	}
});
```

- [ ] **Step 3: Run the e2e — expect pass against the running stack**

Run:

```bash
set -a; . ./.env; set +a
npx playwright test tests/kb-management.spec.ts --reporter=line
```

Expected: 1 passed. The "Ready" wait can take 30–120 s depending on ingestion. If it flakes, raise the 180 s budget; if it consistently fails > 180 s, investigate `ingest-worker` health (`docker compose logs ingest-worker --tail=200`) before relaxing.

- [ ] **Step 4: Final full-suite quality check**

Run:

```bash
npm run check 2>&1 | tail -20
npx eslint $(git diff --name-only main...HEAD -- '*.ts' '*.svelte' | tr '\n' ' ')
npx vitest run
npx playwright test --reporter=line
```

Expected:

- `npm run check`: "0 errors and 0 warnings".
- `npx eslint`: no output (clean).
- `npx vitest run`: full unit suite green.
- `npx playwright test`: only the **known-red P3 tests** (`tests/citation-pills.spec.ts`, `tests/citation-live.spec.ts`) fail; everything else green, including `tests/kb-management.spec.ts`.

- [ ] **Step 5: Commit + push**

```bash
git add tests/kb-management.spec.ts
git commit -m "$(cat <<'EOF'
test(p4-3b): live e2e — KB management end-to-end

Single self-cleaning spec covering: create KB from matter Knowledge
section (single-call project_id), navigate via Manage to
/knowledge/[id], upload PDF, watch Pending → Ready (auto-attach),
rename, hybrid α persistence across reload, detach, archive redirect.
try/finally archives the matter and (if seeded) the KB unconditionally.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Task 21: Final review + PR

**Files:** none.

- [ ] **Step 1: Whole-branch review**

Run a quality-bar pass:

```bash
git diff main...HEAD --stat
npm run check 2>&1 | tail -5
npx eslint $(git diff --name-only main...HEAD -- '*.ts' '*.svelte' | tr '\n' ' ')
npx vitest run 2>&1 | tail -10
```

Expected: clean check, clean lint on touched files, all unit tests green.

Spawn a `gsd-code-reviewer` (two-stage: spec-compliance pass against `docs/superpowers/specs/2026-05-28-donna-p4-3b-kb-management-design.md`, then code-quality pass). Address any HIGH findings before opening the PR.

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "P4-3b — KB creation + KB management" --body "$(cat <<'EOF'
## Summary

- Adds dedicated `/knowledge/[id]` KB management surface (rename, archive, file list, upload + ingestion polling + auto-attach, hybrid_alpha slider) and a top-level `/knowledge` index.
- Adds `+ Create new KB` to the matter Knowledge section's `KbPicker`. Single-round-trip create-and-link via `project_id` in the create body.
- Client-side `$effect` polls `/files/[id]` every 2 s while pending/processing (visibility-paused), auto-fires `?/attachFile` on the `ready` transition (double-attach guard + backend 409-idempotent), surfaces `ingestion_error` on `failed`, escalates to "Refresh to check" after 5 min stuck.
- While-here fix: `FileRow.svelte` download URL `/api/v1/files/{id}/content` → `/files/{id}/content` (the existing URL 404s; pre-existing P4-3a bug discovered during exploration).

## Test plan

- [x] `npm run check` — 0 errors / 0 warnings
- [x] `npx eslint` on touched files — clean
- [x] `npx vitest run` — full unit suite green
- [x] `npx playwright test tests/kb-management.spec.ts` — green
- [x] Known-red P3 tests (`tests/citation-pills.spec.ts`, `tests/citation-live.spec.ts`) remain out of scope

Spec: `docs/superpowers/specs/2026-05-28-donna-p4-3b-kb-management-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Update phase status memory**

Update `donna-phase-status` memory: mark P4-3b as merged once the PR lands.

---

## Spec coverage matrix

| Spec section                                          | Implemented in              |
| ----------------------------------------------------- | --------------------------- |
| §2 `POST /knowledge-bases` (create)                   | Task 18 (`createKb` action) |
| §2 `GET /knowledge-bases` (index)                     | Task 15 (index load)        |
| §2 `GET /knowledge-bases/{id}` (detail)               | Task 8 (load)               |
| §2 `PATCH /knowledge-bases/{id}` (rename + α)         | Tasks 5, 7                  |
| §2 `DELETE /knowledge-bases/{id}` (archive)           | Task 6                      |
| §2 `POST /api/v1/files` (upload)                      | Task 2                      |
| §2 `POST /knowledge-bases/{id}/files` (attach)        | Task 3                      |
| §2 `GET /knowledge-bases/{id}/files` (list)           | Task 8 (load)               |
| §2 `DELETE /knowledge-bases/{id}/files/{id}` (detach) | Task 4                      |
| §2 `GET /files/{id}` (poll)                           | Task 9 (KbFileRow polling)  |
| §3 Q1 dedicated `/knowledge/[id]` route               | Tasks 8, 14                 |
| §3 Q2 client poll + auto-attach                       | Task 9                      |
| §3 Q3 top-level `/knowledge` index                    | Task 15                     |
| §3 Q4 hybrid α slider                                 | Task 13                     |
| §3 Q5 KB rename + archive                             | Tasks 5, 6, 11, 12          |
| §3 Q6 single-call create-and-link                     | Task 18                     |
| §3 Q7 failed-row recovery (Remove only)               | Task 9                      |
| §3 Q8 5-min polling timeout                           | Task 9                      |
| §3 Q9 bail-on-first multi-upload                      | Task 2                      |
| §3 Q10 FileRow download URL fix                       | Task 19                     |
| §5.1 Create KB flow                                   | Tasks 16, 17, 18            |
| §5.2 Upload flow                                      | Tasks 2, 10                 |
| §5.3 Poll loop                                        | Task 9                      |
| §5.4 Auto-attach                                      | Tasks 3, 9                  |
| §5.5 Detach                                           | Tasks 4, 9                  |
| §5.6 Rename / Archive / Hybrid α                      | Tasks 5, 6, 7, 11, 12, 13   |
| §5.7 Load functions                                   | Tasks 8, 15                 |
| §6 Inline error UI                                    | Tasks 10, 12, 13            |
| §6 Tab visibility pause                               | Task 9                      |
| §6 Double-attach guard                                | Task 9                      |
| §6 422 retry race                                     | Tasks 3, 9                  |
| §7.1 Unit tests                                       | Tasks 2–13, 15–18           |
| §7.2 Live e2e                                         | Task 20                     |
| §10 Branch + spec reference                           | Preconditions               |
