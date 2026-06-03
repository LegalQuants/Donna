// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { POST } from './+server';

const event = (body: unknown) =>
  ({ request: new Request('http://x/tabular/preview-cost', { method: 'POST', body: JSON.stringify(body) }) }) as never;

beforeEach(() => lqFetch.mockReset());

describe('POST /tabular/preview-cost', () => {
  it('forwards the body and returns the backend JSON', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ cells_count: 6, estimated_tokens: 1200, estimated_cost_usd: '0.12', per_tier_breakdown: { default: 6 } }), { status: 200 }));
    const res = await POST(event({ document_ids: ['d1'], columns: [{ name: 'Term', query: 'q' }] }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/tabular/preview-cost');
    expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('POST');
    const json = await res.json();
    expect(json.cells_count).toBe(6);
  });

  it('maps a backend 500 to 502', async () => {
    lqFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(POST(event({ document_ids: [], columns: [] }))).rejects.toMatchObject({ status: 502 });
  });

  it('passes through 503', async () => {
    lqFetch.mockResolvedValue(new Response('down', { status: 503 }));
    await expect(POST(event({ document_ids: [], columns: [] }))).rejects.toMatchObject({ status: 503 });
  });

  it('maps a backend 404/422 (bad document) to a 400 with a document-specific message', async () => {
    lqFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400, body: { message: expect.stringMatching(/document/i) } });
    lqFetch.mockResolvedValue(new Response('unprocessable', { status: 422 }));
    await expect(POST(event({}))).rejects.toMatchObject({ status: 400 });
  });
});
