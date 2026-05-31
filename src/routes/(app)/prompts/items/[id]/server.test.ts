// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH, DELETE } from './+server';

const ev = (method: string, body?: unknown) => ({
  params: { id: 'p1' },
  request: new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}) as never;
beforeEach(() => lqFetch.mockReset());

describe('PATCH /prompts/items/[id]', () => {
  it('forwards the patch and returns the updated prompt', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p1', name: 'Renamed', prompt_text: 'x' }), { status: 200 }));
    const res = await PATCH(ev('PATCH', { name: 'Renamed' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts/p1');
    expect(lqFetch.mock.calls[0][2].method).toBe('PATCH');
    expect((await res.json()).name).toBe('Renamed');
  });
  it('maps a 422 through', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
    await expect(PATCH(ev('PATCH', { name: '' }))).rejects.toMatchObject({ status: 422 });
  });
  it('maps a 404 through', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
    await expect(PATCH(ev('PATCH', { name: 'X' }))).rejects.toMatchObject({ status: 404 });
  });
  it('maps a non-422/404 failure to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(PATCH(ev('PATCH', { name: 'X' }))).rejects.toMatchObject({ status: 502 });
  });
});

describe('DELETE /prompts/items/[id]', () => {
  it('deletes and returns 204', async () => {
    lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const res = await DELETE(ev('DELETE'));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts/p1');
    expect(lqFetch.mock.calls[0][2].method).toBe('DELETE');
    expect(res.status).toBe(204);
  });
  it('treats a 404 as already-gone (204)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const res = await DELETE(ev('DELETE'));
    expect(res.status).toBe(204);
  });
  it('maps a non-404 failure to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(DELETE(ev('DELETE'))).rejects.toMatchObject({ status: 502 });
  });
});
