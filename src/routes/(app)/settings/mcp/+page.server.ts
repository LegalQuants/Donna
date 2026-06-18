import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { parseMcpServers, type McpServer } from '$lib/mcp/mcp';

export const load: PageServerLoad = async (event) => {
	const isAdmin = !!event.locals.user?.is_admin;
	if (!isAdmin) return { isAdmin, servers: [] as McpServer[], mcpError: false };
	try {
		const res = await lqFetch(event, '/api/v1/admin/mcp');
		if (!res.ok) return { isAdmin, servers: [] as McpServer[], mcpError: true };
		return { isAdmin, servers: parseMcpServers(await res.json()), mcpError: false };
	} catch {
		return { isAdmin, servers: [] as McpServer[], mcpError: true };
	}
};

const ADMIN_ONLY = 'Managing MCP tools requires an admin account.';

export const actions: Actions = {
	toggleTool: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		const tool = String(data.get('tool') ?? '');
		const enabled = String(data.get('enabled') ?? '') === 'true';
		if (!server || !tool) return fail(400, { message: 'Missing server or tool.' });

		const res = await lqFetch(
			event,
			`/api/v1/admin/mcp/${encodeURIComponent(server)}/tools/${encodeURIComponent(tool)}`,
			{ method: 'PATCH', body: JSON.stringify({ enabled }) }
		);
		if (res.status === 403) return fail(403, { message: ADMIN_ONLY });
		if (!res.ok)
			return fail(res.status === 404 ? 404 : 502, { message: 'Could not update the tool.' });
		return { success: true };
	},

	refreshServer: async (event) => {
		const data = await event.request.formData();
		const server = String(data.get('server') ?? '');
		if (!server) return fail(400, { message: 'Missing server.' });

		const res = await lqFetch(event, `/api/v1/admin/mcp/${encodeURIComponent(server)}/refresh`, {
			method: 'POST'
		});
		if (res.status === 403) return fail(403, { message: ADMIN_ONLY });
		if (!res.ok)
			return fail(res.status === 404 ? 404 : 502, {
				server,
				message: 'Could not refresh this server.'
			});
		return { success: true };
	}
};
