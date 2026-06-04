// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
const ev = (id = 's1') => ({ params: { id } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/automations/[id] load', () => {
  it('returns the parsed session summary and receipt', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      session: { id: 's1', status: 'completed', trigger_kind: 'schedule', current_phase: 'delivery', cost_total_usd: '0.42', created_at: 'x' },
      receipt: { session_id: 's1', trigger_kind: 'schedule', status: 'completed', cost_total_usd: '0.42', phase_transitions: [], tool_calls: [], terminal_reason: 'completed' }
    }), { status: 200 }));
    const out = (await load(ev())) as { session: { id: string }; receipt: { terminal_reason: string } | null };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1');
    expect(out.session.id).toBe('s1');
    expect(out.receipt?.terminal_reason).toBe('completed');
  });
  it('passes a null receipt through (build failure) without erroring', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      session: { id: 's1', status: 'failed', trigger_kind: 'manual', current_phase: 'intake', cost_total_usd: '0', created_at: 'x', error: 'boom' },
      receipt: null
    }), { status: 200 }));
    const out = (await load(ev())) as { session: { error: string | null }; receipt: unknown };
    expect(out.receipt).toBeNull();
    expect(out.session.error).toBe('boom');
  });
  it('throws 404 for a missing/cross-user session', async () => {
    lqFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(load(ev())).rejects.toMatchObject({ status: 404 });
  });
});
