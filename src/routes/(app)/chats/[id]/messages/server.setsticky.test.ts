import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqStream = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqStream: (...a: unknown[]) => lqStream(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		params: { id: 'c1' },
		request: new Request('http://x/chats/c1/messages', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}) as any;

beforeEach(() => lqStream.mockReset());

function sentBody() {
	const calls = lqStream.mock.calls;
	return JSON.parse((calls[calls.length - 1][2] as { body: string }).body);
}

describe('POST messages — set_sticky', () => {
	it('forwards set_sticky:true', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		await POST(event({ content: 'hi', set_sticky: true }));
		expect(sentBody().set_sticky).toBe(true);
	});
	it('forwards set_sticky:false', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		await POST(event({ content: 'hi', set_sticky: false }));
		expect(sentBody().set_sticky).toBe(false);
	});
	it('omits set_sticky when absent', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		await POST(event({ content: 'hi' }));
		expect('set_sticky' in sentBody()).toBe(false);
	});
	it('omits set_sticky when not a boolean', async () => {
		lqStream.mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		await POST(event({ content: 'hi', set_sticky: 'yes' }));
		expect('set_sticky' in sentBody()).toBe(false);
	});
});
