import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { loadRunOutput } from '$lib/automations/runOutput.server';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	const [res, output] = await Promise.all([
		lqFetch(event, `/api/v1/autonomous/sessions/${event.params.id}`),
		loadRunOutput(event, event.params.id)
	]);
	if (!res.ok) {
		if (res.status === 404) throw error(404, 'Session not found.');
		throw error(
			res.status === 503 || res.status === 504 ? res.status : 502,
			'Could not load the session.'
		);
	}
	const body = (await res.json()) as Record<string, unknown>;
	return json({ ...body, ...output });
};
