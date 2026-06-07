import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const PATCH: RequestHandler = async (event) => {
	const body = await event.request.text();
	const res = await lqFetch(event, `/api/v1/enhance-prompt/${event.params.interaction_id}`, {
		method: 'PATCH',
		body
	});
	if (!res.ok)
		throw error(res.status === 404 ? 404 : 502, 'Could not record the enhancement outcome.');
	return json(await res.json());
};
