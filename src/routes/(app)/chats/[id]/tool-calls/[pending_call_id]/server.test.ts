import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		params: { id: 'c1', pending_call_id: 'p1' },
		request: new Request('http://x/chats/c1/tool-calls/p1', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}) as never;

beforeEach(() => lqStream.mockReset());

describe('POST tool-calls resume', () => {
	it('forwards the decision to the backend resume endpoint', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		const out = await POST(event({ decision: 'approve' }));
		const call = lqStream.mock.calls[0];
		expect(call[1]).toBe('/api/v1/chats/c1/tool-calls/p1');
		expect((call[2] as { method: string }).method).toBe('POST');
		expect(JSON.parse((call[2] as { body: string }).body)).toEqual({ decision: 'approve' });
		expect(out.status).toBe(200);
	});

	it('coerces an invalid decision to deny (fail-safe)', async () => {
		lqStream.mockResolvedValue(new Response('', { status: 200 }));
		await POST(event({ decision: 'whatever' }));
		expect(JSON.parse((lqStream.mock.calls[0][2] as { body: string }).body)).toEqual({
			decision: 'deny'
		});
	});

	it('passes a non-2xx status through', async () => {
		lqStream.mockResolvedValue(new Response('', { status: 409 }));
		const out = await POST(event({ decision: 'approve' }));
		expect(out.status).toBe(409);
	});
});
