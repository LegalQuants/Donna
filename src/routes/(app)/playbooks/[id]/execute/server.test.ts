// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';
const ev = (body: unknown, id = 'pb1') =>
	({
		params: { id },
		request: new Request('http://x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	}) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /playbooks/[id]/execute', () => {
	it('forwards the body and returns the execution', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'e1', status: 'pending' }), { status: 202 })
		);
		const res = await POST(ev({ target_document_id: 'd1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1/execute');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ target_document_id: 'd1' });
		expect((await res.json()).id).toBe('e1');
	});
	it('maps a 404 (target/playbook not found) through', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		await expect(POST(ev({ target_document_id: 'd1' }))).rejects.toMatchObject({ status: 404 });
	});
});
