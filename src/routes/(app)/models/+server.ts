import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, '/api/v1/models');
	// 503/504 are the gateway's documented unreachable/timeout signals — pass them
	// through so the client can show "model list unavailable"; map anything else to 502.
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load models.'
		);
	return json(await res.json());
};
