import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const id = event.params.id;
	const res = await lqFetch(event, `/api/v1/skills/${encodeURIComponent(id)}/inputs`);
	// Mirror the autocomplete proxy: pass the gateway's 503/504 through, map anything else to 502.
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load skill inputs.'
		);
	return json(await res.json());
};
