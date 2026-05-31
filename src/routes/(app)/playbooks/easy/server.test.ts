// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';
const ev = (body: unknown) => ({ request: new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /playbooks/easy', () => {
  it('forwards the body and returns the generation', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g1', status: 'pending' }), { status: 202 }));
    const res = await POST(ev({ document_ids: ['d1'], contract_type: 'NDA' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbooks/easy');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ document_ids: ['d1'], contract_type: 'NDA' });
    expect((await res.json()).id).toBe('g1');
  });
  it('maps a 404 (unowned/missing docs) through', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
    await expect(POST(ev({ document_ids: ['d1'], contract_type: 'NDA' }))).rejects.toMatchObject({ status: 404 });
  });
});
