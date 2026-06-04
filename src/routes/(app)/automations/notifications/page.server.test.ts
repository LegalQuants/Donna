// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

describe('/automations/notifications load', () => {
  it('reads the unread filter from the query and lists notifications', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      notifications: [{ id: 'n1', session_id: 's1', channel: 'in_app', title: 't', body: 'b', read_at: null, created_at: 'x' }],
      total_count: 1, limit: 50, offset: 0
    }), { status: 200 }));
    const ev = { url: new URL('http://x/automations/notifications?unread=true') } as never;
    const out = (await load(ev)) as { notifications: { id: string }[]; unreadOnly: boolean };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications?unread=true');
    expect(out.notifications[0].id).toBe('n1');
    expect(out.unreadOnly).toBe(true);
  });
  it('throws 502 on backend failure', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const ev = { url: new URL('http://x/automations/notifications') } as never;
    await expect(load(ev)).rejects.toMatchObject({ status: 502 });
  });
});

describe('mark-read action', () => {
  it('POSTs read for the submitted id', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const ev = { request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ id: 'n1' }) }) } as never;
    const out = await actions.markRead(ev);
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/notifications/n1/read');
    expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'POST' });
    expect(out).toMatchObject({ success: true });
  });
  it('fails 400 when the id is missing', async () => {
    const ev = { request: new Request('http://x', { method: 'POST', body: new URLSearchParams({}) }) } as never;
    await expect(actions.markRead(ev)).resolves.toMatchObject({ status: 400 });
  });
  it('fails 502 when the backend rejects the mark-read', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const ev = { request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ id: 'n1' }) }) } as never;
    await expect(actions.markRead(ev)).resolves.toMatchObject({ status: 502 });
  });
});
