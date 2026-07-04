import { fail } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { parseToolProviders, type ToolProviderRow } from '$lib/research/toolProviders';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const isAdmin = !!event.locals.user?.is_admin;
	if (!isAdmin) return { isAdmin: false, sources: null as ToolProviderRow[] | null };
	const res = await lqFetch(event, '/api/v1/admin/tool-providers');
	if (!res.ok) return { isAdmin, sources: null as ToolProviderRow[] | null };
	try {
		return { isAdmin, sources: parseToolProviders(await res.json()) };
	} catch {
		return { isAdmin, sources: null as ToolProviderRow[] | null };
	}
};

async function mapError(res: { status: number; text: () => Promise<string> }, type: string) {
	if (res.status === 403)
		return fail(403, { type, message: 'Managing research sources requires an admin account.' });
	if (res.status === 404)
		return fail(404, { type, message: 'That source is not available on this deployment.' });
	if (res.status === 409)
		return fail(409, {
			type,
			message: 'This source is configured via the environment — edit gateway.yaml to change it.'
		});
	if (res.status === 400) {
		const body = await res.text().catch(() => '');
		return fail(400, {
			type,
			message: /master.?key/i.test(body)
				? 'The gateway has no master key set, so runtime key storage is disabled — ask your operator to configure LQ_AI_GATEWAY_MASTER_KEY.'
				: 'Could not update this source.'
		});
	}
	return fail(502, { type, message: 'Could not update this source.' });
}

export const actions: Actions = {
	enable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, '/api/v1/admin/tool-providers', {
			method: 'POST',
			body: JSON.stringify({ type })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	setKey: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		const apiKey = String(data.get('api_key') ?? '').trim();
		if (!type) return fail(400, { type, message: 'Missing source.' });
		if (!apiKey) return fail(400, { type, message: 'Paste a key first.' });
		const res = await lqFetch(event, '/api/v1/admin/tool-providers', {
			method: 'POST',
			body: JSON.stringify({ type, api_key: apiKey })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	reenable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, `/api/v1/admin/tool-providers/${encodeURIComponent(type)}`, {
			method: 'PATCH',
			body: JSON.stringify({ enabled: true })
		});
		if (!res.ok) return mapError(res, type);
		return { success: true, type };
	},

	disable: async (event) => {
		const data = await event.request.formData();
		const type = String(data.get('type') ?? '');
		if (!type) return fail(400, { type, message: 'Missing source.' });
		const res = await lqFetch(event, `/api/v1/admin/tool-providers/${encodeURIComponent(type)}`, {
			method: 'DELETE'
		});
		if (res.ok || res.status === 404) return { success: true, type };
		return mapError(res, type);
	}
};
