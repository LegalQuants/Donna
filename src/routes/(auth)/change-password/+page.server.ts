import { fail, redirect, type Actions } from '@sveltejs/kit';
import { changePassword } from '$lib/server/auth';
import { AT_COOKIE, clearSessionCookies } from '$lib/server/session';

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const current = String(data.get('current_password') ?? '');
		const next = String(data.get('new_password') ?? '');
		const confirm = String(data.get('confirm_password') ?? '');
		if (!current || !next) return fail(400, { error: 'All fields are required.' });
		if (next !== confirm) return fail(400, { error: 'New passwords do not match.' });

		const token = event.cookies.get(AT_COOKIE);
		if (!token) throw redirect(303, '/login');

		const ok = await changePassword(token, current, next);
		if (!ok)
			return fail(400, {
				error: 'Could not change password. Check your current password and policy.'
			});

		// Backend revokes all sessions on change — force a fresh login.
		clearSessionCookies(event);
		throw redirect(303, '/login?changed=1');
	}
};
