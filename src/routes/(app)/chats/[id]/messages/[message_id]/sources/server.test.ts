import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { GET } from './+server';

const event = () => ({ params: { id: 'c1', message_id: 'm1' } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET sources', () => {
	it('proxies the per-message sources endpoint', async () => {
		lqFetch.mockResolvedValue(new Response(JSON.stringify([{ label: 'x' }]), { status: 200 }));
		const res = await GET(event());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/messages/m1/sources');
		expect(await res.json()).toEqual([{ label: 'x' }]);
	});

	it('maps a 404 to a 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
