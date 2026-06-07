import { fail, redirect, type Actions } from '@sveltejs/kit';
import { login, verifyMfa } from '$lib/server/auth';
import { setSessionCookies } from '$lib/server/session';

function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
	login: async (event) => {
		const data = await event.request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');
		if (!email || !password) return fail(400, { email, error: 'Email and password are required.' });

		const result = await login(email, password);
		if (result.kind === 'invalid') return fail(401, { email, error: 'Invalid email or password.' });
		if (result.kind === 'mfa') return { mfa: true, mfaToken: result.data.mfa_token, email };

		setSessionCookies(
			event,
			result.data.access_token,
			result.data.refresh_token,
			result.data.expires_in
		);
		throw redirect(303, safeNext(event.url.searchParams.get('next')));
	},

	mfa: async (event) => {
		const data = await event.request.formData();
		const mfaToken = String(data.get('mfaToken') ?? '');
		const code = String(data.get('code') ?? '').trim();
		const result = await verifyMfa(mfaToken, code);
		if (result.kind !== 'ok')
			return fail(401, { mfa: true, mfaToken, error: 'Invalid code. Try again.' });

		setSessionCookies(
			event,
			result.data.access_token,
			result.data.refresh_token,
			result.data.expires_in
		);
		throw redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};
