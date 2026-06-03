// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';

const ev = () => ({ params: { executionId: 'ex1' } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/tabular/[executionId] load', () => {
  it('loads the execution by id', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'ex1', status: 'running', columns: [{ name: 'Term', query: 'q' }], document_ids: [], document_names: [], created_at: '' }), { status: 200 }));
    const out = (await load(ev())) as { execution: { id: string } };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1');
    expect(out.execution.id).toBe('ex1');
  });

  it('throws 404 when the execution is missing', async () => {
    lqFetch.mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 404 });
  });
});
