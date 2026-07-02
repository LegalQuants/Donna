import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

function ev(messageId?: string) {
	const url = new URL(`http://x/chats/c1/ledger${messageId ? `?message_id=${messageId}` : ''}`);
	return { params: { id: 'c1' }, url } as never;
}

describe('ledger proxy', () => {
	beforeEach(() => lqFetch.mockReset());
	it('forwards message_id and returns the json', async () => {
		lqFetch.mockImplementationOnce(async (_e: unknown, path: string) => {
			expect(path).toBe('/api/v1/chats/c1/ledger?message_id=m1');
			return { ok: true, json: async () => ({ entries: [], gates: [] }) } as unknown as Response;
		});
		const res = await GET(ev('m1'));
		expect(await res.json()).toEqual({ entries: [], gates: [] });
	});
	it('omits the query param when no message_id', async () => {
		lqFetch.mockImplementationOnce(async (_e: unknown, path: string) => {
			expect(path).toBe('/api/v1/chats/c1/ledger');
			return { ok: true, json: async () => ({ entries: [], gates: [] }) } as unknown as Response;
		});
		await GET(ev());
	});
});
