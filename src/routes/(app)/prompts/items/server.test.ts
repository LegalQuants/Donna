// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET, POST } from './+server';

const postEv = (body: unknown) => ({ request: new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }) as never;
beforeEach(() => lqFetch.mockReset());

describe('GET /prompts/items', () => {
  it('passes through the saved-prompts list', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', name: 'A', prompt_text: 'x' }]), { status: 200 }));
    const res = await GET({} as never);
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
    expect((await res.json())[0].id).toBe('p1');
  });
  it('maps a backend failure to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(GET({} as never)).rejects.toMatchObject({ status: 502 });
  });
});

describe('POST /prompts/items', () => {
  it('forwards the create body and returns the created prompt', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p9', name: 'New', prompt_text: 'hi' }), { status: 201 }));
    const res = await POST(postEv({ name: 'New', prompt_text: 'hi', tags: ['t'] }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
    expect(lqFetch.mock.calls[0][2].method).toBe('POST');
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ name: 'New', prompt_text: 'hi', tags: ['t'] });
    expect((await res.json()).id).toBe('p9');
  });
  it('maps a 422 through', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 422 }));
    await expect(POST(postEv({ name: '', prompt_text: '' }))).rejects.toMatchObject({ status: 422 });
  });
});
