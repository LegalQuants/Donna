// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (format?: string) =>
  ({ params: { id: 'ex1' }, url: new URL(`http://x/tabular-executions/ex1/export${format ? `?format=${format}` : ''}`) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /tabular-executions/[id]/export', () => {
  it('streams the binary with an attachment disposition (default xlsx)', async () => {
    lqFetch.mockResolvedValue(new Response('PK', { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/export?format=xlsx');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
  });

  it('passes the csv format through', async () => {
    lqFetch.mockResolvedValue(new Response('a,b', { status: 200, headers: { 'content-type': 'text/csv' } }));
    await GET(event('csv'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/executions/ex1/export?format=csv');
  });

  it('maps a 409 (not completed) through', async () => {
    lqFetch.mockResolvedValue(new Response('not done', { status: 409 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 409 });
  });
});
