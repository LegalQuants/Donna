import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/research/clusters/${event.params.id}`);
	if (res.status === 503) return json({ detail: 'research_not_configured' }, { status: 503 });
	if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load that case.');
	return json(await res.json());
};
