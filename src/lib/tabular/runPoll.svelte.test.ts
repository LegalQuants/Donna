import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunPoll } from './runPoll.svelte';
import type { TabularExecution } from './types';

const exec = (status: string): TabularExecution =>
  ({ id: 'ex1', status, document_ids: [], document_names: [], columns: [], created_at: '' }) as TabularExecution;
const res = (status: string) => new Response(JSON.stringify(exec(status)), { status: 200 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createRunPoll', () => {
  it('does not poll when seeded with a terminal execution', async () => {
    const f = vi.fn();
    const p = createRunPoll('ex1', exec('completed'));
    p.start(f);
    await vi.advanceTimersByTimeAsync(4000);
    expect(f).not.toHaveBeenCalled();
    expect(p.status).toBe('completed');
    p.stop();
  });

  it('polls until a terminal status then stops', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(res('running'))
      .mockResolvedValueOnce(res('completed'));
    const p = createRunPoll('ex1', exec('pending'));
    p.start(f);
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.status).toBe('running');
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.status).toBe('completed');
    const calls = f.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.mock.calls.length).toBe(calls); // stopped
    expect(f.mock.calls[0][0]).toBe('/tabular-executions/ex1');
    p.stop();
  });

  it('flags stuck after 5 minutes without reaching terminal', async () => {
    const f = vi.fn().mockResolvedValue(res('running'));
    const p = createRunPoll('ex1', exec('pending'));
    p.start(f);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 2000);
    expect(p.stuck).toBe(true);
    p.stop();
  });
});
