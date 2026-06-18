// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

function res(status: number, body: unknown) {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
const admin = { locals: { user: { is_admin: true } } };
const nonAdmin = { locals: { user: { is_admin: false } } };
function formEvent(base: { locals: unknown }, fields: Record<string, string>) {
	const fd = new URLSearchParams(fields);
	return {
		...base,
		request: new Request('http://x', {
			method: 'POST',
			body: fd,
			headers: { 'content-type': 'application/x-www-form-urlencoded' }
		})
	} as never;
}

beforeEach(() => lqFetch.mockReset());

describe('mcp load', () => {
	it('admin: returns parsed servers', async () => {
		lqFetch.mockResolvedValue(res(200, { servers: [{ name: 'fs', type: 'mcp', tools: [] }] }));
		const { load } = await import('./+page.server');
		const out = await load(admin as never);
		expect(out.isAdmin).toBe(true);
		expect(out.servers).toHaveLength(1);
		expect(out.mcpError).toBe(false);
	});
	it('admin: degrades to mcpError on non-ok', async () => {
		lqFetch.mockResolvedValue(res(502, 'no'));
		const { load } = await import('./+page.server');
		const out = await load(admin as never);
		expect(out.mcpError).toBe(true);
		expect(out.servers).toEqual([]);
	});
	it('non-admin: no fetch, empty + isAdmin false', async () => {
		const { load } = await import('./+page.server');
		const out = await load(nonAdmin as never);
		expect(out.isAdmin).toBe(false);
		expect(out.servers).toEqual([]);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('actions.toggleTool', () => {
	it('PATCHes the tool enabled state', async () => {
		lqFetch.mockResolvedValue(res(200, { name: 'read_file', enabled: false }));
		const { actions } = await import('./+page.server');
		const out = await actions.toggleTool(
			formEvent(admin, { server: 'fs', tool: 'read_file', enabled: 'false' })
		);
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/mcp/fs/tools/read_file',
			{ method: 'PATCH', body: JSON.stringify({ enabled: false }) }
		);
		expect(out).toMatchObject({ success: true });
	});
	it('fails 403 when the backend rejects', async () => {
		lqFetch.mockResolvedValue(res(403, 'no'));
		const { actions } = await import('./+page.server');
		const out = await actions.toggleTool(
			formEvent(admin, { server: 'fs', tool: 'read_file', enabled: 'true' })
		);
		expect(out.status).toBe(403);
	});
});

describe('actions.refreshServer', () => {
	it('POSTs refresh', async () => {
		lqFetch.mockResolvedValue(res(200, { server: 'fs', tools: [] }));
		const { actions } = await import('./+page.server');
		await actions.refreshServer(formEvent(admin, { server: 'fs' }));
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/admin/mcp/fs/refresh', {
			method: 'POST'
		});
	});
});
