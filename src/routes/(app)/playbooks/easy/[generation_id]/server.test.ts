// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (generation_id = 'g1') => ({ params: { generation_id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /playbooks/easy/[generation_id]', () => {
	it('passes through the generation JSON', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'g1', status: 'completed' }), { status: 200 })
		);
		const res = await GET(ev());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/easy/g1');
		expect((await res.json()).status).toBe('completed');
	});
	it('maps a 500 to 502', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
	});
});
