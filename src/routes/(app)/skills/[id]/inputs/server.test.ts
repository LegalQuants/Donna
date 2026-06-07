import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id: string) => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET skills/[id]/inputs', () => {
	it('forwards to the backend inputs endpoint and returns the JSON', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ name: 'nda-review', required: [], optional: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		const res = await GET(event('nda-review'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/nda-review/inputs');
		expect(await res.json()).toMatchObject({ name: 'nda-review' });
	});

	it('passes 503/504 through and maps other failures to 502', async () => {
		lqFetch.mockResolvedValue(new Response('x', { status: 503 }));
		await expect(GET(event('s'))).rejects.toMatchObject({ status: 503 });
		lqFetch.mockResolvedValue(new Response('x', { status: 504 }));
		await expect(GET(event('s'))).rejects.toMatchObject({ status: 504 });
		lqFetch.mockResolvedValue(new Response('x', { status: 500 }));
		await expect(GET(event('s'))).rejects.toMatchObject({ status: 502 });
	});
});
