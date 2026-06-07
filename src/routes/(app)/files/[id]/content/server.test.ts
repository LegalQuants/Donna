import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id = 'f1') => ({ params: { id } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /files/[id]/content', () => {
	it('streams the upstream bytes through with the upstream content-type', async () => {
		const upstream = new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
			status: 200,
			headers: { 'content-type': 'application/pdf', 'content-length': '4' }
		});
		lqFetch.mockResolvedValue(upstream);
		const res = await GET(event('f1'));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files/f1/content');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/pdf');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([0x25, 0x50, 0x44, 0x46])
		);
	});

	it('forces attachment disposition so non-PDF bytes never render inline in our origin', async () => {
		lqFetch.mockResolvedValue(
			new Response(new Uint8Array([0x25]), {
				status: 200,
				headers: { 'content-type': 'text/html' }
			})
		);
		const res = await GET(event('f1'));
		expect(res.headers.get('content-disposition')).toBe('attachment');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('passes through 404 and maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(GET(event())).rejects.toMatchObject({ status: 502 });
	});
});
