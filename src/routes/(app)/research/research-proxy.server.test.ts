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
		const out = await POST(
			ev(new Request('http://x/research/search', { method: 'POST', body: '{"q":"chevron"}' }))
		);
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/search', {
			method: 'POST',
			body: '{"q":"chevron"}'
		});
		expect(out.status).toBe(200);
	});
	it('propagates a 503 not-configured', async () => {
		lqFetch.mockResolvedValue(res(503, { detail: 'not configured' }));
		const { POST } = await import('./search/+server');
		const out = await POST(
			ev(new Request('http://x/research/search', { method: 'POST', body: '{"q":"x"}' }))
		);
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
		await POST(
			ev(
				new Request('http://x', { method: 'POST', body: '{"opinion_id":5,"query":"due process"}' })
			)
		);
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/find-in-case', {
			method: 'POST',
			body: '{"opinion_id":5,"query":"due process"}'
		});
	});
	it('verify-citations forwards body', async () => {
		lqFetch.mockResolvedValue(res(200, { citations: [] }));
		const { POST } = await import('./verify-citations/+server');
		await POST(
			ev(new Request('http://x', { method: 'POST', body: '{"text":"see 576 U.S. 644"}' }))
		);
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/research/verify-citations', {
			method: 'POST',
			body: '{"text":"see 576 U.S. 644"}'
		});
	});
});
