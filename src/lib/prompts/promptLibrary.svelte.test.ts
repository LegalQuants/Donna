import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPromptLibrary } from './promptLibrary.svelte';

const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.restoreAllMocks());

describe('createPromptLibrary', () => {
	it('seed sets prompts and marks loaded (no fetch on ensureLoaded)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		expect(lib.prompts.map((p) => p.id)).toEqual(['p1']);
		await lib.ensureLoaded();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('ensureLoaded fetches once and caches', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp([{ id: 'p1', name: 'A', prompt_text: 'x' }]));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		await lib.ensureLoaded();
		await lib.ensureLoaded();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/prompts/items');
		expect(lib.prompts.length).toBe(1);
	});

	it('create prepends the new prompt and returns true', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ id: 'p9', name: 'New', prompt_text: 'hi' }, 201));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		const ok = await lib.create({ name: 'New', prompt_text: 'hi' });
		expect(ok).toBe(true);
		expect(lib.prompts.map((p) => p.id)).toEqual(['p9', 'p1']);
	});

	it('create sets error and returns false on failure', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status: 422 }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		const ok = await lib.create({ name: '', prompt_text: '' });
		expect(ok).toBe(false);
		expect(lib.error).toBeTruthy();
		expect(lib.prompts.length).toBe(0);
	});

	it('update replaces in place', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ id: 'p1', name: 'Renamed', prompt_text: 'x' }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([{ id: 'p1', name: 'A', prompt_text: 'x' }] as never);
		await lib.update('p1', { name: 'Renamed' });
		expect(lib.prompts[0].name).toBe('Renamed');
		expect(fetchMock.mock.calls[0][0]).toBe('/prompts/items/p1');
		expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
	});

	it('remove drops the prompt', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const lib = createPromptLibrary();
		lib.seed([
			{ id: 'p1', name: 'A', prompt_text: 'x' },
			{ id: 'p2', name: 'B', prompt_text: 'y' }
		] as never);
		await lib.remove('p1');
		expect(fetchMock.mock.calls[0][0]).toBe('/prompts/items/p1');
		expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
		expect(lib.prompts.map((p) => p.id)).toEqual(['p2']);
	});
});
