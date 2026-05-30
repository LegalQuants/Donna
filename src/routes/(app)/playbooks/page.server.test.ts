// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/playbooks load', () => {
  it('GETs the playbook list and returns it', async () => {
    const list = [{ id: 'pb1', name: 'NDA — Mutual', contract_type: 'NDA', version: '1.0.0' }];
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(list), { status: 200 }));
    const out = (await load(ev())) as { playbooks: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
    expect(out.playbooks).toHaveLength(1);
    expect(out.playbooks[0].id).toBe('pb1');
  });
  it('throws 502 on a backend failure', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 502 });
  });
});
