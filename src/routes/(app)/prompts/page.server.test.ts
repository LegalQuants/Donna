// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load } from './+page.server';
beforeEach(() => lqFetch.mockReset());

describe('/prompts load', () => {
  it('returns the saved-prompts list', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'p1', name: 'A', prompt_text: 'x' }]), { status: 200 }));
    const out = (await load({} as never)) as { prompts: { id: string }[] };
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/saved-prompts');
    expect(out.prompts[0].id).toBe('p1');
  });
  it('returns an empty list when the backend fails (page still renders)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const out = (await load({} as never)) as { prompts: unknown[] };
    expect(out.prompts).toEqual([]);
  });
});
