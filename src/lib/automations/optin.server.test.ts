// src/lib/automations/optin.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { isAutonomousEnabled } from './optin.server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('isAutonomousEnabled', () => {
	it('reads autonomous_enabled from GET /users/me/preferences', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })
		);
		expect(await isAutonomousEnabled(ev())).toBe(true);
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
	});
	it('returns false when the field is missing or the call fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
		expect(await isAutonomousEnabled(ev())).toBe(false);
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		expect(await isAutonomousEnabled(ev())).toBe(false);
		lqFetch.mockRejectedValueOnce(new Error('network'));
		expect(await isAutonomousEnabled(ev())).toBe(false);
	});
});
