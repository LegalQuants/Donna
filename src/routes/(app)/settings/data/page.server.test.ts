// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
const clearSessionCookies = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
vi.mock('$lib/server/session', () => ({ clearSessionCookies: (...a: unknown[]) => clearSessionCookies(...a) }));
import { actions } from './+page.server';

const event = () => ({}) as never;

beforeEach(() => {
  lqFetch.mockReset();
  clearSessionCookies.mockReset();
});

describe('requestExport action', () => {
  it('POSTs and returns the job on 202', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'j1', status: 'queued', download_url: null }), { status: 202 })
    );
    const r = await actions.requestExport(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/export');
    expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'POST' });
    expect(r).toEqual({ export: { job_id: 'j1', status: 'queued', download_url: null } });
  });

  it('maps a failure to a 502 inline error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.requestExport(event());
    expect(r).toMatchObject({ status: 502, data: { exportError: expect.stringMatching(/could not start/i) } });
  });
});

describe('requestDeletion action', () => {
  it('POSTs, clears session cookies, and returns the schedule on 202', async () => {
    lqFetch.mockResolvedValue(
      new Response(JSON.stringify({ scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 }), { status: 202 })
    );
    const r = await actions.requestDeletion(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/delete');
    expect(clearSessionCookies).toHaveBeenCalledOnce();
    expect(r).toEqual({ deletion: { scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 } });
  });

  it('maps a failure to a 502 and does NOT clear cookies', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.requestDeletion(event());
    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 502, data: { deleteError: expect.stringMatching(/could not schedule/i) } });
  });
});

describe('cancelDeletion action', () => {
  it('returns cancelled on 204', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await actions.cancelDeletion(event());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/delete/cancel');
    expect(r).toEqual({ cancelled: true });
  });

  it('maps 400 (nothing pending) to a friendly message', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 400 }));
    const r = await actions.cancelDeletion(event());
    expect(r).toMatchObject({ status: 400, data: { cancelMessage: expect.stringMatching(/no scheduled deletion/i) } });
  });

  it('maps other failures to a 502 retry error', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const r = await actions.cancelDeletion(event());
    expect(r).toMatchObject({ status: 502, data: { cancelError: expect.stringMatching(/could not cancel/i) } });
  });
});
