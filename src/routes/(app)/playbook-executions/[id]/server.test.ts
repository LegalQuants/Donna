// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = (id = 'e1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /playbook-executions/[id]', () => {
  it('passes through the execution JSON', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'e1', status: 'completed' }), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/playbook-executions/e1');
    expect((await res.json()).status).toBe('completed');
  });
  it('maps a 500 to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
  });
});
