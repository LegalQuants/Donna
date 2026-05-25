import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lqFetch } from './lqClient';
import { AT_COOKIE, RT_COOKIE } from './session';

function eventWith(cookies: Record<string, string>) {
  const store = { ...cookies };
  return {
    store,
    cookies: {
      get: (n: string) => store[n],
      set: (n: string, v: string) => { store[n] = v; },
      delete: (n: string) => { delete store[n]; }
    }
  } as any;
}

describe('lqFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('attaches Bearer and returns non-401 responses directly', async () => {
    (fetch as any).mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(200);
    const init = (fetch as any).mock.calls[0][1];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer AT1');
  });

  it('refreshes once on 401, rotates cookies, retries', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 900 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(e.store[AT_COOKIE]).toBe('AT2');
    expect(e.store[RT_COOKIE]).toBe('RT2');
    expect((fetch as any).mock.calls).toHaveLength(3);
  });

  it('clears cookies and returns the 401 when refresh fails', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(e.store[AT_COOKIE]).toBeUndefined();
  });
});
