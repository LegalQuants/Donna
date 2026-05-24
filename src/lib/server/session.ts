import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';

export const AT_COOKIE = 'donna_at';
export const RT_COOKIE = 'donna_rt';
const REFRESH_TTL_SECONDS = 60 * 60 * 8; // mirrors lq-ai jwt_refresh_token_ttl default (8h)

function opts(maxAge: number) {
  return { httpOnly: true, secure: !dev, sameSite: 'lax' as const, path: '/', maxAge };
}

export function setSessionCookies(
  event: RequestEvent,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number
) {
  event.cookies.set(AT_COOKIE, accessToken, opts(expiresIn));
  if (refreshToken) event.cookies.set(RT_COOKIE, refreshToken, opts(REFRESH_TTL_SECONDS));
}

export function clearSessionCookies(event: RequestEvent) {
  event.cookies.delete(AT_COOKIE, { path: '/' });
  event.cookies.delete(RT_COOKIE, { path: '/' });
}
