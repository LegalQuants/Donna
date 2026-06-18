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
			'POST /research/search': {
				count: 1,
				next_cursor: null,
				results: [{ cluster_id: 9, case_name: 'A v. B' }]
			}
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
			'GET /research/clusters/9': {
				cluster: { cluster_id: 9, case_name: 'A v. B' },
				opinions: [{ opinion_id: 1, text_field_used: 'plain_text', char_length: 5 }]
			}
		});
		const r = createResearch(f);
		await r.openCluster(9);
		expect(r.cluster?.cluster.cluster_id).toBe(9);
		expect(r.cluster?.opinions[0].opinion_id).toBe(1);
	});

	it('verify populates citations', async () => {
		const f = fetchReturning({
			'POST /research/verify-citations': {
				citations: [
					{ citation: '576 U.S. 644', status: 200, normalized_citations: [], clusters: [] }
				]
			}
		});
		const r = createResearch(f);
		await r.verify('see 576 U.S. 644');
		expect(r.citations).toHaveLength(1);
	});

	it('findInCase populates matches with the snake_case payload', async () => {
		const f = vi.fn(async (_url: string, init?: RequestInit) => {
			expect(JSON.parse(String(init?.body))).toEqual({
				opinion_id: 1,
				query: 'due process',
				max_matches: 10
			});
			return new Response(
				JSON.stringify({ opinion_id: 1, matches: [{ position: 3, snippet: 'x' }] }),
				{
					status: 200
				}
			);
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		await r.findInCase(1, 'due process');
		expect(r.matches).toEqual([{ position: 3, snippet: 'x' }]);
	});

	it('clears the loading spinner even when the fetch throws', async () => {
		const f = vi.fn(async () => {
			throw new Error('network down');
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		await expect(r.search('x')).rejects.toThrow('network down');
		expect(r.loading).toBe(false);
	});

	it('search sends court and order_by when filters are non-empty', async () => {
		const f = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.court).toBe('scotus');
			expect(body.order_by).toBe('dateFiled desc');
			return new Response(JSON.stringify({ count: 0, next_cursor: null, results: [] }), {
				status: 200
			});
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		await r.search('q', { court: 'scotus', order_by: 'dateFiled desc' });
		expect(f).toHaveBeenCalledOnce();
	});

	it('search sends only { q } when filters arg is empty {}', async () => {
		const f = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body).toEqual({ q: 'x' });
			return new Response(JSON.stringify({ count: 0, next_cursor: null, results: [] }), {
				status: 200
			});
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		await r.search('x', {});
		expect(f).toHaveBeenCalledOnce();
	});

	it('search sends only { q } when no filters arg is passed', async () => {
		const f = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body).toEqual({ q: 'y' });
			return new Response(JSON.stringify({ count: 0, next_cursor: null, results: [] }), {
				status: 200
			});
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		await r.search('y');
		expect(f).toHaveBeenCalledOnce();
	});

	it('findInCase populates matches and clears a pre-set error', async () => {
		// We need two distinct URL handlers: one to trigger an error, then find-in-case success.
		let callCount = 0;
		const f = vi.fn(async (_url: string, init?: RequestInit) => {
			callCount++;
			if (callCount === 1) {
				// First call: search with a 502 to set an error state
				return new Response('{}', { status: 502 });
			}
			// Second call: find-in-case success
			void init;
			return new Response(
				JSON.stringify({ opinion_id: 1, matches: [{ position: 5, snippet: 'found it' }] }),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;
		const r = createResearch(f);
		// Trigger an error via a failed search
		await r.search('bad');
		expect(r.error).toBe('Something went wrong — try again.');
		// Now run findInCase — it should clear the error
		await r.findInCase(1, 'due process');
		expect(r.error).toBeNull();
		expect(r.matches).toEqual([{ position: 5, snippet: 'found it' }]);
	});
});
