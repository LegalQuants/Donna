// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

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
