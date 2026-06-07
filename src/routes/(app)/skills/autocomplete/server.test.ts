import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (qs = '') => ({ url: new URL(`http://x/skills/autocomplete${qs}`) }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /skills/autocomplete', () => {
	it('forwards q and limit and returns the body', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
		const res = await GET(event('?q=nda&limit=8'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/autocomplete?q=nda&limit=8');
		expect(await res.json()).toEqual({ results: [] });
	});

	it('defaults q to empty and limit to 8 (recents)', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
		await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/autocomplete?q=&limit=8');
	});

	it('passes through 503 and 504', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 503 });
		lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 504 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
