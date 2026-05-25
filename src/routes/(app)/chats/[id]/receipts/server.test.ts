import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const event = (qs = '') =>
  ({ params: { id: 'c1' }, url: new URL(`http://x/chats/c1/receipts${qs}`) }) as any;

beforeEach(() => lqFetch.mockReset());

describe('GET receipts', () => {
  it('proxies the receipts endpoint', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify([{ ts: 't', kind: 'message', detail: {} }]), { status: 200 }));
    const res = await GET(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts');
    expect(await res.json()).toHaveLength(1);
  });
  it('forwards the event_kinds filter', async () => {
    lqFetch.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(event('?event_kinds=inference'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats/c1/receipts?event_kinds=inference');
  });
  it('maps 403 to 403', async () => {
    lqFetch.mockResolvedValue(new Response('no', { status: 403 }));
    await expect(GET(event())).rejects.toMatchObject({ status: 403 });
  });
});
