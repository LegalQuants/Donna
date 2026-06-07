import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';

// No `load`: the profile comes from `data.user` (merged from the (app) layout).
export const actions: Actions = {
	disableMfa: async (event) => {
		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		const code = String(form.get('code') ?? '');
		if (!password || !code)
			return fail(400, { mfaError: 'Enter your password and a current code.' });

		const res = await lqFetch(event, '/api/v1/auth/mfa/disable', {
			method: 'POST',
			body: JSON.stringify({ password, code })
		});
		if (res.status === 204 || res.ok) return { success: true };
		if (res.status === 401) return fail(401, { mfaError: 'That password or code was incorrect.' });
		return fail(502, { mfaError: 'Could not disable two-factor. Please try again.' });
	},

	updateProfile: async (event) => {
		const form = await event.request.formData();
		const display_name = String(form.get('display_name') ?? '').trim();
		if (!display_name) return fail(400, { profileError: 'Enter a name (1–200 characters).' });

		const res = await lqFetch(event, '/api/v1/users/me', {
			method: 'PATCH',
			body: JSON.stringify({ display_name })
		});
		if (res.ok) return { profileSaved: true };
		if (res.status === 422) return fail(400, { profileError: 'Enter a name (1–200 characters).' });
		return fail(502, { profileError: 'Could not update your name. Please try again.' });
	}
};
