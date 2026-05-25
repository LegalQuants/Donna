import { redirect, type Handle } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { AT_COOKIE } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.mustChangePassword = false;

  if (event.cookies.get(AT_COOKIE)) {
    const res = await lqFetch(event, '/api/v1/users/me');
    if (res.status === 200) {
      const user = await res.json();
      event.locals.user = user;
      event.locals.mustChangePassword = !!user.must_change_password;
    } else if (res.status === 403) {
      const body = await res.json().catch(() => ({}) as any);
      const code = body?.error?.code ?? body?.detail;
      if (code === 'password_change_required') event.locals.mustChangePassword = true;
    }
  }

  const id = event.route.id ?? '';
  const isApp = id.startsWith('/(app)');
  const isAuth = id.startsWith('/(auth)');
  const path = event.url.pathname;

  // Forced first-run password rotation takes precedence.
  if (event.locals.mustChangePassword && path !== '/change-password') {
    throw redirect(303, '/change-password');
  }
  // Protect app routes.
  if (isApp && !event.locals.user) {
    throw redirect(303, `/login?next=${encodeURIComponent(path)}`);
  }
  // Authed users skip the auth screens.
  if (isAuth && event.locals.user && !event.locals.mustChangePassword) {
    throw redirect(303, '/');
  }

  return resolve(event);
};
