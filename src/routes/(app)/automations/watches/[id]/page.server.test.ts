// src/routes/(app)/automations/watches/[id]/page.server.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';
beforeEach(() => lqFetch.mockReset());

const ev = (id: string, fields?: Record<string, string>) =>
  ({
    params: { id },
    request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields ?? {}) })
  }) as never;

const w = { id: 'w1', knowledge_base_id: 'kb1', playbook_id: 'p1', skill_ref: null, project_id: null, max_cost_usd: null, enabled: true };

function loadMocks(found: boolean) {
  lqFetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 })) // isAutonomousEnabled
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // notifications (unreadCount)
    .mockResolvedValueOnce(new Response(JSON.stringify({ watches: found ? [w] : [] }), { status: 200 })) // watches
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', name: 'NDA' }]), { status: 200 })) // playbooks
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // user-skills
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // builtins
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'kb1', name: 'KB' }]), { status: 200 })) // kbs
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // matters
}

describe('/automations/watches/[id] load', () => {
  it('finds the watch by id', async () => {
    loadMocks(true);
    const out = (await load(ev('w1'))) as { watch: { id: string } };
    expect(out.watch.id).toBe('w1');
  });
  it('throws 404 when the id is not in the list', async () => {
    loadMocks(false);
    await expect(load(ev('missing'))).rejects.toMatchObject({ status: 404 });
  });
  it('throws 403 when not opted in', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: false }), { status: 200 }));
    await expect(load(ev('w1'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('/automations/watches/[id] update', () => {
  it('PATCHes (no KB/matter) and redirects to the list', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'w1' }), { status: 200 }));
    await expect(actions.update(ev('w1', { source_mode: 'playbook', playbook_id: 'p1', knowledge_base_id: 'kb1', project_id: 'm1', enabled: 'false' })))
      .rejects.toMatchObject({ status: 303, location: '/automations/watches' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/autonomous/watches/w1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    const body = JSON.parse(lqFetch.mock.calls[0][2].body);
    expect(body).toEqual({ enabled: false, playbook_id: 'p1' }); // KB + project omitted (immutable)
  });
  it('fails 400 without a source', async () => {
    const out = await actions.update(ev('w1', { source_mode: 'playbook' }));
    expect(out).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });
  it('maps a 404 to not-found', async () => {
    lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const out = await actions.update(ev('w1', { source_mode: 'playbook', playbook_id: 'p1' }));
    expect(out).toMatchObject({ status: 404 });
  });
});
