import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/playbooks/easy', { method: 'POST', body });
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not start playbook generation.');
	return json(await res.json());
};
