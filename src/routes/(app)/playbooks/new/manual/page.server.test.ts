// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const loadEv = (search = '') => ({ url: new URL(`http://x/playbooks/new/manual${search}`) }) as never;
const saveEv = (draft: unknown) => {
  const body = new URLSearchParams(); body.append('draft', JSON.stringify(draft));
  return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

describe('/playbooks/new/manual load', () => {
  it('returns a blank draft with no ?from', async () => {
    const out = (await load(loadEv())) as { initial: { name: string; positions: unknown[] } };
    expect(out.initial.name).toBe('');
    expect(out.initial.positions).toHaveLength(1);
    expect(lqFetch).not.toHaveBeenCalled();
  });
  it('prefills a "Copy of" draft from ?from', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb1', name: 'NDA-Mutual', contract_type: 'NDA', version: '1.0.0', created_by: null, positions: [{ id: 'p1', issue: 'X', standard_language: 'L', severity_if_missing: 'high', position_order: 0 }] }), { status: 200 }));
    const out = (await load(loadEv('?from=pb1'))) as { initial: { name: string; positions: { issue: string }[] } };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/pb1');
    expect(out.initial.name).toBe('Copy of NDA-Mutual');
    expect(out.initial.positions[0].issue).toBe('X');
  });
});

describe('/playbooks/new/manual ?/save', () => {
  it('POSTs the draft and redirects to the new playbook', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pb9' }), { status: 201 }));
    const draft = { name: 'My NDA', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    await expect(actions.save(saveEv(draft))).rejects.toMatchObject({ status: 303, location: '/playbooks/pb9' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).name).toBe('My NDA');
  });
  it('fails when there are no positions', async () => {
    const r = await actions.save(saveEv({ name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [] }));
    expect(r).toMatchObject({ status: 400 });
  });
  it('maps a 422 to an inline error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
    const draft = { name: 'X', contract_type: 'NDA', version: '1.0.0', positions: [{ issue: 'X', standard_language: 'L', severity_if_missing: 'high' }] };
    expect(await actions.save(saveEv(draft))).toMatchObject({ status: 422 });
  });
});
