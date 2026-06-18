import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

beforeEach(() => lqFetch.mockReset());

describe('research load', () => {
	it('returns capabilities (enabled)', async () => {
		lqFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ enabled: true, providers: [{ name: 'cl', type: 'courtlistener' }] }),
				{ status: 200 }
			)
		);
		const { load } = await import('./+page.server');
		const out = (await load({} as never)) as {
			capabilities: { enabled: boolean; providers: { name: string; type: string }[] };
		};
		expect(out.capabilities).toEqual({
			enabled: true,
			providers: [{ name: 'cl', type: 'courtlistener' }]
		});
	});
	it('degrades to disabled when the check fails', async () => {
		lqFetch.mockResolvedValue(new Response('nope', { status: 502 }));
		const { load } = await import('./+page.server');
		const out = (await load({} as never)) as { capabilities: { enabled: boolean } };
		expect(out.capabilities.enabled).toBe(false);
	});
	it('degrades to disabled when the response body is unreadable (catch path)', async () => {
		// A 200 with a non-JSON body makes `await res.json()` reject inside the
		// load's try — exercising the catch → disabled fallback.
		lqFetch.mockResolvedValue(new Response('not json{', { status: 200 }));
		const { load } = await import('./+page.server');
		const out = (await load({} as never)) as { capabilities: { enabled: boolean } };
		expect(out.capabilities.enabled).toBe(false);
	});
});
