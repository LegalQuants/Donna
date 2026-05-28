import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const project = (over = {}) => ({ id: 'p1', name: 'Acme', slug: 'acme', description: null, privileged: false, minimum_inference_tier: null, is_sandbox: false, archived_at: null, ...over });
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

  it('POSTs the matter (non-privileged, no tier) and redirects to its detail page', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new1' })), { status: 201 }));
    await expect(actions.create(formEvent({ name: 'Acme MSA', description: 'engagement' }))).rejects.toMatchObject({ status: 303, location: '/matters/new1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/projects');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: 'engagement', privileged: false });
  });

  it('POSTs privileged=true + minimum_inference_tier when both are set', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new2' })), { status: 201 }));
    await expect(
      actions.create(formEvent({ name: 'Acme MSA', description: '', privileged: 'on', minimum_inference_tier: '4' }))
    ).rejects.toMatchObject({ status: 303, location: '/matters/new2' });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: '', privileged: true, minimum_inference_tier: 4 });
  });

  it('POSTs minimum_inference_tier without privileged when only the tier is set', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify(project({ id: 'new3' })), { status: 201 }));
    await expect(
      actions.create(formEvent({ name: 'Acme MSA', description: '', minimum_inference_tier: '2' }))
    ).rejects.toMatchObject({ status: 303 });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'Acme MSA', description: '', privileged: false, minimum_inference_tier: 2 });
  });

  it('pre-checks privileged-without-tier without calling the backend', async () => {
    const r = await actions.create(formEvent({ name: 'Acme MSA', privileged: 'on' }));
    expect(r).toMatchObject({ status: 422, data: { error: 'Privileged matters require a minimum tier.' } });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('maps a backend 422 to the privilege error message', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 422 }));
    const r = await actions.create(formEvent({ name: 'Acme MSA', privileged: 'on', minimum_inference_tier: '4' }));
    expect(r).toMatchObject({ status: 422, data: { error: 'Privileged matters require a minimum tier.' } });
  });

  it('maps other backend failures to the generic create error', async () => {
    lqFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const r = await actions.create(formEvent({ name: 'Acme MSA' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not create the matter.' } });
  });
});
