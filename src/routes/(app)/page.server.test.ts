import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const cookies = () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() });
const startEvent = (fields: Record<string, string>) =>
  ({ request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }), cookies: cookies() }) as never;

beforeEach(() => lqFetch.mockReset());

describe('landing load', () => {
  it('loads active matters for the picker', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify([{ id: 'a', name: 'Acme', is_sandbox: false }]), { status: 200 }));
    const out = (await load({ cookies: cookies() } as never)) as { matters: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(out.matters.map((m) => m.id)).toEqual(['a']);
  });
});

describe('landing start action', () => {
  it('creates a matter-scoped chat when project_id is provided', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat1' }), { status: 201 }));
    await expect(actions.start(startEvent({ message: 'hi', project_id: 'p9' }))).rejects.toMatchObject({ status: 303, location: '/chats/chat1' });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ project_id: 'p9' });
  });

  it('creates a matter-less chat when project_id is empty', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'chat2' }), { status: 201 }));
    await expect(actions.start(startEvent({ message: 'hi', project_id: '' }))).rejects.toMatchObject({ status: 303 });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({});
  });
});
