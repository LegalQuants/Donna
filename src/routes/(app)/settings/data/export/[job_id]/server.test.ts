// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (job_id: string) => ({ params: { job_id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET /settings/data/export/[job_id] proxy', () => {
	it('proxies the job status on success', async () => {
		lqFetch.mockResolvedValue(
			new Response(JSON.stringify({ job_id: 'j1', status: 'processing', download_url: null }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		const res = await GET(event('j1'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/export/j1');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ job_id: 'j1', status: 'processing', download_url: null });
	});

	it('passes a 404 through', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(GET(event('missing'))).rejects.toMatchObject({ status: 404 });
	});

	it('maps a 500 to 502', async () => {
		lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
		await expect(GET(event('j1'))).rejects.toMatchObject({ status: 502 });
	});
});
