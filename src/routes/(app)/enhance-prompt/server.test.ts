import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
	({
		request: new Request('http://x/enhance-prompt', { method: 'POST', body: JSON.stringify(body) })
	}) as any;

beforeEach(() => lqFetch.mockReset());

describe('POST /enhance-prompt', () => {
	it('proxies the body and returns the response', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					interaction_id: 'i1',
					expansion_applied: true,
					expanded_prompt: 'X',
					reasoning: []
				}),
				{ status: 200 }
			)
		);
		const res = await POST(event({ raw_input: 'hi', chat_id: 'c1' }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/enhance-prompt');
		expect((lqFetch.mock.calls[0][2] as { method: string }).method).toBe('POST');
		expect(JSON.parse((lqFetch.mock.calls[0][2] as { body: string }).body)).toMatchObject({
			raw_input: 'hi',
			chat_id: 'c1'
		});
		expect((await res.json()).interaction_id).toBe('i1');
	});

	it('passes through 503/504', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
		await expect(POST(event({ raw_input: 'hi' }))).rejects.toMatchObject({ status: 504 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(POST(event({ raw_input: 'hi' }))).rejects.toMatchObject({ status: 502 });
	});
});
