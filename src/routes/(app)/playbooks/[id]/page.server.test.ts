// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ev = (id = 'pb1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/[id] load', () => {
  it('GETs the playbook by id', async () => {
    const playbook = { id: 'pb1', name: 'DPA — GDPR', contract_type: 'DPA-GDPR', version: '1.0.0', positions: [] };
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(playbook), { status: 200 }));
    const out = (await load(ev())) as { playbook: { id: string } };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(out.playbook.id).toBe('pb1');
  });
  it('throws 404 when the playbook is missing', async () => {
    lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 404 });
  });
  it('throws 502 on other backend failures', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 502 });
  });
  it('returns isAdmin from locals', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', positions: [] }), { status: 200 }));
    const out = (await load({ params: { id: 'pb1' }, locals: { user: { is_admin: true } } } as never)) as { isAdmin: boolean };
    expect(out.isAdmin).toBe(true);
  });
});

describe('/playbooks/[id] ownership + delete', () => {
  it('marks isOwner true when created_by matches the user', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', created_by: 'u1', positions: [] }), { status: 200 }));
    const out = (await load({ params: { id: 'pb1' }, locals: { user: { id: 'u1', is_admin: false } } } as never)) as { isOwner: boolean };
    expect(out.isOwner).toBe(true);
  });
  it('marks isOwner false for a built-in (created_by null)', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'p', contract_type: 'NDA', created_by: null, positions: [] }), { status: 200 }));
    const out = (await load({ params: { id: 'pb1' }, locals: { user: { id: 'u1', is_admin: true } } } as never)) as { isOwner: boolean };
    expect(out.isOwner).toBe(false);
  });
  it('?/delete DELETEs and redirects to the index', async () => {
    lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(actions.delete({ params: { id: 'pb1' } } as never)).rejects.toMatchObject({ status: 303, location: '/playbooks' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });
  it('?/delete maps 403 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
    expect(await actions.delete({ params: { id: 'pb1' } } as never)).toMatchObject({ status: 403 });
  });
  it('?/delete treats a 404 as already-gone and still redirects', async () => {
    lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
    await expect(actions.delete({ params: { id: 'pb1' } } as never)).rejects.toMatchObject({ status: 303, location: '/playbooks' });
  });
});
