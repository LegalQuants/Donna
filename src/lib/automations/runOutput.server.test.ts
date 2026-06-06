// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { loadRunOutput } from './runOutput.server';
const ev = {} as never;
beforeEach(() => lqFetch.mockReset());

const findingsBody = { findings: [{ id: 'f1', severity: 'info', title: 'T', content: 'C', created_at: 'x' }], total_count: 1 };
const memoriesBody = { entries: [{ id: 'm1', state: 'proposed', category: 'pref', content: 'M', created_at: 'y' }], total_count: 1 };

describe('loadRunOutput', () => {
  it('fetches findings + memories in parallel and returns parsed output', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/sessions/s1/findings?limit=200');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/autonomous/memory?source_session_id=s1&limit=200');
    expect(out.findings).toHaveLength(1);
    expect(out.findings_total).toBe(1);
    expect(out.memories).toHaveLength(1);
  });
  it('degrades a failed findings fetch to null without touching memories', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(memoriesBody), { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toBeNull();
    expect(out.findings_total).toBeNull();
    expect(out.memories).toHaveLength(1);
  });
  it('degrades a failed memories fetch to null without touching findings', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(findingsBody), { status: 200 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toHaveLength(1);
    expect(out.memories).toBeNull();
  });
  it('degrades non-JSON bodies to null', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    const out = await loadRunOutput(ev, 's1');
    expect(out.findings).toBeNull();
    expect(out.memories).toBeNull();
  });
});
