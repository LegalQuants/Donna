import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

function res(status: number, body: unknown) {
	return new Response(
		body === null ? null : typeof body === 'string' ? body : JSON.stringify(body),
		{
			status
		}
	);
}
const ev = (url = 'http://localhost/settings/connections') => ({ url: new URL(url) }) as never;
function formEvent(fields: Record<string, string>) {
	return {
		request: new Request('http://x', {
			method: 'POST',
			body: new URLSearchParams(fields),
			headers: { 'content-type': 'application/x-www-form-urlencoded' }
		})
	} as never;
}
type LoadOut = { servers: unknown[]; loadError: boolean; result: unknown };
type ActionOut = { status?: number; success?: boolean };

beforeEach(() => lqFetch.mockReset());

describe('connections load', () => {
	it('maps the oauth server list', async () => {
		lqFetch.mockResolvedValue(
			res(200, { servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }] })
		);
		const { load } = await import('./+page.server');
		const out = (await load(ev())) as LoadOut;
		expect(out.servers).toHaveLength(1);
		expect(out.loadError).toBe(false);
	});
	it('degrades to loadError on a non-ok fetch', async () => {
		lqFetch.mockResolvedValue(res(502, 'no'));
		const { load } = await import('./+page.server');
		const out = (await load(ev())) as LoadOut;
		expect(out.servers).toEqual([]);
		expect(out.loadError).toBe(true);
	});
	it('reads the mcp_connected banner result', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [] }));
		const { load } = await import('./+page.server');
		const out = (await load(
			ev('http://localhost/settings/connections?mcp_connected=ctx7')
		)) as LoadOut;
		expect(out.result).toEqual({ server: 'ctx7', status: 'connected' });
	});
	it('reads the mcp_error banner result', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [] }));
		const { load } = await import('./+page.server');
		const out = (await load(
			ev('http://localhost/settings/connections?mcp_error=authorize_failed&server=ctx7')
		)) as LoadOut;
		expect(out.result).toEqual({ server: 'ctx7', status: 'error', code: 'authorize_failed' });
	});
});

describe('actions.disconnect', () => {
	it('DELETEs the server token', async () => {
		lqFetch.mockResolvedValue(res(204, null));
		const { actions } = await import('./+page.server');
		const out = (await actions.disconnect(formEvent({ server: 'ctx7' }))) as ActionOut;
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/mcp/oauth/ctx7', {
			method: 'DELETE'
		});
		expect(out).toMatchObject({ success: true });
	});
	it('fails 400 when server is missing', async () => {
		const { actions } = await import('./+page.server');
		const out = (await actions.disconnect(formEvent({}))) as ActionOut;
		expect(out.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
