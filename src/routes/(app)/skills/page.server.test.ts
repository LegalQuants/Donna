// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { actions, load } from './+page.server';

const loadEv = () => ({}) as never;
const formEv = (fields: Record<string, string | string[]>) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
    else body.append(k, v);
  }
  return { request: new Request('http://x', { method: 'POST', body }) } as never;
};
beforeEach(() => lqFetch.mockReset());

const skill = (over: Record<string, unknown> = {}) => ({
  id: 's1', scope: 'user', slug: 'nda', display_name: 'NDA', description: '', version: '1.0.0',
  body: 'b', archived_at: null, created_at: '', updated_at: '', ...over
});

describe('/skills load', () => {
  it('GETs user-skills?scope=user and returns active skills', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([
      skill({ id: 's1' }), skill({ id: 's2', archived_at: '2026-01-01T00:00:00Z' })
    ]), { status: 200 }));
    const out = (await load(loadEv())) as { skills: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills?scope=user');
    expect(out.skills.map((s) => s.id)).toEqual(['s1']); // archived filtered out
  });

  it('throws 502 when the backend fails', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(load(loadEv())).rejects.toMatchObject({ status: 502 });
  });
});

describe('/skills ?/create', () => {
  it('POSTs a UserSkillCreate and redirects to the new skill', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill({ id: 'new1' })), { status: 201 }));
    await expect(actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B', tags: ['a', 'b'], slash_alias: '/nda' })))
      .rejects.toMatchObject({ status: 303, location: '/skills/new1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/user-skills');
    expect(lqFetch.mock.calls[0][2].method).toBe('POST');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({
      slug: 'nda', display_name: 'NDA', description: 'x', body: 'B', version: '1.0.0', scope: 'user', tags: ['a', 'b'], slash_alias: '/nda'
    });
  });

  it('omits slash_alias when blank', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(skill({ id: 'new1' })), { status: 201 }));
    await expect(actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B' }))).rejects.toMatchObject({ status: 303 });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body).slash_alias).toBeUndefined();
  });

  it('rejects a missing display_name / slug / body without calling the backend', async () => {
    const r = await actions.create(formEv({ display_name: '', slug: '', body: '' }));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('maps 409 to an inline slug error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B' }));
    expect(r).toMatchObject({ status: 409, data: { field: 'slug', error: 'A skill with that name already exists.' } });
  });

  it('maps a slash_alias 422 to an inline slash_alias error', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "slash_alias '/nda' is already used by another of your skills." }), { status: 422 }));
    const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B', slash_alias: '/nda' }));
    expect(r).toMatchObject({ status: 422, data: { field: 'slash_alias' } });
  });

  it('maps a non-slash_alias 422 to a general error', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: [{ loc: ['body', 'description'] }] }), { status: 422 }));
    const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B' }));
    expect(r).toMatchObject({ status: 422 });
    expect((r as { data?: { field?: string } }).data?.field).toBeUndefined();
  });

  it('maps other failures to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.create(formEv({ display_name: 'NDA', slug: 'nda', description: 'x', body: 'B' }));
    expect(r).toMatchObject({ status: 502 });
  });
});

describe('/skills ?/fork', () => {
  it('POSTs to /skills/{name}/fork and redirects to the new skill', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'fork1', name: 'contract-review' }), { status: 201 }));
    await expect(actions.fork(formEv({ skill_name: 'contract-review', new_name: 'My Contract Review' })))
      .rejects.toMatchObject({ status: 303, location: '/skills/fork1' });
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills/contract-review/fork');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ scope: 'user', new_name: 'My Contract Review' });
  });

  it('omits new_name when blank', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'fork1' }), { status: 201 }));
    await expect(actions.fork(formEv({ skill_name: 'contract-review' }))).rejects.toMatchObject({ status: 303 });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ scope: 'user' });
  });

  it('rejects a missing skill_name', async () => {
    const r = await actions.fork(formEv({}));
    expect(r).toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('maps 409 to a friendly already-forked error', async () => {
    lqFetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const r = await actions.fork(formEv({ skill_name: 'contract-review' }));
    expect(r).toMatchObject({ status: 409, data: { error: 'You already have a skill forked from this one.' } });
  });

  it('redirects to /skills when the fork response has no id', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: null }), { status: 201 }));
    await expect(actions.fork(formEv({ skill_name: 'contract-review' }))).rejects.toMatchObject({ status: 303, location: '/skills' });
  });

  it('maps other fork failures to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await actions.fork(formEv({ skill_name: 'contract-review' }));
    expect(r).toMatchObject({ status: 502, data: { error: 'Could not fork the skill.' } });
  });
});
