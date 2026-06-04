import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionPoll } from './pollSession.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function mockFetchSequence(statuses: string[]) {
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return new Response(JSON.stringify({
      session: { id: 's1', status, trigger_kind: 'manual', current_phase: 'analysis', cost_total_usd: '0.1', created_at: 'x' },
      receipt: { session_id: 's1', trigger_kind: 'manual', status, phase_transitions: [], tool_calls: [] }
    }), { status: 200 });
  }));
}

function fetchCalls(): number {
  return (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe('createSessionPoll', () => {
  it('stops polling once the session reaches a terminal status', async () => {
    mockFetchSequence(['running', 'running', 'completed']);
    const poll = createSessionPoll('s1', { pollMs: 1000 });
    poll.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(poll.session?.status).toBe('completed');
    expect(poll.done).toBe(true);
    expect(poll.error).toBeNull();
    const callsAtStop = fetchCalls();
    expect(callsAtStop).toBe(3); // tick at t=0, 1000, 2000 → terminal
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchCalls()).toBe(callsAtStop); // no further polling
  });

  it('does not mark done when stopped before a terminal status', async () => {
    mockFetchSequence(['running']); // never terminal
    const poll = createSessionPoll('s1', { pollMs: 1000 });
    poll.start();
    await vi.advanceTimersByTimeAsync(1500);
    poll.stop();
    await vi.advanceTimersByTimeAsync(2000); // let the in-flight sleep resolve and the loop exit
    expect(poll.session?.status).toBe('running');
    expect(poll.done).toBe(false);
    expect(poll.error).toBeNull();
  });
});
