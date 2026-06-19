import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseOAuthServers, type OAuthServerStatus } from '$lib/mcp/oauth';

export interface ConnectResult {
	server: string;
	status: 'connected' | 'error';
	code?: string;
}

function readResult(url: URL): ConnectResult | null {
	const connected = url.searchParams.get('mcp_connected');
	if (connected) return { server: connected, status: 'connected' };
	const error = url.searchParams.get('mcp_error');
	const server = url.searchParams.get('server');
	if (error && server) return { server, status: 'error', code: error };
	return null;
}

export const load: PageServerLoad = async (event) => {
	const result = readResult(event.url);
	try {
		const res = await lqFetch(event, '/api/v1/mcp/oauth');
		if (!res.ok) return { servers: [] as OAuthServerStatus[], loadError: true, result };
		return { servers: parseOAuthServers(await res.json()), loadError: false, result };
	} catch {
		return { servers: [] as OAuthServerStatus[], loadError: true, result };
	}
};

export const actions: Actions = {
	disconnect: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		if (!server) return fail(400, { message: 'Missing server.' });
		const res = await lqFetch(event, `/api/v1/mcp/oauth/${encodeURIComponent(server)}`, {
			method: 'DELETE'
		});
		if (!res.ok) return fail(res.status === 403 ? 403 : 502, { message: 'Could not disconnect.' });
		return { success: true };
	}
};
