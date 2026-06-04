// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /automations/notifications/unread', () => {
  it('returns the unread total_count', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [], total_count: 4, limit: 1, offset: 0 }), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications?unread=true&limit=1');
    expect((await res.json()).unread).toBe(4);
  });
  it('returns 0 on backend failure (never errors)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const res = await GET(ev());
    expect((await res.json()).unread).toBe(0);
  });
});
