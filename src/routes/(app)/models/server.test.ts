import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = () => ({}) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET /models', () => {
  it('proxies the models endpoint and returns the body', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/models');
    expect(await res.json()).toEqual({ object: 'list', data: [] });
  });

  it('passes through 503 (gateway unreachable)', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 503 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 503 });
  });

  it('passes through 504 (gateway timeout)', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 504 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 504 });
  });

  it('maps other errors to 502', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 500 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 502 });
  });
});
