import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const res = await lqFetch(event, `/api/v1/playbook-executions/${event.params.id}`);
	if (!res.ok)
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load the execution.'
		);
	return json(await res.json());
};
