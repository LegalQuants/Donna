// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (id = 's1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('GET /automations/[id]', () => {
  it('passes through the session detail JSON', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 's1', status: 'running' }, receipt: null }), { status: 200 }));
    lqFetch.mockResolvedValueOnce(okJson({ findings: [], total_count: 0 }));
    lqFetch.mockResolvedValueOnce(okJson({ entries: [], total_count: 0 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
    const body = await res.json();
    expect(body.session.status).toBe('running');
    expect(body.findings).toEqual([]);
    expect(body.findings_total).toBe(0);
    expect(body.memories).toEqual([]);
  });
  it('maps a 404 to 404 and a 500 to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    lqFetch.mockResolvedValue(new Response('x', { status: 404 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 404 });
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    lqFetch.mockResolvedValue(new Response('x', { status: 404 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
  });
});
