import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';

const CONNECTIONS = '/settings/connections';

export const GET: RequestHandler = async (event) => {
	const server = event.params.server;
	// Optional same-origin return path (default the connections page). Reject any
	// non-relative / cross-origin value to prevent an open redirect.
	const requested = event.url.searchParams.get('return');
	const returnPath =
		requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : CONNECTIONS;
	const returnUrl = `${event.url.origin}${returnPath}`;
	const path =
		`/api/v1/mcp/oauth/${encodeURIComponent(server)}/authorize` +
		`?return_url=${encodeURIComponent(returnUrl)}`;

	let location: string | null = null;
	let code = 'authorize_failed';
	try {
		const res = await lqFetch(event, path, { redirect: 'manual' });
		if (res.status >= 300 && res.status < 400) location = res.headers.get('location');
		else if (res.status === 404) code = 'not_found';
		else if (res.status === 400) code = 'not_allowed';
	} catch {
		location = null;
	}

	if (location) throw redirect(302, location);
	throw redirect(303, `${CONNECTIONS}?mcp_error=${code}&server=${encodeURIComponent(server)}`);
};
