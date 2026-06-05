// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/automations load', () => {
  it('GETs sessions + unread count and returns parsed data', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [{ id: 's1', status: 'completed', trigger_kind: 'schedule', current_phase: 'delivery', cost_total_usd: '0.42', created_at: 'x' }], total_count: 1, limit: 50, offset: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [], total_count: 2, limit: 1, offset: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 }));
    const out = (await load(ev())) as { sessions: { id: string }[]; unread: number; autonomousEnabled: boolean };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions');
    expect(out.sessions[0].id).toBe('s1');
    expect(out.unread).toBe(2);
    expect(out.autonomousEnabled).toBe(true);
  });
  it('throws 502 when the sessions list fails', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 502 });
  });
  it('tolerates a failing unread count (defaults to 0)', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [], total_count: 0, limit: 50, offset: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 }));
    const out = (await load(ev())) as { unread: number };
    expect(out.unread).toBe(0);
  });
});
