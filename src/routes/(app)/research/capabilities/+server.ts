import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, '/api/v1/research/capabilities');
	if (!res.ok) throw error(502, 'Could not check research availability.');
	return json(await res.json());
};
