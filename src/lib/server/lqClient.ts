import type { RequestEvent } from '@sveltejs/kit';
import { LQ_API } from './env';
import { AT_COOKIE, RT_COOKIE, setSessionCookies, clearSessionCookies } from './session';

async function raw(path: string, init: RequestInit, token?: string): Promise<Response> {
	const headers = new Headers(init.headers);
	if (token) headers.set('authorization', `Bearer ${token}`);
	// Default to JSON for non-empty bodies, but never override FormData — Node's
	// fetch needs to set its own multipart/form-data boundary, and an explicit
	// application/json header would clobber it (the backend then rejects the
	// multipart body with 422 "Field required: body.file"). First seen when
	// P4-3a's uploadFile action started forwarding multipart through lqFetch.
	if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	return fetch(`${LQ_API()}${path}`, { ...init, headers });
}

/** Authed fetch through the BFF: attaches Bearer, refreshes once on 401, retries. */
export async function lqFetch(
	event: RequestEvent,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	const at = event.cookies.get(AT_COOKIE);
	const res = await raw(path, init, at);
	if (res.status !== 401) return res;

	const rt = event.cookies.get(RT_COOKIE);
	if (!rt) return res;

	const refreshed = await raw('/api/v1/auth/refresh', {
		method: 'POST',
		body: JSON.stringify({ refresh_token: rt })
	});
	if (!refreshed.ok) {
		clearSessionCookies(event);
		return res;
	}
	const tok = (await refreshed.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	setSessionCookies(event, tok.access_token, tok.refresh_token, tok.expires_in);
	return raw(path, init, tok.access_token);
}

/**
 * Streaming pass-through for SSE (consumed in a later phase). Single attempt with
 * the current access token; refresh is handled by the page `load` that precedes
 * the stream request.
 */
export async function lqStream(
	event: RequestEvent,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	return raw(path, init, event.cookies.get(AT_COOKIE));
}
