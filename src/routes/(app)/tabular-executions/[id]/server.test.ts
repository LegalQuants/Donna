// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({ params: { id: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /tabular-executions/[id]', () => {
  it('forwards to the backend execution endpoint', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'ex1', status: 'running' }), { status: 200 }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1');
    expect((await res.json()).status).toBe('running');
  });

  it('maps 404 to 404 and 500 to 502', async () => {
    lqFetch.mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 404 });
    lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 502 });
  });
});
