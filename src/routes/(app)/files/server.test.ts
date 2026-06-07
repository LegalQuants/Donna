// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

function formEv() {
	const fd = new FormData();
	fd.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'c.pdf');
	return { request: new Request('http://x', { method: 'POST', body: fd }) } as never;
}
beforeEach(() => lqFetch.mockReset());

describe('POST /files', () => {
	it('forwards the multipart body to /api/v1/files and returns the new file', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1' }), { status: 201 }));
		const res = await POST(formEv());
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files');
		expect(lqFetch.mock.calls[0][2].method).toBe('POST');
		expect(lqFetch.mock.calls[0][2].body).toBeInstanceOf(FormData); // boundary preserved
		expect((await res.json()).id).toBe('f1');
	});
	it('maps a 413 to a size message', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ details: { limit_bytes: 52428800 } }), { status: 413 })
		);
		await expect(POST(formEv())).rejects.toMatchObject({ status: 413 });
	});
});
