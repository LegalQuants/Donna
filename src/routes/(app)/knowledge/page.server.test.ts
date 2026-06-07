import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const loadEv = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/knowledge load', () => {
	it('GETs /knowledge-bases and returns { kbs }', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify([
					{
						id: 'k1',
						name: 'KB',
						owner_id: 'u',
						hybrid_alpha: 0.5,
						file_count: 0,
						chunk_count: 0,
						created_at: '',
						updated_at: ''
					}
				]),
				{ status: 200 }
			)
		);
		const out = (await load(loadEv())) as { kbs: { id: string }[] };
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/knowledge-bases');
		expect(out.kbs.map((k) => k.id)).toEqual(['k1']);
	});

	it('throws error(502) when the backend fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
	});
});
