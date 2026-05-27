import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const ev = (fields: Record<string, string> = {}, id = 'p1') =>
  ({ params: { id }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;
const loadEv = (id = 'p1') => ({ params: { id } }) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters/[id] load', () => {
  it('loads the matter and its chats', async () => {
    lqFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Acme', description: 'd' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'c1', title: 'Chat 1', message_count: 3 }] }), { status: 200 }));
    const out = (await load(loadEv())) as { matter: { name: string }; chats: unknown[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/chats?project_id=p1');
    expect(out.matter.name).toBe('Acme');
    expect(out.chats).toHaveLength(1);
  });
});

describe('/matters/[id] actions', () => {
  it('rename rejects an empty name without calling the backend', async () => {
    const r = await actions.rename(ev({ name: '  ' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('rename PATCHes name + description', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await actions.rename(ev({ name: 'Renamed', description: 'x' }));
    expect(lqFetch.mock.calls[0][0]).toBeDefined();
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects/p1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Renamed', description: 'x' });
    expect(r).toMatchObject({ success: true });
  });

  it('archive DELETEs and redirects to /matters', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(actions.archive(ev())).rejects.toMatchObject({ status: 303, location: '/matters' });
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
  });

  it('newChat POSTs a project-scoped chat and redirects to it', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chatX' }), { status: 201 }));
    await expect(actions.newChat(ev())).rejects.toMatchObject({ status: 303, location: '/chats/chatX' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/chats');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p1' });
  });
});
