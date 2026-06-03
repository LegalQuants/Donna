// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = () => ({ params: { id: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('POST /tabular-executions/[id]/cancel', () => {
  it('forwards the cancel and returns the updated execution', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'ex1', status: 'cancelled' }), { status: 200 }));
    const res = await POST(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/cancel');
    expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('POST');
    expect((await res.json()).status).toBe('cancelled');
  });

  it('passes 409 (already terminal) through', async () => {
    lqFetch.mockResolvedValue(new Response('terminal', { status: 409 }));
    await expect(POST(event())).rejects.toMatchObject({ status: 409 });
  });
});
