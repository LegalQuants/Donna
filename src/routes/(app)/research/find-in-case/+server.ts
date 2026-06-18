import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, '/api/v1/research/find-in-case', { method: 'POST', body });
	if (res.status === 503) return json({ detail: 'research_not_configured' }, { status: 503 });
	if (!res.ok) throw error(res.status === 422 ? 422 : 502, 'Find-in-case failed.');
	return json(await res.json());
};
