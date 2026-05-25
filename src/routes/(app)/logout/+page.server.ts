import { redirect, type Actions } from '@sveltejs/kit';
import { logout } from '$lib/server/auth';
import { AT_COOKIE, clearSessionCookies } from '$lib/server/session';

export const actions: Actions = {
  default: async (event) => {
    await logout(event.cookies.get(AT_COOKIE));
    clearSessionCookies(event);
    throw redirect(303, '/login');
  }
};
