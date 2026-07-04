import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ROWS = {
	tool_providers: [
		{
			type: 'edgar',
			enabled: false,
			name: 'edgar-prod',
			has_key: false,
			key_required: false,
			egress_tier: 4
		}
	]
};
const admin = (over = {}) => ({ locals: { user: { is_admin: true } }, ...over }) as never;
const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return { request: { formData: async () => f }, locals: { user: { is_admin: true } } } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/settings/research load', () => {
	it('loads sources for an admin', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ROWS });
		const out = (await load(admin())) as { isAdmin: boolean; sources: unknown[] };
		expect(lqFetch).toHaveBeenCalledWith(expect.anything(), '/api/v1/admin/tool-providers');
		expect(out.isAdmin).toBe(true);
		expect(out.sources).toHaveLength(1);
	});
	it('does not fetch for a non-admin', async () => {
		const out = (await load({ locals: { user: { is_admin: false } } } as never)) as {
			isAdmin: boolean;
			sources: unknown;
		};
		expect(out).toEqual({ isAdmin: false, sources: null });
		expect(lqFetch).not.toHaveBeenCalled();
	});
});

describe('/settings/research actions', () => {
	it('enable POSTs {type}', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		const r = await actions.enable(fd({ type: 'edgar' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers',
			expect.objectContaining({ method: 'POST', body: JSON.stringify({ type: 'edgar' }) })
		);
		expect(r).toEqual({ success: true, type: 'edgar' });
	});
	it('setKey POSTs {type, api_key}', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await actions.setKey(fd({ type: 'courtlistener', api_key: '  tok  ' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ type: 'courtlistener', api_key: 'tok' })
			})
		);
	});
	it('setKey with a blank key fails 400 without a call', async () => {
		const r = await actions.setKey(fd({ type: 'courtlistener', api_key: '   ' }));
		expect(lqFetch).not.toHaveBeenCalled();
		expect(r).toMatchObject({ status: 400, data: { type: 'courtlistener' } });
	});
	it('disable DELETEs the type', async () => {
		lqFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
		await actions.disable(fd({ type: 'edgar' }));
		expect(lqFetch).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/admin/tool-providers/edgar',
			expect.objectContaining({ method: 'DELETE' })
		);
	});
	it('maps 400 master-key, 404 unknown, 409 env-configured', async () => {
		lqFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'no master key' });
		expect(await actions.enable(fd({ type: 'edgar' }))).toMatchObject({ status: 400 });
		lqFetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
		expect(await actions.enable(fd({ type: 'edgar' }))).toMatchObject({ status: 404 });
		lqFetch.mockResolvedValue({ ok: false, status: 409, text: async () => '' });
		expect(await actions.disable(fd({ type: 'edgar' }))).toMatchObject({ status: 409 });
	});
});
