import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { lqFetch } from './lqClient';
import { AT_COOKIE, RT_COOKIE } from './session';

function eventWith(cookies: Record<string, string>) {
  const store = { ...cookies };
  return {
    store,
    cookies: {
      get: (n: string) => store[n],
      set: (n: string, v: string) => {
        store[n] = v;
      },
      delete: (n: string) => {
        delete store[n];
      }
    }
  } as unknown as RequestEvent & { store: Record<string, string> };
}

describe('lqFetch', () => {
  let fetchMock: MockedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches Bearer and returns non-401 responses directly', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(200);
    const init = fetchMock.mock.calls[0][1]!;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer AT1');
  });

  it('refreshes once on 401, rotates cookies, retries', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 900 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(e.store[AT_COOKIE]).toBe('AT2');
    expect(e.store[RT_COOKIE]).toBe('RT2');
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it('clears cookies and returns the 401 when refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1', [RT_COOKIE]: 'RT1' });
    const res = await lqFetch(e, '/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(e.store[AT_COOKIE]).toBeUndefined();
  });

  it('defaults a JSON body to content-type: application/json when none is set', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1' });
    await lqFetch(e, '/api/v1/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }) });
    const init = fetchMock.mock.calls[0][1]!;
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('does NOT override content-type for FormData bodies (lets fetch set the multipart boundary)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    const e = eventWith({ [AT_COOKIE]: 'AT1' });
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(4)], 'a.pdf', { type: 'application/pdf' }));
    await lqFetch(e, '/api/v1/files', { method: 'POST', body: fd });
    const init = fetchMock.mock.calls[0][1]!;
    // The bug we're guarding against: lqFetch must NOT explicitly set
    // application/json (which would clobber fetch's auto multipart boundary).
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });
});
