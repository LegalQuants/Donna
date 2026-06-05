// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { PATCH } from './+server';

const event = (body: unknown) => ({ request: new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }) as never;

beforeEach(() => lqFetch.mockReset());

describe('PATCH /settings/preferences proxy', () => {
  it('forwards a known preference field and returns updated prefs', async () => {
    lqFetch.mockResolvedValue(new Response(JSON.stringify({ trust_pills: 'dots' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await PATCH(event({ trust_pills: 'dots' }));
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
    expect(lqFetch.mock.calls[0][2]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(lqFetch.mock.calls[0][2].body)).toEqual({ trust_pills: 'dots' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trust_pills: 'dots' });
  });

  it('rejects an unknown field with 400 without calling the backend', async () => {
    await expect(PATCH(event({ not_a_pref: 'x' }))).rejects.toMatchObject({ status: 400 });
    expect(lqFetch).not.toHaveBeenCalled();
  });

  it('maps a backend failure to 502', async () => {
    lqFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(PATCH(event({ provenance_pills: 'collapsed' }))).rejects.toMatchObject({ status: 502 });
  });

  it('forwards autonomous_enabled to the backend', async () => {
    lqFetch.mockResolvedValueOnce(new Response(JSON.stringify({ autonomous_enabled: true }), { status: 200 }));
    const ev = { request: new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autonomous_enabled: true }) }) } as never;
    const res = await PATCH(ev);
    expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/users/me/preferences');
    expect((await res.json()).autonomous_enabled).toBe(true);
  });
});
