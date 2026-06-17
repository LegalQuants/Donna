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
});
