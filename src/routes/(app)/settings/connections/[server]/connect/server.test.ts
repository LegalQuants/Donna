// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

const ev = (server: string) =>
	({
		params: { server },
		url: new URL(`http://localhost/settings/connections/${server}/connect`)
	}) as never;

beforeEach(() => lqFetch.mockReset());

describe('GET connect', () => {
	it('redirects the browser to the auth-server URL and forwards return_url', async () => {
		lqFetch.mockResolvedValue(
			new Response(null, { status: 302, headers: { location: 'https://as.example/auth?x=1' } })
		);
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 302,
			location: 'https://as.example/auth?x=1'
		});
		const calledPath = lqFetch.mock.calls[0][1] as string;
		expect(calledPath).toContain('/api/v1/mcp/oauth/ctx7/authorize');
		expect(calledPath).toContain(
			'return_url=' + encodeURIComponent('http://localhost/settings/connections')
		);
		expect((lqFetch.mock.calls[0][2] as RequestInit).redirect).toBe('manual');
	});
	it('redirects back with mcp_error when authorize is not 3xx (404 -> not_found)', async () => {
		lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 303,
			location: '/settings/connections?mcp_error=not_found&server=ctx7'
		});
	});
	it('redirects back with authorize_failed when lqFetch throws', async () => {
		lqFetch.mockRejectedValueOnce(new Error('network'));
		const { GET } = await import('./+server');
		await expect(GET(ev('ctx7'))).rejects.toMatchObject({
			status: 303,
			location: '/settings/connections?mcp_error=authorize_failed&server=ctx7'
		});
	});
});
