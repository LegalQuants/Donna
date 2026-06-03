// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
  ({ request: new Request('http://x/tabular/execute', { method: 'POST', body: JSON.stringify(body) }) }) as never;

beforeEach(() => lqFetch.mockReset());

describe('POST /tabular/execute', () => {
  it('forwards the body and returns the created execution', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'ex1', status: 'pending' }), { status: 202 }));
    const res = await POST(event({ document_ids: ['d1'], columns: [{ name: 'Term', query: 'q' }], confirmed_cost_usd: '0.12' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/execute');
    const json = await res.json();
    expect(json.id).toBe('ex1');
  });

  it('maps a backend 400 to 502 (and passes 503/504)', async () => {
    lqFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 502 });
    lqFetch.mockResolvedValue(new Response('to', { status: 504 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 504 });
  });

  it('maps a backend 404/422 (bad document) to a 400 with a document-specific message', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400, body: { message: expect.stringMatching(/document/i) } });
    lqFetch.mockResolvedValue(new Response('unprocessable', { status: 422 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400 });
  });
});
