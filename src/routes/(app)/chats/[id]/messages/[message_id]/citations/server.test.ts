import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { GET } from './+server';

const event = () => ({ params: { id: 'c1', message_id: 'm1' } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET citations', () => {
	it('proxies the per-message citations endpoint', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify([{ id: 'x' }]), { status: 200 }));
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/messages/m1/citations');
		expect(await res.json()).toEqual([{ id: 'x' }]);
	});

	it('maps a 404 to a 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
	});
});
