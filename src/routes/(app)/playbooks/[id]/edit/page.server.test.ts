// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ownedPb = {
	id: 'pb1',
	name: 'Mine',
	contract_type: 'NDA',
	version: '1.0.0',
	created_by: 'u1',
	positions: [
		{ id: 'p1', issue: 'X', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }
	]
};
const loadEv = (
	user: unknown,
	pb: Omit<typeof ownedPb, 'created_by'> & { created_by: string | null } = ownedPb
) => {
	lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(pb), { status: 200 }));
	return { params: { id: 'pb1' }, locals: { user } } as never;
};
const saveEv = (draft: unknown) => {
	const body = new URLSearchParams();
	body.append('draft', JSON.stringify(draft));
	return {
		params: { id: 'pb1' },
		request: new Request('http://x', { method: 'POST', body })
	} as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id]/edit load', () => {
	it('returns the normalized draft for the owner', async () => {
		const out = (await load(loadEv({ id: 'u1', is_admin: false }))) as {
			initial: { name: string };
			name: string;
		};
		expect(out.initial.name).toBe('Mine');
		expect(out.name).toBe('Mine');
	});
	it('403s for a non-owner', async () => {
		await expect(load(loadEv({ id: 'other', is_admin: false }))).rejects.toMatchObject({
			status: 403
		});
	});
	it('403s for a built-in (created_by null) even for an admin', async () => {
		await expect(
			load(loadEv({ id: 'u1', is_admin: true }, { ...ownedPb, created_by: null }))
		).rejects.toMatchObject({ status: 403 });
	});
});

describe('/playbooks/[id]/edit ?/save', () => {
	it('PATCHes the full draft and redirects to detail', async () => {
		lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const draft = {
			name: 'Mine v2',
			contract_type: 'NDA',
			version: '1.0.0',
			positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }]
		};
		await expect(actions.save(saveEv(draft))).rejects.toMatchObject({
			status: 303,
			location: '/playbooks/pb1'
		});
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
		expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
		expect(JSON.parse(lqFetch.mock.calls[0][2].body).positions).toHaveLength(1);
	});
	it('maps a 403 to an inline error', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
		const draft = {
			name: 'X',
			contract_type: 'NDA',
			version: '1.0.0',
			positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }]
		};
		expect(await actions.save(saveEv(draft))).toMatchObject({ status: 403 });
	});
});
