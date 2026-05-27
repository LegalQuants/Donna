import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const project = (over = {}) => ({ id: 'p1', name: 'Acme', slug: 'acme', description: null, is_sandbox: false, archived_at: null, ...over });
const formEvent = (fields: Record<string, string>) =>
  ({ request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }) }) as never;
const loadEvent = () => ({}) as never;

beforeEach(() => lqFetch.mockReset());

describe('/matters load', () => {
  it('loads active matters (sandbox filtered out)', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify([project({ id: 'a' }), project({ id: 'b', is_sandbox: true })]), { status: 200 }));
    const out = (await load(loadEvent())) as { matters: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(out.matters.map((m) => m.id)).toEqual(['a']);
  });
});

describe('/matters create action', () => {
  it('rejects an empty name without calling the backend', async () => {
    const r = await actions.create(formEvent({ name: '   ' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('POSTs the matter and redirects to its detail page', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new1' })), { status: 201 }));
    await expect(actions.create(formEvent({ name: 'Acme MSA', description: 'engagement' }))).rejects.toMatchObject({ status: 303, location: '/matters/new1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: 'engagement' });
  });
});
