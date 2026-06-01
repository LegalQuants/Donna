// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));

import { handle } from './hooks.server';

const ev = (opts: { routeId: string; path: string; authed?: boolean }) =>
  ({
    locals: {} as Record<string, unknown>,
    cookies: { get: () => (opts.authed ? 'tok' : undefined) },
    route: { id: opts.routeId },
    url: new URL('http://localhost' + opts.path)
  }) as never;

const resolve = vi.fn(async () => new Response('ok'));

beforeEach(() => { lqFetch.mockReset(); resolve.mockClear(); });

const mockUser = (over: Record<string, unknown> = {}) =>
  lqFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'u1', must_change_password: false, ...over }), { status: 200 }));

describe('handle hook auth routing', () => {
  it('redirects an authed user away from /login to /', async () => {
    mockUser();
    await expect(handle({ event: ev({ routeId: '/(auth)/login', path: '/login', authed: true }), resolve })).rejects.toMatchObject({ status: 303, location: '/' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets an authed user reach /change-password voluntarily', async () => {
    mockUser();
    await handle({ event: ev({ routeId: '/(auth)/change-password', path: '/change-password', authed: true }), resolve });
    expect(resolve).toHaveBeenCalled();
  });

  it('forces password change on an app route when required', async () => {
    mockUser({ must_change_password: true });
    await expect(handle({ event: ev({ routeId: '/(app)/settings/account', path: '/settings/account', authed: true }), resolve })).rejects.toMatchObject({ status: 303, location: '/change-password' });
  });

  it('redirects an unauthenticated user away from app routes', async () => {
    await expect(handle({ event: ev({ routeId: '/(app)/settings/account', path: '/settings/account', authed: false }), resolve })).rejects.toMatchObject({ status: 303 });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets an authed user through to an app route', async () => {
    mockUser();
    await handle({ event: ev({ routeId: '/(app)/settings/account', path: '/settings/account', authed: true }), resolve });
    expect(resolve).toHaveBeenCalled();
  });
});
