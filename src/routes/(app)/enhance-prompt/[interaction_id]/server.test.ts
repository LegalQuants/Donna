import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH } from './+server';

const event = (body: unknown) =>
	({
		params: { interaction_id: 'i1' },
		request: new Request('http://x/enhance-prompt/i1', {
			method: 'PATCH',
			body: JSON.stringify(body)
		})
	}) as any;

beforeEach(() => lqFetch.mockReset());

describe('PATCH /enhance-prompt/[interaction_id]', () => {
	it('proxies the body to the interaction path', async () => {
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
		await PATCH(event({ used: true }));
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/enhance-prompt/i1');
		expect((lqFetch.mock.calls[0][2] as { method: string }).method).toBe('PATCH');
		expect(JSON.parse((lqFetch.mock.calls[0][2] as { body: string }).body)).toEqual({ used: true });
	});

	it('maps 404 to 404', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		await expect(PATCH(event({ used: true }))).rejects.toMatchObject({ status: 404 });
	});

	it('maps other errors to 502', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
		await expect(PATCH(event({ used: false }))).rejects.toMatchObject({ status: 502 });
	});
});
