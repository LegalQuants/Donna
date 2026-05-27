import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (id = 'f1') => ({ params: { id } }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /files/[id]', () => {
  it('proxies the file-metadata endpoint and returns the body', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf' }), { status: 200 }));
    const res = await GET(event('f1'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/files/f1');
    expect(await res.json()).toEqual({ id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf' });
  });

  it('passes through 404 (missing/cross-user file)', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 404 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 404 });
  });

  it('passes through 503/504 and maps other errors to 502', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 503 });
    lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 504 });
    lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 502 });
  });
});
