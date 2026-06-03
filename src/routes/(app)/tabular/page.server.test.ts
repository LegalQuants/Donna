// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const event = {} as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular history load', () => {
  it('requests the executions list and returns the summaries', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify([{ id: 'ex1', status: 'completed', document_count: 2, column_count: 1, created_at: '2026-05-01T00:00:00Z' }]), { status: 200 })
    );
    const out = (await load(event)) as { executions: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions?limit=50');
    expect(out.executions).toHaveLength(1);
    expect(out.executions[0].id).toBe('ex1');
  });

  it('throws 502 when the backend list call fails', async () => {
    lqFetch.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(load(event)).rejects.toMatchObject({ status: 502 });
  });
});
