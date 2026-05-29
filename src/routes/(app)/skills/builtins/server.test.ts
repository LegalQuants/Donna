// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { GET } from './+server';

const ev = () => ({}) as never;
beforeEach(() => lqFetch.mockReset());

describe('/skills/builtins GET', () => {
  it('proxies GET /api/v1/skills?scope=builtin and returns the JSON', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ name: 'contract-review', title: 'Contract Review', version: '1.0.0', scope: 'builtin' }]), { status: 200 }));
    const res = await GET(ev());
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/skills?scope=builtin');
    const body = (await res.json()) as { name: string }[];
    expect(body[0].name).toBe('contract-review');
  });

  it('maps a 500 to 502', async () => {
    lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 502 });
  });

  it('passes through 503 (gateway unreachable)', async () => {
    lqFetch.mockResolvedValueOnce(new Response('down', { status: 503 }));
    await expect(GET(ev())).rejects.toMatchObject({ status: 503 });
  });
});
